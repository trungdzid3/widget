const fs = require('fs');
const path = require('path');

const backupDir = 'C:/Users/Lenovo/Downloads/duan/WeatherWidget_Backup_PreOptimization';
const targetDir = 'C:/Users/Lenovo/Downloads/duan/WeatherWidget';

try {
    let html = fs.readFileSync(path.join(backupDir, 'pet.html'), 'utf8');
    let js = fs.readFileSync(path.join(backupDir, 'pet.js'), 'utf8');
    let css = fs.readFileSync(path.join(backupDir, 'pet.css'), 'utf8');

    // --- 1. HTML ---
    // Loại bỏ hoàn toàn khối đổi loài cũ
    html = html.replace(/<button id="change-species-btn"[^>]*>.*?<\/button>/gs, '');

    // Chèn lại bằng position absolute chuẩn xác (top: 75px để nằm dưới header, không kẹp lơ lửng)
    // Dùng biến --pet-theme để nút TỰ ĐỘNG đổi màu khớp với viền/header của từng loài Pet
    const newBtn = `
    <button id="change-species-btn" class="action-btn" style="display: none; position: absolute; top: 70px; left: 16px; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 8px; padding: 0; margin: 0; cursor: pointer; border: 3px solid rgba(255, 255, 255, 0.8); background: var(--pet-theme, #66bb6a); color: #fff; box-shadow: 2px 3px 0 rgba(0,0,0,0.15); transition: 0.1s; z-index: 100;" title="Chọn lại tinh linh (Chỉ khi Lv.1)">
        <svg xmlns="http://www.w3.org/2000/svg" height="26" viewBox="0 -960 960 960" width="26" fill="currentColor" style="pointer-events: none;"><path d="m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z"/></svg>
    </button>
    `;
    
    html = html.replace('<div id="pet-main">', '<div id="pet-main">\n' + newBtn);


    // --- 2. CSS ---
    css += '\n\n/* ================================= */\n';
    css += '/* BẢN VÁ: KÍCH THƯỚC TRỨNG & UI  */\n';
    css += '/* ================================= */\n\n';
    
    // x2 kích thước quả trứng bằng transform (Không làm phình DOM, tránh đẩy menu xuống dưới!)
    css += '#pet-sprite {\n';
    css += '    transform: scale(2) !important;\n';
    css += '    transform-origin: bottom center !important;\n';
    css += '    margin-bottom: 20px !important;\n';
    css += '}\n\n';

    // Fix hiệu ứng nút quay lại
    css += '#change-species-btn:active {\n';
    css += '    transform: translate(2px, 3px) scale(0.95) !important;\n';
    css += '    box-shadow: 0 0 0 transparent !important;\n';
    css += '}\n\n';

    // Phục hồi lại thanh EXP bị đè chữ / che khuất (Phục hồi Fix cũ)
    css += '.exp-bar-track { height: 24px !important; }\n';
    css += '.exp-bar-fill { height: 24px !important; }\n';
    css += '.pet-level { font-size: 22px !important; }\n';
    css += '.pet-coins { margin-left: auto; margin-right: 15px; }\n';

    // Đảm bảo Bottom Dashboard luôn nằm trên cùng, không bị đè
    css += '.pet-dashboard {\n';
    css += '    position: relative;\n';
    css += '    z-index: 10;\n';
    css += '}\n';

    // --- 3. JS ---
    // Thêm logic bật tắt hiển thị linh hoạt
    if (!js.includes('myPet.lv === 1 ? "flex" : "none"')) {
        js = js.replace(/function updateSpriteClass\(\)\s*\{/, 'function updateSpriteClass() {\n    const changeBtn = document.getElementById("change-species-btn");\n    if(changeBtn) changeBtn.style.display = myPet.lv === 1 ? "flex" : "none";\n');
        
        js = js.replace(/function renderPet\(\)\s*\{/, 'function renderPet() {\n    const changeBtn = document.getElementById("change-species-btn");\n    if(changeBtn) changeBtn.style.display = myPet.lv === 1 ? "flex" : "none";\n');
    }

    fs.writeFileSync(path.join(targetDir, 'pet.html'), html, 'utf8');
    fs.writeFileSync(path.join(targetDir, 'pet.js'), js, 'utf8');
    fs.writeFileSync(path.join(targetDir, 'pet.css'), css, 'utf8');

    console.log("HOÀN TẤT VIỆC PHỤC HỒI TỪ BẢN GỐC VÀ VÁ LỖI!");
} catch (e) {
    console.error(e);
}
