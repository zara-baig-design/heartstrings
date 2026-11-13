// The front page: just the title. Tap (or press Enter) anywhere to go in.

const front = document.getElementById('front');
export function initFront(onEnter) {
  const enter = () => {
    if (front.classList.contains('gone')) return;
    front.classList.add('gone');
    document.body.classList.remove('on-front');
    onEnter?.();
  };
  front.addEventListener('click', () => enter());
  addEventListener('keydown', e => { if (e.key === 'Enter' && !front.classList.contains('gone')) enter(); });
  if (location.hash === '#atlas') enter();   // skip the front page, handy while working
}

export function showFront() {
  front.classList.remove('gone');
  document.body.classList.add('on-front');
}
