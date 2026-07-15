#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use db::{
    CustomEvent, DayColor, DayDetail, FocusStats, JournalEntry, MonthCount, Note, NoteBrief,
    NoteFile, Task, UserStats,
};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;

struct AppState {
    conn: Mutex<Connection>,
}

fn open_connection(app: &tauri::AppHandle) -> Connection {
    let data_dir = app
        .path()
        .app_data_dir()
        .expect("could not resolve app data dir");
    std::fs::create_dir_all(&data_dir).expect("could not create app data dir");
    let db_path = data_dir.join("kafka.db");
    let conn = Connection::open(db_path).expect("failed to open database");
    db::init_db(&conn).expect("failed to initialize schema");
    conn
}

// ---- Commands ----

#[tauri::command]
fn get_month_counts(state: State<AppState>, year: i32, month: u32) -> Result<Vec<MonthCount>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_month_counts(&conn, year, month).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_day_detail(state: State<AppState>, date: String) -> Result<DayDetail, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_day_detail(&conn, &date).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_task(
    state: State<AppState>,
    title: String,
    due_date: String,
    due_time: Option<String>,
    priority: String,
) -> Result<Task, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::create_task(&conn, &title, &due_date, due_time.as_deref(), &priority)
        .map_err(|e| e.to_string())
}


#[tauri::command]
fn toggle_task(state: State<AppState>, id: i64) -> Result<UserStats, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now_completed = db::toggle_task(&conn, id).map_err(|e| e.to_string())?;
    if now_completed {
        db::award_exp(&conn, 10).map_err(|e| e.to_string())
    } else {
        db::get_user_stats(&conn).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn update_task(
    state: State<AppState>,
    id: i64,
    title: String,
    due_date: String,
    due_time: Option<String>,
    priority: String,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_task(&conn, id, &title, &due_date, due_time.as_deref(), &priority)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_task(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_task(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_note(
    state: State<AppState>,
    title: String,
    content: String,
    linked_date: Option<String>,
    tags: Option<String>,
) -> Result<Note, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::create_note(&conn, &title, &content, linked_date.as_deref(), tags.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn update_note(
    state: State<AppState>,
    id: i64,
    title: String,
    content: String,
    tags: Option<String>,
) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::update_note(&conn, id, &title, &content, tags.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_note(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_note(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_upcoming_tasks(state: State<AppState>, from_date: String, days_ahead: i64) -> Result<Vec<Task>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_upcoming_tasks(&conn, &from_date, days_ahead).map_err(|e| e.to_string())
}

#[tauri::command]
fn search_notes(state: State<AppState>, query: String) -> Result<Vec<Note>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::search_notes(&conn, &query).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_note_by_id(state: State<AppState>, id: i64) -> Result<Option<Note>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_note_by_id(&conn, id).map_err(|e| e.to_string())
}

// ---- Note links ----

#[tauri::command]
fn get_all_notes_brief(state: State<AppState>) -> Result<Vec<NoteBrief>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_all_notes_brief(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_linked_notes(state: State<AppState>, note_id: i64) -> Result<Vec<NoteBrief>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_linked_notes(&conn, note_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn link_notes(state: State<AppState>, note_id: i64, linked_note_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::link_notes(&conn, note_id, linked_note_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn unlink_notes(state: State<AppState>, note_id: i64, linked_note_id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::unlink_notes(&conn, note_id, linked_note_id).map_err(|e| e.to_string())
}

// ---- File / PDF attachments ----

#[tauri::command]
fn get_note_files(state: State<AppState>, note_id: i64) -> Result<Vec<NoteFile>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_note_files(&conn, note_id).map_err(|e| e.to_string())
}

#[tauri::command]
async fn pick_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.dialog().file().pick_file(move |path| {
        let _ = tx.send(path);
    });
    let picked = rx.recv().map_err(|e| e.to_string())?;
    Ok(picked.map(|p| p.to_string()))
}

#[tauri::command]
fn attach_file(state: State<AppState>, note_id: i64, file_path: String) -> Result<NoteFile, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::attach_file(&conn, note_id, &file_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_note_file(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::remove_note_file(&conn, id).map_err(|e| e.to_string())
}

// ---- Journal ----

#[tauri::command]
fn get_journal_entry(state: State<AppState>, date: String) -> Result<Option<JournalEntry>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_journal_entry(&conn, &date).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_journal_entry(
    state: State<AppState>,
    date: String,
    mood: Option<String>,
    content: String,
) -> Result<JournalEntry, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::save_journal_entry(&conn, &date, mood.as_deref(), &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_journal_entry(state: State<AppState>, date: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_journal_entry(&conn, &date).map_err(|e| e.to_string())
}

// ---- Custom calendar events ----

#[tauri::command]
fn add_custom_event(
    state: State<AppState>,
    date: String,
    title: String,
    color: Option<String>,
) -> Result<CustomEvent, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::add_custom_event(&conn, &date, &title, color.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_custom_events_for_date(state: State<AppState>, date: String) -> Result<Vec<CustomEvent>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_custom_events_for_date(&conn, &date).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_month_custom_events(state: State<AppState>, year: i32, month: u32) -> Result<Vec<CustomEvent>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_month_custom_events(&conn, year, month).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_custom_event(state: State<AppState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::delete_custom_event(&conn, id).map_err(|e| e.to_string())
}

// ---- Day highlight colors ----

#[tauri::command]
fn set_day_color(state: State<AppState>, date: String, color: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::set_day_color(&conn, &date, &color).map_err(|e| e.to_string())
}

#[tauri::command]
fn clear_day_color(state: State<AppState>, date: String) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::clear_day_color(&conn, &date).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_month_day_colors(state: State<AppState>, year: i32, month: u32) -> Result<Vec<DayColor>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_month_day_colors(&conn, year, month).map_err(|e| e.to_string())
}

// ---- Gamification ----

#[tauri::command]
fn get_user_stats(state: State<AppState>) -> Result<UserStats, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_user_stats(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn complete_focus_cycle(state: State<AppState>, date: String, focus_minutes: i64) -> Result<UserStats, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::complete_focus_cycle(&conn, &date, focus_minutes).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_focus_stats(state: State<AppState>, today: String) -> Result<FocusStats, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    db::get_focus_stats(&conn, &today).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_window(app: tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
}

fn main() {
    tauri::Builder::default()
        // Second launch (e.g. re-pressing Super+B) toggles the existing window
        // instead of spawning a new process/instance.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let is_visible = win.is_visible().unwrap_or(false);
                if is_visible {
                    let _ = win.hide();
                } else {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle();
            let conn = open_connection(handle);
            app.manage(AppState {
                conn: Mutex::new(conn),
            });

            // Closing the window (Esc / close button) just hides it, keeping
            // the process alive so Super+B stays instant.
            if let Some(win) = app.get_webview_window("main") {
                let win_clone = win.clone();
                win.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        let _ = win_clone.hide();
                        api.prevent_close();
                    }
                });

                // Launched at session startup with --hidden: stay out of sight
                // until the user actually presses Super+B for the first time.
                if std::env::args().any(|a| a == "--hidden") {
                    let _ = win.hide();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_month_counts,
            get_day_detail,
            create_task,
            toggle_task,
            update_task,
            delete_task,
            create_note,
            update_note,
            delete_note,
            get_upcoming_tasks,
            search_notes,
            get_note_by_id,
            get_all_notes_brief,
            get_linked_notes,
            link_notes,
            unlink_notes,
            get_note_files,
            pick_file,
            attach_file,
            remove_note_file,
            get_journal_entry,
            save_journal_entry,
            delete_journal_entry,
            add_custom_event,
            get_custom_events_for_date,
            get_month_custom_events,
            delete_custom_event,
            set_day_color,
            clear_day_color,
            get_month_day_colors,
            get_user_stats,
            complete_focus_cycle,
            get_focus_stats,
            hide_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running kafka");
}
