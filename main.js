const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, session, Tray, Menu, ipcMain, screen, dialog, net, globalShortcut, powerMonitor } = require('electron');

// Giảm tải lỗi nghẽn Cache đĩa khi tạo 6 cửa sổ đồ họa thủy tinh (transparent) cùng lúc
app.setAppUserModelId('com.trungdz.pixelwidget');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
// Bật định vị gốc của Windows 10/11 (không bị phụ thuộc Google Maps API Key gây lỗi GPS)
app.commandLine.appendSwitch('enable-features', 'WinrtGeolocationImplementation');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('no-sandbox');

// --- TỐI ƯU HIỆU NĂNG (Bảo Toàn Khung Kính Trong Suốt) ---
// Tăng tốc độ render và giảm tiêu thụ GPU/CPU (Không dùng app.disableHardwareAcceleration() vì sẽ làm mất transparent)
app.commandLine.appendSwitch('enable-gpu-rasterization'); 
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer'); 
app.commandLine.appendSwitch('enable-hardware-overlays');
// Giới hạn bộ nhớ V8 Garbage Collector để tránh Leak RAM khi treo Background quá lâu
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
// Tắt tính năng hạn chế Timer nền (Giúp cho việc đếm ngược / cập nhật thời tiết không bị đứng khi cửa sổ bị khuất)
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-calculate-native-win-occlusion'); // CẤM BĂM KHUNG HÌNH: Tránh bị lỗi tàng hình mất cửa sổ khi không click vào vài tiếng hoặc bị app khác che mất
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows', 'true');

const { autoUpdater } = require('electron-updater');
const googleService = require('./googleService');

// Helper: Fetch using Electron's native network stack (better proxy/DNS support than Node fetch)
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

// Tự động kiểm tra cập nhật (Cấu hình nâng cao)
autoUpdater.autoDownload = true;

autoUpdater.on('checking-for-update', () => {
    console.log('Đang kiểm tra kết nối tới máy chủ cập nhật...');
});

autoUpdater.on('update-available', () => {
    console.log('Phát hiện bản cập nhật mới. Đang tải về ngầm...');
});

autoUpdater.on('error', (err) => {
    console.error('Lỗi trong quá trình cập nhật:', err);
    require('electron').dialog.showErrorBox('Lỗi Cập Nhật (Debug)', `Chi tiết lỗi:\n\n${err == null ? "Không xác định" : (err.stack || err).toString()}`);
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('Tải xuống hoàn tất! Hiển thị thông báo...'); // Debug log
    
    dialog.showMessageBox({
        type: 'info',
        title: 'Cập nhật sẵn sàng',
        message: `Phiên bản mới ${info.version} đã được tải về thành công!`,
        detail: 'Ứng dụng cần khởi động lại để áp dụng các thay đổi mới nhất. Bạn có muốn thực hiện ngay không?',
        buttons: ['Khởi động lại ngay', 'Để sau'],
        defaultId: 0,
        cancelId: 1
    }).then((result) => {
        if (result.response === 0) {
            setImmediate(() => {
                app.removeAllListeners('window-all-closed'); 
                autoUpdater.quitAndInstall(true, true); // true = chớp mắt cài ngầm như Launcher Game (Silent Patch)
            });
        }
    });
});

// Bỏ qua lỗi SSL mạng cho API weather
app.commandLine.appendSwitch('ignore-certificate-errors');

// --- Bounds Manager ---
function getBounds(name, defaultWidth, defaultHeight, defaultX, defaultY) {
    let bounds = { width: defaultWidth, height: defaultHeight, x: defaultX, y: defaultY };
    try {
        const file = path.join(app.getPath('userData'), `${name}-bounds.json`);
        if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (typeof parsed.x === 'number') {
                bounds.x = parsed.x;
                bounds.y = parsed.y;
                // Ưu tiên kích thước mặc định mới để widget không bị 'dài ngoằng' vô lý
                bounds.width = defaultWidth;
                bounds.height = defaultHeight;
            }
        }
    } catch(e) {}

    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    const isVisibleOnAnyDisplay = displays.some(display => {
        const dx = display.bounds.x;
        const dy = display.bounds.y;
        const dw = display.bounds.width;
        const dh = display.bounds.height;
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        return (centerX >= dx && centerX <= dx + dw && centerY >= dy && centerY <= dy + dh);
    });

    if (!isVisibleOnAnyDisplay) {
        console.log(`[Rescue] Display disconnected. Restoring ${name} bounds to defaults.`);
        bounds.x = defaultX;
        bounds.y = defaultY;
    }

    return bounds;
}
function saveBounds(name, win) {
    try {
        fs.writeFileSync(path.join(app.getPath('userData'), `${name}-bounds.json`), JSON.stringify(win.getBounds()));
    } catch(e) {}
}

// --- Ecosystem State Manager ---
const STATE_FILE = path.join(app.getPath('userData'), 'ecosystem-state-v3.json');

function getState() {
    try {
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch(e) {}
    return { 
        active: { weather: false, note: false, plant: false, pet: false },
        pinned: { weather: false, note: false, plant: false, pet: false },
        handleStyle: 'edge'
    };
}

// --- PomoEngine State ---
const pomoState = {
    isRunning: false,
    timeLeft: 1500, // 25p
    isBreak: false,
    type: 'egg', // egg, plant, house, potion
    luckyBonus: 0,
    startTime: 0
};
let pomoTimer = null;
const isTestMode = process.argv.includes('--test-mode');

function broadcastPomo() {
    const wins = BrowserWindow.getAllWindows();
    wins.forEach(w => {
        if (!w.isDestroyed()) {
            w.webContents.send('pomo-sync', {
                ...pomoState,
                isTestMode: isTestMode 
            });
        }
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
            
            // Tự động chuyển chuẩn bị cho giai đoạn tiếp theo
            if (!pomoState.isBreak) {
                // Vừa xong Work -> CHUYỂN SANG BREAK
                pomoState.isBreak = true;
                pomoState.timeLeft = isTestMode ? 5 : 5 * 60;
            } else {
                // Vừa xong Break -> CHUYỂN LẠI WORK
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

let handleWin, launcherWin, weatherWin, noteWin, plantWin, petWin, petWalkWin, calendarWin, tray;
let openSidebar, closeSidebar;
let mState = getState();
if(!mState.active) mState.active = { weather: false, note: false, plant: false, pet: false, calendar: false };
if(mState.active.plant === undefined) mState.active.plant = false;
if(mState.active.pet === undefined) mState.active.pet = false;
if(mState.active.calendar === undefined) mState.active.calendar = false;
if(!mState.pinned) mState.pinned = { weather: false, note: false, plant: false, pet: false, calendar: false };
if(mState.pinned.pet === undefined) mState.pinned.pet = false;
if(mState.pinned.calendar === undefined) mState.pinned.calendar = false;
if(!mState.handleStyle || mState.handleStyle === 'bubble') mState.handleStyle = 'edge';
let isQuiting = false;
let lastActiveState = null;

function updateTrayMenu() {
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Thanh Công Cụ Thông Minh (Smart Sidebar)', enabled: false },
        { type: 'separator' },
        { label: '👁️ Mở lại Widget vừa ẩn (Ctrl+Shift+D)', click: () => toggleSmartVisibility(true) },
        { label: '🙈 Ẩn Widget đang mở (Ctrl+Shift+D)', click: () => toggleSmartVisibility(false) },
        { type: 'separator' },
        { label: '❌ Thoát Hệ Sinh Thái (Quit)', click: () => { isQuiting = true; app.quit(); } }
    ]);
    if (tray) { tray.contextMenu = contextMenu; }
}

function toggleSmartVisibility(forceShow = null) {
    const wins = { weather: weatherWin, note: noteWin, plant: plantWin, pet: petWin, calendar: calendarWin };
    let isCurrentlyShowingAny = Object.values(mState.active).some(v => v === true);
    let shouldShow = forceShow !== null ? forceShow : !isCurrentlyShowingAny;

    if (!shouldShow) {
        lastActiveState = JSON.parse(JSON.stringify(mState.active));
        for (let key in mState.active) mState.active[key] = false;
    } else {
        if (lastActiveState) {
            mState.active = JSON.parse(JSON.stringify(lastActiveState));
        } else {
            mState.active['weather'] = true;
        }
    }

    for (let key in wins) {
        let isShow = mState.active[key];
        if (wins[key]) {
            if (isShow) {
                if (wins[key].isMinimized()) wins[key].restore();
                wins[key].setOpacity(1);
                wins[key].setAlwaysOnTop(true, 'screen-saver');
                try { wins[key].webContents.setFrameRate(60); wins[key].webContents.backgroundThrottling = false; } catch(e){}
                wins[key].setIgnoreMouseEvents(mState.pinned[key] || false, { forward: true });
            } else {
                wins[key].setOpacity(0);
                try { wins[key].webContents.setFrameRate(1); wins[key].webContents.backgroundThrottling = true; } catch(e){}
                wins[key].setIgnoreMouseEvents(true);
            }
        }
    }
    
    saveState(mState);
    if (launcherWin) launcherWin.webContents.send('sync-launcher-ui', mState);
}

function createWindows() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    const hw = 24;
    const hh = 60;
    const handleBounds = getBounds('handle', hw, hh, width - hw, Math.floor(height / 2) - Math.floor(hh/2));
    let initX = width - hw;

    handleWin = new BrowserWindow({
        width: hw, height: hh,
        x: initX, y: handleBounds.y,
        transparent: true, frame: false, alwaysOnTop: true, resizable: false, skipTaskbar: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    handleWin.loadFile('handle.html');
    handleWin.setAlwaysOnTop(true, 'screen-saver'); 
    handleWin.on('moved', () => saveBounds('handle', handleWin));

    const LAUNCHER_H = 460;
    launcherWin = new BrowserWindow({
        width: 261, height: LAUNCHER_H,
        x: width - 261, y: Math.floor(height / 2) - Math.floor(LAUNCHER_H / 2),
        transparent: true, frame: false, alwaysOnTop: true, resizable: false, skipTaskbar: true,
        show: true, opacity: 0,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    launcherWin.loadFile('launcher.html');
    launcherWin.setIgnoreMouseEvents(true);
    launcherWin.setAlwaysOnTop(true, 'screen-saver');

    let lastOpened=0; 
    openSidebar = function() { 
        lastOpened=Date.now(); 
        if (launcherWin.isMinimized()) launcherWin.restore();
        launcherWin.setOpacity(1); 
        launcherWin.setAlwaysOnTop(true, 'screen-saver'); 
        launcherWin.setIgnoreMouseEvents(false);
        launcherWin.show();
        setTimeout(() => launcherWin.focus(), 50); 
        launcherWin.webContents.send('play-open');

        if (handleWin) {
            handleWin.setOpacity(0);
            handleWin.setIgnoreMouseEvents(true);
        }
    }

    closeSidebar = function() {
        launcherWin.webContents.send('play-close');
        launcherWin.setIgnoreMouseEvents(true);
        setTimeout(() => {
            launcherWin.setOpacity(0);
            launcherWin.hide(); 
            if (handleWin && !handleWin.isDestroyed()) {
                if (handleWin.isMinimized()) handleWin.restore();
                handleWin.setOpacity(1);
                handleWin.setAlwaysOnTop(true, 'screen-saver');
                handleWin.showInactive();
                handleWin.setIgnoreMouseEvents(false);
            }
        }, 300);
    }

    ipcMain.on('open-sidebar', openSidebar);
    ipcMain.on('close-sidebar', closeSidebar);
    launcherWin.on('blur', () => { 
        if (Date.now() - lastOpened > 200) {
            closeSidebar();
        } 
    });
    
    let handleDragOffsetX = 0;
    let handleDragOffsetY = 0;

    ipcMain.on('handle-drag-start', () => {
        if (!handleWin) return;
        const cursor = screen.getCursorScreenPoint();
        const [winX, winY] = handleWin.getPosition();
        handleDragOffsetX = cursor.x - winX;
        handleDragOffsetY = cursor.y - winY;
    });

    ipcMain.on('handle-drag', (e) => {
        if (!handleWin) return;
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;
        const cursor = screen.getCursorScreenPoint();
        const [winWidth, winHeight] = handleWin.getSize(); 
        let targetX = width - winWidth; 
        let targetY = Math.max(0, Math.min(cursor.y - handleDragOffsetY, height - winHeight));
        handleWin.setPosition(targetX, targetY);
    });

    ipcMain.on('handle-drag-end', () => {
        if (handleWin) saveBounds('handle', handleWin);
    });

    ipcMain.on('resize-launcher', (e, h) => {
        if (!launcherWin) return;
        const [w] = launcherWin.getSize();
        const { height } = screen.getPrimaryDisplay().workAreaSize;
        const newY = Math.floor(height / 2) - Math.floor(h / 2);
        launcherWin.setBounds({ width: w, height: h, x: launcherWin.getBounds().x, y: newY });
    });

    ipcMain.on('resize-weather', (e, h) => {
        if (!weatherWin) return;
        const bounds = weatherWin.getBounds();
        if (bounds.height !== h) {
            weatherWin.setBounds({ width: bounds.width, height: h, x: bounds.x, y: bounds.y });
        }
    });

    function snapToOthers(currentWin) {
        const SNAP_DIST = 20;
        const bounds = currentWin.getBounds();
        let snappedX = bounds.x;
        let snappedY = bounds.y;
        
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
        
        if (snappedX !== bounds.x || snappedY !== bounds.y) {
            currentWin.setBounds({ width: bounds.width, height: bounds.height, x: snappedX, y: snappedY });
        }
    }

    function createWidget(name, file, defaults, webPrefs, extra = {}) {
        const b = getBounds(name, ...defaults);
        const win = new BrowserWindow({
            width: b.width, height: b.height, x: b.x, y: b.y,
            transparent: true, frame: false, alwaysOnTop: true, resizable: !!extra.resizable, skipTaskbar: true,
            type: 'toolbar',
            show: true, opacity: mState.active[name] ? 1 : 0,
            webPreferences: { backgroundThrottling: false, ...webPrefs },
            ...extra
        });
        
        win.setAlwaysOnTop(true, 'screen-saver');
        win.loadFile(file);
        
        win.webContents.on('render-process-gone', (e, details) => {
            if (details.reason === 'crashed' || details.reason === 'oom' || details.reason === 'killed') {
                console.log(`[Crash Recovery] Auto-reloading ${name} widget due to ${details.reason}`);
                setTimeout(() => { if (!win.isDestroyed()) win.reload(); }, 1500);
            }
        });
        
        win.on('unresponsive', () => {
            console.log(`[Unresponsive] ${name} widget frozen. Reloading...`);
            setTimeout(() => { if (!win.isDestroyed()) win.reload(); }, 500);
        });

        let moveTimeout;
        win.on('move', () => {
            clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
                snapToOthers(win);
                saveBounds(name, win);
            }, 150);
        });

        if (extra.resizable) win.on('resized', () => saveBounds(name, win));

        win.on('minimize', () => {
                mState.active[name] = false;
                saveState(mState);
                win.setOpacity(0);
                try { win.webContents.setFrameRate(1); win.webContents.backgroundThrottling = true; } catch(e){}
                win.setIgnoreMouseEvents(true);
                if (launcherWin && !launcherWin.isDestroyed()) {
                    launcherWin.webContents.send('sync-launcher-ui', mState);
                }
          });

          win.on('close', (e) => {
            if (!isQuiting) {
                e.preventDefault();
                mState.active[name] = false;
                saveState(mState);
                win.setOpacity(0);
                try { win.webContents.setFrameRate(1); win.webContents.backgroundThrottling = true; } catch(e){}
                win.setIgnoreMouseEvents(true);
                if (launcherWin && !launcherWin.isDestroyed()) {
                    launcherWin.webContents.send('sync-launcher-ui', mState);
                }
            }
        });

        if (!mState.active[name]) {
            win.setIgnoreMouseEvents(true);
            try{ win.webContents.setFrameRate(1); win.webContents.backgroundThrottling = true; } catch(e){}
        } else win.setIgnoreMouseEvents(mState.pinned[name] || false, { forward: true });
        return win;
    }

    weatherWin = createWidget('weather', 'index.html', [262, 392, width - 600, 100], {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
    });

    const defNoteX = width - 900;
    noteWin = createWidget('note', 'note.html', [244, 338, defNoteX, weatherWin.getBounds().y], 
        { nodeIntegration: true, contextIsolation: false }, { resizable: false });

    plantWin = createWidget('plant', 'plant.html', [252, 230, width - 350, 100], 
        { nodeIntegration: true, contextIsolation: false });

    petWin = createWidget('pet', 'pet.html', [246, 289, width - 600, 300], 
        { nodeIntegration: true, contextIsolation: false }, { resizable: false });
    petWin.setSize(246, 289); 

    calendarWin = createWidget('calendar', 'calendar.html', [270, 360, width - 600, 600], {
        preload: path.join(__dirname, 'preload.js')
    });
}

app.setAppUserModelId('com.trungdz.pixelwidget');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// ĐẶC QUYỀN CÚ MÈO - TIER 3: Windows Notification (Lưới an toàn 2 lớp: 15p & 5p)
let scheduledReminders = []; // Danh sách mốc thời gian (T-15 và T-5)
let notifiedEventIds = new Set(); // Ghi nhớ ID đã báo để không báo trùng

// Nhịp đập hệ thống: Quét mỗi 60 giây (Cực nhẹ và ổn định)
setInterval(() => {
    const now = Date.now();
    for (let i = scheduledReminders.length - 1; i >= 0; i--) {
        const r = scheduledReminders[i];
        
        if (now >= r.notifyAt && !notifiedEventIds.has(r.id)) {
            const { Notification } = require('electron');
            if (Notification.isSupported()) {
                const notif = new Notification({
                    title: '🦉 Cú Mèo nhắc việc (trungdz)',
                    body: `${r.title} lúc ${r.time} (${r.type === '5p' ? '⚠️ Nhắc nhở cuối' : '🔔 Nhắc trước 15p'})`,
                    icon: path.join(__dirname, 'Bunny_Sunny.png'),
                    silent: false
                });
                notif.show();
                notifiedEventIds.add(r.id);
                console.log(`[Owl] Đã bắn thông báo ${r.type}: ${r.title}`);
            }
            scheduledReminders.splice(i, 1);
        } else if (now >= r.notifyAt) {
            scheduledReminders.splice(i, 1);
        }
    }
    
    if (new Date().getHours() === 4 && new Date().getMinutes() === 0) {
        notifiedEventIds.clear();
    }
}, 60000);

// Hàm xử lý khi máy tính tỉnh dậy (Resume / Unlock)
function handleSystemWake() {
    console.log('[System Wake] Đang làm mới cửa sổ và đồng bộ lại Cú Mèo...');
    const allWins = BrowserWindow.getAllWindows();
    allWins.forEach(w => {
        if (!w || w.isDestroyed()) return;
        const [wW, wH] = w.getSize();
        w.setSize(wW, wH + 1); w.setSize(wW, wH);
        if (w.isMinimized()) w.restore();
        if (w.getOpacity() > 0) {
            w.showInactive();
            w.setAlwaysOnTop(true, 'screen-saver');
        }
    });
}

ipcMain.on('owl-schedule-reminders', (e, reminders) => {
    const now = Date.now();
    scheduledReminders = reminders.filter(r => r.notifyAt > now - 60000);
    console.log(`[Owl] trungdz Engine: Đã nhận ${reminders.length} mốc thông báo (Gồm 15p & 5p).`);
});

ipcMain.on('rpg-state-update', (e, state) => {
    BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed() && w.webContents && !w.webContents.isDestroyed() && w.webContents !== e.sender) {
            w.webContents.send('rpg-state-sync', state);
        }
    });
});

ipcMain.handle('get-widget-states', () => mState);
ipcMain.handle('get-startup', () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle('is-packaged', () => app.isPackaged);

ipcMain.handle("fetch-apple-calendar", (e, urlStr) => {
    return new Promise((resolve, reject) => {
        if (!urlStr) return resolve("");
        let url = urlStr.replace("webcal://", "https://");
        const { net } = require("electron");
        const request = net.request(url);
        request.on("response", (response) => {
            let data = "";
            response.on("data", (chunk) => { data += chunk; });
            response.on("end", () => resolve(data));
        });
        request.on("error", (err) => reject(err));
        request.end();
    });
});

ipcMain.handle('get-calendar-events', async (e, viewType, baseDateIso) => {
    return await googleService.getCalendarEvents(viewType, baseDateIso);
});

ipcMain.on('request-focus', (e, name, needsFocus) => {
    const wMap = { weather: weatherWin, note: noteWin, plant: plantWin, pet: petWin, calendar: calendarWin };
    const win = wMap[name];
    if (win && !win.isDestroyed()) {
        if (needsFocus) {
            win.setIgnoreMouseEvents(false);
            win.focus();
        } else {
            win.setIgnoreMouseEvents(mState.pinned[name] || false, { forward: true });
        }
    }
});

ipcMain.on('toggle-startup', (e, checked) => {
    app.setLoginItemSettings({
        openAtLogin: checked,
        path: app.getPath('exe')
    });
});

ipcMain.on('toggle-widget', (event, name, isVisible) => {
    mState.active[name] = isVisible;
    saveState(mState);
    const wMap = { weather: weatherWin, note: noteWin, plant: plantWin, pet: petWin, calendar: calendarWin };
    if (wMap[name] && !wMap[name].isDestroyed()) {
        if (isVisible) {
            if (wMap[name].isMinimized()) wMap[name].restore();
            wMap[name].setOpacity(1);
            wMap[name].setAlwaysOnTop(true, 'screen-saver');
            try { wMap[name].webContents.setFrameRate(60); wMap[name].webContents.backgroundThrottling = false; } catch(e){}
            wMap[name].setIgnoreMouseEvents(mState.pinned[name] || false, { forward: true });
        } else {
            wMap[name].setOpacity(0);
            try { wMap[name].webContents.setFrameRate(1); wMap[name].webContents.backgroundThrottling = true; } catch(e){}
            wMap[name].setIgnoreMouseEvents(true);
        }
    }
});

ipcMain.on('pin-widget', (event, name, isPinned) => {
    mState.pinned[name] = isPinned;
    saveState(mState);
    const wMap = { weather: weatherWin, note: noteWin, plant: plantWin, pet: petWin, calendar: calendarWin };
    if (wMap[name] && !wMap[name].isDestroyed()) wMap[name].setIgnoreMouseEvents(isPinned, { forward: true });
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
}
app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (launcherWin) {
        openSidebar();
    }
});

app.whenReady().then(() => {
    powerMonitor.on('resume', handleSystemWake);
    powerMonitor.on('unlock-screen', handleSystemWake);

    globalShortcut.register('CommandOrControl+Shift+D', () => {
        toggleSmartVisibility(null);
    });

    setTimeout(() => { autoUpdater.checkForUpdates(); }, 4000);
    createWindows();

    tray = new Tray(path.join(__dirname, 'Bunny_Sunny.png')); 
    tray.setToolTip('Hệ Sinh Thái Pixel - trungdz Edition');
    updateTrayMenu();

    tray.on('right-click', () => { if (tray.contextMenu) tray.popUpContextMenu(tray.contextMenu); });
    tray.on('click', () => { if (launcherWin) openSidebar(); });
    tray.on('double-click', () => { if (launcherWin) openSidebar(); });

    setTimeout(() => {
        googleService.authenticate().then(() => {
            console.log("==> GOOGLE API HOÀN TẤT KẾT NỐI!");
            if (noteWin) noteWin.webContents.send('google-ready');
        }).catch(err => console.log("Hỏng Google Auth:", err));
    }, 2500);

    ipcMain.handle('g-get-tasklists', async () => await googleService.getTaskLists());
    ipcMain.handle('g-add-tasklist', async (e, title) => await googleService.addTaskList(title));
    ipcMain.handle('g-remove-tasklist', async (e, listId) => await googleService.removeTaskList(listId));
    ipcMain.handle('g-get-tasks', async (e, listId) => await googleService.getTasks(listId));
    ipcMain.handle('g-add-task', async (e, title, listId) => await googleService.addTask(title, listId));
    ipcMain.handle('g-complete-task', async (e, id, listId) => await googleService.completeTask(id, listId));
    ipcMain.handle('g-update-task-status', async (e, taskId, status, listId) => await googleService.updateTaskStatus(listId, taskId, status));
    ipcMain.handle('g-remove-task', async (e, id, listId) => await googleService.removeTask(id, listId));
    ipcMain.handle('g-backup-rpg', async (e, data) => await googleService.backupRPG(data));
    ipcMain.handle('g-restore-rpg', async () => await googleService.restoreRPG());
    
    // --- PomoEngine listeners ---
    ipcMain.on('pomo-command', (e, cmd, data) => {
        if (cmd === 'start') {
            pomoState.isRunning = true;
            let time = (data && data.time !== undefined) ? data.time : pomoState.timeLeft;
            if (isTestMode) time = 5; 
            pomoState.timeLeft = time;
            if (data && data.isBreak !== undefined) pomoState.isBreak = data.isBreak;
            if (data && data.type) pomoState.type = data.type;
            
            startPomoTick(); 
        } else if (cmd === 'pause') {
            pomoState.isRunning = false;
            if (pomoTimer) clearInterval(pomoTimer);
        } else if (cmd === 'reset') {
            pomoState.isRunning = false;
            if (pomoTimer) clearInterval(pomoTimer);
            let time = (data && data.time) ? data.time : 1500;
            if (isTestMode) time = 5; 
            pomoState.timeLeft = time;
            if (data && data.type) pomoState.type = data.type;
            pomoState.isBreak = false;
        } else if (cmd === 'sync') {
            broadcastPomo();
        }
        broadcastPomo();
    });
    
    ipcMain.handle('get-ip-location', async () => {
        try {
            const data = await backgroundFetch('http://ip-api.com/json/');
            if(data.status === 'success') {
                return { lat: data.lat, lon: data.lon, city: data.city, region: data.regionName, country: data.country };
            }
        } catch(e) {}
        return null;
    });

    session.defaultSession.setPermissionRequestHandler((webContents, prop, callback) => {
        callback(prop === 'geolocation');
    });

    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
        (details, callback) => {
            details.requestHeaders['Origin'] = 'https://www.youtube.com';
            details.requestHeaders['Referer'] = 'https://www.youtube.com/';
            callback({ requestHeaders: details.requestHeaders });
        }
    );
});

app.on('before-quit', () => isQuiting = true);
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuiting) {
        app.quit();
    }
});
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
});

