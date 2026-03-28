const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

let CLIENT_ID = '';
let CLIENT_SECRET = '';
const REDIRECT_URI = 'http://localhost'; 
const SCOPES = ['https://www.googleapis.com/auth/tasks'];

const TOKEN_PATH = path.join(os.homedir(), '.lofi-tasks-token.json');
const SECRETS_PATH = path.join(__dirname, 'config-private.json');

let oauth2Client;
let tasksService;

// Cơ Chế Lazy Load: Chỉ require thư viện khổng lồ 80MB khi thực sự cần gọi lệnh API
// Điều này ngăn chặn sự nghẽn cổ chai CPU làm Giật Lag khung hình lúc người dùng gõ npm start
function initGoogle() {
    if (!oauth2Client) {
        // Tải bí mật từ file private (đã được gitignore)
        if (fs.existsSync(SECRETS_PATH)) {
            try {
                const secrets = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'));
                CLIENT_ID = secrets.GOOGLE_CLIENT_ID;
                CLIENT_SECRET = secrets.GOOGLE_CLIENT_SECRET;
            } catch (e) {
                console.error("Lỗi đọc config-private.json:", e);
            }
        }

        const { google } = require('googleapis');
        oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
        tasksService = google.tasks({ version: 'v1', auth: oauth2Client });
    }
}

async function authenticate() {
    return new Promise((resolve, reject) => {
        initGoogle();
        
        if (fs.existsSync(TOKEN_PATH)) {
            try {
                const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
                oauth2Client.setCredentials(token);
                return resolve(true);
            } catch (err) {}
        }

        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline', 
            scope: SCOPES,
            prompt: 'consent' 
        });

        // Hiện cửa sổ Login Siêu cấp lồng vào Electron
        const authWindow = new BrowserWindow({
            width: 500, height: 600,
            webPreferences: { nodeIntegration: false, contextIsolation: true },
            alwaysOnTop: true, title: "Liên kết Google Tasks To-Do"
        });
        
        authWindow.setMenu(null);
        authWindow.loadURL(authUrl);

        // Bắt Request Redirect ngay khi OAuth đồng ý, khỏi cần chạy Local Server!
        authWindow.webContents.on('will-redirect', async (event, url) => {
            if (url.startsWith(REDIRECT_URI)) {
                event.preventDefault();
                const urlObj = new URL(url);
                const code = urlObj.searchParams.get('code');
                
                if (code) {
                    try {
                        const { tokens } = await oauth2Client.getToken(code);
                        oauth2Client.setCredentials(tokens);
                        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
                        authWindow.close();
                        resolve(true); 
                    } catch (err) {
                        reject(err);
                        authWindow.close();
                    }
                }
            }
        });
        
        authWindow.on('closed', () => {
            reject('Login closed');
        });
    });
}

// Hàm hỗ trợ đồng bộ Đám mây
async function getTasks() {
    initGoogle();
    try {
        const res = await tasksService.tasks.list({
            tasklist: '@default', // List gốc mặc định của tài khoản
            showCompleted: false, 
            maxResults: 50
        });
        return res.data.items || [];
    } catch (e) {
        return [];
    }
}

async function addTask(title) {
    initGoogle();
    try {
        const res = await tasksService.tasks.insert({
            tasklist: '@default',
            requestBody: { title: title }
        });
        return res.data;
    } catch(e) { return null; }
}

async function completeTask(taskId) {
    initGoogle();
    try {
        await tasksService.tasks.patch({
            tasklist: '@default',
            task: taskId,
            requestBody: { status: 'completed' }
        });
        return true;
    } catch(e) { return false; }
}

async function removeTask(taskId) {
    initGoogle();
    try {
        await tasksService.tasks.delete({
            tasklist: '@default', task: taskId
        });
        return true;
    } catch(e) { return false; }
}

// ================= HỆ THỐNG ĐỒNG BỘ ĐÁM MÂY (RPG CLOUD SAVE) =================
// Lưu lợi dụng Notes của một Google Task ẩn tên: [RPG_CLOUD_SAVE]
async function findCloudSaveTask() {
    initGoogle();
    const res = await tasksService.tasks.list({
        tasklist: '@default',
        showHidden: true,
        maxResults: 100
    });
    return (res.data.items || []).find(t => t.title === '[RPG_CLOUD_SAVE_DO_NOT_DELETE]');
}

async function backupRPG(dataJson) {
    try {
        const existing = await findCloudSaveTask();
        if (existing) {
            await tasksService.tasks.update({
                tasklist: '@default',
                task: existing.id,
                requestBody: {
                    id: existing.id,
                    title: '[RPG_CLOUD_SAVE_DO_NOT_DELETE]',
                    notes: dataJson
                }
            });
        } else {
            await tasksService.tasks.insert({
                tasklist: '@default',
                requestBody: {
                    title: '[RPG_CLOUD_SAVE_DO_NOT_DELETE]',
                    notes: dataJson
                }
            });
        }
        return true;
    } catch (e) { console.error('Lỗi backup mây:', e); return false; }
}

async function restoreRPG() {
    try {
        const existing = await findCloudSaveTask();
        if (existing && existing.notes) {
            return existing.notes;
        }
    } catch(e) { console.error('Lỗi lấy backup mây:', e); }
    return null;
}
// ==============================================================================

module.exports = { authenticate, getTasks, addTask, completeTask, removeTask, backupRPG, restoreRPG };
