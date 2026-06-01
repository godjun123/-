import os
import re
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
import mysql.connector
from flask import Flask, g, jsonify, request
from mysql.connector import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "development-secret-key")
TODO_STATUSES = {"todo", "in_progress", "completed"}


def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv("DB_HOST", "db"),
        port=int(os.getenv("DB_PORT", "3306")),
        database=os.getenv("DB_NAME", "todo_db"),
        user=os.getenv("DB_USER", "todo_user"),
        password=os.getenv("DB_PASSWORD", "todo_password"),
    )


def initialize_database():
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(50) NOT NULL UNIQUE,
                full_name VARCHAR(100) NULL,
                email VARCHAR(255) NULL UNIQUE,
                is_admin BOOLEAN NOT NULL DEFAULT FALSE,
                password_hash VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        for column_name, column_definition in (
            ("full_name", "VARCHAR(100) NULL"),
            ("email", "VARCHAR(255) NULL UNIQUE"),
            ("is_admin", "BOOLEAN NOT NULL DEFAULT FALSE"),
        ):
            cursor.execute(f"SHOW COLUMNS FROM users LIKE '{column_name}'")
            if cursor.fetchone() is None:
                cursor.execute(
                    f"ALTER TABLE users ADD COLUMN {column_name} {column_definition}"
                )
        cursor.execute("UPDATE users SET is_admin = TRUE WHERE username = 'admin'")
        cursor.execute("SHOW COLUMNS FROM todos LIKE 'user_id'")
        if cursor.fetchone() is None:
            cursor.execute("ALTER TABLE todos ADD COLUMN user_id INT NULL AFTER id")
        cursor.execute("SHOW COLUMNS FROM todos LIKE 'status'")
        if cursor.fetchone() is None:
            cursor.execute(
                "ALTER TABLE todos ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'todo'"
            )
        cursor.execute("SHOW COLUMNS FROM todos LIKE 'due_date'")
        if cursor.fetchone() is None:
            cursor.execute("ALTER TABLE todos ADD COLUMN due_date DATE NULL")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS notices (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(150) NOT NULL,
                content TEXT NOT NULL,
                author_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
            )
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NULL,
                action VARCHAR(80) NOT NULL,
                details VARCHAR(255) NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            )
            """
        )
        connection.commit()
    finally:
        cursor.close()
        connection.close()


def create_token(user_id, username, is_admin):
    payload = {
        "sub": str(user_id),
        "username": username,
        "isAdmin": bool(is_admin),
        "exp": datetime.now(timezone.utc) + timedelta(hours=24),
    }
    return jwt.encode(payload, app.config["SECRET_KEY"], algorithm="HS256")


def log_activity(user_id, action, details=None):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "INSERT INTO activity_logs (user_id, action, details) VALUES (%s, %s, %s)",
            (user_id, action, details),
        )
        connection.commit()
    finally:
        cursor.close()
        connection.close()


def login_required(route):
    @wraps(route)
    def wrapped_route(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Authentication is required."}), 401

        token = auth_header.removeprefix("Bearer ").strip()
        try:
            payload = jwt.decode(
                token,
                app.config["SECRET_KEY"],
                algorithms=["HS256"],
            )
            g.user_id = int(payload["sub"])
            g.username = payload["username"]
        except (jwt.InvalidTokenError, KeyError, ValueError):
            return jsonify({"error": "Invalid or expired token."}), 401

        return route(*args, **kwargs)

    return wrapped_route


def admin_required(route):
    @wraps(route)
    @login_required
    def wrapped_route(*args, **kwargs):
        connection = get_db_connection()
        cursor = connection.cursor()
        try:
            cursor.execute(
                "SELECT is_admin FROM users WHERE id = %s",
                (g.user_id,),
            )
            user = cursor.fetchone()
        finally:
            cursor.close()
            connection.close()

        if user is None or not user[0]:
            return jsonify({"error": "Administrator access is required."}), 403

        return route(*args, **kwargs)

    return wrapped_route


@app.get("/api/health")
def health_check():
    return jsonify({"status": "ok"})


@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    full_name = str(data.get("fullName", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))
    password_confirmation = str(data.get("passwordConfirmation", ""))

    if not re.fullmatch(r"[A-Za-z0-9_]{3,50}", username):
        return jsonify({
            "error": "Username must be 3 to 50 letters, numbers, or underscores."
        }), 400

    if not 2 <= len(full_name) <= 100:
        return jsonify({"error": "Full name must be 2 to 100 characters."}), 400

    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({"error": "Enter a valid email address."}), 400

    if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        return jsonify({
            "error": "Password must be at least 8 characters and include letters and numbers."
        }), 400

    if password != password_confirmation:
        return jsonify({"error": "Password confirmation does not match."}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO users (username, full_name, email, is_admin, password_hash)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (
                username,
                full_name,
                email,
                username == "admin",
                generate_password_hash(password),
            ),
        )
        connection.commit()
    except IntegrityError:
        return jsonify({"error": "Username or email is already in use."}), 409
    finally:
        cursor.close()
        connection.close()

    return jsonify({
        "message": "Registration completed. Please log in.",
        "username": username,
    }), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, username, is_admin, password_hash
            FROM users
            WHERE username = %s
            """,
            (username,),
        )
        user = cursor.fetchone()
    finally:
        cursor.close()
        connection.close()

    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"error": "Incorrect username or password."}), 401

    log_activity(user["id"], "login", "Signed in")
    return jsonify({
        "token": create_token(user["id"], user["username"], user["is_admin"]),
        "username": user["username"],
        "isAdmin": bool(user["is_admin"]),
    })


@app.get("/api/profile")
@login_required
def get_profile():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT username, full_name, email FROM users WHERE id = %s",
            (g.user_id,),
        )
        return jsonify(cursor.fetchone())
    finally:
        cursor.close()
        connection.close()


@app.patch("/api/profile")
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}
    full_name = str(data.get("fullName", "")).strip()
    email = str(data.get("email", "")).strip().lower()

    if not 2 <= len(full_name) <= 100:
        return jsonify({"error": "Full name must be 2 to 100 characters."}), 400
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        return jsonify({"error": "Enter a valid email address."}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "UPDATE users SET full_name = %s, email = %s WHERE id = %s",
            (full_name, email, g.user_id),
        )
        connection.commit()
    except IntegrityError:
        return jsonify({"error": "Email is already in use."}), 409
    finally:
        cursor.close()
        connection.close()

    log_activity(g.user_id, "profile_updated", "Updated profile")
    return jsonify({"fullName": full_name, "email": email})


@app.get("/api/notices")
@login_required
def get_notices():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT n.id, n.title, n.content, u.username AS author,
                   n.created_at, n.updated_at
            FROM notices n
            JOIN users u ON u.id = n.author_id
            ORDER BY n.updated_at DESC
            """
        )
        return jsonify(cursor.fetchall())
    finally:
        cursor.close()
        connection.close()


@app.get("/api/admin/users")
@admin_required
def get_users():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, username, full_name, email, is_admin, created_at
            FROM users
            ORDER BY id
            """
        )
        return jsonify(cursor.fetchall())
    finally:
        cursor.close()
        connection.close()


@app.get("/api/admin/stats")
@admin_required
def get_admin_stats():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT
                COUNT(*) AS total_users,
                COALESCE(SUM(is_admin = TRUE), 0) AS admin_users,
                COALESCE(SUM(is_admin = FALSE), 0) AS regular_users
            FROM users
            """
        )
        user_stats = cursor.fetchone()
        cursor.execute("SELECT COUNT(*) AS total_todos FROM todos")
        todo_stats = cursor.fetchone()
        return jsonify({**user_stats, **todo_stats})
    finally:
        cursor.close()
        connection.close()


@app.get("/api/admin/activity-logs")
@admin_required
def get_activity_logs():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT a.id, COALESCE(u.username, 'deleted user') AS username,
                   a.action, a.details, a.created_at
            FROM activity_logs a
            LEFT JOIN users u ON u.id = a.user_id
            ORDER BY a.id DESC
            LIMIT 50
            """
        )
        return jsonify(cursor.fetchall())
    finally:
        cursor.close()
        connection.close()


@app.post("/api/admin/notices")
@admin_required
def create_notice():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()
    content = str(data.get("content", "")).strip()
    if not title or not content:
        return jsonify({"error": "Notice title and content are required."}), 400
    if len(title) > 150:
        return jsonify({"error": "Notice title must be 150 characters or fewer."}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "INSERT INTO notices (title, content, author_id) VALUES (%s, %s, %s)",
            (title, content, g.user_id),
        )
        connection.commit()
        notice_id = cursor.lastrowid
    finally:
        cursor.close()
        connection.close()
    log_activity(g.user_id, "notice_created", title)
    return jsonify({"id": notice_id}), 201


@app.patch("/api/admin/notices/<int:notice_id>")
@admin_required
def update_notice(notice_id):
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()
    content = str(data.get("content", "")).strip()
    if not title or not content:
        return jsonify({"error": "Notice title and content are required."}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "UPDATE notices SET title = %s, content = %s WHERE id = %s",
            (title, content, notice_id),
        )
        connection.commit()
        updated_count = cursor.rowcount
    finally:
        cursor.close()
        connection.close()
    if updated_count == 0:
        return jsonify({"error": "Notice not found."}), 404
    log_activity(g.user_id, "notice_updated", title)
    return "", 204


@app.delete("/api/admin/notices/<int:notice_id>")
@admin_required
def delete_notice(notice_id):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("DELETE FROM notices WHERE id = %s", (notice_id,))
        connection.commit()
        deleted_count = cursor.rowcount
    finally:
        cursor.close()
        connection.close()
    if deleted_count == 0:
        return jsonify({"error": "Notice not found."}), 404
    log_activity(g.user_id, "notice_deleted", f"Notice #{notice_id}")
    return "", 204


@app.delete("/api/admin/users/<int:user_id>")
@admin_required
def delete_user(user_id):
    if user_id == g.user_id:
        return jsonify({"error": "Administrators cannot delete their own account."}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        connection.commit()
        deleted_count = cursor.rowcount
    finally:
        cursor.close()
        connection.close()

    if deleted_count == 0:
        return jsonify({"error": "User not found."}), 404

    log_activity(g.user_id, "user_deleted", f"Deleted user #{user_id}")
    return "", 204


@app.get("/api/todos")
@login_required
def get_todos():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT id, title, status, DATE_FORMAT(due_date, '%Y-%m-%d') AS due_date, created_at
            FROM todos
            WHERE user_id = %s
            ORDER BY id DESC
            """,
            (g.user_id,),
        )
        return jsonify(cursor.fetchall())
    finally:
        cursor.close()
        connection.close()


@app.get("/api/todos/stats")
@login_required
def get_todo_stats():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(status = 'completed'), 0) AS completed
            FROM todos
            WHERE user_id = %s
            """,
            (g.user_id,),
        )
        stats = cursor.fetchone()
        stats["completion_rate"] = (
            round(stats["completed"] * 100 / stats["total"])
            if stats["total"] else 0
        )
        return jsonify(stats)
    finally:
        cursor.close()
        connection.close()


@app.post("/api/todos")
@login_required
def create_todo():
    data = request.get_json(silent=True) or {}
    title = str(data.get("title", "")).strip()
    due_date = data.get("dueDate") or None

    if not title:
        return jsonify({"error": "Todo title is required."}), 400

    if len(title) > 255:
        return jsonify({"error": "Todo title must be 255 characters or fewer."}), 400

    if due_date:
        try:
            datetime.strptime(str(due_date), "%Y-%m-%d")
        except ValueError:
            return jsonify({"error": "Due date must use the YYYY-MM-DD format."}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO todos (user_id, title, status, due_date)
            VALUES (%s, %s, %s, %s)
            """,
            (g.user_id, title, "todo", due_date),
        )
        connection.commit()
        todo_id = cursor.lastrowid
    finally:
        cursor.close()
        connection.close()

    log_activity(g.user_id, "todo_created", f"Created todo #{todo_id}")
    return jsonify({
        "id": todo_id,
        "title": title,
        "status": "todo",
        "due_date": due_date,
    }), 201


@app.patch("/api/todos/<int:todo_id>")
@login_required
def update_todo(todo_id):
    data = request.get_json(silent=True) or {}
    updates = []
    values = []

    if "title" in data:
        title = str(data.get("title", "")).strip()
        if not title:
            return jsonify({"error": "Todo title is required."}), 400
        if len(title) > 255:
            return jsonify({"error": "Todo title must be 255 characters or fewer."}), 400
        updates.append("title = %s")
        values.append(title)

    if "dueDate" in data:
        due_date = data.get("dueDate") or None
        if due_date:
            try:
                datetime.strptime(str(due_date), "%Y-%m-%d")
            except ValueError:
                return jsonify({"error": "Due date must use the YYYY-MM-DD format."}), 400
        updates.append("due_date = %s")
        values.append(due_date)

    if "status" in data:
        status = str(data.get("status", "")).strip()
        if status not in TODO_STATUSES:
            return jsonify({"error": "Invalid todo status."}), 400
        updates.append("status = %s")
        values.append(status)

    if not updates:
        return jsonify({"error": "Provide a title, due date, or status to update."}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            f"UPDATE todos SET {', '.join(updates)} WHERE id = %s AND user_id = %s",
            (*values, todo_id, g.user_id),
        )
        connection.commit()
        updated_count = cursor.rowcount
    finally:
        cursor.close()
        connection.close()

    if updated_count == 0:
        return jsonify({"error": "Todo not found."}), 404

    log_activity(g.user_id, "todo_updated", f"Updated todo #{todo_id}")
    return jsonify({"id": todo_id})


@app.delete("/api/todos/<int:todo_id>")
@login_required
def delete_todo(todo_id):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "DELETE FROM todos WHERE id = %s AND user_id = %s",
            (todo_id, g.user_id),
        )
        connection.commit()
        deleted_count = cursor.rowcount
    finally:
        cursor.close()
        connection.close()

    if deleted_count == 0:
        return jsonify({"error": "Todo not found."}), 404

    log_activity(g.user_id, "todo_deleted", f"Deleted todo #{todo_id}")
    return "", 204


initialize_database()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
