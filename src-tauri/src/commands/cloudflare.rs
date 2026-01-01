use serde::Deserialize;
use std::fs;

// Simplified config - only need worker URL now
#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct CloudflareConfig {
    pub worker_url: String,
}

#[tauri::command]
pub async fn transcribe_audio(
    config: CloudflareConfig,
    audio_path: String,
) -> Result<String, String> {
    println!("Transcribing: {}", audio_path);
    println!("Using worker: {}", config.worker_url);
    
    // Read audio file
    let audio_data = fs::read(&audio_path)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;
    
    // Call the Worker
    let client = reqwest::Client::new();
    let response = client
        .post(&config.worker_url)
        .header("Content-Type", "application/octet-stream")
        .body(audio_data)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Worker error ({}): {}", status, body));
    }
    
    #[derive(Deserialize)]
    struct WorkerResponse {
        success: bool,
        text: Option<String>,
        error: Option<String>,
    }
    
    let result: WorkerResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;
    
    println!("Worker response: success={}, text={:?}", result.success, result.text);
    
    if result.success {
        result.text.ok_or_else(|| "No transcription text".to_string())
    } else {
        Err(result.error.unwrap_or_else(|| "Unknown error".to_string()))
    }
}