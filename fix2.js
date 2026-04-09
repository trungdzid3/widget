const fs = require('fs');

// 1. FIX pet.css
let css = fs.readFileSync('pet.css', 'utf8');

// pet-level fix
css = css.replace('.pet-level { font-size: 16px;', '.pet-level { font-size: 24px;');

// coin placement fix
css = css.replace('margin-right: auto; margin-left: 10px;', 'margin-right: 15px; margin-left: auto;');

// exp-bar-track height increase and label shadow fixes
css = css.replace('height: 16px !important;', 'height: 24px !important;');
css = css.replace(/height: 14px; background: #fff/g, 'height: 24px; background: #fff');
css = css.replace('.exp-bar-label { font-size: 18px;', '.exp-bar-label { font-size: 20px;');

// Remove old #change-species-btn block from bottom 
css += \\n
/* Material Expressive 3 Back Button */
#change-species-btn {
    position: absolute !important;
    top: 55px !important;
    left: 16px !important;
    width: 48px !important;
    height: 48px !important;
    border-radius: 24px !important;
    background: #c8e6c9 !important;
    border: none !important;
    color: #1b5e20 !important;
    font-size: 24px !important;
    cursor: pointer !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-shadow: 0px 4px 8px rgba(0, 0, 0, 0.15) !important;
    transition: all 0.2s cubic-bezier(0.2, 0, 0, 1) !important;
    z-index: 1000 !important;
}
#change-species-btn:hover {
    background: #a5d6a7 !important;
    box-shadow: 0px 6px 12px rgba(0, 0, 0, 0.2) !important;
    transform: translateY(-2px) !important;
}
#change-species-btn:active {
    box-shadow: 0px 2px 4px rgba(0, 0, 0, 0.1) !important;
    transform: scale(0.95) !important;
}
#change-species-btn svg {
    fill: currentColor;
    width: 28px;
    height: 28px;
}
\;

fs.writeFileSync('pet.css', css);

// 2. FIX pet.html
let html = fs.readFileSync('pet.html', 'utf8');

// The line is: <button id="change-species-btn" style="...">...</button>
html = html.replace(/<button id="change-species-btn"([^>]*)>(.*?)<\/button>/is, '<button id="change-species-btn" title="Ch?n l?i thú cung" style="display:none;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24"><path d="m313-440 224 224-57 56-320-320 320-320 57 56-224 224h487v80H313Z"/></svg></button>');

// Also need to push the LV and EXp bar texts up
html = html.replace(/font-size: 17px;/, 'font-size: 20px;');

fs.writeFileSync('pet.html', html);

console.log('ALL FIXES APPLIED SUCCESSFULLY!');

