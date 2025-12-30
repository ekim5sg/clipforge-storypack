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
        // Call Tauri command to open file dialog
        const filePaths = await window.__TAURI__.core.invoke('select_video_files');
        
        if (filePaths && filePaths.length > 0) {
            // Add selected files to state
            filePaths.forEach(path => {
                state.clips.push({
                    path: path,
                    order: state.clips.length
                });
            });
            
            renderClipList();
            
            // Enable concatenate button if we have 2+ clips
            document.getElementById('concat-videos').disabled = state.clips.length < 2;
            
            console.log('Added clips:', filePaths);
        } else {
            console.log('No files selected');
        }
    } catch (error) {
        console.error('Error selecting files:', error);
        alert('Error opening file picker: ' + error);
    }
});

// Render clip list
function renderClipList() {
    const listEl = document.getElementById('clip-list');
    
    if (state.clips.length === 0) {
        listEl.innerHTML = '<p class="empty-state">No clips added yet</p>';
        return;
    }
    
    listEl.innerHTML = state.clips.map((clip, idx) => `
        <div class="clip-item">
            <div>
                <span class="clip-order">${idx + 1}.</span>
                <span class="clip-name">${clip.path.split('\\').pop()}</span>
            </div>
        </div>
    `).join('');
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
    alert('Phase 3 will implement website generation');
});

console.log('ClipForge Storypack initialized');
