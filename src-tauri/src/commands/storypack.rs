use tauri::AppHandle;
use std::path::Path;
use std::fs;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct StoryspackConfig {
    pub project_name: String,
    pub cover_image: Option<String>,
    pub prologue_image: Option<String>,
    pub chapter_images: Vec<String>,
    pub epilogue_image: Option<String>,
    pub credits_image: Option<String>,
    pub narration_audio: Vec<String>,
    pub theme_audio: Option<String>,
    pub video_source: Option<VideoSource>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(tag = "type", content = "value")]
pub enum VideoSource {
    YouTube { video_id: String },
    Hosted { url: String },
    Local { path: String },
}

#[tauri::command]
pub async fn select_output_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let folder = app.dialog()
        .file()
        .set_title("Select Output Folder for Storypack")
        .blocking_pick_folder();
    
    Ok(folder.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn generate_storypack(
    config: StoryspackConfig,
    output_folder: String
) -> Result<String, String> {
    println!("Generating storypack: {}", config.project_name);
    
    // Create project folder
    let project_path = Path::new(&output_folder).join(&config.project_name);
    fs::create_dir_all(&project_path)
        .map_err(|e| format!("Failed to create project folder: {}", e))?;
    
    // Create asset folders
    let assets_path = project_path.join("assets");
    let images_path = assets_path.join("images");
    let audio_path = assets_path.join("audio");
    let video_path = assets_path.join("video");
    
    fs::create_dir_all(&images_path)
        .map_err(|e| format!("Failed to create images folder: {}", e))?;
    fs::create_dir_all(&audio_path)
        .map_err(|e| format!("Failed to create audio folder: {}", e))?;
    fs::create_dir_all(&video_path)
        .map_err(|e| format!("Failed to create video folder: {}", e))?;
    
    // Copy images
    if let Some(cover) = &config.cover_image {
        copy_file(cover, &images_path, "cover")?;
    }
    
    if let Some(prologue) = &config.prologue_image {
        copy_file(prologue, &images_path, "prologue")?;
    }
    
    for (idx, chapter) in config.chapter_images.iter().enumerate() {
        let name = format!("chapter{}", idx + 1);
        copy_file(chapter, &images_path, &name)?;
    }
    
    if let Some(epilogue) = &config.epilogue_image {
        copy_file(epilogue, &images_path, "epilogue")?;
    }
    
    if let Some(credits) = &config.credits_image {
        copy_file(credits, &images_path, "credits")?;
    }
    
    // Copy audio files
    for (idx, audio) in config.narration_audio.iter().enumerate() {
        let name = format!("narration{}", idx + 1);
        copy_file(audio, &audio_path, &name)?;
    }
    
    if let Some(theme) = &config.theme_audio {
        copy_file(theme, &audio_path, "theme")?;
    }
    
    // Copy local video if provided
    if let Some(VideoSource::Local { path }) = &config.video_source {
        copy_file(path, &video_path, "video")?;
    }
    
    // Generate HTML and CSS
    generate_html(&config, &project_path)?;
    generate_css(&project_path)?;
    
    println!("Generated HTML and CSS files");
    
    Ok(project_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn select_image_file(app: AppHandle, title: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let file = app.dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp"])
        .set_title(&title)
        .blocking_pick_file();
    
    Ok(file.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn select_image_files(app: AppHandle, title: String) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let files = app.dialog()
        .file()
        .add_filter("Images", &["png", "jpg", "jpeg", "gif", "webp"])
        .set_title(&title)
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
pub async fn select_audio_file(app: AppHandle, title: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let file = app.dialog()
        .file()
        .add_filter("Audio", &["mp3", "wav", "ogg", "m4a"])
        .set_title(&title)
        .blocking_pick_file();
    
    Ok(file.map(|p| p.to_string()))
}

#[tauri::command]
pub async fn select_audio_files(app: AppHandle, title: String) -> Result<Vec<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    
    let files = app.dialog()
        .file()
        .add_filter("Audio", &["mp3", "wav", "ogg", "m4a"])
        .set_title(&title)
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
pub async fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
    }
    
    Ok(())
}

fn copy_file(source: &str, dest_folder: &Path, base_name: &str) -> Result<(), String> {
    let source_path = Path::new(source);
    let extension = source_path.extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    
    let dest_name = if extension.is_empty() {
        base_name.to_string()
    } else {
        format!("{}.{}", base_name, extension)
    };
    
    let dest_path = dest_folder.join(dest_name);
    
    fs::copy(source_path, &dest_path)
        .map_err(|e| format!("Failed to copy {}: {}", source, e))?;
    
    Ok(())
}

fn generate_html(config: &StoryspackConfig, project_path: &Path) -> Result<(), String> {
    let html = create_html_template(config);
    let html_path = project_path.join("index.html");
    
    fs::write(&html_path, html)
        .map_err(|e| format!("Failed to write index.html: {}", e))?;
    
    Ok(())
}

fn generate_css(project_path: &Path) -> Result<(), String> {
    let css = create_css_template();
    let css_path = project_path.join("styles.css");
    
    fs::write(&css_path, css)
        .map_err(|e| format!("Failed to write styles.css: {}", e))?;
    
    Ok(())
}

fn create_html_template(config: &StoryspackConfig) -> String {
    let mut pages = Vec::new();
    let mut audio_index = 0;
    
    // Helper function to get file extension
    fn get_extension(path: &str) -> String {
        Path::new(path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg")
            .to_string()
    }
    
    // Helper to get audio element for current page
    let get_audio = |idx: &mut usize| -> String {
        if *idx < config.narration_audio.len() {
            let audio_path = &config.narration_audio[*idx];
            let ext = get_extension(audio_path);
            *idx += 1;
            format!(r#"<audio class="page-audio" src="assets/audio/narration{}.{}" preload="auto"></audio>"#, *idx, ext)
        } else {
            String::new()
        }
    };
    
    // Cover page
    if let Some(cover) = &config.cover_image {
        let ext = get_extension(cover);
        let audio = get_audio(&mut audio_index);
        pages.push(format!(r#"
        <div class="page" data-page="cover">
            <div class="page-content">
                <img src="assets/images/cover.{}" alt="Cover" class="page-image" />
                {}
            </div>
        </div>"#, ext, audio));
    }
    
    // Prologue page
    if let Some(prologue) = &config.prologue_image {
        let ext = get_extension(prologue);
        let audio = get_audio(&mut audio_index);
        pages.push(format!(r#"
        <div class="page" data-page="prologue">
            <div class="page-content">
                <img src="assets/images/prologue.{}" alt="Prologue" class="page-image" />
                {}
            </div>
        </div>"#, ext, audio));
    }
    
    // Chapter pages
    for (i, chapter) in config.chapter_images.iter().enumerate() {
        let ext = get_extension(chapter);
        let audio = get_audio(&mut audio_index);
        let chapter_html = format!(r#"
        <div class="page" data-page="chapter{}">
            <div class="page-content">
                <img src="assets/images/chapter{}.{}" alt="Chapter {}" class="page-image" />
                {}
            </div>
        </div>"#, i + 1, i + 1, ext, i + 1, audio);
        pages.push(chapter_html);
    }
    
    // Epilogue page
    if let Some(epilogue) = &config.epilogue_image {
        let ext = get_extension(epilogue);
        let audio = get_audio(&mut audio_index);
        pages.push(format!(r#"
        <div class="page" data-page="epilogue">
            <div class="page-content">
                <img src="assets/images/epilogue.{}" alt="Epilogue" class="page-image" />
                {}
            </div>
        </div>"#, ext, audio));
    }
    
    // Credits page
    if let Some(credits) = &config.credits_image {
        let ext = get_extension(credits);
        let audio = get_audio(&mut audio_index);
        pages.push(format!(r#"
        <div class="page" data-page="credits">
            <div class="page-content">
                <img src="assets/images/credits.{}" alt="Credits" class="page-image" />
                {}
            </div>
        </div>"#, ext, audio));
    }
    
    let pages_html = pages.join("\n");
    
    // Background music element
    let theme_audio = if let Some(theme) = &config.theme_audio {
        let ext = get_extension(theme);
        format!(r#"<audio id="theme-music" src="assets/audio/theme.{}" loop></audio>"#, ext)
    } else {
        String::new()
    };
    
    // Video element
    let video_html = match &config.video_source {
        Some(VideoSource::YouTube { video_id }) => {
            format!(r#"
            <div class="video-container">
                <iframe 
                    src="https://www.youtube.com/embed/{}" 
                    frameborder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowfullscreen>
                </iframe>
            </div>"#, video_id)
        },
        Some(VideoSource::Hosted { url }) => {
            format!(r#"
            <div class="video-container">
                <video controls>
                    <source src="{}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>"#, url)
        },
        Some(VideoSource::Local { path: _ }) => {
            let ext = config.video_source.as_ref()
                .and_then(|v| match v {
                    VideoSource::Local { path } => Some(get_extension(path)),
                    _ => None
                })
                .unwrap_or_else(|| "mp4".to_string());
            
            format!(r#"
            <div class="video-container">
                <video controls>
                    <source src="assets/video/video.{}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
            </div>"#, ext)
        },
        None => String::new()
    };
    
    format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    {}
    
    <div class="book-container">
        {}
        <div class="pages-wrapper">
            {}
        </div>
        
        <div class="navigation">
            <button id="prev-btn" class="nav-btn" disabled>◀ Previous</button>
            <span id="page-indicator">Page 1</span>
            <button id="next-btn" class="nav-btn">Next ▶</button>
        </div>
        
        <div class="audio-controls">
            <button id="play-narration" class="audio-btn" title="Play narration">🔊 Narration</button>
            <button id="toggle-music" class="audio-btn" title="Toggle background music">🎵 Music</button>
        </div>
    </div>
    
    <script>
        let currentPage = 0;
        const pages = document.querySelectorAll('.page');
        const totalPages = pages.length;
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const pageIndicator = document.getElementById('page-indicator');
        const playNarrationBtn = document.getElementById('play-narration');
        const toggleMusicBtn = document.getElementById('toggle-music');
        const themeMusic = document.getElementById('theme-music');
        
        let musicPlaying = false;
        
        function showPage(index) {{
            pages.forEach((page, i) => {{
                page.classList.toggle('active', i === index);
            }});
            
            currentPage = index;
            prevBtn.disabled = index === 0;
            nextBtn.disabled = index === totalPages - 1;
            pageIndicator.textContent = `Page ${{index + 1}} of ${{totalPages}}`;
            
            // Check if current page has audio
            const hasAudio = pages[index].querySelector('.page-audio');
            playNarrationBtn.style.display = hasAudio ? 'block' : 'none';
        }}
        
        function playNarration() {{
            const currentAudio = pages[currentPage].querySelector('.page-audio');
            if (currentAudio) {{
                currentAudio.currentTime = 0;
                currentAudio.play();
            }}
        }}
        
        function toggleMusic() {{
            if (!themeMusic) return;
            
            if (musicPlaying) {{
                themeMusic.pause();
                toggleMusicBtn.textContent = '🎵 Music';
                musicPlaying = false;
            }} else {{
                themeMusic.play();
                toggleMusicBtn.textContent = '⏸️ Music';
                musicPlaying = true;
            }}
        }}
        
        prevBtn.addEventListener('click', () => {{
            if (currentPage > 0) {{
                showPage(currentPage - 1);
            }}
        }});
        
        nextBtn.addEventListener('click', () => {{
            if (currentPage < totalPages - 1) {{
                showPage(currentPage + 1);
            }}
        }});
        
        playNarrationBtn.addEventListener('click', playNarration);
        toggleMusicBtn.addEventListener('click', toggleMusic);
        
        // Hide music button if no theme music
        if (!themeMusic) {{
            toggleMusicBtn.style.display = 'none';
        }}
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {{
            if (e.key === 'ArrowLeft' && currentPage > 0) {{
                showPage(currentPage - 1);
            }} else if (e.key === 'ArrowRight' && currentPage < totalPages - 1) {{
                showPage(currentPage + 1);
            }} else if (e.key === ' ') {{
                e.preventDefault();
                playNarration();
            }}
        }});
        
        // Initialize
        showPage(0);
    </script>
</body>
</html>"#, config.project_name, theme_audio, video_html, pages_html)
}

fn create_css_template() -> String {
    r#"* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
}

.book-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    max-width: 900px;
    width: 100%;
    overflow: hidden;
}

.video-container {
    position: relative;
    width: 100%;
    padding-top: 56.25%;
    background: #000;
}

.video-container iframe,
.video-container video {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
}

.pages-wrapper {
    position: relative;
    width: 100%;
    min-height: 600px;
    background: #f5f5f5;
}

.page {
    display: none;
    width: 100%;
    min-height: 600px;
}

.page.active {
    display: flex;
}

.page-content {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    flex-direction: column;
}

.page-image {
    max-width: 100%;
    max-height: 600px;
    object-fit: contain;
    border-radius: 4px;
}

.page-audio {
    display: none;
}

.navigation {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 30px;
    background: white;
    border-top: 1px solid #e0e0e0;
}

.nav-btn {
    background: #667eea;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.nav-btn:hover:not(:disabled) {
    background: #5568d3;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.nav-btn:disabled {
    background: #ccc;
    cursor: not-allowed;
    transform: none;
}

#page-indicator {
    font-size: 14px;
    color: #666;
    font-weight: 500;
}

.audio-controls {
    display: flex;
    justify-content: center;
    gap: 12px;
    padding: 15px;
    background: #f8f8f8;
    border-top: 1px solid #e0e0e0;
}

.audio-btn {
    background: #764ba2;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.3s ease;
}

.audio-btn:hover {
    background: #5e3882;
    transform: translateY(-2px);
}

@media (max-width: 768px) {
    .book-container {
        border-radius: 0;
    }
    
    .pages-wrapper {
        min-height: 400px;
    }
    
    .page {
        min-height: 400px;
    }
    
    .page-image {
        max-height: 400px;
    }
    
    .navigation {
        padding: 15px 20px;
    }
    
    .nav-btn {
        padding: 10px 16px;
        font-size: 12px;
    }
    
    #page-indicator {
        font-size: 12px;
    }
    
    .audio-controls {
        padding: 12px;
        gap: 8px;
    }
    
    .audio-btn {
        padding: 8px 16px;
        font-size: 12px;
    }
}"#.to_string()
}