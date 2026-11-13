// The info card that opens when you click a person or a string.
import { CONFIG } from './config.js?v=1794564529';
import { ME, esc, CLOSENESS_WORDS, FREQ_WORDS, STRENGTH_NAMES } from './data.js?v=1794564529';
import { symbolFile } from './lib.js?v=1794564529';

const panel = document.getElementById('panel');
const body = document.getElementById('panel-body');
let data, select;   // set by initPanel

const sym = (file, cls) => `<span class="sym ${cls}" role="img" aria-label="symbol" style="--sym:url('${esc(CONFIG.symbolsPath + file)}')"></span>`;

// A person's symbol (or their name if they don't have one). cls sets the size.
function who(n, cls = 'sym-chip') {
  const file = symbolFile(n.isMe ? ME : n.name);
  return file ? sym(file, cls) : esc(n.isMe ? 'Me' : n.name);
}

// Swap names inside notes for inline symbols: full names, plus first names that
// only one person on the sheet has (so "Ivo" works if only one Ivo is on the sheet).
let nameRegex = null;
const nameToFile = new Map();
function buildNameRegex() {
  const firstCount = {};
  for (const p of data.nodes) if (!p.isMe) { const f = p.name.split(/\s+/)[0]; firstCount[f] = (firstCount[f] || 0) + 1; }
  for (const [key, file] of Object.entries(CONFIG.symbols || {})) {
    if (key === 'me') continue;
    nameToFile.set(key, file);
    const first = key.split(/\s+/)[0];
    if (first !== key && firstCount[first] === 1) nameToFile.set(first, file);
  }
  const keys = [...nameToFile.keys()].sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  nameRegex = keys.length ? new RegExp(`\\b(${keys.join('|')})\\b`, 'g') : null;
}
// Words in notes that give too much away (a school, say) are swapped for plain ones: CONFIG.redact.
const redact = text => Object.entries(CONFIG.redact || {}).reduce((t, [word, plain]) => t.replace(new RegExp(`\\b${word}\\b`, 'g'), plain), text);
const withSymbols = text => (nameRegex ? esc(redact(text)).replace(nameRegex, m => sym(nameToFile.get(m), 'sym-inline')) : esc(redact(text)));

const statusName = s => (s === 'ended badly' ? 'cut' : s);   // shown as "cut" everywhere
const imageSrc = v => (/^(https?:)?\/\//.test(v) || v.includes('/') ? v : CONFIG.artifactsPath + v);

function open(html, target) {
  body.innerHTML = html;
  panel.hidden = false;
  panel.scrollTop = 0;
  document.body.classList.add('panel-open');
  backBtn.hidden = trail.length < 2;
  select(target);
  body.querySelectorAll('[data-person]').forEach(b => b.addEventListener('click', () => {
    showPerson(data.nodes.find(n => n.id === b.dataset.person));
  }));
}

export function hidePanel() {
  panel.hidden = true;
  trail.length = 0;
  document.body.classList.remove('panel-open');
  select(null);
}

// ---------- wandering: every person or string you open is remembered, so Back retraces your path ----------

const backBtn = panel.querySelector('.back');
const trail = [];
const draw = t => (t.a ? linkCard(t) : t.isMe ? meCard() : personCard(t));
function go(target) {
  if (trail.at(-1) !== target) trail.push(target);
  draw(target);
}
export const showPerson = p => go(p);
export const showFriendLink = l => go(l);
export const showMe = () => go(data.nodes[0]);
function back() {
  trail.pop();
  trail.length ? draw(trail.at(-1)) : hidePanel();
}

// ---------- the cards, set like entries in a star catalog ----------


// A tiny orbit diagram: the sun, the five closeness rings, this body's ring and where they sit on it.
// The orbit drawn on every card, the same way each time:
//   the five rings are closeness (inner circle nearest Zara's star); theirs is drawn in their color
//   the trail behind their dot is how often you talk: the longer it is, the more often (like orbiting faster)
//   a hollow dot sits on the ring they were on at your closest; a dashed ring means the friendship was cut,
//   and everything goes paler as a friendship fades. The star's color is where things stand now:
//   gold when close, lighter as it eases or fades, a cool gray if it was cut.
// Their dot always sits down and to the left of the star, the part of the drawing that shows on the card.
const STAR = { close: '#d9a93a', steady: '#e6c26a', fading: '#efd9a0', faded: '#d9d2c2', 'ended badly': '#9a96a8' };
function orbitDiagram(p) {
  const r = i => 6 + i * 7.5;
  const at = (rad, ang) => `${(46 + Math.cos(ang) * rad).toFixed(2)} ${(46 + Math.sin(ang) * rad).toFixed(2)}`;
  const a = 2.05 + Math.sin((p.angle ?? 0) * 13.7) * 0.18, ri = r(p.layer_now), rp = r(p.layer_peak);
  const trail = p.talk_frequency * 0.42, steps = 8;
  const segs = trail > 0 ? Array.from({ length: steps }, (_, k) => {
    const a0 = a + trail * k / steps, a1 = a + trail * (k + 1) / steps;
    return `<path d="M${at(ri, a0)} A${ri} ${ri} 0 0 1 ${at(ri, a1)}" class="trail" style="opacity:${(1 - k / steps) * 0.9}"/>`;
  }).join('') : '';
  const fade = p.status === 'fading' || p.status === 'faded';
  const title = `${cap(CLOSENESS_WORDS[p.layer_now])}${p.layer_peak < p.layer_now ? `, once ${CLOSENESS_WORDS[p.layer_peak]}` : ''}. We talk ${FREQ_WORDS[p.talk_frequency]}.${p.status === 'ended badly' ? ' Cut.' : ''}`;
  return `<svg class="mini-orbit${fade ? ' pale' : ''}" viewBox="0 0 92 92" role="img" aria-label="${title}" style="--c:${CONFIG.groups[p.group] ?? 'currentColor'}"><title>${title}</title>
    ${[1, 2, 3, 4, 5].map(i => `<circle cx="46" cy="46" r="${r(i)}" class="${i === p.layer_now ? `on${p.status === 'ended badly' ? ' cut' : ''}` : ''}"/>`).join('')}
    ${segs}
    ${p.layer_peak < p.layer_now ? `<circle cx="${46 + Math.cos(a) * rp}" cy="${46 + Math.sin(a) * rp}" r="2.4" class="was"/>` : ''}
    <use href="#i-zstar" x="40" y="40" width="12" height="12" class="sun" style="color:${STAR[p.status] ?? STAR.close}"/>
    <circle cx="${46 + Math.cos(a) * ri}" cy="${46 + Math.sin(a) * ri}" r="3.4" class="body${fade ? ' hollow' : ''}"/>
  </svg>`;
}

const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// A tie: their symbol in a small ring, or their name as a plain tag if they have no symbol.
function tie(t) {
  const file = symbolFile(t.name);
  return `<button data-person="${esc(t.id)}" class="${file ? 'tie' : 'tie named'}" title="${esc(t.name)}">${file ? who(t) : esc(t.name)}</button>`;
}

function personCard(p) { open(personHTML(p), p); }

// Cards: the person's symbol stamped in the top left, their orbit drawn large in the top right and
// running off the edge, then their words, then one plain line about where things stand.
const stamp = (n, color) => `<div class="card-stamp" style="--c:${color}">${symbolFile(n.isMe ? ME : n.name) ? who(n, 'sym-stamp') : `<span class="card-name">${esc(n.name)}</span>`}</div>`;
const orbitBack = p => `<div class="card-orbit" aria-hidden="true">${orbitDiagram(p)}</div>`;
const STATUS_LINE = { steady: '', fading: 'Fading.', faded: 'Faded.', 'ended badly': 'Cut.' };
const wash = color => `<div class="card-wash" style="--c:${color}" aria-hidden="true"></div>`;

// The card itself, also used by the deck of cards.
export function personHTML(p) {
  const ties = data.links.filter(l => l.kind === 'friend' && (l.a === p || l.b === p)).map(l => (l.a === p ? l.b : l.a));
  return `
    ${wash(CONFIG.groups[p.group])}
    ${orbitBack(p)}
    <div class="card-head" style="--c:${CONFIG.groups[p.group]}">${p.year_met ? `<p class="card-est">est. ${p.year_met}</p>` : ''}${stamp(p, CONFIG.groups[p.group])}</div>
    ${p.artifact_image ? `<img class="panel-img" src="${esc(imageSrc(p.artifact_image))}" alt="">` : ''}
    ${p.artifact_quote ? `<blockquote>${esc(p.artifact_quote)}</blockquote>` : ''}
    ${p.note ? `<p class="note">${withSymbols(p.note)}</p>` : ''}
    ${ties.length ? `<div class="card-foot"><div class="ties">${ties.map(tie).join('')}</div></div>` : ''}
  `;
}

// A string between two friends: their two stamps side by side, joined by a line in the string's color
// (halfway between their two colors). Close friends get a heavy line, friends a lighter one,
// acquaintances a dotted one; a cut string is broken in the middle, a fading one paler.
const blendHex = (c1, c2) => '#' + [1, 3, 5].map(i => Math.round((parseInt(c1.slice(i, i + 2), 16) + parseInt(c2.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, '0')).join('');

function linkCard(l) {
  const ca = CONFIG.groups[l.a.group], cb = CONFIG.groups[l.b.group];
  const fade = l.status === 'fading' || l.status === 'faded';
  const word = `${STRENGTH_NAMES[l.strength]}${STATUS_LINE[l.status] ? `, ${STATUS_LINE[l.status].replace('.', '').toLowerCase()}` : ''}`;
  open(`
    <div class="card-wash" style="--c:${ca};--c2:${cb}" aria-hidden="true"></div>
    <div class="pair-row${fade ? ' pale' : ''}">
      <button class="pair-person" data-person="${esc(l.a.id)}" aria-label="Open their card">${stamp(l.a, ca)}</button>
      <div class="pair-link s${l.strength}${l.cut ? ' cut' : ''}" style="--c:${blendHex(ca, cb)}" role="img" aria-label="${word}"><i></i><span>${word}</span></div>
      <button class="pair-person" data-person="${esc(l.b.id)}" aria-label="Open their card">${stamp(l.b, cb)}</button>
    </div>
  `, l);
}

// Zara's own card: just her symbol, large, in gold foil-gold.
function meCard() {
  const me = data.nodes[0];
  open(`<div class="me-card">${stamp(me, LOOK_GOLD)}</div>`, me);
}
const LOOK_GOLD = '#d9a93a';

// graph = { nodes, links }; onSelect(person | string | null) tells the 3D view what's being explored.
export function initPanel(graph, onSelect) {
  data = graph;
  select = onSelect;
  buildNameRegex();
  panel.querySelector('.close').addEventListener('click', hidePanel);
  backBtn.addEventListener('click', back);
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) hidePanel(); });
}
