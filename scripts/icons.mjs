import sharp from 'sharp';

const logo = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="119" fill="#485347"/>
<path d="M155 263 275 167 361 225M155 263l139 89 67-127M275 167l19 185" stroke="#c6a986" stroke-width="7" stroke-linecap="round" fill="none"/>
<path d="m155 263 206-38" stroke="#91a087" stroke-width="6" stroke-linecap="round"/>
<circle cx="155" cy="263" r="23" fill="#eed3ad"/><circle cx="275" cy="167" r="18" fill="#eed3ad"/><circle cx="361" cy="225" r="17" fill="#eed3ad"/><circle cx="294" cy="352" r="22" fill="#eed3ad"/></svg>`);
for (const size of [192, 512]) await sharp(logo).resize(size, size).png().toFile('public/icon-' + size + '.png');
