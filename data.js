// Reads the spreadsheet CSVs and turns them into people (nodes) and strings (links).
// Nothing in here draws anything.
import { Color } from 'three';
import { CONFIG } from './config.js?v=1794562833';

export const ME = CONFIG.centerName;
// close = strong bond (however often you talk) · steady = chill, nothing changing ·
// fading = actively growing apart · faded = already grew apart · ended badly = cut.
export const STATUSES = ['close', 'steady', 'fading', 'faded', 'ended badly'];
export const RING_NAMES = ['', 'inner 5', 'ring of 15', 'ring of 50', 'ring of 150', 'acquaintances'];
// The spreadsheet can use these words or the numbers they stand for (their position in the list).
export const CLOSENESS_WORDS = ['', 'inner circle', 'close friend', 'good friend', 'friendly', 'acquaintance'];
export const FREQ_WORDS = ['not anymore', 'once in a while', 'every month', 'every week', 'a few times a week', 'every day'];
export const STRENGTH_NAMES = ['', 'acquaintances', 'friends', 'close'];

// SPREAD only changes how roomy the website looks.
export const SPREAD = CONFIG.spread ?? 1.5;
export const FLOOR = (-CONFIG.liftRange - 30) * SPREAD;   // height the rings are drawn at

export const STATUS_FADE = { close: 0, steady: 1 / 3, fading: 0.5, faded: 1 };   // share of gray in a string
const STRAND_WIDTH = 0.4;
const GRAY = '#c7bedb';            // fading strands: soft lavender gray
const BLACK = '#3a2450';           // ended badly: deep plum
const FRIEND_STRING = '#c9b6ec';   // friend-to-friend: lilac

const logMiles = m => 40 + 55 * Math.log10(1 + m);
export const MODES = {
  closeness: {
    blurb: 'Distance from me = Dunbar ring. Each ring holds about 3× the one inside it: 5, 15, 50, 150.',
    // era 'then' = where they sat at our closest (closeness_at_peak), 'now' = closeness_now
    radius: (p, era) => [0, 55, 105, 155, 205, 265][era === 'then' ? p.layer_peak : p.layer_now],
    rings: [[55, '5'], [105, '15'], [155, '50'], [205, '150'], [265, 'acquaintances']],
  },
  frequency: {
    blurb: 'Distance from me = how often we talk. The connections that fire most sit closest.',
    radius: p => [275, 225, 175, 125, 85, 50][p.talk_frequency],
    rings: [[50, 'daily'], [85, 'few times a week'], [125, 'weekly'], [175, 'monthly'], [225, 'yearly'], [275, 'never']],
  },
  geography: {
    blurb: 'Distance from me = how far away they live (each ring is 10× farther).',
    radius: p => logMiles(p.miles_away),
    rings: [[logMiles(0), 'same city'], [logMiles(10), '10 mi'], [logMiles(100), '100 mi'], [logMiles(1000), '1,000 mi'], [logMiles(10000), '10,000 mi']],
  },
};

// ---------- small helpers ----------

export const str = v => (v ?? '').toString().trim();
export const esc = s => str(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, fallback) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fallback; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
const mix = (a, b, t) => '#' + new Color(a).lerp(new Color(b), t).getHexString();

export function stringColor(group, status) {
  return status === 'ended badly' ? BLACK : mix(CONFIG.groups[group], GRAY, STATUS_FADE[status] ?? 0);
}

// CSV text → list of rows keyed by lower-case header. Handles quotes and line breaks inside cells.
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const keys = (rows.shift() || []).map(h => h.trim().toLowerCase());
  return rows.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ''])));
}

export function toCsv(rows) {
  const cell = v => (/[",\n]/.test(v = String(v ?? '')) ? `"${v.replaceAll('"', '""')}"` : v);
  const keys = Object.keys(rows[0] || {});
  return [keys, ...rows.map(r => keys.map(k => r[k]))].map(r => r.map(cell).join(',')).join('\n');
}

async function loadCsv(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Couldn't load ${url} (${res.status})`);
  return parseCsv(await res.text());
}

// ---------- people ----------

const statusOf = v => {
  const s = str(v).toLowerCase();
  return s === 'dormant' ? 'steady' : STATUSES.includes(s) ? s : null;
};

// Reads a number or one of the words in `words`, e.g. "every week" → 3.
function scale(value, words, lo, hi, fallback) {
  const v = str(value).toLowerCase();
  if (!v) return fallback;
  if (Number.isFinite(parseFloat(v))) return clamp(parseFloat(v), lo, hi);
  const i = words.findIndex(w => w && (w === v || v.includes(w) || w.includes(v)));
  return i >= 0 ? clamp(i, lo, hi) : fallback;
}

function normalizePerson(row) {
  const layer = scale(row.closeness_now ?? row.layer_now, CLOSENESS_WORDS, 1, 5, 5);
  const group = str(row.group).toLowerCase();
  return {
    id: str(row.name),
    name: str(row.name),
    group: group in CONFIG.groups ? group : Object.keys(CONFIG.groups).at(-1),
    layer_now: layer,
    layer_peak: scale(row.closeness_at_peak ?? row.layer_peak, CLOSENESS_WORDS, 1, 5, layer),
    talk_frequency: scale(row.how_often_we_talk ?? row.talk_frequency, FREQ_WORDS, 0, 5, 0),
    miles_away: Math.max(0, num(row.miles_away, 0)),
    city: str(row.city),
    year_met: num(row.year_met, null),
    status: statusOf(row.status) ?? 'close',
    connected_to: str(row.connected_to),
    subgroup: str(row['college group'] ?? row.college_group ?? row.subgroup),
    artifact_image: str(row.artifact_image),
    artifact_quote: str(row.artifact_quote),
    note: str(row.note),
    physical: /^(true|yes|y|1|x|✓|✔)$/i.test(str(row['physical installation?'] ?? row.physical)),
  };
}

// Angles stay fixed across layouts, so switching modes only moves people in and out.
// People in the same ring are spread evenly around it (in group order, so groups stay
// together), each ring is rotated by the golden angle so neighbors in different rings
// don't line up, and heights alternate middle / up / down.
function assignAngles(people) {
  const order = Object.keys(CONFIG.groups);
  const rings = new Map();
  for (const p of people) {
    if (!rings.has(p.layer_now)) rings.set(p.layer_now, []);
    rings.get(p.layer_now).push(p);
  }
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const LIFTS = [0, 0.75, -0.75];
  for (const [layer, members] of rings) {
    members.sort((x, y) => (order.indexOf(x.group) - order.indexOf(y.group)) || x.name.localeCompare(y.name));
    const offset = -Math.PI / 2 + layer * GOLDEN;
    members.forEach((p, i) => {
      p.angle = offset + (Math.PI * 2 * i) / members.length;
      p.lift = LIFTS[i % 3] * CONFIG.liftRange * (members.length > 2 ? 1 : 0.5);
    });
  }
}

// Where a person sits in a given layout.
export function targetPosition(n, mode, era = 'now') {
  if (n.isMe) return { x: 0, y: 0, z: 0 };
  const r = MODES[mode].radius(n, era) * SPREAD;
  return { x: r * Math.cos(n.angle), y: n.lift * SPREAD, z: r * Math.sin(n.angle) };
}

// ---------- strings ----------

// Words that set how strong a friend-to-friend string is, when they're on their own in the brackets.
function strengthOf(tag) {
  if (/^a?c?quaint/.test(tag) || tag === 'barely') return 1; // also catches "aquaintances" etc.
  if (['friend', 'friends', 'good friend', 'good friends'].includes(tag)) return 2;
  if (['close', 'close friend', 'close friends', 'best friend', 'best friends'].includes(tag)) return 3;
  return null;
}

// Splits "Ivo (close, neighbors), Juno" into entries on commas, semicolons or
// new lines, ignoring the commas inside brackets.
function splitConnections(text) {
  const entries = [];
  let depth = 0, cur = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[,;\n]/.test(ch)) { entries.push(cur); cur = ''; } else cur += ch;
  }
  entries.push(cur);
  return entries.map(e => e.trim()).filter(Boolean).map(e => {
    const open = e.indexOf('(');
    if (open < 0) return { name: e, tags: '' };
    return { name: e.slice(0, open).trim(), tags: e.slice(open + 1, e.lastIndexOf(')') > open ? e.lastIndexOf(')') : undefined) };
  });
}

// Every link is { a, b, kind: 'me' | 'friend', color, width, cut, ... } where a and b are nodes.
// For 'me' links a is the center node and b (also .person) is the friend.
function buildGraph(peopleRows, linkRows) {
  const people = peopleRows.map(normalizePerson).filter(p => p.name && p.name.toLowerCase() !== ME.toLowerCase());
  const byName = new Map(people.map(p => [p.name.toLowerCase(), p]));
  assignAngles(people);

  const me = { id: ME, name: ME, isMe: true, lift: 0 };
  const links = people.map(p => ({
    a: me, b: p, kind: 'me', person: p,
    color: stringColor(p.group, p.status),
    width: STRAND_WIDTH * (p.talk_frequency + 1),   // thicker = we talk more often
    cut: p.status === 'ended badly',
  }));

  // Friend-to-friend strings come from each person's connected_to cell,
  // e.g. "Ivo (close, grew up on the same street), Juno, Lou (barely, ended badly)".
  // Inside the brackets, strength/status words set the string; anything else is the note.
  // The optional Links tab can also add a note or override strength/status.
  const missing = new Set();
  const pairs = new Map();
  const pairFor = (nameA, nameB) => {
    const a = byName.get(str(nameA).toLowerCase());
    const b = byName.get(str(nameB).toLowerCase());
    if (!a) missing.add(str(nameA));
    if (!b) missing.add(str(nameB));
    if (!a || !b || a === b) return null;
    const key = [a.id, b.id].sort().join('\u0000');
    if (!pairs.has(key)) pairs.set(key, { a, b, strength: 2, status: 'close', note: '' });
    return pairs.get(key);
  };
  for (const p of people) {
    for (const { name, tags } of splitConnections(p.connected_to)) {
      const pair = pairFor(p.name, name);
      if (!pair) continue;
      const noteParts = [];
      for (const part of tags.split(',').map(t => t.trim()).filter(Boolean)) {
        const tag = part.toLowerCase();
        if (strengthOf(tag)) pair.strength = strengthOf(tag);
        else if (statusOf(tag)) pair.status = statusOf(tag);
        else noteParts.push(part);
      }
      const note = noteParts.join(', ');
      if (note && !pair.note.includes(note)) pair.note = pair.note ? `${pair.note} · ${note}` : note;
    }
  }
  for (const row of linkRows) {
    const pair = pairFor(row.person_a, row.person_b);
    if (!pair) continue;
    if (statusOf(row.status)) pair.status = statusOf(row.status);
    if (str(row.strength)) pair.strength = clamp(num(row.strength, 2), 1, 3);
    if (str(row.note)) pair.note = str(row.note);
  }
  for (const pair of pairs.values()) {
    const cut = pair.status === 'ended badly';
    links.push({
      ...pair, kind: 'friend', cut,
      color: cut ? BLACK : mix(FRIEND_STRING, GRAY, STATUS_FADE[pair.status] ?? 0),
      width: STRAND_WIDTH * pair.strength,
    });
  }
  missing.delete('');
  return { nodes: [me, ...people], links, missing: [...missing] };
}

export async function loadGraph() {
  const [peopleRows, linkRows] = await Promise.all([
    loadCsv(CONFIG.peopleCsv),
    CONFIG.linksCsv ? loadCsv(CONFIG.linksCsv).catch(() => []) : [],   // the Links tab is optional
  ]);
  return buildGraph(peopleRows, linkRows);
}
