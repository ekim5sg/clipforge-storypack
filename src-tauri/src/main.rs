// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

use commands::clipforge::{
    select_video_files, 
    select_output_path, 
    concat_videos, 
    get_file_size, 
    confirm_dialog,
    get_video_duration
};

use commands::storypack::{
    select_output_folder,
    generate_storypack,
    select_image_file,
    select_image_files,
    select_audio_file,
    select_audio_files,
    open_folder
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            select_video_files,
            select_output_path,
            concat_videos,
            get_file_size,
            confirm_dialog,
            get_video_duration,
            select_output_folder,
            generate_storypack,
            select_image_file,
            select_image_files,
            select_audio_file,
            select_audio_files,
			open_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}