use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_deep_link::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.set_title("Hermes").unwrap();
            }

            // Register deep link scheme for OAuth callback
            #[cfg(desktop)]
            app.deep_link().register("hermes")?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Hermes");
}
