// Application state
const state = {
    currentTab: 'clipforge',
    clips: [],
    storypackAssets: {}
};

// Tab switching
function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    state.currentTab = tabName;
}

// Initialize tab listeners
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => {
        switchTab(button.dataset.tab);
    });
});

// ClipForge: Add clips button
document.getElementById('add-clips').addEventListener('click', async () => {
    console.log('Opening file picker...');
    
    try {
        const filePaths = await window.__TAURI__.core.invoke('select_video_files');
        
        if (filePaths && filePaths.length > 0) {
            // Process all clips in parallel instead of sequentially
            const clipPromises = filePaths.map(async (path) => {
                const clipData = {
                    path: path,
                    order: state.clips.length,
                    size: null,
                    duration: null
                };
                
                // Get file size and duration in parallel
                const [sizeResult, durationResult] = await Promise.allSettled([
                    window.__TAURI__.core.invoke('get_file_size', { path }),
                    window.__TAURI__.core.invoke('get_video_duration', { path })
                ]);
                
                if (sizeResult.status === 'fulfilled') {
                    clipData.size = sizeResult.value;
                } else {
                    console.error('Error getting file size for', path, ':', sizeResult.reason);
                }
                
                if (durationResult.status === 'fulfilled') {
                    clipData.duration = durationResult.value;
                } else {
                    console.error('Error getting duration for', path, ':', durationResult.reason);
                }
                
                return clipData;
            });
            
            // Wait for all clips to be processed
            const newClips = await Promise.all(clipPromises);
            state.clips.push(...newClips);
            
            renderClipList();
            document.getElementById('concat-videos').disabled = state.clips.length < 2;
            
            console.log('Added clips:', filePaths);
        } else {
            console.log('No files selected');
        }
    } catch (error) {
        console.error('Error selecting files:', error);
    }
});

// ClipForge: Clear all clips button
document.getElementById('clear-clips').addEventListener('click', async () => {
    if (state.clips.length === 0) return;
    
    try {
        const confirmed = await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Clear All Clips',
            message: `Clear all ${state.clips.length} clips?`
        });
        
        if (confirmed) {
            state.clips = [];
            renderClipList();
            document.getElementById('concat-videos').disabled = true;
            console.log('Cleared all clips');
        }
    } catch (error) {
        console.error('Error showing confirmation:', error);
    }
});

// Render clip list
function renderClipList() {
    const listEl = document.getElementById('clip-list');
    
    if (state.clips.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No clips added yet</p>';
        return;
    }
    
    // Calculate totals
    const totalBytes = state.clips.reduce((sum, clip) => sum + (clip.size || 0), 0);
    const totalSize = formatFileSize(totalBytes);
    const totalSeconds = state.clips.reduce((sum, clip) => sum + (clip.duration || 0), 0);
    const totalDuration = formatDuration(totalSeconds);
    
    // Summary header
    const summaryHTML = `
        <div class="clip-summary">
            <span>${state.clips.length} clips</span>
            <span class="separator">•</span>
            <span>${totalDuration}</span>
            <span class="separator">•</span>
            <span>${totalSize}</span>
        </div>
    `;
    
    // Clip items
    const itemsHTML = state.clips.map((clip, idx) => {
        const fileName = clip.path.split('\\').pop();
        const fileSize = clip.size ? formatFileSize(clip.size) : '---';
        const duration = clip.duration ? formatDuration(clip.duration) : '--:--';
        
        return `
            <div class="clip-item">
                <div class="clip-info">
                    <span class="clip-order">${idx + 1}.</span>
                    <div class="clip-details">
                        <span class="clip-name">${fileName}</span>
                        <span class="clip-meta">${duration} • ${fileSize}</span>
                    </div>
                </div>
                <div class="clip-actions">
                    <button class="icon-button move-up" data-index="${idx}" title="Move up" ${idx === 0 ? 'disabled' : ''}>▲</button>
                    <button class="icon-button move-down" data-index="${idx}" title="Move down" ${idx === state.clips.length - 1 ? 'disabled' : ''}>▼</button>
                    <button class="icon-button remove" data-index="${idx}" title="Remove">✕</button>
                </div>
            </div>
        `;
    }).join('');
    
    listEl.innerHTML = summaryHTML + itemsHTML;
    
    // Add event listeners for action buttons
    document.querySelectorAll('.clip-item .remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            removeClip(idx);
        });
    });
    
    document.querySelectorAll('.clip-item .move-up').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            moveClip(idx, -1);
        });
    });
    
    document.querySelectorAll('.clip-item .move-down').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index);
            moveClip(idx, 1);
        });
    });
}

// Format duration from seconds to MM:SS or HH:MM:SS
function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '--:--';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    } else {
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }
}

// Format file size for display
function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

// Remove a clip
function removeClip(index) {
    state.clips.splice(index, 1);
    renderClipList();
    document.getElementById('concat-videos').disabled = state.clips.length < 2;
}

// Move a clip up or down
function moveClip(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= state.clips.length) return;
    
    // Swap clips
    [state.clips[index], state.clips[newIndex]] = [state.clips[newIndex], state.clips[index]];
    renderClipList();
}

// ClipForge: Concatenate button
document.getElementById('concat-videos').addEventListener('click', async () => {
    console.log('Starting concatenation...');
    console.log('Clips to concat:', state.clips);
    
    try {
        // Ask user where to save the output
        const outputPath = await window.__TAURI__.core.invoke('select_output_path');
        
        if (!outputPath) {
            console.log('User cancelled save dialog');
            return;
        }
        
        console.log('Saving to:', outputPath);
        
        // Disable button during processing
        const btn = document.getElementById('concat-videos');
        btn.disabled = true;
        btn.textContent = 'Processing...';
        
        // Call FFmpeg concatenation
        const clipPaths = state.clips.map(c => c.path);
        const result = await window.__TAURI__.core.invoke('concat_videos', {
            clips: clipPaths,
            outputPath: outputPath
        });
        
        console.log('Success:', result);
        btn.textContent = 'Concatenate Videos';
        btn.disabled = false;
        
        // Show success
        console.log('✅ Video created successfully!');
        
        // Optional: Clear the clip list
        const shouldClear = await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Success',
            message: 'Video created successfully! Clear the clip list?'
        });
        
        if (shouldClear) {
            state.clips = [];
            renderClipList();
            btn.disabled = true;
        }
        
    } catch (error) {
        console.error('Error concatenating videos:', error);
        const btn = document.getElementById('concat-videos');
        btn.textContent = 'Concatenate Videos';
        btn.disabled = false;
        
        // Show error dialog with the detailed message
        await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Concatenation Error',
            message: error.toString()
        });
    }
});

// Storypack: Load saved Cloudflare Worker URL
const savedWorkerUrl = localStorage.getItem('workerUrl') || '';

// Storypack: Track selected files
const storyspackState = {
    projectName: '',
    cover: null,
    prologue: null,
    chapters: [],
    epilogue: null,
    credits: null,
    narrationAudio: [],
    themeAudio: null,
    videoSource: null,
    workerUrl: savedWorkerUrl,
    autoTranscribe: false
};

// Populate Worker URL
document.getElementById('worker-url').value = storyspackState.workerUrl;

// Project name validation
const projectNameInput = document.getElementById('project-name');
projectNameInput.addEventListener('input', () => {
    updateGenerateButton();
});

function updateGenerateButton() {
    const hasProjectName = projectNameInput.value.trim().length > 0;
    const hasCover = storyspackState.cover !== null;
    document.getElementById('generate-website').disabled = !(hasProjectName && hasCover);
}

// Worker URL handler
document.getElementById('worker-url').addEventListener('input', (e) => {
    storyspackState.workerUrl = e.target.value.trim();
    localStorage.setItem('workerUrl', storyspackState.workerUrl);
});

document.getElementById('auto-transcribe').addEventListener('change', (e) => {
    storyspackState.autoTranscribe = e.target.checked;
});

// Storypack: File selection button handlers
document.querySelectorAll('.file-select-btn').forEach(button => {
    button.addEventListener('click', async () => {
        const field = button.dataset.field;
        const type = button.dataset.type;
        const multiple = button.dataset.multiple === 'true';
        
        // Skip if no field (e.g., publish tab folder selector)
        if (!field) return;
        
        try {
            let result;
            
            if (multiple) {
                if (type === 'image') {
                    result = await window.__TAURI__.core.invoke('select_image_files', {
                        title: `Select ${field.charAt(0).toUpperCase() + field.slice(1)}`
                    });
                } else {
                    result = await window.__TAURI__.core.invoke('select_audio_files', {
                        title: `Select ${field.charAt(0).toUpperCase() + field.slice(1)}`
                    });
                }
                
                if (result && result.length > 0) {
                    storyspackState[field] = result;
                    const nameSpan = document.getElementById(`${field}-name`);
                    const fileNames = result.map(p => p.split('\\').pop()).join(', ');
                    nameSpan.textContent = fileNames;
                    nameSpan.style.color = '#4fc3f7';
                }
            } else {
                if (type === 'image') {
                    result = await window.__TAURI__.core.invoke('select_image_file', {
                        title: `Select ${field.charAt(0).toUpperCase() + field.slice(1)}`
                    });
                } else {
                    result = await window.__TAURI__.core.invoke('select_audio_file', {
                        title: `Select ${field.charAt(0).toUpperCase() + field.slice(1)}`
                    });
                }
                
                if (result) {
                    storyspackState[field] = result;
                    const nameSpan = document.getElementById(`${field}-name`);
                    const fileName = result.split('\\').pop();
                    nameSpan.textContent = fileName;
                    nameSpan.style.color = '#4fc3f7';
                }
            }
            
            // Update generate button state
            updateGenerateButton();
            
        } catch (error) {
            console.error('Error selecting file:', error);
        }
    });
});

// Video source handling
const videoTypeSelect = document.getElementById('video-type');
const youtubeInput = document.getElementById('youtube-input');
const hostedInput = document.getElementById('hosted-input');
const localInput = document.getElementById('local-input');
const selectLocalVideoBtn = document.getElementById('select-local-video');

videoTypeSelect.addEventListener('change', (e) => {
    // Hide all inputs
    youtubeInput.style.display = 'none';
    hostedInput.style.display = 'none';
    localInput.style.display = 'none';
    
    // Show selected input
    const type = e.target.value;
    if (type === 'youtube') {
        youtubeInput.style.display = 'block';
    } else if (type === 'hosted') {
        hostedInput.style.display = 'block';
    } else if (type === 'local') {
        localInput.style.display = 'block';
    }
    
    // Clear video source
    storyspackState.videoSource = null;
});

// YouTube ID input
document.getElementById('youtube-id').addEventListener('input', (e) => {
    const videoId = e.target.value.trim();
    if (videoId) {
        storyspackState.videoSource = {
            type: 'YouTube',
            value: { video_id: videoId }
        };
    } else {
        storyspackState.videoSource = null;
    }
});

// Hosted URL input
document.getElementById('hosted-url').addEventListener('input', (e) => {
    const url = e.target.value.trim();
    if (url) {
        storyspackState.videoSource = {
            type: 'Hosted',
            value: { url: url }
        };
    } else {
        storyspackState.videoSource = null;
    }
});

// Local video file selection
selectLocalVideoBtn.addEventListener('click', async () => {
    try {
        const result = await window.__TAURI__.core.invoke('select_video_files');
        
        if (result && result.length > 0) {
            const videoPath = result[0];
            storyspackState.videoSource = {
                type: 'Local',
                value: { path: videoPath }
            };
            
            const fileName = videoPath.split('\\').pop();
            document.getElementById('local-video-name').textContent = fileName;
            document.getElementById('local-video-name').style.color = '#4fc3f7';
        }
    } catch (error) {
        console.error('Error selecting video:', error);
    }
});

// Clear Storypack form
document.getElementById('clear-storypack').addEventListener('click', () => {
    // Reset all fields
    projectNameInput.value = '';
    storyspackState.cover = null;
    storyspackState.prologue = null;
    storyspackState.chapters = [];
    storyspackState.epilogue = null;
    storyspackState.credits = null;
    storyspackState.narrationAudio = [];
    storyspackState.themeAudio = null;
    storyspackState.videoSource = null;
    storyspackState.autoTranscribe = false;
    
    // Reset UI
    document.querySelectorAll('.file-name').forEach(span => {
        span.textContent = span.id.includes('chapters') || span.id.includes('narrationAudio') ? 'No files selected' : 'No file selected';
        span.style.color = '#888';
    });
    
    videoTypeSelect.value = 'none';
    youtubeInput.style.display = 'none';
    hostedInput.style.display = 'none';
    localInput.style.display = 'none';
    document.getElementById('youtube-id').value = '';
    document.getElementById('hosted-url').value = '';
    document.getElementById('auto-transcribe').checked = false;
    
    updateGenerateButton();
    
    console.log('Storypack form cleared');
});

// Storypack: Generate website button
document.getElementById('generate-website').addEventListener('click', async () => {
    const projectName = projectNameInput.value.trim();
    
    if (!projectName) {
        await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Missing Information',
            message: 'Please enter a project name.'
        });
        return;
    }
    
    // Check Worker URL if auto-transcribe is enabled
	if (storyspackState.autoTranscribe) {
		if (!storyspackState.workerUrl) {
			await window.__TAURI__.core.invoke('confirm_dialog', {
				title: 'Missing Worker URL',
				message: 'Please enter your Cloudflare Worker URL to use auto-transcribe.'
			});
			return;
		}
	}
    
    console.log('Generating storypack website...');
    console.log('Storypack state:', storyspackState);
    
    try {
        // Select output folder
        const outputFolder = await window.__TAURI__.core.invoke('select_output_folder');
        if (!outputFolder) {
            console.log('User cancelled folder selection');
            return;
        }
        
        // Show loading
        document.getElementById('storypack-form').style.display = 'none';
        document.getElementById('generation-status').style.display = 'block';
        const uploadMsg = document.getElementById('upload-message');
        uploadMsg.textContent = 'Generating storypack...';
        
        // Transcribe audio if enabled
        let transcriptions = [];
        if (storyspackState.autoTranscribe && storyspackState.narrationAudio.length > 0) {
            uploadMsg.textContent = 'Transcribing audio...';
            
            for (let i = 0; i < storyspackState.narrationAudio.length; i++) {
                const audioPath = storyspackState.narrationAudio[i];
                uploadMsg.textContent = 
                    `Transcribing audio ${i + 1} of ${storyspackState.narrationAudio.length}...`;
                
                try {
					const text = await window.__TAURI__.core.invoke('transcribe_audio', {
						config: {
							worker_url: storyspackState.workerUrl
						},
						audioPath
					});
                    transcriptions.push(text);
                    console.log(`Transcribed audio ${i + 1}:`, text);
                } catch (error) {
                    console.error(`Failed to transcribe audio ${i + 1}:`, error);
                    transcriptions.push(''); // Empty string if transcription fails
                }
            }
        }
        
        uploadMsg.textContent = 'Creating storypack files...';
        
        // Prepare config
        const config = {
            project_name: projectName,
            cover_image: storyspackState.cover,
            prologue_image: storyspackState.prologue,
            chapter_images: storyspackState.chapters || [],
            epilogue_image: storyspackState.epilogue,
            credits_image: storyspackState.credits,
            narration_audio: storyspackState.narrationAudio || [],
            theme_audio: storyspackState.themeAudio,
            video_source: storyspackState.videoSource,
            transcriptions: transcriptions
        };
        
        console.log('Generating with config:', config);
        
        const result = await window.__TAURI__.core.invoke('generate_storypack', {
            config,
            outputFolder
        });
        
        console.log('Storypack generated:', result);
        
        // Hide loading
        document.getElementById('generation-status').style.display = 'none';
        document.getElementById('storypack-form').style.display = 'block';
        
        // Show success with option to open folder
        const shouldOpen = await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Success!',
            message: `Storypack created successfully!\n\nLocation: ${result}\n\nWould you like to open the folder?`
        });
        
        if (shouldOpen) {
            // Open folder in file explorer
            await window.__TAURI__.core.invoke('open_folder', { path: result });
        }
        
    } catch (error) {
        console.error('Error generating storypack:', error);
        
        // Hide loading
        document.getElementById('generation-status').style.display = 'none';
        document.getElementById('storypack-form').style.display = 'block';
        
        await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Error',
            message: `Failed to generate storypack:\n${error}`
        });
    }
});

// Publish: Load saved credentials or use defaults
const savedFtpConfig = localStorage.getItem('ftpConfig');
const defaultFtpConfig = savedFtpConfig ? JSON.parse(savedFtpConfig) : {
    host: '',
    username: '',
    path: ''
};

const publishState = {
    storyspackFolder: null,
    ftpHost: defaultFtpConfig.host,
    ftpUsername: defaultFtpConfig.username,
    ftpPassword: '', // Never save password
    ftpPath: defaultFtpConfig.path
};

// Populate form with saved values
document.getElementById('ftp-host').value = publishState.ftpHost;
document.getElementById('ftp-username').value = publishState.ftpUsername;
document.getElementById('ftp-path').value = publishState.ftpPath;

// Focus password field if we have saved credentials
if (publishState.ftpHost && publishState.ftpUsername) {
    setTimeout(() => {
        const passwordField = document.getElementById('ftp-password');
        if (passwordField) {
            passwordField.focus();
        }
    }, 100);
}

function saveFtpCredentials() {
    const config = {
        host: publishState.ftpHost,
        username: publishState.ftpUsername,
        path: publishState.ftpPath
        // Note: We never save the password
    };
    localStorage.setItem('ftpConfig', JSON.stringify(config));
    console.log('FTP credentials saved');
}

// Select storypack folder
document.getElementById('select-storypack-folder').addEventListener('click', async () => {
    try {
        const folder = await window.__TAURI__.core.invoke('select_storypack_folder');
        
        if (folder) {
            publishState.storyspackFolder = folder;
            const folderName = folder.split('\\').pop();
            document.getElementById('storypack-folder-name').textContent = folderName;
            document.getElementById('storypack-folder-name').style.color = '#4fc3f7';
            updateUploadButton();
        }
    } catch (error) {
        console.error('Error selecting folder:', error);
    }
});

// FTP input handlers
document.getElementById('ftp-host').addEventListener('input', (e) => {
    publishState.ftpHost = e.target.value.trim();
    updateUploadButton();
    saveFtpCredentials();
});

document.getElementById('ftp-username').addEventListener('input', (e) => {
    publishState.ftpUsername = e.target.value.trim();
    updateUploadButton();
    saveFtpCredentials();
});

document.getElementById('ftp-password').addEventListener('input', (e) => {
    publishState.ftpPassword = e.target.value.trim();
    updateUploadButton();
    // Don't save password
});

document.getElementById('ftp-path').addEventListener('input', (e) => {
    publishState.ftpPath = e.target.value.trim();
    saveFtpCredentials();
});

function updateUploadButton() {
    const hasFolder = publishState.storyspackFolder !== null;
    const hasHost = publishState.ftpHost.length > 0;
    const hasUsername = publishState.ftpUsername.length > 0;
    const hasPassword = publishState.ftpPassword.length > 0;
    
    document.getElementById('upload-ftp').disabled = !(hasFolder && hasHost && hasUsername && hasPassword);
}

// Test FTP connection
document.getElementById('test-ftp').addEventListener('click', async () => {
    if (!publishState.ftpHost || !publishState.ftpUsername || !publishState.ftpPassword) {
        await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Missing Information',
            message: 'Please enter FTP host, username, and password.'
        });
        return;
    }
    
    const btn = document.getElementById('test-ftp');
    btn.disabled = true;
    btn.textContent = 'Testing...';
    
    try {
        const config = {
            host: publishState.ftpHost,
            username: publishState.ftpUsername,
            password: publishState.ftpPassword,
            remote_path: publishState.ftpPath || null
        };
        
        const result = await window.__TAURI__.core.invoke('test_ftp_connection', { config });
        
        await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Success',
            message: result
        });
        
    } catch (error) {
        await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Connection Failed',
            message: error.toString()
        });
    } finally {
        btn.disabled = false;
        btn.textContent = 'Test Connection';
    }
});

// Set up progress listener once when page loads
let progressUnlisten = null;

// Initialize progress listener
(async () => {
    progressUnlisten = await window.__TAURI__.event.listen('upload-progress', (event) => {
        const progress = event.payload;
        console.log('Progress update:', progress);
        document.getElementById('progress-fill').style.width = progress + '%';
        document.getElementById('progress-text').textContent = progress + '%';
    });
})();

// Upload to FTP
document.getElementById('upload-ftp').addEventListener('click', async () => {
    console.log('Starting FTP upload...');
    
    try {
        // Reset progress
        document.getElementById('progress-fill').style.width = '0%';
        document.getElementById('progress-text').textContent = '0%';
        
        // Show upload status
        document.getElementById('publish-form').style.display = 'none';
        document.getElementById('upload-status').style.display = 'block';
        document.getElementById('upload-message').textContent = 'Uploading to server...';
        
        const config = {
            host: publishState.ftpHost,
            username: publishState.ftpUsername,
            password: publishState.ftpPassword,
            remote_path: publishState.ftpPath || null
        };
        
        const result = await window.__TAURI__.core.invoke('upload_to_ftp', {
            config,
            localFolder: publishState.storyspackFolder
        });
        
        // Hide upload status
        document.getElementById('upload-status').style.display = 'none';
        document.getElementById('publish-form').style.display = 'block';
        
        // Show success
        await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Upload Complete',
            message: result
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        
        // Hide upload status
        document.getElementById('upload-status').style.display = 'none';
        document.getElementById('publish-form').style.display = 'block';
        
        await window.__TAURI__.core.invoke('confirm_dialog', {
            title: 'Upload Failed',
            message: error.toString()
        });
    }
});

console.log('ClipForge Storypack initialized');