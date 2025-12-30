use tauri::AppHandle;

#[tauri::command]
pub async fn select_video_files(app: AppHandle) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let files = app.dialog()
        .file()
        .add_filter("Video Files", &["mp4", "mov", "avi", "mkv"])
        .set_title("Select Video Clips")
        .blocking_pick_files();
    
    match files {
        Some(file_paths) => {
            let paths: Vec<String> = file_paths
                .iter()
                .map(|p| p.to_string())
                .collect();
            Ok(paths)
        }
        None => Ok(vec![]),
    }
}

#[tauri::command]
pub async fn select_output_path(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let file = app.dialog()
        .file()
        .add_filter("MP4 Video", &["mp4"])
        .set_title("Save Concatenated Video As")
        .set_file_name("output.mp4")
        .blocking_save_file();
    
    Ok(file.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn concat_videos(clips: Vec<String>, output_path: String) -> Result<String, String> {
    use std::fs::File;
    use std::io::Write;
    use std::process::Command;
    
    println!("Concatenating {} clips to {}", clips.len(), output_path);
    
    // Create temporary concat file list
    let temp_list = std::env::temp_dir().join("clipforge_concat_list.txt");
    let mut file = File::create(&temp_list)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    
    // Write file list in FFmpeg concat format
    for clip in &clips {
        writeln!(file, "file '{}'", clip.replace("\\", "/"))
            .map_err(|e| format!("Failed to write to temp file: {}", e))?;
    }
    
    drop(file); // Close the file
    
    // Call FFmpeg
    let output = Command::new("ffmpeg")
        .args(&[
            "-f", "concat",
            "-safe", "0",
            "-i", temp_list.to_str().unwrap(),
            "-c", "copy",
            &output_path
        ])
        .output()
        .map_err(|e| format!("Failed to execute FFmpeg: {}", e))?;
    
    // Clean up temp file
    let _ = std::fs::remove_file(&temp_list);
    
    if output.status.success() {
        return Ok(format!("Successfully created: {}", output_path));
    } else {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("FFmpeg error: {}", error_msg));
    }
}

#[tauri::command]
pub async fn get_file_size(path: String) -> Result<u64, String> {
    use std::fs;
    
    fs::metadata(&path)
        .map(|m| m.len())
        .map_err(|e| format!("Failed to get file size: {}", e))
}

#[tauri::command]
pub async fn confirm_dialog(app: AppHandle, title: String, message: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let answer = app.dialog()
        .message(message)
        .title(title)
        .blocking_show();
    
    Ok(answer)
}