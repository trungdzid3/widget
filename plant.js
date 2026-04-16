
const playBtn = document.getElementById('pomo-play');
const resetBtn = document.getElementById('pomo-reset');
const timerDisplay = document.getElementById('timer');
const stageDisplay = document.getElementById('plant-stage');
const msgBox = document.getElementById('pomo-msg');
const taskSelector = document.getElementById('task-type');
const audioPlayer = document.getElementById('lofi-audio');
const volSlider = document.getElementById('vol-slider');
const volIcon = document.getElementById('vol-icon');

// UI Điều khiển mới
const musicBar = document.getElementById('music-bar');
const nowPlaying = document.getElementById('now-playing');
const musicPrev = document.getElementById('music-prev');
const musicNext = document.getElementById('music-next');
const timeMinus = document.getElementById('time-minus');
const timePlus = document.getElementById('time-plus');

const { ipcRenderer } = require('electron');

// ===== DỮ LIỆU ÂM NHẠC ĐA TẦNG (CAT TIER 2) =====
const musicGenres = {
    lofi: [
        { name: 'Lofi Chill 1', url: 'https://cdn.stream.chillhop.com/audio/chillhop-stream-live-128.mp3' },
        { name: 'Lofi Radio 2', url: 'https://streams.ilovemusic.de/iloveradio17.mp3' },
        { name: 'Classic Lofi', url: 'https://stream.zeno.fm/f3wvbbqmdg8uv' },
        { name: 'Relaxing Beat', url: 'http://stream.psychomed.gr/jazz.mp3' }
    ],
    jazz: [
        { name: 'Smooth Jazz', url: 'http://stream.psychomed.gr/jazz.mp3' },
        { name: 'Midnight Cafe', url: 'https://streams.ilovemusic.de/iloveradio10.mp3' }
    ],
    nature: [
        { name: 'Rainy Night', url: 'https://stream.zeno.fm/f3wvbbqmdg8uv' },
        { name: 'Forest Bird', url: 'https://stream.zeno.fm/f3wvbbqmdg8uv' } 
    ],
    coding: [
        { name: 'Cyberpunk Radio', url: 'https://nightride.fm/stream/nightride.m4a' },
        { name: 'Syntax Stream', url: 'https://nightride.fm/stream/nightride.m4a' }
    ]
};

let currentGenre = 'lofi';
let currentTrackIdx = 0;
let musicAutoRotationTimer = null; // Quản lý xoay vòng bài hát tự động
let isTestMode = false;

// ===== KHỞI TẠO TIẾN HÓA =====
function checkPetPrivileges() {
    const catTier = RPG.getOwnedPetTier('cat');

    // Thanh nhạc: Luôn hiển thị theo ý Boss
    musicBar.classList.remove('hidden');

    // Chỉ Mèo Tier 3 mới hiện nút chuyển bài thủ công
    if (catTier >= 3 || isTestMode) {
        musicNext && musicNext.classList.remove('hidden');
        musicPrev && musicPrev.classList.remove('hidden');
    } else {
        musicNext && musicNext.classList.add('hidden');
        musicPrev && musicPrev.classList.add('hidden');
    }
}

// ===== LOGIC ÂM NHẠC =====
function playCurrentTrack() {
    if (!isRunning) return; 
    
    if (musicAutoRotationTimer) clearInterval(musicAutoRotationTimer);
    
    const catTier = RPG.getOwnedPetTier('cat');
    const tracks = musicGenres[currentGenre];
    const track = tracks[currentTrackIdx];
    
    const statusText = `Đang phát: ${track.name}`;
    nowPlaying.innerText = `Radio: ${track.name}`;
    msgBox.innerText = statusText; 
    
    audioPlayer.src = track.url;
    audioPlayer.play().catch(e => console.log("Audio block:", e));
    
    // CHỈ TIER 3 MỚI HỖ TRỢ XOAY VÒNG TỰ ĐỘNG
    if (catTier >= 3 || isTestMode) {
        musicAutoRotationTimer = setInterval(() => {
            nextTrack();
        }, 12 * 60 * 1000);
    }
}

function nextTrack() {
    const catTier = RPG.getOwnedPetTier('cat');
    
    // Tier 1: Chỉ được nghe Lofi
    if (catTier < 2 && !isTestMode) currentGenre = 'lofi';
    
    const tracks = musicGenres[currentGenre];
    let newIdx;
    
    if (catTier === 1 && currentGenre === 'lofi' && !isTestMode) {
        // Tier 1: Chỉ chọn 1 trong 2 bài đầu
        newIdx = Math.floor(Math.random() * 2);
    } else {
        // Tier 2+: Random toàn bộ trong thể loại
        do {
            newIdx = Math.floor(Math.random() * tracks.length);
        } while (newIdx === currentTrackIdx && tracks.length > 1);
    }
    
    currentTrackIdx = newIdx;
    playCurrentTrack();
}

if (musicNext) musicNext.onclick = nextTrack;
if (musicPrev) musicPrev.onclick = () => {
    const catTier = RPG.getOwnedPetTier('cat');
    if (catTier >= 3 || isTestMode) nextTrack(); 
};

if (nowPlaying) nowPlaying.onclick = () => {
    const catTier = RPG.getOwnedPetTier('cat');
    if (catTier < 2 && !isTestMode) {
        msgBox.innerText = "Yêu cầu Mèo Thần Tier 2 để mở khóa thể loại mới! 🐱🎻";
        return;
    }

    const genres = Object.keys(musicGenres);
    const gIdx = (genres.indexOf(currentGenre) + 1) % genres.length;
    currentGenre = genres[gIdx];
    currentTrackIdx = 0;
    msgBox.innerText = `Thể loại: ${currentGenre.toUpperCase()} 🎧`;
    nextTrack(); // Random luôn bài mới khi đổi thể loại
};


// ===== LOGIC MASCOT POMODORO =====
const taskData = {
    egg: { time: 15 * 60, emojis: ['🥚', '🐣', '🔥', '🦕', '🐉', '🐲'], name: 'Hỏa Rồng' },
    plant: { time: 25 * 60, emojis: ['🌱', '🌿', '🪴', '🌳', '🌻', '🌸'], name: 'Hoa Lofi' },
    house: { time: 45 * 60, emojis: ['🧱', '🏗️', '🏠', '🏡', '🏰', '🏯'], name: 'Lâu Đài Vàng' },
    potion: { time: 60 * 60, emojis: ['💧', '🧪', '🔮', '🏺', '✨', '🧙‍♂️'], name: 'Tiên Đan' }
};

let timeLeft = 1500;
let isRunning = false;
let isBreakMode = false;
let currentTask = 'plant';
let POMO_TIME = 1500;

if (timePlus) timePlus.onclick = () => {
    if (isRunning) return;
    timeLeft += 60;
    if (timeLeft > 180 * 60) timeLeft = 180 * 60;
    updateDisplay();
    syncPomoToMain();
};
if (timeMinus) timeMinus.onclick = () => {
    if (isRunning) return;
    timeLeft -= 60;
    if (timeLeft < 60) timeLeft = 60;
    POMO_TIME = timeLeft;
    updateDisplay();
    syncPomoToMain();
};

function syncPomoToMain() {
    ipcRenderer.send('pomo-command', 'reset', { 
        time: timeLeft,
        type: currentTask
    });
}

if (taskSelector) {
    taskSelector.addEventListener('change', (e) => {
        currentTask = e.target.value;
        timeLeft = taskData[currentTask].time;
        POMO_TIME = timeLeft; 
        updateDisplay();
        syncPomoToMain();
    });
}

// ===== REWARDS & SYNC =====
ipcRenderer.on('pomo-sync', (e, state) => {
    timeLeft = state.timeLeft;
    isRunning = state.isRunning;
    isBreakMode = state.isBreak;
    isTestMode = state.isTestMode || false;
    
    currentTask = state.type;
    isTestMode = state.isTestMode || false;
    
    // ĐỒNG BỘ GUI: Đảm bảo thanh chọn task khớp với trạng thái hệ thống
    if (taskSelector && state.type) taskSelector.value = state.type;
    
    checkPetPrivileges();

    if (isRunning) {
        if (POMO_TIME <= 0) POMO_TIME = taskData[currentTask]?.time || 1500; 
        taskSelector.disabled = true;
        stageDisplay.classList.add('breath');
        playBtn.innerText = 'Dừng';
        playBtn.classList.replace('btn-start', 'btn-stop');
    } else {
        taskSelector.disabled = false;
        stageDisplay.classList.remove('breath');
        playBtn.innerText = 'Bắt Đầu';
        playBtn.classList.replace('btn-stop', 'btn-start');
    }
    
    if (timeLeft <= 0 && isRunning === false && state && state.startTime !== 0) {
        finishCycleLocally();
    }

    if (isBreakMode) updateDisplayForBreak();
    else updateDisplay();
});

function updateDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${m}:${s}`;

    const taskInfo = taskData[currentTask] || taskData['plant'];
    const emojis = taskInfo.emojis;
    const baseTime = (isRunning && POMO_TIME > 0) ? POMO_TIME : taskInfo.time;
    const percent = 1 - (timeLeft / baseTime); 

    let idx = Math.floor(percent * emojis.length);
    if (timeLeft > 0 && idx >= emojis.length - 1) idx = emojis.length - 2;
    if (timeLeft === 0) idx = emojis.length - 1;
    if (idx < 0) idx = 0;

    stageDisplay.innerText = emojis[idx] || '🌱';
}

function updateDisplayForBreak() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${m}:${s}`;
    stageDisplay.innerText = '☕'; 
}

function finishCycleLocally() {
    stageDisplay.classList.remove('breath');
    audioPlayer.pause();
    if (musicAutoRotationTimer) clearInterval(musicAutoRotationTimer);
    taskSelector.disabled = false;

    if (!isBreakMode) {
        const rewardKey = (timeLeft >= 40 * 60) ? 'POMODORO_50' : 'POMODORO_25';
        const result = RPG.addReward(rewardKey);
        if (result) {
            msgBox.innerText = `+${result.gainedXP} EXP | +${result.gainedCoins} Xu ! 🎇`;
        }
    }
}

playBtn.addEventListener('click', () => {
    if (!isRunning) {
        POMO_TIME = timeLeft; 
        isRunning = true; // ÉP TRẠNG THÁI CHẠY NGAY LẬP TỨC ĐỂ NHẠC PHÁT KHÔNG TRỄ
        ipcRenderer.send('pomo-command', 'start', { time: timeLeft, isBreak: isBreakMode, type: currentTask });
        // TỰ ĐỘNG RANDOM BÀI ĐẦU TIÊN
        nextTrack(); 
    } else {
        ipcRenderer.send('pomo-command', 'pause');
        audioPlayer.pause();
        if (musicAutoRotationTimer) clearInterval(musicAutoRotationTimer);
    }
});

resetBtn.addEventListener('click', () => {
    ipcRenderer.send('pomo-command', 'reset', { time: taskData[currentTask].time });
    audioPlayer.pause();
    if (musicAutoRotationTimer) clearInterval(musicAutoRotationTimer);
});

ipcRenderer.on('weather-impact', (e, data) => {
    if (data.fx.includes('rain')) currentGenre = 'nature';
    else currentGenre = 'lofi';
    if (isRunning) playCurrentTrack();
});

document.addEventListener('DOMContentLoaded', () => {
    const inlineInput = document.getElementById('inline-timer-input');
    
    // Nhấn vào số để hiện input chỉnh phút
    timerDisplay.onclick = () => {
        if (isRunning) return;
        timerDisplay.classList.add('hidden');
        inlineInput.classList.remove('hidden');
        inlineInput.value = Math.floor(timeLeft / 60);
        inlineInput.focus();
    };

    const saveInlineTime = () => {
        const val = parseInt(inlineInput.value);
        if (val >= 1 && val <= 180) {
            timeLeft = val * 60;
            POMO_TIME = timeLeft;
            updateDisplay();
            syncPomoToMain();
        }
        inlineInput.classList.add('hidden');
        timerDisplay.classList.remove('hidden');
    };

    inlineInput.onblur = saveInlineTime;
    inlineInput.onkeydown = (e) => { if (e.key === 'Enter') saveInlineTime(); };
    
    // KHỞI TẠO ĐỒNG BỘ: Đảm bảo Mascot hiện đúng cây theo thanh chọn ngay từ đầu
    if (taskSelector) {
        currentTask = taskSelector.value;
        timeLeft = taskData[currentTask].time;
    }

    RPG.init();
    checkPetPrivileges();
    updateDisplay();
});

ipcRenderer.send('pomo-command', 'sync');
