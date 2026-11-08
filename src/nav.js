// Arrow-key and TV-remote navigation for menus. The arrows move focus to the nearest control in
// that direction on whatever is on top (a dialog, or the current screen); Enter presses it, as
// buttons already do; a remote's Back key goes back. During play the arrows belong to the game.

const DIRS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
const BACK_KEYS = new Set(['GoBack', 'BrowserBack', 'XF86Back', 'Back']);
const FOCUSABLE = 'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

const typing = () => {
  const el = document.activeElement;
  return el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');
};

export function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) =>
    !el.disabled && !el.closest('[hidden]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
}

// The closest control whose centre lies ahead in the direction (dx, dy); straying sideways costs more.
export function nearestInDirection(from, items, [dx, dy]) {
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const vx = b.left + b.width / 2 - ax, vy = b.top + b.height / 2 - ay;
    const along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const score = along + Math.abs(vx * dy - vy * dx) * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  return best;
}

export function setupMenuNav({ layer, onBack, onKeyboard }) {
  document.addEventListener('keydown', (e) => {
    const root = layer();
    if (!root) return;
    if (BACK_KEYS.has(e.key) || (e.key === 'Backspace' && !typing())) {
      e.preventDefault();
      onBack();
      return;
    }
    const dir = DIRS[e.key];
    if (!dir) return;
    // Sliders and text boxes keep their own left and right.
    if (typing() && dir[1] === 0) return;
    const items = focusables(root);
    if (!items.length) return;
    e.preventDefault();
    onKeyboard();
    const cur = document.activeElement;
    const next = root.contains(cur) && items.includes(cur) ? nearestInDirection(cur, items, dir) : items[0];
    if (next) {
      next.focus();
      next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }, true);
}
