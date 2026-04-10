let currentLottieAnim = null;
let currentLottiePath = "";
let isAnimationPlaying = false;

// ===== CÂY GIA PHẢ CÁC LOÀI TINH LINH =====
const PET_SPECIES = {
    cat: { label: 'Mèo Thần', themeColor: '#ff9ecd', stages: [{ name: 'Trứng Mèo', reqLv: 1 }, { name: 'Mèo Con', reqLv: 3 }, { name: 'Mèo Tinh Nghịch', reqLv: 10 }, { name: 'Sư Tử Chúa', reqLv: 25 }] },
    dragon: { label: 'Rồng Thần', themeColor: '#98e898', stages: [{ name: 'Trứng Rồng', reqLv: 1 }, { name: 'Thằn Lằn', reqLv: 3 }, { name: 'Rồng Xanh', reqLv: 10 }, { name: 'Thần Rồng', reqLv: 25 }] },
    bunny: { label: 'Thỏ Trăng', themeColor: '#ffe4b5', stages: [{ name: 'Trứng Thỏ', reqLv: 1 }, { name: 'Thỏ Con', reqLv: 3 }, { name: 'Thỏ Ánh Trăng', reqLv: 10 }, { name: 'Ngọc Thỏ', reqLv: 25 }] },
    mascot: { label: "Mascot", themeColor: '#dda0dd', stages: [{ name: 'Trứng Mascot', reqLv: 1 }, { name: 'Mascot Nhỏ', reqLv: 3 }, { name: 'Mascot Lớn', reqLv: 10 }, { name: 'Thần Mascot', reqLv: 25 }] },
    dog: { label: 'Cún Cưng', themeColor: '#b8860b', stages: [{ name: 'Trứng Cún', reqLv: 1 }, { name: 'Cún Con', reqLv: 3 }, { name: 'Cún Năng Động', reqLv: 10 }, { name: 'Thần Cún', reqLv: 25 }] },
    owl: { label: 'Cú Mèo', themeColor: '#4e342e', stages: [{ name: 'Trứng Cú', reqLv: 1 }, { name: 'Cú Gen 1', reqLv: 3 }, { name: 'Cú Ánh Đêm', reqLv: 10 }, { name: 'Thần Cú', reqLv: 25 }] }
};

// ===== DỮ LIỆU =====
if (typeof window.RPG !== 'undefined') window.RPG.init();
let myPet = JSON.parse(localStorage.getItem('rpg_pet')) || { lv: 1, exp: 0, species: null };
// Initialize petMain visibility based on species presence
document.addEventListener('DOMContentLoaded', () => {
    const pm = document.getElementById('pet-main');
    const sp = document.getElementById('species-picker');
    if (myPet.species) {
        if(pm) pm.style.display = 'block';
        if(sp) sp.style.display = 'none';
        renderPet();
    } else {
        if(pm) pm.style.display = 'none';
        if(sp) sp.style.display = 'block';
    }
});
let petInteractionState = 'random';
let nextActionTime = Date.now() + 3000;

// ===== DOM =====
const spriteEl = document.getElementById('pet-sprite');
const nameEl = document.getElementById('pet-name');
const lvEl = document.getElementById('pet-lv');
const feedBtn = document.getElementById('feed-btn');
const expBar = document.getElementById('exp-bar');
const expCurEl = document.getElementById('pet-exp-cur');
const expReqEl = document.getElementById('pet-exp-req');
const speciesPicker = document.getElementById('species-picker');
const petMain = document.getElementById('pet-main');
const changeBtn = document.getElementById('change-species-btn');
const coinDisplay = document.getElementById('coin-display');
const { ipcRenderer } = require('electron');

// ===== GLOBAL HELPERS =====
window.closeModals = () => {
    document.getElementById('shop-modal').style.display = 'none';
    document.getElementById('inventory-modal').style.display = 'none';
};

window.openInventory = () => {
    document.getElementById('inventory-modal').style.display = 'flex';
    const container = document.getElementById('inventory-items');
    container.innerHTML = '';
    const items = RPG.state.inventory || [];
    const grouped = {};
    items.forEach(it => { if(it.type==='food'){ grouped[it.id] = grouped[it.id] || {...it, count:0}; grouped[it.id].count++; } });
    const entries = Object.values(grouped);
    if (!entries.length) { container.innerHTML = '<div style="padding:20px;text-align:center;">Trống trơn...</div>'; return; }
    const icons = { cookie: '🍪', apple: '🍎', meat: '🍖' };
    entries.forEach(item => {
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.onclick = () => window.useItem(item.id, item.value, item.name);
        div.innerHTML = `<div class="item-icon">${icons[item.id]||'🍱'}</div><div class="item-name">${item.name} x${item.count}</div><div class="item-cost">Cho Ăn</div>`;
        container.appendChild(div);
    });
};

window.useItem = (id, expVal, name) => {
    const idx = RPG.state.inventory.findIndex(i => i.id === id);
    if (idx === -1) return;
    RPG.state.inventory.splice(idx, 1);
    RPG.save();
    myPet.exp += expVal;
    showToast(`Đã cho ăn ${name}! +${expVal} EXP`);
    createHeart();
    setPetState('happy');
    renderPet();
};

window.buyShopItem = (id, cost, name, type, value) => {
    if (RPG.state.coins < cost) { showToast('❌ Không đủ Xu!'); return; }
    RPG.state.coins -= cost;
    if (type === 'food') {
        RPG.state.inventory.push({ id, name, type, value });
    } else if (id === 'test_levelup') {
         myPet.exp += (getPetExpReq(myPet.lv) - myPet.exp);
    } else if (id === 'box') {
         myPet.exp += 50;
    }
    RPG.save();
    showToast(`🛍️ Đã mua ${name}!`);
    createHeart();
    setPetState('happy');
    renderPet();
};

// ===== CORE LOGIC =====
function setPetState(state) {
    petInteractionState = state;
    updateSpriteClass();
}

function updateSpriteClass() {
    if (!myPet.species) { showSpeciesPicker(); return; }
    const lv = myPet.lv || 1;
    let stageIdx = 0; // 0=Egg, 1=Gen_1, 2=Gen_2
    if (lv >= 25) stageIdx = 2; else if (lv >= 3) stageIdx = 1;

    // 1. Egg Stage (Lv 1-2)
    if (stageIdx === 0) {
        spriteEl.innerHTML = `<div style='font-size: min(120px, 15vh); user-select:none;'>🥚</div>`;
        if (currentLottieAnim) { currentLottieAnim.destroy(); currentLottieAnim = null; }
        currentLottiePath = "";
        return;
    }

    // 2. Gen 1 Stage (Lv 3-24) - Emoji (except for Owl)
    if (stageIdx === 1 && myPet.species !== 'owl') {
        const stickers = { dragon: '🐲', cat: '🐱', bunny: '🐰', mascot: '🐣', dog: '🐶' };
        spriteEl.innerHTML = `<div style='font-size: min(150px, 18vh); filter: drop-shadow(2px 4px 6px rgba(0,0,0,0.1));'>${stickers[myPet.species] || '🐾'}</div>`;
        if (currentLottieAnim) { currentLottieAnim.destroy(); currentLottieAnim = null; }
        currentLottiePath = "";
        return;
    }

    // 3. Gen 2 (or Owl Gen 1) - Lottie JSON
    const path = require("path");
    const fs = require("fs");
    const speciesDir = path.join(__dirname, "assets", "pets", myPet.species);
    const stageDir = path.join(speciesDir, "gen_" + stageIdx);
    const searchDirs = fs.existsSync(stageDir) ? [stageDir, speciesDir] : [speciesDir];
    
    let jsonPath = null;
    let targetType = petInteractionState; // Use the direct interaction state

    // If state is 'random', we pick a random file
    if (targetType === 'random') {
        const roll = Math.random();
        // 10% Happy, 90% Other/Idle
        let searchType = roll < 0.1 ? 'happy' : 'idle'; 
        
        // Actually just pick ANY file in the dir for true randomness
        for (const dir of searchDirs) {
            try {
                const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
                if (files.length > 0) {
                    // Weighted random: if we rolled 'idle', try to avoid files with 'happy' in name unless that's all there is
                    let filtered = files;
                    if (roll >= 0.1) filtered = files.filter(f => !f.includes('happy'));
                    if (filtered.length === 0) filtered = files;

                    const chosen = filtered[Math.floor(Math.random() * filtered.length)];
                    jsonPath = path.relative(__dirname, path.join(dir, chosen)).replace(/\\/g, "/");
                    break;
                }
            } catch(e) {}
        }
    } else {
        // Specific state (like 'happy' from feeding)
        for (const dir of searchDirs) {
            const exactFile = path.join(dir, targetType + ".json");
            if (fs.existsSync(exactFile)) {
                jsonPath = path.relative(__dirname, exactFile).replace(/\\/g, "/");
                break;
            }
        }
    }

    // Final global fallback
    if (!jsonPath) {
        for (const dir of searchDirs) {
            try {
                const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
                if (files.length > 0) {
                    const chosen = files[Math.floor(Math.random() * files.length)];
                    jsonPath = path.relative(__dirname, path.join(dir, chosen)).replace(/\\/g, "/");
                    break;
                }
            } catch(e) {}
        }
    }

    if (currentLottiePath === jsonPath && currentLottieAnim) return;

    if (jsonPath) {
        currentLottiePath = jsonPath;
        if (currentLottieAnim) currentLottieAnim.destroy();
        spriteEl.innerHTML = "";
        
        isAnimationPlaying = true;
        currentLottieAnim = window.lottie.loadAnimation({
            container: spriteEl,
            renderer: 'svg',
            loop: (petInteractionState === 'random'), 
            autoplay: true,
            path: jsonPath
        });
        currentLottieAnim.addEventListener('complete', () => { 
            if (petInteractionState !== 'random') {
                isAnimationPlaying = false; 
                petInteractionState = 'random';
                updateSpriteClass();
            }
        });
        currentLottieAnim.addEventListener('error', () => { isAnimationPlaying = false; });
    } else {
        spriteEl.innerHTML = "<div style='font-size:80px;'>🐾</div>";
    }
}

function renderPet() {
    if (!myPet.species) { showSpeciesPicker(); return; }
    petMain.style.display = 'block';
    speciesPicker.style.display = 'none';

    while (myPet.exp >= getPetExpReq(myPet.lv)) {
        myPet.exp -= getPetExpReq(myPet.lv);
        myPet.lv++;
        triggerEvoFx();
    }
    
    const spec = PET_SPECIES[myPet.species];
    const stages = spec.stages;
    let stage = stages[0];
    if (myPet.lv >= 25) stage = stages[3] || stages[stages.length-1];
    else if (myPet.lv >= 10) stage = stages[2] || stages[stages.length-1];
    else if (myPet.lv >= 3) stage = stages[1] || stages[stages.length-1];

    nameEl.innerText = stage.name;
    lvEl.innerText = myPet.lv;
    coinDisplay.innerText = RPG.state.coins;
    
    const needed = getPetExpReq(myPet.lv);
    expBar.style.width = Math.min(100, Math.floor(myPet.exp / needed * 100)) + '%';
    expCurEl.innerText = Math.floor(myPet.exp);
    expReqEl.innerText = needed;
    
    document.documentElement.style.setProperty('--pet-theme', spec.themeColor);
    localStorage.setItem('rpg_pet', JSON.stringify(myPet));
    updateSpriteClass();
}

function getPetExpReq(lv) { return 60 * lv; }
function showSpeciesPicker() { speciesPicker.style.display = 'block'; petMain.style.display = 'none'; }
function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'skill-toast'; el.innerText = msg; document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'translate(-50%, -10px)'; }, 10);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 1500);
}
function createHeart() {
    const h = document.createElement('div'); h.innerText = '💖'; h.className = 'heart-fx';
    spriteEl.appendChild(h);
    setTimeout(() => { h.style.transform = 'translateY(-60px) scale(1.5)'; h.style.opacity = '0'; setTimeout(() => h.remove(), 800); }, 20);
}
function triggerEvoFx() {
    const fx = document.createElement("div"); fx.className = "smoke-fx"; fx.innerText = "✨";
    Object.assign(fx.style, { position: "absolute", fontSize: "100px", width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100, animation: "puff 1s forwards" });
    spriteEl.appendChild(fx); setTimeout(() => fx.remove(), 1000);
}

// ===== LISTENERS =====
document.querySelectorAll('.species-btn').forEach(btn => {
    btn.onclick = () => {
        const targetSpecies = btn.dataset.species;
        
        // 1. Lưu tiến độ con cũ trước khi đổi
        if (myPet.species) {
            let allPets = JSON.parse(localStorage.getItem('rpg_all_pets')) || {};
            allPets[myPet.species] = { lv: myPet.lv, exp: myPet.exp };
            localStorage.setItem('rpg_all_pets', JSON.stringify(allPets));
        }

        // 2. Nạp tiến độ con mới (nếu có)
        let allPets = JSON.parse(localStorage.getItem('rpg_all_pets')) || {};
        let saved = allPets[targetSpecies];
        
        myPet.species = targetSpecies;
        myPet.lv = saved ? saved.lv : 1;
        myPet.exp = saved ? saved.exp : 0;
        
        // 3. Cập nhật UI
        const sp = document.getElementById('species-picker');
        const pm = document.getElementById('pet-main');
        if(sp) sp.style.display = 'none';
        if(pm) pm.style.display = 'block';

        // Xóa sạch trạng thái cũ để bắt đầu trứng mới
        if (currentLottieAnim) { currentLottieAnim.destroy(); currentLottieAnim = null; }
        currentLottiePath = "";
        
        renderPet();
        updateSpriteClass(); // Force hiện trứng ngay lập tức
    };
});
changeBtn.onclick = () => showSpeciesPicker();
spriteEl.onclick = () => { if(!isAnimationPlaying) { setPetState('happy'); createHeart(); } };

setInterval(() => {
    // If it's random mode, we change animation based on a timer
    // If it's interaction mode, we wait for 'complete'
    if (petInteractionState === 'random') {
        if (Date.now() > nextActionTime) {
            updateSpriteClass();
            nextActionTime = Date.now() + 8000 + Math.random() * 7000;
        }
    } else {
        // Watchdog: If an interaction gets stuck for > 8s, force back to random
        if (isAnimationPlaying && Date.now() > nextActionTime + 8000) {
            isAnimationPlaying = false;
            petInteractionState = 'random';
            updateSpriteClass();
        }
    }
}, 1000);

renderPet();
