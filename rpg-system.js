// RPG System - Shared Logic Module
// Manages Player State: Level, XP, Coins, Inventory
// Syncs across windows via localStorage + storage events

const RPG = {
    // Config: Level formula & Rewards
    CONFIG: {
        BASE_XP: 100, // XP needed for level 1 -> 2
        XP_MULTIPLIER: 1.5, // Exponential growth factor
        MAX_LEVEL: 50,
        REWARDS: {
            TASK_COMPLETE: { xp: 40, coins: 10 },  // Phương án B: Tăng gấp đôi
            FOLDER_COMPLETE: { xp: 100, coins: 25 }, 
            POMODORO_25:   { xp: 100, coins: 25 }, // Tăng thưởng cày cuốc
            DAILY_BONUS:   { xp: 0,   coins: 50 }, // Quà hàng ngày từ Cú
        }
    },
    state: {
        level: 1,
        currentXP: 0,
        neededXP: 100,
        coins: 10,
        inventory: [],
        lastAward: 0,
        ownedSpecies: ['dog', 'bunny', 'dragon', 'owl', 'cat', 'mascot', 'plant']
    },

    // Kiểm tra sở hữu Pet (Dùng cho Đặc quyền)
    hasPet(species) {
        return this.state.ownedSpecies && this.state.ownedSpecies.includes(species);
    },

    // Lấy cấp độ tiến hóa (Tier) cao nhất của loài Pet đó (Vĩnh viễn nếu đã sở hữu)
    getPetTier(species) {
        let maxLv = 1;
        
        // 1. Kiểm tra Pet đang active
        try {
            const activePet = JSON.parse(localStorage.getItem('rpg_pet'));
            if (activePet && activePet.species === species) maxLv = Math.max(maxLv, activePet.lv || 1);
        } catch(e) {}
        
        // 2. Kiểm tra kho lưu trữ toàn bộ Pet để lấy Level cao nhất
        try {
            const allPets = JSON.parse(localStorage.getItem('rpg_all_pets') || '{}');
            if (allPets[species]) maxLv = Math.max(maxLv, allPets[species].lv || 1);
        } catch(e) {}

        // Kiểm tra xem species có trong danh sách sở hữu không
        const isOwned = (this.state.ownedSpecies && this.state.ownedSpecies.includes(species)) || 
                        (allPets && allPets[species]);

        if (!isOwned) return 0;

        if (maxLv >= 25) return 3; 
        if (maxLv >= 3) return 2;  
        return 1; 
    },

    // Lấy cấp độ cao nhất của loài Pet đó (Dùng cho kích hoạt tính năng UI vĩnh viễn)
    getOwnedPetTier(species) {
        try {
            const activePet = JSON.parse(localStorage.getItem('rpg_pet') || '{}');
            if (activePet.species === species) {
                const lv = activePet.lv || 1;
                if (lv >= 25) return 3;
                if (lv >= 3) return 2;
                return 1;
            }
            const allPets = JSON.parse(localStorage.getItem('rpg_all_pets') || '{}');
            const data = allPets[species];
            if (!data) return 0;
            const lv = data.lv || 1;
            if (lv >= 25) return 3;
            if (lv >= 3) return 2;
            return 1;
        } catch(e) { return 0; }
    },


    // Initialize & Load
    init() {
        // [BẢO VỆ DỮ LIỆU ĐAO KIẾM] - Đã vô hiệu hóa Reset tự động để tránh mất Pet
        /*
        if (!localStorage.getItem('audit_round_final_v1')) {
            localStorage.clear();
            // Xóa sạch dấu vết các loài đã sở hữu
            localStorage.removeItem('rpg_all_pets');
            localStorage.removeItem('rpg_pet');
            localStorage.setItem('audit_round_final_v1', 'true');
            window.location.reload();
            return;
        }
        */

        if (this._initialized) { this.load(); return; }
        this._initialized = true;
        this.load();
        
        // CHẾ ĐỘ ĐẠI GIA: Nếu chạy npm run test thì cho 10 tỷ lẻ
        if (typeof window !== 'undefined') {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.on('pomo-sync', (e, state) => {
                    if (state.isTestMode) {
                        this.state.coins = 9999999999;
                        if (this.onStateChange) this.onStateChange(this.state);
                    }
                });
            } else if (window.widgetMeta && window.widgetMeta.onPomoSync) {
                window.widgetMeta.onPomoSync((state) => {
                    if (state.isTestMode) {
                        this.state.coins = 9999999999;
                        if (this.onStateChange) this.onStateChange(this.state);
                    }
                });
            }
        }

        window.addEventListener('storage', (e) => {
            if (e.key === 'rpg_player_v2') {
                this.load();
                if (this.onStateChange) this.onStateChange(this.state);
            }
        });

        // Bổ trợ đồng bộ chéo bằng IPC Broadcast (Siêu Tốc)
        if (typeof window !== 'undefined') {
            if (window.require) {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.on('rpg-state-sync', (e, newState) => {
                    this.state = newState;
                    if (this.onStateChange) this.onStateChange(this.state);
                    window.dispatchEvent(new CustomEvent('rpg-sync-complete', { detail: newState }));
                });
            } else if (window.widgetMeta && window.widgetMeta.onRPGStateSync) {
                window.widgetMeta.onRPGStateSync((newState) => {
                    this.state = newState;
                    if (this.onStateChange) this.onStateChange(this.state);
                    window.dispatchEvent(new CustomEvent('rpg-sync-complete', { detail: newState }));
                });
            }
        }
    },

    load() {
        try {
            // 1. Ưu tiên lấy từ Main Process (Source of Truth mới)
            if (typeof window !== 'undefined' && window.require) {
                const { ipcRenderer } = window.require('electron');
                ipcRenderer.invoke('get-rpg-state').then(mainState => {
                    if (mainState) {
                        this.state = { ...this.state, ...mainState };
                        localStorage.setItem('rpg_player_v2', JSON.stringify(this.state));
                        if (this.onStateChange) this.onStateChange(this.state);
                    } else {
                        // Nếu Main chưa có (lần đầu chạy), dùng localStorage cũ
                        this._loadFromLocal();
                    }
                }).catch(() => this._loadFromLocal());
            } else {
                this._loadFromLocal();
            }
        } catch (e) { console.error("RPG Load Error:", e); }
    },

    _loadFromLocal() {
        const saved = localStorage.getItem('rpg_player_v2');
        if (saved) {
            this.state = { ...this.state, ...JSON.parse(saved) };
            
            // MIGRATION: Đảm bảo người dùng cũ cũng có đủ các loài mới mở khóa
            const allSpecies = ['dog', 'bunny', 'dragon', 'owl', 'cat', 'mascot', 'plant'];
            let changed = false;
            allSpecies.forEach(s => {
                if (!this.state.ownedSpecies.includes(s)) {
                    this.state.ownedSpecies.push(s);
                    changed = true;
                }
            });
            if (changed) this.save();

        } else {
            this.save(); // Save defaults if new
        }
        // Thử kéo Cloud Save xuống nếu Local trống (Lần đầu mở trên máy mới)
        if (!saved && typeof window !== 'undefined' && window.require) {
            window.require('electron').ipcRenderer.invoke('g-restore-rpg').then(cloudDataJson => {
                if (cloudDataJson) {
                    try {
                        const cloud = JSON.parse(cloudDataJson);
                        if (cloud.rpg) {
                            this.state = cloud.rpg;
                            localStorage.setItem('rpg_player_v2', JSON.stringify(cloud.rpg));
                            if (cloud.pet) localStorage.setItem('rpg_pet', JSON.stringify(cloud.pet));
                            this.save();
                            console.log('Đã nạp thành công Cloud Save về máy mới!');
                            setTimeout(() => window.location.reload(), 1000);
                        }
                    } catch(e) { console.error('Cloud restore parsing error:', e); }
                }
            }).catch(e => console.error('g-restore-rpg API failure:', e));
        }
    },

    save() {
        localStorage.setItem('rpg_player_v2', JSON.stringify(this.state));
        window.dispatchEvent(new CustomEvent('rpg-update', { detail: this.state }));
        if (this.onStateChange) this.onStateChange(this.state);

        // Kíp nổ phát sóng đồng bộ
        if (typeof window !== 'undefined') {
            if (window.require) {
                window.require('electron').ipcRenderer.send('rpg-state-update', this.state);
            } else if (window.widgetMeta && window.widgetMeta.sendRPGUpdate) {
                window.widgetMeta.sendRPGUpdate(this.state);
            }
        }
        this.debouncedCloudSync();
    },

    debouncedCloudSync() {
        if (this._syncTimer) clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => {
            if (typeof window !== 'undefined' && window.require) {
                const { ipcRenderer } = window.require('electron');
                const fullSave = {
                    rpg: this.state,
                    pet: JSON.parse(localStorage.getItem('rpg_pet') || '{}')
                };
                ipcRenderer.invoke('g-backup-rpg', JSON.stringify(fullSave))
                    .then(success => { if(success) console.log('Đã backup RPG Save lên Cloud mây!'); });
            }
        }, 5000); // 5s sau khi không còn sự kiện save nào thì đẩy lên cloud
    },

    // Core Logic: Add XP & Coins
    addReward(sourceType, luckyBonus = 0) { // 'TASK_COMPLETE' | 'POMODORO_25' ...
        const reward = this.CONFIG.REWARDS[sourceType] || { xp: 10, coins: 1 };
        
        // Anti-spam check
        const now = Date.now();
        if (now - this.state.lastAward < 500) return null; 
        this.state.lastAward = now;

        // Apply reward + Lucky Bonus
        let finalCoins = reward.coins + luckyBonus;
        
        // KỸ NĂNG CÚN CƯNG (DOG): Nhặt Xu theo Tier (Vĩnh viễn nếu đã sở hữu)
        const dogTier = this.getOwnedPetTier('dog');
        if (dogTier === 1) finalCoins = Math.floor(finalCoins * 1.1); // Trứng: +10%
        else if (dogTier === 2) finalCoins = Math.floor(finalCoins * 1.15); // Emoji: +15%
        else if (dogTier === 3) finalCoins = Math.floor(finalCoins * 1.2); // Lottie: +20%
 
        // KỸ NĂNG MASCOT (MASCOT): ĐẶC CHỦNG CÀY XU (Hệ số cực cao - Vĩnh viễn nếu đã sở hữu)
        const mascotTier = this.getOwnedPetTier('mascot');
        if (mascotTier === 1) finalCoins = Math.floor(finalCoins * 1.2); // +20%
        else if (mascotTier === 2) finalCoins = Math.floor(finalCoins * 1.5); // +50%
        else if (mascotTier === 3) finalCoins = Math.floor(finalCoins * 2.0); // +100% (Gấp đôi)
        
        // KỸ NĂNG MÈO THẦN (CAT): Nhạc trưởng Đa tài (Vĩnh viễn nếu đã sở hữu)
        const catTier = this.getOwnedPetTier('cat');
        if (catTier === 3) finalCoins = Math.floor(finalCoins * 1.1); // Bậc thầy (Tier 3): +10% Thu nhập

        this.state.currentXP += reward.xp;
        this.state.coins += finalCoins;
        
        // Level Up Check
        let leveledUp = false;
        while (this.state.currentXP >= this.state.neededXP) {
            this.state.currentXP -= this.state.neededXP;
            this.state.level++;
            // Calculate next needed XP: Base * (Multiplier ^ (Level-1))
            this.state.neededXP = Math.floor(this.CONFIG.BASE_XP * Math.pow(this.CONFIG.XP_MULTIPLIER, this.state.level - 1));
            leveledUp = true;
        }

        this.save();
        return { 
            leveledUp, 
            gainedXP: reward.xp, 
            gainedCoins: finalCoins,
            newLevel: this.state.level,
            isLucky: luckyBonus > 0,
            hasDogBuff: this.hasPet('dog')
        };
    },

    // Spending Coins
    buyItem(item) { // {id, price, name}
        if (this.state.coins >= item.price) {
            this.state.coins -= item.price;
            this.state.inventory.push(item);
            this.save();
            return true;
        }
        return false;
    },

    // Utility: Get progress percentage for UI bars
    getProgress() {
        return Math.min(100, (this.state.currentXP / this.state.neededXP) * 100);
    }
};

// Auto-init if included in browser
if (typeof window !== 'undefined') {
    RPG.init();
    // Expose globally for ease of use in other scripts
    window.RPG = RPG;
}

// Export for module systems (if needed later)
if (typeof module !== 'undefined') module.exports = RPG;
