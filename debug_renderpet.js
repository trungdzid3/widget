const fs = require('fs');
let code = fs.readFileSync('WeatherWidget/pet.js', 'utf8');

const regex = /function renderPet\(\) \{([\s\S]*?)\nfunction applyTheme/m;
const match = code.match(regex);

if (match) {
    let internal = match[1];
    // Replace the internal with try...catch
    let newInternal = `\n    try {${internal}\n    } catch(e) { require('fs').appendFileSync('error-render.log', e.stack + '\\n'); }\n`;
    code = code.replace(internal, newInternal);
    fs.writeFileSync('WeatherWidget/pet.js', code);
    console.log("Wrapped renderPet with try/catch.");
} else {
    console.log("Could not find renderPet to wrap.");
}
