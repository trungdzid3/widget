'use strict';

const $ = (id) => document.getElementById(id);
const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEATHER_CACHE_KEY = 'weather-widget-cache-v1';
const SAVED_LOCATIONS_KEY = 'weather-widget-saved-locations-v1';
const LAST_CITY_VALUE_KEY = 'weather-widget-last-city-v1';
const FETCH_TIMEOUT_MS = 12000;
const GEO_FETCH_TIMEOUT_MS = 9000;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 60000;

let currentLat = 21.0278;
let currentLon = 105.8342;

let particles = [];
let animFrameId = null;
let thunderTimer = null;
let currentFxName = 'none';
let flashOpacity = 0;
let cloudsHeavyP = [];

let retryAttempt = 0;
let retryTimer = null;
let activeFetchController = null;
let savedLocations = [];
let isResolvingGeo = false;

// Biến cho hiệu ứng Mùa và Âm thanh
let seasonParticles = [];
let currentSeason = 'spring';
let isNightMode = false;

let audioCtx = null;
let bgSoundNode = null;
let soundEnabled = false;
let currentSoundType = 'none';
let sharedNoiseBuffer = null;

const canvas = $('weather-canvas');
const ctx = canvas.getContext('2d');

function showToast(msg, ms = 2800) {
    const toast = $('geo-toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), ms);
}

function setMetaStatus(text, isError = false) {
    const meta = $('meta-status');
    meta.textContent = text;
    meta.classList.toggle('error', isError);
}

function setLoadingState(isLoading) {
    const desc = $('weather-desc');
    desc.classList.toggle('loading', isLoading);
    if (isLoading) {
        desc.innerText = 'Đang tải...';
    }
}

function formatClock(d) {
    const h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
}

function codeToEmoji(code) {
    if (code === 0) return '☀️';
    if (code <= 3) return '⛅';
    if (code <= 48) return '☁️';
    if (code <= 67) return '🌧️';
    if (code <= 77) return '❄️';
    if (code <= 82) return '🌦️';
    if (code <= 86) return '❄️';
    return '⛈️';
}

function updateClock() {
    const now = new Date();
    const h = now.getHours();
    $('clock').innerText = formatClock(now);

    let greeting = '☀️ Buổi Sáng';
    if (h >= 12 && h < 18) greeting = '🌤️ Buổi Chiều';
    else if (h >= 18 && h < 21) greeting = '🌆 Buổi Tối';
    else if (h >= 21 || h < 5) greeting = '🌙 Đêm Khuya';
    $('greeting').innerText = greeting;

    const isNight = h >= 18 || h < 6;
    isNightMode = isNight;
    document.body.classList.toggle('night-mode', isNight);
}

// ==========================================
// HỆ THỐNG MÙA (XUÂN, HÈ, THU, ĐÔNG)
// ==========================================
function getSeason() {
    const m = new Date().getMonth();
    if (m >= 2 && m <= 4) return 'spring';
    if (m >= 5 && m <= 7) return 'summer';
    if (m >= 8 && m <= 10) return 'autumn';
    return 'winter';
}

function initSeason() {
    currentSeason = getSeason();
    seasonParticles = [];
    const count = currentSeason === 'winter' ? 30 : 12;
    for (let i = 0; i < count; i++) {
        seasonParticles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            s: Math.random() * 3 + 1,
            vx: (Math.random() - 0.5) * 1.5,
            vy: Math.random() * 1.5 + 0.5,
            a: Math.random() * Math.PI * 2,
            va: (Math.random() - 0.5) * 0.1,
            phase: Math.random() * Math.PI * 2
        });
    }
}

function drawSeason() {
    if (!seasonParticles.length) return;

    if (currentSeason === 'spring') {
        ctx.fillStyle = 'rgba(255, 183, 197, 0.65)'; // Hoa đào rơi
        seasonParticles.forEach(p => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.a);
            ctx.beginPath();
            ctx.ellipse(0, 0, p.s + 1, p.s * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            p.x += p.vx + Math.sin(p.a) * 0.5;
            p.y += p.vy;
            p.a += p.va;
            if (p.y > canvas.height + 10) { p.y = -10; p.x = Math.random() * canvas.width; }
        });
    } else if (currentSeason === 'autumn') {
        ctx.fillStyle = 'rgba(212, 111, 28, 0.65)'; // Lá vàng rơi
        seasonParticles.forEach(p => {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.a);
            ctx.beginPath();
            ctx.ellipse(0, 0, p.s + 2, p.s * 0.5, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            p.x += p.vx + Math.sin(p.a);
            p.y += p.vy * 1.2;
            p.a += p.va;
            if (p.y > canvas.height + 10) { p.y = -10; p.x = Math.random() * canvas.width; }
        });
    } else if (currentSeason === 'summer') {
        ctx.fillStyle = 'rgba(255, 255, 150, 0.8)'; // Đom đóm mùa hè
        seasonParticles.forEach(p => {
            p.phase += 0.05;
            const op = (Math.sin(p.phase) + 1) / 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.s * 0.6, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 255, 100, ${op * 0.7})`;
            ctx.fill();
            p.x += p.vx * 0.3;
            p.y -= Math.abs(p.vy) * 0.3; // Đom đóm bay lên
            if (p.y < 0) p.y = canvas.height;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
        });
    } else if (currentSeason === 'winter') {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // Bụi tuyết nhấp nháy
        seasonParticles.forEach(p => {
            p.phase += 0.02;
            const op = (Math.sin(p.phase) + 1) / 2;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.s * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${op * 0.5})`;
            ctx.fill();
            p.x += p.vx * 0.5;
            p.y += p.vy * 0.5;
            if (p.y > canvas.height) p.y = 0;
            if (p.x < 0) p.x = canvas.width;
            if (p.x > canvas.width) p.x = 0;
        });
    }
}

// ==========================================
// HỆ THỐNG ÂM THANH (WEB AUDIO API)
// ==========================================
function toggleSound() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();

    soundEnabled = !soundEnabled;
    const btn = $('sound-btn');
    if (btn) {
        btn.innerText = soundEnabled ? '🔊' : '🔇';
        btn.title = soundEnabled ? 'Tắt âm báo' : 'Bật tiếng động';
        btn.style.filter = soundEnabled ? 'none' : 'grayscale(1)';
    }

    applySound(currentSoundType);
}

function stopSound() {
    if (bgSoundNode) {
        if (bgSoundNode.source) bgSoundNode.source.stop();
        if (bgSoundNode.gain) bgSoundNode.gain.disconnect();
        bgSoundNode = null;
    }
}

function createSharedNoise() {
    if (!audioCtx) return null;
    const size = audioCtx.sampleRate * 2;
    const buf = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const out = buf.getChannelData(0);
    for (let i = 0; i < size; i++) out[i] = Math.random() * 2 - 1;
    return buf;
}

function applySound(type) {
    currentSoundType = type;
    if (!soundEnabled || !audioCtx) return stopSound();

    stopSound();
    if (type === 'none') return;

    if (!sharedNoiseBuffer) sharedNoiseBuffer = createSharedNoise();

    const src = audioCtx.createBufferSource();
    src.buffer = sharedNoiseBuffer;
    src.loop = true;

    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    if (type === 'rain' || type === 'rain_heavy') {
        filter.type = 'lowpass';
        // Hạ tần số (muffled) rất thấp để tại cảm giác lofi chill, giảm tiếng xè xè (harsh noise)
        filter.frequency.value = type === 'rain_heavy' ? 700 : 350;
        filter.Q.value = 1.0; // Tăng một tí cộng hưởng cho âm thanh ấm hơn
        gain.gain.value = type === 'rain_heavy' ? 0.04 : 0.015; // Giảm volume tổng
    } else if (type === 'wind') {
        filter.type = 'lowpass';
        filter.frequency.value = 250; // Gió thổi lofi rất trầm
        filter.Q.value = 2.5; // Tạo ra tiếng u u nhẹ nhàng
        gain.gain.value = 0.015; // Rất nhỏ

        // Làm âm lượng gió to nhỏ tự nhiên (LFO)
        const volumeLfo = audioCtx.createOscillator();
        volumeLfo.type = 'sine';
        volumeLfo.frequency.value = 0.15; // Quét siêu chậm
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 0.01;
        volumeLfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        volumeLfo.start();

        src.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        src.start();
        bgSoundNode = { source: src, gain: gain, lfo: volumeLfo };
        return;
    } else if (type === 'crickets') {
        // Tiếng đàn (cricket) chill
        src.stop();
        const osc = audioCtx.createOscillator();
        osc.type = 'sine'; // Chuyển từ Square (chói) sang Sine (êm ru)
        osc.frequency.value = 3200; // Tần số thấp hơn
        gain.gain.value = 0.001; // Volume li ti

        const lfo = audioCtx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 12; // Rên nhè nhẹ
        const lfoGain = audioCtx.createGain();
        lfoGain.gain.value = 50;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start();

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        bgSoundNode = { source: osc, gain: gain, lfo };
        return;
    }

    src.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    src.start();
    bgSoundNode = { source: src, gain: gain };
}

function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}

function initRain(heavy) {
    resizeCanvas();
    particles = [];
    const count = heavy ? 80 : 45;
    for (let i = 0; i < count; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            len: Math.random() * 12 + 6,
            speed: Math.random() * 4 + 5,
            opacity: Math.random() * 0.5 + 0.3,
            w: Math.random() * 1 + 0.5
        });
    }
}

function drawRain() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.len * 0.15, p.y + p.len);
        ctx.strokeStyle = `rgba(120,180,255,${p.opacity})`;
        ctx.lineWidth = p.w;
        ctx.stroke();
        p.y += p.speed;
        p.x -= 0.4;
        if (p.y > canvas.height) {
            p.y = -p.len;
            p.x = Math.random() * canvas.width;
        }
    });
}

function initSnow() {
    resizeCanvas();
    particles = [];
    for (let i = 0; i < 55; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            r: Math.random() * 3 + 1.5,
            speed: Math.random() * 1 + 0.4,
            drift: (Math.random() - 0.5) * 0.5,
            opacity: Math.random() * 0.6 + 0.4,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.04
        });
    }
}

function drawSnow() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(180,210,255,${p.opacity * 0.5})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        p.y += p.speed;
        p.x += p.drift + Math.sin(p.angle) * 0.3;
        p.angle += p.spin;
        if (p.y > canvas.height + p.r) {
            p.y = -p.r;
            p.x = Math.random() * canvas.width;
        }
    });
}

function initSun() {
    resizeCanvas();
    particles = [];
    for (let i = 0; i < 18; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: Math.random() * 4 + 2,
            phase: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.025 + 0.01
        });
    }
}

function drawSun() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bg = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height * 0.25,
        5,
        canvas.width / 2,
        canvas.height * 0.25,
        canvas.width * 0.7
    );
    bg.addColorStop(0, 'rgba(255,245,120,0.12)');
    bg.addColorStop(1, 'rgba(255,200,50,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p) => {
        p.phase += p.speed;
        const opacity = (Math.sin(p.phase) + 1) / 2;
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        glow.addColorStop(0, `rgba(255,235,60,${opacity * 0.9})`);
        glow.addColorStop(1, 'rgba(255,210,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,200,${opacity})`;
        ctx.fill();
    });
}

function initClouds() {
    resizeCanvas();
    particles = [];
    for (let i = 0; i < 7; i++) {
        particles.push({
            x: Math.random() * canvas.width * 1.3 - canvas.width * 0.1,
            y: Math.random() * canvas.height * 0.65,
            scale: Math.random() * 0.55 + 0.35,
            speed: Math.random() * 0.35 + 0.12,
            opacity: Math.random() * 0.4 + 0.45
        });
    }
}

function drawCloudShape(x, y, scale, opacity, gray) {
    ctx.save();
    ctx.shadowColor = gray ? 'rgba(130,145,165,0.35)' : 'rgba(160,190,230,0.4)';
    ctx.shadowBlur = 8 * scale;
    ctx.beginPath();
    ctx.arc(x, y, 20 * scale, 0, Math.PI * 2);
    ctx.arc(x + 22 * scale, y - 6 * scale, 15 * scale, 0, Math.PI * 2);
    ctx.arc(x - 17 * scale, y + 4 * scale, 13 * scale, 0, Math.PI * 2);
    ctx.arc(x + 10 * scale, y + 10 * scale, 14 * scale, 0, Math.PI * 2);
    ctx.fillStyle = gray
        ? `rgba(175,190,210,${opacity})`
        : `rgba(195,220,245,${opacity})`;
    ctx.fill();
    ctx.restore();
}

function drawClouds() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
        drawCloudShape(p.x, p.y, p.scale, p.opacity, false);
        p.x += p.speed;
        if (p.x > canvas.width + 70) {
            p.x = -70;
            p.y = Math.random() * canvas.height * 0.65;
        }
    });
}

function initCloudsHeavy() {
    resizeCanvas();
    particles = [];
    cloudsHeavyP = [];
    for (let i = 0; i < 7; i++) {
        particles.push({
            x: Math.random() * canvas.width * 1.4 - canvas.width * 0.2,
            y: Math.random() * canvas.height * 0.65,
            scale: Math.random() * 0.55 + 0.45,
            speed: Math.random() * 0.2 + 0.08,
            opacity: Math.random() * 0.35 + 0.25
        });
    }
    for (let i = 0; i < 5; i++) {
        cloudsHeavyP.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height * 0.8 + canvas.height * 0.05,
            scale: Math.random() * 0.35 + 0.2,
            speed: Math.random() * 0.45 + 0.25,
            opacity: Math.random() * 0.3 + 0.35
        });
    }
}

function drawCloudsHeavy() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(140,155,175,0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p) => {
        ctx.save();
        ctx.shadowColor = 'rgba(100,115,135,0.4)';
        ctx.shadowBlur = 10 * p.scale;
        ctx.beginPath();
        const { x, y, scale } = p;
        ctx.arc(x, y, 22 * scale, 0, Math.PI * 2);
        ctx.arc(x + 25 * scale, y - 7 * scale, 17 * scale, 0, Math.PI * 2);
        ctx.arc(x - 18 * scale, y + 5 * scale, 14 * scale, 0, Math.PI * 2);
        ctx.arc(x + 12 * scale, y + 11 * scale, 16 * scale, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(160,175,195,${p.opacity + 0.2})`;
        ctx.fill();
        ctx.restore();

        p.x += p.speed;
        if (p.x > canvas.width + 80) {
            p.x = -80;
            p.y = Math.random() * canvas.height * 0.65;
        }
    });

    cloudsHeavyP.forEach((p) => {
        drawCloudShape(p.x, p.y, p.scale, p.opacity + 0.2, true);
        p.x += p.speed;
        if (p.x > canvas.width + 50) {
            p.x = -50;
            p.y = Math.random() * canvas.height * 0.8 + canvas.height * 0.05;
        }
    });
}

function initFog() {
    resizeCanvas();
    particles = [];
    for (let i = 0; i < 14; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            w: Math.random() * 100 + 60,
            h: Math.random() * 18 + 8,
            speed: (Math.random() - 0.5) * 0.35,
            opacity: Math.random() * 0.18 + 0.08,
            phase: Math.random() * Math.PI * 2
        });
    }
}

function drawFog() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
        p.phase += 0.006;
        p.x += p.speed;
        const opacity = p.opacity + Math.sin(p.phase) * 0.04;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.w / 2);
        grad.addColorStop(0, `rgba(190,205,220,${opacity})`);
        grad.addColorStop(1, 'rgba(190,205,220,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h);

        if (p.x > canvas.width + p.w) p.x = -p.w;
        if (p.x < -p.w) p.x = canvas.width + p.w;
    });
}

function initThunder() {
    initRain(true);
    scheduleFlash();
}

function scheduleFlash() {
    const delay = Math.random() * 4000 + 2000;
    thunderTimer = setTimeout(() => {
        flashOpacity = 0.75;
        scheduleFlash();
    }, delay);
}

function drawThunder() {
    drawRain();
    if (flashOpacity > 0) {
        ctx.fillStyle = `rgba(210,225,255,${flashOpacity})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        flashOpacity = Math.max(0, flashOpacity - 0.06);
    }
}

const EFFECTS = {
    none: {
        init: () => {
            resizeCanvas();
            particles = [];
        },
        draw: () => ctx.clearRect(0, 0, canvas.width, canvas.height)
    },
    sun: { init: initSun, draw: drawSun },
    clouds: { init: initClouds, draw: drawClouds },
    clouds_heavy: { init: initCloudsHeavy, draw: drawCloudsHeavy },
    fog: { init: initFog, draw: drawFog },
    rain: { init: () => initRain(false), draw: drawRain },
    rain_heavy: { init: () => initRain(true), draw: drawRain },
    snow: { init: initSnow, draw: drawSnow },
    thunder: { init: initThunder, draw: drawThunder }
};

function setEffect(name) {
    if (currentFxName === name) return;
    currentFxName = name;

    if (animFrameId) cancelAnimationFrame(animFrameId);
    if (thunderTimer) {
        clearTimeout(thunderTimer);
        thunderTimer = null;
    }

    flashOpacity = 0;
    const fx = EFFECTS[name] || EFFECTS.none;
    fx.init();

    const loop = () => {
        if (document.hidden) {
            animFrameId = requestAnimationFrame(loop);
            return;
        }
        fx.draw();
        drawSeason();
        animFrameId = requestAnimationFrame(loop);
    };

    loop();
}

function getWeatherInfo(code) {
    if (code === 0) return { desc: 'Trời Quang ☀️', img: 'Bunny_Sunny.png', fx: 'sun' };
    if (code <= 3) return { desc: 'Mây Rải Rác ☁️', img: 'Bunny_Cloudy.png', fx: 'clouds' };
    if (code <= 44) return { desc: 'Trời Âm U ☁️', img: 'Bunny_Cloudy.png', fx: 'clouds_heavy' };
    if (code <= 48) return { desc: 'Sương Mù 🌫️', img: 'Bunny_Cloudy.png', fx: 'fog' };
    if (code <= 57) return { desc: 'Mưa Phùn 🌦️', img: 'Bunny_Rainy.png', fx: 'rain' };
    if (code <= 67) return { desc: 'Trời Mưa 🌧️', img: 'Bunny_Rainy.png', fx: 'rain' };
    if (code <= 77) return { desc: 'Có Tuyết ❄️', img: 'Bunny_Snowy.png', fx: 'snow' };
    if (code <= 82) return { desc: 'Mưa Rào 🌦️', img: 'Bunny_Rainy.png', fx: 'rain_heavy' };
    if (code <= 86) return { desc: 'Tuyết Rơi ❄️', img: 'Bunny_Snowy.png', fx: 'snow' };
    return { desc: 'Giông Bão ⛈️', img: 'Bunny_Rainy.png', fx: 'thunder' };
}

function applyWeatherData(data) {
    const cur = data.current;
    const daily = data.daily;

    const info = getWeatherInfo(cur.weather_code);
    $('temp-display').innerText = `${Math.round(cur.temperature_2m)}°C`;
    $('weather-desc').innerText = info.desc;
    $('bunny-char').src = info.img;
    $('humidity').innerText = `${Math.round(cur.relative_humidity_2m)}%`;
    $('wind').innerText = `${Math.round(cur.wind_speed_10m)} km/h`;
    setEffect(info.fx);

    // Bắn trạng thái Thời tiết và Nhiệt độ sang Main Process để chia sẻ cho các Widget khác (Pet)
    if (window.widgetMeta && window.widgetMeta.broadcastWeather) {
        window.widgetMeta.broadcastWeather({
            temp: Math.round(cur.temperature_2m),
            desc: info.desc,
            fx: info.fx
        });
    }

    // Kích hoạt âm thanh môi trường
    let soundType = 'none';
    if (info.fx.includes('rain') || info.fx === 'thunder') soundType = info.fx;
    else if (info.fx === 'snow' || info.fx === 'fog') soundType = 'wind';
    else if (info.fx === 'sun' || info.fx.includes('clouds')) {
        if (isNightMode) soundType = 'crickets';
        else if (currentSeason === 'winter' || currentSeason === 'autumn') soundType = 'wind';
    }
    applySound(soundType);

    const alertBox = $('weather-alert');
    if (alertBox) {
        // 65..67: Mưa to, 75..77: Tuyết to, 82: Mưa rào mạnh, 86: Bão tuyết, 95..99: Giông sét
        const badCodes = [65, 67, 75, 77, 82, 86, 95, 96, 99];
        if (badCodes.includes(cur.weather_code)) {
            alertBox.innerText = `⚠️ Cảnh Báo: ${info.desc}`;
            alertBox.classList.add('show');
        } else {
            alertBox.classList.remove('show');
        }
    }

    for (let i = 0; i < 3; i++) {
        const idx = i + 1;
        const card = $(`fc${i}`);
        const date = new Date(daily.time[idx]);
        const day = i === 0 ? 'Ngày mai' : DAY_NAMES[date.getDay()];
        const hi = Math.round(daily.temperature_2m_max[idx]);
        const lo = Math.round(daily.temperature_2m_min[idx]);
        const icon = codeToEmoji(daily.weather_code[idx]);

        card.querySelector('.fc-day').innerText = day;
        card.querySelector('.fc-icon').innerText = icon;
        card.querySelector('.fc-hi').innerText = `${hi}°`;
        card.querySelector('.fc-lo').innerText = `${lo}°`;
    }
}

function saveCache(lat, lon, payload) {
    const cacheData = {
        lat,
        lon,
        payload,
        updatedAt: Date.now()
    };
    localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(cacheData));
}

function loadCache(lat, lon) {
    try {
        const raw = localStorage.getItem(WEATHER_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed.lat !== lat || parsed.lon !== lon) return null;
        return parsed;
    } catch {
        return null;
    }
}

function toCityValue(lat, lon) {
    return `${Number(lat).toFixed(4)},${Number(lon).toFixed(4)}`;
}

function fromCityValue(value) {
    const [lat, lon] = String(value).split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
}

function getCustomAnchorOption() {
    return $('city-select').querySelector('option[value="custom"]');
}

function getCityOptionByValue(value) {
    return Array.from($('city-select').options).find(opt => opt.value === value) || null;
}

function upsertCityOption(item, options = {}) {
    const value = toCityValue(item.lat, item.lon);
    let opt = getCityOptionByValue(value);

    if (!opt) {
        opt = document.createElement('option');
        const anchor = getCustomAnchorOption();
        if (anchor) $('city-select').insertBefore(opt, anchor);
        else $('city-select').appendChild(opt);
    }

    opt.value = value;
    opt.textContent = item.label;

    if (item.deletable) {
        opt.dataset.deletable = '1';
        opt.dataset.locationKey = item.key || value;
    } else {
        delete opt.dataset.deletable;
        delete opt.dataset.locationKey;
    }

    if (options.select) $('city-select').value = value;
    return opt;
}

function loadSavedLocations() {
    try {
        const raw = localStorage.getItem(SAVED_LOCATIONS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map(item => ({
                key: String(item.key || ''),
                label: String(item.label || ''),
                lat: Number(item.lat),
                lon: Number(item.lon)
            }))
            .filter(item => item.label && Number.isFinite(item.lat) && Number.isFinite(item.lon));
    } catch {
        return [];
    }
}

function saveSavedLocations() {
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(savedLocations));
}

function rememberSelectedCity(value) {
    if (value && value !== 'custom') localStorage.setItem(LAST_CITY_VALUE_KEY, value);
}

function upsertSavedLocation(location, options = {}) {
    const value = toCityValue(location.lat, location.lon);
    const key = location.key || value;
    const entry = {
        key,
        label: String(location.label || '📍 Địa điểm đã lưu'),
        lat: Number(location.lat),
        lon: Number(location.lon)
    };

    const existingIdx = savedLocations.findIndex(loc => loc.key === key || toCityValue(loc.lat, loc.lon) === value);
    if (existingIdx >= 0) savedLocations[existingIdx] = entry;
    else savedLocations.push(entry);

    if (savedLocations.length > 20) {
        savedLocations = savedLocations.slice(savedLocations.length - 20);
    }

    saveSavedLocations();
    upsertCityOption({ ...entry, deletable: true }, { select: options.select });

    if (options.select) {
        rememberSelectedCity(value);
    }
    updateDeleteButtonState();
}

function restoreSavedLocationOptions() {
    savedLocations.forEach(loc => {
        upsertCityOption({ ...loc, deletable: true });
    });
}

function restoreSelectedCity() {
    const value = localStorage.getItem(LAST_CITY_VALUE_KEY);
    if (!value) return false;
    const opt = getCityOptionByValue(value);
    if (!opt) return false;

    $('city-select').value = value;
    const coords = fromCityValue(value);
    if (!coords) return false;
    currentLat = coords.lat;
    currentLon = coords.lon;
    return true;
}

function updateDeleteButtonState() {
    const btn = $('city-delete-btn');
    if (!btn) return;

    const selected = $('city-select').selectedOptions[0];
    btn.disabled = !(selected && selected.dataset.deletable === '1');
}

function deleteSelectedSavedLocation() {
    const selected = $('city-select').selectedOptions[0];
    if (!selected || selected.dataset.deletable !== '1') return;

    const value = selected.value;
    const key = selected.dataset.locationKey || value;
    savedLocations = savedLocations.filter(loc => loc.key !== key && toCityValue(loc.lat, loc.lon) !== value);
    saveSavedLocations();
    selected.remove();

    const fallback = Array.from($('city-select').options).find(opt => opt.value !== 'custom');
    if (fallback) {
        $('city-select').value = fallback.value;
        const coords = fromCityValue(fallback.value);
        if (coords) {
            currentLat = coords.lat;
            currentLon = coords.lon;
            rememberSelectedCity(fallback.value);
            updateWeather();
        }
    }

    updateDeleteButtonState();
    showToast('🗑️ Đã xóa địa điểm đã lưu');
}

function uniqueParts(parts) {
    const out = [];
    parts.forEach(part => {
        const clean = String(part || '').trim();
        if (!clean) return;
        if (!out.some(existing => existing.toLowerCase() === clean.toLowerCase())) {
            out.push(clean);
        }
    });
    return out;
}

async function reverseGeocodeDetailed(lat, lon) {
    try {
        const url = 'https://nominatim.openstreetmap.org/reverse'
            + `?format=jsonv2&lat=${lat}&lon=${lon}`
            + '&zoom=18&addressdetails=1&accept-language=vi';

        const data = await fetchJsonWithTimeout(url);
        const addr = data.address || {};

        const ward = addr.suburb || addr.neighbourhood || addr.quarter || addr.hamlet || addr.village;
        const district = addr.city_district || addr.district || addr.county || addr.municipality || addr.town || addr.city;
        const province = addr.state || addr.province || addr.region;
        const country = addr.country;

        const parts = uniqueParts([ward, district, province, country]);
        if (parts.length > 0) return parts.join(', ');

        if (data.display_name) {
            return data.display_name.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4).join(', ');
        }
    } catch {
        // Fallback handled by caller
    }
    return null;
}

function getBrowserPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation unsupported'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            pos => resolve({
                lat: pos.coords.latitude,
                lon: pos.coords.longitude,
                source: 'gps'
            }),
            err => reject(err),
            {
                timeout: 7000,
                enableHighAccuracy: true,
                maximumAge: 0
            }
        );
    });
}


async function getIpFallbackPosition() {
    // Use IPC to Main Process for reliable IP Geolocation (no CORS, no Mixed Content issues)
    if (window.widgetMeta && window.widgetMeta.getIpLocation) {
        try {
            console.log('Requesting IP location from main process...');
            const data = await window.widgetMeta.getIpLocation();
            if (data && data.lat && data.lon) {
                console.log('check IP location success:', data);
                return {
                    lat: data.lat,
                    lon: data.lon,
                    source: 'ip',
                    roughLabel: data.city ? `${data.city}, ${data.country}` : data.country
                };
            }
        } catch (err) {
            console.error('IPC getIpLocation failed:', err);
        }
    }

    // Fallback logic in Renderer (likely to fail due to CORS/CORB if not handled)
    // trying ipapi.co
    try {
        const data = await fetchJsonWithTimeout('https://ipapi.co/json/', 5000);
        if (data.latitude && data.longitude) {
            return {
                lat: data.latitude,
                lon: data.longitude,
                source: 'ip',
                roughLabel: [data.city, data.region, data.country_name].filter(Boolean).join(', ')
            };
        }
    } catch(e) { console.warn('ipapi.co renderer fallback failed:', e); }
    
    return null;
}

async function resolveCurrentPosition() {
    try {
        return await getBrowserPosition();
    } catch (geoErr) {
        const ipPos = await getIpFallbackPosition();
        if (ipPos) return ipPos;
        throw geoErr;
    }
}

function clearRetryTimer() {
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
}

async function fetchJsonWithTimeout(url, timeoutMs = GEO_FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timeoutId);
    }
}

function scheduleRetry() {
    if (retryTimer) return;

    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** retryAttempt));
    retryAttempt += 1;
    setMetaStatus(`🔁 Mất mạng, thử lại sau ${Math.round(delay / 1000)} giây...`, true);

    retryTimer = setTimeout(() => {
        retryTimer = null;
        updateWeather();
    }, delay);
}

async function updateWeather() {
    setLoadingState(true);
    setMetaStatus('⏳ Đang cập nhật dữ liệu...');

    if (activeFetchController) {
        activeFetchController.abort();
    }

    const controller = new AbortController();
    activeFetchController = controller;
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
        const url = 'https://api.open-meteo.com/v1/forecast'
            + `?latitude=${currentLat}&longitude=${currentLon}`
            + '&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m'
            + '&daily=weather_code,temperature_2m_max,temperature_2m_min'
            + '&timezone=Asia%2FBangkok&forecast_days=4';

        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        applyWeatherData(payload);
        saveCache(currentLat, currentLon, payload);

        retryAttempt = 0;
        clearRetryTimer();
        setMetaStatus(''); // Xoá dòng "Cập nhật lúc..."

    } catch (error) {
        const cached = loadCache(currentLat, currentLon);
        if (cached?.payload) {
            applyWeatherData(cached.payload);
            const cachedAt = formatClock(new Date(cached.updatedAt));
            setMetaStatus(`⚠️ Dùng dữ liệu lưu lúc ${cachedAt}`, true);
            showToast('📦 Đang dùng dữ liệu lưu tạm');
        } else {
            $('weather-desc').innerText = 'Lỗi kết nối!';
            setMetaStatus('❌ Không thể tải dữ liệu thời tiết', true);
        }
        scheduleRetry();
    } finally {
        clearTimeout(timeoutId);
        if (activeFetchController === controller) {
            activeFetchController = null;
        }
        setLoadingState(false);
    }
}

async function useGeolocation() {
    if (isResolvingGeo) return;
    isResolvingGeo = true;

    const btn = $('geo-btn');
    btn.classList.add('pulsing');
    setMetaStatus('📡 Đang dò tìm tín hiệu vệ tinh...');

    try {
        const pos = await resolveCurrentPosition();
        currentLat = pos.lat;
        currentLon = pos.lon;

        const detailedName = await reverseGeocodeDetailed(currentLat, currentLon);
        const fallbackName = pos.roughLabel || 'Vị trí hiện tại';
        const placeLabel = detailedName || fallbackName;
        const prefix = pos.source === 'gps' ? '📍' : '📍~';

        upsertSavedLocation({
            key: 'auto-location',
            label: `${prefix} ${placeLabel}`,
            lat: currentLat,
            lon: currentLon
        }, { select: true });

        previousCityValue = $('city-select').value;
        updateDeleteButtonState();
        if (pos.source === 'gps') {
            showToast('✅ Đã lấy vị trí chi tiết!');
        } else {
            showToast('⚠️ Định vị mạng có thể lệch. Khuyên dùng mục: 🔍 Tự tìm', 5000);
            setMetaStatus('Sai số cao do dùng mạng, hãy 🔍 tìm tay!', true);
        }
        await updateWeather();
    } catch {
        showToast('❌ Không lấy được vị trí!');
        setMetaStatus('❌ Tín hiệu yếu, hãy nhập thủ công', true);
    } finally {
        btn.classList.remove('pulsing');
        isResolvingGeo = false;
    }
}

function toggleForecast() {
    const currentView = $('view-current');
    const forecastView = $('view-forecast');
    const isShowing = forecastView.classList.contains('show');

    if (isShowing) {
        forecastView.classList.remove('show');
        forecastView.style.display = 'none';
        currentView.style.display = '';
        return;
    }

    currentView.style.display = 'none';
    forecastView.style.display = 'block';
    requestAnimationFrame(() => forecastView.classList.add('show'));
}

let previousCityValue = $('city-select').value;

$('city-select').addEventListener('change', function onCityChange() {
    if (this.value === 'custom') {
        $('city-select').style.display = 'none';
        $('city-search-box').style.display = 'flex';
        $('city-input').value = '';
        $('city-input').focus();
        this.value = previousCityValue; // Revert option để nếu huỷ search nó về thành phố cũ
        updateDeleteButtonState();
        return;
    }

    previousCityValue = this.value;
    rememberSelectedCity(this.value);
    updateDeleteButtonState();

    const coords = fromCityValue(this.value);
    if (!coords) return;
    currentLat = coords.lat;
    currentLon = coords.lon;
    currentFxName = 'none';
    retryAttempt = 0;
    clearRetryTimer();
    updateWeather();
});

$('city-search-cancel').addEventListener('click', () => {
    $('city-search-box').style.display = 'none';
    $('city-select').style.display = 'block';
    updateDeleteButtonState();
});

$('city-input').addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
        const query = $('city-input').value.trim();
        if (!query) return;

        $('city-input').disabled = true;
        setMetaStatus('🔍 Đang tìm kiếm...');
        try {
            // Geocoding API from Open-Meteo
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=vi`);
            const data = await res.json();

            if (data.results && data.results.length > 0) {
                const place = data.results[0];
                const lat = place.latitude;
                const lon = place.longitude;
                const labelParts = uniqueParts([place.name, place.admin3, place.admin2, place.admin1, place.country]);
                const label = `📌 ${labelParts.slice(0, 3).join(', ')}`;

                upsertSavedLocation({
                    key: `manual-${Date.now()}`,
                    label,
                    lat,
                    lon
                }, { select: true });

                previousCityValue = $('city-select').value;
                currentLat = Number(lat);
                currentLon = Number(lon);
                currentFxName = 'none';
                retryAttempt = 0;
                clearRetryTimer();
                updateWeather();

                showToast('✅ Đã lưu địa điểm mới');
            } else {
                showToast('❌ Không tìm thấy!');
                setMetaStatus(`❌ Không tìm thấy "${query}"!`, true);
            }
        } catch (err) {
            showToast('❌ Lỗi tra cứu mạng!');
            setMetaStatus('❌ Lỗi tra cứu', true);
        } finally {
            $('city-input').disabled = false;
            $('city-search-box').style.display = 'none';
            $('city-select').style.display = 'block';
            updateDeleteButtonState();
        }
    }
});

$('city-delete-btn').addEventListener('click', deleteSelectedSavedLocation);
$('geo-btn').addEventListener('click', useGeolocation);
$('temp-display').addEventListener('click', toggleForecast);
$('view-forecast').addEventListener('click', toggleForecast);
if ($('sound-btn')) $('sound-btn').addEventListener('click', toggleSound);

window.addEventListener('resize', () => {
    const fx = EFFECTS[currentFxName];
    if (fx) fx.init();
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && currentFxName && EFFECTS[currentFxName]) {
        EFFECTS[currentFxName].init();
        if (seasonParticles.length > 0) initSeason(); // Restart mùa
    }
});

setInterval(updateClock, 1000);
setInterval(updateWeather, 300000);

savedLocations = loadSavedLocations();
restoreSavedLocationOptions();
if (!restoreSelectedCity()) {
    const selected = $('city-select').value;
    const coords = fromCityValue(selected);
    if (coords) {
        currentLat = coords.lat;
        currentLon = coords.lon;
    }
}
previousCityValue = $('city-select').value;
updateDeleteButtonState();

initSeason();
updateClock();
updateWeather();

// Auto-resize window based on content
const widgetContainer = document.querySelector('.widget-container');
if (widgetContainer && window.widgetMeta && window.widgetMeta.resizeWeather) {
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            // Margin top 2px + margin bottom 9px = 11px
            const h = entry.target.offsetHeight + 11;
            window.widgetMeta.resizeWeather(h);
        }
    });
    resizeObserver.observe(widgetContainer);
}
