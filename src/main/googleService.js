const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { google } = require('googleapis');

let CLIENT_ID = '';
let CLIENT_SECRET = '';
const REDIRECT_URI = 'http://localhost'; 
const SCOPES = [
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/drive.file' // Thêm quyền ghi file
];

const TOKEN_PATH = path.join(os.homedir(), '.lofi-tasks-token.json');
const SECRETS_PATH = path.join(__dirname, '../../config-private.json');

let oauth2Client;
let tasksService;
let driveService;

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

        oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
        oauth2Client.on('tokens', (tokens) => {
            if (tokens.refresh_token) {
                // Lưu lại refresh token nếu có (quan trọng để duy trì đăng nhập)
                const storedTokens = fs.existsSync(TOKEN_PATH) ? JSON.parse(fs.readFileSync(TOKEN_PATH)) : {};
                const newTokens = { ...storedTokens, ...tokens };
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(newTokens));
            }
        });

        tasksService = google.tasks({ version: 'v1', auth: oauth2Client });
        driveService = google.drive({ version: 'v3', auth: oauth2Client });
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

// Wrapper xử lý lỗi Authentication & Tự động gọi lại nếu Token hết hạn
async function callApi(apiFunc) {
    initGoogle();
    try {
        return await apiFunc();
    } catch (error) {
        // Nếu lỗi 401 (Unauthorized), thử refesh token hoặc yêu cầu đăng nhập lại
        if (error.code === 401) {
            console.log("Token hết hạn hoặc không hợp lệ, đang thử xác thực lại...");
            try {
                await authenticate();
                return await apiFunc();
            } catch (authErr) {
                console.error("Xác thực lại thất bại:", authErr);
                throw authErr;
            }
        }
        console.error("Lỗi Google API:", error);
        throw error;
    }
}

// Hàm hỗ trợ đồng bộ Đám mây
async function getTasks() {
    try {
        return await callApi(async () => {
            const res = await tasksService.tasks.list({
                tasklist: '@default',
                showCompleted: false,
                maxResults: 50
            });
            return res.data.items || [];
        });
    } catch (e) {
        return [];
    }
}

async function addTask(title) {
    try {
        return await callApi(async () => {
            const res = await tasksService.tasks.insert({
                tasklist: '@default',
                requestBody: { title: title }
            });
            return res.data;
        });
    } catch(e) { return null; }
}

async function completeTask(taskId) {
    try {
        await callApi(async () => {
            await tasksService.tasks.patch({
                tasklist: '@default',
                task: taskId,
                requestBody: { status: 'completed' }
            });
        });
        return true;
    } catch(e) { return false; }
}

async function removeTask(taskId) {
    try {
        await callApi(async () => {
            await tasksService.tasks.delete({
                tasklist: '@default', task: taskId
            });
        });
        return true;
    } catch(e) { return false; }
}

async function saveToCloud(filename, content) {
    initGoogle();
    try {
        if (!driveService) return false;
        // 1. Tìm xem file đã tồn tại chưa
        const searchRes = await callApi(async () => driveService.files.list({
            q: `name = '${filename}' and trashed = false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        }));
        
        const file = searchRes.data.files.length > 0 ? searchRes.data.files[0] : null;
        
        const media = {
            mimeType: 'application/json',
            body: content
        };

        if (file) {
            // Update
            await callApi(async () => driveService.files.update({
                fileId: file.id,
                media: media
            }));
            console.log(`Đã cập nhật file ${filename} (${file.id}) lên Cloud`);
        } else {
            // Create New
            await callApi(async () => driveService.files.create({
                requestBody: {
                    name: filename,
                    parents: [] // Root directory
                },
                media: media
            }));
            console.log(`Đã tạo mới file ${filename} lên Cloud`);
        }
        return true;
    } catch (error) {
        console.error('Lỗi Save Cloud:', error);
        return false;
    }
}

async function loadFromCloud(filename) {
    initGoogle();
    try {
        if (!driveService) return null;
        const searchRes = await callApi(async () => driveService.files.list({
            q: `name = '${filename}' and trashed = false`,
            spaces: 'drive',
            fields: 'files(id, name)'
        }));

        if (searchRes.data.files.length === 0) return null;

        const fileId = searchRes.data.files[0].id;
        const res = await callApi(async () => driveService.files.get({
            fileId: fileId,
            alt: 'media'
        }));
        return res.data; // Nội dung JSON
    } catch (error) {
        console.error('Lỗi Load Cloud:', error);
        return null;
    }
}

module.exports = { 
    authenticate, 
    getTasks, 
    addTask, 
    completeTask, 
    removeTask,
    saveToCloud,
    loadFromCloud
};
