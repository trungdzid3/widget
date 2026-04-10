const eventListEl = document.getElementById('event-list');
const viewBtns = document.querySelectorAll('.view-btn');

let currentView = 'day';
let displayDate = new Date();
displayDate.setHours(0, 0, 0, 0);

function getDateGroup(isoString) {
    if (!isoString) return 'Không xác định';
    const d = new Date(isoString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    const dayStr = days[d.getDay()];
    // format date as dd/mm/yyyy
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const dateStr = dd + '/' + mm + '/' + yyyy;

    if (d.toDateString() === today.toDateString()) {
        return 'Hôm nay, ' + dateStr;
    } else if (d.toDateString() === tomorrow.toDateString()) {
        return 'Ngày mai, ' + dateStr;
    } else {
        return dayStr + ', ' + dateStr;
    }
}

function formatTime(startStr, endStr) {
    if (!startStr || startStr.length <= 10) return 'Cả ngày / All day';
    const s = new Date(startStr);
    const sTime = s.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    if (!endStr || endStr.length <= 10) return sTime;
    
    const e = new Date(endStr);
    const eTime = e.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return sTime + ' - ' + eTime;
}

function renderListView(events, container) {
    if (!events || events.length === 0) {
        container.innerHTML = '<div class="no-events">Không có lịch sắp tới! Cứ chill đi ☕</div>';
        return;
    }

    let lastGroup = '';
    events.forEach(event => {
        const start = event.start.dateTime || event.start.date;
        const end = event.end ? (event.end.dateTime || event.end.date) : null;
        const summary = event.summary || 'Không có tiêu đề';
        const currentGroup = getDateGroup(start);

        if (currentGroup !== lastGroup) {
            const header = document.createElement('div');
            header.className = 'date-group-header';
            header.textContent = currentGroup;
            container.appendChild(header);
            lastGroup = currentGroup;
        }

        const item = document.createElement('div');
        const now = new Date();
        const eventEnd = new Date(end || start);
        const isPast = eventEnd < now;
        
        item.className = 'event-item' + (isPast ? ' past-event' : '');

        const h3 = document.createElement('h3');
        h3.className = 'event-title';
        h3.textContent = summary;

        const time = document.createElement('div');
        time.className = 'event-time';
        time.textContent = formatTime(start, end);

        item.appendChild(h3);
        item.appendChild(time);

        if (event.htmlLink) {
            item.title = 'Nháy đúp (double-click) để mở Calendar';
            item.style.cursor = 'pointer';
            item.addEventListener('dblclick', () => {
                if (window.widgetMeta && window.widgetMeta.openExternal) {
                    window.widgetMeta.openExternal(event.htmlLink);
                }
            });
        }
        container.appendChild(item);
    });
}

function renderMonthGrid(events, container) {
    const year = displayDate.getFullYear();
    const month = displayDate.getMonth();
    const now = new Date();

    const firstDay = new Date(year, month, 1).getDay();
    let startDay = firstDay === 0 ? 6 : firstDay - 1;

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthTitle = document.createElement('div');
    monthTitle.className = 'month-title';
    
    const monthSpan = document.createElement('span');
    monthSpan.textContent = 'Tháng ' + (month + 1);
    monthSpan.onclick = () => openPicker('month');
    
    const yearSpan = document.createElement('span');
    yearSpan.textContent = ' - ' + year;
    yearSpan.onclick = () => openPicker('year');

    monthTitle.appendChild(monthSpan);
    monthTitle.appendChild(yearSpan);
    container.appendChild(monthTitle);

    const grid = document.createElement('div');
    const totalCells = startDay + daysInMonth;
    grid.className = 'month-grid' + (totalCells > 35 ? ' small-cells' : '');

    const daysOfWeek = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
    daysOfWeek.forEach(d => {
        const el = document.createElement('div');
        el.className = 'weekday-header';
        el.textContent = d;
        grid.appendChild(el);
    });

    for (let i = 0; i < startDay; i++) {
        const blank = document.createElement('div');
        blank.className = 'month-day empty';
        grid.appendChild(blank);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const dayCell = document.createElement('div');
        dayCell.className = 'month-day';
        dayCell.textContent = d;

        const currentDateStr = new Date(year, month, d).toDateString();
        
        let dayEvents = [];
        if (events && events.length) {
            dayEvents = events.filter(e => {
                const st = e.start.dateTime || e.start.date;
                return new Date(st).toDateString() === currentDateStr;
            });
        }

        if (dayEvents.length > 0) {
            dayCell.classList.add('has-events');
            
            // Generate list of items
            const nowTime = new Date().getTime();
            const evtTexts = dayEvents.map(e => {
                const startStr = e.start.dateTime || e.start.date;
                const endStr = e.end ? (e.end.dateTime || e.end.date) : null;
                const _time = formatTime(startStr, endStr);
                const title = e.summary || 'Trống';
                
                const eventEnd = new Date(endStr || startStr).getTime();
                const isPast = eventEnd < nowTime;
                
                if (isPast) {
                    return `<span class="past-event">• [${_time}] ${title}</span>`;
                }
                return '• [' + _time + '] ' + title;
            }).join('<br>');
            
            // Hover logic with global tooltip
            dayCell.addEventListener('mouseenter', (e) => {
                let gt = document.getElementById('global-tooltip');
                if (!gt) {
                    gt = document.createElement('div');
                    gt.id = 'global-tooltip';
                    gt.className = 'day-tooltip-global';
                    document.body.appendChild(gt);
                }
                gt.innerHTML = evtTexts;
                gt.style.display = 'block';
                
                const widgetCenter = document.body.clientWidth / 2;
                
                // Get rect relative to viewport
                const rect = dayCell.getBoundingClientRect();
                const cellCenter = rect.left + (rect.width / 2);
                
                // X luôn đặt mỏ neo ở giữa widget để tooltip căng đều 2 bên
                gt.style.left = widgetCenter + 'px';
                
                // Y đặt trên ô ngày
                gt.style.top = (rect.top - 8) + 'px';
                
                // Mũi tên dời ra xa góc
                gt.style.setProperty('--arrow-offset', (cellCenter - widgetCenter) + 'px');
            });
            
            dayCell.addEventListener('mouseleave', hideGlobalTooltip);
        }

        if (d === now.getDate() && month === now.getMonth() && year === now.getFullYear()) {
            dayCell.classList.add('is-today');
        }

        grid.appendChild(dayCell);
    }

    container.appendChild(grid);
}

function hideGlobalTooltip() {
    const gt = document.getElementById('global-tooltip');
    if (gt) gt.style.display = 'none';
}

// picker logic
function openPicker(type) {
    const modal = document.getElementById('picker-modal');
    const title = document.getElementById('picker-title');
    const grid = document.getElementById('picker-grid');
    const closeBtn = document.getElementById('close-picker');

    modal.style.display = 'flex';
    grid.innerHTML = '';
    title.textContent = type === 'month' ? 'Chọn Tháng' : 'Chọn Năm';

    if (type === 'month') {
        const months = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
        months.forEach((m, i) => {
            const item = document.createElement('div');
            item.className = 'picker-item' + (i === displayDate.getMonth() ? ' active' : '');
            item.textContent = m;
            item.onclick = () => {
                displayDate.setMonth(i);
                modal.style.display = 'none';
                hideGlobalTooltip();
                loadCalendarEvents(true);
            };
            grid.appendChild(item);
        });
    } else {
        const curYear = new Date().getFullYear();
        for (let y = curYear - 5; y <= curYear + 5; y++) {
            const item = document.createElement('div');
            item.className = 'picker-item' + (y === displayDate.getFullYear() ? ' active' : '');
            item.textContent = y;
            item.onclick = () => {
                displayDate.setFullYear(y);
                modal.style.display = 'none';
                hideGlobalTooltip();
                loadCalendarEvents(true);
            };
            grid.appendChild(item);
        }
    }

    closeBtn.onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
}

async function loadCalendarEvents(forceRefresh = false) {
    await Promise.all([
        _loadCalendarEvents("day", forceRefresh),
        _loadCalendarEvents("week", forceRefresh),
        _loadCalendarEvents("month", forceRefresh)
    ]);
}

async function _loadCalendarEvents(view, forceRefresh) {
    const cacheKey = "calendar_cache_" + view;
    let hasCache = false;
    try {
        const stored = localStorage.getItem(cacheKey);
        if (stored) {
            const events = JSON.parse(stored);
            hasCache = true;
            if (currentView === view) {
                renderEvents(events, view);
            }
        }
    } catch(e) {}

    if (!hasCache && currentView === view) {
        eventListEl.innerHTML = '<div class="loading">Đang tải dữ liệu...</div>';
    }

    try {
        
        let freshEvents = [];
        const mergedEvents = [];

        // 1. Get Google
        if (config.showGoogle) {
            try {
                const gEvents = await window.widgetMeta.getCalendarEvents(view, displayDate.toISOString());
                mergedEvents.push(...gEvents);
            } catch(e) { console.error("Google Fetch err:", e); }
        }

        // 2. Get Apple
        if (config.showApple && config.appleUrl && window.widgetMeta.fetchAppleCalendar) {
            try {
                const icsText = await window.widgetMeta.fetchAppleCalendar(config.appleUrl);
                if (icsText) {
                    const appleEvents = parseAppleEvents(icsText, view);
                    mergedEvents.push(...appleEvents);
                }
            } catch(e) { console.error("Apple Fetch err:", e); }
        }

        // Sort combined chronologically
        freshEvents = mergedEvents.sort((a,b) => {
             const t1 = new Date(a.start.dateTime || a.start.date).getTime();
             const t2 = new Date(b.start.dateTime || b.start.date).getTime();
             return t1 - t2;
        });

        const freshStr = JSON.stringify(freshEvents);
        const storedStr = localStorage.getItem(cacheKey);
        
        if (freshStr !== storedStr || forceRefresh) {
            localStorage.setItem(cacheKey, freshStr);
            if (currentView === view) {
                renderEvents(freshEvents, view);
            }
        }
    } catch (e) {
        if (!hasCache && currentView === view) {
            eventListEl.innerHTML = '<div class="no-events">Lỗi kết nối :(</div>';
        }
        console.error('Calendar error:', e);
    }
}

function renderEvents(events, view) {
    let scrollTop = eventListEl.scrollTop;
    
    // Ép forced scroll = 0 cho grid Tháng để luôn hiện đủ chữ
    if (view === 'month') {
        scrollTop = 0; 
        hideGlobalTooltip();
    }
    
    const container = document.createElement('div');
    
    if (view === 'month') {
         renderMonthGrid(events, container);
         eventListEl.style.overflowY = 'hidden';
    } else {
         renderListView(events, container);
         eventListEl.style.overflowY = 'scroll';
    }
    
    eventListEl.innerHTML = '';
    while (container.firstChild) {
        eventListEl.appendChild(container.firstChild);
    }
    
    eventListEl.scrollTop = scrollTop;
}

viewBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const view = e.target.getAttribute('data-view');
        if(!view || view === 'year') return;
        
        if (currentView !== view) {
            eventListEl.scrollTop = 0; // Reset scroll khi đổi tab
        }
        
        viewBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentView = view;
        loadCalendarEvents();
    });
});


document.addEventListener('DOMContentLoaded', () => {
    loadCalendarEvents();
    setInterval(loadCalendarEvents, 30 * 60 * 1000);
});

// Keyboard navigation
window.addEventListener('keydown', (e) => {
    if (currentView !== 'month') return;
    
    // Ignore if modal is open
    if (document.getElementById('picker-modal').style.display === 'flex') return;
    if (document.getElementById('settings-modal').style.display === 'flex') return;

    if (e.key === 'ArrowLeft') {
        displayDate.setMonth(displayDate.getMonth() - 1);
        hideGlobalTooltip();
        loadCalendarEvents(true);
    } else if (e.key === 'ArrowRight') {
        displayDate.setMonth(displayDate.getMonth() + 1);
        hideGlobalTooltip();
        loadCalendarEvents(true);
    }
});


// ==== SETTINGS LOGIC ====
const btnSettings = document.getElementById("btn-settings");
const modalSettings = document.getElementById("settings-modal");
const closeSettings = document.getElementById("close-settings");
const btnSaveSettings = document.getElementById("btn-save-settings");

const chkGoogle = document.getElementById("toggle-google");
const chkApple = document.getElementById("toggle-apple");
const inputIcal = document.getElementById("input-ical");

// Load settings from local storage
const config = JSON.parse(localStorage.getItem("lofi_calendar_config")) || {
    showGoogle: true,
    showApple: false,
    appleUrl: ""
};
chkGoogle.checked = config.showGoogle;
chkApple.checked = config.showApple;
inputIcal.value = config.appleUrl;

btnSettings.addEventListener("click", () => { modalSettings.style.display = "flex"; });
closeSettings.addEventListener("click", () => { modalSettings.style.display = "none"; });

btnSaveSettings.addEventListener("click", () => {
    config.showGoogle = chkGoogle.checked;
    config.showApple = chkApple.checked;
    config.appleUrl = inputIcal.value.trim();
    localStorage.setItem("lofi_calendar_config", JSON.stringify(config));
    
    // Animate button push
    btnSaveSettings.innerText = "Đang lưu...";
    setTimeout(() => {
        btnSaveSettings.innerText = "Lưu & Đồng bộ";
        modalSettings.style.display = "none";
        
        // Force fully fresh fetch
        loadCalendarEvents(true);
    }, 500);
});

// ==== ICS PARSER ====
function parseAppleEvents(icsData, view) {
    const events = [];
    const lines = icsData.split(/\r?\n/);
    let inEvent = false;
    let evt = null;
    let fallbackGlobalZone = "Z"; 

    lines.forEach(line => {
        if (line.startsWith("BEGIN:VEVENT")) {
            inEvent = true;
            evt = {};
        } else if (line.startsWith("END:VEVENT") && inEvent) {
            if (evt.start && evt.summary) {
                events.push({
                    start: { dateTime: evt.start },
                    end: evt.end ? { dateTime: evt.end } : { dateTime: evt.start }, // default end to start if none
                    summary: "🍎 " + evt.summary,
                    htmlLink: null // Apple events are read-only
                });
            }
            inEvent = false;
        } else if (inEvent) {
            if (line.startsWith("DTSTART")) {
                const match = line.match(/:(.*)$/);
                if (match) evt.start = formatIcalDate(match[1]);
            } else if (line.startsWith("DTEND")) {
                const match = line.match(/:(.*)$/);
                if (match) evt.end = formatIcalDate(match[1]);
            } else if (line.startsWith("SUMMARY:")) {
                evt.summary = line.substring(8);
            }
        }
    });

    // Optionally filter by view type if necessary (Google SDK already filters on backend, 
    // but for Apple we got everything. We should manually filter by time to save rendering).
    // For simplicity and since pixel widgets are tiny, we just return the next 30-50 events or match current month.

    if (view === 'day') {
        const d = new Date(displayDate);
        timeMin = d;
        timeMax = new Date(d);
        timeMax.setDate(d.getDate() + 1);
        timeMax.setHours(0, 0, 0, 0);
    } else if (view === 'week') {
        const d = new Date(displayDate);
        const dayOfWeek = d.getDay();
        const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        d.setDate(diff);
        d.setHours(0, 0, 0, 0);
        timeMin = d;
            
        timeMax = new Date(timeMin);
        timeMax.setDate(timeMin.getDate() + 7);
        timeMax.setHours(0, 0, 0, 0);
    } else if (view === 'month') {
        const d = new Date(displayDate);
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        timeMin = d;
            
        timeMax = new Date(timeMin);
        timeMax.setMonth(timeMin.getMonth() + 1);
        timeMax.setDate(1);
        timeMax.setHours(0, 0, 0, 0);
    } else {
        timeMin = new Date(displayDate.getTime() - (30 * 24 * 60 * 60 * 1000));
        timeMax = new Date(displayDate);
        timeMax.setFullYear(timeMax.getFullYear() + 1);
    }

    const tMin = timeMin.getTime();
    const tMax = timeMax.getTime();

    const sorted = events
        .filter(e => {
            const time = new Date(e.start.dateTime).getTime();
            return time >= tMin && time < tMax;
        })
        .sort((a,b) => new Date(a.start.dateTime) - new Date(b.start.dateTime));
        
    return sorted;
}

function formatIcalDate(str) {
    if (str.length >= 15) {
        return `${str.substring(0,4)}-${str.substring(4,6)}-${str.substring(6,8)}T${str.substring(9,11)}:${str.substring(11,13)}:${str.substring(13,15)}Z`;
    } else if (str.length >= 8) {
        // all day event -> T00:00:00
        return `${str.substring(0,4)}-${str.substring(4,6)}-${str.substring(6,8)}T00:00:00Z`;
    }
    return new Date().toISOString(); // fallback safely
}
