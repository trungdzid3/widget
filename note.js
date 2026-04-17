
const { ipcRenderer } = require('electron');

let currentListId = null;
let folderColors = JSON.parse(localStorage.getItem('folder_colors') || '{}');
let selectedColorIdx = null;
const PALETTE = [
    { bg: '#fff59d', border: '#fbc02d' }, { bg: '#ffcc80', border: '#ef6c00' },
    { bg: '#a5d6a7', border: '#2e7d32' }, { bg: '#90caf9', border: '#1565c0' },
    { bg: '#ce93d8', border: '#6a1b9a' }, { bg: '#f48fb1', border: '#ad1457' },
    { bg: '#ff80ab', border: '#c51162' }, { bg: '#b9f6ca', border: '#00c853' },
    { bg: '#ffff8d', border: '#ffd600' }, { bg: '#80d8ff', border: '#0091ea' }
];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Tải RPG System UI
    if (typeof RPG !== 'undefined') {
        updateRPGUI();
    }

    // 2. Load Dữ liệu ban đầu
    const corkboard = document.getElementById('corkboard');
    loadTaskLists();

    function renderFolderDOM(lists) {
        corkboard.innerHTML = '';
        if (lists && lists.length > 0) {
            lists.forEach((list, i) => {
                const note = document.createElement('div');
                note.className = 'folder-note';

                // BẢNG MÀU CƠ BẢN
                let colors = ['#fff59d', '#ffcc80', '#a5d6a7', '#90caf9', '#ce93d8', '#f48fb1'];
                let borders = ['#fbc02d', '#ef6c00', '#2e7d32', '#1565c0', '#6a1b9a', '#ad1457'];
                
                // ĐẶC QUYỀN THỎ TRĂNG (BUNNY): Màu Pastel Premium
                const bunnyTier = (window.RPG && window.RPG.getPetTier) ? window.RPG.getPetTier('bunny') : 0;
                if (bunnyTier >= 1) {
                    // Tier 1 đã bắt đầu có màu mới
                    colors.push('#e1f5fe', '#f3e5f5', '#efebe9', '#e8f5e9'); 
                    borders.push('#0288d1', '#7b1fa2', '#5d4037', '#388e3c');
                }
                if (bunnyTier >= 2) {
                    // Tier 2 thêm các màu neon lofi cực chất
                    colors.push('#ff80ab', '#b9f6ca', '#ffff8d', '#80d8ff');
                    borders.push('#c51162', '#00c853', '#ffd600', '#0091ea');
                }

                const colorIndex = i % colors.length;
                
                // ĐẶC QUYỀN THỎ TRĂNG (BUNNY): Ưu tiên màu thủ công (Tier 2+)
                const custom = folderColors[list.id];
                if (custom) {
                    note.style.backgroundColor = custom.bg;
                    note.style.borderBottomColor = note.style.borderRightColor = custom.border;
                } else {
                    note.style.backgroundColor = colors[colorIndex];
                    note.style.borderBottomColor = note.style.borderRightColor = borders[colorIndex];
                }
                note.style.borderTopColor = note.style.borderLeftColor = '#fff';

                const rot = Math.floor(Math.random() * 6) - 3;
                note.style.transform = `rotate(${rot}deg)`;

                note.textContent = list.title;
                note.addEventListener('click', () => openFolder(list.id, list.title));

                corkboard.appendChild(note);
            });
        }
    }

    async function loadTaskLists() {
        // 1. Tai tu LocalStorage truoc de hien thi ngay lap tuc
        try {
            const cached = localStorage.getItem('offline_folders');
            if (cached) {
                const parsed = JSON.parse(cached);
                renderFolderDOM(parsed);
            }
        } catch (e) { console.error('Cache load error:', e); }

        // 2. Fetch ngam tu Google Tasks de dong bo
        try {
            const lists = await ipcRenderer.invoke('g-get-tasklists');
            if (lists) {
                localStorage.setItem('offline_folders', JSON.stringify(lists));
                renderFolderDOM(lists); // Cap nhat lai UI sau khi lay duoc mang tasklists
            }
        } catch (error) {
            console.error('Google fetch error:', error);
        }
    }

    // =============== TẠO SỔ (FOLDER) ===============
    const btnAddFolder = document.getElementById('btn-add-folder');
    const createModal = document.getElementById('create-modal');
    const inputFolderName = document.getElementById('input-folder-name');
    const btnCancelFolder = document.getElementById('btn-cancel-folder');
    const btnConfirmFolder = document.getElementById('btn-confirm-folder');

    btnAddFolder.addEventListener('click', () => {
        inputFolderName.value = '';
        createModal.classList.remove('hidden');
        ipcRenderer.send('request-focus', 'note', true);
        inputFolderName.focus();

        // HIỂN THỊ CHỌN MÀU NẾU THỎ TIER 2+
        const pickerContainer = document.getElementById('color-picker-container');
        const bunnyTier = (window.RPG && window.RPG.getPetTier) ? window.RPG.getPetTier('bunny') : 0;
        if (bunnyTier >= 2) {
            pickerContainer.classList.remove('hidden');
            selectedColorIdx = 0; // Mặc định màu đầu tiên
            renderColorPicker();
        } else {
            pickerContainer.classList.add('hidden');
            selectedColorIdx = null;
        }
    });

    function renderColorPicker() {
        const container = document.getElementById('color-options');
        if (!container) return;
        container.innerHTML = '';
        PALETTE.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'color-option' + (selectedColorIdx === idx ? ' active' : '');
            div.style.backgroundColor = item.bg;
            div.onclick = () => {
                selectedColorIdx = idx;
                renderColorPicker();
            };
            container.appendChild(div);
        });
    }

    function showNoteToast(msg) {
        const toast = document.createElement('div');
        toast.className = 'note-toast';
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    btnCancelFolder.addEventListener('click', () => {
        createModal.classList.add('hidden');
        ipcRenderer.send('request-focus', 'note', false);
    });

    btnConfirmFolder.addEventListener('click', async () => {
        const title = inputFolderName.value.trim();
        if (title) {
            try {
                btnConfirmFolder.disabled = true;
                btnConfirmFolder.textContent = '...';
                const newList = await ipcRenderer.invoke('g-add-tasklist', title);
                
                // LƯU MÀU NẾU CÓ CHỌN
                if (newList && newList.id && selectedColorIdx !== null) {
                    folderColors[newList.id] = PALETTE[selectedColorIdx];
                    localStorage.setItem('folder_colors', JSON.stringify(folderColors));
                }

                createModal.classList.add('hidden');
                ipcRenderer.send('request-focus', 'note', false);
                loadTaskLists();
            } finally {
                btnConfirmFolder.disabled = false;
                btnConfirmFolder.textContent = 'TẠO NHIỆM VỤ';
            }
        }
    });
    inputFolderName.addEventListener('keypress', (e) => { if (e.key === 'Enter') btnConfirmFolder.click(); });

    // =============== TASK LOGIC ===============
    const noteView = document.getElementById('note-view');
    const noteTitle = document.getElementById('note-title');
    const btnCloseNote = document.getElementById('btn-close-note');
    const taskListDiv = document.getElementById('task-list');
    const inputNewTask = document.getElementById('input-new-task');
    const btnAddTask = document.getElementById('btn-add-task');

    function openFolder(listId, title) {
        currentListId = listId;
        noteTitle.textContent = title;
        noteView.classList.remove('hidden');
        inputNewTask.focus();
        ipcRenderer.send('request-focus', 'note', true);

        // HIỆN NÚT ĐỔI MÀU NẾU THỎ TIER 3
        const btnChangeColor = document.getElementById('btn-change-color');
        const editColorPicker = document.getElementById('edit-color-picker');
        const bunnyTier = (window.RPG && window.RPG.getPetTier) ? window.RPG.getPetTier('bunny') : 0;
        
        if (btnChangeColor) {
            if (bunnyTier >= 3) btnChangeColor.classList.remove('hidden');
            else btnChangeColor.classList.add('hidden');
        }
        if (editColorPicker) editColorPicker.classList.add('hidden');
        
        // Instant load from cache
        loadGoogleTasks(true);
    }
    
    btnCloseNote.addEventListener('click', () => {
        noteView.classList.add('hidden');
        ipcRenderer.send('request-focus', 'note', false);
    });

    // Bắt sự kiện xóa sổ
    const btnDeleteFolder = document.getElementById('btn-delete-folder');
    if (btnDeleteFolder) {
        btnDeleteFolder.addEventListener('click', async () => {
            if (!currentListId) return;
            if (confirm('Xóa danh sách nhiệm vụ này trên Google Tasks? Tất cả công việc bên trong sẽ biến mất vĩnh viễn.')) {
                try {
                    btnDeleteFolder.disabled = true;
                    btnDeleteFolder.textContent = '...';
                    const success = await ipcRenderer.invoke('g-remove-tasklist', currentListId);
                    if (success) {
                        noteView.classList.add('hidden');
                        loadTaskLists();
                    } else {
                        alert('Không thể xóa Sổ mặc định của Google hoặc có lỗi xảy ra!');
                    }
                } finally {
                    btnDeleteFolder.disabled = false;
                    btnDeleteFolder.textContent = '🗑️';
                }
            }
        });
    }

    function renderTasks(tasks) {
        taskListDiv.innerHTML = '';
        if (tasks && tasks.length > 0) {
            tasks.forEach(task => {
                const isDone = task.status === 'completed';
                const item = document.createElement('div');
                item.className = `task-item ${isDone ? 'done' : ''}`;
                item.dataset.taskId = task.id;
                
                item.innerHTML = `
                    <div class="task-checkbox"></div>
                    <div class="task-title">${task.title} <span style="opacity:0.5; font-size:12px; margin-left: 5px;">✍️</span></div>
                `;

                item.addEventListener('click', () => toggleTaskStatus(task, currentListId, item));
                taskListDiv.appendChild(item);
            });
        } else {
            taskListDiv.innerHTML = '<div style="text-align:center; padding:10px; opacity:0.7;">Chưa có nhiệm vụ nào!</div>';
        }
    }

    async function loadGoogleTasks(useCache = false) {
        if (!currentListId) return;
        
        // 1. Instant Cache Pull
        if (useCache) {
            try {
                const cached = localStorage.getItem(`tasks_${currentListId}`);
                if (cached) renderTasks(JSON.parse(cached));
            } catch(e) {}
        }
        
        if (!taskListDiv.innerHTML || taskListDiv.innerHTML.includes('...')) {
            taskListDiv.innerHTML = '<div style="text-align:center; padding:10px;">Đang lật trang...</div>';
        }

        try {
            const tasks = await ipcRenderer.invoke('g-get-tasks', currentListId);
            if (tasks) {
                const tasksJson = JSON.stringify(tasks);
                const prevJson = localStorage.getItem(`tasks_${currentListId}`);
                
                // Only re-render if data actually changed to prevent flicker
                if (tasksJson !== prevJson) {
                    localStorage.setItem(`tasks_${currentListId}`, tasksJson);
                    renderTasks(tasks);
                }
            }
            
            const btnComplete = document.getElementById('btn-complete-folder');
            if (btnComplete) {
                btnComplete.disabled = false;
                btnComplete.textContent = 'NỘP SỔ & NHẬN THƯỞNG';
            }
        } catch (e) { 
            console.error(e); 
            if (!taskListDiv.innerHTML.includes('task-item')) {
                taskListDiv.innerHTML = '<div style="text-align:center; padding:10px; color:red;">Lỗi kết nối!</div>';
            }
        }
    }

async function toggleTaskStatus(task, listId, itemElement) {
        // Toggle if user clicks
        const isCurrentlyDone = (task.status === 'completed');
        const newStatus = isCurrentlyDone ? 'needsAction' : 'completed';

        // Optimistic UI update for immediate response without reloading the whole list
        task.status = newStatus;
        if (newStatus === 'completed') {
            itemElement.classList.add('done');
            const gif = itemElement.querySelector('.task-gif-marker');
            if (gif) gif.classList.add('done');

            // Prevent cheat: Only reward once per task
            let rewardedTasks = [];
            try { rewardedTasks = JSON.parse(localStorage.getItem('rewarded_tasks') || '[]'); } catch(e) {}

            // Update: Award coin for completing an individual task 
            if (!rewardedTasks.includes(task.id) && typeof window.RPG !== 'undefined') {
                rewardedTasks.push(task.id);
                localStorage.setItem('rewarded_tasks', JSON.stringify(rewardedTasks));
                
                // ĐẶC QUYỀN THỎ TRĂNG (BUNNY): Tier 3 - Lucky Buff (10% cơ hội x2 Xu)
                let luckyBonus = 0;
                const bunnyTier = window.RPG.getPetTier ? window.RPG.getPetTier('bunny') : 0;
                
                if (bunnyTier === 3 && Math.random() < 0.1) {
                    luckyBonus = 10; // Thưởng thêm 10 xu nếu may mắn
                    showNoteToast("🐰✨ Thỏ Trăng mang lại vận may: Gấp đôi Xu!");
                }
                
                window.RPG.addReward('TASK_COMPLETE', luckyBonus);
                if (typeof updateRPGUI === 'function') updateRPGUI();
            }
        } else {
            itemElement.classList.remove('done');
            const gif = itemElement.querySelector('.task-gif-marker');
            if (gif) gif.classList.remove('done');
        }

        try {
            await ipcRenderer.invoke('g-update-task-status', task.id, newStatus, listId);
        } catch (error) {
            console.error('Lỗi toggle:', error);
            // Fallback on fail: revert optimistic UI
            task.status = isCurrentlyDone ? 'completed' : 'needsAction';
            if (isCurrentlyDone) {
                itemElement.classList.add('done');
                const cb = itemElement.querySelector('.task-gif-marker');
                if (cb) cb.classList.add('done');
            } else {
                itemElement.classList.remove('done');
                const cb = itemElement.querySelector('.task-gif-marker');
                if (cb) cb.classList.remove('done');
            }
            
            if (!isCurrentlyDone) {
                await ipcRenderer.invoke('g-complete-task', task.id, listId);
            }
        }
    }

    async function handleAddTask() {
        if (!currentListId) return;
        const title = inputNewTask.value.trim();
        if (title) {
            const tempTask = { id: 'temp-' + Date.now(), title: title, status: 'needsAction' };
            
            // 1. Optimistic UI Update
            inputNewTask.value = '';
            
            // Remove "Empty" message if it exists
            if (taskListDiv.innerHTML.includes('Chưa có việc gì')) taskListDiv.innerHTML = '';
            
            const item = document.createElement('div');
            item.className = `task-item`;
            item.innerHTML = `
                <div class="task-checkbox"></div>
                <div class="task-title">${title}</div>
            `;
            taskListDiv.appendChild(item);
            taskListDiv.scrollTop = taskListDiv.scrollHeight;

            try {
                await ipcRenderer.invoke('g-add-task', title, currentListId);
                // Silent refresh to get real IDs from Google
                loadGoogleTasks(false);
            } catch (error) {
                console.error(error);
                item.style.color = 'red';
                item.querySelector('.task-title').textContent = title + ' (Lỗi thử lại)';
            } finally {
                inputNewTask.focus();
            }
        }
    }

    if (btnAddTask) {
        btnAddTask.addEventListener('click', handleAddTask);
    }
    inputNewTask.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAddTask(); });

    // ESC để đóng overlay
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!createModal.classList.contains('hidden')) {
                createModal.classList.add('hidden');
                ipcRenderer.send('request-focus', 'note', false);
            } else if (!noteView.classList.contains('hidden')) {
                noteView.classList.add('hidden');
                ipcRenderer.send('request-focus', 'note', false);
            }
        }
    });

    window.addEventListener('focus', () => {
        if (typeof window.RPG !== 'undefined') {
            window.RPG.init();
            updateRPGUI();
        }

        // Auto sync lại danh sách Tasks nếu đang không mở modal
        if (noteView.classList.contains('hidden') && createModal.classList.contains('hidden')) {
            loadTaskLists();
        }
    });

    function updateRPGUI() {
        const coinDisplay = document.getElementById('rpg-coins-display');
        if (coinDisplay) coinDisplay.textContent = window.RPG.state.coins;
    }


    const completeFolderBtn = document.getElementById('btn-complete-folder');
    const stampObj = document.getElementById('stamp-animation');
    
    if (completeFolderBtn) {
        completeFolderBtn.addEventListener('click', () => {
            if (!currentListId) return;
            // Check if all tasks are done
            const allTasks = document.querySelectorAll('.task-item');
            const doneTasks = document.querySelectorAll('.task-item.done');
            
            if (allTasks.length === 0) {
                 alert("Danh sách này chưa có nhiệm vụ nào nha!");
                 return;
            }
            if (doneTasks.length < allTasks.length) {
                 alert("Phải hoàn thành 100% nhiệm vụ mới được nộp nha!");
                 return;
            }

            // Award BIG money
            if (typeof window.RPG !== 'undefined') {
                window.RPG.addReward('FOLDER_COMPLETE');
                
                // ĐẶC QUYỀN THỎ TRĂNG (BUNNY): Tier 2 - Thưởng thêm EXP cho Pet
                const bunnyTier = window.RPG.getPetTier ? window.RPG.getPetTier('bunny') : 0;
                if (bunnyTier >= 2) {
                    let petData = JSON.parse(localStorage.getItem('rpg_pet') || '{}');
                    if (petData.species === 'bunny') {
                        petData.exp += 50; // Thưởng 50 EXP trực tiếp cho Thỏ
                        localStorage.setItem('rpg_pet', JSON.stringify(petData));
                        showNoteToast("🐰 Thỏ Trăng nhận thêm 50 XP từ sự chăm chỉ!");
                    }
                }
                
                if (typeof updateRPGUI === 'function') updateRPGUI();
            }

            // Animation stamp
            if (stampObj) {
                stampObj.classList.add('active');
                setTimeout(async () => {
                    stampObj.classList.remove('active');
                    
                    // Auto Delete Folder upon completion animation finishing
                    if (currentListId) {
                        try {
                            const success = await ipcRenderer.invoke('g-remove-tasklist', currentListId);
                            if (success) {
                                document.getElementById('note-view').classList.add('hidden');
                                loadTaskLists();
                            }
                        } catch (e) {
                            console.error('Failed to delete folder:', e);
                        }
                    }
                    
                }, 2000);
            }

            completeFolderBtn.disabled = true;
            completeFolderBtn.textContent = "ĐÃ HOÀN THÀNH NHIỆM VỤ!";
        });
    }

    // =============== ĐẶC QUYỀN THỎ TIER 3: ĐỔI MÀU LINH HOẠT ===============
    const btnChangeColor = document.getElementById('btn-change-color');
    const editColorPicker = document.getElementById('edit-color-picker');

    if (btnChangeColor) {
        btnChangeColor.addEventListener('click', () => {
            editColorPicker.classList.toggle('hidden');
            if (!editColorPicker.classList.contains('hidden')) {
                renderEditColorPicker();
            }
        });
    }

    function renderEditColorPicker() {
        const container = document.getElementById('edit-color-options');
        if (!container) return;
        container.innerHTML = '';
        
        container.style.display = 'flex';
        container.style.flexWrap = 'wrap';
        container.style.gap = '8px';
        container.style.justifyContent = 'center';
        container.style.padding = '10px';
        container.style.background = 'rgba(0,0,0,0.03)';
        container.style.borderRadius = '4px';
        container.style.marginBottom = '10px';
        
        const current = folderColors[currentListId] || {};
        
        PALETTE.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'color-option' + (current.bg === item.bg ? ' active' : '');
            div.style.backgroundColor = item.bg;
            div.style.width = '24px';
            div.style.height = '24px';
            
            div.onclick = () => {
                folderColors[currentListId] = item;
                localStorage.setItem('folder_colors', JSON.stringify(folderColors));
                renderEditColorPicker();
                loadTaskLists(); 
            };
            container.appendChild(div);
        });
    }

});


// ANIMATION THO CUTE (Fix DOM Load)
document.addEventListener('DOMContentLoaded', () => {
    const rabbit = document.getElementById("rabbit-mascot");
    const speechBubble = document.getElementById("speech-bubble");

    if (!rabbit) return;

    const states = {
        1: [
            "Thư giãn xíu đi sếp! ☕",
            "Uống miếng nước, ăn miếng bánh nha! 🥕",
            "Đang nghỉ ngơi mà cũng phá nữa! 🎮",
            "Xả hơi tí cho đỡ căng thẳng nè... 💆"
        ],
        2: [
            "Khò khò... zZz...",
            "Trời đánh tránh thỏ đang ngủ nha! 😴",
            "Buồn ngủ quá... oáp...",
            "Đừng đánh thức tui mà... 💤"
        ],
        3: [
            "Cố lên nha, sắp xong rồi! 💻",
            "Thỏ đang code phụ sếp đây! 🔥",
            "Chạy deadline nào sếp ơi! 📝",
            "Tập trung cao độ! Đừng lướt điện thoại nữa! 🚀"
        ]
    };

    let currentAnim = 1;
    const animGifs = {
        'break': "rabbit-coffee.gif",
        'idle': "rabbit-sleep.gif",
        'work': "rabbit-work.gif"
    };
    const stateNumbers = { 'break': 1, 'idle': 2, 'work': 3 };

    function updateMascotSync(status) {
        if (!status) status = localStorage.getItem('pomo_status') || 'idle';
        rabbit.src = animGifs[status] || animGifs['idle'];
        showRandomQuote(stateNumbers[status] || 2);
    }

    // Direct IPC Synchronization - Much more robust than localStorage
    ipcRenderer.on('pomo-sync', (e, state) => {
        let status = 'idle';
        if (state.isRunning) {
            status = state.isBreak ? 'break' : 'work';
        }
        updateMascotSync(status);
        // Persist for initial page loads
        localStorage.setItem('pomo_status', status);
    });

    // Observe changes from other sources if any
    window.addEventListener('storage', (e) => {
        if (e.key === 'pomo_status') updateMascotSync();
    });
    
    // Initial sync
    updateMascotSync();

    rabbit.addEventListener("click", (e) => {
        // Prevent blurring of input fields when clicking mascot
        e.preventDefault();
        e.stopPropagation();

        const status = localStorage.getItem('pomo_status') || 'idle';
        showRandomQuote(stateNumbers[status] || 2);
        
        // Trigger bounce animation by toggling class
        rabbit.classList.remove("jump");
        void rabbit.offsetWidth; // Trigger reflow
        rabbit.classList.add("jump");
    });

    function showRandomQuote(state) {
        if (!speechBubble) return;
        const quotes = states[state] || states[1];
        const randomIndex = Math.floor(Math.random() * quotes.length);    
        speechBubble.textContent = quotes[randomIndex];
        speechBubble.classList.remove("hidden");
        speechBubble.style.display = "block";

        setTimeout(() => {
            speechBubble.classList.add("hidden");
        }, 4000);
    }

    setInterval(() => {
        let vw = document.getElementById("note-view");
        let modal = document.getElementById("create-modal");
        
        if ((vw && vw.classList.contains("hidden")) && (modal && modal.classList.contains("hidden"))) {
            const status = localStorage.getItem('pomo_status') || 'idle';
            showRandomQuote(stateNumbers[status] || 2);
        }
    }, 25000);
});

window.RPG.onStateChange = (newState) => { 
    const coinDisplay = document.getElementById('rpg-coins-display'); 
    if (coinDisplay) coinDisplay.textContent = newState.coins || 0; 
};

// Fallback interval
setInterval(() => {
    if (typeof window.RPG !== 'undefined' && window.RPG.state && typeof window.RPG.state.coins !== 'undefined') {
        const cd = document.getElementById('rpg-coins-display');
        if (cd && cd.textContent !== String(window.RPG.state.coins)) {
            cd.textContent = window.RPG.state.coins;
        }
    }
}, 1000);
