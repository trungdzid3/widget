'use strict';

const $ = (id) => document.getElementById(id);
const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEATHER_CACHE_KEY = 'weather-widget-cache-v1';
const FETCH_TIMEOUT_MS = 12000;
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

function clearRetryTimer() {
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
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
    const btn = $('geo-btn');
    btn.classList.add('spinning');
    btn.textContent = '🔄';

    try {
        const pos = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });

        currentLat = pos.coords.latitude;
        currentLon = pos.coords.longitude;

        let geoOpt = document.getElementById('geo-opt');
        if (!geoOpt) {
            geoOpt = document.createElement('option');
            geoOpt.id = 'geo-opt';
            $('city-select').insertBefore(geoOpt, $('city-select').firstChild);
        }

        geoOpt.value = `${currentLat},${currentLon}`;
        geoOpt.textContent = '📍 Vị trí của bạn';
        $('city-select').value = geoOpt.value;

        showToast('✅ Đã lấy vị trí!');
        await updateWeather();
    } catch {
        showToast('❌ Không lấy được vị trí!');
    } finally {
        btn.classList.remove('spinning');
        btn.textContent = '📍';
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
        return;
    }

    previousCityValue = this.value;
    const [lat, lon] = this.value.split(',').map(Number);
    currentLat = lat;
    currentLon = lon;
    currentFxName = 'none';
    retryAttempt = 0;
    clearRetryTimer();
    updateWeather();
});

$('city-search-cancel').addEventListener('click', () => {
    $('city-search-box').style.display = 'none';
    $('city-select').style.display = 'block';
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
                const name = place.name;

                // Add new auto-fetched option
                const newOpt = document.createElement('option');
                newOpt.value = `${lat},${lon}`;
                newOpt.textContent = `📍 ${name}`;

                const sel = $('city-select');
                // Chèn lên trên option cuối cùng (option custom)
                sel.insertBefore(newOpt, sel.lastElementChild);
                sel.value = newOpt.value;
                previousCityValue = newOpt.value;

                currentLat = lat;
                currentLon = lon;
                currentFxName = 'none';
                retryAttempt = 0;
                clearRetryTimer();
                updateWeather();

                showToast(`✅ Đã thêm: ${name}`);
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
        }
    }
});

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

initSeason();
updateClock();
updateWeather();
