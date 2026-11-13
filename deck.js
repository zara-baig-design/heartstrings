// The deck: every person's card in a row you can swipe (or arrow) through, closest friends first.
import { personHTML } from './panel.js?v=1794562701';

const deck = document.getElementById('deck');
const track = deck.querySelector('.deck-track');
const count = deck.querySelector('.deck-count');
let people = [];

const cards = () => [...track.children];
const current = () => {   // the card nearest the middle of the track
  const mid = track.scrollLeft + track.clientWidth / 2;
  let best = 0, bestD = Infinity;
  cards().forEach((c, i) => { const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid); if (d < bestD) { bestD = d; best = i; } });
  return best;
};
const goTo = (i, smooth = true) => {
  const c = cards()[Math.max(0, Math.min(people.length - 1, i))];
  if (c) track.scrollTo({ left: c.offsetLeft + c.offsetWidth / 2 - track.clientWidth / 2, behavior: smooth ? 'smooth' : 'auto' });
};
const update = () => { count.textContent = `${current() + 1} / ${people.length}`; };

export function initDeck(data) {
  people = data.nodes.filter(n => !n.isMe).sort((a, b) => a.layer_now - b.layer_now || a.name.localeCompare(b.name));
  track.innerHTML = people.map(p => `<article class="deck-card">${personHTML(p)}</article>`).join('');
  track.addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  track.addEventListener('click', e => {
    const tie = e.target.closest('[data-person]');   // a friend on the card: jump to their card
    if (tie) goTo(people.findIndex(p => p.id === tie.dataset.person));
  });
  deck.querySelector('.deck-prev').addEventListener('click', () => goTo(current() - 1));
  deck.querySelector('.deck-next').addEventListener('click', () => goTo(current() + 1));
  deck.addEventListener('click', e => { if (!e.target.closest('.deck-card, .deck-nav')) closeDeck(); });   // tap outside the cards to close
  document.getElementById('deck-btn').addEventListener('click', openDeck);
  addEventListener('keydown', e => {
    if (deck.hidden) return;
    if (e.key === 'Escape') closeDeck();
    if (e.key === 'ArrowRight') goTo(current() + 1);
    if (e.key === 'ArrowLeft') goTo(current() - 1);
  });
}

function openDeck() {
  deck.hidden = false;
  document.body.classList.add('deck-open');
  goTo(0, false);
  update();
}
function closeDeck() {
  deck.hidden = true;
  document.body.classList.remove('deck-open');
}
