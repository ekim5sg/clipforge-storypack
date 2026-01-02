use serde::Deserialize;
use std::fs;
use crate::commands::audio_compress;

// Worker config
#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct CloudflareConfig {
    pub worker_url: String,
}

#[tauri::command]
pub async fn transcribe_audio(
    config: CloudflareConfig,
    audio_path: String,
) -> Result<Vec<String>, String> {
    println!("Transcribing: {}", audio_path);
    println!("Using worker: {}", config.worker_url);
    
    // Compress audio first for better API compatibility
    let compressed_path = audio_compress::compress_for_transcription(&audio_path)?;
    println!("Compressed audio: {}", compressed_path);
    
    // Read compressed audio file
    let audio_data = fs::read(&compressed_path)
        .map_err(|e| format!("Failed to read compressed audio: {}", e))?;
    
    println!("Compressed size: {} bytes", audio_data.len());
    
    // Call the Worker
    let client = reqwest::Client::new();
    let response = client
        .post(&config.worker_url)
        .header("Content-Type", "application/octet-stream")
        .body(audio_data)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    
    // Clean up compressed file
    let _ = fs::remove_file(&compressed_path);
    
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Worker error ({}): {}", status, body));
    }
    
    #[derive(Deserialize)]
    struct WorkerResponse {
        success: bool,
        text: Option<String>,
        segments: Option<Vec<String>>,
        error: Option<String>,
    }
    
    let result: WorkerResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    println!("Worker response: success={}", result.success);
    
    if result.success {
        if let Some(segments) = result.segments {
            if !segments.is_empty() {
                println!("Received {} segments from worker", segments.len());
                return Ok(segments);
            }
        }
        
        if let Some(text) = result.text {
            println!("No segments, using full text");
            return Ok(vec![text]);
        }
        
        Ok(vec![])
    } else {
        Err(result.error.unwrap_or_else(|| "Unknown error".to_string()))
    }
}