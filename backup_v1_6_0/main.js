const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, session, Tray, Menu, ipcMain, screen, dialog, net, globalShortcut, powerMonitor } = require('electron');

// Gi?m t?i l?i ngh?n Cache dia khi t?o 6 c?a s? d? h?a thu? tinh (transparent) c?ng l?c
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
// Báº­t Ä‘á»‹nh vá»‹ gá»‘c cá»§a Windows 10/11 (khÃ´ng bá»‹ phá»¥ thuá»™c Google Maps API Key gÃ¢y lá»—i GPS)
app.commandLine.appendSwitch('enable-features', 'WinrtGeolocationImplementation');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling,MediaSessionService,AudioServiceOutOfProcess');
app.commandLine.appendSwitch('disable-dev-shm-usage');
app.commandLine.appendSwitch('no-sandbox');

// --- Tá»I Æ¯U HIá»†U NÄ‚NG (Báº£o ToÃ n Khung KÃ­nh Trong Suá»‘t) ---
// TÄƒng tá»‘c Ä‘á»™ render vÃ  giáº£m tiÃªu thá»¥ GPU/CPU (KhÃ´ng dÃ¹ng app.disableHardwareAcceleration() vÃ¬ sáº½ lÃ m máº¥t transparent)
app.commandLine.appendSwitch('enable-gpu-rasterization'); 
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('disable-software-rasterizer'); 
app.commandLine.appendSwitch('enable-hardware-overlays');
// Giá»›i háº¡n bá»™ nhá»› V8 Garbage Collector Ä‘á»ƒ trÃ¡nh Leak RAM khi treo Background quÃ¡ lÃ¢u
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
// Táº¯t tÃ­nh nÄƒng háº¡n cháº¿ Timer ná»n (GiÃºp cho viá»‡c Ä‘áº¿m ngÆ°á»£c / cáº­p nháº­t thá»i tiáº¿t khÃ´ng bá»‹ Ä‘á»©ng khi cá»­a sá»• bá»‹ khuáº¥t)
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-calculate-native-win-occlusion'); // Cáº¤M BÄ‚M KHUNG HÃŒNH: TrÃ¡nh bá»‹ lá»—i tÃ ng hÃ¬nh máº¥t cá»­a sá»• khi khÃ´ng click vÃ o vÃ i tiáº¿ng hoáº·c bá»‹ app khÃ¡c che máº¥t
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

// T? d?ng ki?m tra c?p nh?t (C?u h?nh n?ng cao)
autoUpdater.autoDownload = true;

autoUpdater.on('checking-for-update', () => {
    console.log('?ang ki?m tra k?t n?i t?i m?y ch? c?p nh?t...');
});

autoUpdater.on('update-available', () => {
    console.log('Ph?t hi?n b?n c?p nh?t m?i. ?ang t?i v? ng?m...');
});

autoUpdater.on('error', (err) => {
    console.error('Lá»—i trong quÃ¡ trÃ¬nh cáº­p nháº­t:', err);
    require('electron').dialog.showErrorBox('Lá»—i Cáº­p Nháº­t (Debug)', `Chi tiáº¿t lá»—i:\n\n${err == null ? "KhÃ´ng xÃ¡c Ä‘á»‹nh" : (err.stack || err).toString()}`);
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('T?i xu?ng ho?n t?t! Hi?n th? th?ng b?o...'); // Debug log
    
    // T?m th?i b? di process.platform check d? don gi?n ho? message
    // Hi?n th? h?p tho?i y?u c?u ngu?i d?ng x?c nh?n
    dialog.showMessageBox({
        type: 'info',
        title: 'Cáº­p nháº­t sáºµn sÃ ng',
        message: `PhiÃªn báº£n má»›i ${info.version} Ä‘Ã£ Ä‘Æ°á»£c táº£i vá» thÃ nh cÃ´ng!`,
        detail: 'á»¨ng dá»¥ng cáº§n khá»Ÿi Ä‘á»™ng láº¡i Ä‘á»ƒ Ã¡p dá»¥ng cÃ¡c thay Ä‘á»•i má»›i nháº¥t. Báº¡n cÃ³ muá»‘n thá»±c hiá»‡n ngay khÃ´ng?',
        buttons: ['Khá»Ÿi Ä‘á»™ng láº¡i ngay', 'Äá»ƒ sau'],
        defaultId: 0,
        cancelId: 1
    }).then((result) => {
        if (result.response === 0) {
            setImmediate(() => {
                app.removeAllListeners('window-all-closed'); // Ngan ch?n s? ki?n d?ng c?a s? m?c d?nh
                autoUpdater.quitAndInstall(true, true); // true = chá»›p máº¯t cÃ i ngáº§m nhÆ° Launcher Game (Silent Patch)
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
                // Cá»‘ Ä‘á»‹nh Width/Height tá»« thÃ´ng sá»‘ há»‡ thá»‘ng, KHÃ”NG láº¥y tá»« bá»™ nhá»› Ä‘á»‡m cÅ© (Ä‘á»ƒ chá»‘ng lá»—i dÆ° khoáº£ng trá»‘ng)
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
        handleStyle: 'edge'
    };
}
function saveState(s) {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(s)); } catch(e) {}
}

let handleWin, launcherWin, weatherWin, noteWin, plantWin, petWin, petWalkWin, calendarWin, tray;
let openSidebar, closeSidebar;
let mState = getState();
// Migrate old configs safely
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
    
    // Náº¿u forceShow = null (tá»« phÃ­m táº¯t), sáº½ ÄÃ³ng náº¿u Ä‘ang cÃ³ widget má»Ÿ, vÃ  Má»Ÿ náº¿u má»i thá»© Ä‘ang áº©n
    let isCurrentlyShowingAny = Object.values(mState.active).some(v => v === true);
    let shouldShow = forceShow !== null ? forceShow : !isCurrentlyShowingAny;

    if (!shouldShow) {
        // Äang ra lá»‡nh áº¨n -> LÆ°u láº¡i ngay tráº¡ng thÃ¡i Ä‘á»ƒ láº§n sau phá»¥c há»“i
        lastActiveState = JSON.parse(JSON.stringify(mState.active));
        for (let key in mState.active) mState.active[key] = false;
    } else {
        // Äang ra lá»‡nh Hiá»‡n -> Láº¥y láº¡i tráº¡ng thÃ¡i Ä‘Ã£ lÆ°u
        if (lastActiveState) {
            mState.active = JSON.parse(JSON.stringify(lastActiveState));
        } else {
            // KhÃ´ng cÃ³ lá»‹ch sá»­ thÃ¬ máº·c Ä‘á»‹nh báº­t láº¡i cÃ¡i thá»i tiáº¿t lÃ m gá»‘c
            mState.active['weather'] = true;
        }
    }

    // Ãp dá»¥ng Ä‘á»™ má» vÃ  tÆ°Æ¡ng tÃ¡c chuá»™t vÃ o danh sÃ¡ch cá»­a sá»•
    for (let key in wins) {
        let isShow = mState.active[key];
        if (wins[key]) {
            if (isShow) {
                if (wins[key].isMinimized()) wins[key].restore();
                wins[key].setOpacity(1);
                // Force always on top again
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

    // 0. Tai Th?
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

let lastOpened=0; openSidebar = function() { lastOpened=Date.now(); 
        if (launcherWin.isMinimized()) launcherWin.restore();
        launcherWin.setOpacity(1); // Triệu hồi bằng GPU cực muợt
        launcherWin.setAlwaysOnTop(true, 'screen-saver'); // Chống mất ưu tiên 
        launcherWin.setIgnoreMouseEvents(false);
        launcherWin.show();
        setTimeout(() => launcherWin.focus(), 50); // Delay lấy focus ngắn lại
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
            launcherWin.hide(); // Ẩn hoàn toàn để loại khỏi vòng lặp Focus của OS
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
        targetX = width - winWidth;

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

    // Helper: Trá»ng lá»±c Nam ChÃ¢m (Magnetic Snap)
    function snapToOthers(currentWin) {
        const SNAP_DIST = 20;
        const bounds = currentWin.getBounds();
        let snappedX = bounds.x;
        let snappedY = bounds.y;
        
        BrowserWindow.getAllWindows().forEach(other => {
            if (other === currentWin || !other.isVisible()) return;
            const ob = other.getBounds();
            
            // Cáº¡nh trÃ¡i cháº¡m Cáº¡nh pháº£i
            if (Math.abs(bounds.x - (ob.x + ob.width)) < SNAP_DIST) snappedX = ob.x + ob.width - 12; // -12 Ä‘á»ƒ Ä‘Ã¨ bÃ³ng Ä‘á»• lÃªn nhau
            // Cáº¡nh pháº£i cháº¡m Cáº¡nh trÃ¡i
            if (Math.abs((bounds.x + bounds.width) - ob.x) < SNAP_DIST) snappedX = ob.x - bounds.width + 12;
            
            // Cáº¡nh trÃªn cháº¡m Cáº¡nh dÆ°á»›i
            if (Math.abs(bounds.y - (ob.y + ob.height)) < SNAP_DIST) snappedY = ob.y + ob.height - 12;
            // Cáº¡nh dÆ°á»›i cháº¡m Cáº¡nh trÃªn
            if (Math.abs((bounds.y + bounds.height) - ob.y) < SNAP_DIST) snappedY = ob.y - bounds.height + 12;
            
            // Chiá»u dá»c tháº³ng hÃ ng (GiÃ³ng lá» trÃ¡i/pháº£i)
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
            type: 'toolbar',
            show: true, opacity: mState.active[name] ? 1 : 0,
            webPreferences: { backgroundThrottling: false, ...webPrefs },
            ...extra
        });
        
        // Gia cá»‘ CÆ°á»¡ng Cháº¿ widget á»Ÿ lá»›p Screen-Saver Ä‘á»ƒ khÃ´ng bao giá» bá»‹ Ä‘Ã¨ mÆ°á»£n bá»Ÿi Fullscreen Apps
        win.setAlwaysOnTop(true, 'screen-saver');
        win.loadFile(file);
        
        // CÆ¡ cháº¿ phá»¥c há»“i Widget náº¿u GPU hoáº·c Ram gÃ¢y Crash áº©n khung hÃ¬nh
        win.webContents.on('render-process-gone', (e, details) => {
            if (details.reason === 'crashed' || details.reason === 'oom' || details.reason === 'killed') {
                console.log(`[Crash Recovery] Auto-reloading ${name} widget due to ${details.reason}`);
                setTimeout(() => { if (!win.isDestroyed()) win.reload(); }, 1500);
            }
        });
        
        // KhÃ´ng pháº£i lÃ  Crash mÃ  chá»‰ Ä‘Æ¡ lÃµi JS (Unresponsive) do Ä‘á»ƒ background quÃ¡ lÃ¢u
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
            }, 150); // HÃ­t sau khi nháº£ chuá»™t má»™t chÃºt Ä‘á»ƒ khÃ´ng giáº­t lag
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
    }
        else win.setIgnoreMouseEvents(mState.pinned[name] || false, { forward: true });
        return win;
    }

    // 1. Weather (Width 327 Ã´m khÃ­t margin + shadow)
    weatherWin = createWidget('weather', 'index.html', [327, 490, width - 600, 100], {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
    });

    // 2. Sá»• Nhiá»‡m Vá»¥ (Chiá»u rá»™ng bÃ¹ margin 11px)
    const defNoteX = width - 900;
    noteWin = createWidget('note', 'note.html', [271, 375, defNoteX, weatherWin.getBounds().y], 
        { nodeIntegration: true, contextIsolation: false }, { resizable: false });

    // 3. Plant (Tamagotchi / Pomodoro Lofi) (Chiá»u rá»™ng + chiá»u cao bÃ¹ 11px margin tÃ ng hÃ¬nh)
    plantWin = createWidget('plant', 'plant.html', [271, 241, width - 350, 100], 
        { nodeIntegration: true, contextIsolation: false });

    // 4. Pet (ThÃº CÆ°ng RPG) (Chiá»u rá»™ng + chiá»u cao bÃ¹ 11px margin tÃ ng hÃ¬nh)
    petWin = createWidget('pet', 'pet.html', [273, 321, width - 600, 300], 
        { nodeIntegration: true, contextIsolation: false }, { resizable: false });
    petWin.setSize(273, 321); // Hard fix for pet size

    // 5. Calendar (Lá»‹ch Google)
    calendarWin = createWidget('calendar', 'calendar.html', [300, 400, width - 600, 600], {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
    });
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
            // Temporarily disable click-through so user can type/click modals
            win.setIgnoreMouseEvents(false);
            win.focus();
        } else {
            // Restore pinning state from memory
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
            // Má»—i láº§n báº­t láº¡i, gá»i láº¡i alwaysOnTop Ä‘á»ƒ chá»‘ng rÆ¡t cáº¥p sau khi Explorer Windows khá»Ÿi Ä‘á»™ng láº¡i hoáº·c thoÃ¡t Game Fullscreen
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
    // Láº¯ng nghe há»‡ thá»‘ng thá»©c giáº¥c (Sleep / Resume) Ä‘á»ƒ chá»‘ng lá»—i tÃ ng hÃ¬nh
    function wakeUpWindows() {
        console.log('[System Wake] Force repainting framework windows...');
        const allWins = BrowserWindow.getAllWindows();
        allWins.forEach(w => {
            if (!w || w.isDestroyed()) return;
            // Ép OS vẽ lại báo hụt GPU
            const [wW, wH] = w.getSize();
            w.setSize(wW, wH + 1);
            w.setSize(wW, wH);
            if (w.isMinimized()) w.restore();
            // Náº¿u opacity > 0 thÃ¬ ép hiá»‡n lên (nÃ© Windows nuá»‘t forms)
            if (w.getOpacity() > 0) {
                w.showInactive();
                w.setAlwaysOnTop(true, 'screen-saver');
            }
        });
        
        // Dáº£m báº£o Tai thá» khÃ´ng bá»‹ kẹt
        if (handleWin && launcherWin) {
            if (launcherWin.getOpacity() === 0) {
                if (handleWin.isMinimized()) handleWin.restore();
                handleWin.setOpacity(1);
                handleWin.setIgnoreMouseEvents(false);
                handleWin.showInactive();
                handleWin.setAlwaysOnTop(true, 'screen-saver');
            }
        }
    }

    powerMonitor.on('resume', wakeUpWindows);
    powerMonitor.on('unlock-screen', wakeUpWindows);

    // ÄÄƒng kÃ½ PhÃ­m táº¯t ToÃ n Cáº§u Ä‘á»ƒ áº¨n / Má»Ÿ láº¡i thÃ´ng minh (Ctrl+Shift+D)
    globalShortcut.register('CommandOrControl+Shift+D', () => {
        toggleSmartVisibility(null);
    });

    // Ki?m tra v? th?ng b?o c?p nh?t ngay khi m?
    setTimeout(() => { autoUpdater.checkForUpdates(); }, 4000);

    // UU TI?N S? 1: Ph?ng ra giao di?n nhanh ngay l?p t?c!
    createWindows();

    tray = new Tray(path.join(__dirname, 'Bunny_Sunny.png')); 
    tray.setToolTip('Hệ Sinh Thái Pixel by Nashallery');
    updateTrayMenu();

      tray.on('right-click', () => { if (tray.contextMenu) tray.popUpContextMenu(tray.contextMenu); });
      tray.on('click', () => {
          if (launcherWin) openSidebar();
      });
      tray.on('double-click', () => {
          if (launcherWin) openSidebar();
      });
      // UU TI?N S? 2: Khi Giao di?n Graphic d? k?t xu?t xong xu?i, b?t d?u ch?c Cloud l?y d? li?u
    // Tr? ho?n k?o d?i th?nh G?n 3 gi?y (2500ms) d? H? di?u h?nh d?p xong Khung C?a S?, Tuy?t d?i mu?t m?
    setTimeout(() => {
        googleService.authenticate().then(() => {
            console.log("==> GOOGLE API HOÀN TẤT KẾT NỐI!");
            if (noteWin) noteWin.webContents.send('google-ready');
        }).catch(err => console.log("Hỏng Google Auth:", err));
    }, 2500);

    // =============== Google IPC Cầu Nối API ===============
    ipcMain.handle('g-get-tasklists', async () => await googleService.getTaskLists());
    ipcMain.handle('g-add-tasklist', async (e, title) => await googleService.addTaskList(title));
    ipcMain.handle('g-remove-tasklist', async (e, listId) => await googleService.removeTaskList(listId));
    ipcMain.handle('g-get-tasks', async (e, listId) => await googleService.getTasks(listId));
    ipcMain.handle('g-add-task', async (e, title, listId) => await googleService.addTask(title, listId));
    ipcMain.handle('g-complete-task', async (e, id, listId) => await googleService.completeTask(id, listId));
    ipcMain.handle('g-update-task-status', async (e, taskId, status, listId) => await googleService.updateTaskStatus(listId, taskId, status));
    ipcMain.handle('g-remove-task', async (e, id, listId) => await googleService.removeTask(id, listId));
    
    // ÄÃ¡m mÃ¢y
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

// Lazy Event Listeners (Báº£o lÆ°u RAM)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && isQuiting) {
        app.quit();
    }
});

app.on('activate', () => {
    // macOS: Táº¡o láº¡i Windows náº¿u click vÃ o Dock icon
    if (BrowserWindow.getAllWindows().length === 0) createWindows();
});


















