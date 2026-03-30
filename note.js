const { ipcRenderer } = require('electron');

const taskListEl = document.getElementById('task-list');
const inputEl = document.getElementById('new-task');
const addBtn = document.getElementById('add-btn');

const lvNumEl = document.getElementById('lv-num');
const classNameEl = document.getElementById('class-name');
const expFillEl = document.getElementById('exp-fill');
const expCurEl = document.getElementById('exp-current');
const expMaxEl = document.getElementById('exp-max');
const coinEl = document.getElementById('player-coins'); // NEW
const avatarEl = document.querySelector('.avatar');

// Dữ liệu LocalStorage -> CHUYỂN QUA SỬ DỤNG RPG MODULE
let tasks = []; // Load 100% từ Google Cloud API

const CLASSES = [
    { maxLv: 5, name: 'Tân Binh', avatar: '👶' },
    { maxLv: 10, name: 'Dân Làng', avatar: '🧑‍🌾' },
    { maxLv: 20, name: 'Kiếm Khách', avatar: '🤺' },
    { maxLv: 35, name: 'Chiến Binh', avatar: '⚔️' },
    { maxLv: 50, name: 'Dũng Sĩ', avatar: '🛡️' },
    { maxLv: 80, name: 'Hiệp Sĩ', avatar: '🐎' },
    { maxLv: 999, name: 'Đại Anh Hùng', avatar: '👑' }
];

function updateStats() {
    // Lấy dữ liệu từ RPG System thay vì tự tính
    const state = RPG.state;
    
    // Check Level Up visual effect
    if (lvNumEl.innerText != state.level) {
        avatarEl.style.transform = 'scale(1.5) rotate(10deg)';
        setTimeout(() => avatarEl.style.transform = 'scale(1) rotate(0deg)', 300);
    }

    let currentClass = CLASSES[CLASSES.length - 1];
    for (let c of CLASSES) {
        if (state.level <= c.maxLv) { currentClass = c; break; }
    }

    lvNumEl.innerText = state.level;
    classNameEl.innerText = currentClass.name;
    avatarEl.innerText = currentClass.avatar;
    coinEl.innerText = state.coins;

    expCurEl.innerText = state.currentXP;
    expMaxEl.innerText = state.neededXP;
    expFillEl.style.width = `${RPG.getProgress()}%`;
}

// Hook vào RPG System khi có thay đổi từ nơi khác
RPG.onStateChange = (newState) => {
    updateStats();
};


// ---------------- Lõi GOOGLE TASKS ----------------
ipcRenderer.on('google-ready', () => {
    loadGoogleTasks();

    // TỰ ĐỘNG ĐỒNG BỘ SIÊU NHẸ BACKGROUND (20s / lần - TỐI ƯU CỰC ĐẠI CHO RAM/CPU/PIN)
    setInterval(backgroundSync, 20000);
});

async function loadGoogleTasks() {
    try {
        const gTasks = await ipcRenderer.invoke('g-get-tasks');
        tasks = gTasks.map(t => ({ id: t.id, text: t.title, done: false }));
        renderTasks();
    } catch (error) { }
}

async function backgroundSync() {
    try {
        const gTasks = await ipcRenderer.invoke('g-get-tasks');
        let hasChanges = false;

        // 1. Rò tìm xem có Task MỚI nào được thêm từ Điện thoại không?
        for (let gt of gTasks) {
            const exists = tasks.find(t => t.id === gt.id);
            if (!exists) {
                tasks.push({ id: gt.id, text: gt.title, done: false });
                hasChanges = true;
            } else if (exists.text !== gt.title) {
                exists.text = gt.title;
                hasChanges = true;
            }
        }

        // 2. Tra soát xem có Task nào bị XOÁ từ Điện thoại không?
        const currentIds = gTasks.map(gt => gt.id);
        for (let i = tasks.length - 1; i >= 0; i--) {
            // Loại bỏ các task Ảo (vừa khởi tạo chưa kịp nhả mã)
            if (tasks[i].id !== 'loading' && !currentIds.includes(tasks[i].id)) {
                tasks.splice(i, 1);
                hasChanges = true;
            }
        }

        // Chỉ Vẽ lại Render khi phát hiện sự bất đối xứng để tránh Giật (Flicker) RAM
        if (hasChanges) renderTasks();
    } catch (e) { console.log(e); }
}

function renderTasks() {
    taskListEl.innerHTML = '';

    if (tasks.length === 0) {
        return;
    }

    tasks.forEach((t, i) => {
        const item = document.createElement('div');
        item.className = `task-item ${t.done ? 'completed' : ''}`;

        const cb = document.createElement('div');
        cb.className = 'checkbox';
        cb.onclick = () => toggleTask(i);

        const txt = document.createElement('div');
        txt.className = 'task-text';
        txt.innerText = t.text;
        txt.onclick = () => toggleTask(i);

        const del = document.createElement('button');
        del.className = 'delete-btn';
        del.innerText = '✖';
        del.title = 'Phóng thích nhiêm vụ (Xoá Vĩnh Viễn)';
        del.onclick = (e) => { e.stopPropagation(); deleteTask(i); };

        item.appendChild(cb);
        item.appendChild(txt);
        item.appendChild(del);
        taskListEl.appendChild(item);
    });
}

async function toggleTask(i) {
    if (tasks[i].id === 'loading' || tasks[i].done) return; // Khoá tương tác nếu đã Click rồi

    // 1. Gạch bỏ ngay lập tức (Checkmark)
    tasks[i].done = true;
    renderTasks();

    // 2. Trao thưởng bạo kích EXP — Kiểm tra buff từ Tinh Linh Thú
    // Gọi thẳng vào RPG System
    const reward = RPG.addReward('TASK_COMPLETE');
    if (reward) updateStats();

    // 3. Triển khai Lệnh API gửi lên Máy chủ Google
    const targetId = tasks[i].id;
    await ipcRenderer.invoke('g-complete-task', targetId);

    // 4. Cho người dùng ngắm thành quả 1.2 Giây rồi BỐC HƠI hoàn toàn
    setTimeout(() => {
        const trueIndex = tasks.findIndex(t => t.id === targetId);
        if (trueIndex !== -1) {
            tasks.splice(trueIndex, 1);
            renderTasks();
        }
    }, 1200);
}

async function deleteTask(i) {
    if (tasks[i].id === 'loading') return;

    // Lưu tạm id rồi Cạo ngay lập tức trên UI Offline làm Optimistic Render
    const targetId = tasks[i].id;
    tasks.splice(i, 1);
    renderTasks();

    // Gửi tín hiệu huỷ tiêu thụ lên Google Server
    await ipcRenderer.invoke('g-remove-task', targetId);
}

async function addTask() {
    const v = inputEl.value.trim();
    if (!v) return;
    inputEl.value = '';

    // Optimistic Update: Thêm Nhiệm Vụ Ảo chờ lấy ID
    const tempIndex = tasks.length;
    tasks.push({ id: 'loading', text: v, done: false });
    renderTasks();
    setTimeout(() => taskListEl.scrollTop = taskListEl.scrollHeight, 50);

    // Truyền lệnh API thực thụ
    const gTask = await ipcRenderer.invoke('g-add-task', v);
    if (gTask) {
        // Khi Google nhả Mã ID thật về, khoá nó vào Mảng và Gỡ Loading
        tasks[tempIndex].id = gTask.id;
        tasks[tempIndex].text = v;
        renderTasks();
    }
}

addBtn.onclick = addTask;
inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTask();
});

// Cầu Nối Không Gian Máy Chủ Nội Bộ - RPG System tự lo sync!
// Chạy hàm nạp cơ sở EXP
setTimeout(updateStats, 100);
// Load Nhiệm vụ mồi
loadGoogleTasks();
