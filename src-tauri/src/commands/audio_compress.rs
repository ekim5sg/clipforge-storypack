use std::path::Path;
use std::process::Command;

pub fn compress_for_transcription(input_path: &str) -> Result<String, String> {
    // Create temp output path
    let input = Path::new(input_path);
    let parent = input.parent().unwrap_or(Path::new("."));
    let output_path = parent.join(format!(
        "{}_compressed.mp3",
        input.file_stem().unwrap_or_default().to_string_lossy()
    ));
    
    println!("Compressing audio for transcription: {} -> {:?}", input_path, output_path);
    
    // Compress to 16kHz mono 32kbps (perfect for speech recognition)
    let status = Command::new("ffmpeg")
        .args([
            "-i", input_path,
            "-ar", "16000",      // 16kHz sample rate
            "-ac", "1",          // Mono
            "-b:a", "32k",       // 32kbps bitrate
            "-y",                // Overwrite
            output_path.to_str().unwrap()
        ])
        .status()
        .map_err(|e| format!("Failed to run FFmpeg: {}", e))?;
    
    if !status.success() {
        return Err("FFmpeg compression failed".to_string());
    }
    
    Ok(output_path.to_string_lossy().to_string())
}