const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, session, Tray, Menu, ipcMain, screen, dialog, net } = require('electron');
const { autoUpdater } = require('electron-updater');
const googleService = require('./googleService');
const ROOT_DIR = path.resolve(__dirname, '../..');

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
});

autoUpdater.on('update-downloaded', (info) => {
    console.log('Tải xuống hoàn tất! Hiển thị thông báo...'); // Debug log
    
    // Tạm thời bỏ đi process.platform check để đơn giản hoá message
    // Hiển thị hộp thoại yêu cầu người dùng xác nhận
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
                app.removeAllListeners('window-all-closed'); // Ngăn chặn sự kiện đóng cửa sổ mặc định
                autoUpdater.quitAndInstall(false, true); // true = silent install (nếu có thể), false = force run app after
            });
        }
    });
});

// Bỏ qua lỗi SSL mạng cho API weather
app.commandLine.appendSwitch('ignore-certificate-errors');

// --- Bounds Manager ---
function getBounds(name, defaultWidth, defaultHeight, defaultX, defaultY) {
    try {
        const file = path.join(app.getPath('userData'), `${name}-bounds.json`);
        if (fs.existsSync(file)) {
            const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
            if (parsed.width) return parsed;
        }
    } catch(e) {}
    return { width: defaultWidth, height: defaultHeight, x: defaultX, y: defaultY };
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
if(!mState.handleStyle) mState.handleStyle = 'bubble';
let isQuiting = false;

function updateTrayMenu() {
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Thanh Công Cụ Thông Minh (Smart Sidebar)', enabled: false },
        { type: 'separator' },
        { label: '❌ Thoát Hệ Sinh Thái (Quit)', click: () => { isQuiting = true; app.quit(); } }
    ]);
    if (tray) tray.setContextMenu(contextMenu);
}

function createWindows() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    // 0. Tai Thỏ
    const handleBounds = getBounds('handle', 60, 60, width - 60, Math.floor(height / 2) - 30);
    // Ép vị trí khi đang ở Bám Lề Phải (đề phòng trước đó lưu toạ độ bóng nổi rồi đổi state)
    let initX = handleBounds.x;
    if (mState.handleStyle === 'edge') initX = width - 60;

    handleWin = new BrowserWindow({
        width: 60, height: 60,
        x: initX, y: handleBounds.y,
        transparent: true, frame: false, alwaysOnTop: true, resizable: false, skipTaskbar: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    handleWin.loadFile(path.join(__dirname, '../renderer/launcher/handle.html'));
    handleWin.setAlwaysOnTop(true, 'screen-saver'); 
    handleWin.on('moved', () => saveBounds('handle', handleWin));

    // 0.5 Bảng điều khiển — Chiều cao 460px tính toán chính xác từ CSS (không resize động)
    // title(42) + 4×widget(224) + 3×gap(24) + settings(42) + footer(56) + padding+border(36) + dự phòng(36) = 460
    const LAUNCHER_H = 460;
    launcherWin = new BrowserWindow({
        width: 260, height: LAUNCHER_H,
        x: width - 260, y: Math.floor(height / 2) - Math.floor(LAUNCHER_H / 2),
        transparent: true, frame: false, alwaysOnTop: true, resizable: false, skipTaskbar: true,
        show: true, opacity: 0, // Giải pháp tối thượng: Render sẵn nhưng Không hiển thị độ sáng!
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    launcherWin.loadFile(path.join(__dirname, '../renderer/launcher/launcher.html'));
    launcherWin.setIgnoreMouseEvents(true); // Khoá Tương tác chuột khi đang Tàng hình
    launcherWin.setAlwaysOnTop(true, 'screen-saver');

    function openSidebar() {
        launcherWin.setOpacity(1); // Triệu hồi bằng GPU cực mượt
        launcherWin.setIgnoreMouseEvents(false);
        launcherWin.focus();

        if (handleWin) {
            handleWin.setOpacity(0);
            handleWin.setIgnoreMouseEvents(true);
        }
    }

    function closeSidebar() {
        // Rút thẻ
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
            // Gắn chặt lề ngay khi nhấn đổi giao diện Bám Phải
            if (styleName === 'edge') {
                const { width } = screen.getPrimaryDisplay().workAreaSize;
                const [curX, curY] = handleWin.getPosition();
                handleWin.setPosition(width - 60, curY);
                saveBounds('handle', handleWin);
            }
        }
    });

    // Custom JS Dragging cho Tai thỏ (Logic chặn mép màn hình cổ điển)
    ipcMain.on('handle-drag', (e, x, y) => {
        if (!handleWin) return;
        const { width, height } = screen.getPrimaryDisplay().workAreaSize;
        
        // Không cho vượt ra khỏi 4 mép hiển thị
        let targetX = Math.max(0, Math.min(x, width - 60));
        let targetY = Math.max(0, Math.min(y, height - 60));

        // NẾU đang ở Chế độ Bám Cạnh -> Cố định trục X vào lề Pkải
        if (mState.handleStyle === 'edge') {
            targetX = width - 60;
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

    // Helper: Tạo cửa sổ widget tiêu chuẩn
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
        win.on('moved', () => saveBounds(name, win));
        if (extra.resizable) win.on('resized', () => saveBounds(name, win));
        
        if (!mState.active[name]) win.setIgnoreMouseEvents(true); 
        else win.setIgnoreMouseEvents(mState.pinned[name] || false, { forward: true });
        return win;
    }

    // 1. Weather
    weatherWin = createWidget('weather', path.join(__dirname, '../renderer/weather/weather.html'), [340, 490, width - 600, 100], {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: false,
        sandbox: false
    });

    // 2. Sổ Nhiệm Vụ
    const defNoteX = weatherWin.getBounds().x ? weatherWin.getBounds().x - 280 : width - 900;
    noteWin = createWidget('note', path.join(__dirname, '../renderer/note/note.html'), [260, 300, defNoteX, weatherWin.getBounds().y], 
        { nodeIntegration: true, contextIsolation: false }, { resizable: true });

    // 3. Plant (Tamagotchi / Pomodoro Lofi)
    plantWin = createWidget('plant', path.join(__dirname, '../renderer/plant/plant.html'), [260, 230, width - 350, 100], 
        { nodeIntegration: false, contextIsolation: true });

    // 4. Pet (Thú Cưng RPG)
    petWin = createWidget('pet', path.join(__dirname, '../renderer/pet/pet.html'), [330, 390, width - 600, 300], 
        { nodeIntegration: true, contextIsolation: false }, { resizable: false });
    petWin.setSize(330, 390); // Hard fix for pet size
}

const debounce = require('lodash.debounce');

// Hàm save tự động với debounce 15s để tránh spam API
const autoCloudSave = debounce(async (data) => {
    try {
        await googleService.saveToCloud('pixel-weather-save.json', JSON.stringify(data));
        console.log('[Auto-Sync] Đã lưu tiến trình RPG lên Cloud');
    } catch (e) { console.error('[Auto-Sync] Lưu thất bại:', e); }
}, 15000);

// Khôi phục dữ liệu khi khởi động
async function tryAutoLoadCloud() {
    try {
        const cloudData = await googleService.loadFromCloud('pixel-weather-save.json');
        if (cloudData) {
            console.log('[Auto-Sync] Tải dữ liệu từ Cloud thành công');
            // Gửi dữ liệu xuống tất cả các cửa sổ renderer
            [weatherWin, noteWin, plantWin, petWin, launcherWin, handleWin].forEach(win => {
                if(win && !win.isDestroyed()) win.webContents.send('cloud-data-synced', cloudData);
            });
        }
    } catch (e) { console.error('[Auto-Sync] Tải thất bại:', e); }
}

ipcMain.on('rpg-state-update', (e, state) => {
    // Khi có thay đổi ở bất kỳ widget nào, tự động lưu lên Cloud
    if (autoCloudSave) autoCloudSave(state);
    
    // Broadcast cho các cửa sổ khác
    const wins = [handleWin, launcherWin, weatherWin, noteWin, plantWin, petWin, petWalkWin];
    wins.forEach(w => {
        if (w && !w.isDestroyed() && w.webContents.id !== e.sender.id) {
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
    if (wMap[name]) {
        if (isVisible) {
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
    if (wMap[name]) wMap[name].setIgnoreMouseEvents(isPinned, { forward: true });
});

// =============== Register all IPC Handlers FIRST before app.whenReady ===============
// Google IPC Bridge
ipcMain.handle('g-get-tasks', async () => await googleService.getTasks());
ipcMain.handle('g-add-task', async (e, title) => await googleService.addTask(title));
ipcMain.handle('g-complete-task', async (e, id) => await googleService.completeTask(id));
ipcMain.handle('g-remove-task', async (e, id) => await googleService.removeTask(id));

// Cloud Save IPC
ipcMain.handle('cloud-save', async (e, data) => await googleService.saveToCloud('pixel-weather-save.json', JSON.stringify(data)));
ipcMain.handle('cloud-load', async () => await googleService.loadFromCloud('pixel-weather-save.json'));


// API Định vị IP (Node.js Fetch Bypass CORS)
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
// =====================================================================

app.whenReady().then(() => {
    // Kiểm tra và thông báo cập nhật ngay khi mở
    autoUpdater.checkForUpdatesAndNotify();

    // UƯ TIÊN SỐ 1: Phóng ra giao diện nhanh ngay lập tức!
    createWindows();

    tray = new Tray(path.join(ROOT_DIR, 'assets', 'Bunny_Sunny.png')); 
    tray.setToolTip('Hệ Sinh Thái Pixel by Nashallery');
    updateTrayMenu();

    // UƯ TIÊN SỐ 2: Khi Giao diện Graphic đã kết xuất xong xuôi, bắt đầu chọc Cloud lấy dữ liệu
    // Trì hoãn kéo dài thành Gần 3 giây (2500ms) để Hệ điều hành dập xong Khung Cửa Số, Tuyệt đối mượt mà
    setTimeout(() => {
        googleService.authenticate().then(() => {
            console.log("==> GOOGLE BÙA CHÚ ĐÃ HOÀN TẤT KẾT NỐI!");
            if (noteWin) noteWin.webContents.send('google-ready');
            
            // Kích hoạt Auto Load
            tryAutoLoadCloud();
        }).catch(err => console.log("Google Auth hỏng:", err));
    }, 2500);

    session.defaultSession.setPermissionRequestHandler((webContents, prop, callback) => {
        callback(prop === 'geolocation');
    });

    // Bẻ khoá (Bypass) giới hạn nhúng của YouTube (Lỗi 153 / Lỗi hiển thị video)
    // Giả mạo Header báo cáo Origin là chính trang Youtube để qua mặt hệ thống kiểm duyệt!
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
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
