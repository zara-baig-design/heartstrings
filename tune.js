// The tuner: sliders for everything in look.js. Hidden for visitors.
// Open it with the T key, or by adding ?tune to the address.
import GUI from './vendor/lil-gui.esm.min.js';
import { LOOK, TEXTURES, PALETTES, LAYOUTS, saveLook, resetLook } from './look.js?v=1794564273';

export function initTuner(onChange) {
  const gui = new GUI({ title: 'Tune' });
  gui.domElement.id = 'tuner';
  const changed = (what) => { saveLook(); onChange(what); };
  const all = [];
  const add = (folder, ...args) => { const c = folder.add(LOOK, ...args); all.push(c); return c; };
  const color = (folder, key, name) => { const c = folder.addColor(LOOK, key).name(name).onChange(() => changed('colors')); all.push(c); return c; };

  const presets = gui.addFolder('Options');
  add(presets, 'layout', LAYOUTS).name('UI layout').onChange(() => changed('layout'));
  add(presets, 'texture', Object.keys(TEXTURES)).name('Line texture').onChange(v => {
    Object.assign(LOOK, TEXTURES[v]);
    refresh();
    changed('lines');
  });
  add(presets, 'palette', Object.keys(PALETTES)).name('Palette').onChange(v => {
    Object.assign(LOOK, PALETTES[v]);
    refresh();
    changed('colors');
  });

  add(presets, 'materials', ['by type', 'all thread']).name('String materials').onChange(() => changed('lines'));

  const orbits = gui.addFolder('Orbits and gravity');
  add(orbits, 'orbitSpeed', 0, 4, 0.01).name('Orbit speed').onChange(() => changed('orbits'));
  add(orbits, 'tiltAmount', 0, 2.5, 0.01).name('Tilt when drifting').onChange(() => changed('orbits'));
  add(orbits, 'pull', 0, 3, 0.01).name('Friends pull together').onChange(() => changed('orbits'));
  add(orbits, 'spacing', 0, 80, 1).name('Spacing between orbs').onChange(() => changed('orbits'));
  add(orbits, 'antigravity', 0, 3, 0.01).name('Anti-gravity').onChange(() => changed('orbits'));
  add(orbits, 'orbitLines', 0, 1, 0.01).name('Orbit paths').onChange(() => changed('orbits'));
  add(orbits, 'sunGlow', 0, 3, 0.01).name('Sun glow').onChange(() => changed('orbits'));
  add(orbits, 'stars', 0, 1, 0.01).name('Stars').onChange(() => changed('orbits'));
  add(orbits, 'floorRings', 0, 1, 0.01).name('Distance rings').onChange(() => changed('orbits'));
  add(orbits, 'paperGrain', 0, 1, 0.01).name('Paper').onChange(() => changed('layout'));
  color(orbits, 'sun', 'Sun color');

  const physics = gui.addFolder('Physics (raise to make strings hang)');
  add(physics, 'slack', 0, 0.3, 0.005).name('Sag').onChange(() => changed('physics'));
  add(physics, 'gravity', 0, 3, 0.05).name('Gravity').onChange(() => changed('physics'));
  add(physics, 'wind', 0, 3, 0.05).name('Sway').onChange(() => changed('physics'));

  const glass = gui.addFolder('Nodes');
  add(glass, 'nodeStyle', ['acrylic', 'orb', 'orb in 3d']).name('Node style').onChange(() => changed('orbits'));
  add(glass, 'glassHue', 0, 3, 0.01).name('Glass hue variety').onChange(() => changed('colors'));
  add(glass, 'glassOpacity', 0.1, 0.9, 0.01).name('Glass density').onChange(() => changed('glass'));
  add(glass, 'glassTint', 0, 1, 0.01).name('Glass tint (0 = clear)').onChange(() => changed('colors'));
  color(glass, 'etch', 'Etched symbol');
  add(glass, 'iridescence', 0, 1, 0.01).name('String shimmer').onChange(() => changed('lines'));
  add(glass, 'friendLines', 0, 1, 0.01).name('Friend strings (nobody picked)').onChange(() => changed('lines'));
  add(glass, 'coinSize', 0.4, 2.5, 0.05).name('Node size').onChange(() => changed('glass'));
  add(glass, 'glassRoughness', 0, 1, 0.01).name('Frost').onChange(() => changed('glass'));
  add(glass, 'frost', 0, 1.5, 0.01).name('Frost when faded').onChange(() => changed('glass'));
  add(glass, 'tint', 0, 1, 0.01).name('Color tint').onChange(() => changed('glass'));
  add(glass, 'symbolSize', 0.3, 1.8, 0.01).name('Symbol size').onChange(() => changed('glass'));
  add(glass, 'anchorGap', 0, 1, 0.01).name('String gap from glass').onChange(() => changed('glass'));
  add(glass, 'spreadAnchors', 0, 2.5, 0.01).name('String fan-out').onChange(() => changed('glass'));
  add(glass, 'beadSize', 0, 12, 0.1).name('Bead glow').onChange(() => changed('glass'));

  const lines = gui.addFolder('Lines');
  add(lines, 'thickness', 0.2, 4, 0.05).name('Thickness').onChange(() => changed('lines'));
  add(lines, 'beam', 0, 2, 0.01).name('Beam glow').onChange(() => changed('lines'));
  add(lines, 'beamWidth', 1, 12, 0.1).name('Beam width').onChange(() => changed('lines'));
  add(lines, 'twist', 0, 4, 0.05).name('Twist').onChange(() => changed('lines'));
  add(lines, 'edge', 0, 1, 0.01).name('Strand detail').onChange(() => changed('lines'));
  add(lines, 'round', 0, 1, 0.01).name('Roundness').onChange(() => changed('lines'));
  add(lines, 'sheen', 0, 1, 0.01).name('Sheen').onChange(() => changed('lines'));
  add(lines, 'glow', 0, 1, 0.01).name('Glow').onChange(() => changed('lines'));
  add(lines, 'opacity', 0.1, 1, 0.01).name('Opacity').onChange(() => changed('lines'));

  const colors = gui.addFolder('Colors');
  color(colors, 'home', 'Home');
  color(colors, 'college', 'College');
  color(colors, 'other', 'Other');
  color(colors, 'friend', 'Friend to friend');
  color(colors, 'faded', 'Faded strands');
  color(colors, 'ended', 'Ended badly');
  color(colors, 'paper', 'Background');
  color(colors, 'ink', 'Text');
  colors.close();

  const scene = gui.addFolder('Scene');
  add(scene, 'focusFade', 0, 1, 0.01).name('Fade while exploring').onChange(() => changed('lines'));
  add(scene, 'signalSize', 0, 10, 0.1).name('Signal size').onChange(() => changed('signals'));
  add(scene, 'signalSpeed', 0, 4, 0.05).name('Signal speed').onChange(() => changed('signals'));
  add(scene, 'pulse', 0, 3, 0.05).name('Pulse speed').onChange(() => changed('signals'));
  add(scene, 'pulseSize', 0, 3, 0.05).name('Pulse size').onChange(() => changed('signals'));
  add(scene, 'rotateSpeed', 0, 4, 0.05).name('Rotate speed').onChange(() => changed('rotate'));

  const copy = gui.add({ copy() {
    const { blobs, ...rest } = LOOK;
    const text = `look: ${JSON.stringify({ ...rest, blobs }, null, 2)},`;
    navigator.clipboard?.writeText(text).then(() => copy.name('Copied: paste into config.js'), () => prompt('Copy this into config.js', text));
    setTimeout(() => copy.name('Copy settings'), 2500);
  } }, 'copy').name('Copy settings');
  gui.add({ reset() { resetLook(); refresh(); onChange('all'); } }, 'reset').name('Reset to defaults');

  function refresh() { for (const c of all) c.updateDisplay(); }

  const show = new URLSearchParams(location.search).has('tune');
  gui.show(show);
  addEventListener('keydown', e => {
    if ((e.key === 't' || e.key === 'T') && !e.metaKey && !e.ctrlKey && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) gui.show(gui._hidden);
  });
  return gui;
}
