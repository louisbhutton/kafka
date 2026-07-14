use rusqlite::{params, Connection, OptionalExtension, Result as SqlResult};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub due_date: String,          // "YYYY-MM-DD"
    pub due_time: Option<String>,  // "HH:MM"
    pub priority: String,          // "low" | "medium" | "high"
    pub completed: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content: String,
    pub linked_date: Option<String>,
    pub tags: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DayDetail {
    pub tasks: Vec<Task>,
    pub notes: Vec<Note>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MonthCount {
    pub date: String,
    pub task_count: i64,
    pub note_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteBrief {
    pub id: i64,
    pub title: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NoteFile {
    pub id: i64,
    pub note_id: i64,
    pub file_path: String,
    pub file_name: String,
    pub added_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FocusStats {
    pub sessions_today: i64,
    pub sessions_total: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct JournalEntry {
    pub id: i64,
    pub date: String,
    pub mood: Option<String>,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CustomEvent {
    pub id: i64,
    pub date: String,
    pub title: String,
    pub color: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DayColor {
    pub date: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserStats {
    pub exp: i64,
    pub level: i64,
    pub exp_into_level: i64,
    pub exp_for_next_level: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub last_cycle_date: Option<String>,
}

pub fn init_db(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            due_date TEXT NOT NULL,
            due_time TEXT,
            priority TEXT NOT NULL DEFAULT 'medium',
            completed INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            linked_date TEXT,
            tags TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
        CREATE INDEX IF NOT EXISTS idx_notes_linked_date ON notes(linked_date);

        CREATE TABLE IF NOT EXISTS note_links (
            note_id INTEGER NOT NULL,
            linked_note_id INTEGER NOT NULL,
            PRIMARY KEY (note_id, linked_note_id)
        );
        CREATE TABLE IF NOT EXISTS note_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_name TEXT NOT NULL,
            added_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS focus_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            duration_minutes INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            mood TEXT,
            content TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS custom_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            title TEXT NOT NULL,
            color TEXT,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_custom_events_date ON custom_events(date);

        CREATE TABLE IF NOT EXISTS day_colors (
            date TEXT PRIMARY KEY,
            color TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS user_stats (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            exp INTEGER NOT NULL DEFAULT 0,
            current_streak INTEGER NOT NULL DEFAULT 0,
            longest_streak INTEGER NOT NULL DEFAULT 0,
            last_cycle_date TEXT
        );
        INSERT OR IGNORE INTO user_stats (id, exp, current_streak, longest_streak, last_cycle_date)
            VALUES (1, 0, 0, 0, NULL);
        ",
    )?;
    Ok(())
}

fn row_to_task(row: &rusqlite::Row) -> SqlResult<Task> {
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        due_date: row.get(2)?,
        due_time: row.get(3)?,
        priority: row.get(4)?,
        completed: row.get::<_, i64>(5)? != 0,
        created_at: row.get(6)?,
    })
}

fn row_to_note(row: &rusqlite::Row) -> SqlResult<Note> {
    Ok(Note {
        id: row.get(0)?,
        title: row.get(1)?,
        content: row.get(2)?,
        linked_date: row.get(3)?,
        tags: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

pub fn get_month_counts(conn: &Connection, year: i32, month: u32) -> SqlResult<Vec<MonthCount>> {
    let prefix = format!("{:04}-{:02}", year, month);
    let mut stmt = conn.prepare(
        "SELECT date, SUM(task_count), SUM(note_count) FROM (
            SELECT due_date as date, COUNT(*) as task_count, 0 as note_count
            FROM tasks WHERE due_date LIKE ?1 GROUP BY due_date
            UNION ALL
            SELECT linked_date as date, 0 as task_count, COUNT(*) as note_count
            FROM notes WHERE linked_date LIKE ?1 GROUP BY linked_date
        ) GROUP BY date",
    )?;
    let rows = stmt.query_map(params![format!("{}%", prefix)], |row| {
        Ok(MonthCount {
            date: row.get(0)?,
            task_count: row.get(1)?,
            note_count: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn get_day_detail(conn: &Connection, date: &str) -> SqlResult<DayDetail> {
    let mut task_stmt = conn.prepare(
        "SELECT id, title, due_date, due_time, priority, completed, created_at
         FROM tasks WHERE due_date = ?1 ORDER BY (due_time IS NULL), due_time, id",
    )?;
    let tasks = task_stmt
        .query_map(params![date], row_to_task)?
        .collect::<SqlResult<Vec<_>>>()?;

    let mut note_stmt = conn.prepare(
        "SELECT id, title, content, linked_date, tags, created_at, updated_at
         FROM notes WHERE linked_date = ?1 ORDER BY updated_at DESC",
    )?;
    let notes = note_stmt
        .query_map(params![date], row_to_note)?
        .collect::<SqlResult<Vec<_>>>()?;

    Ok(DayDetail { tasks, notes })
}

pub fn create_task(
    conn: &Connection,
    title: &str,
    due_date: &str,
    due_time: Option<&str>,
    priority: &str,
) -> SqlResult<Task> {
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "INSERT INTO tasks (title, due_date, due_time, priority, completed, created_at)
         VALUES (?1, ?2, ?3, ?4, 0, ?5)",
        params![title, due_date, due_time, priority, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Task {
        id,
        title: title.to_string(),
        due_date: due_date.to_string(),
        due_time: due_time.map(|s| s.to_string()),
        priority: priority.to_string(),
        completed: false,
        created_at: now,
    })
}

/// Toggles completion, and returns whether the task became completed as a
/// result (so the caller can decide whether to award EXP for it).
pub fn toggle_task(conn: &Connection, id: i64) -> SqlResult<bool> {
    conn.execute(
        "UPDATE tasks SET completed = 1 - completed WHERE id = ?1",
        params![id],
    )?;
    let completed: i64 = conn.query_row(
        "SELECT completed FROM tasks WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )?;
    Ok(completed != 0)
}

pub fn update_task(
    conn: &Connection,
    id: i64,
    title: &str,
    due_date: &str,
    due_time: Option<&str>,
    priority: &str,
) -> SqlResult<()> {
    conn.execute(
        "UPDATE tasks SET title = ?1, due_date = ?2, due_time = ?3, priority = ?4 WHERE id = ?5",
        params![title, due_date, due_time, priority, id],
    )?;
    Ok(())
}

pub fn delete_task(conn: &Connection, id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn create_note(
    conn: &Connection,
    title: &str,
    content: &str,
    linked_date: Option<&str>,
    tags: Option<&str>,
) -> SqlResult<Note> {
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "INSERT INTO notes (title, content, linked_date, tags, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        params![title, content, linked_date, tags, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Note {
        id,
        title: title.to_string(),
        content: content.to_string(),
        linked_date: linked_date.map(|s| s.to_string()),
        tags: tags.map(|s| s.to_string()),
        created_at: now.clone(),
        updated_at: now,
    })
}

pub fn update_note(
    conn: &Connection,
    id: i64,
    title: &str,
    content: &str,
    tags: Option<&str>,
) -> SqlResult<()> {
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "UPDATE notes SET title = ?1, content = ?2, tags = ?3, updated_at = ?4 WHERE id = ?5",
        params![title, content, tags, now, id],
    )?;
    Ok(())
}

pub fn delete_note(conn: &Connection, id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM notes WHERE id = ?1", params![id])?;
    Ok(())
}

/// Upcoming tasks strictly AFTER `from_date` (today is excluded — today's
/// tasks belong to the Today tab, not Upcoming), through `days_ahead` days out.
pub fn get_upcoming_tasks(conn: &Connection, from_date: &str, days_ahead: i64) -> SqlResult<Vec<Task>> {
    let start_date = chrono::NaiveDate::parse_from_str(from_date, "%Y-%m-%d")
        .unwrap()
        .checked_add_signed(chrono::Duration::days(1))
        .unwrap()
        .format("%Y-%m-%d")
        .to_string();
    let to_date = chrono::NaiveDate::parse_from_str(from_date, "%Y-%m-%d")
        .unwrap()
        .checked_add_signed(chrono::Duration::days(days_ahead))
        .unwrap()
        .format("%Y-%m-%d")
        .to_string();
    let mut stmt = conn.prepare(
        "SELECT id, title, due_date, due_time, priority, completed, created_at
         FROM tasks
         WHERE due_date >= ?1 AND due_date <= ?2 AND completed = 0
         ORDER BY due_date, (due_time IS NULL), due_time",
    )?;
    let tasks = stmt
        .query_map(params![start_date, to_date], row_to_task)?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(tasks)
}

pub fn search_notes(conn: &Connection, query: &str) -> SqlResult<Vec<Note>> {
    let pattern = format!("%{}%", query);
    let mut stmt = conn.prepare(
        "SELECT id, title, content, linked_date, tags, created_at, updated_at
         FROM notes WHERE title LIKE ?1 OR content LIKE ?1 OR tags LIKE ?1
         ORDER BY updated_at DESC LIMIT 50",
    )?;
    let notes = stmt
        .query_map(params![pattern], row_to_note)?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(notes)
}

/// Fetch one note with full content — used by the preview slide-over when
/// clicking a linked-note chip, since `NoteBrief` (id + title only) isn't
/// enough to show a preview body.
pub fn get_note_by_id(conn: &Connection, id: i64) -> SqlResult<Option<Note>> {
    conn.query_row(
        "SELECT id, title, content, linked_date, tags, created_at, updated_at
         FROM notes WHERE id = ?1",
        params![id],
        row_to_note,
    )
    .optional()
}

// ---- Note <-> Note links (Obsidian-style, no bracket syntax needed) ----

pub fn get_all_notes_brief(conn: &Connection) -> SqlResult<Vec<NoteBrief>> {
    let mut stmt = conn.prepare("SELECT id, title FROM notes ORDER BY updated_at DESC")?;
    let notes = stmt
        .query_map([], |row| {
            Ok(NoteBrief {
                id: row.get(0)?,
                title: row.get(1)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(notes)
}

pub fn get_linked_notes(conn: &Connection, note_id: i64) -> SqlResult<Vec<NoteBrief>> {
    let mut stmt = conn.prepare(
        "SELECT n.id, n.title FROM notes n
         WHERE n.id IN (
            SELECT linked_note_id FROM note_links WHERE note_id = ?1
            UNION
            SELECT note_id FROM note_links WHERE linked_note_id = ?1
         )",
    )?;
    let notes = stmt
        .query_map(params![note_id], |row| {
            Ok(NoteBrief {
                id: row.get(0)?,
                title: row.get(1)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(notes)
}

pub fn link_notes(conn: &Connection, note_id: i64, linked_note_id: i64) -> SqlResult<()> {
    conn.execute(
        "INSERT OR IGNORE INTO note_links (note_id, linked_note_id) VALUES (?1, ?2)",
        params![note_id, linked_note_id],
    )?;
    Ok(())
}

pub fn unlink_notes(conn: &Connection, note_id: i64, linked_note_id: i64) -> SqlResult<()> {
    conn.execute(
        "DELETE FROM note_links WHERE (note_id = ?1 AND linked_note_id = ?2)
            OR (note_id = ?2 AND linked_note_id = ?1)",
        params![note_id, linked_note_id],
    )?;
    Ok(())
}

// ---- File / PDF attachments ----

pub fn get_note_files(conn: &Connection, note_id: i64) -> SqlResult<Vec<NoteFile>> {
    let mut stmt = conn.prepare(
        "SELECT id, note_id, file_path, file_name, added_at FROM note_files
         WHERE note_id = ?1 ORDER BY added_at DESC",
    )?;
    let files = stmt
        .query_map(params![note_id], |row| {
            Ok(NoteFile {
                id: row.get(0)?,
                note_id: row.get(1)?,
                file_path: row.get(2)?,
                file_name: row.get(3)?,
                added_at: row.get(4)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(files)
}

pub fn attach_file(conn: &Connection, note_id: i64, file_path: &str) -> SqlResult<NoteFile> {
    let file_name = std::path::Path::new(file_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| file_path.to_string());
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "INSERT INTO note_files (note_id, file_path, file_name, added_at) VALUES (?1, ?2, ?3, ?4)",
        params![note_id, file_path, file_name, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(NoteFile {
        id,
        note_id,
        file_path: file_path.to_string(),
        file_name,
        added_at: now,
    })
}

pub fn remove_note_file(conn: &Connection, id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM note_files WHERE id = ?1", params![id])?;
    Ok(())
}

// ---- Journal ----

fn row_to_journal(row: &rusqlite::Row) -> SqlResult<JournalEntry> {
    Ok(JournalEntry {
        id: row.get(0)?,
        date: row.get(1)?,
        mood: row.get(2)?,
        content: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

pub fn get_journal_entry(conn: &Connection, date: &str) -> SqlResult<Option<JournalEntry>> {
    conn.query_row(
        "SELECT id, date, mood, content, created_at, updated_at FROM journal_entries WHERE date = ?1",
        params![date],
        row_to_journal,
    )
    .optional()
}

pub fn save_journal_entry(
    conn: &Connection,
    date: &str,
    mood: Option<&str>,
    content: &str,
) -> SqlResult<JournalEntry> {
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "INSERT INTO journal_entries (date, mood, content, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(date) DO UPDATE SET mood = excluded.mood, content = excluded.content, updated_at = excluded.updated_at",
        params![date, mood, content, now],
    )?;
    get_journal_entry(conn, date).map(|o| o.unwrap())
}

pub fn delete_journal_entry(conn: &Connection, date: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM journal_entries WHERE date = ?1", params![date])?;
    Ok(())
}

// ---- Custom calendar events ----

pub fn add_custom_event(
    conn: &Connection,
    date: &str,
    title: &str,
    color: Option<&str>,
) -> SqlResult<CustomEvent> {
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "INSERT INTO custom_events (date, title, color, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![date, title, color, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(CustomEvent {
        id,
        date: date.to_string(),
        title: title.to_string(),
        color: color.map(|s| s.to_string()),
        created_at: now,
    })
}

pub fn get_custom_events_for_date(conn: &Connection, date: &str) -> SqlResult<Vec<CustomEvent>> {
    let mut stmt = conn.prepare(
        "SELECT id, date, title, color, created_at FROM custom_events WHERE date = ?1 ORDER BY id",
    )?;
    let rows = stmt
        .query_map(params![date], |row| {
            Ok(CustomEvent {
                id: row.get(0)?,
                date: row.get(1)?,
                title: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(rows)
}

pub fn get_month_custom_events(conn: &Connection, year: i32, month: u32) -> SqlResult<Vec<CustomEvent>> {
    let prefix = format!("{:04}-{:02}%", year, month);
    let mut stmt = conn.prepare(
        "SELECT id, date, title, color, created_at FROM custom_events WHERE date LIKE ?1 ORDER BY date, id",
    )?;
    let rows = stmt
        .query_map(params![prefix], |row| {
            Ok(CustomEvent {
                id: row.get(0)?,
                date: row.get(1)?,
                title: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(rows)
}

pub fn delete_custom_event(conn: &Connection, id: i64) -> SqlResult<()> {
    conn.execute("DELETE FROM custom_events WHERE id = ?1", params![id])?;
    Ok(())
}

// ---- Day highlight colors (right-click tint) ----

pub fn set_day_color(conn: &Connection, date: &str, color: &str) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO day_colors (date, color) VALUES (?1, ?2)
         ON CONFLICT(date) DO UPDATE SET color = excluded.color",
        params![date, color],
    )?;
    Ok(())
}

pub fn clear_day_color(conn: &Connection, date: &str) -> SqlResult<()> {
    conn.execute("DELETE FROM day_colors WHERE date = ?1", params![date])?;
    Ok(())
}

pub fn get_month_day_colors(conn: &Connection, year: i32, month: u32) -> SqlResult<Vec<DayColor>> {
    let prefix = format!("{:04}-{:02}%", year, month);
    let mut stmt = conn.prepare("SELECT date, color FROM day_colors WHERE date LIKE ?1")?;
    let rows = stmt
        .query_map(params![prefix], |row| {
            Ok(DayColor {
                date: row.get(0)?,
                color: row.get(1)?,
            })
        })?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(rows)
}

// ---- Gamification: EXP / Level / Cycle Streaks ----

/// Total cumulative EXP required to *reach* `level` (level 1 requires 0).
/// Growth curve: 50 * level * (level - 1), i.e. 0, 100, 300, 600, 1000...
fn exp_required_for_level(level: i64) -> i64 {
    50 * level * (level - 1)
}

fn level_from_exp(exp: i64) -> i64 {
    let mut level = 1;
    while exp_required_for_level(level + 1) <= exp {
        level += 1;
    }
    level
}

fn build_stats(exp: i64, current_streak: i64, longest_streak: i64, last_cycle_date: Option<String>) -> UserStats {
    let level = level_from_exp(exp);
    let base = exp_required_for_level(level);
    let next = exp_required_for_level(level + 1);
    UserStats {
        exp,
        level,
        exp_into_level: exp - base,
        exp_for_next_level: next - base,
        current_streak,
        longest_streak,
        last_cycle_date,
    }
}

pub fn get_user_stats(conn: &Connection) -> SqlResult<UserStats> {
    let (exp, current_streak, longest_streak, last_cycle_date): (i64, i64, i64, Option<String>) = conn.query_row(
        "SELECT exp, current_streak, longest_streak, last_cycle_date FROM user_stats WHERE id = 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;
    Ok(build_stats(exp, current_streak, longest_streak, last_cycle_date))
}

pub fn award_exp(conn: &Connection, amount: i64) -> SqlResult<UserStats> {
    conn.execute(
        "UPDATE user_stats SET exp = MAX(0, exp + ?1) WHERE id = 1",
        params![amount],
    )?;
    get_user_stats(conn)
}

/// Logs one completed focus+break cycle, awards EXP scaled to the focus
/// duration, and updates the Cycle Streak (continues if the last cycle was
/// today or yesterday, otherwise restarts at 1).
pub fn complete_focus_cycle(
    conn: &Connection,
    date: &str,
    focus_minutes: i64,
) -> SqlResult<UserStats> {
    let now = chrono::Local::now().to_rfc3339();
    conn.execute(
        "INSERT INTO focus_sessions (date, duration_minutes, created_at) VALUES (?1, ?2, ?3)",
        params![date, focus_minutes, now],
    )?;

    let (current_streak, longest_streak, last_cycle_date): (i64, i64, Option<String>) = conn.query_row(
        "SELECT current_streak, longest_streak, last_cycle_date FROM user_stats WHERE id = 1",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;

    let today_date = chrono::NaiveDate::parse_from_str(date, "%Y-%m-%d").ok();
    let new_streak = match (&last_cycle_date, today_date) {
        (Some(last), Some(today)) => {
            if last == date {
                current_streak.max(1) // same day, cycle streak unit already counted today keeps growing
            } else if let Ok(last_date) = chrono::NaiveDate::parse_from_str(last, "%Y-%m-%d") {
                if today.signed_duration_since(last_date).num_days() == 1 {
                    current_streak + 1
                } else {
                    1
                }
            } else {
                1
            }
        }
        _ => 1,
    };
    let new_longest = longest_streak.max(new_streak);

    conn.execute(
        "UPDATE user_stats SET current_streak = ?1, longest_streak = ?2, last_cycle_date = ?3 WHERE id = 1",
        params![new_streak, new_longest, date],
    )?;

    let exp_gain = 25 + focus_minutes; // base 25 EXP + 1 EXP per focus minute
    award_exp(conn, exp_gain)
}

pub fn get_focus_stats(conn: &Connection, today: &str) -> SqlResult<FocusStats> {
    let sessions_today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM focus_sessions WHERE date = ?1",
        params![today],
        |row| row.get(0),
    )?;
    let sessions_total: i64 =
        conn.query_row("SELECT COUNT(*) FROM focus_sessions", [], |row| row.get(0))?;
    Ok(FocusStats {
        sessions_today,
        sessions_total,
    })
}
