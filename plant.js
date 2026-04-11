
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
const musicShuffle = document.getElementById('music-shuffle');
const musicListBtn = document.getElementById('music-list');
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
let isShuffle = false;
let isYouTubeMode = false;
let ytPlayer = null;
let isTestMode = false;
let favoriteAlbums = JSON.parse(localStorage.getItem('yt_albums') || '[]');

// ===== KHỞI TẠO TIẾN HÓA =====
function checkPetPrivileges() {
    // Chỉ cần sở hữu bất kỳ Pet nào đạt Tier, tính năng sẽ mở khóa vĩnh viễn
    const globalTier = RPG.getGlobalMaxTier();
    const mascotTier = RPG.getOwnedPetTier('mascot');

    // Mèo Thần: Nhạc (Giờ đây pet nào cũng dùng được)
    if (globalTier >= 1 || isTestMode) {
        musicBar.classList.remove('hidden');
        musicNext.classList.remove('hidden');
        musicPrev.classList.remove('hidden');
    }
    if (globalTier >= 2 || isTestMode) {
        musicShuffle.classList.remove('hidden');
    }
    if (globalTier >= 3 || isTestMode) {
        musicListBtn.classList.remove('hidden');
    }

    // Mascot: Timer
    // Đã chuyển sang dạng nhấn trực tiếp vào đồng hồ, không cần logic ẩn hiện box cũ
}

// ===== LOGIC ÂM NHẠC =====
function playCurrentTrack() {
    if (!isRunning) return; // Chỉ phát khi đã bấm Bắt Đầu
    if (isYouTubeMode) {
        if (ytPlayer && ytPlayer.playVideo) ytPlayer.playVideo();
        return;
    }
    
    const tracks = musicGenres[currentGenre];
    const track = tracks[currentTrackIdx];
    nowPlaying.innerText = `Radio: ${track.name}`;
    audioPlayer.src = track.url;
    audioPlayer.play().catch(e => console.log("Audio block:", e));
}

function nextTrack() {
    const tracks = musicGenres[currentGenre];
    if (isShuffle) {
        currentTrackIdx = Math.floor(Math.random() * tracks.length);
    } else {
        currentTrackIdx = (currentTrackIdx + 1) % tracks.length;
    }
    playCurrentTrack();
}

if (musicNext) musicNext.onclick = nextTrack;
if (musicPrev) musicPrev.onclick = () => {
    const tracks = musicGenres[currentGenre];
    currentTrackIdx = (currentTrackIdx - 1 + tracks.length) % tracks.length;
    playCurrentTrack();
};
if (musicShuffle) musicShuffle.onclick = () => {
    isShuffle = !isShuffle;
    musicShuffle.style.background = isShuffle ? '#4caf50' : '#81c784';
    msgBox.innerText = isShuffle ? "Trộn bài: BẬT" : "Trộn bài: TẮT";
};

if (nowPlaying) nowPlaying.onclick = () => {
    const genres = Object.keys(musicGenres);
    const gIdx = (genres.indexOf(currentGenre) + 1) % genres.length;
    currentGenre = genres[gIdx];
    currentTrackIdx = 0;
    msgBox.innerText = `Thể loại: ${currentGenre.toUpperCase()}`;
    playCurrentTrack();
};

// ===== YOUTUBE IFRAME API (TIER 3) =====
function loadYouTubeAPI() {
    if (window.YT) return;
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

window.onYouTubeIframeAPIReady = () => {
    ytPlayer = new YT.Player('yt-player-container', {
        height: '1', width: '1',
        playerVars: { 'autoplay': 0, 'controls': 0, 'disablekb': 1, 'origin': window.location.origin },
        events: {
            'onReady': () => console.log("YT Player Ready"),
            'onStateChange': onPlayerStateChange
        }
    });
};

function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        const data = ytPlayer.getVideoData();
        nowPlaying.innerText = `YT: ${data.title}`;
    }
    if (event.data === YT.PlayerState.ENDED && isShuffle) {
        const count = ytPlayer.getPlaylist()?.length || 0;
        if (count > 0) {
            const nextIdx = Math.floor(Math.random() * count);
            ytPlayer.playVideoAt(nextIdx);
        }
    }
}

// ===== POP-UP QUẢN LÝ ALBUM =====
const musicModal = document.getElementById('music-modal');
const albumListEl = document.getElementById('album-list');
const ytInput = document.getElementById('yt-link-input');
const addAlbumBtn = document.getElementById('btn-add-album');

if (musicListBtn) musicListBtn.onclick = () => {
    musicModal.classList.remove('hidden');
    renderAlbumList();
};
const closeMusicBtn = document.getElementById('btn-close-music');
if (closeMusicBtn) closeMusicBtn.onclick = () => musicModal.classList.add('hidden');

if (addAlbumBtn) addAlbumBtn.onclick = async () => {
    const url = ytInput.value.trim();
    if (!url) return;
    
    let listId = "";
    if (url.includes('list=')) {
        listId = new URLSearchParams(new URL(url).search).get('list');
    }
    
    if (listId) {
        let title = "Album Mới";
        try {
            const resp = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${listId}&format=json`);
            const data = await resp.json();
            title = data.title;
        } catch(e) {}
        
        favoriteAlbums.push({ id: listId, title: title });
        localStorage.setItem('yt_albums', JSON.stringify(favoriteAlbums));
        ytInput.value = "";
        renderAlbumList();
    } else {
        alert("Boss ơi, link này không phải Playlist YouTube Music rồi!");
    }
};

function renderAlbumList() {
    if (!albumListEl) return;
    albumListEl.innerHTML = '';
    favoriteAlbums.forEach((alb, idx) => {
        const div = document.createElement('div');
        div.className = 'album-item';
        div.title = "Click để phát Album này";
        div.innerHTML = `
            <span>💿 ${alb.title}</span>
            <div class="album-actions" style="display:flex; gap:12px; align-items:center;">
                <svg width="20" height="20" viewBox="0 -960 960 960" fill="#6750A4"><path d="M320-200v-560l440 280-440 280Z"/></svg>
                <div class="del-btn" onclick="deleteAlbum(${idx}, event)">
                    <svg width="20" height="20" viewBox="0 -960 960 960" fill="#B3261E"><path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z"/></svg>
                </div>
            </div>
        `;
        div.onclick = () => loadAlbum(alb.id);
        albumListEl.appendChild(div);
    });
}

window.deleteAlbum = (idx, e) => {
    e.stopPropagation();
    favoriteAlbums.splice(idx, 1);
    localStorage.setItem('yt_albums', JSON.stringify(favoriteAlbums));
    renderAlbumList();
};

function loadAlbum(listId) {
    if (!listId) return;
    isYouTubeMode = true;
    audioPlayer.pause();
    
    msgBox.innerText = "Đã lưu Album YouTube Music!";
    
    if (ytPlayer && typeof ytPlayer.loadPlaylist === 'function') {
        ytPlayer.loadPlaylist({
            listType: 'playlist',
            list: listId,
            index: 0,
            startSeconds: 0
        });
        musicModal.classList.add('hidden');
        if (isShuffle) ytPlayer.setShuffle(true);
        // Chỉ tự động phát nếu Timer đang chạy
        if (isRunning) ytPlayer.playVideo(); 
    } else {
        loadYouTubeAPI();
        setTimeout(() => loadAlbum(listId), 1000);
    }
}

// ===== LOGIC MASCOT POMODORO =====
const taskData = {
    egg: { time: 15 * 60, emojis: ['🥚', '🐣', '🐥', '🐔', '🐉', '🐲'], name: 'Hỏa Rồng' },
    plant: { time: 25 * 60, emojis: ['🌱', '🌿', '🪴', '🌳', '🌹', '🌺'], name: 'Hoa Lofi' },
    house: { time: 45 * 60, emojis: ['🧱', '🪵', '🏗️', '🏠', '🏰', '🏯'], name: 'Lâu Đài Vàng' },
    potion: { time: 60 * 60, emojis: ['💧', '🧪', '🥘', '🔮', '🧪', '🧙‍♂️'], name: 'Tiên Đan' }
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
    currentTask = state.type;
    isTestMode = state.isTestMode || false;
    
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
    if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
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
        ipcRenderer.send('pomo-command', 'start', { time: timeLeft, isBreak: isBreakMode, type: currentTask });
        playCurrentTrack();
    } else {
        ipcRenderer.send('pomo-command', 'pause');
        audioPlayer.pause();
        if (ytPlayer && ytPlayer.pauseVideo) ytPlayer.pauseVideo();
    }
});

resetBtn.addEventListener('click', () => {
    ipcRenderer.send('pomo-command', 'reset', { time: taskData[currentTask].time });
    audioPlayer.pause();
    if (ytPlayer && ytPlayer.stopVideo) ytPlayer.stopVideo();
});

ipcRenderer.on('weather-impact', (e, data) => {
    if (data.fx.includes('rain')) currentGenre = 'nature';
    else currentGenre = 'lofi';
    if (!isYouTubeMode && isRunning) playCurrentTrack();
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

    RPG.init();
    checkPetPrivileges();
    // loadYouTubeAPI(); // Vô hiệu hóa tạm thời theo yêu cầu của Boss
    updateDisplay();
});

ipcRenderer.send('pomo-command', 'sync');
