// Keyboard + touch input. Gameplay reads a snapshot each simulation step.

const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createInput({ joystick, knob, actionBtn, actionKeys, onPause, isActive }) {
  const held = new Set();
  let stick = { x: 0, y: 0 };
  let stickPointer = null;
  let actionPointer = null;
  let actionQueued = false;
  let actionHeld = false;

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
    joystick.setPointerCapture(e.pointerId);
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
    actionBtn.setPointerCapture(e.pointerId);
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

  return {
    // Returns normalized movement and consumes a queued action press.
    read() {
      let x = stick.x, y = stick.y;
      for (const code of held) { x += MOVE_KEYS[code][0]; y += MOVE_KEYS[code][1]; }
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      const action = actionQueued;
      actionQueued = false;
      return { x, y, action, actionHeld };
    },
    clear() {
      held.clear();
      releaseStick();
      releaseAction();
      actionQueued = false;
    },
  };
}
