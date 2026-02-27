use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

struct ServerProcess(Mutex<Option<CommandChild>>);
const TAB_KEYS: [&str; 5] = ["coral", "amber", "sage", "sky", "lavender"];

fn notes_dir(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).to_path_buf()
}

fn hermes_dir(workspace_path: &str) -> PathBuf {
    Path::new(workspace_path).join(".hermes")
}

fn sqlite_path(workspace_path: &str) -> PathBuf {
    hermes_dir(workspace_path).join("index.sqlite")
}

fn sql_escape(value: &str) -> String {
    value.replace('\'', "''")
}

fn word_count(content: &str) -> usize {
    content.split_whitespace().filter(|word| !word.is_empty()).count()
}

fn extract_title(content: &str) -> String {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let without_heading = trimmed.trim_start_matches('#').trim();
        if without_heading.is_empty() {
            continue;
        }
        return without_heading.chars().take(120).collect();
    }
    String::new()
}

fn run_sqlite_script(path: &Path, script: &str) -> Result<(), String> {
    let output = Command::new("sqlite3")
        .arg(path)
        .arg(script)
        .output()
        .map_err(|err| format!("Failed to run sqlite3: {err}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(format!(
        "sqlite3 error while updating {}: {}",
        path.display(),
        if stderr.is_empty() { "unknown error" } else { &stderr }
    ))
}

fn sync_workspace_index(workspace_path: &str, pages: &HashMap<String, String>) -> Result<(), String> {
    let hermes = hermes_dir(workspace_path);
    fs::create_dir_all(&hermes)
        .map_err(|err| format!("Failed creating Hermes metadata directory {}: {err}", hermes.display()))?;

    let db_path = sqlite_path(workspace_path);
    let notes_root = notes_dir(workspace_path);
    let now_unix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0);

    let mut script = String::from(
        "PRAGMA journal_mode=WAL;\n\
         CREATE TABLE IF NOT EXISTS note_index (\n\
           tab_key TEXT PRIMARY KEY,\n\
           file_path TEXT NOT NULL,\n\
           title TEXT NOT NULL,\n\
           body TEXT NOT NULL,\n\
           word_count INTEGER NOT NULL,\n\
           char_count INTEGER NOT NULL,\n\
           updated_unix INTEGER NOT NULL\n\
         );\n\
         CREATE INDEX IF NOT EXISTS idx_note_index_updated ON note_index(updated_unix DESC);\n\
         CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(tab_key UNINDEXED, title, body);\n\
         BEGIN IMMEDIATE;\n",
    );

    for tab in TAB_KEYS {
        let content = pages.get(tab).cloned().unwrap_or_default();
        if content.trim().is_empty() {
            script.push_str(&format!(
                "DELETE FROM note_index WHERE tab_key = '{}';\n\
                 DELETE FROM note_fts WHERE tab_key = '{}';\n",
                sql_escape(tab),
                sql_escape(tab),
            ));
            continue;
        }

        let title = extract_title(&content);
        let file_path = notes_root.join(format!("{tab}.md"));
        let escaped_tab = sql_escape(tab);
        let escaped_title = sql_escape(&title);
        let escaped_body = sql_escape(&content);
        let escaped_file_path = sql_escape(&file_path.to_string_lossy());

        script.push_str(&format!(
            "INSERT INTO note_index(tab_key, file_path, title, body, word_count, char_count, updated_unix)\n\
             VALUES ('{escaped_tab}', '{escaped_file_path}', '{escaped_title}', '{escaped_body}', {}, {}, {})\n\
             ON CONFLICT(tab_key) DO UPDATE SET\n\
               file_path=excluded.file_path,\n\
               title=excluded.title,\n\
               body=excluded.body,\n\
               word_count=excluded.word_count,\n\
               char_count=excluded.char_count,\n\
               updated_unix=excluded.updated_unix;\n\
             DELETE FROM note_fts WHERE tab_key = '{escaped_tab}';\n\
             INSERT INTO note_fts(tab_key, title, body) VALUES ('{escaped_tab}', '{escaped_title}', '{escaped_body}');\n",
            word_count(&content),
            content.chars().count(),
            now_unix,
        ));
    }

    script.push_str("COMMIT;\n");
    run_sqlite_script(&db_path, &script)
}

#[tauri::command]
fn list_workspace_projects(workspace_path: String) -> Result<Vec<String>, String> {
    let dir = Path::new(&workspace_path);
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let mut projects = Vec::new();
    let entries = fs::read_dir(dir)
        .map_err(|err| format!("Failed reading workspace directory: {err}"))?;

    for entry in entries {
        let entry = entry.map_err(|err| format!("Failed reading entry: {err}"))?;
        let path = entry.path();
        if path.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            // Skip hidden directories like .hermes
            if !name.starts_with('.') {
                projects.push(name);
            }
        }
    }

    projects.sort();
    Ok(projects)
}

#[tauri::command]
fn get_default_workspace() -> Result<String, String> {
    let home = std::env::var("HOME")
        .map_err(|_| "Could not determine home directory".to_string())?;
    let docs = Path::new(&home).join("Documents").join("Hermes");
    fs::create_dir_all(&docs)
        .map_err(|err| format!("Failed creating default workspace {}: {err}", docs.display()))?;
    Ok(docs.to_string_lossy().to_string())
}

#[tauri::command]
fn open_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|err| format!("Failed to open {path}: {err}"))?;
        return Ok(());
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = path;
        Err("Open in Finder is currently implemented for macOS only.".to_string())
    }
}

#[tauri::command]
fn pick_workspace_folder() -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("osascript")
            .arg("-e")
            .arg(r#"POSIX path of (choose folder with prompt "Select Hermes Workspace Folder")"#)
            .output()
            .map_err(|err| format!("Failed to launch folder picker: {err}"))?;

        if !output.status.success() {
            return Ok(None);
        }

        let selected = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if selected.is_empty() {
            return Ok(None);
        }
        return Ok(Some(selected.trim_end_matches('/').to_string()));
    }

    #[cfg(not(target_os = "macos"))]
    Err("Workspace folder picker is currently implemented for macOS only.".to_string())
}

#[tauri::command]
fn load_workspace_pages(workspace_path: String) -> Result<HashMap<String, String>, String> {
    let mut pages = HashMap::new();
    let dir = notes_dir(&workspace_path);

    if dir.exists() {
        for tab in TAB_KEYS {
            let file_path = dir.join(format!("{tab}.md"));
            if !file_path.exists() {
                continue;
            }

            let content = fs::read_to_string(&file_path)
                .map_err(|err| format!("Failed reading {}: {err}", file_path.display()))?;
            pages.insert(tab.to_string(), content);
        }
    }

    // Markdown files remain source of truth; index is best-effort metadata/search cache.
    if let Err(err) = sync_workspace_index(&workspace_path, &pages) {
        eprintln!("[workspace-index] {}", err);
    }

    Ok(pages)
}

#[tauri::command]
fn save_workspace_pages(workspace_path: String, pages: HashMap<String, String>) -> Result<(), String> {
    let dir = notes_dir(&workspace_path);
    fs::create_dir_all(&dir)
        .map_err(|err| format!("Failed creating workspace directory {}: {err}", dir.display()))?;

    for tab in TAB_KEYS {
        let file_path = dir.join(format!("{tab}.md"));
        let content = pages.get(tab).cloned().unwrap_or_default();

        if content.trim().is_empty() {
            if file_path.exists() {
                fs::remove_file(&file_path)
                    .map_err(|err| format!("Failed removing {}: {err}", file_path.display()))?;
            }
            continue;
        }

        fs::write(&file_path, content)
            .map_err(|err| format!("Failed writing {}: {err}", file_path.display()))?;
    }

    // Markdown files remain source of truth; index is best-effort metadata/search cache.
    if let Err(err) = sync_workspace_index(&workspace_path, &pages) {
        eprintln!("[workspace-index] {}", err);
    }

    Ok(())
}

#[tauri::command]
fn load_workspace_chat(workspace_path: String) -> Result<String, String> {
    let file_path = Path::new(&workspace_path).join("chat.json");
    if !file_path.exists() {
        return Ok("[]".to_string());
    }
    fs::read_to_string(&file_path)
        .map_err(|err| format!("Failed reading {}: {err}", file_path.display()))
}

#[tauri::command]
fn save_workspace_chat(workspace_path: String, chat_json: String) -> Result<(), String> {
    let dir = Path::new(&workspace_path);
    fs::create_dir_all(dir)
        .map_err(|err| format!("Failed creating directory {}: {err}", dir.display()))?;
    let file_path = dir.join("chat.json");
    fs::write(&file_path, chat_json)
        .map_err(|err| format!("Failed writing {}: {err}", file_path.display()))
}

#[tauri::command]
fn has_debug_tools() -> bool {
    cfg!(feature = "debug-tools")
}

#[tauri::command]
fn toggle_devtools(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(feature = "debug-tools")]
    {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
        return Ok(());
    }

    #[cfg(not(feature = "debug-tools"))]
    {
        let _ = window;
        Err("DevTools are disabled in this build. Rebuild with --features debug-tools.".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            has_debug_tools,
            toggle_devtools,
            list_workspace_projects,
            get_default_workspace,
            open_in_finder,
            pick_workspace_folder,
            load_workspace_pages,
            save_workspace_pages,
            load_workspace_chat,
            save_workspace_chat
        ])
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            #[cfg(desktop)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.set_title("Hermes").unwrap();
            }

            // Spawn the backend server sidecar
            #[cfg(desktop)]
            {
                let sidecar = app.shell()
                    .sidecar("hermes-server")
                    .expect("failed to create sidecar command");

                let (mut rx, child) = sidecar
                    .spawn()
                    .expect("failed to spawn hermes-server sidecar");

                // Store the child process so we can kill it on shutdown
                let server_state = app.state::<ServerProcess>();
                *server_state.0.lock().unwrap() = Some(child);

                // Log sidecar stdout/stderr in background
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_shell::process::CommandEvent;
                    while let Some(event) = rx.recv().await {
                        match event {
                            CommandEvent::Stdout(line) => {
                                let text = String::from_utf8_lossy(&line);
                                eprintln!("[server] {}", text);
                            }
                            CommandEvent::Stderr(line) => {
                                let text = String::from_utf8_lossy(&line);
                                eprintln!("[server] {}", text);
                            }
                            CommandEvent::Terminated(status) => {
                                eprintln!("[server] process exited with {:?}", status);
                                break;
                            }
                            _ => {}
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Kill the server when the app window closes
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<ServerProcess>();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while running Hermes");

    app.run(|app_handle, event| {
        match event {
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                let state = app_handle.state::<ServerProcess>();
                let mut guard = state.0.lock().unwrap();
                if let Some(child) = guard.take() {
                    let _ = child.kill();
                }
            }
            _ => {}
        }
    });
}
