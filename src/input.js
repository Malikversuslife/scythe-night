// Keyboard + touch input. Gameplay reads a snapshot each simulation step.

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

// Capture can throw if the pointer is already gone; input must keep working regardless.
function capture(el, id) {
  try { el.setPointerCapture(id); } catch { /* pointer no longer active */ }
}

export function createInput({ joystick, knob, actionBtn, skillBtn, weaponBtn, surface, actionKeys, attackKeys, onPause, isActive }) {
  const held = new Set();
  let stick = { x: 0, y: 0 };
  let stickPointer = null;
  let actionPointer = null;
  let actionQueued = false;
  let actionHeld = false;
  let skillQueued = false;
  let attackQueued = false;

  // ---- Keyboard ----
  window.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      onPause();
      return;
    }
    if (MOVE_KEYS[e.code]) {
      e.preventDefault();
      held.add(e.code);
    } else if (e.code === 'KeyK') {
      e.preventDefault();
      if (!e.repeat) skillQueued = true;
    } else if (attackKeys().includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) attackQueued = true;
    } else if (actionKeys().includes(e.code)) {
      e.preventDefault();
      if (!e.repeat) actionQueued = true;
    }
  });
  window.addEventListener('keyup', (e) => { held.delete(e.code); });

  // ---- Joystick ----
  const RADIUS = 44;
  function stickFrom(e) {
    const r = joystick.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const mag = Math.min(1, len / RADIUS);
    // Small dead zone so a resting thumb does not drift.
    if (mag < 0.18) { stick = { x: 0, y: 0 }; return; }
    stick = { x: dx / RADIUS, y: dy / RADIUS };
  }
  function releaseStick() {
    stickPointer = null;
    stick = { x: 0, y: 0 };
    knob.style.transform = '';
  }
  joystick.addEventListener('pointerdown', (e) => {
    if (!isActive() || stickPointer !== null) return;
    e.preventDefault();
    stickPointer = e.pointerId;
    capture(joystick, e.pointerId);
    stickFrom(e);
  });
  joystick.addEventListener('pointermove', (e) => { if (e.pointerId === stickPointer) stickFrom(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    joystick.addEventListener(ev, (e) => { if (e.pointerId === stickPointer) releaseStick(); });
  }

  // ---- Action button (pointer for touch, click for keyboard/AT activation) ----
  actionBtn.addEventListener('pointerdown', (e) => {
    if (!isActive() || actionPointer !== null) return;
    e.preventDefault();
    actionPointer = e.pointerId;
    capture(actionBtn, e.pointerId);
    actionBtn.classList.add('pressed');
    actionQueued = true;
    actionHeld = true;
  });
  const releaseAction = (e) => {
    if (e && e.pointerId !== actionPointer) return;
    actionPointer = null;
    actionHeld = false;
    actionBtn.classList.remove('pressed');
  };
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) actionBtn.addEventListener(ev, releaseAction);
  // Keyboard Enter/Space on the focused button produces a click with detail 0.
  actionBtn.addEventListener('click', (e) => { if (e.detail === 0 && isActive()) actionQueued = true; });

  // ---- Skill button ----
  skillBtn.addEventListener('pointerdown', (e) => {
    if (!isActive()) return;
    e.preventDefault();
    skillBtn.classList.add('pressed');
    skillQueued = true;
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) skillBtn.addEventListener(ev, () => skillBtn.classList.remove('pressed'));
  skillBtn.addEventListener('click', (e) => { if (e.detail === 0 && isActive()) skillQueued = true; });

  // ---- Weapon button (Last Survivor) ----
  weaponBtn.addEventListener('pointerdown', (e) => {
    if (!isActive()) return;
    e.preventDefault();
    weaponBtn.classList.add('pressed');
    attackQueued = true;
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) weaponBtn.addEventListener(ev, () => weaponBtn.classList.remove('pressed'));
  weaponBtn.addEventListener('click', (e) => { if (e.detail === 0 && isActive()) attackQueued = true; });

  // Joystick + action at once is two fingers, which mobile browsers read as a pinch,
  // and fast taps read as double-tap zoom. Cancel the browser's own touch handling over
  // the play area and controls (pointer events still arrive); HUD buttons keep theirs.
  const isGameTouch = (e) => !e.target.closest('.hud, .overlay');
  const block = (e) => { if (isGameTouch(e)) e.preventDefault(); };
  for (const ev of ['touchstart', 'touchmove', 'touchend']) surface.addEventListener(ev, block, { passive: false });
  // Safari's proprietary pinch events.
  for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(ev, (e) => { if (isActive() || surface.contains(e.target)) e.preventDefault(); }, { passive: false });
  }

  return {
    // Returns normalized movement and consumes a queued action press.
    read() {
      let x = stick.x, y = stick.y;
      for (const code of held) { x += MOVE_KEYS[code][0]; y += MOVE_KEYS[code][1]; }
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      const action = actionQueued, skill = skillQueued, attack = attackQueued;
      actionQueued = false;
      skillQueued = false;
      attackQueued = false;
      return { x, y, action, actionHeld, skill, attack };
    },
    clear() {
      held.clear();
      releaseStick();
      releaseAction();
      actionQueued = false;
      skillQueued = false;
      attackQueued = false;
      skillBtn.classList.remove('pressed');
      weaponBtn.classList.remove('pressed');
    },
  };
}
