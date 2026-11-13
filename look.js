// How the web looks: layout, line texture and palette. Every value here can be pulled
// around live in the tuner (press T, or open the page with ?tune). "Copy settings" in the
// tuner gives you a block to paste into config.js → look, which makes it the default.
import { CONFIG } from './config.js?v=1794564529';

// Line textures: how each string is drawn.
//   twist     how tightly the strands wind around each other (0 = straight, parallel strands)
//   edge      how clearly you can see the separate strands
//   sheen     shiny highlight down the middle, like satin
//   glow      soft light around the string
//   round     shading that makes strings look like round thread instead of flat lines
export const TEXTURES = {
  fine: { twist: 0, edge: 0, sheen: 0, glow: 0, round: 0, thickness: 0.42, opacity: 0.8, beam: 0, beadSize: 0, materials: 'all thread' },   // clean, even hairlines for a white page
  installation: { twist: 1.4, edge: 0.6, sheen: 0.6, glow: 0, round: 0.7, thickness: 1.1, opacity: 1, beam: 0, beadSize: 0, materials: 'by type' },   // the real ribbon, satin cord and floss
  diagram: { twist: 0, edge: 0, sheen: 0, glow: 0, round: 0, thickness: 0.4, opacity: 0.45, beam: 0.15, beadSize: 2.4, materials: 'all thread' },   // clean hairlines, like an astronomy chart
  thread: { twist: 1.4, edge: 0.75, sheen: 0.15, glow: 0, round: 0.7, thickness: 0.7, opacity: 1 },
  satin: { twist: 0.15, edge: 0.1, sheen: 0.9, glow: 0.1, round: 0.9, thickness: 1.5, opacity: 0.95 },
  glow: { twist: 0.6, edge: 0.2, sheen: 0.3, glow: 0.85, round: 0.3, thickness: 1.1, opacity: 0.85 },
  plain: { twist: 0, edge: 0, sheen: 0, glow: 0, round: 0, thickness: 1, opacity: 0.95 },
};

// Palettes: string colors plus the page itself.
export const PALETTES = {
  nebula: {   // navy, washed with deep violet, royal blue, plum and indigo glows
    home: '#ff5fb4', college: '#c4b2ff', other: '#3fe0ff', friend: '#ffd6a0', faded: '#8085b8', ended: '#ff7a90',
    paper: '#0a1036', ink: '#f1eeff', muted: '#a49fd6', line: '#2c2a6e', ring: '#4a4596', card: 'rgba(22,20,70,.6)',
    blobs: ['#4b1d9e', '#1d3aa8', '#7a1f86', '#2a1a6e'],
    glassTint: 1, glassOpacity: 0.62, etch: '#ffffff', friendColors: false, stars: 0.35, iridescence: 0, floorRings: 0.3, symbolSize: 1.2, friendLines: 1,
  },
  gallery: {   // a white gallery wall: clear glass, and bright strings in hot pink / violet / blue; strings between
               // two friends blend their two colors (friendColors), faded ones go pale lilac
    home: '#f7609f', college: '#9c6cf5', other: '#4b9cf0', friend: '#bdb7c9', faded: '#ddd7f2', ended: '#b4aacd', friendColors: true,
    paper: '#fbfbfa', ink: '#24212b', muted: '#8d8896', line: '#e7e5ea', ring: '#d9d6de', card: 'rgba(255,255,255,.86)',
    blobs: ['#fbfbfa', '#fbfbfa', '#fbfbfa', '#fbfbfa'],
    glassTint: 0, glassOpacity: 0.2, etch: '#24212b', stars: 0, iridescence: 0, floorRings: 0.6, symbolSize: 1.75, friendLines: 1,
  },
  // Four balanced schemes: each has one background mood, three group colors of equal brightness and
  // strength spread around the wheel, and quiet neutrals for friend lines, fading and ended-badly.
  opal: {   // cool-warm pastel, closest to the original gradient
    home: '#e8669a', college: '#8f74e8', other: '#2fb5b0', friend: '#c4b2ec', faded: '#c9c3d6', ended: '#3a2c4a',
    paper: '#fbf7ff', ink: '#33264a', muted: '#8d80aa', line: '#e8def7', ring: '#ddd0f2', card: 'rgba(255,255,255,.8)',
    blobs: ['#ffdcee', '#dde8ff', '#fff0d6', '#d9f7ee'],
  },
  dawn: {   // warm: peach and cream, coral / plum / sage
    home: '#ee6f5a', college: '#9a5fc0', other: '#3e9f94', friend: '#e2c19c', faded: '#d8cfc6', ended: '#3b2a2c',
    paper: '#fff8f2', ink: '#3a2630', muted: '#9a8478', line: '#f1e2d6', ring: '#ead8c8', card: 'rgba(255,252,248,.85)',
    blobs: ['#ffe0d2', '#ffecc8', '#fde0ea', '#e6f1ff'],
  },
  tide: {   // cool: ice blue and mint, pink / cobalt / aqua
    home: '#e66fa6', college: '#4f6fe0', other: '#16b0c4', friend: '#b6c6ea', faded: '#c4cad8', ended: '#22304a',
    paper: '#f6f9fe', ink: '#1f2a44', muted: '#7e8bab', line: '#dfe6f5', ring: '#d3ddf0', card: 'rgba(255,255,255,.82)',
    blobs: ['#ffe2f0', '#dbeaff', '#e2fbf3', '#ebe5ff'],
  },
  chalk: {   // neutral: near-white with muted, inky colors
    home: '#c45b86', college: '#6a5bb5', other: '#3b8f8a', friend: '#bcb6c9', faded: '#d2cfd8', ended: '#1c1a22',
    paper: '#fbfaf8', ink: '#1f1c26', muted: '#8a8694', line: '#e8e6ea', ring: '#e1dee6', card: 'rgba(255,255,255,.86)',
    blobs: ['#f6eef2', '#eef1f7', '#f7f3ea', '#eef5f2'],
  },
  space: {   // a deep navy night: you're the sun, everyone else orbits; colors tuned to glow against it
    home: '#ff4fa8', college: '#a98bff', other: '#38e1ff', friend: '#ffd27a', faded: '#7d8bb8', ended: '#ff6f8e',
    paper: '#0a1433', ink: '#eef2ff', muted: '#8f9cc8', line: '#26346a', ring: '#33427a', card: 'rgba(14,26,64,.65)',
    blobs: ['#101c45', '#0c1840', '#141a48', '#0b1a3e'],
  },
  pastel: {
    home: '#ff5fa2', college: '#8b6cff', other: '#1fc4b0', friend: '#c9b6ec', faded: '#c7bedb', ended: '#3a2450',
    paper: '#fbf5ff', ink: '#3a2450', muted: '#8f80ad', line: '#eadcf9', ring: '#e4d3fb', card: 'rgba(255,255,255,.8)',
    blobs: ['#ffe0f0', '#e2ecff', '#fff0d9', '#dff8f1'],
  },
  floss: {   // embroidery floss on linen: the red / ochre / blue / ecru threads from the build sheet
    home: '#c8342f', college: '#c99a2e', other: '#2f5fa8', friend: '#cbb88f', faded: '#a9a398', ended: '#1d1a1a',
    paper: '#f3ece0', ink: '#2b2420', muted: '#8a7f70', line: '#e2d6c2', ring: '#dccfb8', card: 'rgba(250,246,238,.88)',
    blobs: ['#efe3cf', '#e9e1d3', '#f5ecdc', '#e6dccb'],
  },
  night: {
    home: '#ff6fb1', college: '#a98bff', other: '#4fe0c8', friend: '#7d6aa8', faded: '#5c536e', ended: '#f0e6ff',
    paper: '#140e1d', ink: '#f1e8ff', muted: '#9d8fc0', line: '#2d2340', ring: '#2f2545', card: 'rgba(28,20,40,.85)',
    blobs: ['#2a1433', '#141f3a', '#2a1d14', '#10282a'],
  },
  studio: {   // the actual strings on the table: hot pink and lavender satin cord, sky blue, pastel floss, silver, black
    home: '#ff4f9a', college: '#9b6fe0', other: '#3fb6ea', friend: '#f2c6a0', faded: '#c9c8d0', ended: '#151418',
    paper: '#f6f3f7', ink: '#26222c', muted: '#8b8594', line: '#e4e0e8', ring: '#e2dde8', card: 'rgba(255,255,255,.7)',
    blobs: ['#ffe3ef', '#e6f0ff', '#fff4d8', '#e3fbf1'],
  },
  ink: {
    home: '#b0445e', college: '#4b4a8f', other: '#2f7f74', friend: '#9a96a8', faded: '#c9c6cf', ended: '#111111',
    paper: '#fafaf7', ink: '#1f1d24', muted: '#8a8794', line: '#e6e4ea', ring: '#e3e1e6', card: 'rgba(255,255,255,.88)',
    blobs: ['#f3f2ee', '#f3f2ee', '#f3f2ee', '#f3f2ee'],
  },
};

export const LAYOUTS = ['dock', 'corner', 'bare'];

const DEFAULTS = {
  layout: 'dock',
  texture: 'fine',
  palette: 'gallery',
  ...TEXTURES.thread,
  ...PALETTES.gallery,
  materials: 'by type',   // 'by type' = ribbon / nylon / thread like the installation; 'all thread' = every string uses the texture above
  slack: 0,           // how much extra length strings have, so they sag (0 = straight beams)
  gravity: 0,
  wind: 0,            // gentle sway
  glassRoughness: 0.08,  // base frost of every orb
  frost: 0.8,           // how cloudy faded friendships' orbs get
  tint: 0.9,          // how much each orb takes on its group's color
  anchorGap: 0,       // how far outside the glass strings stop (0 = right on the surface)
  spreadAnchors: 1,   // how far strings fan out around each orb instead of meeting in one spot
  beam: 0.35,         // how much light the strings give off
  beamWidth: 4,       // how wide that glow spreads
  beadSize: 4,        // the glowing point where each string touches its orb (0 = none)
  orbitSpeed: 0.5,    // how fast everyone circles you (0 = frozen)
  tiltAmount: 1,      // how far drifting friendships tilt off the main plane
  pull: 0.5,          // how strongly friends pull on each other
  spacing: 18,        // the minimum gap between any two orbs
  antigravity: 1,     // how hard ended / faded ties push apart, and how much drifting people bob
  orbitLines: 0.22,   // the faint path each person travels
  sun: '#f2bf4a',     // gold: your disc at the center
  sunGlow: 1,
  stars: 0.8,
  paperGrain: 0.5,     // printed-paper grain, fibres and vignette over everything (0 = clean screen)
  focusFade: 0.85,    // how much everything else fades while you explore someone
  coinSize: 1,        // orb size
  nodeStyle: 'acrylic',   // 'acrylic' = discs like the real laser-cut nodes, 'orb' = glass orbs, 'orb in 3d' = orbs in 3D, discs on the map
  glassHue: 1,        // how much each person's glass hue varies from their group color
  signalSize: 3.4,    // 0 = no signals
  signalSpeed: 1,
  pulse: 1,           // light pulsing along a selected person's connections (0 = off)
  pulseSize: 1.1,
  rotateSpeed: 0,     // 0 = no slow rotation (the medallions all face one way, so the camera stays put)
  ...TEXTURES.fine,
  tint: 1,
  orbitSpeed: 0,      // everyone hangs still, like the room
  orbitLines: 0,      // each person's own orbit path (off: the distance rings are enough)
  sunGlow: 0.55,
  coinSize: 1.35,
  signalSize: 1.8,
  ...(CONFIG.look || {}),
};

const KEY = 'heart-strings-look-v11';   // v11: softer, thinner strings
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}

export const LOOK = { ...DEFAULTS, ...saved };

export function saveLook() {
  try { localStorage.setItem(KEY, JSON.stringify(LOOK)); } catch {}
}

export function resetLook() {
  try { localStorage.removeItem(KEY); } catch {}
  Object.assign(LOOK, DEFAULTS);
}

// The page around the 3D web: background, text and card colors.
export function applyPageColors() {
  const s = document.documentElement.style;
  for (const k of ['paper', 'ink', 'muted', 'line', 'card']) s.setProperty('--' + k, LOOK[k]);
  document.body.dataset.palette = LOOK.palette;
  LOOK.blobs.forEach((c, i) => s.setProperty(`--blob${i + 1}`, c));
  document.body.dataset.layout = LOOK.layout;
  s.setProperty('--paper-amount', LOOK.paperGrain);
}
