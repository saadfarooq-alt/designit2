const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const colorArg = process.argv[2] || '#3b82f6';
const outDir = path.join(__dirname, '..', 'public', 'swatches');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const size = { w: 240, h: 160 };

function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function svgFor(type, color) {
  const w = size.w, h = size.h;
  if (type === 'solid') return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><rect width='100%' height='100%' fill='${color}' rx='8' ry='8'/></svg>`;

  if (type === 'cotton') {
    return `<?xml version='1.0' encoding='utf-8'?><svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='1'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0.09'/></feComponentTransfer></filter></defs><rect width='100%' height='100%' fill='${color}' rx='8' ry='8'/><rect width='100%' height='100%' rx='8' ry='8' filter='url(#n)' opacity='0.14'/></svg>`;
  }

  if (type === 'linen') {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><pattern id='p' width='12' height='12' patternUnits='userSpaceOnUse'><rect width='1' height='12' fill='rgba(255,255,255,0.07)'/><rect width='12' height='1' fill='rgba(255,255,255,0.07)'/></pattern></defs><rect width='100%' height='100%' fill='${color}' rx='8' ry='8'/><rect width='100%' height='100%' rx='8' ry='8' fill='url(#p)' opacity='0.95'/></svg>`;
  }

  if (type === 'denim') {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><pattern id='d' width='16' height='16' patternUnits='userSpaceOnUse' patternTransform='rotate(26)'><rect width='4' height='16' fill='rgba(255,255,255,0.10)'/></pattern></defs><rect width='100%' height='100%' fill='#1f4fbf' rx='8' ry='8'/><rect width='100%' height='100%' rx='8' ry='8' fill='url(#d)'/></svg>`;
  }

  if (type === 'silk') {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><linearGradient id='g' x1='0' x2='1'><stop offset='0' stop-color='rgba(255,255,255,0.24)'/><stop offset='0.5' stop-color='rgba(255,255,255,0.02)'/><stop offset='1' stop-color='rgba(255,255,255,0.18)'/></linearGradient></defs><rect width='100%' height='100%' fill='${color}' rx='8' ry='8'/><rect width='100%' height='100%' rx='8' ry='8' fill='url(#g)' opacity='0.85' transform='skewX(-18)'/></svg>`;
  }

  if (type === 'velvet') {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><filter id='vn'><feTurbulence baseFrequency='0.6' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/><feComponentTransfer><feFuncA type='table' tableValues='0 0.08'/></feComponentTransfer></filter><linearGradient id='vg' x1='0' x2='0'><stop offset='0' stop-color='rgba(255,255,255,0.06)'/><stop offset='1' stop-color='rgba(255,255,255,0)'/></linearGradient></defs><rect width='100%' height='100%' fill='${color}' rx='8' ry='8'/><rect width='100%' height='100%' rx='8' ry='8' filter='url(#vn)' opacity='0.14'/><rect width='100%' height='100%' rx='8' ry='8' fill='url(#vg)' opacity='0.06'/></svg>`;
  }

  if (type === 'spun') {
    // generate random short lines inside svg
    let lines = '';
    for (let i=0;i<120;i++){
      const x1 = Math.floor(Math.random()* (w-20)) + 10;
      const y1 = Math.floor(Math.random()* (h-20)) + 10;
      const len = Math.floor(Math.random()*10)+4;
      const ang = (Math.random()-0.5)*Math.PI;
      const x2 = Math.round(x1 + Math.cos(ang)*len);
      const y2 = Math.round(y1 + Math.sin(ang)*len);
      lines += `<line x1='${x1}' y1='${y1}' x2='${x2}' y2='${y2}' stroke='rgba(255,255,255,0.09)' stroke-linecap='round' stroke-width='1'/>`;
    }
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><rect width='100%' height='100%' fill='${color}' rx='8' ry='8'/>${lines}</svg>`;
  }

  if (type === 'chiffon') {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><linearGradient id='c' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='rgba(255,255,255,0.16)'/><stop offset='1' stop-color='rgba(255,255,255,0.04)'/></linearGradient></defs><rect width='100%' height='100%' fill='${color}' rx='8' ry='8'/><rect width='100%' height='100%' rx='8' ry='8' fill='url(#c)' opacity='0.6'/></svg>`;
  }

  if (type === 'polyester') {
    return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'><defs><pattern id='p' width='6' height='6' patternUnits='userSpaceOnUse'><rect width='1' height='6' fill='rgba(255,255,255,0.05)'/><rect width='6' height='1' fill='rgba(255,255,255,0.05)'/></pattern></defs><rect width='100%' height='100%' fill='${color}' rx='8' ry='8'/><rect width='100%' height='100%' rx='8' ry='8' fill='url(#p)' opacity='0.95'/></svg>`;
  }

  return `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='${color}'/></svg>`;
}

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  const types = ['solid','cotton','linen','denim','silk','velvet','spun','chiffon','polyester'];
  for (const t of types) {
    const svg = svgFor(t, colorArg);
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0">${svg}</body></html>`;
    await page.setViewport({ width: size.w, height: size.h });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const filename = path.join(outDir, `${t}.png`);
    await page.screenshot({ path: filename, omitBackground: false });
    console.log('Saved', filename);
  }

  await browser.close();
  console.log('All swatches generated in', outDir);
})();
