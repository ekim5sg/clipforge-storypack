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
    
    // Check audio streams for all clips
    let mut audio_info: Vec<(String, bool)> = Vec::new();
    
    for clip in &clips {
        let output = Command::new("ffprobe")
            .args(&[
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_type",
                "-of", "csv=p=0",
                clip
            ])
            .output()
            .map_err(|e| format!("Failed to check audio: {}", e))?;
        
        let has_audio = !output.stdout.is_empty();
        let filename = std::path::Path::new(clip)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(clip);
        audio_info.push((filename.to_string(), has_audio));
    }
    
    // Check if there's a problematic mix (no-audio before audio)
    let has_audio_count = audio_info.iter().filter(|(_, has)| *has).count();
    let no_audio_count = audio_info.len() - has_audio_count;
    
    if has_audio_count > 0 && no_audio_count > 0 {
        // There's a mix - check if they're in the correct order
        // Find the last file WITH audio and first file WITHOUT audio
        let last_with_audio_idx = audio_info.iter()
            .rposition(|(_, has)| *has);
        let first_without_audio_idx = audio_info.iter()
            .position(|(_, has)| !*has);
        
        if let (Some(last_with), Some(first_without)) = (last_with_audio_idx, first_without_audio_idx) {
            if first_without < last_with {
                // Problem: no-audio file appears before an audio file
                let mut error_msg = String::from("⚠️ Audio stream mismatch detected!\n\n");
                error_msg.push_str("Some clips have audio and some don't:\n\n");
                
                error_msg.push_str("WITH audio:\n");
                for (name, has_audio) in &audio_info {
                    if *has_audio {
                        error_msg.push_str(&format!("  ✓ {}\n", name));
                    }
                }
                
                error_msg.push_str("\nWITHOUT audio:\n");
                for (name, has_audio) in &audio_info {
                    if !*has_audio {
                        error_msg.push_str(&format!("  ✗ {}\n", name));
                    }
                }
                
                error_msg.push_str("\n💡 Solution: Place ALL clips WITH audio first, then clips without audio.\n");
                error_msg.push_str("Use the ▲▼ buttons to reorder.");
                
                return Err(error_msg);
            }
        }
        
        println!("Mixed audio streams, but correctly ordered - proceeding");
    }
    
    // All compatible or correctly ordered - proceed with fast concat
    let temp_list = std::env::temp_dir().join("clipforge_concat_list.txt");
    let mut file = File::create(&temp_list)
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    
    for clip in &clips {
        writeln!(file, "file '{}'", clip.replace("\\", "/"))
            .map_err(|e| format!("Failed to write to temp file: {}", e))?;
    }
    
    drop(file);
    
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

#[tauri::command]
pub async fn get_video_duration(path: String) -> Result<f64, String> {
    use std::process::Command;
    
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            &path
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;
    
    if output.status.success() {
        let duration_str = String::from_utf8_lossy(&output.stdout);
        let duration: f64 = duration_str.trim()
            .parse()
            .map_err(|e| format!("Failed to parse duration: {}", e))?;
        Ok(duration)
    } else {
        Err("Failed to get video duration".to_string())
    }
}