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
document.addEventListener('DOMContentLoaded', async () => {
    const pm = document.getElementById('pet-main');
    const sp = document.getElementById('species-picker');
    
    // Initial species setup
    if (!RPG.state.ownedSpecies || RPG.state.ownedSpecies.length === 0) {
        if (myPet.species) {
            RPG.state.ownedSpecies = [myPet.species];
        } else {
            RPG.state.ownedSpecies = []; // Start fresh
        }
        RPG.save();
    }

    if (myPet.species) {
        if(pm) pm.style.display = 'block';
        if(sp) sp.style.display = 'none';
        renderPet();
    } else {
        if(pm) pm.style.display = 'none';
        if(sp) sp.style.display = 'block';
        renderSpeciesPicker();
    }
});
let petInteractionState = 'random';

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

// Giao diện Shop: Kiểm tra nếu là Test Mode thì hiện thêm Thuốc Tiến Hóa 0đ
function injectTestPotion() {
    ipcRenderer.send('pomo-command', 'sync'); // Yêu cầu Main Process gửi lại state để check isTestMode
}

ipcRenderer.on('pomo-sync', (e, state) => {
    const shopItemsContainer = document.querySelector('.shop-items');
    if (state.isTestMode && shopItemsContainer && !document.getElementById('test-potion-item')) {
        const testItem = document.createElement('div');
        testItem.id = 'test-potion-item';
        testItem.className = 'shop-item';
        testItem.onclick = () => window.buyShopItem('test_levelup', 0, 'Siêu Thuốc Tiến Hóa (Test)', 'instant', 9999);
        testItem.innerHTML = `
            <div class="item-icon">🧪</div>
            <div class="item-details">
                <div class="item-name">Siêu Thuốc Tiến Hóa</div>
                <div class="item-desc">Tiến hóa cực nhanh</div>
            </div>
            <div class="item-cost">0 Xu</div>
        `;
        shopItemsContainer.prepend(testItem); // Đưa lên đầu cho Boss dễ thấy
    }
});

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
         // Tăng EXP thẳng để lên cấp
         myPet.exp += 9999;
    } else if (id === 'box') {
         myPet.exp += 50;
    }
    RPG.save();
    showToast(`🛍️ Đã mua ${name}!`);
    createHeart();
    setPetState('happy');
    renderPet();
};

window.buyEgg = (eggType, cost, name) => {
    if (RPG.state.coins < cost) { showToast('❌ Không đủ Xu!'); return; }
    
    if (eggType === 'target') {
        showToast('🎯 Hãy chọn Pet bạn muốn mở khóa!');
        window.closeModals();
        showSpeciesPicker(true); // targeted mode
        return;
    }

    // Random Egg Logic
    RPG.state.coins -= cost;
    const allKeys = Object.keys(PET_SPECIES);
    const rolled = allKeys[Math.floor(Math.random() * allKeys.length)];
    
    revealEgg(rolled, cost);
};

function revealEgg(species, costSpent) {
    window.closeModals();
    const overlay = document.createElement('div');
    overlay.className = 'shop-modal';
    overlay.style.zIndex = "1000";
    overlay.innerHTML = `
        <div class="gacha-reveal-box">
            <div id="gacha-egg">🥚</div>
            <div id="gacha-msg">Đang ấp trứng...</div>
        </div>
    `;
    document.body.appendChild(overlay);

    const egg = document.getElementById('gacha-egg');
    const msg = document.getElementById('gacha-msg');

    // Animation sequence
    setTimeout(() => { egg.style.transform = 'rotate(-15deg)'; }, 500);
    setTimeout(() => { egg.style.transform = 'rotate(15deg)'; }, 1000);
    setTimeout(() => { egg.style.transform = 'rotate(-20deg) scale(1.1)'; }, 1500);
    setTimeout(() => { 
        egg.style.transform = 'scale(2)'; 
        egg.style.opacity = '0';
        msg.innerText = 'BÙM! ✨';
    }, 2000);

    setTimeout(() => {
        const isNew = !RPG.state.ownedSpecies.includes(species);
        if (isNew) {
            RPG.state.ownedSpecies.push(species);
            msg.innerHTML = `<div class="gacha-title">BẠN ĐÃ MỞ KHÓA:</div><div class="gacha-pet-name">${PET_SPECIES[species].label}</div>`;
        } else {
            // Refund/Compensation
            const bonusXP = 500;
            // Add XP to the specific pet in storage
            let allPets = JSON.parse(localStorage.getItem('rpg_all_pets')) || {};
            if (!allPets[species]) allPets[species] = { lv: 1, exp: 0 };
            allPets[species].exp += bonusXP;
            localStorage.setItem('rpg_all_pets', JSON.stringify(allPets));
            
            msg.innerHTML = `<div class="gacha-comp-title">BẠN ĐÃ CÓ ${PET_SPECIES[species].label}</div><div class="gacha-comp-val">+${bonusXP} XP ĐỀN BÙ!</div>`;
            
            // If current pet is the same, sync it
            if (myPet.species === species) {
                myPet.exp += bonusXP;
            }
        }
        
        RPG.save();
        renderPet();
        
        const closeHint = document.createElement('div');
        closeHint.innerText = '(Bấm để đóng)';
        closeHint.style.marginTop = '20px';
        overlay.appendChild(closeHint);
        overlay.onclick = () => overlay.remove();
    }, 2500);
}

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
        if (currentLottieAnim) {
            currentLottieAnim.destroy();
            currentLottieAnim = null;
        }
        currentLottiePath = jsonPath;
        spriteEl.innerHTML = "";
        
        isAnimationPlaying = true;
        currentLottieAnim = window.lottie.loadAnimation({
            container: spriteEl,
            renderer: 'svg',
            loop: false, // Để mình tự kiểm soát vòng lặp để đổi hoạt ảnh
            autoplay: true,
            path: jsonPath
        });
        currentLottieAnim.addEventListener('complete', () => { 
            // Luôn chuyển sang hoạt ảnh mới ngay khi vừa xong một vòng lặp
            isAnimationPlaying = false; 
            petInteractionState = 'random';
            updateSpriteClass();
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
        
        // ĐỒNG BỘ LEVEL SANG RPG SYSTEM
        if (typeof window.RPG !== 'undefined') {
            window.RPG.state.level = myPet.lv;
            window.RPG.save(); // Phát tín hiệu cho các widget khác biết sếp đã lên cấp!
        }
        
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
    
    // Đồng bộ Xu từ RPG System lên giao diện Pet
    if (typeof window.RPG !== 'undefined') {
        coinDisplay.innerText = window.RPG.state.coins;
    }
    
    const needed = getPetExpReq(myPet.lv);
    expBar.style.width = Math.min(100, Math.floor(myPet.exp / needed * 100)) + '%';
    expCurEl.innerText = Math.floor(myPet.exp);
    expReqEl.innerText = needed;
    
    document.documentElement.style.setProperty('--pet-theme', spec.themeColor);
    localStorage.setItem('rpg_pet', JSON.stringify(myPet));
    updateSpriteClass();
}

function getPetExpReq(lv) { return 60 * lv; }
function renderSpeciesPicker(isTargeted = false) {
    speciesPicker.style.display = 'block';
    petMain.style.display = 'none';

    const container = document.querySelector('.species-grid');
    container.innerHTML = '';

    Object.keys(PET_SPECIES).forEach(key => {
        const spec = PET_SPECIES[key];
        const isOwned = RPG.state.ownedSpecies.includes(key);
        
        const btn = document.createElement('button');
        btn.className = `species-btn ${isOwned ? 'owned' : 'locked'}`;
        btn.dataset.species = key;
        
        const emojis = { cat: '🐱', dragon: '🐉', bunny: '🐰', mascot: '🐣', dog: '🐶', owl: '🦉' };
        btn.innerHTML = `${emojis[key]}<br><small>${spec.label}</small>`;

        btn.onclick = () => {
            if (isTargeted && !isOwned) {
                // Targeted buying logic
                const cost = 400;
                if (RPG.state.coins < cost) { showToast('❌ Không đủ 400 Xu!'); return; }
                RPG.state.coins -= cost;
                RPG.state.ownedSpecies.push(key);
                RPG.save();
                showToast(`✨ Đã mở khóa ${spec.label}!`);
                renderSpeciesPicker(false);
                return;
            }

            if (!isOwned) {
                showToast('🔒 Bạn chưa sở hữu loài này. Hãy mua Trứng trong Shop!');
                return;
            }

            switchPet(key);
        };
        container.appendChild(btn);
    });
}

function switchPet(targetSpecies) {
    // 1. Save old
    if (myPet.species) {
        let allPets = JSON.parse(localStorage.getItem('rpg_all_pets')) || {};
        allPets[myPet.species] = { lv: myPet.lv, exp: myPet.exp };
        localStorage.setItem('rpg_all_pets', JSON.stringify(allPets));
    }

    // 2. Load new
    let allPets = JSON.parse(localStorage.getItem('rpg_all_pets')) || {};
    let saved = allPets[targetSpecies];
    
    myPet.species = targetSpecies;
    myPet.lv = saved ? saved.lv : 1;
    myPet.exp = saved ? saved.exp : 0;
    
    // 3. UI
    speciesPicker.style.display = 'none';
    petMain.style.display = 'block';

    if (currentLottieAnim) { currentLottieAnim.destroy(); currentLottieAnim = null; }
    currentLottiePath = "";
    
    renderPet();
}

function showSpeciesPicker(isTargeted = false) { 
    renderSpeciesPicker(isTargeted);
}
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
    fx.classList.add('evo-fx-container');
    spriteEl.appendChild(fx); setTimeout(() => fx.remove(), 1000);
}

// ===== LISTENERS =====
// Replaced by renderSpeciesPicker dynamic rendering
changeBtn.onclick = () => showSpeciesPicker();
spriteEl.onclick = () => { if(!isAnimationPlaying) { setPetState('happy'); createHeart(); } };

// Mở shop và chuẩn bị thuốc test
const originalShopBtn = document.getElementById('shop-btn');
if (originalShopBtn) {
    originalShopBtn.onclick = () => {
        document.getElementById('shop-modal').style.display = 'flex';
        injectTestPotion();
    };
}

window.hardResetPet = () => {
    if (confirm("⚠️ CẢNH BÁO: Hành động này sẽ xóa sạch toàn bộ dữ liệu Pet, Xu và Level của Boss để bắt đầu Audit lại từ đầu. Sếp có chắc chắn không?")) {
        localStorage.clear();
        window.location.reload();
    }
};

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
