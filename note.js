
const { ipcRenderer } = require('electron');

let currentListId = null;

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

                const colors = ['#fff59d', '#ffcc80', '#a5d6a7', '#90caf9', '#ce93d8', '#f48fb1'];
                const borders = ['#fbc02d', '#ef6c00', '#2e7d32', '#1565c0', '#6a1b9a', '#ad1457'];
                const colorIndex = i % colors.length;
                note.style.backgroundColor = colors[colorIndex];
                note.style.borderTopColor = note.style.borderLeftColor = '#fff';
                note.style.borderBottomColor = note.style.borderRightColor = borders[colorIndex];

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
    });

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
                await ipcRenderer.invoke('g-add-tasklist', title);
                createModal.classList.add('hidden');
                ipcRenderer.send('request-focus', 'note', false);
                loadTaskLists();
            } finally {
                btnConfirmFolder.disabled = false;
                btnConfirmFolder.textContent = 'TẠO';
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
            if (confirm('Xóa sổ này trên Google Tasks? Tất cả ghi chú bên trong sẽ biến mất vĩnh viễn.')) {
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
                    <div class="task-title">${task.title}</div>
                `;

                item.addEventListener('click', () => toggleTaskStatus(task, currentListId, item));
                taskListDiv.appendChild(item);
            });
        } else {
            taskListDiv.innerHTML = '<div style="text-align:center; padding:10px; opacity:0.7;">Chưa có việc gì!</div>';
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
                window.RPG.addReward('TASK_COMPLETE');
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
                <div class="task-title">${title} <span style="opacity:0.5; font-size:12px;">...</span></div>
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

    btnAddTask.addEventListener('click', handleAddTask);
    inputNewTask.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleAddTask(); });

    // Gắn window focus để update điểm chéo ứng dụng & sync dữ liệu
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

    
// HỆ THỐNG TINH LINH PET (SPRITES) KÈM LỜI THOẠI
    const petMascot = document.getElementById('pet-mascot');
    const speechBubble = document.getElementById('speech-bubble');

    const petQuotes = [
        "Chăm chỉ làm việc nha chủ nhân! 🍄",
        "Nấm lùn đang tiếp sức nè! ✨",
        "Đừng quên uống nước nhé! 💧",
        "Tích lũy XP để tui mau lớn! 🌿",
        "Có nhiều thẻ màu trên bảng bần đẹp quá! 🎨",
        "Hoàn thành nhiệm vụ để tui biểu diễn nha! 🎈",
        "Buồn ngủ ghê... zZz...",
        "Úm ba la, xua tan mệt mỏi! 🌟"
    ];

    if (petMascot && speechBubble) {
        // Khởi tạo State ban đầu dựa trên Level của RPG
        let stage = 1; 
        
        function updatePetStage() {
            if (typeof window.RPG === 'undefined') return;
            const lvl = window.RPG.state.level || 1;
            if (lvl >= 30) stage = 3; // Hươu
            else if (lvl >= 15) stage = 2; // Sóc
            else stage = 1; // Nấm
            
            // Xóa hết class cũ
            petMascot.className = 'pet-mascot pet-stage' + stage + '-idle';
        }
        
        // Gọi lần đầu
        setTimeout(updatePetStage, 500);
        window.addEventListener('rpg-update', updatePetStage); // Listen ngầm
        
        petMascot.addEventListener('click', () => {
            // Đổi Idle sang Walk/Hop trong vài giây
            const actionClass = (stage === 1) ? 'hop' : (stage === 3 ? 'walk' : 'walk');
            petMascot.className = 'pet-mascot pet-stage' + stage + '-' + actionClass;

            // Nhảy nhẹ một cái khi click
            petMascot.style.transform = 'translateY(-10px)';
            setTimeout(() => {
                petMascot.style.transform = 'translateY(0)';
            }, 150);
            
            setTimeout(() => {
                petMascot.className = 'pet-mascot pet-stage' + stage + '-idle';
            }, 2500);

            showRandomQuote();
        });

        function showRandomQuote() {
            const randomIndex = Math.floor(Math.random() * petQuotes.length);
            speechBubble.textContent = petQuotes[randomIndex];
            speechBubble.style.display = 'block';
            speechBubble.classList.remove('hidden');

            setTimeout(() => {
                speechBubble.classList.add('hidden');
            }, 4000);
        }

        setInterval(() => {
            if (document.getElementById('note-view').classList.contains('hidden') &&
                document.getElementById('create-modal').classList.contains('hidden')) {
                showRandomQuote();
            }
        }, 25000);
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
                 alert("Sổ này chưa có task nào nha!");
                 return;
            }
            if (doneTasks.length < allTasks.length) {
                 alert("Phải hoàn thành 100% công việc mới được đóng dấu!");
                 return;
            }

            // Award BIG money
            if (typeof window.RPG !== 'undefined') {
                window.RPG.addReward('FOLDER_COMPLETE');
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
            completeFolderBtn.textContent = "ĐÃ HOÀN THÀNH SỔ!";
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

    function updateMascotSync() {
        const status = localStorage.getItem('pomo_status') || 'idle';
        rabbit.src = animGifs[status] || animGifs['idle'];
        showRandomQuote(stateNumbers[status] || 2);
    }

    // Observe changes from other windows
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
