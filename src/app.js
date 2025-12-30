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
            // Get file sizes for each clip
            for (const path of filePaths) {
                try {
                    const size = await window.__TAURI__.core.invoke('get_file_size', { path });
                    state.clips.push({
                        path: path,
                        order: state.clips.length,
                        size: size
                    });
                } catch (error) {
                    console.error('Error getting file size:', error);
                    state.clips.push({
                        path: path,
                        order: state.clips.length,
                        size: null
                    });
                }
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
    
    listEl.innerHTML = state.clips.map((clip, idx) => {
        const fileName = clip.path.split('\\').pop();
        const fileSize = clip.size ? formatFileSize(clip.size) : '---';
        
        return `
            <div class="clip-item">
                <div class="clip-info">
                    <span class="clip-order">${idx + 1}.</span>
                    <div class="clip-details">
                        <span class="clip-name">${fileName}</span>
                        <span class="clip-size">${fileSize}</span>
                    </div>
                </div>
                <div class="clip-actions">
                    <button class="icon-button move-up" data-index="${idx}" title="Move up">▲</button>
                    <button class="icon-button move-down" data-index="${idx}" title="Move down">▼</button>
                    <button class="icon-button remove" data-index="${idx}" title="Remove">✕</button>
                </div>
            </div>
        `;
    }).join('');
    
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
        
        // Show success (using console instead of alert to avoid permission error)
        console.log('✅ Video created successfully!');
        
        // Optional: Clear the clip list
        if (confirm('Video created successfully! Clear the clip list?')) {
            state.clips = [];
            renderClipList();
            btn.disabled = true;
        }
        
    } catch (error) {
        console.error('Error concatenating videos:', error);
        const btn = document.getElementById('concat-videos');
        btn.textContent = 'Concatenate Videos';
        btn.disabled = false;
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