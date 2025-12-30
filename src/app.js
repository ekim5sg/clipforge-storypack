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

// ClipForge: Add clips button
document.getElementById('add-clips').addEventListener('click', async () => {
    console.log('Opening file picker...');
    
    try {
        const filePaths = await window.__TAURI__.core.invoke('select_video_files');
        
        if (filePaths && filePaths.length > 0) {
            // Get file sizes and durations for each clip
            for (const path of filePaths) {
                const clipData = {
                    path: path,
                    order: state.clips.length,
                    size: null,
                    duration: null
                };
                
                // Get file size
                try {
                    clipData.size = await window.__TAURI__.core.invoke('get_file_size', { path });
                } catch (error) {
                    console.error('Error getting file size:', error);
                }
                
                // Get video duration
                try {
                    clipData.duration = await window.__TAURI__.core.invoke('get_video_duration', { path });
                } catch (error) {
                    console.error('Error getting duration:', error);
                }
                
                state.clips.push(clipData);
            }
            
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

// Storypack: File input handlers
document.querySelectorAll('#storypack-form input[type="file"]').forEach(input => {
    input.addEventListener('change', (e) => {
        const fileNameSpan = e.target.nextElementSibling;
        if (e.target.files.length > 0) {
            const names = Array.from(e.target.files).map(f => f.name).join(', ');
            fileNameSpan.textContent = names;
            fileNameSpan.style.color = '#4fc3f7';
        } else {
            fileNameSpan.textContent = 'No file selected';
            fileNameSpan.style.color = '#888';
        }
        
        // Enable generate button if cover is selected
        const coverInput = document.querySelector('[data-field="cover"]');
        document.getElementById('generate-website').disabled = coverInput.files.length === 0;
    });
});

// Storypack: Generate website button
document.getElementById('generate-website').addEventListener('click', () => {
    console.log('Generate website clicked - will call Tauri command in Phase 3');
});

console.log('ClipForge Storypack initialized');