const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, session, Tray, Menu, ipcMain, screen, dialog, net, globalShortcut } = require('electron');

// Gi?m t?i l?i ngh?n Cache dia khi t?o 6 c?a s? d? h?a thu? tinh (transparent) c?ng l?c
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
// Bật định vị gốc của Windows 10/11 (không bị phụ thuộc Google Maps API Key gây lỗi GPS)
app.commandLine.appendSwitch('enable-features', 'WinrtGeolocationImplementation');

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

// T? d?ng ki?m tra c?p nh?t (C?u h?nh n?ng cao)
autoUpdater.autoDownload = true;

autoUpdater.on('checking-for-update', () => {
    console.log('?ang ki?m tra k?t n?i t?i m?y ch? c?p nh?t...');
});

autoUpdater.on('update-available', () => {
    console.log('Ph?t hi?n b?n c?p nh?t m?i. ?ang t?i v? ng?m...');
});

autoUpdater.on('error', (err) => {
    console.error('Lỗi trong quá trình cập nhật:', err);
    require('electron').dialog.showErrorBox('Lỗi Cập Nhật (Debug)', `Chi tiết lỗi:\n\n${err == null ? "Không xác định" : (err.stack || err).toString()}`);
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('T?i xu?ng ho?n t?t! Hi?n th? th?ng b?o...'); // Debug log
    
    // T?m th?i b? di process.platform check d? don gi?n ho? message
    // Hi?n th? h?p tho?i y?u c?u ngu?i d?ng x?c nh?n
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
                app.removeAllListeners('window-all-closed'); // Ngan ch?n s? ki?n d?ng c?a s? m?c d?nh
                autoUpdater.quitAndInstall(true, true); // true = chớp mắt cài ngầm như Launcher Game (Silent Patch)
            });
        }
    });
});

// B? qua l?i SSL m?ng cho API weather
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
                // Cố định Width/Height từ thông số hệ thống, KHÔNG lấy từ bộ nhớ đệm cũ (để chống lỗi dư khoảng trống)
            }
        }
    } catch(e) {}

    // Auto-rescue logic: Bring off-screen windows back to main screen
    const { screen } = require('electron'); // make sure screen is available
    const displays = screen.getAllDisplays();
    const isVisibleOnAnyDisplay = displays.some(display => {
        const dx = display.bounds.x;
        const dy = display.bounds.y;
        const dw = display.bounds.width;
        const dh = display.bounds.height;
        // Check if bounds center is within this display
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
        handleStyle: 'bubble'
    };
}
function saveState(s) {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch(e) {}
}

let handleWin, launcherWin, weatherWin, noteWin, plantWin, petWin, petWalkWin, tray;
let mState = getState();
// Migrate old configs safely
if(!mState.active) mState.active = { weather: false, note: false, plant: false, pet: false };
if(mState.active.plant === undefined) mState.active.plant = false;
if(mState.active.pet === undefined) mState.active.pet = false;
if(!mState.pinned) mState.pinned = { weather: false, note: false, plant: false, pet: false };
if(mState.pinned.pet === undefined) mState.pinned.pet = false;
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
    if (tray) tray.setContextMenu(contextMenu);
}

function toggleSmartVisibility(forceShow = null) {
    const wins = { weather: weatherWin, note: noteWin, plant: plantWin, pet: petWin };
    
    // Nếu forceShow = null (từ phím tắt), sẽ Đóng nếu đang có widget mở, và Mở nếu mọi thứ đang ẩn
    let isCurrentlyShowingAny = Object.values(mState.active).some(v => v === true);
    let shouldShow = forceShow !== null ? forceShow : !isCurrentlyShowingAny;

    if (!shouldShow) {
        // Đang ra lệnh Ẩn -> Lưu lại ngay trạng thái để lần sau phục hồi
        lastActiveState = JSON.parse(JSON.stringify(mState.active));
        for (let key in mState.active) mState.active[key] = false;
    } else {
        // Đang ra lệnh Hiện -> Lấy lại trạng thái đã lưu
        if (lastActiveState) {
            mState.active = JSON.parse(JSON.stringify(lastActiveState));
        } else {
            // Không có lịch sử thì mặc định bật lại cái thời tiết làm gốc
            mState.active['weather'] = true;
        }
    }

    // Áp dụng độ mờ và tương tác chuột vào danh sách cửa sổ
    for (let key in wins) {
        let isShow = mState.active[key];
        if (wins[key]) {
            if (isShow) {
                if (wins[key].isMinimized()) wins[key].restore();
                wins[key].setOpacity(1);
                wins[key].setIgnoreMouseEvents(mState.pinned[key] || false, { forward: true });
            } else {
                wins[key].setOpacity(0);
                wins[key].setIgnoreMouseEvents(true);
            }
        }
    }
    
    saveState(mState);
    if (launcherWin) launcherWin.webContents.send('sync-launcher-ui', mState);
}

function createWindows() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    // 0. Tai Th?
    const isEdge = mState.handleStyle === 'edge';
    const hw = isEdge ? 24 : 50;
    const hh = isEdge ? 60 : 50;

    const handleBounds = getBounds('handle', hw, hh, width - hw, Math.floor(height / 2) - Math.floor(hh/2));
    
    // ?p v? tr? khi dang ? B?m L? Ph?i (d? ph?ng tru?c d? luu to? d? b?ng n?i r?i d?i state)
    let initX = handleBounds.x;
    if (isEdge) initX = width - hw;

    handleWin = new BrowserWindow({
        width: hw, height: hh,
        x: initX, y: handleBounds.y,
        transparent: true, frame: false, alwaysOnTop: true, resizable: false, skipTaskbar: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    handleWin.loadFile('handle.html');
    handleWin.setAlwaysOnTop(true, 'screen-saver'); 
    handleWin.on('moved', () => saveBounds('handle', handleWin));

    // 0.5 B?ng di?u khi?n ? Chi?u cao 460px t?nh to?n ch?nh x?c t? CSS (kh?ng resize d?ng)
    // title(42) + 4?widget(224) + 3?gap(24) + settings(42) + footer(56) + padding+border(36) + d? ph?ng(36) = 460
    const LAUNCHER_H = 460;
    launcherWin = new BrowserWindow({
        width: 261, height: LAUNCHER_H,
        x: width - 261, y: Math.floor(height / 2) - Math.floor(LAUNCHER_H / 2),
        transparent: true, frame: false, alwaysOnTop: true, resizable: false, skipTaskbar: true,
        show: true, opacity: 0, // Gi?i ph?p t?i thu?ng: Render s?n nhung Kh?ng hi?n th? d? s?ng!
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    launcherWin.loadFile('launcher.html');
    launcherWin.setIgnoreMouseEvents(true); // Kho? Tuong t?c chu?t khi dang T?ng h?nh
    launcherWin.setAlwaysOnTop(true, 'screen-saver');

    function openSidebar() {
        launcherWin.setOpacity(1); // Tri?u h?i b?ng GPU c?c mu?t
        launcherWin.setIgnoreMouseEvents(false);
        launcherWin.focus();

        if (handleWin) {
            handleWin.setOpacity(0);
            handleWin.setIgnoreMouseEvents(true);
        }
    }

    function closeSidebar() {
        // R?t th?
        launcherWin.setOpacity(0);
        launcherWin.setIgnoreMouseEvents(true);

        if (handleWin) {
            handleWin.setOpacity(1);
            handleWin.setIgnoreMouseEvents(false);
        }
    }

    ipcMain.on('open-sidebar', openSidebar);
    ipcMain.on('close-sidebar', closeSidebar);
    launcherWin.on('blur', closeSidebar);
    
    ipcMain.handle('get-handle-style', () => mState.handleStyle);

    ipcMain.on('change-handle-style', (e, styleName) => {
        mState.handleStyle = styleName;
        saveState(mState);
        if (handleWin) {
            handleWin.webContents.send('set-style', styleName);
            const { width, height } = screen.getPrimaryDisplay().workAreaSize;
            let [curX, curY] = handleWin.getPosition();
            
            if (styleName === 'edge') {
                handleWin.setSize(24, 60);
                handleWin.setPosition(width - 24, curY);
            } else {
                handleWin.setSize(50, 50);
                // ??m b?o kh?ng b? l?t ra ngo?i khi t? Edge (24px width) sang Bubble (50px width)
                if (curX > width - 50) {
                    handleWin.setPosition(width - 50, curY);
                }
            }
            saveBounds('handle', handleWin);
        }
    });

    // Custom JS Dragging cho Tai th? (Logic ch?n m?p m?n h?nh c? di?n)
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

        // Kh?ng cho vu?t ra kh?i 4 m?p hi?n th?
        const [winWidth, winHeight] = handleWin.getSize(); let targetX = Math.max(0, Math.min(cursor.x - handleDragOffsetX, width - winWidth));
        let targetY = Math.max(0, Math.min(cursor.y - handleDragOffsetY, height - winHeight));
        // N?U dang ? Ch? d? B?m C?nh -> C? d?nh tr?c X v?o l? Pk?i
        if (mState.handleStyle === 'edge') {
            targetX = width - winWidth;
        }

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

    // Resize Weather
    ipcMain.on('resize-weather', (e, h) => {
        if (!weatherWin) return;
        const bounds = weatherWin.getBounds();
        if (bounds.height !== h) {
            weatherWin.setBounds({ width: bounds.width, height: h, x: bounds.x, y: bounds.y });
        }
    });

    // Helper: Trọng lực Nam Châm (Magnetic Snap)
    function snapToOthers(currentWin) {
        const SNAP_DIST = 20;
        const bounds = currentWin.getBounds();
        let snappedX = bounds.x;
        let snappedY = bounds.y;
        
        BrowserWindow.getAllWindows().forEach(other => {
            if (other === currentWin || !other.isVisible()) return;
            const ob = other.getBounds();
            
            // Cạnh trái chạm Cạnh phải
            if (Math.abs(bounds.x - (ob.x + ob.width)) < SNAP_DIST) snappedX = ob.x + ob.width - 12; // -12 để đè bóng đổ lên nhau
            // Cạnh phải chạm Cạnh trái
            if (Math.abs((bounds.x + bounds.width) - ob.x) < SNAP_DIST) snappedX = ob.x - bounds.width + 12;
            
            // Cạnh trên chạm Cạnh dưới
            if (Math.abs(bounds.y - (ob.y + ob.height)) < SNAP_DIST) snappedY = ob.y + ob.height - 12;
            // Cạnh dưới chạm Cạnh trên
            if (Math.abs((bounds.y + bounds.height) - ob.y) < SNAP_DIST) snappedY = ob.y - bounds.height + 12;
            
            // Chiều dọc thẳng hàng (Gióng lề trái/phải)
            if (Math.abs(bounds.x - ob.x) < SNAP_DIST) snappedX = ob.x;
            if (Math.abs(bounds.y - ob.y) < SNAP_DIST) snappedY = ob.y;
        });
        
        if (snappedX !== bounds.x || snappedY !== bounds.y) {
            currentWin.setBounds({ width: bounds.width, height: bounds.height, x: snappedX, y: snappedY });
        }
    }

    // Helper: T?o c?a s? widget ti?u chu?n
    function createWidget(name, file, defaults, webPrefs, extra = {}) {
        const b = getBounds(name, ...defaults);
        const win = new BrowserWindow({
            width: b.width, height: b.height, x: b.x, y: b.y,
            transparent: true, frame: false, alwaysOnTop: true, resizable: !!extra.resizable, skipTaskbar: true,
            show: true, opacity: mState.active[name] ? 1 : 0,
            webPreferences: webPrefs,
            ...extra
        });
        win.loadFile(file);
        
        let moveTimeout;
        win.on('move', () => {
            clearTimeout(moveTimeout);
            moveTimeout = setTimeout(() => {
                snapToOthers(win);
                saveBounds(name, win);
            }, 150); // Hít sau khi nhả chuột một chút để không giật lag
        });

        if (extra.resizable) win.on('resized', () => saveBounds(name, win));

        win.on('close', (e) => {
            if (!isQuiting) {
                e.preventDefault();
                mState.active[name] = false;
                saveState(mState);
                win.setOpacity(0);
                win.setIgnoreMouseEvents(true);
                if (launcherWin && !launcherWin.isDestroyed()) {
                    launcherWin.webContents.send('sync-launcher-ui', mState);
                }
            }
        });

        if (!mState.active[name]) win.setIgnoreMouseEvents(true);
        else win.setIgnoreMouseEvents(mState.pinned[name] || false, { forward: true });
        return win;
    }

    // 1. Weather (Width 327 ôm khít margin + shadow)
    weatherWin = createWidget('weather', 'index.html', [327, 490, width - 600, 100], {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
    });

    // 2. Sổ Nhiệm Vụ (Chiều rộng bù margin 11px)
    const defNoteX = width - 900;
    noteWin = createWidget('note', 'note.html', [271, 300, defNoteX, weatherWin.getBounds().y], 
        { nodeIntegration: true, contextIsolation: false }, { resizable: false });

    // 3. Plant (Tamagotchi / Pomodoro Lofi) (Chiều rộng + chiều cao bù 11px margin tàng hình)
    plantWin = createWidget('plant', 'plant.html', [271, 241, width - 350, 100], 
        { nodeIntegration: true, contextIsolation: false });

    // 4. Pet (Thú Cưng RPG) (Chiều rộng + chiều cao bù 11px margin tàng hình)
    petWin = createWidget('pet', 'pet.html', [341, 401, width - 600, 300], 
        { nodeIntegration: true, contextIsolation: false }, { resizable: false });
    petWin.setSize(341, 401); // Hard fix for pet size
}

// GUI Comm Channels
ipcMain.on('weather-update', (e, data) => {
    if (petWin && !petWin.isDestroyed() && petWin.webContents) petWin.webContents.send('weather-impact', data);
    if (plantWin && !plantWin.isDestroyed() && plantWin.webContents) plantWin.webContents.send('weather-impact', data);
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

ipcMain.on('toggle-startup', (e, checked) => {
    app.setLoginItemSettings({
        openAtLogin: checked,
        path: app.getPath('exe')
    });
});

ipcMain.on('toggle-widget', (event, name, isVisible) => {
    mState.active[name] = isVisible;
    saveState(mState);
    const wMap = { weather: weatherWin, note: noteWin, plant: plantWin, pet: petWin };
    if (wMap[name] && !wMap[name].isDestroyed()) {
        if (isVisible) {
            if (wMap[name].isMinimized()) wMap[name].restore();
            wMap[name].setOpacity(1);
            wMap[name].setIgnoreMouseEvents(mState.pinned[name] || false, { forward: true });
        } else {
            wMap[name].setOpacity(0);
            wMap[name].setIgnoreMouseEvents(true);
        }
    }
});

ipcMain.on('pin-widget', (event, name, isPinned) => {
    mState.pinned[name] = isPinned;
    saveState(mState);
    const wMap = { weather: weatherWin, note: noteWin, plant: plantWin, pet: petWin };
    if (wMap[name] && !wMap[name].isDestroyed()) wMap[name].setIgnoreMouseEvents(isPinned, { forward: true });
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
}

app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (launcherWin) {
        launcherWin.setOpacity(1);
        launcherWin.setIgnoreMouseEvents(false);
        launcherWin.focus();
    }
});

app.whenReady().then(() => {
    // Đăng ký Phím tắt Toàn Cầu để Ẩn / Mở lại thông minh (Ctrl+Shift+D)
    globalShortcut.register('CommandOrControl+Shift+D', () => {
        toggleSmartVisibility(null);
    });

    // Ki?m tra v? th?ng b?o c?p nh?t ngay khi m?
    setTimeout(() => { autoUpdater.checkForUpdates(); }, 4000);

    // UU TI?N S? 1: Ph?ng ra giao di?n nhanh ngay l?p t?c!
    createWindows();

    tray = new Tray(path.join(__dirname, 'Bunny_Sunny.png')); 
    tray.setToolTip('H? Sinh Th?i Pixel by Nashallery');
    updateTrayMenu();

    // UU TI?N S? 2: Khi Giao di?n Graphic d? k?t xu?t xong xu?i, b?t d?u ch?c Cloud l?y d? li?u
    // Tr? ho?n k?o d?i th?nh G?n 3 gi?y (2500ms) d? H? di?u h?nh d?p xong Khung C?a S?, Tuy?t d?i mu?t m?
    setTimeout(() => {
        googleService.authenticate().then(() => {
            console.log("==> GOOGLE B?A CH? ?? HO?N T?T K?T N?I!");
            if (noteWin) noteWin.webContents.send('google-ready');
        }).catch(err => console.log("Google Auth h?ng:", err));
    }, 2500);

    // =============== Google IPC C?u N?i API ===============
    ipcMain.handle('g-get-tasks', async () => await googleService.getTasks());
    ipcMain.handle('g-add-task', async (e, title) => await googleService.addTask(title));
    ipcMain.handle('g-complete-task', async (e, id) => await googleService.completeTask(id));
    ipcMain.handle('g-remove-task', async (e, id) => await googleService.removeTask(id));
    
    // Đám mây
    ipcMain.handle('g-backup-rpg', async (e, data) => await googleService.backupRPG(data));
    ipcMain.handle('g-restore-rpg', async () => await googleService.restoreRPG());
    
    // API ??nh v? IP (Node.js Fetch Bypass CORS)
    ipcMain.handle('get-ip-location', async () => {
        console.log('[Main] Getting IP Location via Electron Net...');
        try {
            // Priority 0: ip-api.com (Very reliable, HTTP allowed in Node)
            const data = await backgroundFetch('http://ip-api.com/json/');
            if(data.status === 'success') {
                console.log('[Main] IP Location success via ip-api.com');
                return { lat: data.lat, lon: data.lon, city: data.city, region: data.regionName, country: data.country };
            }
        } catch(e) { console.log('[Main] IP Fallback 0 failed (Status/Net):', e.message); }

        try {
            // Priority 1: ipwho.is (Fast, detailed)
            const data = await backgroundFetch('https://ipwho.is/');
            if(data.success) {
                console.log('[Main] IP Location success via ipwho.is');
                return { lat: data.latitude, lon: data.longitude, city: data.city, region: data.region, country: data.country };
            }
        } catch(e) { console.log('[Main] IP Fallback 1 failed (Status/Net):', e.message); }

        try {
            // Priority 2: ipapi.co (Backup)
            const data = await backgroundFetch('https://ipapi.co/json/');
            console.log('[Main] IP Location success via ipapi.co');
            return { lat: data.latitude, lon: data.longitude, city: data.city, region: data.region, country: data.country_name };
        } catch(e) { console.log('[Main] IP Fallback 2 failed (Status/Net):', e.message); }

        console.log('[Main] All IP Location services failed.');
        return null;
    });
    // =======================================================

    session.defaultSession.setPermissionRequestHandler((webContents, prop, callback) => {
        callback(prop === 'geolocation');
    });

    // B? kho? (Bypass) gi?i h?n nh?ng c?a YouTube (L?i 153 / L?i hi?n th? video)
    // Gi? m?o Header b?o c?o Origin l? ch?nh trang Youtube d? qua m?t h? th?ng ki?m duy?t!
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: ['*://*.youtube.com/*', '*://*.youtube-nocookie.com/*'] },
        (details, callback) => {
            details.requestHeaders['Origin'] = 'https://www.youtube.com';
            details.requestHeaders['Referer'] = 'https://www.youtube.com/';
            callback({ requestHeaders: details.requestHeaders });
        }
    );

    // Kh?i t?o th?nh c?ng!
});

app.on('before-quit', () => isQuiting = true);
app.on('will-quit', () => globalShortcut.unregisterAll());

// Lazy Event Listeners (Bảo lưu RAM)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuiting) {
        app.quit();
    }
});

app.on('activate', () => {
    // macOS: Tạo lại Windows nếu click vào Dock icon
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
});
