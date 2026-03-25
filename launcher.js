const { ipcRenderer } = require('electron');

const wNames = ['weather', 'note', 'plant', 'pet'];

let isDragging = false;
let startOffset = {x: 0, y: 0};
const refs = {};

wNames.forEach(w => {
    refs[w] = {
        toggle: document.getElementById(`toggle-${w}`),
        pin: document.getElementById(`pin-${w}`)
    };

    if (refs[w].toggle) {
        refs[w].toggle.addEventListener('change', (e) => {
            ipcRenderer.send('toggle-widget', w, e.target.checked);
        });
    }

    if (refs[w].pin) {
        refs[w].pin.addEventListener('click', (e) => {
            const isPinned = e.target.classList.toggle('active');
            ipcRenderer.send('pin-widget', w, isPinned);
        });
    }
});

// Update state on load
ipcRenderer.invoke('get-widget-states').then(s => {
    wNames.forEach(w => {
        if (refs[w].toggle) refs[w].toggle.checked = s.active[w] || false;
        if (refs[w].pin) {
            if (s.pinned[w]) refs[w].pin.classList.add('active');
            else refs[w].pin.classList.remove('active');
        }
    });
});

const closeBtn = document.getElementById('close-btn');
if (closeBtn) closeBtn.onclick = () => ipcRenderer.send('close-sidebar');

// Gắn bộ điều khiển giao diện Mào Đầu (Handle Style)
const styleRadios = document.querySelectorAll('input[name="handleStyle"]');
styleRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        if (e.target.checked) ipcRenderer.send('change-handle-style', e.target.value);
    });
});
// Đồng bộ Setting khi mở
ipcRenderer.invoke('get-handle-style').then(style => {
    const r = document.querySelector(`input[value="${style}"]`);
    if (r) r.checked = true;
});

// Cho phép kéo trượt thanh Launcher đi mọi nơi (Ngoài các nút bấm)
document.addEventListener('mousedown', (e) => {
    // 1. Cảm biến Mù Trọng lực: Khắc phục lỗi Kính tàng hình (Buffer 20px Height thừa của Main OS)
    // Nếu Click vượt khỏi ranh giới vách tường hồng của hộp Dashboard -> Kích hoạt lệnh Gập Bảng ngay lập tức!
    if (!e.target.closest('.dashboard')) {
        ipcRenderer.send('close-sidebar');
        return;
    }

    // 2. Không nhận kéo nếu nhấn vào nút bấm nội hàm
    if (e.target.closest('.widget-item') || e.target.closest('.switch') || e.target.closest('.pin-btn') || e.target.closest('.settings-box') || e.target.id === 'close-btn') return;
    
    // 3. Kích hoạt Kéo thả Cửa sổ nếu nới rộng
    if (e.button === 0) {
        isDragging = true;
        startOffset = { x: e.clientX, y: e.clientY };
    }
});
document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        // Gắn lén lệnh kéo Handle sang cho Launcher Tàng Hình để đồng bộ mã Custom Border Boundaries
        ipcRenderer.send('handle-drag', e.screenX - startOffset.x, e.screenY - startOffset.y);
    }
});
document.addEventListener('mouseup', () => {
    isDragging = false;
    ipcRenderer.send('handle-drag-end');
});

// Tự động resize cửa sổ theo nội dung thực tế — AN TOÀN vì .dashboard là max-content
// (không phụ thuộc kích thước cửa sổ → không bao giờ loop)
window.addEventListener('DOMContentLoaded', () => {
    const box = document.querySelector('.dashboard');
    if (!box) return;

    const ro = new ResizeObserver(entries => {
        for (const entry of entries) {
            // contentRect = content only (không padding, không border)
            // dashboard: padding 28px + border 8px + buffer font 10px = +46
            const h = Math.ceil(entry.contentRect.height) + 46;
            ipcRenderer.send('resize-launcher', h);
        }
    });
    ro.observe(box);
});
