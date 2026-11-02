import { createStore } from './storage.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { KEEPER_IMAGES } from './render-keeper.js';
import { SURVIVOR_IMAGES } from './render-survivor.js';
import { createKeeperRun, stepKeeper, KEEPER } from './keeper.js';
import { createSurvivorRun, stepSurvivor, interactionTarget, taskIndex, TASKS } from './survivor.js';
import * as audio from './audio.js';

const $ = (id) => document.getElementById(id);
const app = $('app');

// ---------------- Campaign content ----------------

const CAMPAIGNS = {
  keeper: {
    title: 'Cemetery Keeper',
    sprite: 'assets/img/sprite-reaper.png',
    story: 'Pip finds the cracked bell of Hush Hollow swinging without sound. Green sparks flicker between the graves, and the restless dead are shuffling toward the city gate. A notice on the keeper’s hut reads: “One night. No escapes. Please mind the flowers.”',
    rules: [
      'Slash undead to free their lime-green souls, then walk over a soul to guide it home.',
      'You have <strong>3 health</strong>. Each hit costs one; you flash briefly after a hit.',
      'If <strong>3 undead</strong> reach the city gate at the bottom, the city falls.',
      'When a wave is cleared, touch the glowing <strong>seal</strong> to start the next. Seal all 3 waves to win.',
    ],
    controls: [
      'Move: left joystick, or <kbd>WASD</kbd> / arrow keys',
      'Slash (in the direction you face): scythe button, or <kbd>Space</kbd> / <kbd>J</kbd>',
      'Pause: top-right button, or <kbd>Esc</kbd> / <kbd>P</kbd>',
    ],
    actionKeys: ['Space', 'KeyJ'],
  },
  survivor: {
    title: 'Last Survivor',
    sprite: 'assets/img/sprite-survivor.png',
    story: 'Mara reaches an empty tram stop in Bellwick. The route board points to the dawn refuge, but its gate has no power. A handwritten note is pinned beneath it: “Bring the fuse. Ring the bell. We are still here.”',
    rules: [
      'You have <strong>no weapon</strong>. One touch from a zombie ends the run.',
      'Zombies see you inside their red circle if no wall is in the way. Break line of sight and they give up after a few seconds.',
      'Tasks in order: take the <strong>fuse</strong>, install it in the <strong>power box</strong>, ring the <strong>bell</strong>.',
      'Then step through the open <strong>refuge door</strong> to win. The amber ring and edge arrow show where to go.',
    ],
    controls: [
      'Move: left joystick, or <kbd>WASD</kbd> / arrow keys',
      'Interact when close: hand button, or <kbd>E</kbd> / <kbd>Space</kbd>',
      'Pause: top-right button, or <kbd>Esc</kbd> / <kbd>P</kbd>',
    ],
    actionKeys: ['KeyE', 'Space'],
  },
};

const ICONS = {
  scythe: '<svg viewBox="0 0 48 48"><path d="M30 6 L14 44" stroke="#181020" stroke-width="7" stroke-linecap="round"/><path d="M30 6 L14 44" stroke="#8a5a2b" stroke-width="3.5" stroke-linecap="round"/><path d="M29 8 C 40 6, 46 16, 42 26 C 39 18, 34 13, 27 13 Z" fill="#e7e3ef" stroke="#181020" stroke-width="3" stroke-linejoin="round"/></svg>',
  hand: '<svg viewBox="0 0 48 48"><path d="M17 26 V12 a3 3 0 0 1 6 0 V24 V9 a3 3 0 0 1 6 0 V24 V12 a3 3 0 0 1 6 0 V30 c0 8 -5 13 -12 13 c-6 0 -9 -3 -12 -8 l-5 -8 a3 3 0 0 1 5 -3 Z" fill="#ffd789" stroke="#181020" stroke-width="3" stroke-linejoin="round"/></svg>',
};

// ---------------- Boot ----------------

const IMAGE_SRC = {
  backdrop: 'assets/img/bg-cemetery.jpg',
  ...KEEPER_IMAGES,
  ...SURVIVOR_IMAGES,
};
const PRELOAD = ['assets/img/bg-cemetery.jpg', 'assets/img/title-logo.webp', 'assets/img/banner-tap.png',
  'assets/img/banner-select.png', 'assets/img/card-keeper.webp', 'assets/img/card-survivor.webp'];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(src));
    img.src = src;
  });
}

const images = {};
async function boot() {
  setState('boot');
  $('boot-retry').hidden = true;
  $('boot-status').textContent = 'Loading the graveyard…';
  try {
    const keys = Object.keys(IMAGE_SRC);
    const loaded = await Promise.all(keys.map((k) => loadImage(IMAGE_SRC[k])));
    keys.forEach((k, i) => { images[k] = loaded[i]; });
    // Menu art is non-blocking: the screens still work if one of these fails.
    await Promise.allSettled(PRELOAD.map(loadImage));
  } catch (err) {
    $('boot-status').textContent = `Could not load ${err.message}. Check your connection and try again.`;
    $('boot-retry').hidden = false;
    $('boot-retry').focus();
    return;
  }
  // The display font is optional; don't wait long for it.
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  renderer = createRenderer($('game-canvas'), images);
  goSplash();
}
$('boot-retry').addEventListener('click', boot);

// ---------------- Store & settings ----------------

const store = createStore();
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

function reducedMotion() {
  const m = store.data.settings.reducedMotion;
  return m === 'on' || (m === 'system' && motionQuery.matches);
}

function applySettings() {
  const s = store.data.settings;
  audio.setAudioSettings(s);
  app.classList.toggle('motion-ok', !reducedMotion());
  const sound = $('btn-splash-sound');
  const soundIcon = `assets/img/ui/icon-${s.muted ? 'mute' : 'sound'}.png`;
  sound.querySelector('img').src = soundIcon;
  sound.querySelector('span').textContent = s.muted ? 'Sound off' : 'Sound on';
  sound.setAttribute('aria-pressed', String(!s.muted));
  const hudSound = $('btn-hud-sound');
  hudSound.setAttribute('aria-pressed', String(!s.muted));
  hudSound.setAttribute('aria-label', s.muted ? 'Sound off' : 'Sound on');
  hudSound.querySelector('img').src = soundIcon;
  $('storage-note').hidden = store.available;
}
motionQuery.addEventListener?.('change', applySettings);

function syncSettingsForm() {
  const s = store.data.settings;
  $('set-music').value = s.music;
  $('set-sfx').value = s.sfx;
  $('out-music').textContent = s.music + '%';
  $('out-sfx').textContent = s.sfx + '%';
  $('set-mute').checked = s.muted;
  $('set-motion').value = s.reducedMotion;
}

$('set-music').addEventListener('input', (e) => { store.update((d) => { d.settings.music = +e.target.value; }); syncSettingsForm(); applySettings(); });
$('set-sfx').addEventListener('input', (e) => { store.update((d) => { d.settings.sfx = +e.target.value; }); syncSettingsForm(); applySettings(); });
$('set-sfx').addEventListener('change', () => audio.sfx.soul());
$('set-mute').addEventListener('change', (e) => { store.update((d) => { d.settings.muted = e.target.checked; }); applySettings(); });
$('set-motion').addEventListener('change', (e) => { store.update((d) => { d.settings.reducedMotion = e.target.value; }); applySettings(); });
$('btn-settings-close').addEventListener('click', () => closeOverlay());
$('btn-reset-data').addEventListener('click', async () => {
  if (!(await confirmDialog('Reset saved data?', 'This clears your best score, completed stories and settings on this device.', 'Reset'))) return;
  store.reset();
  syncSettingsForm();
  applySettings();
  refreshSelect();
  announce('Saved data reset.');
});

// ---------------- Screens & state machine ----------------

const SCREENS = {
  boot: 'screen-boot', splash: 'screen-splash', storySelect: 'screen-select', intro: 'screen-intro',
  playing: 'screen-game', paused: 'screen-game', victory: 'screen-results', defeat: 'screen-results',
};

let state = 'boot';
let campaign = 'keeper';
let run = null;
let renderer = null;

function setState(next) {
  state = next;
  const id = SCREENS[next];
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
  app.dataset.state = next;
}

function focusFirst(el) {
  const target = el.querySelector('[data-autofocus]') || el.querySelector('button:not([hidden]), [href], input, select');
  target?.focus({ preventScroll: true });
}

function goSplash() {
  setState('splash');
  $('screen-splash').scrollTop = 0;
  $('btn-play').focus();
}

function goSelect() {
  setState('storySelect');
  refreshSelect();
  $('screen-select').scrollTop = 0;
  document.querySelector(`.story-card[data-campaign="${campaign}"]`)?.focus({ preventScroll: true });
}

function refreshSelect() {
  $('select-best').textContent = store.data.keeperBest.toLocaleString();
  for (const b of document.querySelectorAll('[data-badge]')) b.hidden = !store.data.completed[b.dataset.badge];
}

function goIntro(which) {
  campaign = which;
  const c = CAMPAIGNS[which];
  $('intro-title').textContent = c.title;
  $('intro-sprite').src = c.sprite;
  $('intro-story').textContent = c.story;
  $('intro-rules').innerHTML = c.rules.map((r) => `<li>${r}</li>`).join('');
  $('intro-controls').innerHTML = c.controls.map((r) => `<li>${r}</li>`).join('');
  setState('intro');
  $('screen-intro').scrollTop = 0;
  $('btn-intro-start').focus({ preventScroll: true });
}

// Splash: tap anywhere (outside its small buttons) begins.
$('screen-splash').addEventListener('click', (e) => {
  if (e.target.closest('.splash-row')) return;
  audio.unlockAudio();
  audio.startMusic();
  audio.sfx.click();
  goSelect();
});
$('btn-splash-settings').addEventListener('click', () => { audio.unlockAudio(); openSettings(); });
$('btn-splash-sound').addEventListener('click', () => {
  audio.unlockAudio();
  store.update((d) => { d.settings.muted = !d.settings.muted; });
  applySettings();
  if (!store.data.settings.muted) audio.sfx.click();
});

$('btn-select-back').addEventListener('click', goSplash);
$('btn-select-settings').addEventListener('click', openSettings);
for (const card of document.querySelectorAll('.story-card')) {
  card.addEventListener('click', () => { audio.unlockAudio(); audio.startMusic(); audio.sfx.click(); goIntro(card.dataset.campaign); });
}
$('btn-intro-back').addEventListener('click', goSelect);
$('btn-intro-start').addEventListener('click', () => { audio.unlockAudio(); startRun(); });

// ---------------- Overlays (modal, focus-trapped) ----------------

const overlayStack = [];

function openOverlay(id, onClose) {
  const el = $(id);
  overlayStack.push({ el, returnTo: document.activeElement, onClose });
  el.hidden = false;
  focusFirst(el);
}

function closeOverlay() {
  const top = overlayStack.pop();
  if (!top) return;
  top.el.hidden = true;
  top.onClose?.();
  if (top.returnTo && document.contains(top.returnTo) && !top.returnTo.closest('[hidden]')) top.returnTo.focus({ preventScroll: true });
}

function openSettings() {
  syncSettingsForm();
  openOverlay('overlay-settings');
}

function confirmDialog(title, text, yesLabel = 'Yes') {
  return new Promise((resolve) => {
    $('confirm-title').textContent = title;
    $('confirm-text').textContent = text;
    $('btn-confirm-yes').textContent = yesLabel;
    let answer = false;
    const yes = () => { answer = true; closeOverlay(); };
    const no = () => closeOverlay();
    $('btn-confirm-yes').onclick = yes;
    $('btn-confirm-no').onclick = no;
    openOverlay('overlay-confirm', () => resolve(answer));
    $('btn-confirm-no').focus();
  });
}

document.addEventListener('keydown', (e) => {
  const top = overlayStack[overlayStack.length - 1];
  if (!top) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (top.el.id === 'overlay-pause') resume();
    else closeOverlay();
    return;
  }
  if (e.key === 'Tab') {
    const items = [...top.el.querySelectorAll('button, input, select, [href]')].filter((n) => !n.disabled && !n.closest('[hidden]'));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!top.el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
}, true);

// ---------------- Live announcements & toast ----------------

let lastAnnounce = '';
function announce(text, assertive = false) {
  const el = assertive ? $('live-assertive') : $('live');
  // Re-setting identical text would not be re-read; nudge it.
  el.textContent = text === lastAnnounce ? text + ' ' : text;
  lastAnnounce = text;
}

let toastTimer = null;
function toast(text, ms = 1500) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------------- Input ----------------

const input = createInput({
  joystick: $('joystick'),
  knob: $('joystick-knob'),
  actionBtn: $('btn-action'),
  surface: $('screen-game'),
  actionKeys: () => CAMPAIGNS[campaign].actionKeys,
  onPause: () => pause(),
  isActive: () => state === 'playing' && overlayStack.length === 0,
});

$('btn-pause').addEventListener('click', () => pause());
$('btn-hud-sound').addEventListener('click', () => {
  audio.unlockAudio();
  store.update((d) => { d.settings.muted = !d.settings.muted; });
  applySettings();
});

// ---------------- Runs ----------------

function startRun() {
  closeAllOverlays();
  run = campaign === 'keeper' ? createKeeperRun() : createSurvivorRun();
  hudCache = {};
  renderer.reset();
  setupHud();
  setState('playing');
  input.clear();
  accumulator = 0;
  lastFrame = performance.now();
  renderer.resize();
  audio.resumeAudio();
  audio.startMusic();
  if (campaign === 'keeper') {
    toast('Wave 1');
    announce('Cemetery Keeper. Wave 1 of 3. Stop the undead before they reach the gate.');
  } else {
    announce(`Last Survivor. ${TASKS[0].label}.`);
  }
  if (!store.data.tutorialSeen[campaign]) {
    store.update((d) => { d.tutorialSeen[campaign] = true; });
    showControls(true);
  } else {
    $('btn-action').focus({ preventScroll: true });
  }
}

function closeAllOverlays() {
  while (overlayStack.length) closeOverlay();
}

function pause() {
  if (state !== 'playing') return;
  setState('paused');
  input.clear();
  audio.suspendAudio();
  announce('Paused.');
  openOverlay('overlay-pause');
}

function resume() {
  if (state !== 'paused') return;
  closeAllOverlays();
  setState('playing');
  input.clear();
  lastFrame = performance.now();
  accumulator = 0;
  audio.resumeAudio();
  announce('Resumed.');
  $('btn-action').focus({ preventScroll: true });
}

function showControls(firstRun) {
  $('controls-list').innerHTML = CAMPAIGNS[campaign].controls.map((r) => `<li>${r}</li>`).join('');
  if (firstRun) {
    setState('paused');
    openOverlay('overlay-controls', () => {
      if (state === 'paused' && !overlayStack.length) {
        setState('playing');
        lastFrame = performance.now();
        accumulator = 0;
        input.clear();
        $('btn-action').focus({ preventScroll: true });
      }
    });
  } else {
    openOverlay('overlay-controls');
  }
}

$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', async () => {
  if (await confirmDialog('Restart?', 'Your current run will be lost.', 'Restart')) startRun();
});
$('btn-pause-controls').addEventListener('click', () => showControls(false));
$('btn-pause-settings').addEventListener('click', openSettings);
$('btn-pause-select').addEventListener('click', async () => {
  if (await confirmDialog('Leave this run?', 'Your current run will be lost.', 'Leave')) {
    closeAllOverlays();
    run = null;
    goSelect();
  }
});
$('btn-controls-close').addEventListener('click', () => closeOverlay());

// Background / blur freezes the run; it never resumes on its own.
function autoPause() {
  input.clear();
  if (state === 'playing') pause();
  if (document.hidden) audio.suspendAudio();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
  else if (state !== 'paused') audio.resumeAudio();
});
window.addEventListener('blur', autoPause);

// ---------------- HUD ----------------

let hudCache = {};
const TASK_ICONS = { fuse: 'fuse', power: 'powerbox-on', bell: 'bell-frame' };
function setHtml(el, key, html) {
  if (hudCache[key] === html) return;
  hudCache[key] = html;
  el.innerHTML = html;
}

function setupHud() {
  const icon = $('action-icon');
  const btn = $('btn-action');
  if (campaign === 'keeper') {
    icon.innerHTML = ICONS.scythe;
    btn.setAttribute('aria-label', 'Slash (Space or J)');
  } else {
    icon.innerHTML = ICONS.hand;
    btn.setAttribute('aria-label', 'Interact (E or Space)');
  }
}

function updateHud() {
  if (!run) return;
  const hudH = $('hud').offsetHeight;
  if (hudCache.hudH !== hudH) { hudCache.hudH = hudH; $('hud-sub').style.top = `${hudH}px`; }
  if (run.campaign === 'keeper') {
    const hearts = Array.from({ length: KEEPER.maxHealth }, (_, i) =>
      `<img src="assets/img/v2/heart-${i < run.health ? 'full' : 'empty'}.png" alt="">`).join('');
    const warn = run.breaches >= KEEPER.maxBreaches - 1 ? ' warn' : '';
    setHtml($('hud-left'), 'left',
      `<div class="score-panel"><img src="assets/img/v2/hud-lantern.png" alt=""><div><strong>${run.score.toLocaleString()}</strong><span>Score</span></div></div>` +
      `<div class="hud-row"><div class="heart-row" role="img" aria-label="Health ${run.health} of ${KEEPER.maxHealth}">${hearts}</div>` +
      `<div class="hud-chip breach${warn}" aria-label="Gate breaches ${run.breaches} of ${KEEPER.maxBreaches}"><span class="lbl">Gate</span>${run.breaches}/${KEEPER.maxBreaches}</div></div>`);
    setHtml($('hud-stats'), 'stats',
      `<div class="wave-box"><span class="lbl">WAVE</span><strong>${run.wave + 1}/${KEEPER.waves.length}</strong></div>` +
      `<div class="hud-chip" aria-label="Undead left this wave">💀 ${run.queue + run.enemies.length}</div>`);
    let goal;
    if (run.phase === 'seal') goal = 'Wave clear! Touch the glowing seal ✦';
    else if (run.phase === 'intermission') goal = 'Next wave incoming…';
    else goal = `${run.queue + run.enemies.length} undead left this wave`;
    setHtml($('hud-sub'), 'sub', `<span style="color:var(--soul)">Souls freed ${run.stats.souls}</span> · ${goal}`);
    const ready = run.cooldown === 0;
    $('btn-action').classList.toggle('cooldown', !ready);
    setHtml($('action-label'), 'act', 'Slash');
  } else {
    const i = taskIndex(run);
    const label = i >= 0 ? TASKS[i].label : 'Enter the refuge door';
    const icon = i >= 0 ? TASK_ICONS[TASKS[i].id] : 'door-open';
    const doneCount = TASKS.filter((t) => run.done[t.id]).length;
    const steps = TASKS.map((t) =>
      `<span class="task-step${run.done[t.id] ? ' done' : ''}" title="${t.short}"><img src="assets/img/v2/${TASK_ICONS[t.id]}.png" alt=""></span>`).join('');
    setHtml($('hud-left'), 'left',
      `<div class="score-panel task-panel"><img src="assets/img/v2/${icon}.png" alt=""><div><span>Current task</span><strong>${label}</strong></div></div>` +
      `<div class="hud-row" role="img" aria-label="Tasks done ${doneCount} of ${TASKS.length}">${steps}</div>`);
    const t = Math.floor(run.time);
    setHtml($('hud-stats'), 'stats', `<div class="wave-box"><span class="lbl">TIME</span><strong>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</strong></div>`);
    const it = interactionTarget(run);
    const btn = $('btn-action');
    btn.setAttribute('aria-disabled', String(!(it && it.enabled)));
    setHtml($('action-label'), 'act', it ? it.hint : 'Interact');
    const hunted = run.zombies.some((z) => z.state === 'chase');
    setHtml($('hud-sub'), 'sub', run.doorOpen ? 'The refuge is open! Get inside.' : hunted ? '<span style="color:#ff8a8a">You’ve been spotted — break line of sight!</span>' : 'One touch and you’re caught.');
  }
}

// ---------------- Events from the simulation ----------------

let stepSoundTimer = 0;
function handleEvents(events) {
  for (const ev of events) {
    renderer.event(ev, run);
    switch (ev.type) {
      case 'slash': audio.sfx.slash(); break;
      case 'defeat': audio.sfx.hit(); break;
      case 'soul': audio.sfx.soul(); break;
      case 'spawn': audio.sfx.warn(); break;
      case 'damage':
        audio.sfx.damage();
        flashDamage();
        announce(`Hit! Health ${ev.health} of ${KEEPER.maxHealth}.`, true);
        break;
      case 'breach':
        audio.sfx.breach();
        toast(`Gate breached ${ev.breaches}/${KEEPER.maxBreaches}`);
        announce(`An undead reached the gate. Breaches ${ev.breaches} of ${KEEPER.maxBreaches}.`, true);
        break;
      case 'sealReady':
        toast('Seal the breach!');
        announce('Wave cleared. Touch the glowing seal to continue.');
        break;
      case 'sealed':
        audio.sfx.seal();
        if (ev.wave < KEEPER.waves.length) toast(`Wave ${ev.wave} sealed`);
        break;
      case 'waveStart':
        toast(`Wave ${ev.wave}`);
        announce(`Wave ${ev.wave} of ${KEEPER.waves.length}.`);
        break;
      case 'task': {
        audio.sfx.interact();
        const names = { fuse: 'Fuse collected', power: 'Power restored', bell: 'The bell rings out' };
        toast(names[ev.id]);
        if (ev.id === 'bell') audio.sfx.bell();
        const i = taskIndex(run);
        announce(`${names[ev.id]}. ${i >= 0 ? TASKS[i].label : 'The refuge door is open. Get inside!'}.`);
        break;
      }
      case 'denied':
        audio.sfx.denied();
        toast(ev.hint.length > 28 ? 'Not yet' : ev.hint, 1200);
        announce(ev.hint);
        break;
      case 'spotted': audio.sfx.spotted(); break;
      case 'victoryRun': case 'defeatRun': endRun(); break;
    }
  }
}

function flashDamage() {
  const vp = $('viewport');
  vp.style.boxShadow = 'inset 0 0 0 4px #ff8a8a';
  setTimeout(() => { vp.style.boxShadow = ''; }, reducedMotion() ? 600 : 250);
}

// ---------------- Results ----------------

function endRun() {
  const r = run;
  const win = r.outcome.result === 'victory';
  // Let the final frame render before switching screens.
  setTimeout(() => showResults(r, win), win ? 500 : 700);
  input.clear();
  win ? audio.sfx.victory() : audio.sfx.defeat();
}

const rowIcon = (name) => `<img class="row-icon" src="assets/img/v2/${name}.png" alt="">`;

function showResults(r, win) {
  if (run !== r) return;
  closeAllOverlays();
  audio.resumeAudio();
  const rows = [];
  let best = '';
  let ending = '';
  if (r.campaign === 'keeper') {
    $('results-title').textContent = win ? 'Night shift complete' : r.outcome.reason === 'breach' ? 'The city gate has fallen' : 'The night caught you';
    $('results-reason').textContent = win
      ? 'All three breaches are sealed.'
      : r.outcome.reason === 'breach' ? `${KEEPER.maxBreaches} undead slipped through the gate.` : 'You took three hits.';
    rows.push([`${rowIcon('skull')}Undead slain`, `${r.stats.defeated} × ${KEEPER.score.defeat}`]);
    rows.push([`${rowIcon('soul-flame')}Souls collected`, `${r.stats.souls} × ${KEEPER.score.soul}`]);
    rows.push([`${rowIcon('seal-sigil')}Waves sealed`, `${r.stats.seals} × ${KEEPER.score.seal}`]);
    if (win) {
      rows.push([`${rowIcon('heart-full')}Health bonus`, `${r.health} × ${KEEPER.score.healthBonus}`]);
      rows.push([`${rowIcon('sparkle')}Gate bonus`, `${KEEPER.maxBreaches - r.breaches} × ${KEEPER.score.breachBonus}`]);
    }
    $('results-total').hidden = false;
    $('results-total').querySelector('img').src = 'assets/img/v2/soul-flame.png';
    $('results-total-label').textContent = 'Total score';
    $('results-total-value').textContent = r.score.toLocaleString();
    const prev = store.data.keeperBest;
    if (r.score > prev) {
      store.update((d) => { d.keeperBest = r.score; });
      best = prev > 0 ? `New personal best! (was ${prev.toLocaleString()})` : 'New personal best!';
    } else {
      best = `Personal best: ${prev.toLocaleString()}`;
    }
    if (win) ending = 'Pip coaxes a final spark into the cracked bell. One quiet note rings out, and the green windows of distant Bellwick fade to gold. “Night shift complete. Flowers mostly intact.”';
  } else {
    $('results-title').textContent = win ? 'Safe at last' : 'Caught in the streets';
    $('results-reason').textContent = win ? 'Mara reached the dawn refuge.' : 'A zombie caught Mara.';
    for (const t of TASKS) rows.push([`${rowIcon(TASK_ICONS[t.id])}${t.short}`, r.done[t.id] ? '✓ Done' : '—']);
    const t = Math.floor(r.time);
    rows.push(['Time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`]);
    $('results-total').hidden = true;
    if (win) ending = 'The refuge door opens onto warm lanterns. Mara hears the distant cemetery bell answer her own, and leaves a chalk arrow on the door for the next survivor: “This way. Still here.”';
  }
  if (win) store.update((d) => { d.completed[r.campaign] = true; });
  $('results-table').tBodies[0].innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  $('results-best').textContent = best;
  $('results-ending').textContent = ending;
  setState(win ? 'victory' : 'defeat');
  $('screen-results').scrollTop = 0;
  announce(`${$('results-title').textContent}. ${$('results-reason').textContent}${r.campaign === 'keeper' ? ` Score ${r.score}.` : ''}`, true);
  $('btn-retry').focus({ preventScroll: true });
}

$('btn-retry').addEventListener('click', startRun);
$('btn-results-select').addEventListener('click', () => { run = null; goSelect(); });

// ---------------- Main loop (fixed timestep) ----------------

const STEP = 1 / 60;
let accumulator = 0;
let animTime = 0;
let lastFrame = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const elapsed = Math.min(0.25, (now - lastFrame) / 1000); // cap so a long hitch can't jump the sim
  lastFrame = now;
  if (!run || (state !== 'playing' && state !== 'paused')) return;

  if (state === 'playing') animTime += elapsed; // frozen while paused
  if (state === 'playing' && !run.outcome) {
    accumulator += elapsed;
    while (accumulator >= STEP && !run.outcome) {
      const snapshot = input.read();
      const events = run.campaign === 'keeper' ? stepKeeper(run, snapshot, STEP) : stepSurvivor(run, snapshot, STEP);
      handleEvents(events);
      accumulator -= STEP;
    }
    if (run.player.moving) {
      stepSoundTimer -= elapsed;
      if (stepSoundTimer <= 0) { audio.sfx.step(); stepSoundTimer = 0.32; }
    }
  }
  updateHud();
  renderer.draw(run, { time: animTime, reducedMotion: reducedMotion(), insets: viewInsets() });
}

// The HUD and touch controls float over the canvas; the camera keeps the player between them.
function viewInsets() {
  const vp = $('viewport').getBoundingClientRect();
  const hud = $('hud-sub').getBoundingClientRect();
  const controls = $('controls').getBoundingClientRect();
  return { top: Math.max(0, hud.bottom - vp.top), bottom: Math.max(0, vp.bottom - controls.top) };
}

new ResizeObserver(() => renderer?.resize()).observe($('viewport'));

// Inspection hook for manual testing only: open the game with ?debug.
if (new URLSearchParams(location.search).has('debug')) {
  window.__scythe = { get run() { return run; }, get state() { return state; } };
}

applySettings();
requestAnimationFrame(frame);
boot();
