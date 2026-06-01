import calendar
import random
from datetime import date

from werkzeug.security import generate_password_hash

from app import get_db_connection

DEMO_PASSWORD = "qwer1234"
TODO_TITLES = [
    "Review lecture notes",
    "Complete programming exercise",
    "Prepare presentation slides",
    "Read assigned chapter",
    "Submit weekly report",
    "Practice database queries",
    "Organize project files",
    "Study for the quiz",
    "Check team meeting agenda",
    "Update assignment checklist",
]


def get_next_month():
    today = date.today()
    if today.month == 12:
        return today.year + 1, 1
    return today.year, today.month + 1


def seed_demo_data():
    year, month = get_next_month()
    last_day = calendar.monthrange(year, month)[1]
    password_hash = generate_password_hash(DEMO_PASSWORD)
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        for user_number in range(1, 21):
            username = f"demo_user_{user_number:02d}"
            email = f"{username}@example.com"
            cursor.execute(
                """
                INSERT INTO users (username, full_name, email, is_admin, password_hash)
                VALUES (%s, %s, %s, FALSE, %s)
                ON DUPLICATE KEY UPDATE
                    full_name = VALUES(full_name),
                    email = VALUES(email),
                    is_admin = FALSE,
                    password_hash = VALUES(password_hash)
                """,
                (username, f"Demo User {user_number:02d}", email, password_hash),
            )
            cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
            user_id = cursor.fetchone()[0]

            random.seed(user_number)
            for todo_number, title in enumerate(TODO_TITLES, start=1):
                full_title = f"{title} #{todo_number:02d}"
                due_day = random.randint(1, last_day)
                due_date = date(year, month, due_day)
                status = random.choice(["todo", "in_progress", "completed"])
                cursor.execute(
                    """
                    SELECT id
                    FROM todos
                    WHERE user_id = %s AND title = %s
                    """,
                    (user_id, full_title),
                )
                existing_todo = cursor.fetchone()

                if existing_todo:
                    cursor.execute(
                        """
                        UPDATE todos
                        SET due_date = %s, status = %s
                        WHERE id = %s
                        """,
                        (due_date, status, existing_todo[0]),
                    )
                else:
                    cursor.execute(
                        """
                        INSERT INTO todos (user_id, title, status, due_date)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (user_id, full_title, status, due_date),
                    )

        connection.commit()
    finally:
        cursor.close()
        connection.close()


if __name__ == "__main__":
    seed_demo_data()
    print("Created or updated 20 demo users with 10 todos each.")

