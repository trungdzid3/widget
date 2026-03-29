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

// Dá»¯ liá»‡u LocalStorage -> CHUYá»‚N QUA Sá»¬ Dá»¤NG RPG MODULE
let tasks = []; // Load 100% tá»« Google Cloud API

const CLASSES = [
    { maxLv: 5, name: 'TÃ¢n Binh', avatar: 'ðŸ‘¶' },
    { maxLv: 10, name: 'DÃ¢n LÃ ng', avatar: 'ðŸ§‘â€ðŸŒ¾' },
    { maxLv: 20, name: 'Kiáº¿m KhÃ¡ch', avatar: 'ðŸ¤º' },
    { maxLv: 35, name: 'Chiáº¿n Binh', avatar: 'âš”ï¸' },
    { maxLv: 50, name: 'DÅ©ng SÄ©', avatar: 'ðŸ›¡ï¸' },
    { maxLv: 80, name: 'Hiá»‡p SÄ©', avatar: 'ðŸŽ' },
    { maxLv: 999, name: 'Äáº¡i Anh HÃ¹ng', avatar: 'ðŸ‘‘' }
];

function updateStats() {
    // Láº¥y dá»¯ liá»‡u tá»« RPG System thay vÃ¬ tá»± tÃ­nh
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

// Hook vÃ o RPG System khi cÃ³ thay Ä‘á»•i tá»« nÆ¡i khÃ¡c
RPG.onStateChange = (newState) => {
    updateStats();
};


// ---------------- LÃµi GOOGLE TASKS ----------------
ipcRenderer.on('google-ready', () => {
    loadGoogleTasks();

    // Tá»° Äá»˜NG Äá»’NG Bá»˜ SIÃŠU NHáº¸ BACKGROUND (20s / láº§n - Tá»I Æ¯U Cá»°C Äáº I CHO RAM/CPU/PIN)
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

        // 1. RÃ² tÃ¬m xem cÃ³ Task Má»šI nÃ o Ä‘Æ°á»£c thÃªm tá»« Äiá»‡n thoáº¡i khÃ´ng?
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

        // 2. Tra soÃ¡t xem cÃ³ Task nÃ o bá»‹ XOÃ tá»« Äiá»‡n thoáº¡i khÃ´ng?
        const currentIds = gTasks.map(gt => gt.id);
        for (let i = tasks.length - 1; i >= 0; i--) {
            // Loáº¡i bá» cÃ¡c task áº¢o (vá»«a khá»Ÿi táº¡o chÆ°a ká»‹p nháº£ mÃ£)
            if (tasks[i].id !== 'loading' && !currentIds.includes(tasks[i].id)) {
                tasks.splice(i, 1);
                hasChanges = true;
            }
        }

        // Chá»‰ Váº½ láº¡i Render khi phÃ¡t hiá»‡n sá»± báº¥t Ä‘á»‘i xá»©ng Ä‘á»ƒ trÃ¡nh Giáº­t (Flicker) RAM
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
        del.innerText = 'âœ–';
        del.title = 'PhÃ³ng thÃ­ch nhiÃªm vá»¥ (XoÃ¡ VÄ©nh Viá»…n)';
        del.onclick = (e) => { e.stopPropagation(); deleteTask(i); };

        item.appendChild(cb);
        item.appendChild(txt);
        item.appendChild(del);
        taskListEl.appendChild(item);
    });
}

async function toggleTask(i) {
    if (tasks[i].id === 'loading' || tasks[i].done) return; // KhoÃ¡ tÆ°Æ¡ng tÃ¡c náº¿u Ä‘Ã£ Click rá»“i

    // 1. Gáº¡ch bá» ngay láº­p tá»©c (Checkmark)
    tasks[i].done = true;
    renderTasks();

    // 2. Trao thÆ°á»Ÿng báº¡o kÃ­ch EXP â€” Kiá»ƒm tra buff tá»« Tinh Linh ThÃº
    // Gá»i tháº³ng vÃ o RPG System
    const reward = RPG.addReward('TASK_COMPLETE');
    if (reward) updateStats();

    // 3. Triá»ƒn khai Lá»‡nh API gá»­i lÃªn MÃ¡y chá»§ Google
    const targetId = tasks[i].id;
    await ipcRenderer.invoke('g-complete-task', targetId);

    // 4. Cho ngÆ°á»i dÃ¹ng ngáº¯m thÃ nh quáº£ 1.2 GiÃ¢y rá»“i Bá»C HÆ I hoÃ n toÃ n
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

    // LÆ°u táº¡m id rá»“i Cáº¡o ngay láº­p tá»©c trÃªn UI Offline lÃ m Optimistic Render
    const targetId = tasks[i].id;
    tasks.splice(i, 1);
    renderTasks();

    // Gá»­i tÃ­n hiá»‡u huá»· tiÃªu thá»¥ lÃªn Google Server
    await ipcRenderer.invoke('g-remove-task', targetId);
}

async function addTask() {
    const v = inputEl.value.trim();
    if (!v) return;
    inputEl.value = '';

    // Optimistic Update: ThÃªm Nhiá»‡m Vá»¥ áº¢o chá» láº¥y ID
    const tempIndex = tasks.length;
    tasks.push({ id: 'loading', text: v, done: false });
    renderTasks();
    setTimeout(() => taskListEl.scrollTop = taskListEl.scrollHeight, 50);

    // Truyá»n lá»‡nh API thá»±c thá»¥
    const gTask = await ipcRenderer.invoke('g-add-task', v);
    if (gTask) {
        // Khi Google nháº£ MÃ£ ID tháº­t vá», khoÃ¡ nÃ³ vÃ o Máº£ng vÃ  Gá»¡ Loading
        tasks[tempIndex].id = gTask.id;
        tasks[tempIndex].text = v;
        renderTasks();
    }
}

addBtn.onclick = addTask;
inputEl.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTask();
});

// Cáº§u Ná»‘i KhÃ´ng Gian MÃ¡y Chá»§ Ná»™i Bá»™ - RPG System tá»± lo sync!
// Cháº¡y hÃ m náº¡p cÆ¡ sá»Ÿ EXP
setTimeout(updateStats, 100);
// Load Nhiá»‡m vá»¥ má»“i
loadGoogleTasks();






