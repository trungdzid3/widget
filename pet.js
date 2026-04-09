let currentLottieAnim = null;
let currentLottiePath = "";
// ===== CÂY GIA PHẢ CÁC LOÀI TINH LINH =====
const PET_SPECIES = {
    cat: {
        label: 'Mèo Thần',
        themeColor: '#ff9ecd',
        stages: [
            { name: 'Trứng Mèo',      sprite: 's1', anim: 'anim-egg',    reqLv: 1,  skill: null },
            { name: 'Mèo Con',         sprite: 's2', anim: 'anim-bounce', reqLv: 3,  skill: null },
            { name: 'Mèo Tinh Nghịch', sprite: 's3', anim: 'anim-bounce', reqLv: 10, skill: null },
            { name: 'Sư Tử Chúa',      sprite: 's4', anim: 'anim-pulse',  reqLv: 25, skill: null }
        ]
    },
    dragon: {
        label: 'Rồng Thần',
        themeColor: '#98e898',
        stages: [
            { name: 'Trứng Rồng',  sprite: 's1', anim: 'anim-egg',    reqLv: 1,  skill: null },
            { name: 'Thằn Lằn',    sprite: 's2', anim: 'anim-bounce', reqLv: 3,  skill: null },
            { name: 'Rồng Xanh',   sprite: 's3', anim: 'anim-float',  reqLv: 10, skill: null },
            { name: 'Thần Rồng',   sprite: 's4', anim: 'anim-pulse',  reqLv: 25, skill: null }
        ]
    },
    bunny: {
        label: 'Thỏ Trăng',
        themeColor: '#ffe4b5',
        stages: [
            { name: 'Trứng Thỏ',      sprite: 's1', anim: 'anim-egg',    reqLv: 1,  skill: null },
            { name: 'Thỏ Con',          sprite: 's2', anim: 'anim-bounce', reqLv: 3,  skill: null },
            { name: 'Thỏ Ánh Trăng',   sprite: 's3', anim: 'anim-float',  reqLv: 10, skill: null },
            { name: 'Ngọc Thỏ',        sprite: 's4', anim: 'anim-pulse',  reqLv: 25, skill: null }
        ]
    },
    mascot: {
        label: "Mascot",
        themeColor: '#dda0dd',
        stages: [
            { name: 'Trứng Mascot', sprite: 's1', anim: 'anim-egg', reqLv: 1, skill: null },
            { name: 'Mascot Nhỏ', sprite: 's2', anim: 'anim-bounce', reqLv: 3, skill: null },
            { name: 'Mascot Lớn', sprite: 's3', anim: 'anim-float', reqLv: 10, skill: null },
            { name: 'Thần Mascot', sprite: 's4', anim: 'anim-pulse', reqLv: 25, skill: null }
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
let myPet = JSON.parse(localStorage.getItem('rpg_pet')) || { lv: 1, exp: 0, species: null };
// Đã loại bỏ bướm hoàn toàn theo yêu cầu

let petInteractionState = 'idle'; // Tránh lỗi biến TDZ bị gọi sớm
let nextActionTime = Date.now() + 3000;

// ===== DOM =====
const spriteEl    = document.getElementById('pet-sprite');
const nameEl      = document.getElementById('pet-name');
const lvEl        = document.getElementById('pet-lv');
const feedBtn     = document.getElementById('feed-btn');
const shopBtn     = document.getElementById('shop-btn');
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
      // Define stage by level. Since stage max index is stages.length - 1
      let stageIndex = 0;
      if (stages.length > 3 && myPet.lv >= stages[3].reqLv) stageIndex = 3;
      else if (stages.length > 2 && myPet.lv >= stages[2].reqLv) stageIndex = 2;
      else if (stages.length > 1 && myPet.lv >= stages[1].reqLv) stageIndex = 1;
      
      let stage = stages[stageIndex];

      // Apply interaction and animation CSS classes
      let baseCls = 'pet-sprite';
      if (stage && stage.anim) baseCls += ' ' + stage.anim;
      spriteEl.className = baseCls + (petInteractionState !== 'idle' ? ' interact-' + petInteractionState : '');

      // DẠNG 1: TRỨNG (Level < reqLv 1 - Tức level < 3)
      if (myPet.lv < stages[1].reqLv) {
        spriteEl.innerHTML = "<div class='egg-inner' style='display:flex; justify-content:center; align-items:center; width:100%; height:100%; user-select:none;'>🥚</div>";
        if (currentLottieAnim) { currentLottieAnim.destroy(); currentLottieAnim = null; }
        currentLottiePath = "";

        const changeBtn=document.getElementById('change-species-btn');
        if(changeBtn) changeBtn.style.display = myPet.lv === 1 ? 'flex' : 'none';
        return;
    }
      
      const changeBtn=document.getElementById('change-species-btn'); 
      if(changeBtn) changeBtn.style.display = 'none';

      // Function to look up files
      function getRandomFile(exts) {
          const path = require("path");
          const fs = require("fs");
          const extSet = Array.isArray(exts) ? exts : [exts];
          const petDir = path.join(__dirname, "assets", "pets", myPet.species);
          if (!fs.existsSync(petDir)) return null;
          try {
              const files = fs.readdirSync(petDir).filter(f => extSet.some(ext => f.toLowerCase().endsWith(ext)));
              if (files.length === 0) return null;
              return "assets/pets/" + myPet.species + "/" + files[Math.floor(Math.random() * files.length)];
          } catch(e) { return null; }
      }

      // DẠNG 2: STICKER tĩnh (Tiến hoá đầu tiên)
      if (stages.length > 2 && myPet.lv < stages[2].reqLv) {
          if (currentLottieAnim) { currentLottieAnim.destroy(); currentLottieAnim = null; }
          currentLottiePath = "";
          
          spriteEl.innerHTML = "<div class='egg-inner' style='display:flex; justify-content:center; align-items:center; width:100%; height:100%; user-select:none; font-size: 80px;'>🐣</div>";
          return;
      }

      // DẠNG 3: LOTTIE (Tiến hoá cuối)
      // Loại bỏ toàn bộ Animation CSS vì Lottie đã có sẵn chuyển động
      spriteEl.className = 'pet-sprite';
      
      let jsonPath = getRandomFile(".json");
      if (!jsonPath) {
          // Dự phòng lottie (trả về mặt thỏ)
          spriteEl.innerHTML = "<img src='Bunny_Sunny.png' style='width:100%;height:100%;object-fit:contain;pointer-events:none;'>";
          return;
      }

      if (currentLottiePath === jsonPath && currentLottieAnim) return;
      currentLottiePath = jsonPath;
      if (currentLottieAnim) {
          currentLottieAnim.destroy();
          currentLottieAnim = null;
      }
      spriteEl.innerHTML = "";
      
      if (typeof window.lottie === 'undefined') {
          console.warn("Lottie is not defined, falling back to emoji.");
          spriteEl.innerHTML = "<div class='egg-inner' style='display:flex; justify-content:center; align-items:center; width:100%; height:100%; user-select:none; font-size:3.5rem;'>" + 
              (myPet.species==="dragon"?"🐉":myPet.species==="bunny"?"🐇":myPet.species==="cat"?"🐈":"✨") + "</div>";
          return;
      }

      currentLottieAnim = window.lottie.loadAnimation({
          container: spriteEl,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: jsonPath
      });
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

    // Feed Button
    feedBtn.disabled = false;

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

    if (id === 'box') {
        const randXP = Math.floor(Math.random() * 90) + 10;
        myPet.exp += randXP * mult;
        showToast(`🎁 Hộp Bí Ẩn! +${randXP} EXP!`);
    } else if (id === 'test_levelup') {
        const req = getPetExpReq(myPet.lv) - myPet.exp;
        myPet.exp += req;
        showToast(`🌟 BÙM! Thú cưng vừa tiến hoá!`);
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


// ===== BUFFS & FX =====
function setBuff(type, value, durationSec) {
    try {
        const buffs = JSON.parse(localStorage.getItem('rpg_buffs') || '{}');
        buffs[type] = { value, expires: Date.now() + durationSec * 1000 };
        localStorage.setItem('rpg_buffs', JSON.stringify(buffs));
    } catch(e) { }
}

// Global Modal Closers to prevent capture errors
window.closeModals = function() {
    const sm = document.getElementById('shop-modal');
    if (sm) sm.style.display = 'none';
    const im = document.getElementById('inventory-modal');
    if (im) im.style.display = 'none';
};

// Wait for DOM to load bindings for modal close buttons avoiding inline onclick issues
document.addEventListener('DOMContentLoaded', () => {
    const closeShopBtn = document.getElementById('close-shop-btn');
    if (closeShopBtn) {
        closeShopBtn.addEventListener('click', () => {
            document.getElementById('shop-modal').style.display = 'none';
        });
    }
    const closeInvBtn = document.getElementById('close-inv-btn');
    if (closeInvBtn) {
        closeInvBtn.addEventListener('click', () => {
            document.getElementById('inventory-modal').style.display = 'none';
        });
    }
});
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
        let blabs = ['Giao diện xịn quá!', 'Thời tiết hôm nay thế nào?', 'Bạn làm việc vui nhé!', 'Mình đi dạo xíu', 'Zzz...'];
        if (weatherComplaints && weatherComplaints.length > 0) {
           blabs = blabs.concat(weatherComplaints);
        }
        //showBubble(blabs[Math.floor(Math.random() * blabs.length)]);
    }
    setTimeout(logicLoop, 1000);
}
logicLoop();
