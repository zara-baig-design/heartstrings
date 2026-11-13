// Small drawing helpers shared by the network page (app.js) and the installation render (install.js).
import * as THREE from 'three';
import { CONFIG } from './config.js?v=1794564470';

// ---------- symbols ----------

const SYMBOLS = new Map(Object.entries(CONFIG.symbols || {}).map(([k, v]) => [k.toLowerCase(), v]));
export const symbolFile = name => SYMBOLS.get(String(name).toLowerCase()) || null;

// A person's symbol as an image, recolored to `ink`.
const symbolCache = new Map();
export function loadSymbol(file, ink) {
  const key = file + ink;
  if (!symbolCache.has(key)) {
    symbolCache.set(key, fetch(CONFIG.symbolsPath + file).then(r => r.text()).then(svg => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      // SVGs need an explicit size to draw onto a canvas in every browser.
      const sized = svg.replace('#000', ink).replace('<svg ', '<svg width="512" height="512" preserveAspectRatio="xMidYMid meet" ');
      img.src = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
    })));
  }
  return symbolCache.get(key);
}

// ---------- text labels ----------
// Labels are drawn inside the 3D canvas (so they show up in saved images) but stay
// the same size on screen however far away they are.

// Resolves when the web fonts are ready (or after 1.5 s, so being offline never blocks the page).
export const fontsReady = () => Promise.race([
  Promise.all(['400 11px "GT America"', 'italic 300 14px "GT Alpina"', '400 10px "GT America Mono"'].map(f => document.fonts.load(f))),
  new Promise(r => setTimeout(r, 1500)),
]).catch(() => {});

const labels = new Set();
let pxScale = 0;   // sprite scale that equals one screen pixel

export function textSprite(text, { font = '400 10px "GT America Mono", ui-monospace, monospace', color = '#3a2450', background = 'rgba(255,255,255,.8)' } = {}) {
  const K = 3;   // draw at 3× so text stays sharp on phone screens
  const size = parseFloat(font.match(/([\d.]+)px/)[1]);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + (background ? 12 : 0);
  const h = Math.ceil(size * 1.45);
  canvas.width = w * K; canvas.height = h * K;
  ctx.scale(K, K);
  if (background) { ctx.fillStyle = background; ctx.beginPath(); ctx.roundRect(0, 0, w, h, 6); ctx.fill(); }
  ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + size * 0.05);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, sizeAttenuation: false, depthTest: false, transparent: true }));
  sprite.renderOrder = 30;   // on top of everything
  sprite.userData.px = [w, h];
  sprite.scale.set(w * pxScale, h * pxScale, 1);
  labels.add(sprite);
  return sprite;
}

// Call whenever the canvas is resized or the camera's field of view changes.
export function fitLabels(camera, viewportHeight) {
  pxScale = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / viewportHeight;
  for (const s of labels) s.scale.set(s.userData.px[0] * pxScale, s.userData.px[1] * pxScale, 1);
}
