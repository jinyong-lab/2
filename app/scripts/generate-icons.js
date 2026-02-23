// Simple script to generate SVG icons for PWA
const fs = require('fs');
const path = require('path');

const iconsDir = path.join(__dirname, '..', 'public', 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

// Create a simple SVG that can serve as icon
const createSvgIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#6366f1"/>
  <text x="50%" y="55%" text-anchor="middle" dominant-baseline="middle" fill="white" font-size="${size * 0.5}" font-weight="bold" font-family="Arial">임</text>
</svg>`;

fs.writeFileSync(path.join(iconsDir, 'icon-192.svg'), createSvgIcon(192));
fs.writeFileSync(path.join(iconsDir, 'icon-512.svg'), createSvgIcon(512));
console.log('Icons created successfully!');
