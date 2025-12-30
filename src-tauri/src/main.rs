// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::clipforge::{select_video_files, select_output_path, concat_videos, get_file_size, confirm_dialog};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            select_video_files,
            select_output_path,
            concat_videos,
            get_file_size,
            confirm_dialog
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}