const { BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

let CLIENT_ID = '';
let CLIENT_SECRET = '';
const REDIRECT_URI = 'http://localhost'; 
const SCOPES = [
    'https://www.googleapis.com/auth/tasks',
    'https://www.googleapis.com/auth/calendar.readonly'
];

const TOKEN_PATH = path.join(os.homedir(), '.lofi-tasks-token.json');
const SECRETS_PATH = path.join(__dirname, 'config-private.json');

let oauth2Client;
let tasksService;
let calendarService;

// CÆ¡ Cháº¿ Lazy Load: Chá»‰ require thÆ° viá»‡n khá»•ng lá»“ 80MB khi thá»±c sá»± cáº§n gá»i lá»‡nh API
// Äiá»u nÃ y ngÄƒn cháº·n sá»± ngháº½n cá»• chai CPU lÃ m Giáº­t Lag khung hÃ¬nh lÃºc ngÆ°á»i dÃ¹ng gÃµ npm start
function initGoogle() {
    if (!oauth2Client) {
        // Táº£i bÃ­ máº­t tá»« file private (Ä‘Ã£ Ä‘Æ°á»£c gitignore)
        if (fs.existsSync(SECRETS_PATH)) {
            try {
                const secrets = JSON.parse(fs.readFileSync(SECRETS_PATH, 'utf8'));
                CLIENT_ID = secrets.GOOGLE_CLIENT_ID;
                CLIENT_SECRET = secrets.GOOGLE_CLIENT_SECRET;
            } catch (e) {
                console.error("Lá»—i Ä‘á»c config-private.json:", e);
            }
        }

        const { google } = require('googleapis');
        oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

        if (fs.existsSync(TOKEN_PATH)) {
            try {
                const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
                oauth2Client.setCredentials(token);
            } catch (err) {}
        }

        tasksService = google.tasks({ version: 'v1', auth: oauth2Client });
        calendarService = google.calendar({ version: 'v3', auth: oauth2Client });
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

        // Hiá»‡n cá»­a sá»• Login SiÃªu cáº¥p lá»“ng vÃ o Electron
        const authWindow = new BrowserWindow({
            width: 500, height: 600,
            webPreferences: { nodeIntegration: false, contextIsolation: true },
            alwaysOnTop: true, title: "LiÃªn káº¿t Google Tasks To-Do"
        });
        
        authWindow.setMenu(null);
        authWindow.loadURL(authUrl);

        // Báº¯t Request Redirect ngay khi OAuth Ä‘á»“ng Ã½, khá»i cáº§n cháº¡y Local Server!
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
async function getTaskLists() {
    initGoogle();
    if (!oauth2Client.credentials || Object.keys(oauth2Client.credentials).length === 0) return [];
    try {
        const res = await tasksService.tasklists.list({ maxResults: 50 });
        return res.data.items || [];
    } catch(e) { return []; }
}

async function addTaskList(title) {
    initGoogle();
    try {
        const res = await tasksService.tasklists.insert({
            requestBody: { title: title }
        });
        return res.data.id;
    } catch(e) { console.error('Add TaskList error', e.message || ''); return null; }
}

async function getTasks(listId = '@default') {

    initGoogle();
    if (!oauth2Client.credentials || Object.keys(oauth2Client.credentials).length === 0) return [];
    try {
        const res = await tasksService.tasks.list({
            tasklist: listId, // List gá»‘c máº·c Ä‘á»‹nh cá»§a tÃ i khoáº£n
            showCompleted: true, showHidden: true,
            maxResults: 50
        });
        const allItems = res.data.items || [];
        // GIáº¤U NHIá»†M Vá»¤ LÆ¯U ÄÃM MÃ‚Y ÄI, KHÃ”NG CHO TRáº¢ Vá»€ FRONT-END
        return allItems.filter(t => t.title !== '[RPG_CLOUD_SAVE_DO_NOT_DELETE]');
    } catch (e) {
        return [];
    }
}

async function addTask(title, listId = '@default') {
    initGoogle();
    try {
        const res = await tasksService.tasks.insert({
            tasklist: listId,
            requestBody: { title: title }
        });
        return res.data;
    } catch(e) { return null; }
}

async function completeTask(taskId, listId = '@default') {
    initGoogle();
    try {
        await tasksService.tasks.patch({
            tasklist: listId,
            task: taskId,
            requestBody: { status: 'completed' }
        });
        return true;
    } catch(e) { return false; }
}

async function removeTask(taskId, listId = '@default') {
    initGoogle();
    try {
        await tasksService.tasks.delete({
            tasklist: listId, task: taskId
        });
        return true;
    } catch(e) { return false; }
}

// ================= Há»† THá»NG Äá»’NG Bá»˜ ÄÃM MÃ‚Y (RPG CLOUD SAVE) =================
// LÆ°u lá»£i dá»¥ng Notes cá»§a má»™t Google Task áº©n tÃªn: [RPG_CLOUD_SAVE]
async function findCloudSaveTask() {
    initGoogle();
    const res = await tasksService.tasks.list({
        tasklist: '@default',
        showHidden: true,
        showCompleted: true,
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
                    notes: dataJson,
                      status: 'completed'
                }
            });
        } else {
            await tasksService.tasks.insert({
                tasklist: '@default',
                requestBody: {
                    title: '[RPG_CLOUD_SAVE_DO_NOT_DELETE]',
                    notes: dataJson,
                      status: 'completed'
                }
            });
        }
        return true;
    } catch (e) { console.error('Lỗi backup mây:', e.message || ''); return false; }
}

async function restoreRPG() {
    try {
        const existing = await findCloudSaveTask();
        if (existing && existing.notes) {
            return existing.notes;
        }
    } catch(e) { console.error('Lỗi lấy backup mây:', e.message || ''); }
    return null;
}
// ==============================================================================


async function updateTaskStatus(listId, taskId, status) {
    initGoogle();
    try {
        await tasksService.tasks.patch({
            tasklist: listId, 
            task: taskId,
            requestBody: { status: status }
        });
        return true;
    } catch(e) { console.log('Lỗi Google Tasks (Log):', e.message || ''); return false; }
}

async function removeTaskList(listId) {
    initGoogle();
    try {
        await tasksService.tasklists.delete({ tasklist: listId });
        return true;
    } catch(e) { console.error('Lỗi Google Tasks:', e.message || ''); return false; }
}

async function getCalendarEvents(viewType = 'day', baseDateIso) {
    initGoogle();
    if (!oauth2Client.credentials || Object.keys(oauth2Client.credentials).length === 0) return [];
    try {
        const baseDate = baseDateIso ? new Date(baseDateIso) : new Date();
        let timeMin = new Date(baseDate);
        let timeMax = new Date(baseDate);
        
        timeMin.setHours(0, 0, 0, 0);
        
        if (viewType === 'day') {
            timeMax.setDate(timeMin.getDate() + 1);
            timeMax.setHours(0, 0, 0, 0);
        } else if (viewType === 'week') {
            // Monday to Sunday strict range
            const day = timeMin.getDay();
            const diff = timeMin.getDate() - day + (day === 0 ? -6 : 1);
            timeMin.setDate(diff);
            timeMin.setHours(0, 0, 0, 0);

            timeMax = new Date(timeMin);
            timeMax.setDate(timeMin.getDate() + 7);
            timeMax.setHours(0, 0, 0, 0);
        } else if (viewType === 'month') {
            timeMin.setDate(1);
            timeMin.setHours(0, 0, 0, 0);
            
            timeMax.setMonth(timeMin.getMonth() + 1);
            timeMax.setDate(1);
            timeMax.setHours(0, 0, 0, 0);
        } else if (viewType === 'year') {
            timeMin.setMonth(0, 1);
            timeMin.setHours(0, 0, 0, 0);
            timeMax.setFullYear(timeMin.getFullYear() + 1);
            timeMax.setHours(0, 0, 0, 0);
        }

        const res = await calendarService.events.list({
            calendarId: 'primary',
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            maxResults: 100,
            singleEvents: true,
            orderBy: 'startTime',
        });
        return res.data.items || [];
    } catch (e) {
        if (!e.message.includes('No access, refresh token')) {
            console.error('Lỗi lấy lịch Google:', e.message || '');
        }
        return [];
    }
}

module.exports = { removeTaskList, updateTaskStatus, authenticate, getTaskLists, getTasks, addTask, completeTask, removeTask, backupRPG, restoreRPG, addTaskList, getCalendarEvents };


