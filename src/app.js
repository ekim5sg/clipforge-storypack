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
document.getElementById('add-clips').addEventListener('click', () => {
    console.log('Add clips clicked - will open file picker in Phase 2');
    
    // Mock data for Phase 1
    const mockClip = {
        path: `C:\\Users\\Videos\\clip_${state.clips.length + 1}.mp4`,
        order: state.clips.length
    };
    state.clips.push(mockClip);
    renderClipList();
    
    // Enable concatenate button if we have clips
    document.getElementById('concat-videos').disabled = state.clips.length < 2;
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
document.getElementById('concat-videos').addEventListener('click', () => {
    console.log('Concatenate clicked - will call Tauri command in Phase 2');
    console.log('Clips to concat:', state.clips);
    alert('Phase 2 will implement video concatenation');
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
