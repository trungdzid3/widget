let currentLottieAnim = null;
let currentLottiePath = "";
// ===== CÂY GIA PHẢ CÁC LOÀI TINH LINH =====
const PET_SPECIES = {
    cat: {
        label: 'Mèo Thần',
        themeColor: '#ff9ecd',
        stages: [
            { name: 'Trứng Mèo',      sprite: 's1', anim: 'anim-egg',    reqLv: 1,  skill: null },
            { name: 'Mèo Con',         sprite: 's2', anim: 'anim-bounce', reqLv: 3,  skill: { id:'cat_1', name:'Vuốt Ve Thần Kỳ',    desc:'Nhận 15 EXP miễn phí!',             cd: 60  } },
            { name: 'Mèo Tinh Nghịch', sprite: 's3', anim: 'anim-bounce', reqLv: 10, skill: { id:'cat_2', name:'Nước Mắt Mèo',        desc:'Hồi 40 EXP từ hư không!',           cd: 120 } },
            { name: 'Sư Tử Chúa',      sprite: 's4', anim: 'anim-pulse',  reqLv: 25, skill: { id:'cat_3', name:'Tiếng Gầm Vũ Trụ',    desc:'x2 EXP trong 60 giây!',             cd: 300 } }
        ]
    },
    dragon: {
        label: 'Rồng Thần',
        themeColor: '#98e898',
        stages: [
            { name: 'Trứng Rồng',  sprite: 's1', anim: 'anim-egg',    reqLv: 1,  skill: null },
            { name: 'Thằn Lằn',    sprite: 's2', anim: 'anim-bounce', reqLv: 3,  skill: { id:'drg_1', name:'Cắn Đuôi',         desc:'Giảm 50% phí Cho Ăn trong 30 giây!', cd: 90  } },
            { name: 'Rồng Xanh',   sprite: 's3', anim: 'anim-float',  reqLv: 10, skill: { id:'drg_2', name:'Phun Lửa',         desc:'Thêm 60 EXP vào kho Pet!',           cd: 180 } },
            { name: 'Thần Rồng',   sprite: 's4', anim: 'anim-pulse',  reqLv: 25, skill: { id:'drg_3', name:'Bão Lửa Thiên Hà', desc:'x3 EXP trong 30 giây!',              cd: 600 } }
        ]
    },
    bunny: {
        label: 'Thỏ Trăng',
        themeColor: '#ffe4b5',
        stages: [
            { name: 'Trứng Thỏ',      sprite: 's1', anim: 'anim-egg',    reqLv: 1,  skill: null },
            { name: 'Thỏ Con',          sprite: 's2', anim: 'anim-bounce', reqLv: 3,  skill: { id:'bny_1', name:'Nhảy Bông Bông',   desc:'Nhận 10 EXP + giảm phí Cho Ăn!',    cd: 60  } },
            { name: 'Thỏ Ánh Trăng',   sprite: 's3', anim: 'anim-float',  reqLv: 10, skill: { id:'bny_2', name:'Trăng Mọc',        desc:'Hồi 50 EXP tức thì!',               cd: 150 } },
            { name: 'Ngọc Thỏ',        sprite: 's4', anim: 'anim-pulse',  reqLv: 25, skill: { id:'bny_3', name:'Bạch Ngọc Hào Quang','desc':'x2 EXP trong 120 giây!',          cd: 600 } }
        ]
    },
    mascot: {
        label: "Mascot",
        themeColor: '#dda0dd',
        stages: [
            { name: 'Trứng Bướm',   sprite: 's1', anim: 'anim-egg',    reqLv: 1,  skill: null },
            { name: 'Sâu Bướm',     sprite: 's2', anim: 'anim-bounce', reqLv: 3,  skill: { id:'bfl_1', name:'Tơ Tiên',          desc:'Miễn phí Cho Ăn trong 30 giây!',     cd: 120 } },
            { name: 'Kén Ngủ',      sprite: 's3', anim: 'anim-egg',    reqLv: 10, skill: { id:'bfl_2', name:'Ngủ Đông Phục Sinh','desc':'Hồi toàn bộ EXP chi phí hôm nay!', cd: 300 } },
            { name: 'Bướm Tiên',    sprite: 's4', anim: 'anim-float',  reqLv: 25, skill: { id:'bfl_3', name:'Bụi Tiên Huyền Bí', desc:'x2 EXP + Cho Ăn miễn phí 60 giây!', cd: 600 } }
        ]
    }
};

if (typeof process !== 'undefined') {
    process.on('uncaughtException', (err) => {
        require('fs').appendFileSync('error-pet.log', err.stack + '\n');
    });
}

// ===== DỮ LIỆU =====
RPG.init();
let myPet  = JSON.parse(localStorage.getItem('rpg_pet'))    || { lv: 1, exp: 0, species: null };
let skillCooldowns = JSON.parse(localStorage.getItem('rpg_pet_cd')) || {};
let petInteractionState = 'idle'; // Tránh lỗi biến TDZ bị gọi sớm
let nextActionTime = Date.now() + 3000;

// ===== DOM =====
const spriteEl    = document.getElementById('pet-sprite');
const nameEl      = document.getElementById('pet-name');
const lvEl        = document.getElementById('pet-lv');
const feedBtn     = document.getElementById('feed-btn');
const shopBtn     = document.getElementById('shop-btn');
const skillBtn    = document.getElementById('skill-btn');
const expBar      = document.getElementById('exp-bar');
const expCurEl    = document.getElementById('pet-exp-cur');
const expReqEl    = document.getElementById('pet-exp-req');
const buffStatus  = document.getElementById('buff-status');
const speciesPicker = document.getElementById('species-picker');
const shopModal     = document.getElementById('shop-modal');
const petMain     = document.getElementById('pet-main');
const changeBtn   = document.getElementById('change-species-btn');
const coinDisplay = document.getElementById('coin-display');
const closeShopBtn = document.getElementById('close-shop-btn');
const { ipcRenderer } = require('electron');

let currentWeather = { temp: 25, desc: 'Bình thường', fx: 'none' };
let weatherComplaints = [];

ipcRenderer.on('weather-impact', (e, data) => {
    currentWeather = data;
    // Mưa/Bão thì thú cưng dễ buồn/Sấm sét giật mình
    if (data.fx.includes('rain') || data.fx === 'thunder') {
        petInteractionState = 'idle'; // Tạm trốn
        weatherComplaints = ['⛈️ Sợ sấm chớp quá!', '🌧️ Mưa ướt hết lông rồi...', '💧 Em không muốn đi dạo đâu!', '🌩️ Ôi sấm kìa!'];
        showToast('🌨️ Trời mưa quá, Pet đang run rẩy!');
    } else if (data.temp > 35) {
        weatherComplaints = ['🔥 Nóng chảy mỡ!', '☀️ Nóng quá đi mất!', '🥵 Cho em xin ly nước đá!', '🏜️ Cứu tôi với, khát quá!'];
        showToast('🔥 Nóng rát quá, mua nước cho Pet đi!');
    } else if (data.temp < 15) {
        weatherComplaints = ['❄️ Lạnh run người!', '🧊 Đắp chăn cho em với!', '⛄ Tuyết rơi thì mệt lắm...', '🥶 Trùm mền ngủ ngon hơn.'];
        showToast('❄️ Lạnh quá, Pet cần được sưởi ấm!');
    } else {
        weatherComplaints = ['🌸 Thời tiết hôm nay thật đẹp!', '☀️ Nắng ấm, đi chơi không boss?', '🌿 Gió hiu hiu thích quá!', '🐾 Ai dắt mị đi dạo nào!'];
        showToast('🌤️ Trời đẹp, Pet đang rất vui vẻ!');
    }
});

setInterval(() => {
    if (weatherComplaints.length > 0 && Math.random() < 0.25) { // 25% chance every 12 seconds
        const randomComplaint = weatherComplaints[Math.floor(Math.random() * weatherComplaints.length)];
        showToast(randomComplaint);
    }
}, 12000);

// ===== INIT =====
if (!myPet.species) {
    showSpeciesPicker();
} else {
    renderPet();
}

RPG.onStateChange = (newState) => {
    coinDisplay.innerText = (newState && typeof newState.coins !== 'undefined') ? newState.coins : (typeof window !== 'undefined' && window.RPG && window.RPG.state && typeof window.RPG.state.coins !== 'undefined') ? window.RPG.state.coins : 0;
    renderPet();
};

// Fallback interval to ensure coins are perfectly synced if IPC or event listener misses:
setInterval(() => {
    if (typeof RPG !== 'undefined' && RPG.state && typeof RPG.state.coins !== 'undefined') {
        const cd = document.getElementById('coin-display');
        if (cd && cd.innerText !== String(RPG.state.coins)) cd.innerText = RPG.state.coins;
    }
}, 1000);


setInterval(() => {
    if (Date.now() > nextActionTime) {
        // Random behavior
        const rand = Math.random();
        if (rand < 0.6) setPetState('idle');
        else if (rand < 0.85) setPetState('run');
        else setPetState('sit');
        
        nextActionTime = Date.now() + 4000 + Math.random() * 5000;
    }
}, 1000);

function setPetState(state) {
    if (petInteractionState === 'happy') return;
    petInteractionState = state;
    updateSpriteClass();
}



function updateSpriteClass() {
    const spec = PET_SPECIES[myPet.species];
    if (!spec) return;

    const stages = spec.stages;
    let stage = stages[myPet.lv >= stages[1].reqLv ? 1 : 0];

    // Apply interaction and animation CSS classes
    let baseCls = 'pet-sprite';
    if (stage && stage.anim) baseCls += ' ' + stage.anim;
    spriteEl.className = baseCls + (petInteractionState !== 'idle' ? ' interact-' + petInteractionState : '');

    if (myPet.lv < stages[1].reqLv) {
        spriteEl.innerHTML = "<div class='egg-inner' style='display:flex; justify-content:center; align-items:center; width:100%; height:100%; user-select:none;'>" + (myPet.species==="dragon"?"\uD83D\uDC09":myPet.species==="bunny"?"\uD83D\uDC30":myPet.species==="cat"?"\uD83D\uDC31":"\uD83D\uDC23") + "</div>";
        if (currentLottieAnim) { currentLottieAnim.destroy(); currentLottieAnim = null; }
        currentLottiePath = "";
        return;
    }

    function getRandomLottie() {
        const path = require("path");
        const fs = require("fs");
        const petDir = path.join(__dirname, "assets", "pets", myPet.species);
        if (!fs.existsSync(petDir)) return null;
        const files = fs.readdirSync(petDir).filter(f => f.endsWith(".json"));
        if (files.length === 0) return null;
        return "assets/pets/" + myPet.species + "/" + files[Math.floor(Math.random() * files.length)];
    }

    let jsonPath = getRandomLottie();
    if (!jsonPath) {
        spriteEl.innerHTML = "<img src=\"Bunny_Sunny.png\" style=\"width:100%;height:100%;object-fit:contain;pointer-events:none;\">";
        return;
    }
    if (currentLottiePath === jsonPath && currentLottieAnim) return;
    currentLottiePath = jsonPath;
    if (currentLottieAnim) {
        currentLottieAnim.destroy();
        currentLottieAnim = null;
    }
    spriteEl.innerHTML = "";
    try {
        currentLottieAnim = lottie.loadAnimation({ container: spriteEl, renderer: "svg", loop: true, autoplay: true, path: jsonPath });
    } catch (e) { }
}
// ===== RENDER =====
function renderPet() {
    if (!myPet.species) return;
    const spec = PET_SPECIES[myPet.species];
    if (!spec) return;

    coinDisplay.innerText = RPG.state.coins || 0;
    // Check Level Up
    let evolved = false;
    while (myPet.exp >= getPetExpReq(myPet.lv)) {
        myPet.exp -= getPetExpReq(myPet.lv);
        myPet.lv++;
        evolved = true;
    }

    // Find Stage
    const stages = spec.stages;
    let stage = stages[0];
    for (let i = stages.length - 1; i >= 0; i--) {
        if (myPet.lv >= stages[i].reqLv) { stage = stages[i]; break; }
    }

    spriteEl.innerText = ''; 
    updateSpriteClass();
    nameEl.innerText = stage.name;
    lvEl.innerText = myPet.lv;
    applyTheme(myPet.species);


    // EXP Bar
    const needed = getPetExpReq(myPet.lv);
    expBar.style.width = Math.min(100, Math.floor(myPet.exp / needed * 100)) + '%';
    expCurEl.innerText = Math.floor(myPet.exp);
    expReqEl.innerText = needed;

    // Skill Button
    const now = Date.now();
    if (stage.skill) {
        const cdLeft = Math.max(0, Math.ceil(((skillCooldowns[stage.skill.id] || 0) - now) / 1000));
        skillBtn.disabled = cdLeft > 0;
        skillBtn.classList.toggle('skill-locked', cdLeft > 0);
        skillBtn.innerText = cdLeft > 0 ? cdLeft + 's' : '✨ ' + stage.skill.name;
        skillBtn.title = stage.skill.name;
        skillBtn.onclick = () => activateSkill(stage.skill);
    } else {
        skillBtn.disabled = true;
        skillBtn.classList.add('skill-locked');
        skillBtn.innerText = '✨ KN (Khóa)';
        skillBtn.title = 'Kỹ Năng (Khóa)';
        skillBtn.onclick = null;
    }

    // Feed Button
    feedBtn.disabled = false;


    renderBuffStatus();
    changeBtn.style.display = myPet.lv === 1 ? 'flex' : 'none';
    savePet();
}

function getPetExpReq(lv) { return 60 * lv; }
function savePet() { localStorage.setItem('rpg_pet', JSON.stringify(myPet)); }
function applyTheme(species) { document.documentElement.style.setProperty('--pet-theme', PET_SPECIES[species].themeColor); }

// ===== ACTIONS ===== (Now mapped in HTML directly)
window.openInventory = () => {
    document.getElementById('inventory-modal').style.display = 'flex';
    const container = document.getElementById('inventory-items');
    container.innerHTML = '';

    if (!RPG.state.inventory) RPG.state.inventory = [];
    
    // Group identical items
    const grouped = {};
    RPG.state.inventory.forEach(item => {
        if (item.type !== 'food') return;
        if (!grouped[item.id]) grouped[item.id] = { ...item, count: 0 };
        grouped[item.id].count++;
    });

    const entries = Object.values(grouped);
    if (entries.length === 0) {
        container.innerHTML = '<div style="color:#666;text-align:center;padding:20px;">Túi đồ rỗng! Mau đi Mua Đồ nhé.</div>';
        return;
    }

    const icons = { cookie: '🍪', apple: '🍎', meat: '🍖' };
    
    entries.forEach(item => {
        const div = document.createElement('div');
        div.className = 'shop-item';
        div.onclick = () => window.useItem(item.id, item.value, item.name);
        div.innerHTML = `
            <div class="item-icon">${icons[item.id] || '🍱'}</div>
            <div class="item-name">${item.name} <span style="color:#d81b60;">x${item.count}</span></div>
            <div class="item-cost" style="background:#e8f5e9;color:#2e7d32;">Cho Ăn</div>
        `;
        container.appendChild(div);
    });
};

window.useItem = (id, expVal, name) => {
    // Find index of first matching item
    const idx = RPG.state.inventory.findIndex(i => i.id === id);
    if (idx === -1) return;
    
    RPG.state.inventory.splice(idx, 1); // remove 1
    RPG.save();
    
    const mult = getActiveBuff('exp_x3') || getActiveBuff('exp_x2') || 1;
    myPet.exp += expVal * mult;
    
    showToast(`Đã cho ăn ${name}! +${expVal * mult} EXP`);
    createHeart();
    petInteractionState = 'happy';
    updateSpriteClass();
    setTimeout(() => { petInteractionState = 'idle'; updateSpriteClass(); }, 1000);
    renderPet();
    window.openInventory(); // Refresh UI
};

spriteEl.onclick = () => {
    petInteractionState = 'happy';
    updateSpriteClass();
    createHeart();
    setTimeout(() => {
        petInteractionState = 'idle';
        updateSpriteClass();
    }, 800);
};


// Global function for shop item callbacks
function showToast(msg) {
    const el = document.createElement('div');
    el.className = 'skill-toast';
    el.innerText = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '1'; el.style.transform = 'translate(-50%, -10px)'; }, 10);
    setTimeout(() => { el.style.opacity = '0'; }, 1500);
    setTimeout(() => { el.remove(); }, 1800);
}

window.buyShopItem = (id, cost, name, type, value) => {
    if (RPG.state.coins < cost) {
        showToast('❌ Không đủ Xu!');
        return;
    }
    RPG.state.coins -= cost;
    
    if (type === 'food') {
        if (!RPG.state.inventory) RPG.state.inventory = [];
        RPG.state.inventory.push({ id, name, type, value });
        RPG.save();
        showToast(`🛍️ Đã cất ${name} vào Túi!`);
        return;
    }

    // Instance Usage Items
    RPG.save();
    const mult = getActiveBuff('exp_x3') || getActiveBuff('exp_x2') || 1;

    if (id === 'potion') {
        skillCooldowns = {};
        localStorage.setItem('rpg_pet_cd', '{}');
        showToast('🧪 Thuốc Thần! Hồi phục kỹ năng!');
    } else if (id === 'box') {
        const randXP = Math.floor(Math.random() * 90) + 10;
        myPet.exp += randXP * mult;
        showToast(`🎁 Hộp Bí Ẩn! +${randXP} EXP!`);
    }

    createHeart();
    petInteractionState = 'happy';
    updateSpriteClass();
    setTimeout(() => { petInteractionState = 'idle'; updateSpriteClass(); }, 1000);
    
    renderPet();
};

// ===== SPECIES PICKER =====
function showSpeciesPicker() {
    speciesPicker.style.display = 'block';
    petMain.style.display = 'none';
}
document.querySelectorAll('.species-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        let allPets = JSON.parse(localStorage.getItem('rpg_all_pets')) || {};
        let savedData = allPets[btn.dataset.species];
        if (savedData) {
            myPet.lv = savedData.lv;
            myPet.exp = savedData.exp;
        } else {
            myPet.lv = 1;
            myPet.exp = 0;
        }
        myPet.species = btn.dataset.species;
        savePet();
        speciesPicker.style.display = 'none';
        petMain.style.display = 'block';
        applyTheme(myPet.species);
        renderPet();
    });
});
changeBtn.addEventListener('click', () => {
    let allPets = JSON.parse(localStorage.getItem('rpg_all_pets')) || {};
    if(myPet.species) {
        allPets[myPet.species] = { lv: myPet.lv, exp: myPet.exp };
        localStorage.setItem('rpg_all_pets', JSON.stringify(allPets));
    }
    showSpeciesPicker();
});

// ===== SKILLS =====
function activateSkill(skill) {
    const now = Date.now();
    const cdLeft = (skillCooldowns[skill.id] || 0) - now;
    if (cdLeft > 0) return;

    switch (skill.id) {
        case 'cat_1': RPG.state.currentXP += 15; RPG.save(); showToast('😸 +15 EXP Player!'); break;
        case 'cat_2': RPG.state.currentXP += 40; RPG.save(); showToast('😿 +40 EXP Player!'); break;
        case 'cat_3': setBuff('exp_x2', 2, 60); showToast('🦁 x2 EXP 60s!'); break;
        case 'drg_1': setBuff('half_feed', true, 30); showToast('🦎 Giảm phí 30s!'); break;
        case 'drg_2': myPet.exp += 60; showToast('🐲 Pet +60 EXP!'); break;
        case 'drg_3': setBuff('exp_x3', 3, 30); showToast('🐉 x3 EXP World!'); break;
        case 'bny_1': RPG.state.currentXP += 10; RPG.save(); setBuff('half_feed', true, 20); showToast('🐇 +10 EXP & Giảm phí!'); break;
        case 'bny_2': RPG.state.currentXP += 50; RPG.save(); showToast('🐰 +50 EXP Player!'); break;
        case 'bny_3': setBuff('exp_x2', 2, 120); showToast('🌙 x2 EXP 120s!'); break;
        case 'bfl_1': setBuff('free_feed', true, 30); showToast('🐛 Free Food 30s!'); break;
        case 'bfl_2': RPG.state.coins += 20; RPG.save(); showToast('🧇 +20 Xu!'); break;
        case 'bfl_3': setBuff('exp_x2', 2, 60); setBuff('free_feed', true, 60); showToast('🦋 God Mode 60s!'); break;
    }

    skillCooldowns[skill.id] = now + skill.cd * 1000;
    localStorage.setItem('rpg_pet_cd', JSON.stringify(skillCooldowns));
    renderPet();
}

// ===== BUFFS & FX =====
function setBuff(type, value, durationSec) {
    try {
        const buffs = JSON.parse(localStorage.getItem('rpg_buffs') || '{}');
        buffs[type] = { value, expires: Date.now() + durationSec * 1000 };
        localStorage.setItem('rpg_buffs', JSON.stringify(buffs));
    } catch(e) { }
}
function getActiveBuff(type) {
    try {
        const buffs = JSON.parse(localStorage.getItem('rpg_buffs') || '{}');
        const b = buffs[type];
        if (!b || Date.now() > b.expires) return null;
        return b.value;
    } catch (e) { return null; }
}
function renderBuffStatus() {
    const buffs = JSON.parse(localStorage.getItem('rpg_buffs') || '{}');
    const now = Date.now();
    const active = [];
    for (const [k, b] of Object.entries(buffs)) {
        const left = Math.ceil((b.expires - now) / 1000);
        if (left > 0) {
            const labels = { exp_x2:'⚡x2', exp_x3:'⚡x3', half_feed:'💰-50%', free_feed:'🆓Free' };
            active.push(`${labels[k] || k} (${left}s)`);
        }
    }
    buffStatus.style.display = active.length ? 'block' : 'none';
    buffStatus.innerText = active.join(' • ');
}
function createHeart() {
    const h = document.createElement('div');
    h.innerText = '💖'; h.className = 'heart-fx';
    document.querySelector('.pet-stage').appendChild(h);
    setTimeout(() => { h.style.transform = 'translateY(-60px) scale(1.5)'; h.style.opacity = '0'; }, 20);
    setTimeout(() => h.remove(), 850);
}
function triggerEvoFx() {
    const fx = document.createElement("div");
    fx.className = "smoke-fx";
    fx.innerText = "??";
    Object.assign(fx.style, { position: "absolute", fontSize: "120px", display: "flex", justifyContent: "center", alignItems: "center", width: "100%", height: "100%", zIndex: 100, pointerEvents: "none", animation: "puff 1.2s ease-out forwards", opacity: 1 });
    spriteEl.parentElement.appendChild(fx);
    setTimeout(() => fx.remove(), 1200);
}

function logicLoop() {
    const now = Date.now();
    if (now > nextActionTime && petInteractionState !== 'happy') {
        const rand = Math.random();
        if (rand < 0.4) setPetState('run');
        else if (rand < 0.7) setPetState('sit');
        else setPetState('idle');
        
        let waitStr = (Math.random() * 3000) + 2000;
        nextActionTime = now + waitStr;
    }
    
    // Auto idle cleanup
    if (petInteractionState === 'run' && Math.random() < 0.1) setPetState('idle');
    
    // Chat bubble randomizer
    if (Math.random() < 0.05) {
        let blabs = ['Giao di?n x?n qu�!', 'Th?i ti?t h�m nay th? n�o?', 'B?n l�m vi?c vui nh�!', 'M�nh di d?o x�u', 'Zzz...'];
        if (weatherComplaints && weatherComplaints.length > 0) {
           blabs = blabs.concat(weatherComplaints);
        }
        //showBubble(blabs[Math.floor(Math.random() * blabs.length)]);
    }
    setTimeout(logicLoop, 1000);
}
logicLoop();
