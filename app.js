// The interactive 3D social network (index.html).
// data.js reads the spreadsheet, this file draws it, panel.js is the pop-up card.
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { CONFIG } from './config.js?v=1794564470';
import { loadGraph, stringColor, esc, MODES, STATUSES, SPREAD, STATUS_FADE } from './data.js?v=1794564470';
import { LOOK, applyPageColors } from './look.js?v=1794564470';
import { initTuner } from './tune.js?v=1794564470';
import { symbolFile, loadSymbol, fontsReady, textSprite, fitLabels } from './lib.js?v=1794564470';
import { initPanel, showPerson, showFriendLink, showMe, hidePanel } from './panel.js?v=1794564470';
import { initDeck } from './deck.js?v=1794564470';
import { initFront, showFront } from './front.js?v=1794564470';

const state = {
  mode: 'closeness',
  room: false,           // true = everyone where they hang in the real installation
  era: 'now',            // 'then' = everyone where they sat at our closest (closeness layout only)
  step: 0,               // position on the time bar; the last step shows everyone
  hiddenGroups: new Set(),
  hiddenStatuses: new Set(),
  focus: null,           // the person or string being explored (null = the whole web)
};
let data = { nodes: [], links: [] };
let steps = ['now'];     // the time bar: every year someone was met, then 'now'
let lit = null;          // while exploring: { nodes, links } that stay bright
let eraMix = 0;          // 0 = now, 1 = then (animated in between)

// ---------- scene ----------

const el = document.getElementById('graph');
const touch = matchMedia('(pointer: coarse)').matches;
const phone = () => innerWidth <= 700;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.5 : 2));   // phones: sharp enough, and much lighter to draw
el.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 1, 8000);
const controls = new OrbitControls(camera, renderer.domElement);   // drag to orbit, scroll / pinch to zoom
controls.enableDamping = true;
controls.minDistance = 40;
controls.maxDistance = 3000;

let dirty = true;   // only redraw when something changed
controls.addEventListener('change', () => { dirty = true; });

// Start far enough back to see the whole room (further on tall phone screens), standing a little to
// one side and just above, like a visitor looking in.
const HOME = new THREE.Vector3(0, 30, 0);
const ROOM_DIR = new THREE.Vector3(0.25, 0.12, 1).normalize();
const back = Math.min(1.15, Math.max(1, 1.25 * el.clientHeight / el.clientWidth));   // on phones, close enough that people fill the width
controls.target.copy(HOME);
camera.position.copy(HOME).addScaledVector(ROOM_DIR, 820 * SPREAD * back);
const HOME_DISTANCE = camera.position.distanceTo(HOME);

// While the info card is open, the picture slides over so what you're exploring isn't hidden behind it.
const offset = { x: 0, y: 0 };
function applyOffset() {
  const w = el.clientWidth, h = el.clientHeight;
  camera.setViewOffset(w, h, offset.x, offset.y, w, h);
  camera.updateProjectionMatrix();
  dirty = true;
}
function stepOffset(dt) {
  const open = document.body.classList.contains('panel-open');
  const gx = open && !phone() ? Math.min(173, el.clientWidth * 0.25) : 0;
  const gy = open && phone() ? el.clientHeight * 0.22 : 0;
  if (offset.x === gx && offset.y === gy) return;
  const k = Math.min(1, dt / 140);
  offset.x += (gx - offset.x) * k;
  offset.y += (gy - offset.y) * k;
  if (Math.abs(gx - offset.x) < 0.5 && Math.abs(gy - offset.y) < 0.5) { offset.x = gx; offset.y = gy; }
  applyOffset();
}

function resize() {
  renderer.setSize(el.clientWidth, el.clientHeight);
  camera.aspect = el.clientWidth / el.clientHeight;
  applyOffset();
  fitLabels(camera, el.clientHeight);
  renderer.render(scene, camera);
}
new ResizeObserver(resize).observe(el);

// ---------- the backdrop: the page's soft color blobs, painted behind the 3D web ----------

function makeBackdrop() {
  const W = 1024, H = 640, canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = LOOK.paper;
  ctx.fillRect(0, 0, W, H);
  [[0.12, 0.14, 0.62], [0.92, 0.24, 0.62], [0.72, 0.96, 0.6], [0.22, 0.86, 0.52]].forEach(([x, y, r], i) => {
    const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * W);
    g.addColorStop(0, LOOK.blobs[i]);
    g.addColorStop(1, LOOK.blobs[i] + '00');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  });
  scene.background?.dispose?.();
  scene.background = new THREE.CanvasTexture(canvas);
  scene.background.colorSpace = THREE.SRGBColorSpace;
}

// ---------- people: glass orbs with their symbol floating inside ----------

const orbGeometry = new THREE.SphereGeometry(1, touch ? 32 : 48, touch ? 20 : 32);

// Frosted glass: a milky shell that's clearer in the middle and brighter at the edge, with one soft
// highlight that stays put on screen (no reflections sweeping around while the web turns).
const sunView = { value: new THREE.Vector3() }, sunColor = { value: new THREE.Color('#ffcf7a') };   // shared by every orb
function makeOrbMaterial(isMe) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTint: { value: new THREE.Color('#ffffff') }, uFrost: { value: 0.3 }, uOpacity: { value: 1 }, uIri: { value: isMe ? 1 : 0 }, uLight: { value: 0 }, uSun: sunView, uSunColor: sunColor },
    vertexShader: /* glsl */ `
      varying vec3 vN, vV, vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      uniform float uFrost, uOpacity, uIri, uLight;
      uniform vec3 uSun, uSunColor;
      varying vec3 vN, vV, vP;
      void main() {
        vec3 n = normalize(vN);
        float facing = abs(dot(n, normalize(vV)));
        float edge = 1.0 - facing;                                 // 0 in the middle, 1 at the rim
        if (uLight > 0.5) {                                        // clear glass on a white page: it shows by its edges, not by glowing
          float spot = pow(max(dot(n, normalize(vec3(-0.45, 0.6, 0.65))), 0.0), 80.0);
          if (uIri > 0.5) {                                        // you: a solid gold sphere
            float lit = 0.62 + 0.45 * max(dot(n, normalize(vec3(-0.3, 0.6, 0.7))), 0.0);
            vec3 g = uSunColor * lit * (1.0 - 0.25 * pow(edge, 2.0)) + spot * 0.8;
            gl_FragColor = vec4(g, (0.5 + 0.5 * pow(edge, 1.4) + spot * 0.5) * uOpacity);   // gold glass: your symbol shows through
          } else {
            float band = smoothstep(0.7, 0.86, edge) * (1.0 - smoothstep(0.86, 0.98, edge));   // the dark refraction ring thick glass has
            vec3 c = mix(vec3(0.985, 0.985, 0.99), vec3(0.55, 0.54, 0.6), pow(edge, 2.0));
            c *= 1.0 - 0.3 * band;
            float caustic = pow(max(dot(n, normalize(vec3(0.3, -0.65, 0.7))), 0.0), 6.0);   // light gathering low inside the glass
            c += caustic * 0.08;
            float a = 0.04 + uFrost * 0.2 + pow(edge, 2.2) * 0.7 + band * 0.3;
            c = mix(c, vec3(1.0), spot);
            gl_FragColor = vec4(c, clamp(a + spot * 0.85, 0.0, 1.0) * uOpacity);
          }
          #include <colorspace_fragment>
          return;
        }
        float rim = pow(edge, 3.0);
        vec3 c = mix(vec3(1.0), uTint, 0.55 + 0.4 * pow(edge, 1.2));   // colored glass, strongest at the rim
        if (uIri > 0.5) c = mix(c, 0.5 + 0.5 * cos(6.283 * (edge * 0.9 + vec3(0.0, 0.33, 0.67))), 0.45 * rim);   // a soap-bubble shimmer for you
        float band = smoothstep(0.72, 0.86, edge) * (1.0 - smoothstep(0.86, 0.97, edge));   // the dark refraction edge thick glass has
        c *= 1.0 - 0.28 * band;
        float a = 0.04 + uFrost * 0.5 + rim * 0.85 + band * 0.2;  // frost = how milky the middle is; the rim is bright and solid
        float spot = pow(max(dot(n, normalize(vec3(-0.45, 0.6, 0.65))), 0.0), 90.0);    // crisp fixed highlight
        float sheen = pow(max(dot(n, normalize(vec3(-0.3, 0.5, 0.8))), 0.0), 8.0) * 0.12; // broad soft one around it
        float glow = pow(max(dot(n, normalize(vec3(0.25, -0.75, 0.6))), 0.0), 5.0) * 0.35; // light gathering at the bottom
        c += spot * 0.9 + sheen + glow * uTint;
        if (uIri > 0.5) {                                          // the sun: warm, glowing from inside
          c = mix(c, uSunColor, 0.55) + uSunColor * 0.35 * (1.0 - edge);
          a += 0.35;
        } else {                                                   // planets: lit on the side facing the sun
          float lit = dot(n, normalize(uSun - vP));
          c *= 0.72 + 0.4 * max(lit, 0.0);
          c += uSunColor * pow(max(lit, 0.0), 3.0) * rim * 0.6;
        }
        a = clamp(a + spot * 0.7 + sheen + glow * 0.4, 0.0, 1.0) * uOpacity;
        gl_FragColor = vec4(c, a);
        #include <colorspace_fragment>
      }`,
  });
}
const symbolGeometry = new THREE.PlaneGeometry(1, 1);
const ME_INK = '#3a2450';

function symbolTexture(file, ink) {
  const S = 256, canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (file) loadSymbol(file, ink).then(img => { canvas.getContext('2d').drawImage(img, 0, 0, S, S); tex.needsUpdate = true; dirty = true; }).catch(() => {});
  return tex;
}

// Orb tint and symbol follow the palette, so they're redone whenever the colors change.
function makeCoinMaps(n) {
  const file = symbolFile(n.name);
  if (!n.symbol.material.map?.userData.shared) n.symbol.material.map?.dispose();
  n.symbol.material.map = LOOK.etch.toLowerCase() !== '#ffffff' ? etchTexture(file, etchColor(n), n.isMe && LOOK.etch.toLowerCase() !== '#ffffff') : symbolTexture(file, n.isMe ? ME_INK : LOOK.ink);   // white page: the same frosted etch as the discs
  n.symbol.material.needsUpdate = true;
  n.symbol.visible = !!file;
  n.tint = new THREE.Color(n.isMe ? LOOK.sun : LOOK[n.group] ?? LOOK.other);
  if (n.disc) {
    const { etch } = n.disc.userData;
    if (!etch.material.map?.userData.shared) etch.material.map?.dispose();
    etch.material.map = etchTexture(file, etchColor(n), n.isMe && LOOK.etch.toLowerCase() !== '#ffffff');   // etched: bright white with a soft shadow and glow
    etch.visible = !!file;
    paintDisc(n);
  }
}

// ---------- the acrylic disc: modeled like the real laser-cut nodes ----------
// A clear disc with real thickness: two ring-shaped slots cut through it, split into quarters by
// crossbars, the outer edge of each slot notched like the laser kerf. The person's symbol is etched
// frosted-white on the face. Every person's glass is a slightly different hue of their group color.

function discShape() {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 1, 0, Math.PI * 2, false);
  const at = (a, r) => new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
  for (const [ro, ri] of [[0.9, 0.79], [0.69, 0.58]]) {
    for (let q = 0; q < 4; q++) {
      const bridge = 0.075 / ro;                       // half-angle of each crossbar
      const a0 = q * Math.PI / 2 + bridge, a1 = (q + 1) * Math.PI / 2 - bridge;
      const pts = [], N = 26, tooth = 0.022;
      let prev = ro;
      for (let i = 0; i <= N; i++) {                   // square notches along the slot's outer edge
        const a = a0 + (a1 - a0) * i / N, r = i % 2 ? ro - tooth : ro;
        pts.push(at(a, prev), at(a, r));
        prev = r;
      }
      for (let i = N; i >= 0; i--) pts.push(at(a0 + (a1 - a0) * i / N, ri));
      shape.holes.push(new THREE.Path(pts));
    }
  }
  return shape;
}
const DISC_DEPTH = 0.1;
const discGeometry = new THREE.ExtrudeGeometry(discShape(), {
  depth: DISC_DEPTH, curveSegments: touch ? 40 : 72, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1,
});
discGeometry.translate(0, 0, -DISC_DEPTH / 2);
const discEdges = new THREE.EdgesGeometry(discGeometry, 25);
const etchGeometry = new THREE.PlaneGeometry(1.42, 1.42);   // the symbol fills the inner circle of the disc

// Light for the acrylic: soft overall light plus a key light that travels with the camera, so the
// highlights stay calm instead of sweeping around.
scene.add(new THREE.HemisphereLight('#ffffff', '#3b3a80', 1.1));
const discKey = new THREE.DirectionalLight('#ffffff', 1.5);
discKey.position.set(2, 3, 4);
camera.add(discKey);
scene.add(camera);

// The etched symbol, drawn to stand out on tinted glass: a soft dark shadow underneath for depth,
// a faint white glow around it, then the symbol itself in solid white.
// On a white page each symbol takes its group's color, the same as that person's string to you.
function etchColor(n) {
  return n.isMe || LOOK.etch.toLowerCase() === '#ffffff' ? LOOK.etch : LOOK[n.group] ?? LOOK.other;
}
// Zara's symbol on her gold medallion: holographic foil, like the title on the front page, with a
// bright streak of light across it and a warm shadow so it sits up off the gold.
const FOIL = ['#c8308a', '#8a4fe6', '#3a6fe0', '#6a4fe0', '#d4409a', '#7b4fe0'];   // pinks, violets and blues: they sing against gold
function foilEtch(c, img, pad, box, tex) {
  const S = c.canvas.width, f = document.createElement('canvas');
  f.width = f.height = S;
  const fc = f.getContext('2d');
  fc.drawImage(img, pad, pad, box, box);
  fc.globalCompositeOperation = 'source-in';
  const g = fc.createLinearGradient(S * 0.1, 0, S * 0.9, S);
  FOIL.forEach((col, i) => g.addColorStop(i / (FOIL.length - 1), col));
  fc.fillStyle = g;
  fc.fillRect(0, 0, S, S);
  fc.globalCompositeOperation = 'source-atop';
  const shine = fc.createLinearGradient(0, S * 0.15, S, S * 0.85);
  shine.addColorStop(0.3, 'rgba(255,255,255,0)');
  shine.addColorStop(0.46, 'rgba(255,255,255,.45)');
  shine.addColorStop(0.54, 'rgba(255,255,255,.12)');
  shine.addColorStop(0.7, 'rgba(255,255,255,0)');
  fc.fillStyle = shine;
  fc.fillRect(0, 0, S, S);
  c.shadowColor = 'rgba(90, 50, 0, .7)'; c.shadowBlur = S * 0.006; c.shadowOffsetY = S * 0.006;   // a crisp edge, pressed into the gold
  c.drawImage(f, 0, 0);
  c.shadowColor = 'rgba(120, 72, 0, .35)'; c.shadowBlur = S * 0.03; c.shadowOffsetY = S * 0.012;   // and a soft lift off it
  c.drawImage(f, 0, 0);
  c.shadowColor = 'transparent';
  tex.needsUpdate = true;
  dirty = true;
}

// Each symbol is drawn once per color and shared, since the frosting is slow to make (on phones especially).
const etchCache = new Map();
function etchTexture(file, color = LOOK.etch, foil = false) {
  const key = `${file}|${color}|${foil}|${LOOK.etch}`;
  if (etchCache.has(key)) return etchCache.get(key);
  const S = LOOK.etch.toLowerCase() === '#ffffff' ? 320 : touch ? 256 : 512, canvas = document.createElement('canvas');   // more pixels for the frosted grain (fewer on phones)
  canvas.width = canvas.height = S;
  const tex = new THREE.CanvasTexture(canvas);
  tex.userData.shared = true;
  etchCache.set(key, tex);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const white = LOOK.etch.toLowerCase() === '#ffffff';
  if (file) loadSymbol(file, color).then(img => {
    const c = canvas.getContext('2d'), pad = S * 0.12, box = S - pad * 2;
    if (foil) return foilEtch(c, img, pad, box, tex);
    if (white) {   // on tinted glass: a dark shadow and a white glow so the symbol pops
      c.shadowColor = 'rgba(20, 10, 60, .55)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
      c.drawImage(img, pad, pad, box, box);
      c.shadowColor = 'rgba(255, 255, 255, .7)'; c.shadowBlur = 16; c.shadowOffsetY = 0;
      c.drawImage(img, pad, pad, box, box);
    } else {       // on clear glass: a frosted etch with the faintest shadow
      c.shadowColor = 'rgba(30, 25, 45, .18)'; c.shadowBlur = 5; c.shadowOffsetY = 2;
      c.drawImage(img, pad, pad, box, box);
    }
    c.shadowColor = 'transparent';
    c.drawImage(img, pad, pad, box, box);
    if (!white) frost(c);
    tex.needsUpdate = true;
    dirty = true;
  }).catch(() => {});
  return tex;
}

// Laser-etched acrylic: the whole symbol frosted evenly, a soft grain all over and a touch see-through.
function frost(c) {
  const S = c.canvas.width;
  const im = c.getImageData(0, 0, S, S), d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;                  // only the symbol itself, not its shadow
    const r = Math.random();
    const f = 0.24 + 0.2 * r;                      // lift toward white: frosted, with grain
    d[i] += (255 - d[i]) * f; d[i + 1] += (255 - d[i + 1]) * f; d[i + 2] += (255 - d[i + 2]) * f;
    d[i + 3] = 235 - 30 * r;
  }
  c.putImageData(im, 0, 0);
}

function makeDisc(n) {
  const glass = new THREE.MeshPhysicalMaterial({
    transparent: true, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1.4, sheen: 0.4,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const edges = new THREE.LineSegments(discEdges, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
  const etch = new THREE.Mesh(etchGeometry, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  etch.position.z = DISC_DEPTH / 2 + 0.016;
  etch.renderOrder = 8;   // drawn after its glass, so the glass never washes the symbol out
  if (n.isMe) etch.scale.setScalar(1.18);   // your symbol fills more of your medallion
  n.disc = new THREE.Group().add(new THREE.Mesh(discGeometry, glass), edges, etch);
  n.disc.userData = { glass, edges, etch };
  n.body.add(n.disc);
}

// Each person's glass: their group color, nudged a little around the color wheel (differently for
// everyone), kept soft and pale like tinted acrylic.
const glassHsl = { h: 0, s: 0, l: 0 };
function paintDisc(n) {
  const { glass, edges } = n.disc.userData;
  new THREE.Color(n.isMe ? LOOK.sun : LOOK[n.group] ?? LOOK.other).getHSL(glassHsl);
  const jitter = ((Math.sin((n.angle ?? 0) * 77.7) * 43758.5453) % 1) * LOOK.glassHue * 0.07;
  const deep = new THREE.Color().setHSL((glassHsl.h + jitter + 1) % 1, Math.min(1, glassHsl.s * 0.9 + 0.2), 0.36);   // deep tint, so a white symbol stands out
  glass.color.copy(WHITE).lerp(deep, n.isMe ? 1 : LOOK.glassTint);   // glassTint 0 = clear acrylic
  if (n.isMe) glass.color.set('#f6d77c');   // your disc: a light, bright gold
  glass.emissive.copy(glass.color).multiplyScalar(n.isMe ? 0.32 : 0.03);
  if (n.isMe) { glass.metalness = 0.25; glass.roughness = 0.22; }
  if (n.isMe || LOOK.glassTint >= 0.5) edges.material.color.copy(glass.color).lerp(WHITE, 0.45);
  else edges.material.color.set(LOOK.muted).lerp(WHITE, 0.35);   // clear acrylic: every disc the same, with a very light gray outline
}

function makeNode(n) {
  n.size = n.isMe ? 48 : 22;   // orb diameter in model units
  n.grow = 1;                  // 0 = hidden, 1 = shown (animated in between)
  // How frosted the glass is: clear for close friends, cloudier as a friendship fades.
  n.frost = n.isMe ? 0 : ({ close: 0, steady: 0.35, fading: 0.6, faded: 0.9, 'ended badly': 1 })[n.status] ?? 0;
  n.orb = new THREE.Mesh(orbGeometry, makeOrbMaterial(n.isMe));
  n.orb.renderOrder = 2;   // drawn after the symbol, so the symbol shows through the frosted shell
  n.symbol = new THREE.Mesh(symbolGeometry, new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.3, side: THREE.DoubleSide }));
  n.symbol.renderOrder = 1;
  n.body = new THREE.Group().add(n.orb, n.symbol);
  makeDisc(n);
  n.phase0 = (n.angle ?? 0) * 3.1;
  n.obj = new THREE.Group().add(n.body);
  setupOrbit(n);
  orbitPosition(n, n.obj.position);
  makeCoinMaps(n);
  if (n.isMe) makeSun(n);
  if (!symbolFile(n.name)) {   // no symbol yet: show the name under the orb
    n.label = textSprite((n.isMe ? 'me' : n.name).toUpperCase(), { font: '400 8px "GT America Mono", ui-monospace, monospace', color: LOOK.muted, background: null });   // plain small caption, like a star chart
    n.label.center.set(0.5, 1);
    n.obj.add(n.label);
  }
  scene.add(n.obj);
}

// ---------- orbits: you're the sun, everyone else circles you ----------
// Orbit size = the current arrangement (closeness, how often, how far). Speed = how often you talk,
// so daily friends come around fastest. Tilt = how far a friendship has drifted: close friends orbit
// flat in the main plane, faded ones swing off at an angle, and ended-badly ones go round backwards.

const radiusFor = (n, mode, era) => (n.isMe ? 0 : MODES[mode].radius(n, era) * SPREAD);
const TILT = { close: 0.04, steady: 0.14, fading: 0.32, faded: 0.55, 'ended badly': 0.8 };
const orbitEuler = new THREE.Euler(), ov = new THREE.Vector3(), focusTarget = new THREE.Vector3();
const circle = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 129 }, (_, i) => {
  const a = (i / 128) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
}));
let orbitTime = 0;

function setupOrbit(n) {
  n.r = radiusFor(n, state.mode, state.era);
  n.base = new THREE.Vector3();
  n.push = new THREE.Vector3();
  if (n.isMe) return;
  const h = (Math.sin(n.angle * 91.7) * 43758.5453) % 1;   // a fixed random number per person
  n.phase = n.angle;
  n.tiltBase = (TILT[n.status] ?? 0.1) + (h - 0.5) * 0.08;
  n.nodeAngle = Math.abs(h) * Math.PI * 2;
  n.spin = n.status === 'ended badly' ? -1 : 1;
  n.speed = 0.25 + n.talk_frequency * 0.12;
  n.orbitLine = new THREE.Line(circle, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));
  scene.add(n.orbitLine);
}

let mapMix = 0;   // 0 = 3D, 1 = flat map (animated in between)
function tiltOf(n) { return n.tiltBase * LOOK.tiltAmount * (1 - eraMix * 0.85) * (1 - mapMix); }   // then, nobody had drifted yet

function orbitPosition(n, out) {
  if (n.isMe) return out.set(0, 0, 0);
  const r = Math.max(n.r, 1);
  const a = n.phase + n.spin * n.speed * (150 / (r + 40)) * orbitTime * 0.25;   // inner orbits are quicker, like planets
  orbitEuler.set(tiltOf(n), n.nodeAngle, 0, 'YXZ');
  out.set(Math.cos(a) * r, 0, Math.sin(a) * r).applyEuler(orbitEuler);
  // anti-gravity: drifting friendships bob up and away from the plane
  out.y += Math.sin(orbitTime * 0.4 + n.phase * 3) * 18 * n.frost * LOOK.antigravity * (1 - eraMix);
  out.y *= 1 - mapMix;   // the map lays everyone flat
  return out;
}

// Everyone hangs in the room. Closeness, frequency and distance move people across the floor plan
// (how far from Zara = the arrangement's rings); each keeps their own height, and the Room button
// puts everyone exactly where they hang in the real installation.
// Positions come from data/install-plan.json (made by installation-plan/plan_layout.py): x and y on
// the floor plan, h = height above the floor, all in inches, centered on Zara.

const ROOM_SCALE = 6;   // model units per inch
let roomMix = 0, ceiling = null, hangLines = null;
let CEIL_Y = 372;   // the real room: a 120" ceiling, 58" from the floor to Zara
const hashOf = n => ((Math.sin((n.angle ?? 0) * 91.7) * 43758.5453) % 1 + 1) % 1;

function setupRoom(plan) {
  const by = new Map((plan?.nodes ?? []).map(p => [p.name, p]));
  const me = by.get('me') ?? { x: 0, y: 0, h: 58 };
  const at = (x, y, h) => new THREE.Vector3((x - me.x) * ROOM_SCALE, (h - me.h) * ROOM_SCALE, (y - me.y) * ROOM_SCALE);
  const top = plan?.room.ceiling ?? 120;
  CEIL_Y = (top - me.h) * ROOM_SCALE;
  for (const n of data.nodes) {
    const p = by.get(n.isMe ? 'me' : n.name);
    n.roomPos = p ? at(p.x, p.y, p.h) : null;
    n.hangY = n.isMe ? 0 : n.roomPos ? n.roomPos.y : (30 + 55 * hashOf(n) - me.h) * ROOM_SCALE;   // web-only people get a height of their own
    n.hangs = p ? p.hooks.map(([hx, hy]) => new THREE.Vector2((hx - p.x) * ROOM_SCALE, (hy - p.y) * ROOM_SCALE)) : [new THREE.Vector2()];   // where their fishing line meets the ceiling, relative to them
  }
  if (plan) {
    const gx = plan.room.grid_x, gy = plan.room.grid_y, bars = [];   // the ceiling grid everyone hangs from
    for (const x of gx) bars.push(at(x, gy[0], top), at(x, gy.at(-1), top));
    for (const y of gy) bars.push(at(gx[0], y, top), at(gx.at(-1), y, top));
    ceiling = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(bars),
      new THREE.LineBasicMaterial({ color: LOOK.ink, transparent: true, opacity: 0, depthWrite: false }));
    ceiling.visible = false;
    scene.add(ceiling);
  }
  const hooks = data.nodes.reduce((sum, n) => sum + n.hangs.length, 0);
  hangLines = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(hooks * 6), 3)),
    new THREE.LineBasicMaterial({ color: LOOK.muted, transparent: true, opacity: 0.16, depthWrite: false }));   // fishing line: barely there
  hangLines.frustumCulled = false;
  scene.add(hangLines);
}

// Where someone hangs in the current arrangement: out from Zara by the arrangement's radius, at their own height.
function roomSpot(n, out) {
  if (n.isMe) return out.set(0, 0, 0);
  return out.set(Math.cos(n.phase) * n.r, n.hangY ?? 0, Math.sin(n.phase) * n.r);
}

// Friends pull on each other (close pairs hardest); ended-badly ties push apart, across the floor.
const PULL = { 3: 0.14, 2: 0.07, 1: 0.03 };
function placeNodes() {
  for (const n of data.nodes) { roomSpot(n, n.base); n.push.set(0, 0, 0); }
  for (const l of data.links) {
    if (l.kind !== 'friend' || l.a.grow < 1 || l.b.grow < 1) continue;
    ov.subVectors(l.b.base, l.a.base);
    ov.y = 0;
    if (l.status === 'ended badly' || l.status === 'faded') ov.setLength(-(l.status === 'faded' ? 12 : 40) * LOOK.antigravity);
    else ov.multiplyScalar((PULL[l.strength] ?? 0.05) * LOOK.pull);
    l.a.push.add(ov);
    l.b.push.sub(ov);
  }
  for (const n of data.nodes) n.obj.position.copy(n.base).add(n.push.clampLength(0, 80));
  if (roomMix < 0.5) separate();   // in the real layout everyone hangs exactly where they really are
  if (roomMix > 0) for (const n of data.nodes) if (n.roomPos) n.obj.position.lerp(n.roomPos, roomMix);
  for (const n of data.nodes) n.obj.position.y *= 1 - mapMix;   // the map lays everyone flat
  placeHangLines();
}

function placeHangLines() {
  // the arrangement's rings are drawn on the ceiling everyone hangs from; the real room shows its grid of bars instead
  for (const m in rings) rings[m].position.y = CEIL_Y * (1 - mapMix);
  if (ceiling) { ceiling.material.opacity = 0.35 * roomMix * (1 - 0.6 * mapMix); ceiling.visible = roomMix > 0; }
  if (!hangLines) return;
  const pos = hangLines.geometry.attributes.position, top = CEIL_Y * (1 - mapMix);
  let k = 0;
  for (const n of data.nodes) {
    const p = n.obj.position;
    for (const h of n.hangs) {   // fishing line up from each person (collapsed to nothing while they're hidden)
      pos.setXYZ(k++, p.x, p.y, p.z);
      if (n.grow > 0) pos.setXYZ(k++, p.x + h.x, top, p.z + h.y); else pos.setXYZ(k++, p.x, p.y, p.z);
    }
  }
  pos.needsUpdate = true;
}

// Personal space: any two orbs closer than their sizes plus a gap are nudged apart (the sun stays put),
// so nobody sits on top of anybody else.
const sepA = new THREE.Vector3();
function separate() {
  const shown = data.nodes.filter(n => n.grow > 0);
  const gap = LOOK.spacing;
  for (let iter = 0; iter < 4; iter++) {
    for (let i = 0; i < shown.length; i++) {
      for (let j = i + 1; j < shown.length; j++) {
        const a = shown[i], b = shown[j];
        sepA.subVectors(b.obj.position, a.obj.position);
        if (mapMix > 0.5) sepA.y = 0;   // on the flat map, only spread them across the plane
        const d = sepA.length() || 0.01;
        const need = a.body.scale.x + b.body.scale.x + gap;
        if (d >= need) continue;
        sepA.multiplyScalar((need - d) / d);
        if (a.isMe) b.obj.position.add(sepA);
        else if (b.isMe) a.obj.position.sub(sepA);
        else { sepA.multiplyScalar(0.5); a.obj.position.sub(sepA); b.obj.position.add(sepA); }
      }
    }
  }
}

function placeOrbitLines() {
  for (const n of data.nodes) {
    const line = n.orbitLine;
    if (!line) continue;
    line.visible = n.grow > 0 && LOOK.orbitLines > 0;
    line.rotation.set(tiltOf(n), n.nodeAngle, 0, 'YXZ');
    line.scale.setScalar(Math.max(n.r, 1));
    line.material.color.set(LOOK[n.group] ?? LOOK.other);
    line.material.opacity = LOOK.orbitLines * n.grow * (lit && !lit.nodes.has(n) ? 0.25 : 1);
  }
}

// ---------- the sun and the stars ----------

// Zara's star: one of the four stars from her own symbol, used as the motif everywhere
// (where strings touch orbs, the signals, the ring markers, a few stars in the sky).
const ZARA_STAR = [278.94, 142.38, 246.35, 232.27, 243.43, 129.95, 195.86, 102.7, 240.23, 81.27, 233.89, 0, 279.77, 78.02, 356.7, 62.49, 308.15, 118.88, 361.9, 226.19];
function starTexture(glow = 0.5) {
  const S = 96, canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (glow) {
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, `rgba(255,255,255,${0.5 * glow})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }
  const k = (S * 0.62) / 240;   // the star is about 166 × 232 in the symbol's own units
  ctx.translate(S / 2 - 279 * k, S / 2 - 116 * k);
  ctx.beginPath();
  for (let i = 0; i < ZARA_STAR.length; i += 2) ctx[i ? 'lineTo' : 'moveTo'](ZARA_STAR[i] * k, ZARA_STAR[i + 1] * k);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glowTexture(stops) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  stops.forEach(([at, color]) => g.addColorStop(at, color));
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}
let corona, stars;
function makeSun(me) {
  corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture([[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,255,255,.65)'], [0.45, 'rgba(255,255,255,.18)'], [1, 'rgba(255,255,255,0)']]),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  }));
  corona.renderOrder = 0;
  me.body.add(corona);
}
function makeStars() {
  const pts = new Float32Array(1600 * 3);
  for (let i = 0; i < 1600; i++) {
    ov.randomDirection().multiplyScalar(1800 + Math.random() * 1600).toArray(pts, i * 3);
  }
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pts, 3));
  stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 1.1, sizeAttenuation: false, transparent: true, depthWrite: false }));
  const big = new Float32Array(36 * 3);
  for (let i = 0; i < 36; i++) ov.randomDirection().multiplyScalar(1600 + Math.random() * 1400).toArray(big, i * 3);
  stars.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(big, 3)),
    new THREE.PointsMaterial({ color: '#ffffff', size: 9, sizeAttenuation: false, map: starTexture(0.3), transparent: true, depthWrite: false })));
  scene.add(stars);
}
function applySpaceLook() {
  corona.material.color.set(LOOK.sun);
  corona.scale.setScalar(LOOK.sunGlow * 6);
  corona.visible = LOOK.sunGlow > 0 && LOOK.nodeStyle !== 'acrylic' && !lightPage();
  stars.material.opacity = LOOK.stars;
  stars.children[0].material.opacity = LOOK.stars * 0.8;
  stars.visible = LOOK.stars > 0;
  ringMaterial.transparent = true;
  ringMaterial.opacity = LOOK.floorRings;
  ringMaterial.color.set(LOOK.ink);
  tickMaterial.color.set(LOOK.ink);
  tickMaterial.opacity = LOOK.floorRings * 0.6;
  markerMaterial.color.set(LOOK.ink);
  markerMaterial.opacity = Math.min(1, LOOK.floorRings * 2.2);
  for (const l of ringLabels) l.material.opacity = Math.min(1, LOOK.floorRings * 2.5);
  for (const m in rings) rings[m].visible = !state.room && m === state.mode && LOOK.floorRings > 0;
}

// Size, fade and glass of every person, from the current state.
function paintNodes() {
  for (const n of data.nodes) {
    const g = n.grow * (2 - n.grow);   // ease out, so orbs pop in quickly then settle
    const s = n.size / 2 * LOOK.coinSize * (n === state.focus ? 1.3 : 1) * g;
    n.body.scale.setScalar(Math.max(s, 0.001));
    n.obj.visible = n.grow > 0;
    if (n.label) n.label.position.y = -s - 2;
    const away = lit && !lit.nodes.has(n);
    const frost = n.frost * (1 - eraMix);          // then, every orb was clear
    const u = n.orb.material.uniforms;
    u.uTint.value.copy(n.tint).lerp(WHITE, 1 - LOOK.tint);
    u.uFrost.value = Math.min(1, LOOK.glassRoughness + frost * LOOK.frost * 0.5);
    u.uOpacity.value = away ? 0.25 : 1;
    n.symbol.material.opacity = away ? 0.2 : 1 - Math.min(0.6, frost * LOOK.frost * 0.45);
    n.symbol.scale.setScalar(n.isMe ? 1.55 : LOOK.symbolSize);
    const acrylic = LOOK.nodeStyle === 'acrylic' || (LOOK.nodeStyle === 'orb in 3d' && state.view === 'map');   // the laser-cut medallion, or the glass orb
    u.uLight.value = lightPage() ? 1 : 0;
    n.disc.visible = acrylic;
    n.orb.visible = n.symbol.visible = !acrylic;
    if (!acrylic) n.symbol.visible = !!symbolFile(n.name);
    const { glass, edges, etch } = n.disc.userData;
    glass.opacity = away ? 0.08 : (n.isMe ? Math.max(0.75, LOOK.glassOpacity) : LOOK.glassOpacity) * (1 + frost * 0.4);   // your gold disc stays solid
    glass.roughness = 0.12 + frost * LOOK.frost * 0.5;   // faded friendships: frostier glass
    edges.material.opacity = (away ? 0.12 : 0.85 - frost * 0.3) * (n.isMe || LOOK.glassTint >= 0.5 ? 1 : 0.32);   // clear acrylic: barely-there edges, so the symbol carries the disc
    etch.material.opacity = away ? 0.15 : 1 - frost * 0.15;
    if (n.isMe) {   // on the flat map, your disc sits on top of every string that runs into it
      const onTop = state.view === 'map';
      n.disc.children.forEach((c, i) => {
        c.userData.order ??= c.renderOrder;   // remember the normal drawing order once
        c.material.depthTest = !onTop;
        c.renderOrder = onTop ? 40 + i : c.userData.order;
      });
    }
    if (n.label) n.label.material.opacity = away ? 0.16 : 1;
  }
  dirty = true;
}
const WHITE = new THREE.Color('#ffffff');

// Symbols always face you, floating in the middle of their orb.
const FACE_FRONT = new THREE.Quaternion(), FACE_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2 + 0.22);   // tipped a touch so the glass doesn't flash white
const FRONT = new THREE.Vector3(0, 0.15, 1).normalize();   // where to stand to see a medallion face on (a touch above, so the glass doesn't flash white)
const UP_AXIS = new THREE.Vector3(0, 1, 0), twist = new THREE.Quaternion();
function faceSymbols() {
  const t = performance.now() / 1000;
  for (const n of data.nodes) {
    if (!n.obj.visible) continue;
    // every medallion faces the same way, like they hang in the room (on the map they face up),
    // and turns a little back and forth on its fishing line, each at its own pace
    const turn = (Math.sin(t * 0.31 + n.phase0) * 0.2 + Math.sin(t * 0.13 + n.phase0 * 1.7) * 0.12) * (1 - mapMix);
    n.disc.quaternion.slerpQuaternions(FACE_FRONT, FACE_UP, mapMix).premultiply(twist.setFromAxisAngle(UP_AXIS, turn));
    n.symbol.quaternion.copy(n.disc.quaternion);
  }
}

// ---------- strings: ropes that hang, sway and wobble ----------
// Each string is a chain of points pulled down by gravity and held together at a fixed length
// (a "verlet rope"). Both ends are tied to their people, so strings follow them when they move.
// Drawn as short tube pieces by one shader that knows the installation's materials:
//   ribbon            inner circle (and two friends who are close)   flat satin, twisting gently
//   nylon             friends                                        smooth glossy line
//   gray nylon        faded
//   black nylon, cut  ended badly
//   embroidery thread acquaintances                                  twisted strands
// 1 to 6 strands = how often you talk; gray strands take over as a friendship fades.

const SEG = touch ? 10 : 14;          // pieces per string
const MATERIAL = { thread: 0, ribbon: 1, nylon: 2 };
let strings;
const UP = new THREE.Vector3(0, 1, 0);
const va = new THREE.Vector3(), vb = new THREE.Vector3(), mid = new THREE.Vector3(), dir = new THREE.Vector3(), size = new THREE.Vector3();
const quat = new THREE.Quaternion(), spin = new THREE.Quaternion(), matrix = new THREE.Matrix4();
const tmp = new THREE.Color();

// Which material a string is, using the same rule as installation-plan/plan_layout.py.
function materialOf(l) {
  if (l.cut || (l.kind === 'me' ? l.person.status : l.status) === 'faded') return 'nylon';
  if (l.kind === 'me') return l.person.layer_now === 1 ? 'ribbon' : l.person.layer_now >= 5 ? 'thread' : 'nylon';
  return ({ 3: 'ribbon', 2: 'nylon', 1: 'thread' })[l.strength];
}

const stringMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uGray: { value: new THREE.Color() }, uBg: { value: new THREE.Color() },
    uTwist: { value: 1 }, uEdge: { value: 0 }, uSheen: { value: 0 }, uGlow: { value: 0 }, uRound: { value: 0 },
    uOpacity: { value: 1 }, uFade: { value: 0.85 }, uByType: { value: 1 }, uBeam: { value: 0.6 }, uIri: { value: 0 }, uLight: { value: 0 }, uFog: { value: new THREE.Vector2(1, 2) },
  },
  vertexShader: /* glsl */ `
    attribute vec4 aInfo;            // strands, share of gray strands, faded-out (exploring), is a bridge
    attribute vec4 aRope;            // distance along the string where this piece starts, material, position 0-1 along the string
    varying vec2 vUv;
    varying vec3 vColor, vNormal, vView;
    varying vec4 vInfo, vRope;
    varying float vLen, vRad, vFacing, vDepth;
    void main() {
      vUv = uv;
      vColor = instanceColor;
      vInfo = aInfo;
      vRope = aRope;
      vLen = length(instanceMatrix[1].xyz);
      vRad = max(length(instanceMatrix[0].xyz), 0.01);
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
      vView = normalize(-mv.xyz);
      vFacing = abs(dot(vNormal, vView));   // 1 = facing you, 0 = the string's edge
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uGray, uBg;
    uniform float uTwist, uEdge, uSheen, uGlow, uRound, uOpacity, uFade, uByType, uBeam, uIri, uLight;
    uniform vec2 uFog;
    varying vec2 vUv;
    varying vec3 vColor, vNormal, vView;
    varying vec4 vInfo, vRope;
    varying float vLen, vRad, vFacing, vDepth;
    void main() {
      float kind = uByType > 0.5 ? vRope.y : 0.0;
      float along = vRope.x + vUv.y * vLen;                         // distance along the whole string
      vec3 c;
      float a = uOpacity;
      vec3 light = normalize(vec3(0.4, 0.8, 0.5));
      float diffuse = 0.55 + 0.45 * max(dot(vNormal, light), 0.0);
      // The materials match the real ones on the studio table.
      float hash = fract(sin(dot(floor(vec2(vUv.x * 40.0, along * 2.0)), vec2(12.9898, 78.233))) * 43758.5453);
      if (vInfo.w > 0.5) {                                          // clear fishing line across a cut: almost invisible, with a glint
        c = vec3(1.0); a *= 0.25 + 0.6 * pow(vFacing, 12.0);
      } else if (kind > 1.5) {                                      // satin cord (nylon rattail): saturated, glossy, braided
        c = mix(vColor, uGray, vInfo.y) * mix(1.0, diffuse, uRound);
        float braid = abs(sin(vUv.x * 6.283 * 3.0 + along / (vRad * 1.6)));   // the herringbone braid catching light
        c *= 0.82 + 0.18 * braid;
        vec3 h = normalize(light + vView);
        c += (0.3 + uSheen) * (0.5 + 0.5 * braid) * 0.7 * pow(max(dot(vNormal, h), 0.0), 24.0);
        c += (0.15 + uSheen * 0.3) * pow(vFacing, 5.0);             // satin glow down the middle
      } else if (kind > 0.5) {                                      // sheer iridescent organza ribbon with a stitched edge
        float side = abs(sin(vUv.x * 6.283));                       // 1 at the ribbon's two edges
        float stitch = smoothstep(0.965, 0.995, side);
        vec3 irid = 0.55 + 0.45 * cos(6.283 * (vFacing * 0.9 + vRope.z * 0.6 + vec3(0.0, 0.33, 0.67)));   // pink / green / blue shimmer
        vec3 base = mix(vColor, uGray, vInfo.y);
        c = mix(mix(base, vec3(1.0), 0.35), irid, 0.45);
        c *= 0.9 + 0.1 * sin(along * 3.0) * sin(vUv.x * 160.0); // the fine weave of the organza
        c += (0.2 + uSheen) * 0.5 * pow(vFacing, 8.0);
        c = mix(c, base * 0.9, stitch);                             // the colored stitched edge
        a *= mix(0.42, 0.95, stitch);                               // sheer in the middle
      } else {                                                      // embroidery floss: matte, six strands twisted
        float strands = max(vInfo.x, 1.0);
        // twist 1 = one full turn every 6 string-widths, like loose embroidery floss
        float p = vUv.x * strands + along / (vRad * 12.0) * strands * uTwist;
        float strand = mod(floor(p), strands);
        float across = fract(p);
        float colored = step(strand + 0.5, strands * (1.0 - vInfo.y));
        c = mix(uGray, vColor, colored);
        float groove = smoothstep(0.0, 0.22, across) * smoothstep(1.0, 0.78, across);
        c *= mix(1.0, 0.45 + 0.55 * groove, uEdge);                 // dark lines between strands
        c *= mix(1.0, 0.55 + 0.45 * vFacing, uRound);               // rounded thread shading
        c *= 0.9 + 0.1 * hash;                                      // cotton fibers
        c += uSheen * 0.25 * pow(vFacing, 10.0);
      }
      // light through acrylic: a soft rainbow shimmer that drifts along each string and with the angle you see it from
      float pt = fract(vRope.z * 0.7 + vFacing * 0.45) * 3.0;   // rose -> lilac -> sky -> rose, no yellow-green
      vec3 rose = vec3(0.98, 0.72, 0.86), lilac = vec3(0.80, 0.72, 0.99), sky = vec3(0.64, 0.84, 0.99);
      vec3 prism = pt < 1.0 ? mix(rose, lilac, pt) : pt < 2.0 ? mix(lilac, sky, pt - 1.0) : mix(sky, rose, pt - 2.0);
      c = mix(c, mix(c, prism, 0.5), uIri * (1.0 - vInfo.w));
      c = mix(c, c + vColor * 0.6, uGlow * (1.0 - vFacing * 0.6)); // glowing rim
      a *= mix(1.0, smoothstep(0.0, 0.7, vFacing) * 0.7 + 0.3, uGlow);
      c += (vColor * 0.5 + 0.35) * uBeam * pow(vFacing, 3.0);        // a bright core, like light running through it
      c = mix(c, uBg, smoothstep(uFog.x, uFog.y, vDepth) * 0.45 * uLight);   // on a white page, far strings recede into the paper
      c = mix(c, uBg, vInfo.z * uFade);                            // faded out while exploring someone else
      a *= 1.0 - vInfo.z * uFade * 0.6;
      gl_FragColor = vec4(c, a);
      #include <colorspace_fragment>
    }`,
});

// The light around each string: the same tubes drawn again, wider, soft and additive, so strings
// read as beams. Shares the strings' shape, positions and colors.
const haloMaterial = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uBeam: { value: 0.6 }, uWidth: { value: 4 }, uFade: { value: 0.85 } },
  vertexShader: /* glsl */ `
    attribute vec4 aInfo;
    uniform float uWidth;
    varying vec3 vColor;
    varying float vFacing, vAway;
    void main() {
      vColor = instanceColor;
      vAway = aInfo.z;
      vec3 p = vec3(position.x * uWidth, position.y, position.z * uWidth);
      vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal);
      vFacing = abs(dot(n, normalize(-mv.xyz)));
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform float uBeam, uFade;
    varying vec3 vColor;
    varying float vFacing, vAway;
    void main() {
      float a = pow(vFacing, 2.5) * uBeam * 0.55 * (1.0 - vAway * uFade);
      gl_FragColor = vec4((vColor * 0.7 + 0.3) * a, a);
      #include <colorspace_fragment>
    }`,
});
let halo;

function makeStrings() {
  let count = 0;
  for (const l of data.links) {
    l.index = count;
    count += SEG;
    l.strands = l.kind === 'me' ? l.person.talk_frequency + 1 : l.strength;
    l.material = materialOf(l);
    l.seed = Math.random() * 100;
    // the rope: SEG + 1 points, current and previous positions
    l.pts = new Float32Array((SEG + 1) * 3);
    l.prev = new Float32Array((SEG + 1) * 3);
    const a = l.a.obj.position, b = l.b.obj.position;
    for (let i = 0; i <= SEG; i++) {
      va.lerpVectors(a, b, i / SEG).toArray(l.pts, i * 3);
      va.toArray(l.prev, i * 3);
    }
  }
  strings = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), stringMaterial, count);
  strings.geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
  strings.geometry.setAttribute('aRope', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
  strings.frustumCulled = false;
  for (let i = 0; i < count; i++) strings.setColorAt(i, tmp);
  scene.add(strings);
  halo = new THREE.InstancedMesh(strings.geometry, haloMaterial, count);
  halo.instanceMatrix = strings.instanceMatrix;
  halo.instanceColor = strings.instanceColor;
  halo.frustumCulled = false;
  halo.renderOrder = 4;
  scene.add(halo);
}

// String color = its colored strands; gray strands are mixed in by the shader.
const mixA = new THREE.Color(), mixB = new THREE.Color();
function baseColor(l) {
  if (l.cut) return LOOK.ended;
  if (l.kind === 'me') return LOOK[l.person.group] ?? LOOK.other;
  if (!LOOK.friendColors) return LOOK.friend;
  // between two friends: halfway between their two colors, a little lighter than the strings to you
  mixA.set(LOOK[l.a.group] ?? LOOK.other).lerp(mixB.set(LOOK[l.b.group] ?? LOOK.other), 0.5).lerp(WHITE, 0.18);
  return '#' + mixA.getHexString();
}

function paintStrings() {
  const info = strings.geometry.attributes.aInfo;
  for (const l of data.links) {
    // Then, your own strings had no gray strands yet.
    const gray = l.cut ? 0 : (STATUS_FADE[l.kind === 'me' ? l.person.status : l.status] ?? 0) * (l.kind === 'me' ? 1 - eraMix : 1);
    const faded = lit && !lit.links.has(l) ? 1 : 0;
    tmp.set(baseColor(l));
    for (let k = 0; k < SEG; k++) {
      strings.setColorAt(l.index + k, tmp);
      info.setXYZW(l.index + k, l.strands, gray, faded, 0);   // bridges are marked as the rope is placed
    }
  }
  strings.instanceColor.needsUpdate = true;
  info.needsUpdate = true;
  dirty = true;
}

const lightPage = () => new THREE.Color(LOOK.paper).getHSL({}).l > 0.5;   // additive glows vanish on a white page
function applyLineLook() {
  const u = stringMaterial.uniforms;
  u.uGray.value.set(LOOK.faded);
  u.uBg.value.set(LOOK.paper);
  u.uTwist.value = LOOK.twist;
  u.uEdge.value = LOOK.edge;
  u.uSheen.value = LOOK.sheen;
  u.uGlow.value = LOOK.glow;
  u.uRound.value = LOOK.round;
  u.uOpacity.value = LOOK.opacity;
  u.uFade.value = LOOK.focusFade;
  u.uByType.value = LOOK.materials === 'by type' ? 1 : 0;
  u.uBeam.value = LOOK.beam;
  u.uIri.value = LOOK.iridescence ?? 0;
  u.uLight.value = lightPage() ? 1 : 0;
  haloMaterial.uniforms.uBeam.value = LOOK.beam;
  haloMaterial.uniforms.uWidth.value = LOOK.beamWidth;
  haloMaterial.uniforms.uFade.value = LOOK.focusFade;
  halo.visible = LOOK.beam > 0 && !lightPage();
  pulses.material.blending = lightPage() ? THREE.NormalBlending : THREE.AdditiveBlending;
  pulses.material.premultipliedAlpha = lightPage();
  pulses.material.needsUpdate = true;
  stringMaterial.transparent = true;   // organza ribbons are sheer
  stringMaterial.needsUpdate = true;
  dirty = true;
}

// One physics step for every rope.
function stepRopes(dt, seconds) {
  const slack = Math.max(LOOK.slack, 0.012), gravity = Math.max(LOOK.gravity, 1);   // strings hang under their own weight like the real ones
  const g = 900 * gravity * dt * dt;
  const damp = 0.985;
  for (const l of data.links) {
    const P = l.pts, Q = l.prev;
    anchor(l, l.a, l.b, P, 0);
    anchor(l, l.b, l.a, P, SEG * 3);
    const ax = P[0], ay = P[1], az = P[2], bx = P[SEG * 3], by = P[SEG * 3 + 1], bz = P[SEG * 3 + 2];
    if (slack === 0 && gravity === 0) {   // straight beams: no physics needed
      for (let i = 1; i < SEG; i++) {
        const t = i / SEG, k = i * 3;
        Q[k] = P[k] = ax + (bx - ax) * t; Q[k + 1] = P[k + 1] = ay + (by - ay) * t; Q[k + 2] = P[k + 2] = az + (bz - az) * t;
      }
      continue;
    }
    const span = Math.hypot(bx - ax, by - ay, bz - az);   // measured between the anchors, outside the glass
    const rest = span * (1 + slack) / SEG;
    // wind: a slow, gentle push that differs for every string
    const calm = Math.min(1, Math.max(0, (awakeUntil - seconds * 1000) / 2500));   // the breeze dies down before they sleep
    const wx = Math.sin(seconds * 0.7 + l.seed) * LOOK.wind * 30 * calm * dt * dt;
    const wz = Math.cos(seconds * 0.5 + l.seed * 1.7) * LOOK.wind * 30 * calm * dt * dt;
    for (let i = 1; i < SEG; i++) {
      const k = i * 3;
      for (let d = 0; d < 3; d++) {
        const v = (P[k + d] - Q[k + d]) * damp;
        Q[k + d] = P[k + d];
        P[k + d] += v;
      }
      P[k] += wx; P[k + 1] -= g; P[k + 2] += wz;
    }
    P[0] = ax; P[1] = ay; P[2] = az; P[SEG * 3] = bx; P[SEG * 3 + 1] = by; P[SEG * 3 + 2] = bz;
    for (let iter = 0; iter < 6; iter++) {
      for (let i = 0; i < SEG; i++) {
        const k = i * 3, j = k + 3;
        const dx = P[j] - P[k], dy = P[j + 1] - P[k + 1], dz = P[j + 2] - P[k + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (d - rest) / d;
        const wi = i === 0 ? 0 : i + 1 === SEG ? 1 : 0.5, wj = i + 1 === SEG ? 0 : i === 0 ? 1 : 0.5;
        P[k] += dx * diff * wi; P[k + 1] += dy * diff * wi; P[k + 2] += dz * diff * wi;
        P[j] -= dx * diff * wj; P[j + 1] -= dy * diff * wj; P[j + 2] -= dz * diff * wj;
      }
    }
  }
}

// Where a string meets an orb: just outside the glass, on the side facing the other person,
// nudged around the shell a little (differently for every string) so they fan out like electrons.
const toward = new THREE.Vector3(), side = new THREE.Vector3();
function anchor(l, n, other, P, k) {
  const c = n.obj.position;
  toward.subVectors(other.obj.position, c).normalize();
  if (n.disc.visible) {   // a medallion: tied through the outer ring slot, on the edge facing the other person
    side.set(0, 0, 1).applyQuaternion(n.disc.quaternion);   // the medallion's face
    toward.addScaledVector(side, -toward.dot(side));
    if (toward.lengthSq() < 1e-6) toward.set(0, 1, 0).applyQuaternion(n.disc.quaternion);
    toward.normalize().applyAxisAngle(side, Math.sin(l.seed * 7.3) * 0.3 * LOOK.spreadAnchors);   // knots spread around the ring
    const r = n.body.scale.x * 0.85;
    P[k] = c.x + toward.x * r; P[k + 1] = c.y + toward.y * r; P[k + 2] = c.z + toward.z * r;
    return;
  }
  side.set(Math.sin(l.seed * 3.1), Math.cos(l.seed * 1.7), Math.sin(l.seed * 2.3)).cross(toward).normalize();
  toward.addScaledVector(side, 0.45 * LOOK.spreadAnchors).normalize();
  const r = n.body.scale.x * (1 + LOOK.anchorGap);
  P[k] = c.x + toward.x * r; P[k + 1] = c.y + toward.y * r; P[k + 2] = c.z + toward.z * r;
}

// ---------- beads: a small glowing point where each string touches its orb ----------

let beads;
function makeBeads() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.links.length * 6), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(data.links.length * 6), 3));
  beads = new THREE.Points(geo, new THREE.PointsMaterial({ size: 4, vertexColors: true, map: starTexture(0.6), transparent: true, depthWrite: false }));
  beads.frustumCulled = false;
  beads.renderOrder = 3;
  scene.add(beads);
}
function placeBeads() {
  const pos = beads.geometry.attributes.position, col = beads.geometry.attributes.color;
  data.links.forEach((l, i) => {
    const on = Math.min(l.a.grow, l.b.grow) > 0.5 && !(lit && !lit.links.has(l));
    for (const [j, k] of [[i * 2, 0], [i * 2 + 1, SEG * 3]]) {
      if (on) pos.setXYZ(j, l.pts[k], l.pts[k + 1], l.pts[k + 2]); else pos.setXYZ(j, 0, -1e5, 0);   // hidden ones go far away
      tmp.set(baseColor(l)).lerp(WHITE, 0.55);
      col.setXYZ(j, tmp.r, tmp.g, tmp.b);
    }
  });
  pos.needsUpdate = true;
  col.needsUpdate = true;
  beads.material.size = LOOK.beadSize;
  beads.visible = LOOK.beadSize > 0;
}

// ---------- ropes rest when nothing is moving, and wake when something does ----------

let awakeUntil = 0;
function wakeRopes(ms = 4000) { awakeUntil = Math.max(awakeUntil, performance.now() + ms); }

// Shake someone's strings, like plucking them.
function pluck(node, strength = 1) {
  wakeRopes();
  for (const l of data.links) {
    if (l.a !== node && l.b !== node) continue;
    for (let i = 1; i < SEG; i++) {
      const s = Math.sin(Math.PI * i / SEG) * 4 * strength;
      l.prev[i * 3] += (Math.random() - 0.5) * s;
      l.prev[i * 3 + 1] += (Math.random() - 0.5) * s + s * 0.5;
      l.prev[i * 3 + 2] += (Math.random() - 0.5) * s;
    }
  }
}

function placeStrings() {
  const info = strings.geometry.attributes.aInfo, rope = strings.geometry.attributes.aRope;
  for (const l of data.links) {
    let r = l.width / 2 * LOOK.thickness * Math.min(l.a.grow, l.b.grow);   // 0 = hidden
    if (lit?.links.has(l)) r *= 1.6;                     // the strings you're following stand out
    else if (l.kind === 'friend') r *= LOOK.friendLines ?? 1;   // friend-to-friend strings can wait until you pick someone
    const ribbon = l.material === 'ribbon' && LOOK.materials === 'by type';
    // Then, your own cut strings weren't cut yet: the gap closes as you slide back in time.
    const gap = l.cut ? 0.08 * (1 - (l.kind === 'me' ? eraMix : 0)) : 0;
    let along = 0;
    for (let i = 0; i < SEG; i++) {
      va.fromArray(l.pts, i * 3);
      vb.fromArray(l.pts, i * 3 + 3);
      dir.subVectors(vb, va);
      const len = dir.length();
      mid.addVectors(va, vb).multiplyScalar(0.5);
      quat.setFromUnitVectors(UP, dir.normalize());
      const t = (i + 0.5) / SEG;
      const bridge = gap > 0 && Math.abs(t - 0.5) < gap;
      if (ribbon) quat.multiply(spin.setFromAxisAngle(UP, t * 2.5 + l.seed));   // ribbons twist slowly along their length
      const w = bridge ? Math.min(r, 0.12) : r;
      size.set(ribbon && !bridge ? w * 2.6 : w, len * 1.02, ribbon && !bridge ? w * 0.22 : w);
      strings.setMatrixAt(l.index + i, matrix.compose(mid, quat, size));
      info.setW(l.index + i, bridge ? 1 : 0);
      rope.setXYZW(l.index + i, along, MATERIAL[l.material], t, 0);
      along += len;
    }
  }
  strings.instanceMatrix.needsUpdate = true;
  info.needsUpdate = true;
  rope.needsUpdate = true;
  dirty = true;
}

// A point partway along a rope (t from 0 to 1).
function ropePoint(l, t, out) {
  const f = Math.min(t * SEG, SEG - 1e-6), i = Math.floor(f);
  va.fromArray(l.pts, i * 3);
  vb.fromArray(l.pts, i * 3 + 3);
  return out.lerpVectors(va, vb, f - i);
}

// ---------- signals: little lights travelling out along the strings you use most ----------

let signals, dots = [];

function makeSignals() {
  for (const l of data.links) {
    if (l.kind !== 'me' || l.cut) continue;
    const n = Math.max(0, l.person.talk_frequency - 1);
    for (let k = 0; k < n; k++) dots.push({ link: l, offset: k / n, speed: 0.09 + 0.06 * l.person.talk_frequency });   // string lengths per second
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, '#fff'); g.addColorStop(0.4, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(dots.length * 3), 3));
  signals = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#fffaf0', size: 3.4, map: starTexture(0.4), transparent: true, depthWrite: false }));
  signals.frustumCulled = false;
  signals.renderOrder = 5;
  scene.add(signals);
}

const sp = new THREE.Vector3();
function moveSignals(seconds) {
  const pos = signals.geometry.attributes.position;
  dots.forEach((d, i) => {
    const l = d.link;
    const on = l.a.grow === 1 && l.b.grow === 1 && (!lit || lit.links.has(l));
    const t = on ? (d.offset + seconds * d.speed * LOOK.signalSpeed) % 1 : 0;   // hidden ones wait inside the center orb
    ropePoint(l, t, sp);
    pos.setXYZ(i, sp.x, sp.y, sp.z);
  });
  pos.needsUpdate = true;
}

// ---------- pulses: light running out along every connection of whoever you've selected ----------
// Healthy bonds carry bright pulses all the way; fading ones dim and die partway; ended-badly
// ones stutter, flicker coral and fizzle out at the cut.

const TRAIL = 4;            // points per pulse: a soft head and a short fading tail
const PER_LINK = 1;         // one pulse on each connection at a time
let pulses;
const pulseColor = new THREE.Color(), pp = new THREE.Vector3();

function makePulses() {
  const n = data.links.length * PER_LINK * TRAIL;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
  pulses = new THREE.Points(geo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aAlpha, aSize;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor; vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * uScale / max(-mv.z, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, r) * vAlpha;
        gl_FragColor = vec4(vColor * a, a);
        #include <colorspace_fragment>
      }`,
  }));
  pulses.frustumCulled = false;
  pulses.renderOrder = 6;
  pulses.visible = false;
  scene.add(pulses);
}

// How each kind of bond carries light: speed (string lengths per second), how far the pulse gets,
// brightness, and whether it stutters.
function pulseStyle(l) {
  const status = l.kind === 'me' ? l.person.status : l.status;
  if (l.cut) return { speed: 0.45, reach: 0.42, glow: 0.9, stutter: true };
  return ({
    close: { speed: 0.7, reach: 1, glow: 1 },
    steady: { speed: 0.55, reach: 1, glow: 0.8 },
    fading: { speed: 0.38, reach: 0.72, glow: 0.55 },
    faded: { speed: 0.28, reach: 0.45, glow: 0.35 },
  })[status] ?? { speed: 0.55, reach: 1, glow: 0.8 };
}

function movePulses(seconds) {
  const f = state.focus;
  pulses.visible = !!f && LOOK.pulse > 0;
  if (!pulses.visible) return;
  const geo = pulses.geometry, pos = geo.attributes.position, col = geo.attributes.aColor, alpha = geo.attributes.aAlpha, size = geo.attributes.aSize;
  pulses.material.uniforms.uScale.value = renderer.domElement.height * 0.9;
  let i = 0;
  for (const l of lit.links) {
    if (Math.min(l.a.grow, l.b.grow) < 1) continue;
    const fromB = !f.a && l.b === f;          // pulses always leave the selected person
    const st = pulseStyle(l);
    pulseColor.set(l.cut ? LOOK.ended : baseColor(l)).lerp(WHITE, 0.45);
    for (let k = 0; k < PER_LINK; k++) {
      const phase = (seconds * st.speed * 0.75 * LOOK.pulse + k / PER_LINK + l.seed * 0.13) % 1;
      for (let j = 0; j < TRAIL; j++) {
        const t = phase - j * 0.025;            // the tail follows just behind the head
        let a = 0;
        if (t > 0 && t < st.reach) {
          a = st.glow * 0.55 * (1 - j / TRAIL);   // kept soft
          const end = st.reach - t;              // fade out as the pulse runs out of reach
          if (st.reach < 1) a *= Math.min(1, end / 0.12);
          if (st.stutter) a *= Math.sin(seconds * 37 + l.seed * 9 + k * 3) > -0.1 ? 1 : 0.15;   // flicker
        }
        ropePoint(l, fromB ? 1 - Math.max(t, 0) : Math.max(t, 0), pp);
        if (st.stutter && t > st.reach - 0.05 && t < st.reach + 0.06) {   // fizzle: scatter a little at the cut
          const jitter = 2.5 * (t - st.reach + 0.05) / 0.11;
          pp.x += Math.sin(l.seed * 31 + j * 7.1 + seconds * 13) * jitter;
          pp.y += Math.cos(l.seed * 17 + j * 5.3 + seconds * 11) * jitter;
          a = Math.max(a, 0.6 * (1 - j / TRAIL) * (Math.sin(seconds * 53 + j) > 0 ? 1 : 0.2));
        }
        pos.setXYZ(i, pp.x, pp.y, pp.z);
        col.setXYZ(i, pulseColor.r, pulseColor.g, pulseColor.b);
        alpha.setX(i, a);
        size.setX(i, (j === 0 ? 9 : 5.5) * LOOK.pulseSize);
        i++;
      }
    }
  }
  for (; i < alpha.count; i++) alpha.setX(i, 0);
  pos.needsUpdate = col.needsUpdate = alpha.needsUpdate = size.needsUpdate = true;
  geo.setDrawRange(0, alpha.count);
}

// ---------- rings on the floor (one set per layout, only the current one is shown) ----------

const rings = {};
const ringMaterial = new THREE.LineDashedMaterial({ color: LOOK.ring, dashSize: 3, gapSize: 5 });   // dashed, so they read as guides, not orbits
const ringLabels = [];
const tickMaterial = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false });
const markerMaterial = new THREE.SpriteMaterial({ map: starTexture(0), transparent: true, depthWrite: false });

function makeRings() {
  const material = ringMaterial;
  for (const [mode, { rings: list }] of Object.entries(MODES)) {
    const group = rings[mode] = new THREE.Group();
    for (const [r0, text] of list) {
      const r = r0 * SPREAD, pts = [];
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)));   // in the orbit plane, like a star chart
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material).computeLineDistances());
      const label = textSprite(text.toUpperCase(), { font: '400 8px "GT America Mono", ui-monospace, monospace', color: LOOK.muted, background: null });
      ringLabels.push(label);
      const a = Math.PI / 2 + 0.12;
      label.position.set(r * Math.cos(a), 0, r * Math.sin(a));
      group.add(label);
    }
    // degree ticks around the outermost ring, and fine axes through the sun
    const outer = list.at(-1)[0] * SPREAD, ticks = [];
    for (let d = 0; d < 360; d += 5) {
      const a = d * Math.PI / 180, len = d % 30 === 0 ? 10 : 4;
      ticks.push(new THREE.Vector3(Math.cos(a) * outer, 0, Math.sin(a) * outer), new THREE.Vector3(Math.cos(a) * (outer + len), 0, Math.sin(a) * (outer + len)));
    }
    const reach = outer * 1.12;
    ticks.push(new THREE.Vector3(-reach, 0, 0), new THREE.Vector3(reach, 0, 0), new THREE.Vector3(0, 0, -reach), new THREE.Vector3(0, 0, reach));
    group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ticks), tickMaterial));
    for (let q = 0; q < 4; q++) {
      const m = new THREE.Sprite(markerMaterial);
      m.position.set(Math.cos(q * Math.PI / 2) * (outer + 22), 0, Math.sin(q * Math.PI / 2) * (outer + 22));
      m.scale.setScalar(16);
      group.add(m);
    }
    scene.add(group);
  }
}

// ---------- who's shown (filters + time bar) ----------

function nodeVisible(n) {
  if (n.isMe) return true;
  if (state.room && !n.roomPos) return false;   // only the people who are really hanging in the room
  if (state.hiddenGroups.has(n.group) || state.hiddenStatuses.has(n.status)) return false;
  const year = steps[state.step];
  return year === 'now' || (n.year_met != null && n.year_met <= year);   // people with no year arrive at "now"
}
const linkVisible = l => nodeVisible(l.a) && nodeVisible(l.b);

// People grow in and shrink out instead of popping.
function stepGrow(dt) {
  let changed = false;
  for (const n of data.nodes) {
    const goal = nodeVisible(n) ? 1 : 0;
    if (n.grow === goal) continue;
    n.grow = goal ? Math.min(1, n.grow + dt / 400) : Math.max(0, n.grow - dt / 300);
    changed = true;
  }
  if (changed) { paintNodes(); wakeRopes(2500); }
}

function refresh() {
  signals.visible = LOOK.signalSize > 0;
  const f = state.focus;
  if (f && !(f.a ? linkVisible(f) : nodeVisible(f))) hidePanel();   // what you were exploring just got hidden
  updateYearLabel();
  dirty = true;
}

// ---------- the camera gliding to whatever you're exploring ----------

let fly = null;
const flyOffset = new THREE.Vector3();

function flyTo(target, distance, direction = camera.position.clone().sub(controls.target).normalize()) {
  fly = {
    start: performance.now(),
    fromTarget: controls.target.clone(), toTarget: target.clone(),
    fromOffset: camera.position.clone().sub(controls.target), toOffset: direction.multiplyScalar(distance),
  };
}

function stepFly(now) {
  const t = Math.min(1, (now - fly.start) / 1100);
  const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  if (state.focus) focusPoint(fly.toTarget);   // they keep orbiting while the camera travels
  controls.target.lerpVectors(fly.fromTarget, fly.toTarget, e);
  camera.position.copy(controls.target).add(flyOffset.lerpVectors(fly.fromOffset, fly.toOffset, e));
  if (t === 1) fly = null;
  dirty = true;
}

function focusPoint(out) {
  const f = state.focus;
  return f.a ? out.lerpVectors(f.a.obj.position, f.b.obj.position, 0.5) : out.copy(f.obj.position);
}

// Fly in to the person (or string). The camera frames their nearer ties and lets the rest of
// their strings run off-screen, so there's always somewhere to travel next.
function frameFocus() {
  const f = state.focus;
  if (!f) return flyTo(HOME, HOME_DISTANCE, ROOM_DIR.clone());
  const where = n => n.obj.position.clone();
  if (f.isMe) return flyTo(where(f), HOME_DISTANCE * 0.5, LOOK.nodeStyle === 'acrylic' && state.view !== 'map' ? FRONT.clone() : undefined);
  const center = f.a ? where(f.a).lerp(where(f.b), 0.5) : where(f);
  const gaps = [...lit.nodes].filter(n => n !== f && nodeVisible(n)).map(n => where(n).distanceTo(center)).sort((a, b) => a - b);
  const radius = Math.max(40, gaps[Math.floor((gaps.length - 1) / 2)] ?? 40);   // half their ties fit on screen
  const w = el.clientWidth - (phone() ? 0 : 346), h = el.clientHeight * (phone() ? 0.5 : 1);
  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const distance = Math.max(radius / tan, radius / (tan * w / h)) * 1.1;
  const face = LOOK.nodeStyle === 'acrylic' && state.view !== 'map' && !f.a ? FRONT.clone() : undefined;   // a medallion: look at it straight on
  flyTo(center, THREE.MathUtils.clamp(distance, 160, HOME_DISTANCE * 0.75), face);
}

// Called by the info card whenever you open a person or string (or close it with null).
function explore(target) {
  state.focus = target;
  if (target) {
    const links = target.a ? [target] : data.links.filter(l => l.a === target || l.b === target);
    lit = { links: new Set(links), nodes: new Set(links.flatMap(l => [l.a, l.b]).concat(target.a ? [] : [target])) };
    if (target.a) { pluck(target.a, 0.6); pluck(target.b, 0.6); } else pluck(target);
  } else lit = null;
  clearTimeout(idleTimer);
  controls.autoRotate = !target && LOOK.rotateSpeed > 0 && state.view !== 'map';
  paintNodes();
  paintStrings();
  placeStrings();
  frameFocus();
}

// ---------- switching layouts and eras (people glide to their new places) ----------

let glide = null;

function arrange(mode, era) {
  state.room = mode === 'room' && !!ceiling;
  if (mode === 'room') { mode = state.mode; era = 'now'; }   // the room keeps the orbits underneath, for when you leave it
  if (era === 'then') mode = 'closeness';   // "then" only exists for closeness
  if (mode !== 'closeness') era = 'now';
  state.mode = mode;
  state.era = era;
  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('active', b.dataset.mode === (state.room ? 'room' : mode)));
  document.querySelectorAll('.era button').forEach(b => b.classList.toggle('active', b.dataset.era === era));
  for (const m in rings) rings[m].visible = !state.room && m === mode && LOOK.floorRings > 0;
  wakeRopes(state.room ? 9000 : 5000);   // give the strings time to drape (or straighten)
  glide = {
    start: performance.now(),
    from: data.nodes.map(n => n.r),
    to: data.nodes.map(n => radiusFor(n, mode, era)),
    eraFrom: eraMix, eraTo: era === 'then' ? 1 : 0,
  };
  if (state.focus) frameFocus();
}

function stepGlide(now) {
  const t = Math.min(1, (now - glide.start) / 1400);
  const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  data.nodes.forEach((n, i) => { n.r = glide.from[i] + (glide.to[i] - glide.from[i]) * ease; });
  if (glide.eraFrom !== glide.eraTo) {
    eraMix = glide.eraFrom + (glide.eraTo - glide.eraFrom) * ease;
    paintNodes();
    paintStrings();
  }
  if (t === 1) glide = null;
  placeStrings();
}

// ---------- map view: the same system seen flat from straight above ----------

state.view = '3d';
function setView(view) {
  state.view = view;
  document.querySelectorAll('.view button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const map = view === 'map';
  controls.enableRotate = !map;
  controls.mouseButtons.LEFT = map ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
  controls.touches.ONE = map ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
  controls.autoRotate = !map && LOOK.rotateSpeed > 0 && !state.focus;
  const target = state.focus ? focusPoint(new THREE.Vector3()) : new THREE.Vector3(0, 0, 0);
  if (map) flyTo(target, HOME_DISTANCE * 0.8, new THREE.Vector3(0, 1, 0.0001));   // straight down (a hair off, so the controls stay steady)
  else flyTo(state.focus ? target : HOME, HOME_DISTANCE, ROOM_DIR.clone());
  wakeRopes(2000);
  paintNodes();
}
document.querySelectorAll('.view button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));

// ---------- the time bar: watch the web grow, year by year ----------

const slider = document.getElementById('years');
const yearLabel = document.getElementById('year-label');
const playBtn = document.getElementById('play');
let playTimer = null;

function updateYearLabel() {
  yearLabel.textContent = steps[state.step];
}

function setStep(i) {
  state.step = i;
  slider.value = i;
  refresh();
}

function stopPlaying() {
  clearInterval(playTimer);
  playTimer = null;
  playBtn.innerHTML = '<svg class="i"><use href="#i-play"/></svg>';
  playBtn.setAttribute('aria-label', 'Play through the years');
}

playBtn.addEventListener('click', () => {
  if (playTimer) return stopPlaying();
  const last = steps.length - 1;
  setStep(state.step === last ? 0 : state.step + 1);
  playTimer = setInterval(() => (state.step >= last ? stopPlaying() : setStep(state.step + 1)), 1300);
  playBtn.innerHTML = '<svg class="i"><use href="#i-pause"/></svg>';
  playBtn.setAttribute('aria-label', 'Pause');
});
slider.addEventListener('input', () => { stopPlaying(); setStep(+slider.value); });
document.querySelectorAll('.era button').forEach(b => b.addEventListener('click', () => arrange(state.mode, b.dataset.era)));

// ---------- clicking and tapping ----------
// Finds what's under the pointer by measuring on screen, with a generous margin so
// thin strings and small coins are still easy to hit with a finger.

const canvas = renderer.domElement;

const v = new THREE.Vector3();
function toScreen(p, rect) {
  v.copy(p).project(camera);
  return { x: (v.x + 1) / 2 * rect.width, y: (1 - v.y) / 2 * rect.height, behind: v.z > 1 };
}

function pick(ev) {
  const rect = canvas.getBoundingClientRect();
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  const pxPerUnit = d => rect.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * d);

  let best = null, bestDist = Infinity;
  for (const n of data.nodes) {
    if (!n.obj.visible) continue;
    const s = toScreen(n.obj.position, rect);
    if (s.behind) continue;
    const radius = Math.max(touch ? 20 : 8, n.body.scale.x * pxPerUnit(camera.position.distanceTo(n.obj.position)));
    const dist = Math.hypot(s.x - x, s.y - y);
    if (dist < radius && dist < bestDist) { best = n; bestDist = dist; }
  }
  if (best) return { node: best };

  bestDist = touch ? 14 : 6;
  for (const l of data.links) {
    if (!linkVisible(l)) continue;
    for (let i = 0; i < SEG; i++) {   // check every piece of the hanging rope
      const a = toScreen(va.fromArray(l.pts, i * 3), rect), b = toScreen(vb.fromArray(l.pts, i * 3 + 3), rect);
      if (a.behind || b.behind) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      const dist = Math.hypot(a.x + dx * t - x, a.y + dy * t - y);
      if (dist < bestDist) { best = l; bestDist = dist; }
    }
  }
  return best ? { link: best } : null;
}

let down = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;   // that was a drag, not a click
  const hit = pick(e);
  if (!hit) hidePanel();
  else if (hit.node) hit.node.isMe ? showMe() : showPerson(hit.node);
  else hit.link.kind === 'me' ? showPerson(hit.link.person) : showFriendLink(hit.link);
});
if (!touch) canvas.addEventListener('pointermove', e => { if (!e.buttons) canvas.style.cursor = pick(e) ? 'pointer' : ''; });

// Slow rotation of the whole web, paused while someone is interacting or exploring.
let idleTimer;
controls.addEventListener('start', () => { fly = null; controls.autoRotate = false; clearTimeout(idleTimer); });
controls.addEventListener('end', () => {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { controls.autoRotate = LOOK.rotateSpeed > 0 && !state.focus && state.view !== 'map'; }, 20000);
});

// ---------- menu ----------

function buildLegend() {
  const groupEl = document.getElementById('group-legend');
  groupEl.innerHTML = Object.entries(CONFIG.groups)
    .map(([g, c]) => `<button class="chip${state.hiddenGroups.has(g) ? ' off' : ''}" data-group="${esc(g)}"><i style="background:${c}"></i>${esc(g)}</button>`).join('');
  const sample = Object.keys(CONFIG.groups)[0];
  const statusEl = document.getElementById('status-legend');
  statusEl.innerHTML = STATUSES.map(s => `<button class="row${state.hiddenStatuses.has(s) ? ' off' : ''}" data-status="${s}">
      <i class="${s === 'ended badly' ? 'cut' : ''}" style="background:${stringColor(sample, s)}"></i>${s === 'ended badly' ? 'cut' : s}
    </button>`).join('');

  const toggle = (set, value, button) => {
    set.has(value) ? set.delete(value) : set.add(value);
    button.classList.toggle('off', set.has(value));
    refresh();
  };
  groupEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => toggle(state.hiddenGroups, b.dataset.group, b)));
  statusEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => toggle(state.hiddenStatuses, b.dataset.status, b)));
}

document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => arrange(b.dataset.mode, state.era)));

// The Key: legend and filters, tucked away until asked for.
const keyBtn = document.getElementById('key-btn');
const keyBox = document.getElementById('key');
keyBtn.addEventListener('click', () => {
  keyBox.hidden = !keyBox.hidden;
  keyBtn.setAttribute('aria-expanded', String(!keyBox.hidden));
});

// The "bare" layout hides the controls after a few seconds of nobody touching anything.
let idleUi;
function wake() {
  document.body.classList.remove('idle');
  clearTimeout(idleUi);
  idleUi = setTimeout(() => document.body.classList.add('idle'), 3500);
}
['pointermove', 'pointerdown', 'keydown'].forEach(t => addEventListener(t, wake, { passive: true }));
wake();

// Everything the tuner can change.
function applyLook(what = 'all') {
  wakeRopes();
  const all = what === 'all';
  if (all || what === 'colors' || what === 'layout') applyPageColors();
  if (all || what === 'colors') makeBackdrop();
  if (all || what === 'colors') {
    Object.assign(CONFIG.groups, { home: LOOK.home, college: LOOK.college, other: LOOK.other });
    ringMaterial.color.set(LOOK.ring);
    data.nodes.forEach(makeCoinMaps);
    buildLegend();
  }
  if (all || what === 'colors' || what === 'lines') { applyLineLook(); paintStrings(); placeStrings(); }
  sunColor.value.set(LOOK.sun);
  applySpaceLook();
  if (all || what === 'coins' || what === 'glass') paintNodes();
  if (all || what === 'lines') placeStrings();
  if (all || what === 'signals') { signals.material.size = LOOK.signalSize; signals.visible = LOOK.signalSize > 0; }
  if (all || what === 'rotate') { controls.autoRotateSpeed = LOOK.rotateSpeed; controls.autoRotate = LOOK.rotateSpeed > 0 && !state.focus && state.view !== 'map'; }
  paintNodes();
}

// ---------- start ----------

function showMessage(text) {
  const m = document.getElementById('message');
  m.textContent = text;
  m.hidden = false;
}

async function start() {
  document.title = CONFIG.title;
  document.getElementById('title').lastChild.textContent = CONFIG.title;
  document.getElementById('title').addEventListener('click', showFront);
  initFront();
  applyPageColors();
  Object.assign(CONFIG.groups, { home: LOOK.home, college: LOOK.college, other: LOOK.other });
  buildLegend();
  try {
    const [graph] = await Promise.all([loadGraph(), fontsReady()]);
    data = graph;
    const years = [...new Set(data.nodes.map(n => n.year_met).filter(y => y != null))].sort((a, b) => a - b);
    steps = [...years, 'now'];
    state.step = steps.length - 1;
    slider.max = state.step;
    slider.value = state.step;
    data.nodes.forEach(makeNode);
    makeStrings();
    makeSignals();
    makePulses();
    makeRings();
    makeStars();
    let plan = null;
    try { plan = await fetch('data/install-plan.json?v=1794564470').then(r => (r.ok ? r.json() : null)); } catch {}
    setupRoom(plan);
    if (!ceiling) document.querySelector('[data-mode="room"]').hidden = true;   // no installation plan yet
    initPanel(data, explore);
    initDeck(data);
    arrange(state.mode, state.era);
    glide.start = -Infinity;   // place everyone straight away on first load
    applyLook();
    makeBeads();
    wakeRopes(6000);
    initTuner(applyLook);
    refresh();
    if (graph.missing.length) {
      showMessage(`These connections don't match anyone in the People tab: ${graph.missing.join(', ')}. Check the spelling.`);
    }
  } catch (err) {
    console.error(err);
    showMessage(location.protocol === 'file:'
      ? 'This page needs to run from a local server or a website to read the data (see README.md).'
      : `Couldn't load the data: ${err.message}`);
    return;
  }

  let last = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(50, now - last);
    last = now;
    if (fly) stepFly(now);
    controls.update();   // fires 'change' (→ dirty) while the camera is moving
    if (glide) stepGlide(now);
    stepGrow(dt);
    orbitTime += dt / 1000 * LOOK.orbitSpeed;
    const mapGoal = state.view === 'map' ? 1 : 0;
    if (mapMix !== mapGoal) { mapMix += Math.sign(mapGoal - mapMix) * Math.min(Math.abs(mapGoal - mapMix), dt / 900); dirty = true; }
    const roomGoal = state.room ? 1 : 0;
    if (roomMix !== roomGoal) {
      roomMix += Math.sign(roomGoal - roomMix) * Math.min(Math.abs(roomGoal - roomMix), dt / 1400);
      dirty = true;
    }
    const moving = LOOK.orbitSpeed > 0 || glide;
    if (moving || dirty) {
      placeNodes();
      placeOrbitLines();
      if (state.focus && !fly) {   // keep the person you're exploring in view as they travel
        focusPoint(focusTarget).sub(controls.target);
        controls.target.add(focusTarget);
        camera.position.add(focusTarget);
      }
      sunView.value.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse);
      if (moving) wakeRopes(300);
    }
    stepOffset(dt);
    // ropes only move while awake; once they settle the scene redraws only when the camera moves
    if (now < awakeUntil || glide) { stepRopes(1 / 60, now / 1000); placeStrings(); placeBeads(); }
    faceSymbols();   // medallions face front (or up on the map), turning gently
    wakeRopes(300);  // so the knots follow them as they turn
    dirty = true;
    if (signals.visible) { moveSignals(now / 1000); dirty = true; }
    if (state.focus || pulses.visible) { movePulses(now / 1000); dirty = true; }
    if (dirty) {
      const d = camera.position.distanceTo(controls.target);   // the string fade starts just past what you're looking at
      stringMaterial.uniforms.uFog.value.set(d * 0.85, d * 2.2);
      renderer.render(scene, camera);
      dirty = false;
    }
  });
}

start();
window.app = { scene, camera, controls, renderer, state, LOOK, applyLook: what => applyLook(what), get data() { return data; } };   // handy for poking at it from the browser console
