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
            TASK_COMPLETE: { xp: 25, coins: 5 },  // Note task
            FOLDER_COMPLETE: { xp: 50, coins: 10 }, // HoÃ n thÃ nh táº¥t cáº£ thÆ° má»¥c
            POMODORO_25:   { xp: 50, coins: 15 }, // Plant cycle (short)
            POMODORO_50:   { xp: 120, coins: 40 }, // Plant cycle (long)
        }
    },

    // State Structure (default)
    state: {
        level: 1,
        currentXP: 0,
        neededXP: 100,
        coins: 0,
        inventory: [], // [{id: 'hat_wizard', name: 'Mũ Phù Thủy'}]
        petMood: 100,  // 0-100 (affects interactions)
        lastAward: 0   // Timestamp to prevent spam
    },

    // Initialize & Load
    init() {
        if (this._initialized) { this.load(); return; }
        this._initialized = true;
        this.load();
        window.addEventListener('storage', (e) => {
            if (e.key === 'rpg_player_v2') {
                this.load();
                if (this.onStateChange) this.onStateChange(this.state);
            }
        });

        // Bổ trợ đồng bộ chéo bằng IPC Broadcast (Siêu Tốc)
        if (typeof window !== 'undefined' && window.require) {
            const { ipcRenderer } = window.require('electron');
            ipcRenderer.on('rpg-state-sync', (e, newState) => {
                this.state = newState;
                if (this.onStateChange) this.onStateChange(this.state);
            });
        }
    },

    load() {
        try {
            const saved = localStorage.getItem('rpg_player_v2');
            if (saved) {
                this.state = { ...this.state, ...JSON.parse(saved) };
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
        } catch (e) { console.error("RPG Load Error:", e); }
    },

    save() {
        localStorage.setItem('rpg_player_v2', JSON.stringify(this.state));
        window.dispatchEvent(new CustomEvent('rpg-update', { detail: this.state }));
        if (this.onStateChange) this.onStateChange(this.state);

        // Kíp nổ phát sóng đồng bộ
        if (typeof window !== 'undefined' && window.require) {
            window.require('electron').ipcRenderer.send('rpg-state-update', this.state);
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
    addReward(sourceType) { // 'TASK_COMPLETE' | 'POMODORO_25' ...
        const reward = this.CONFIG.REWARDS[sourceType] || { xp: 10, coins: 1 };
        
        // Anti-spam check (optional, but good for tasks)
        const now = Date.now();
        if (now - this.state.lastAward < 500) return null; 
        this.state.lastAward = now;

        // Apply
        this.state.currentXP += reward.xp;
        this.state.coins += reward.coins;
        
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
            gainedCoins: reward.coins,
            newLevel: this.state.level 
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
