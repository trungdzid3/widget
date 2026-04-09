const fs = require('fs');

let code = fs.readFileSync('WeatherWidget/pet.js', 'utf8');

const goodUseItem = `
window.useItem = (id, expVal, name) => {
    const idx = RPG.state.inventory.findIndex(i => i.id === id);
    if (idx === -1) return;

    // Remove item from inventory
    RPG.state.inventory.splice(idx, 1);
    RPG.save();

    // Calculate EXP Logic
    const mult = getActiveBuff('exp_x3') ? 3 : (getActiveBuff('exp_x2') ? 2 : 1);
    const fallbackExp = id === 'apple' ? 50 : (id === 'meat' ? 120 : (id === 'cookie' ? 15 : 0));
    const actualExp = Number(expVal) || fallbackExp;
    const finalExpAdded = actualExp * mult;

    // Add EXP & Show UI FX
    addPetExp(finalExpAdded);
    showToast(\`Đã cho ăn \${name}! +\${finalExpAdded} EXP\`);

    petInteractionState = 'happy';
    updateSpriteClass();
    setTimeout(() => { petInteractionState = 'idle'; updateSpriteClass(); }, 1000);
    window.openInventory();
};
`;

code += `\n${goodUseItem}\n`;

fs.writeFileSync('WeatherWidget/pet.js', code);
console.log('Added good useItem back.');
