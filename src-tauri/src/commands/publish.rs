use tauri::{AppHandle, Emitter};
use std::path::Path;
use std::fs;
use std::io::Read;
use ftp::FtpStream;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct FtpConfig {
    pub host: String,
    pub username: String,
    pub password: String,
    pub remote_path: Option<String>,
}

#[tauri::command]
pub async fn select_storypack_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let folder = app.dialog()
        .file()
        .set_title("Select Storypack Folder to Upload")
        .blocking_pick_folder();
    
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn test_ftp_connection(config: FtpConfig) -> Result<String, String> {
    let address = format!("{}:21", config.host);
    
    let mut ftp_stream = FtpStream::connect(&address)
        .map_err(|e| format!("Failed to connect to FTP server: {}", e))?;
    
    ftp_stream.login(&config.username, &config.password)
        .map_err(|e| format!("Login failed: {}", e))?;
    
    ftp_stream.quit()
        .map_err(|e| format!("Failed to disconnect: {}", e))?;
    
    Ok("Connection successful!".to_string())
}

#[tauri::command]
pub async fn upload_to_ftp(
    app: AppHandle,
    config: FtpConfig,
    local_folder: String,
) -> Result<String, String> {
    let address = format!("{}:21", config.host);
    
    let mut ftp_stream = FtpStream::connect(&address)
        .map_err(|e| format!("Failed to connect: {}", e))?;
    
    ftp_stream.login(&config.username, &config.password)
        .map_err(|e| format!("Login failed: {}", e))?;
    
    // Change to remote directory if specified
    if let Some(remote_path) = &config.remote_path {
        if !remote_path.is_empty() {
            // Try to create directory if it doesn't exist
            let _ = ftp_stream.mkdir(remote_path);
            ftp_stream.cwd(remote_path)
                .map_err(|e| format!("Failed to change to directory {}: {}", remote_path, e))?;
        }
    }
    
    // Get folder name for remote directory
    let folder_name = Path::new(&local_folder)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid folder path")?;
    
    // Create remote folder
    let _ = ftp_stream.mkdir(folder_name);
    ftp_stream.cwd(folder_name)
        .map_err(|e| format!("Failed to create/enter folder: {}", e))?;
    
    // Count total files first
    let total_files = count_files(&local_folder)?;
    let mut uploaded_files = 0;
    
    // Upload all files recursively with progress
    upload_directory(&mut ftp_stream, &local_folder, &app, total_files, &mut uploaded_files)?;
    
    ftp_stream.quit()
        .map_err(|e| format!("Failed to disconnect: {}", e))?;
    
    Ok(format!("Successfully uploaded to {}", config.host))
}

fn count_files(path: &str) -> Result<usize, String> {
    let mut count = 0;
    let entries = fs::read_dir(path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();
        
        if entry_path.is_dir() {
            count += count_files(entry_path.to_str().unwrap())?;
        } else {
            count += 1;
        }
    }
    
    Ok(count)
}

fn upload_directory(
    ftp: &mut FtpStream,
    local_path: &str,
    app: &AppHandle,
    total_files: usize,
    uploaded_files: &mut usize,
) -> Result<(), String> {
    let entries = fs::read_dir(local_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let file_name = entry.file_name();
        let file_name_str = file_name.to_str().ok_or("Invalid filename")?;
        
        if path.is_dir() {
            // Create directory on server
            let _ = ftp.mkdir(file_name_str);
            ftp.cwd(file_name_str)
                .map_err(|e| format!("Failed to enter directory: {}", e))?;
            
            // Recursively upload directory contents
            upload_directory(ftp, path.to_str().unwrap(), app, total_files, uploaded_files)?;
            
            // Go back up
            ftp.cwd("..")
                .map_err(|e| format!("Failed to go back: {}", e))?;
        } else {
            // Upload file
            let mut file = fs::File::open(&path)
                .map_err(|e| format!("Failed to open file: {}", e))?;
            
            let mut contents = Vec::new();
            file.read_to_end(&mut contents)
                .map_err(|e| format!("Failed to read file: {}", e))?;
            
            ftp.put(file_name_str, &mut contents.as_slice())
                .map_err(|e| format!("Failed to upload {}: {}", file_name_str, e))?;
            
            *uploaded_files += 1;
            let progress = (*uploaded_files as f32 / total_files as f32 * 100.0) as u32;
            
            // Emit progress event
            let _ = app.emit("upload-progress", progress);
            
            println!("Uploaded: {} ({}/{})", file_name_str, uploaded_files, total_files);
        }
    }
    
    Ok(())
}