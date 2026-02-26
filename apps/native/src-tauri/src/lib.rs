use tauri::Manager;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild;
use std::sync::Mutex;

struct ServerProcess(Mutex<Option<CommandChild>>);

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
        .invoke_handler(tauri::generate_handler![toggle_devtools])
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
