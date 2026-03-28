const playBtn = document.getElementById('pomo-play');
const resetBtn = document.getElementById('pomo-reset');
const timerDisplay = document.getElementById('timer');
const stageDisplay = document.getElementById('plant-stage');
const msgBox = document.getElementById('pomo-msg');
const taskSelector = document.getElementById('task-type');
const audioPlayer = document.getElementById('lofi-audio');

const volSlider = document.getElementById('vol-slider');
const volIcon = document.getElementById('vol-icon');

const { ipcRenderer } = require('electron');

let musicRadios = [
    'https://streams.ilovemusic.de/iloveradio17.mp3',
    'https://streams.ilovemusic.de/iloveradio10.mp3',
    'https://cdn.stream.chillhop.com/audio/chillhop-stream-live-128.mp3',
    'https://stream.zeno.fm/f3wvbbqmdg8uv'
];

const sunnyPlaylists = [
    'https://cdn.stream.chillhop.com/audio/chillhop-stream-live-128.mp3',
    'https://streams.ilovemusic.de/iloveradio17.mp3',
];

const rainyPlaylists = [
    'https://stream.zeno.fm/f3wvbbqmdg8uv', 
    'https://streams.ilovemusic.de/iloveradio10.mp3'
];

ipcRenderer.on('weather-impact', (e, data) => {
    if (data.fx.includes('rain') || data.fx === 'thunder') {
        musicRadios = rainyPlaylists;
    } else {
        musicRadios = sunnyPlaylists;
    }
});

let isMuted = false;
audioPlayer.volume = volSlider.value / 100;

volSlider.addEventListener('input', (e) => {
    if (!isMuted) {
        audioPlayer.volume = e.target.value / 100;
        updateVolumeIcon();
    }
});

volIcon.addEventListener('click', () => {
    isMuted = !isMuted;
    if (isMuted) {
        audioPlayer.volume = 0;
        volIcon.innerText = '🔇';
    } else {
        audioPlayer.volume = volSlider.value / 100;
        updateVolumeIcon();
    }
});

function updateVolumeIcon() {
    const v = volSlider.value;
    if (v == 0) volIcon.innerText = '🔇';
    else if (v < 50) volIcon.innerText = '🔉';
    else volIcon.innerText = '🔊';
}

const taskData = {
    egg: { time: 15 * 60, emojis: ['🥚', '🐣', '🐥', '🐔', '🐉', '🐉🔥'], name: 'Hỏa Rồng' },
    plant: { time: 25 * 60, emojis: ['🌱', '🌿', '🪴', '🌳', '🌹', '🌺'], name: 'Hoa Lofi' },
    house: { time: 45 * 60, emojis: ['🧱', '🪵', '🏗️', '🏠', '🏰', '🏰🎆'], name: 'Lâu Đài Vàng' },
    potion: { time: 60 * 60, emojis: ['💧', '🧪', '🥘', '🔮', '✨', '🧙‍♂️🌟'], name: 'Tiên Đan' }
};

let timer = null;
let currentTask = 'plant';
let POMO_TIME = taskData[currentTask].time;
let timeLeft = POMO_TIME;
let isRunning = false;

// Hệ thống Chu kì Gián Đoạn (Giải lao)
let isBreakMode = false;
const BREAK_TIME = 5 * 60; // Nghỉ 5 phút theo chuẩn y khoa Pomodoro

function updateDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${m}:${s}`;

    const emojis = taskData[currentTask].emojis;
    const percent = 1 - (timeLeft / POMO_TIME);

    let idx = Math.floor(percent * emojis.length);
    if (timeLeft > 0 && idx >= emojis.length - 1) idx = emojis.length - 2;
    if (timeLeft === 0) idx = emojis.length - 1;

    stageDisplay.innerText = emojis[idx];
}

function updateDisplayForBreak() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    timerDisplay.innerText = `${m}:${s}`;
    stageDisplay.innerText = '☕'; // Tách Trà Giải Lao
}

function finishCycle() {
    clearInterval(timer);
    isRunning = false;
    stageDisplay.classList.remove('breath');
    audioPlayer.pause();
    taskSelector.disabled = false; // Cho phep đổi Theme cày cuốc thoải mái lúc đứng yên

    if (!isBreakMode) {
        // Vừa chốt Đơn Chu kỳ Cày cuốc:
        const emojis = taskData[currentTask].emojis;
        timerDisplay.innerText = `00:00`;
        stageDisplay.innerText = emojis[emojis.length - 1]; // Khoá khung hình ở Sinh vật xịn nhất

        // TRAO THƯỞNG RPG
        let rewardType = 'POMODORO_25';
        if (taskData[currentTask].time >= 40 * 60) rewardType = 'POMODORO_50';
        
        const result = RPG.addReward(rewardType);
        
        if (result) {
            msgBox.innerText = `+${result.gainedXP} EXP | +${result.gainedCoins} Xu ! 🎇`;
        } else {
             msgBox.innerText = `Được 1 ${taskData[currentTask].name}! 🎇`;
        }

        playBtn.innerText = 'Giải Lao 5p';

        isBreakMode = true;
        timeLeft = BREAK_TIME; // Mồi trước 5 Phút nhưng KHÔNG bắt đầu ngay mà đợi người dùng bấm Play
    } else {
        // Vừa chốt Đơn Giải Lao:
        msgBox.innerText = `Nghỉ đẫ chưa? Cày tiếp!`;
        playBtn.innerText = 'Tiếp Tục';

        isBreakMode = false;
        timeLeft = taskData[currentTask].time;
        updateDisplay(); // Phục hồi hình dạng Mầm Cây Level 1 để báo hiệu Trạng Thái Chuẩn bị Cày Focus
    }
}

function tick() {
    if (timeLeft > 0) {
        timeLeft--;
        if (isBreakMode) updateDisplayForBreak();
        else updateDisplay();
    } else {
        finishCycle();
    }
}

taskSelector.addEventListener('change', (e) => {
    currentTask = e.target.value;
    POMO_TIME = taskData[currentTask].time;
    timeLeft = POMO_TIME;
    isBreakMode = false; // Ngắt Chế độ Nghỉ nếu họ rắp tâm chọn cày Đồ thị Khác.

    updateDisplay();
    msgBox.innerText = `Chờ lệnh...`;
    playBtn.innerText = 'Bắt Đầu';
});

playBtn.addEventListener('click', () => {
    if (!isRunning && timeLeft > 0) {
        isRunning = true;
        taskSelector.disabled = true; // Khóa thay đổi
        timer = setInterval(tick, 1000);

        if (isBreakMode) {
            playBtn.innerText = 'Dừng Nghỉ';
            msgBox.innerText = 'Vươn vai thả lỏng...';
            updateDisplayForBreak(); // Chuyển mặt thỏ thành Cốc Trà Coffee
            stageDisplay.classList.add('breath');
        } else {
            playBtn.innerText = 'Dừng';
            msgBox.innerText = 'Đang tiến hóa...';
            stageDisplay.classList.add('breath');

            // Random Radio Music nạp đạn
            if (timeLeft === POMO_TIME) {
                const randomRadio = musicRadios[Math.floor(Math.random() * musicRadios.length)];
                audioPlayer.src = randomRadio;
            }
            audioPlayer.play().catch(e => console.log("Audio block:", e));
        }

    } else if (isRunning) {
        isRunning = false;
        clearInterval(timer);

        if (isBreakMode) {
            playBtn.innerText = 'Tiếp Nghỉ';
            msgBox.innerText = 'Vẫn chưa hết giải lao!';
        } else {
            playBtn.innerText = 'Tiếp';
            msgBox.innerText = 'Đang lười hả?';
            audioPlayer.pause();
        }
        stageDisplay.classList.remove('breath');
    }
});

resetBtn.addEventListener('click', () => {
    let isPenalty = false;
    if (!isBreakMode && timeLeft < POMO_TIME && timeLeft > 0) {
        isPenalty = true;
        if (typeof RPG !== 'undefined') {
            RPG.state.currentXP -= 5;
            if (RPG.state.currentXP < 0) RPG.state.currentXP = 0;
            RPG.save();
        }
        msgBox.innerText = 'Trừ 5 EXP! 🥀';
    } else {
        msgBox.innerText = 'Đã đặt lại!';
    }

    isRunning = false;
    isBreakMode = false; // Cancel Giải Lao ngay lập tức
    clearInterval(timer);
    taskSelector.disabled = false; // Mở khoá đổi cày

    currentTask = taskSelector.value;
    POMO_TIME = taskData[currentTask].time;
    timeLeft = POMO_TIME;

    playBtn.innerText = 'Bắt Đầu';
    stageDisplay.classList.remove('breath');
    
    if (isPenalty) {
        stageDisplay.innerText = '🥀';
    } else {
        updateDisplay();
    }

    audioPlayer.pause();
});

updateDisplay();
