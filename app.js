const invoke = window.__TAURI__.core.invoke;

// ---------------------------------------------------------------
// State
// ---------------------------------------------------------------

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth() + 1; // 1-12
let selectedDate = fmtDate(today);
let monthCounts = {};
let monthCustomEvents = {};   // date -> [event, ...]
let monthDayColors = {};      // date -> color
let editingNoteId = null;
let editingNoteDate = null;
let editingNoteLinks = [];   // [{id, title}]
let editingNoteFiles = [];   // [{id, note_id, file_path, file_name}]
let currentView = "calendar"; // "calendar" | "today" | "journal" | "notes"
let journalDate = fmtDate(today);
let notesScope = "0"; // "-1" | "0" | "1" | "2" | "all"

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const HIGHLIGHT_COLORS = [
  { name: "amber", hex: "#c9a66b" },
  { name: "rose", hex: "#b8654f" },
  { name: "sage", hex: "#7c9473" },
  { name: "sky", hex: "#7aa2f7" },
  { name: "violet", hex: "#a889d6" },
  { name: "graphite", hex: "#8a8d94" },
];

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTimeNow() {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

function isToday(s) { return s === fmtDate(today); }
function isPast(s) { return s < fmtDate(today); }

// Nepal's weekly government holidays: both Saturday and Sunday.
function isWeekend(dateObj) { return dateObj.getDay() === 0 || dateObj.getDay() === 6; }

function niceDayLabel(s) {
  const d = parseDate(s);
  const weekday = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  return `${weekday}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
}

function shortDayLabel(s) {
  const d = parseDate(s);
  return `${MONTH_NAMES[d.getMonth()].slice(0,3)} ${d.getDate()}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function hexToRgbList(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

function holidayFor(dateStr) {
  return typeof NEPAL_HOLIDAYS_BY_DATE !== "undefined" ? NEPAL_HOLIDAYS_BY_DATE[dateStr] : null;
}

// ---------------------------------------------------------------
// Theme engine
// ---------------------------------------------------------------

const THEME_KEY = "kafka-theme";
const mediaDark = window.matchMedia("(prefers-color-scheme: dark)");

function resolveSystemTheme() {
  return mediaDark.matches ? "kafka-dark" : "minimal-light";
}

function applyTheme(choice) {
  const resolved = choice === "system" ? resolveSystemTheme() : choice;
  document.documentElement.setAttribute("data-theme", resolved);
  document.querySelectorAll(".theme-option").forEach(el => {
    el.classList.toggle("active", el.dataset.theme === choice);
  });
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "kafka-dark";
  applyTheme(saved);
  document.querySelectorAll(".theme-option").forEach(el => {
    el.addEventListener("click", () => {
      localStorage.setItem(THEME_KEY, el.dataset.theme);
      applyTheme(el.dataset.theme);
    });
  });
  mediaDark.addEventListener("change", () => {
    if (localStorage.getItem(THEME_KEY) === "system") applyTheme("system");
  });
}

const settingsBtn = document.getElementById("settingsBtn");
const settingsPanel = document.getElementById("settingsPanel");
settingsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  settingsPanel.classList.toggle("hidden");
});
document.addEventListener("click", (e) => {
  if (!settingsPanel.contains(e.target) && e.target !== settingsBtn) {
    settingsPanel.classList.add("hidden");
  }
});

// ---------------------------------------------------------------
// View switching (Calendar / Today / Journal / Notes)
// ---------------------------------------------------------------

const calendarView = document.getElementById("calendarView");
const todayView = document.getElementById("todayView");
const journalView = document.getElementById("journalView");
const notesView = document.getElementById("notesView");
const monthNav = document.getElementById("monthNav");

const VIEWS = {
  calendar: calendarView,
  today: todayView,
  journal: journalView,
  notes: notesView,
};

function switchView(view) {
  currentView = view;
  document.querySelectorAll(".view-tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  for (const [name, el] of Object.entries(VIEWS)) {
    el.classList.toggle("hidden", name !== view);
  }
  monthNav.classList.toggle("hidden", view !== "calendar");

  if (view === "today") renderTodayPage();
  else if (view === "journal") renderJournalPage();
  else if (view === "notes") renderNotesPage();
}

document.getElementById("tabCalendar").addEventListener("click", () => switchView("calendar"));
document.getElementById("tabToday").addEventListener("click", () => switchView("today"));
document.getElementById("tabJournal").addEventListener("click", () => switchView("journal"));
document.getElementById("tabNotes").addEventListener("click", () => switchView("notes"));

// ---------------------------------------------------------------
// Calendar rendering
// ---------------------------------------------------------------

async function loadMonthCounts() {
  const rows = await invoke("get_month_counts", { year: viewYear, month: viewMonth });
  monthCounts = {};
  for (const r of rows) monthCounts[r.date] = r;

  const events = await invoke("get_month_custom_events", { year: viewYear, month: viewMonth });
  monthCustomEvents = {};
  for (const ev of events) {
    (monthCustomEvents[ev.date] = monthCustomEvents[ev.date] || []).push(ev);
  }

  const colors = await invoke("get_month_day_colors", { year: viewYear, month: viewMonth });
  monthDayColors = {};
  for (const c of colors) monthDayColors[c.date] = c.color;
}

function renderWeekdayRow() {
  document.getElementById("weekdayRow").innerHTML =
    WEEKDAYS.map(w => `<div class="weekday-cell">${w}</div>`).join("");
}

async function renderCalendar() {
  document.getElementById("monthLabel").textContent = `${MONTH_NAMES[viewMonth - 1]} ${viewYear}`;
  await loadMonthCounts();

  const grid = document.getElementById("calendarGrid");
  grid.innerHTML = "";

  const firstOfMonth = new Date(viewYear, viewMonth - 1, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth - 1, 0).getDate();

  const cells = [];
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const dateObj = new Date(viewYear, viewMonth - 2, d);
    cells.push({ date: fmtDate(dateObj), day: d, otherMonth: true, dateObj });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(viewYear, viewMonth - 1, d);
    cells.push({ date: fmtDate(dateObj), day: d, otherMonth: false, dateObj });
  }
  let trailing = 1;
  while (cells.length % 7 !== 0) {
    const dateObj = new Date(viewYear, viewMonth, trailing);
    cells.push({ date: fmtDate(dateObj), day: trailing, otherMonth: true, dateObj });
    trailing++;
  }

  for (const cell of cells) {
    const el = document.createElement("div");
    el.className = "day-cell";
    if (cell.otherMonth) el.classList.add("other-month");
    if (isToday(cell.date)) el.classList.add("is-today");
    if (cell.date === selectedDate) el.classList.add("is-selected");
    if (isWeekend(cell.dateObj)) el.classList.add("is-weekend");
    // Gracefully signal days behind us with a muted look — no harsh strikeout.
    if (isPast(cell.date) && !isToday(cell.date)) el.classList.add("is-past");

    const holiday = holidayFor(cell.date);
    if (holiday) {
      el.classList.add("has-holiday");
      el.title = holiday.name;
    }

    const customColor = monthDayColors[cell.date];
    if (customColor) {
      el.style.setProperty("--day-highlight-rgb", hexToRgbList(customColor));
      el.classList.add("has-highlight");
    }

    el.dataset.date = cell.date;

    const counts = monthCounts[cell.date];
    const customEvents = monthCustomEvents[cell.date] || [];
    const dots = [];
    if (counts && counts.task_count > 0) dots.push('<span class="day-dot task"></span>');
    if (counts && counts.note_count > 0) dots.push('<span class="day-dot note"></span>');
    if (customEvents.length > 0) dots.push('<span class="day-dot event"></span>');

    el.innerHTML = `
      <div class="day-number">${cell.day}</div>
      ${holiday ? `<div class="day-holiday-label">${escapeHtml(holiday.name)}</div>` : `<div class="day-dots">${dots.join("")}</div>`}
    `;
    el.addEventListener("click", () => selectDate(cell.date));
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      openColorPopover(cell.date, e.clientX, e.clientY);
    });
    grid.appendChild(el);
  }
}

function selectDate(date) {
  selectedDate = date;
  document.querySelectorAll(".day-cell").forEach(el => {
    el.classList.toggle("is-selected", el.dataset.date === date);
  });
  renderDocket();
}

// ---------------------------------------------------------------
// Day-highlight color popover (right-click a calendar day)
// ---------------------------------------------------------------

const colorPopover = document.getElementById("colorPopover");
const colorSwatchRow = document.getElementById("colorSwatchRow");
const colorClearBtn = document.getElementById("colorClearBtn");
let colorPopoverDate = null;

function buildSwatchRow(container, onPick) {
  container.innerHTML = "";
  for (const c of HIGHLIGHT_COLORS) {
    const btn = document.createElement("button");
    btn.className = "color-swatch";
    btn.style.background = c.hex;
    btn.title = c.name;
    btn.addEventListener("click", () => onPick(c.hex));
    container.appendChild(btn);
  }
}

function openColorPopover(date, x, y) {
  colorPopoverDate = date;
  colorPopover.style.left = `${x}px`;
  colorPopover.style.top = `${y}px`;
  colorPopover.classList.remove("hidden");
}

buildSwatchRow(colorSwatchRow, async (hex) => {
  if (!colorPopoverDate) return;
  await invoke("set_day_color", { date: colorPopoverDate, color: hex });
  colorPopover.classList.add("hidden");
  await renderCalendar();
});

colorClearBtn.addEventListener("click", async () => {
  if (!colorPopoverDate) return;
  await invoke("clear_day_color", { date: colorPopoverDate });
  colorPopover.classList.add("hidden");
  await renderCalendar();
});

document.addEventListener("click", (e) => {
  if (!colorPopover.contains(e.target)) colorPopover.classList.add("hidden");
});

// ---------------------------------------------------------------
// Custom date/event modal ("+" button next to month nav)
// ---------------------------------------------------------------

const customEventOverlay = document.getElementById("customEventOverlay");
const customEventDate = document.getElementById("customEventDate");
const customEventTitle = document.getElementById("customEventTitle");
const customEventColorRow = document.getElementById("customEventColorRow");
let customEventColor = HIGHLIGHT_COLORS[0].hex;

buildSwatchRow(customEventColorRow, (hex) => { customEventColor = hex; });

document.getElementById("addDateBtn").addEventListener("click", () => {
  customEventDate.value = selectedDate;
  customEventTitle.value = "";
  customEventOverlay.classList.remove("hidden");
  customEventTitle.focus();
});

document.getElementById("customEventCancel").addEventListener("click", () => {
  customEventOverlay.classList.add("hidden");
});
customEventOverlay.addEventListener("click", (e) => {
  if (e.target === customEventOverlay) customEventOverlay.classList.add("hidden");
});

document.getElementById("customEventSave").addEventListener("click", async () => {
  const date = customEventDate.value;
  const title = customEventTitle.value.trim();
  if (!date || !title) return;
  await invoke("add_custom_event", { date, title, color: customEventColor });
  customEventOverlay.classList.add("hidden");
  const d = parseDate(date);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth() + 1;
  selectedDate = date;
  await renderCalendar();
  await renderDocket();
});

// ---------------------------------------------------------------
// Day docket (calendar view side panel)
// ---------------------------------------------------------------

async function renderDocket() {
  document.getElementById("docketDate").textContent = niceDayLabel(selectedDate);

  const holidayEl = document.getElementById("docketHoliday");
  const holiday = holidayFor(selectedDate);
  if (holiday) {
    holidayEl.textContent = holiday.name;
    holidayEl.classList.remove("hidden");
  } else {
    holidayEl.classList.add("hidden");
  }

  const detail = await invoke("get_day_detail", { date: selectedDate });
  renderTasks(detail.tasks, "taskList", "taskCount");
  renderNotes(detail.notes, "noteList", "noteCount");
  await renderCustomEventsList(selectedDate, "eventList", "eventCount");
  await renderUpcoming("upcomingList");

  document.getElementById("newTaskTime").value = fmtTimeNow();
}

async function renderCustomEventsList(date, listId, countId) {
  const events = await invoke("get_custom_events_for_date", { date });
  const list = document.getElementById(listId);
  document.getElementById(countId).textContent = events.length ? `(${events.length})` : "";
  list.innerHTML = "";
  if (!events.length) {
    list.innerHTML = `<li class="upcoming-empty">No custom events for this day.</li>`;
    return;
  }
  for (const ev of events) {
    const li = document.createElement("li");
    li.className = "event-item";
    li.innerHTML = `
      <span class="event-dot" style="background:${ev.color || "var(--accent)"}"></span>
      <span class="event-title">${escapeHtml(ev.title)}</span>
      <button class="task-del" title="Remove">×</button>
    `;
    li.querySelector(".task-del").addEventListener("click", async () => {
      await invoke("delete_custom_event", { id: ev.id });
      await renderCustomEventsList(date, listId, countId);
      await renderCalendar();
    });
    list.appendChild(li);
  }
}

function renderTasks(tasks, listId, countId) {
  const list = document.getElementById(listId);
  document.getElementById(countId).textContent = tasks.length ? `(${tasks.length})` : "";
  list.innerHTML = "";

  const sorted = [...tasks].sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1));

  for (const t of sorted) {
    const li = document.createElement("li");
    li.className = "task-item" + (t.completed ? " completed" : "");
    li.innerHTML = `
      <div class="task-check ${t.completed ? "checked" : ""}" data-id="${t.id}"></div>
      <span class="task-title">${escapeHtml(t.title)}</span>
      ${t.due_time ? `<span class="task-time">${t.due_time}</span>` : ""}
      <button class="task-del" data-id="${t.id}" title="Delete">×</button>
    `;
    // Whole row (except the delete button) toggles the task — not just the tiny checkbox.
    li.addEventListener("click", (e) => {
      if (e.target.closest(".task-del")) return;
      toggleTask(t.id);
    });
    li.querySelector(".task-del").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTask(t.id);
    });
    list.appendChild(li);
  }
}

async function toggleTask(id) {
  const stats = await invoke("toggle_task", { id });
  applyUserStats(stats);
  await refreshCurrentView();
}

async function deleteTask(id) {
  await invoke("delete_task", { id });
  await refreshCurrentView();
}

async function refreshCurrentView() {
  if (currentView === "today") {
    await renderTodayPage();
  } else if (currentView === "notes") {
    await renderNotesPage();
  } else {
    await renderDocket();
    await renderCalendar();
  }
}

function renderNotes(notes, listId, countId, previewFirst = false) {
  const list = document.getElementById(listId);
  document.getElementById(countId).textContent = notes.length ? `(${notes.length})` : "";
  list.innerHTML = "";

  if (!notes.length) {
    list.innerHTML = `<li class="upcoming-empty">No notes yet.</li>`;
  }

  for (const n of notes) {
    const li = document.createElement("li");
    li.className = "note-item";
    const snippet = (n.content || "").replace(/\s+/g, " ").slice(0, 80);
    li.innerHTML = `
      <div class="note-item-title">${escapeHtml(n.title || "Untitled")}</div>
      <div class="note-item-snippet">${escapeHtml(snippet)}</div>
    `;
    li.addEventListener("click", () => previewFirst ? openNotePreview(n) : openNoteEditor(n));
    list.appendChild(li);
  }
}

async function renderUpcoming(listId) {
  // Strictly future days only — today's items live on the Today tab, past
  // days never clutter Upcoming.
  const tasks = await invoke("get_upcoming_tasks", { fromDate: fmtDate(today), daysAhead: 14 });
  const list = document.getElementById(listId);
  list.innerHTML = "";

  if (!tasks.length) {
    list.innerHTML = `<li class="upcoming-empty">Nothing on the horizon.</li>`;
    return;
  }

  for (const t of tasks.slice(0, 12)) {
    const li = document.createElement("li");
    li.className = "upcoming-item";
    li.innerHTML = `
      <span class="upcoming-date">${shortDayLabel(t.due_date)}</span>
      <span class="upcoming-title">${escapeHtml(t.title)}</span>
    `;
    li.addEventListener("click", () => {
      switchView("calendar");
      const d = parseDate(t.due_date);
      viewYear = d.getFullYear();
      viewMonth = d.getMonth() + 1;
      selectedDate = t.due_date;
      renderCalendar().then(() => renderDocket());
    });
    list.appendChild(li);
  }
}

// Add task — calendar view
document.getElementById("addTaskForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const titleInput = document.getElementById("newTaskTitle");
  const timeInput = document.getElementById("newTaskTime");
  const title = titleInput.value.trim();
  if (!title) return;

  await invoke("create_task", {
    title, dueDate: selectedDate, dueTime: timeInput.value || null, priority: "medium",
  });
  titleInput.value = "";
  timeInput.value = fmtTimeNow();
  await renderDocket();
  await renderCalendar();
});

document.getElementById("addNoteBtn").addEventListener("click", () => openNoteEditor(null, selectedDate));

// ---------------------------------------------------------------
// Today dashboard
// ---------------------------------------------------------------

async function renderTodayPage() {
  const todayStr = fmtDate(today);
  const weekday = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][today.getDay()];
  document.getElementById("todayWeekday").textContent = weekday;
  document.getElementById("todayDateBig").textContent = `${MONTH_NAMES[today.getMonth()]} ${today.getDate()}`;

  const holidayEl = document.getElementById("todayHolidayBadge");
  const holiday = holidayFor(todayStr);
  if (holiday) {
    holidayEl.textContent = holiday.name;
    holidayEl.classList.remove("hidden");
  } else {
    holidayEl.classList.add("hidden");
  }

  const detail = await invoke("get_day_detail", { date: todayStr });
  renderTasks(detail.tasks, "todayTaskList", "todayTaskCount");
  renderNotes(detail.notes, "todayNoteList", "todayNoteCount", true);
  await renderUpcoming("todayUpcomingList");

  document.getElementById("todayNewTaskTime").value = fmtTimeNow();
  await refreshUserStats();
}

document.getElementById("todayAddTaskForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const titleInput = document.getElementById("todayNewTaskTitle");
  const timeInput = document.getElementById("todayNewTaskTime");
  const title = titleInput.value.trim();
  if (!title) return;

  await invoke("create_task", {
    title, dueDate: fmtDate(today), dueTime: timeInput.value || null, priority: "medium",
  });
  titleInput.value = "";
  timeInput.value = fmtTimeNow();
  collapseTodayQuickAdd();
  await renderTodayPage();
});

document.getElementById("todayAddNoteBtn").addEventListener("click", () => openNoteEditor(null, fmtDate(today)));

// Morphing FAB: collapsed "+" until clicked, then expands into the real
// add-task row. Click outside or Escape collapses it back if left empty.
const todayQuickAdd = document.getElementById("todayQuickAdd");
const todayFabBtn = document.getElementById("todayFabBtn");
const todayQuickAddCancel = document.getElementById("todayQuickAddCancel");

function collapseTodayQuickAdd() {
  todayQuickAdd.classList.remove("expanded");
  document.getElementById("todayNewTaskTitle").value = "";
}

todayFabBtn.addEventListener("click", () => {
  todayQuickAdd.classList.add("expanded");
  document.getElementById("todayNewTaskTime").value = fmtTimeNow();
  document.getElementById("todayNewTaskTitle").focus();
});
todayQuickAddCancel.addEventListener("click", collapseTodayQuickAdd);
document.addEventListener("click", (e) => {
  if (todayQuickAdd.classList.contains("expanded") && !todayQuickAdd.contains(e.target)) {
    collapseTodayQuickAdd();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && todayQuickAdd.classList.contains("expanded")) collapseTodayQuickAdd();
});

// Live clock, elegantly displayed inside the Today tab.
function tickClock() {
  const el = document.getElementById("todayClock");
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
setInterval(tickClock, 1000);
tickClock();

// ---------------------------------------------------------------
// RPG Leveling / Cycle Streak / Adjustable Focus Timer
// ---------------------------------------------------------------

let focusMinutes = 25;
let breakMinutes = 5;
let focusPhase = "idle"; // "idle" | "focus" | "break"
let focusInterval = null;
let phaseEndsAt = null;

const focusTimeEl = document.getElementById("focusTime");
const focusLabel = document.getElementById("focusLabel");
const focusStartBtn = document.getElementById("focusStartBtn");
const focusCancelBtn = document.getElementById("focusCancelBtn");
const focusConfig = document.getElementById("focusConfig");
const focusSlider = document.getElementById("focusSlider");
const focusSliderVal = document.getElementById("focusSliderVal");
const breakSlider = document.getElementById("breakSlider");
const breakSliderVal = document.getElementById("breakSliderVal");

function formatMMSS(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function setPresetActive(row, minutes) {
  row.querySelectorAll(".preset-btn").forEach(b => b.classList.toggle("active", Number(b.dataset.min) === minutes));
}

document.getElementById("focusPresets").addEventListener("click", (e) => {
  const btn = e.target.closest(".preset-btn");
  if (!btn) return;
  focusMinutes = Number(btn.dataset.min);
  focusSlider.value = focusMinutes;
  focusSliderVal.textContent = `${focusMinutes} min`;
  setPresetActive(document.getElementById("focusPresets"), focusMinutes);
  if (focusPhase === "idle") focusTimeEl.textContent = `${String(focusMinutes).padStart(2,"0")}:00`;
});

focusSlider.addEventListener("input", () => {
  focusMinutes = Number(focusSlider.value);
  focusSliderVal.textContent = `${focusMinutes} min`;
  setPresetActive(document.getElementById("focusPresets"), focusMinutes);
  if (focusPhase === "idle") focusTimeEl.textContent = `${String(focusMinutes).padStart(2,"0")}:00`;
});

document.getElementById("breakPresets").addEventListener("click", (e) => {
  const btn = e.target.closest(".preset-btn");
  if (!btn) return;
  breakMinutes = Number(btn.dataset.min);
  breakSlider.value = breakMinutes;
  breakSliderVal.textContent = `${breakMinutes} min`;
  setPresetActive(document.getElementById("breakPresets"), breakMinutes);
});

breakSlider.addEventListener("input", () => {
  breakMinutes = Number(breakSlider.value);
  breakSliderVal.textContent = `${breakMinutes} min`;
  setPresetActive(document.getElementById("breakPresets"), breakMinutes);
});

function startPhase(phase) {
  focusPhase = phase;
  const minutes = phase === "focus" ? focusMinutes : breakMinutes;
  phaseEndsAt = Date.now() + minutes * 60 * 1000;
  focusConfig.classList.add("hidden");
  focusStartBtn.classList.add("hidden");
  focusCancelBtn.classList.remove("hidden");
  focusLabel.textContent = phase === "focus" ? "Focusing — stay with it" : "Break time — breathe";
  tickFocus();
  focusInterval = setInterval(tickFocus, 1000);
}

function tickFocus() {
  const remaining = Math.max(0, Math.round((phaseEndsAt - Date.now()) / 1000));
  focusTimeEl.textContent = formatMMSS(remaining);
  if (remaining <= 0) {
    if (focusPhase === "focus") {
      clearInterval(focusInterval);
      startPhase("break");
    } else {
      completeCycle();
    }
  }
}

async function completeCycle() {
  clearInterval(focusInterval);
  focusInterval = null;
  focusPhase = "idle";
  focusLabel.textContent = "Cycle complete — nice work.";
  focusTimeEl.textContent = `${String(focusMinutes).padStart(2,"0")}:00`;
  focusStartBtn.classList.remove("hidden");
  focusCancelBtn.classList.add("hidden");
  focusConfig.classList.remove("hidden");
  focusStartBtn.textContent = "Start Focus";
  const stats = await invoke("complete_focus_cycle", { date: fmtDate(today), focusMinutes });
  applyUserStats(stats);
}

function cancelFocusSession() {
  clearInterval(focusInterval);
  focusInterval = null;
  focusPhase = "idle";
  phaseEndsAt = null;
  focusLabel.textContent = "Cancelled — no EXP awarded, try again";
  focusTimeEl.textContent = `${String(focusMinutes).padStart(2,"0")}:00`;
  focusStartBtn.classList.remove("hidden");
  focusCancelBtn.classList.add("hidden");
  focusConfig.classList.remove("hidden");
  focusStartBtn.textContent = "Start Focus";
}

focusStartBtn.addEventListener("click", () => startPhase("focus"));
focusCancelBtn.addEventListener("click", cancelFocusSession);

function applyUserStats(stats) {
  document.getElementById("levelChipNum").textContent = `Lv${stats.level}`;
  document.getElementById("levelPanelNum").textContent = `Level ${stats.level}`;
  document.getElementById("streakNum").textContent = stats.current_streak;
  const pct = stats.exp_for_next_level > 0
    ? Math.min(100, Math.round((stats.exp_into_level / stats.exp_for_next_level) * 100))
    : 100;
  document.getElementById("expBarFill").style.width = `${pct}%`;
  document.getElementById("expBarLabel").textContent = `${stats.exp_into_level} / ${stats.exp_for_next_level} EXP`;
}

async function refreshUserStats() {
  try {
    const stats = await invoke("get_user_stats");
    applyUserStats(stats);
  } catch (_) { /* non-critical */ }
}

// ---------------------------------------------------------------
// Journal — daily emotional check-ins
// ---------------------------------------------------------------

const journalTextarea = document.getElementById("journalTextarea");
const journalMoodRow = document.getElementById("journalMoodRow");
const journalSaveHint = document.getElementById("journalSaveHint");
const journalDeleteBtn = document.getElementById("journalDeleteBtn");
let journalSelectedMood = null;
let journalEntryExists = false;

async function renderJournalPage() {
  document.getElementById("journalNavDate").textContent = niceDayLabel(journalDate);
  const entry = await invoke("get_journal_entry", { date: journalDate });
  journalEntryExists = !!entry;
  journalTextarea.value = entry ? entry.content : "";
  journalSelectedMood = entry ? entry.mood : null;
  updateMoodButtons();
  journalDeleteBtn.classList.toggle("hidden", !entry);
  journalSaveHint.textContent = entry ? `Last saved ${new Date(entry.updated_at).toLocaleString()}` : "Not yet saved";
}

function updateMoodButtons() {
  journalMoodRow.querySelectorAll(".mood-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.mood === journalSelectedMood);
  });
}

journalMoodRow.addEventListener("click", (e) => {
  const btn = e.target.closest(".mood-btn");
  if (!btn) return;
  journalSelectedMood = journalSelectedMood === btn.dataset.mood ? null : btn.dataset.mood;
  updateMoodButtons();
});

async function saveJournalEntry() {
  const content = journalTextarea.value;
  const entry = await invoke("save_journal_entry", { date: journalDate, mood: journalSelectedMood, content });
  journalEntryExists = true;
  journalDeleteBtn.classList.remove("hidden");
  journalSaveHint.textContent = `Saved just now`;
}

document.getElementById("journalSaveBtn").addEventListener("click", saveJournalEntry);

// Enter-to-save note interaction, applied to the journal too:
// Cmd/Ctrl + Enter saves from the multi-line textarea.
journalTextarea.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    saveJournalEntry();
  }
});

journalDeleteBtn.addEventListener("click", async () => {
  await invoke("delete_journal_entry", { date: journalDate });
  await renderJournalPage();
});

document.getElementById("journalPrevDay").addEventListener("click", () => {
  journalDate = addDays(journalDate, -1);
  renderJournalPage();
});
document.getElementById("journalNextDay").addEventListener("click", () => {
  journalDate = addDays(journalDate, 1);
  renderJournalPage();
});
document.getElementById("journalTodayBtn").addEventListener("click", () => {
  journalDate = fmtDate(today);
  renderJournalPage();
});

// ---------------------------------------------------------------
// Notes workspace — separate full-featured view with quick-jump sidebar
// ---------------------------------------------------------------

const notesMainHeader = document.getElementById("notesMainHeader");

async function renderNotesPage() {
  document.querySelectorAll(".notes-sidebar-item").forEach(b => {
    b.classList.toggle("active", b.dataset.offset === notesScope);
  });

  if (notesScope === "all") {
    notesMainHeader.textContent = "All Notes";
    const all = await invoke("get_all_notes_brief");
    // Fetch full note objects via search with empty-ish query is not ideal;
    // ask the backend for full detail per note is heavy, so instead pull
    // full notes via search_notes with a blank query trick: use "" (matches all).
    const notes = await invoke("search_notes", { query: "" });
    renderNotes(notes, "notesMainList", "notesMainHeaderCount");
  } else {
    const offset = Number(notesScope);
    const date = addDays(fmtDate(today), offset);
    notesMainHeader.textContent = niceDayLabel(date);
    const detail = await invoke("get_day_detail", { date });
    renderNotes(detail.notes, "notesMainList", "notesMainHeaderCount");
    notesMainHeader.dataset.date = date;
  }
}

document.querySelectorAll(".notes-sidebar-item[data-offset]").forEach(btn => {
  btn.addEventListener("click", () => {
    notesScope = btn.dataset.offset;
    renderNotesPage();
  });
});

document.getElementById("notesNewBtn").addEventListener("click", () => {
  const forDate = notesScope === "all" ? fmtDate(today) : addDays(fmtDate(today), Number(notesScope));
  openNoteEditor(null, forDate);
});

// ---------------------------------------------------------------
// Note preview slide-over — a quick peek before committing to the
// full editor. Used by Today's note list and by clicking a linked-note
// chip inside the editor (previously those chips did nothing on click).
// ---------------------------------------------------------------

const notePreviewSlideover = document.getElementById("notePreviewSlideover");
const previewTitle = document.getElementById("previewTitle");
const previewMeta = document.getElementById("previewMeta");
const previewBody = document.getElementById("previewBody");
const previewOpenBtn = document.getElementById("previewOpenBtn");
const previewCloseBtn = document.getElementById("previewCloseBtn");
const previewBackdrop = document.getElementById("previewBackdrop");
let previewingNote = null;

function openNotePreview(note) {
  previewingNote = note;
  previewTitle.textContent = note.title || "Untitled";
  previewMeta.textContent = note.linked_date ? shortDayLabel(note.linked_date) : "Undated note";
  previewBody.textContent = note.content && note.content.trim() ? note.content : "(empty note)";
  notePreviewSlideover.classList.add("open");
}

function closeNotePreview() {
  notePreviewSlideover.classList.remove("open");
  previewingNote = null;
}

previewCloseBtn.addEventListener("click", closeNotePreview);
previewBackdrop.addEventListener("click", closeNotePreview);
previewOpenBtn.addEventListener("click", () => {
  if (!previewingNote) return;
  const n = previewingNote;
  closeNotePreview();
  openNoteEditor(n);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && notePreviewSlideover.classList.contains("open")) closeNotePreview();
});

// ---------------------------------------------------------------
// Note editor: title/content, tag-free linking, file attachments
// ---------------------------------------------------------------

const overlay = document.getElementById("noteOverlay");
const noteTitleInput = document.getElementById("noteTitleInput");
const noteContentInput = document.getElementById("noteContentInput");
const noteTagsInput = document.getElementById("noteTagsInput");
const deleteNoteBtn = document.getElementById("deleteNoteBtn");
const linkedChips = document.getElementById("linkedChips");
const addLinkBtn = document.getElementById("addLinkBtn");
const linkPickerMenu = document.getElementById("linkPickerMenu");
const filesTray = document.getElementById("filesTray");
const addFileBtn = document.getElementById("addFileBtn");

async function openNoteEditor(note, forDate) {
  editingNoteId = note ? note.id : null;
  editingNoteDate = note ? note.linked_date : (forDate || null);
  noteTitleInput.value = note ? note.title : "";
  noteContentInput.value = note ? note.content : "";
  noteTagsInput.value = note ? (note.tags || "") : "";
  deleteNoteBtn.classList.toggle("hidden", !note);

  editingNoteLinks = note ? await invoke("get_linked_notes", { noteId: note.id }) : [];
  editingNoteFiles = note ? await invoke("get_note_files", { noteId: note.id }) : [];
  renderLinkedChips();
  renderFileChips();

  overlay.classList.remove("hidden");
  noteTitleInput.focus();
}

function closeNoteEditor() {
  overlay.classList.add("hidden");
  editingNoteId = null;
  editingNoteDate = null;
  editingNoteLinks = [];
  editingNoteFiles = [];
  linkPickerMenu.classList.add("hidden");
}

async function saveCurrentNote() {
  const title = noteTitleInput.value.trim() || "Untitled";
  const content = noteContentInput.value;
  const tags = noteTagsInput.value.trim() || null;

  if (editingNoteId) {
    await invoke("update_note", { id: editingNoteId, title, content, tags });
  } else {
    const created = await invoke("create_note", { title, content, linkedDate: editingNoteDate, tags });
    editingNoteId = created.id; // allow linking/attaching immediately after first save
  }
  closeNoteEditor();
  await refreshCurrentView();
}

// Bug fix: Enter used to do nothing in note fields, forcing a manual click.
// Enter on the title saves; Cmd/Ctrl+Enter in the multi-line body saves too.
noteTitleInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    saveCurrentNote();
  }
});
noteContentInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    saveCurrentNote();
  }
});

function renderLinkedChips() {
  linkedChips.querySelectorAll(".linked-chip").forEach(el => el.remove());
  for (const n of editingNoteLinks) {
    const chip = document.createElement("div");
    chip.className = "linked-chip";
    chip.innerHTML = `<span>${escapeHtml(n.title || "Untitled")}</span><button class="linked-chip-remove" title="Unlink">×</button>`;
    chip.querySelector(".linked-chip-remove").addEventListener("click", async (e) => {
      e.stopPropagation();
      if (editingNoteId) await invoke("unlink_notes", { noteId: editingNoteId, linkedNoteId: n.id });
      editingNoteLinks = editingNoteLinks.filter(l => l.id !== n.id);
      renderLinkedChips();
    });
    // Clicking the chip itself (not the × remove button) opens a preview —
    // this used to be dead space with no click behavior at all.
    chip.addEventListener("click", async (e) => {
      if (e.target.closest(".linked-chip-remove")) return;
      const full = await invoke("get_note_by_id", { id: n.id });
      if (full) openNotePreview(full);
    });
    linkedChips.insertBefore(chip, addLinkBtn.parentElement);
  }
}

addLinkBtn.addEventListener("click", async (e) => {
  e.stopPropagation();
  if (!editingNoteId) {
    alert("Save the note first, then you can link it to others.");
    return;
  }
  const all = await invoke("get_all_notes_brief");
  const linkedIds = new Set(editingNoteLinks.map(l => l.id));
  const candidates = all.filter(n => n.id !== editingNoteId && !linkedIds.has(n.id));

  linkPickerMenu.innerHTML = candidates.length
    ? candidates.map(n => `<div class="link-picker-item" data-id="${n.id}">${escapeHtml(n.title || "Untitled")}</div>`).join("")
    : `<div class="link-picker-item" style="cursor:default;">No other notes yet</div>`;

  linkPickerMenu.querySelectorAll(".link-picker-item[data-id]").forEach(item => {
    item.addEventListener("click", async () => {
      const linkedId = Number(item.dataset.id);
      await invoke("link_notes", { noteId: editingNoteId, linkedNoteId: linkedId });
      const noteInfo = candidates.find(n => n.id === linkedId);
      editingNoteLinks.push(noteInfo);
      renderLinkedChips();
      linkPickerMenu.classList.add("hidden");
    });
  });

  linkPickerMenu.classList.toggle("hidden");
});

document.addEventListener("click", (e) => {
  if (!linkPickerMenu.contains(e.target) && e.target !== addLinkBtn) {
    linkPickerMenu.classList.add("hidden");
  }
});

function renderFileChips() {
  filesTray.querySelectorAll(".file-chip").forEach(el => el.remove());
  for (const f of editingNoteFiles) {
    const chip = document.createElement("div");
    chip.className = "file-chip";
    chip.title = f.file_path;
    chip.innerHTML = `<span class="file-chip-name">📎 ${escapeHtml(f.file_name)}</span><button class="file-chip-remove" title="Remove">×</button>`;
    chip.querySelector(".file-chip-remove").addEventListener("click", async () => {
      await invoke("remove_note_file", { id: f.id });
      editingNoteFiles = editingNoteFiles.filter(x => x.id !== f.id);
      renderFileChips();
    });
    filesTray.insertBefore(chip, addFileBtn);
  }
}

addFileBtn.addEventListener("click", async () => {
  if (!editingNoteId) {
    alert("Save the note first, then you can attach files to it.");
    return;
  }
  const path = await invoke("pick_file");
  if (!path) return;
  const file = await invoke("attach_file", { noteId: editingNoteId, filePath: path });
  editingNoteFiles.push(file);
  renderFileChips();
});

// Visual drag-over affordance for the "drop a file here" hint.
["dragover", "dragleave", "drop"].forEach(evt => {
  filesTray.addEventListener(evt, (e) => {
    e.preventDefault();
    filesTray.classList.toggle("drag-active", evt === "dragover");
  });
});

overlay.addEventListener("click", (e) => { if (e.target === overlay) closeNoteEditor(); });
document.getElementById("closeNoteBtn").addEventListener("click", closeNoteEditor);
document.getElementById("saveNoteBtn").addEventListener("click", saveCurrentNote);

deleteNoteBtn.addEventListener("click", async () => {
  if (!editingNoteId) return;
  await invoke("delete_note", { id: editingNoteId });
  closeNoteEditor();
  await refreshCurrentView();
});

// ---------------------------------------------------------------
// Search
// ---------------------------------------------------------------

const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
let searchDebounce = null;

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  const query = searchInput.value.trim();
  if (!query) { searchResults.classList.add("hidden"); return; }
  searchDebounce = setTimeout(async () => {
    const notes = await invoke("search_notes", { query });
    renderSearchResults(notes);
  }, 180);
});

document.addEventListener("click", (e) => {
  if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
    searchResults.classList.add("hidden");
  }
});

function renderSearchResults(notes) {
  searchResults.innerHTML = "";
  if (!notes.length) {
    searchResults.innerHTML = `<div class="search-empty">No notes match.</div>`;
  } else {
    for (const n of notes) {
      const div = document.createElement("div");
      div.className = "search-result-item";
      const snippet = (n.content || "").replace(/\s+/g, " ").slice(0, 70);
      div.innerHTML = `
        <div class="search-result-title">${escapeHtml(n.title || "Untitled")}</div>
        <div class="search-result-snippet">${escapeHtml(snippet)}</div>
        ${n.linked_date ? `<div class="search-result-date">${shortDayLabel(n.linked_date)}</div>` : ""}
      `;
      div.addEventListener("click", () => {
        searchResults.classList.add("hidden");
        searchInput.value = "";
        if (n.linked_date) {
          switchView("calendar");
          const d = parseDate(n.linked_date);
          viewYear = d.getFullYear();
          viewMonth = d.getMonth() + 1;
          selectedDate = n.linked_date;
          renderCalendar().then(() => renderDocket().then(() => openNoteEditor(n)));
        } else {
          openNoteEditor(n);
        }
      });
      searchResults.appendChild(div);
    }
  }
  searchResults.classList.remove("hidden");
}

// ---------------------------------------------------------------
// Month navigation
// ---------------------------------------------------------------

document.getElementById("prevMonth").addEventListener("click", () => {
  viewMonth--;
  if (viewMonth < 1) { viewMonth = 12; viewYear--; }
  renderCalendar();
});

document.getElementById("nextMonth").addEventListener("click", () => {
  viewMonth++;
  if (viewMonth > 12) { viewMonth = 1; viewYear++; }
  renderCalendar();
});

// ---------------------------------------------------------------
// Keyboard: Escape hides the window (quake-style) or closes overlay
// ---------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!overlay.classList.contains("hidden")) {
      closeNoteEditor();
    } else if (!customEventOverlay.classList.contains("hidden")) {
      customEventOverlay.classList.add("hidden");
    } else {
      invoke("hide_window");
    }
  }
});

// ---------------------------------------------------------------
// Init
// ---------------------------------------------------------------

initTheme();
renderWeekdayRow();
renderCalendar().then(() => renderDocket());
refreshUserStats();
