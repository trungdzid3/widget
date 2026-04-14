const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, session, Tray, Menu, ipcMain, screen, dialog, net, globalShortcut, powerMonitor } = require('electron');

// --- TỐI ƯU HỆ THỐNG & ĐỒ HỌA ---
app.setAppUserModelId('com.trungdz.pixelwidget');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('enable-features', 'WinrtGeolocationImplementation');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('enable-gpu-rasterization'); 
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer'); 
app.commandLine.appendSwitch('enable-hardware-overlays');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-calculate-native-win-occlusion'); 
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows', 'true');
app.commandLine.appendSwitch('ignore-certificate-errors');

const { autoUpdater } = require('electron-updater');
const googleService = require('./googleService');

// --- HELPER FUNCTIONS ---
function backgroundFetch(url) {
    return new Promise((resolve, reject) => {
        const request = net.request(url);
        request.on('response', (response) => {
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => {
                if(response.statusCode >= 200 && response.statusCode < 300) {
                    try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
                } else {
                    reject(new Error(`HTTP Status: ${response.statusCode}`));
                }
            });
        });
        request.on('error', (error) => reject(error));
        request.end();
    });
}

function getBounds(name, defaultWidth, defaultHeight, defaultX, defaultY) {
    let bounds = { width: defaultWidth, height: defaultHeight, x: defaultX, y: defaultY };
    try {
        const file = path.join(app.getPath('userData'), `${name}-bounds.json`);
        if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (typeof parsed.x === 'number') {
                bounds.x = parsed.x;
                bounds.y = parsed.y;
                bounds.width = defaultWidth;
                bounds.height = defaultHeight;
            }
        }
    } catch(e) {}

    const displays = screen.getAllDisplays();
    const isVisibleOnAnyDisplay = displays.some(display => {
        const dx = display.bounds.x, dy = display.bounds.y, dw = display.bounds.width, dh = display.bounds.height;
        const centerX = bounds.x + bounds.width / 2, centerY = bounds.y + bounds.height / 2;
        return (centerX >= dx && centerX <= dx + dw && centerY >= dy && centerY <= dy + dh);
    });

    if (!isVisibleOnAnyDisplay) {
        bounds.x = defaultX;
        bounds.y = defaultY;
    }
    return bounds;
}

function saveBounds(name, win) {
    try { fs.writeFileSync(path.join(app.getPath('userData'), `${name}-bounds.json`), JSON.stringify(win.getBounds())); } catch(e) {}
}

// --- STATE MANAGEMENT ---
const STATE_FILE = path.join(app.getPath('userData'), 'ecosystem-state-v3.json');
const RPG_STATE_FILE = path.join(app.getPath('userData'), 'rpg-state-v1.json');

function getState() {
    try {
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch(e) {}
    return { 
        active: { weather: false, note: false, plant: false, pet: false, calendar: false },
        pinned: { weather: false, note: false, plant: false, pet: false, calendar: false },
        handleStyle: 'edge'
    };
}

let mRPGState = null;
function getRPGState() {
    if (mRPGState) return mRPGState;
    try {
        if (fs.existsSync(RPG_STATE_FILE)) {
            mRPGState = JSON.parse(fs.readFileSync(RPG_STATE_FILE, 'utf-8'));
            return mRPGState;
        }
    } catch(e) {}
    return null;
}
function saveRPGState(s) {
    mRPGState = s;
    try { fs.writeFileSync(RPG_STATE_FILE, JSON.stringify(s)); } catch(e) {}
}

const pomoState = { isRunning: false, timeLeft: 1500, isBreak: false, type: 'egg', luckyBonus: 0, startTime: 0 };
let pomoTimer = null;
const isTestMode = process.argv.includes('--test-mode');

function broadcastPomo() {
    BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) w.webContents.send('pomo-sync', { ...pomoState, isTestMode });
    });
}

function startPomoTick() {
    if (pomoTimer) clearInterval(pomoTimer);
    pomoTimer = setInterval(() => {
        if (pomoState.isRunning && pomoState.timeLeft > 0) {
            pomoState.timeLeft--;
            broadcastPomo();
        } else if (pomoState.isRunning && pomoState.timeLeft <= 0) {
            pomoState.isRunning = false;
            clearInterval(pomoTimer);
            if (!pomoState.isBreak) {
                pomoState.isBreak = true;
                pomoState.timeLeft = isTestMode ? 5 : 5 * 60;
            } else {
                pomoState.isBreak = false;
                pomoState.timeLeft = isTestMode ? 5 : 1500;
            }
            broadcastPomo();
        }
    }, 1000);
}

function saveState(s) {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch(e) {}
}

// --- WINDOW & WIDGET CONFIG ---
let handleWin, launcherWin, weatherWin, noteWin, plantWin, petWin, calendarWin, tray;
let mState = getState();
let isGoogleAuthenticated = false;
let isQuiting = false;
let lastActiveState = null;

const widgetConfigs = {
    weather: { file: 'index.html', defaults: [262, 392], extra: { preload: path.join(__dirname, 'preload.js'), nodeIntegration: false, contextIsolation: true, sandbox: false } },
    note: { file: 'note.html', defaults: [244, 338], nodeIntegration: true, contextIsolation: false, extra: { resizable: false } },
    plant: { file: 'plant.html', defaults: [252, 230], nodeIntegration: true, contextIsolation: false, extra: { autoplayPolicy: 'no-user-gesture-required' } },
    pet: { file: 'pet.html', defaults: [246, 289], nodeIntegration: true, contextIsolation: false, extra: { resizable: false } },
    calendar: { file: 'calendar.html', defaults: [270, 360], extra: { preload: path.join(__dirname, 'preload.js') } }
};

const windowMap = {
    get weather() { return weatherWin; }, set weather(v) { weatherWin = v; },
    get note() { return noteWin; }, set note(v) { noteWin = v; },
    get plant() { return plantWin; }, set plant(v) { plantWin = v; },
    get pet() { return petWin; }, set pet(v) { petWin = v; },
    get calendar() { return calendarWin; }, set calendar(v) { calendarWin = v; }
};

// --- CORE WIDGET HELPERS ---
function snapToOthers(currentWin) {
    const SNAP_DIST = 20;
    const bounds = currentWin.getBounds();
    let snappedX = bounds.x, snappedY = bounds.y;
    BrowserWindow.getAllWindows().forEach(other => {
        if (other === currentWin || !other.isVisible()) return;
        const ob = other.getBounds();
        if (Math.abs(bounds.x - (ob.x + ob.width)) < SNAP_DIST) snappedX = ob.x + ob.width - 12;
        if (Math.abs((bounds.x + bounds.width) - ob.x) < SNAP_DIST) snappedX = ob.x - bounds.width + 12;
        if (Math.abs(bounds.y - (ob.y + ob.height)) < SNAP_DIST) snappedY = ob.y + ob.height - 12;
        if (Math.abs((bounds.y + bounds.height) - ob.y) < SNAP_DIST) snappedY = ob.y - bounds.height + 12;
        if (Math.abs(bounds.x - ob.x) < SNAP_DIST) snappedX = ob.x;
        if (Math.abs(bounds.y - ob.y) < SNAP_DIST) snappedY = ob.y;
    });
    if (snappedX !== bounds.x || snappedY !== bounds.y) currentWin.setBounds({ ...bounds, x: snappedX, y: snappedY });
}

function getOrCreateWidget(name) {
    if (windowMap[name] && !windowMap[name].isDestroyed()) return windowMap[name];
    const config = widgetConfigs[name];
    if (!config) return null;

    const { width: scrW } = screen.getPrimaryDisplay().workAreaSize;
    const b = getBounds(name, config.defaults[0], config.defaults[1], config.defaults[0] === 262 ? scrW - 600 : scrW - 400, 100);
    
    const win = new BrowserWindow({
        width: b.width, height: b.height, x: b.x, y: b.y,
        transparent: true, frame: false, alwaysOnTop: true, resizable: !!(config.extra && config.extra.resizable), skipTaskbar: true,
        type: 'toolbar', show: true, opacity: 0,
        webPreferences: { 
            backgroundThrottling: false, 
            nodeIntegration: config.nodeIntegration || false,
            contextIsolation: config.contextIsolation !== undefined ? config.contextIsolation : true,
            ...(config.extra || {}) 
        },
        ...(config.extra || {})
    });

    win.setAlwaysOnTop(true, 'screen-saver');
    win.loadFile(config.file);
    win.webContents.on('render-process-gone', (e, d) => { if(d.reason==='crashed'||d.reason==='oom') setTimeout(() => { if(!win.isDestroyed()) win.reload(); }, 1500); });

    let moveTimeout;
    win.on('move', () => {
        clearTimeout(moveTimeout);
        moveTimeout = setTimeout(() => { snapToOthers(win); saveBounds(name, win); }, 150);
    });

    win.on('close', (e) => { if (!isQuiting) { e.preventDefault(); ipcMain.emit('toggle-widget', null, name, false); } });

    if (name === 'note' && isGoogleAuthenticated) {
        win.webContents.once('did-finish-load', () => win.webContents.send('google-ready'));
    }

    windowMap[name] = win;
    return win;
}

function toggleSmartVisibility(forceShow = null) {
    let isCurrentlyShowingAny = Object.values(mState.active).some(v => v === true);
    let shouldShow = forceShow !== null ? forceShow : !isCurrentlyShowingAny;

    if (!shouldShow) {
        lastActiveState = JSON.parse(JSON.stringify(mState.active));
        for (let key in mState.active) mState.active[key] = false;
    } else {
        if (lastActiveState) mState.active = JSON.parse(JSON.stringify(lastActiveState));
        else mState.active['weather'] = true;
    }

    for (let key in mState.active) {
        if (mState.active[key]) {
            const win = getOrCreateWidget(key);
            if (win) {
                if (win.isMinimized()) win.restore();
                win.setOpacity(1);
                win.setAlwaysOnTop(true, 'screen-saver');
                win.setIgnoreMouseEvents(mState.pinned[key] || false, { forward: true });
            }
        } else {
            const win = windowMap[key];
            if (win && !win.isDestroyed()) {
                win.setOpacity(0);
                win.setIgnoreMouseEvents(true);
            }
        }
    }
    saveState(mState);
    if (launcherWin) launcherWin.webContents.send('sync-launcher-ui', mState);
}

// --- SIDEBAR LOGIC ---
function openSidebar() {
    if (launcherWin.isMinimized()) launcherWin.restore();
    launcherWin.setOpacity(1); 
    launcherWin.setIgnoreMouseEvents(false);
    launcherWin.show();
    launcherWin.focus();
    launcherWin.webContents.send('play-open');
    if (handleWin) { handleWin.setOpacity(0); handleWin.setIgnoreMouseEvents(true); }
}

function closeSidebar() {
    launcherWin.webContents.send('play-close');
    launcherWin.setIgnoreMouseEvents(true);
    setTimeout(() => {
        if (launcherWin.isDestroyed()) return;
        launcherWin.setOpacity(0);
        launcherWin.hide(); 
        if (handleWin && !handleWin.isDestroyed()) {
            handleWin.setOpacity(1);
            handleWin.showInactive();
            handleWin.setIgnoreMouseEvents(false);
        }
    }, 300);
}

// --- BOOTSTRAP ---
function createWindows() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    const hw = 24, hh = 60;
    const hb = getBounds('handle', hw, hh, width - hw, Math.floor(height / 2) - 30);

    handleWin = new BrowserWindow({
        width: hw, height: hh, x: hb.x, y: hb.y,
        transparent: true, frame: false, alwaysOnTop: true, resizable: false, skipTaskbar: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    handleWin.loadFile('handle.html');
    handleWin.setAlwaysOnTop(true, 'screen-saver');
    handleWin.on('moved', () => saveBounds('handle', handleWin));

    const LAUNCHER_W = 261;
    const LAUNCHER_H = 460;
    launcherWin = new BrowserWindow({
        width: LAUNCHER_W, height: LAUNCHER_H, x: width - LAUNCHER_W, y: Math.floor(height / 2) - 230,
        transparent: true, frame: false, alwaysOnTop: true, resizable: false, skipTaskbar: true,
        show: true, opacity: 0,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    launcherWin.loadFile('launcher.html');
    launcherWin.setIgnoreMouseEvents(true);
    launcherWin.on('blur', () => { setTimeout(() => { if(!launcherWin.isFocused()) closeSidebar(); }, 200); });

    ipcMain.on('handle-drag-start', () => {
        const cursor = screen.getCursorScreenPoint(), [winX, winY] = handleWin.getPosition();
        handleWin._dragOffset = { x: cursor.x - winX, y: cursor.y - winY };
    });
    ipcMain.on('handle-drag', () => {
        const { width, height } = screen.getPrimaryDisplay().workAreaSize, cursor = screen.getCursorScreenPoint();
        handleWin.setPosition(width - 24, Math.max(0, Math.min(cursor.y - handleWin._dragOffset.y, height - 60)));
    });

    ipcMain.on('resize-launcher', (e, h) => {
        if (!launcherWin || launcherWin.isDestroyed()) return;
        const [w] = launcherWin.getSize();
        const { height: scrH } = screen.getPrimaryDisplay().workAreaSize;
        const newY = Math.floor(scrH / 2) - Math.floor(h / 2);
        launcherWin.setBounds({ width: w, height: h, x: width - w, y: newY });
    });

    for (let key in mState.active) { if (mState.active[key]) getOrCreateWidget(key).setOpacity(1); }
}

// --- IPC HANDLERS ---
app.on('ready', () => {
    const handleWake = () => BrowserWindow.getAllWindows().forEach(w => { if(w.getOpacity()>0) w.showInactive(); });
    powerMonitor.on('resume', handleWake);
    powerMonitor.on('unlock-screen', handleWake);
    globalShortcut.register('CommandOrControl+Shift+D', () => toggleSmartVisibility());
    createWindows();
    tray = new Tray(path.join(__dirname, 'Bunny_Sunny.png'));
    tray.setToolTip('Pixel Widget');
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'Sidebar', click: () => openSidebar() },
        { label: 'Toggle All (Ctrl+Shift+D)', click: () => toggleSmartVisibility() },
        { type: 'separator' },
        { label: 'Thoát', click: () => { isQuiting = true; app.quit(); } }
    ]));
    tray.on('click', openSidebar);

    setTimeout(() => {
        googleService.authenticate().then(() => {
            isGoogleAuthenticated = true;
            if (noteWin && !noteWin.isDestroyed()) noteWin.webContents.send('google-ready');
        });
    }, 2500);
    autoUpdater.checkForUpdates();
});

ipcMain.on('open-sidebar', openSidebar);
ipcMain.on('close-sidebar', closeSidebar);
ipcMain.on('toggle-widget', (e, name, isVisible) => {
    mState.active[name] = isVisible;
    saveState(mState);
    if (isVisible) {
        const win = getOrCreateWidget(name);
        win.setOpacity(1);
        win.setIgnoreMouseEvents(mState.pinned[name] || false, { forward: true });
    } else if (windowMap[name] && !windowMap[name].isDestroyed()) {
        windowMap[name].destroy();
        windowMap[name] = null;
    }
    if (launcherWin) launcherWin.webContents.send('sync-launcher-ui', mState);
});

ipcMain.on('pin-widget', (e, name, isPinned) => {
    mState.pinned[name] = isPinned;
    saveState(mState);
    if (windowMap[name] && !windowMap[name].isDestroyed()) windowMap[name].setIgnoreMouseEvents(isPinned, { forward: true });
});

ipcMain.handle('get-rpg-state', () => getRPGState());
ipcMain.on('rpg-state-update', (e, s) => {
    saveRPGState(s);
    BrowserWindow.getAllWindows().forEach(w => { if (w.webContents && w.webContents !== e.sender) w.webContents.send('rpg-state-sync', s); });
});

ipcMain.handle('get-widget-states', () => mState);
ipcMain.handle('get-calendar-events', (e, v, d) => googleService.getCalendarEvents(v, d));

// --- MISSING HANDLERS RESTORATION ---
ipcMain.handle('get-ip-location', async () => {
    try {
        const d = await backgroundFetch('http://ip-api.com/json/');
        return d.status === 'success' ? { lat: d.lat, lon: d.lon, city: d.city, region: d.regionName, country: d.country } : null;
    } catch(e) { return null; }
});

ipcMain.handle('fetch-apple-calendar', (e, urlStr) => {
    return new Promise((resolve, reject) => {
        const request = net.request(urlStr.replace("webcal://", "https://"));
        request.on("response", (res) => { let d = ""; res.on("data", (c) => d += c); res.on("end", () => resolve(d)); });
        request.on("error", (err) => reject(err));
        request.end();
    });
});

ipcMain.on('pomo-command', (e, cmd, data) => {
    if (cmd === 'start') {
        pomoState.isRunning = true;
        pomoState.timeLeft = (data && data.time !== undefined) ? (isTestMode ? 5 : data.time) : pomoState.timeLeft;
        if (data && data.isBreak !== undefined) pomoState.isBreak = data.isBreak;
        if (data && data.type) pomoState.type = data.type;
        startPomoTick();
    } else if (cmd === 'pause') { pomoState.isRunning = false; if (pomoTimer) clearInterval(pomoTimer); }
    else if (cmd === 'reset') {
        pomoState.isRunning = false; if (pomoTimer) clearInterval(pomoTimer);
        pomoState.timeLeft = isTestMode ? 5 : (data && data.time ? data.time : 1500);
        pomoState.isBreak = false;
    }
    broadcastPomo();
});

ipcMain.on('request-focus', (e, name, needsFocus) => {
    const win = windowMap[name];
    if (win && !win.isDestroyed()) {
        if (needsFocus) { win.setIgnoreMouseEvents(false); win.focus(); }
        else win.setIgnoreMouseEvents(mState.pinned[name] || false, { forward: true });
    }
});

ipcMain.on('toggle-startup', (e, checked) => {
    if (app.isPackaged) {
        app.setLoginItemSettings({
            openAtLogin: checked,
            path: app.getPath('exe')
        });
    } else {
        console.log('[Startup] Skip registry update because app is not packaged.');
    }
});
ipcMain.handle('get-startup', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('is-packaged', () => app.isPackaged);

// G-Tasks
ipcMain.handle('g-get-tasklists', () => googleService.getTaskLists());
ipcMain.handle('g-add-tasklist', (e, t) => googleService.addTaskList(t));
ipcMain.handle('g-remove-tasklist', (e, id) => googleService.removeTaskList(id));
ipcMain.handle('g-get-tasks', (e, id) => googleService.getTasks(id));
ipcMain.handle('g-add-task', (e, t, id) => googleService.addTask(t, id));
ipcMain.handle('g-complete-task', (e, tid, lid) => googleService.completeTask(tid, lid));
ipcMain.handle('g-update-task-status', (e, tid, s, lid) => googleService.updateTaskStatus(lid, tid, s));
ipcMain.handle('g-remove-task', (e, tid, lid) => googleService.removeTask(tid, lid));
ipcMain.handle('g-backup-rpg', (e, d) => googleService.backupRPG(d));
ipcMain.handle('g-restore-rpg', () => googleService.restoreRPG());

app.on('second-instance', () => openSidebar());
app.on('window-all-closed', () => { if (isQuiting) app.quit(); });
app.on('before-quit', () => isQuiting = true);
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindows(); });

let notifiedEventIds = new Set();
let scheduledReminders = [];
ipcMain.on('owl-schedule-reminders', (e, r) => {
    const now = Date.now();
    scheduledReminders = r.filter(rem => rem.notifyAt > now - 60000);
});
setInterval(() => {
    const now = Date.now();
    for (let i = scheduledReminders.length - 1; i >= 0; i--) {
        const r = scheduledReminders[i];
        if (now >= r.notifyAt && !notifiedEventIds.has(r.id)) {
            const { Notification } = require('electron');
            if (Notification.isSupported()) {
                new Notification({ title: '🦉 Cú Mèo nhé (trungdz)', body: `${r.title} lúc ${r.time}` }).show();
                notifiedEventIds.add(r.id);
            }
            scheduledReminders.splice(i, 1);
        }
    }
}, 60000);
