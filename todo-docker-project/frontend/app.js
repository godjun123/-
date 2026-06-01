const authSection = document.querySelector("#auth-section");
const todoSection = document.querySelector("#todo-section");
const adminSection = document.querySelector("#admin-section");
const authForm = document.querySelector("#auth-form");
const registrationFields = document.querySelector("#registration-fields");
const fullNameInput = document.querySelector("#full-name-input");
const emailInput = document.querySelector("#email-input");
const usernameInput = document.querySelector("#username-input");
const passwordInput = document.querySelector("#password-input");
const togglePasswordButton = document.querySelector("#toggle-password");
const passwordConfirmationField = document.querySelector("#password-confirmation-field");
const passwordConfirmationInput = document.querySelector("#password-confirmation-input");
const passwordGuide = document.querySelector("#password-guide");
const authSubmit = document.querySelector("#auth-submit");
const showLoginButton = document.querySelector("#show-login");
const showRegisterButton = document.querySelector("#show-register");
const logoutButton = document.querySelector("#logout-button");
const adminLogoutButton = document.querySelector("#admin-logout-button");
const currentUser = document.querySelector("#current-user");
const adminBadge = document.querySelector("#admin-badge");
const adminUser = document.querySelector("#admin-user");
const refreshUsersButton = document.querySelector("#refresh-users-button");
const userList = document.querySelector("#user-list");
const totalUsersStat = document.querySelector("#total-users-stat");
const adminUsersStat = document.querySelector("#admin-users-stat");
const regularUsersStat = document.querySelector("#regular-users-stat");
const totalTodosStat = document.querySelector("#total-todos-stat");
const todoForm = document.querySelector("#todo-form");
const todoInput = document.querySelector("#todo-input");
const todoDueDateInput = document.querySelector("#todo-due-date");
const todoList = document.querySelector("#todo-list");
const todoSearch = document.querySelector("#todo-search");
const todoStatusFilter = document.querySelector("#todo-status-filter");
const completionRate = document.querySelector("#completion-rate");
const completionDetail = document.querySelector("#completion-detail");
const profileForm = document.querySelector("#profile-form");
const profileName = document.querySelector("#profile-name");
const profileEmail = document.querySelector("#profile-email");
const userNoticeList = document.querySelector("#user-notice-list");
const noticeForm = document.querySelector("#notice-form");
const noticeTitle = document.querySelector("#notice-title");
const noticeContent = document.querySelector("#notice-content");
const noticeSubmitButton = document.querySelector("#notice-submit-button");
const noticeCancelButton = document.querySelector("#notice-cancel-button");
const adminNoticeList = document.querySelector("#admin-notice-list");
const activityLogList = document.querySelector("#activity-log-list");
const calendarMonth = document.querySelector("#calendar-month");
const calendarGrid = document.querySelector("#calendar-grid");
const previousMonthButton = document.querySelector("#previous-month-button");
const nextMonthButton = document.querySelector("#next-month-button");
const message = document.querySelector("#message");

let authMode = "login";
let token = localStorage.getItem("todoToken");
let username = localStorage.getItem("todoUsername");
let isAdmin = localStorage.getItem("todoIsAdmin") === "true";
let todos = [];
let calendarDate = new Date();
let editingNoticeId = null;
const holidayCache = new Map();

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function addHoliday(holidays, dateKey, name) {
  const names = holidays.get(dateKey) || [];
  if (!names.includes(name)) {
    names.push(name);
  }
  holidays.set(dateKey, names);
}

function getLunarDate(date) {
  const parts = new Intl.DateTimeFormat("en-u-ca-chinese", {
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  return {
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function addSubstituteHoliday(holidays, startDate) {
  const date = new Date(startDate);
  do {
    date.setDate(date.getDate() + 1);
  } while (date.getDay() === 0 || date.getDay() === 6 || holidays.has(toDateKey(date)));
  addHoliday(holidays, toDateKey(date), "대체공휴일");
}

function getKoreanHolidays(year) {
  if (holidayCache.has(year)) {
    return holidayCache.get(year);
  }

  const holidays = new Map();
  const fixedHolidays = [
    ["01-01", "신정", false],
    ["03-01", "삼일절", true],
    ["05-05", "어린이날", true],
    ["06-06", "현충일", false],
    ["08-15", "광복절", true],
    ["10-03", "개천절", true],
    ["10-09", "한글날", true],
    ["12-25", "성탄절", true],
  ];

  fixedHolidays.forEach(([monthDay, name, hasSubstitute]) => {
    const date = new Date(`${year}-${monthDay}T00:00:00`);
    addHoliday(holidays, toDateKey(date), name);
  });

  fixedHolidays.forEach(([monthDay, , hasSubstitute]) => {
    const date = new Date(`${year}-${monthDay}T00:00:00`);
    if (hasSubstitute && (date.getDay() === 0 || date.getDay() === 6)) {
      addSubstituteHoliday(holidays, date);
    }
  });

  let seollal;
  let chuseok;
  let buddhasBirthday;
  for (
    let date = new Date(year, 0, 1);
    date.getFullYear() === year;
    date.setDate(date.getDate() + 1)
  ) {
    const lunar = getLunarDate(date);
    const key = toDateKey(date);

    if (lunar.month === 1 && lunar.day === 1) {
      seollal = new Date(date);
    }

    if (lunar.month === 4 && lunar.day === 8) {
      buddhasBirthday = new Date(date);
      addHoliday(holidays, key, "부처님오신날");
    }

    if (lunar.month === 8 && lunar.day === 15) {
      chuseok = new Date(date);
    }
  }

  [
    [seollal, "설날"],
    [chuseok, "추석"],
  ].forEach(([centerDate, holidayName]) => {
    if (!centerDate) {
      return;
    }

    const group = [-1, 0, 1].map((offset) => {
      const date = new Date(centerDate);
      date.setDate(date.getDate() + offset);
      addHoliday(
        holidays,
        toDateKey(date),
        offset === 0 ? holidayName : `${holidayName} 연휴`,
      );
      return date;
    });

    if (group.some((date) => date.getDay() === 0)) {
      addSubstituteHoliday(holidays, group.at(-1));
    }
  });

  if (buddhasBirthday && [0, 6].includes(buddhasBirthday.getDay())) {
    addSubstituteHoliday(holidays, buddhasBirthday);
  }

  holidayCache.set(year, holidays);
  return holidays;
}

function showMessage(text = "") {
  message.textContent = text;
}

function resizeTodoInput() {
  todoInput.style.height = "auto";
  todoInput.style.height = `${Math.min(todoInput.scrollHeight, 160)}px`;
}

function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === "login";
  authSubmit.textContent = isLogin ? "Login" : "Register";
  showLoginButton.classList.toggle("active", isLogin);
  showRegisterButton.classList.toggle("active", !isLogin);
  passwordInput.autocomplete = isLogin ? "current-password" : "new-password";
  passwordInput.minLength = isLogin ? 6 : 8;
  passwordInput.type = "password";
  togglePasswordButton.classList.toggle("hidden", !isLogin);
  togglePasswordButton.setAttribute("aria-label", "Show password");
  togglePasswordButton.setAttribute("aria-pressed", "false");
  registrationFields.classList.toggle("hidden", isLogin);
  passwordConfirmationField.classList.toggle("hidden", isLogin);
  passwordGuide.classList.toggle("hidden", isLogin);
  fullNameInput.required = !isLogin;
  emailInput.required = !isLogin;
  passwordConfirmationInput.required = !isLogin;
  showMessage();
}

function setAuthenticatedUser(authToken, authUsername, authIsAdmin = false) {
  token = authToken;
  username = authUsername;
  isAdmin = authIsAdmin;

  if (token && username) {
    localStorage.setItem("todoToken", token);
    localStorage.setItem("todoUsername", username);
    localStorage.setItem("todoIsAdmin", String(isAdmin));
    authSection.classList.add("hidden");
    currentUser.textContent = username;
    adminBadge.classList.toggle("hidden", !isAdmin);
    adminUser.textContent = username;

    if (isAdmin) {
      todoSection.classList.add("hidden");
      adminSection.classList.remove("hidden");
      loadAdminDashboard();
    } else {
      adminSection.classList.add("hidden");
      todoSection.classList.remove("hidden");
      loadUserDashboard();
    }
    return;
  }

  localStorage.removeItem("todoToken");
  localStorage.removeItem("todoUsername");
  localStorage.removeItem("todoIsAdmin");
  authSection.classList.remove("hidden");
  todoSection.classList.add("hidden");
  adminSection.classList.add("hidden");
  todoList.replaceChildren();
  userList.replaceChildren();
  currentUser.textContent = "";
  adminUser.textContent = "";
  adminBadge.classList.add("hidden");
}

async function apiRequest(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && token) {
    setAuthenticatedUser(null, null);
    throw new Error("Your session expired. Please log in again.");
  }

  return response;
}

function createTodoElement(todo) {
  const item = document.createElement("li");
  item.className = `todo-item status-${todo.status}`;
  item.tabIndex = 0;

  const title = document.createElement("span");
  title.className = "todo-title";
  title.textContent = todo.title;

  const details = document.createElement("div");
  details.className = "todo-details";
  details.append(title);

  if (todo.due_date) {
    const dueDate = document.createElement("small");
    dueDate.className = "due-date";
    const isOverdue = todo.status !== "completed"
      && todo.due_date < new Date().toISOString().slice(0, 10);
    dueDate.textContent = `Due: ${todo.due_date}${isOverdue ? " - Overdue" : ""}`;
    dueDate.classList.toggle("overdue", isOverdue);
    details.append(dueDate);
  }

  const controls = document.createElement("div");
  controls.className = "todo-controls";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "edit-button";
  editButton.textContent = "Edit";

  const statusSelect = document.createElement("select");
  statusSelect.setAttribute("aria-label", `Status for ${todo.title}`);
  [
    ["todo", "To do"],
    ["in_progress", "In progress"],
    ["completed", "Completed"],
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = todo.status === value;
    statusSelect.append(option);
  });
  statusSelect.addEventListener("change", async () => {
    try {
      const response = await apiRequest(`/api/todos/${todo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusSelect.value }),
      });

      if (!response.ok) {
        throw new Error("Failed to update the todo status.");
      }

      await loadTodos();
      await loadTodoStats();
    } catch (error) {
      showMessage(error.message);
    }
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "todo-delete-button";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async () => {
    try {
      const response = await apiRequest(`/api/todos/${todo.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete the todo.");
      }

      await loadTodos();
      await loadTodoStats();
    } catch (error) {
      showMessage(error.message);
    }
  });

  editButton.addEventListener("click", () => {
    const editForm = document.createElement("form");
    editForm.className = "todo-edit-form";

    const titleInput = document.createElement("textarea");
    titleInput.className = "todo-edit-title";
    titleInput.maxLength = 255;
    titleInput.rows = 2;
    titleInput.value = todo.title;
    titleInput.required = true;

    const dueDateInput = document.createElement("input");
    dueDateInput.type = "date";
    dueDateInput.value = todo.due_date || "";

    const editActions = document.createElement("div");
    editActions.className = "todo-edit-actions";

    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "save-button";
    saveButton.textContent = "Save";

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "secondary-button";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
      editForm.replaceWith(details);
      controls.classList.remove("hidden");
    });

    editForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const response = await apiRequest(`/api/todos/${todo.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: titleInput.value.trim(),
            dueDate: dueDateInput.value || null,
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Failed to update the todo.");
        }

        await loadTodos();
        await loadTodoStats();
      } catch (error) {
        showMessage(error.message);
      }
    });

    editActions.append(saveButton, cancelButton);
    editForm.append(titleInput, dueDateInput, editActions);
    details.replaceWith(editForm);
    controls.classList.add("hidden");
    titleInput.focus();
  });

  controls.append(statusSelect, editButton, deleteButton);
  item.append(details, controls);
  return item;
}

async function loadTodos() {
  try {
    const response = await apiRequest("/api/todos");
    if (!response.ok) {
      throw new Error("Failed to load the todo list.");
    }

    todos = await response.json();
    renderTodoList();
    renderCalendar();
    showMessage();
  } catch (error) {
    showMessage(error.message);
  }
}

function renderTodoList() {
  const searchTerm = todoSearch.value.trim().toLowerCase();
  const selectedStatus = todoStatusFilter.value;
  const visibleTodos = todos.filter((todo) => {
    const matchesSearch = todo.title.toLowerCase().includes(searchTerm);
    const matchesStatus = selectedStatus === "all" || todo.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  todoList.replaceChildren();
  if (visibleTodos.length === 0) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "empty";
      emptyItem.textContent = todos.length ? "No matching todos." : "No todos yet.";
      todoList.append(emptyItem);
      return;
  }

  visibleTodos.forEach((todo) => todoList.append(createTodoElement(todo)));
}

function renderCalendar() {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date().toISOString().slice(0, 10);
  const holidays = getKoreanHolidays(year);

  calendarMonth.textContent = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(calendarDate);
  calendarGrid.replaceChildren();

  for (let index = 0; index < firstDay; index += 1) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day empty-day";
    calendarGrid.append(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayCell = document.createElement("div");
    dayCell.className = "calendar-day";
    dayCell.classList.toggle("today", date === today);
    dayCell.classList.toggle("sunday", new Date(year, month, day).getDay() === 0);
    dayCell.classList.toggle("saturday", new Date(year, month, day).getDay() === 6);
    dayCell.classList.toggle("holiday", holidays.has(date));

    const dayNumber = document.createElement("strong");
    dayNumber.className = "day-number";
    dayNumber.textContent = day;
    dayCell.append(dayNumber);

    (holidays.get(date) || []).forEach((name) => {
      const holidayName = document.createElement("small");
      holidayName.className = "holiday-name";
      holidayName.textContent = name;
      dayCell.append(holidayName);
    });

    todos
      .filter((todo) => todo.due_date === date)
      .forEach((todo) => {
        const calendarTodo = document.createElement("span");
        calendarTodo.className = `calendar-todo status-${todo.status}`;
        calendarTodo.textContent = todo.title;
        calendarTodo.title = `${todo.title} - ${todo.status}`;
        dayCell.append(calendarTodo);
      });

    calendarGrid.append(dayCell);
  }
}

async function loadUsers() {
  try {
    const response = await apiRequest("/api/admin/users");
    if (!response.ok) {
      throw new Error("Failed to load the user list.");
    }

    const users = await response.json();
    userList.replaceChildren();

    users.forEach((user) => {
      const row = document.createElement("tr");
      const values = [
        user.id,
        user.username,
        user.full_name || "-",
        user.email || "-",
        user.is_admin ? "Admin" : "User",
        new Date(user.created_at).toLocaleString(),
      ];

      values.forEach((value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });

      const actionCell = document.createElement("td");
      if (user.username === username) {
        actionCell.textContent = "Current account";
      } else {
        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "danger-button";
        deleteButton.textContent = "Delete";
        deleteButton.addEventListener("click", async () => {
          if (!window.confirm(`Delete the account "${user.username}"?`)) {
            return;
          }

          try {
            const response = await apiRequest(`/api/admin/users/${user.id}`, {
              method: "DELETE",
            });

            if (!response.ok) {
              const data = await response.json();
              throw new Error(data.error || "Failed to delete the user.");
            }

            await loadAdminDashboard();
          } catch (error) {
            showMessage(error.message);
          }
        });
        actionCell.append(deleteButton);
      }

      row.append(actionCell);
      userList.append(row);
    });
    showMessage();
  } catch (error) {
    showMessage(error.message);
  }
}

async function loadAdminStats() {
  const response = await apiRequest("/api/admin/stats");
  if (!response.ok) {
    throw new Error("Failed to load administrator statistics.");
  }

  const stats = await response.json();
  totalUsersStat.textContent = stats.total_users;
  adminUsersStat.textContent = stats.admin_users;
  regularUsersStat.textContent = stats.regular_users;
  totalTodosStat.textContent = stats.total_todos;
}

async function loadTodoStats() {
  const response = await apiRequest("/api/todos/stats");
  if (!response.ok) throw new Error("Failed to load todo statistics.");
  const stats = await response.json();
  completionRate.textContent = `${stats.completion_rate}%`;
  completionDetail.textContent = `${stats.completed} of ${stats.total} todos completed`;
}

async function loadProfile() {
  const response = await apiRequest("/api/profile");
  if (!response.ok) throw new Error("Failed to load profile.");
  const profile = await response.json();
  profileName.value = profile.full_name || "";
  profileEmail.value = profile.email || "";
}

function renderNotices(container, notices, canEdit = false) {
  container.replaceChildren();
  if (!notices.length) {
    container.textContent = "No notices.";
    return;
  }
  notices.forEach((notice) => {
    const article = document.createElement("article");
    article.className = "notice-item";
    const heading = document.createElement("strong");
    heading.textContent = notice.title;
    const content = document.createElement("p");
    content.textContent = notice.content;
    const meta = document.createElement("small");
    meta.textContent = `${notice.author} · ${new Date(notice.updated_at).toLocaleString()}`;
    article.append(heading, content, meta);
    if (canEdit) {
      const actions = document.createElement("div");
      actions.className = "form-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        editingNoticeId = notice.id;
        noticeTitle.value = notice.title;
        noticeContent.value = notice.content;
        noticeSubmitButton.textContent = "Save Notice";
        noticeCancelButton.classList.remove("hidden");
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger-button";
      remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Delete notice "${notice.title}"?`)) return;
        await apiRequest(`/api/admin/notices/${notice.id}`, { method: "DELETE" });
        await loadAdminDashboard();
      });
      actions.append(edit, remove);
      article.append(actions);
    }
    container.append(article);
  });
}

async function loadNotices(container, canEdit = false) {
  const response = await apiRequest("/api/notices");
  if (!response.ok) throw new Error("Failed to load notices.");
  renderNotices(container, await response.json(), canEdit);
}

async function loadActivityLogs() {
  const response = await apiRequest("/api/admin/activity-logs");
  if (!response.ok) throw new Error("Failed to load activity logs.");
  const logs = await response.json();
  activityLogList.replaceChildren();
  logs.forEach((log) => {
    const item = document.createElement("p");
    item.textContent = `${new Date(log.created_at).toLocaleString()} · ${log.username} · ${log.action}${log.details ? ` · ${log.details}` : ""}`;
    activityLogList.append(item);
  });
}

async function loadUserDashboard() {
  try {
    await Promise.all([loadTodos(), loadTodoStats(), loadProfile(), loadNotices(userNoticeList)]);
  } catch (error) {
    showMessage(error.message);
  }
}

async function loadAdminDashboard() {
  try {
    await Promise.all([
      loadUsers(),
      loadAdminStats(),
      loadNotices(adminNoticeList, true),
      loadActivityLogs(),
    ]);
  } catch (error) {
    showMessage(error.message);
  }
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const response = await fetch(`/api/auth/${authMode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: usernameInput.value.trim(),
        fullName: fullNameInput.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value,
        passwordConfirmation: passwordConfirmationInput.value,
      }),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Authentication failed.");
    }

    authForm.reset();
    if (authMode === "register") {
      setAuthMode("login");
      usernameInput.value = data.username;
      showMessage(data.message || "Registration completed. Please log in.");
      return;
    }

    setAuthenticatedUser(data.token, data.username, data.isAdmin);
  } catch (error) {
    showMessage(error.message);
  }
});

todoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = todoInput.value.trim();
  const dueDate = todoDueDateInput.value || null;

  if (!title) {
    showMessage("Enter a todo.");
    return;
  }

  try {
    const response = await apiRequest("/api/todos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, dueDate }),
    });

    if (!response.ok) {
      throw new Error("Failed to add the todo.");
    }

    todoInput.value = "";
    resizeTodoInput();
    todoDueDateInput.value = "";
    await loadTodos();
    await loadTodoStats();
  } catch (error) {
    showMessage(error.message);
  }
});
todoInput.addEventListener("input", resizeTodoInput);
todoSearch.addEventListener("input", renderTodoList);
todoStatusFilter.addEventListener("change", renderTodoList);

profileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const response = await apiRequest("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName: profileName.value, email: profileEmail.value }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to update profile.");
    showMessage("Profile updated.");
  } catch (error) {
    showMessage(error.message);
  }
});

noticeForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = editingNoticeId ? `/api/admin/notices/${editingNoticeId}` : "/api/admin/notices";
  const method = editingNoticeId ? "PATCH" : "POST";
  const response = await apiRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: noticeTitle.value, content: noticeContent.value }),
  });
  if (!response.ok) {
    const data = await response.json();
    showMessage(data.error || "Failed to save notice.");
    return;
  }
  editingNoticeId = null;
  noticeForm.reset();
  noticeSubmitButton.textContent = "Create Notice";
  noticeCancelButton.classList.add("hidden");
  await loadAdminDashboard();
});
noticeCancelButton.addEventListener("click", () => {
  editingNoticeId = null;
  noticeForm.reset();
  noticeSubmitButton.textContent = "Create Notice";
  noticeCancelButton.classList.add("hidden");
});

showLoginButton.addEventListener("click", () => setAuthMode("login"));
showRegisterButton.addEventListener("click", () => setAuthMode("register"));
togglePasswordButton.addEventListener("click", () => {
  const shouldShowPassword = passwordInput.type === "password";
  passwordInput.type = shouldShowPassword ? "text" : "password";
  togglePasswordButton.setAttribute("aria-pressed", String(shouldShowPassword));
  togglePasswordButton.setAttribute(
    "aria-label",
    shouldShowPassword ? "Hide password" : "Show password",
  );
});
logoutButton.addEventListener("click", () => {
  setAuthenticatedUser(null, null);
  showMessage("Logged out.");
});
adminLogoutButton.addEventListener("click", () => {
  setAuthenticatedUser(null, null);
  showMessage("Logged out.");
});
refreshUsersButton.addEventListener("click", loadAdminDashboard);
previousMonthButton.addEventListener("click", () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
  renderCalendar();
});
nextMonthButton.addEventListener("click", () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
  renderCalendar();
});

setAuthenticatedUser(token, username, isAdmin);
