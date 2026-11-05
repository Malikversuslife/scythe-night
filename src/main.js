import { createStore, SAVE_KEY } from './storage.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { KEEPER_IMAGES } from './render-keeper.js';
import { SURVIVOR_IMAGES } from './render-survivor.js';
import { createKeeperRun, stepKeeper, KEEPER } from './keeper.js';
import { createSurvivorRun, stepSurvivor, interactionTarget, taskIndex, TASKS } from './survivor.js';
import * as audio from './audio.js';
import { COSMETICS, EVENTS, eventById, SKILLS } from './catalog.js';
import { runLoadout, commitRun, claimableCounts } from './progress.js';
import { createScreens, coinTag, formatTime, skinFor } from './screens.js';
import { drawPreview } from './render.js';
import { submitScore } from './leaderboard.js';
import { cleanName, NAME_MAX } from './leaderboard-rules.mjs';

const $ = (id) => document.getElementById(id);
const app = $('app');

// ---------------- Campaign content ----------------

const CAMPAIGNS = {
  keeper: {
    title: 'Cemetery Keeper',
    story: 'Pip finds the cracked bell of Hush Hollow swinging without sound. Green sparks flicker between the graves, and the restless dead are shuffling toward the city gate. A notice on the keeper’s hut reads: “One night. No escapes. Please mind the flowers.”',
    rules: [
      'Slash undead to free their lime-green souls, then walk over a soul to guide it home.',
      'You have <strong>3 health</strong>. Each hit costs one; you flash briefly after a hit.',
      'If <strong>3 undead</strong> reach the city gate at the bottom, the city falls.',
      'When a wave is cleared, touch the glowing <strong>seal</strong> to start the next. Seal all 3 waves to win.',
      '<strong>Soul Pulse</strong> shoves nearby undead away. It does no damage, so you still have to slash them.',
    ],
    controls: [
      'Move: left joystick, or <kbd>WASD</kbd> / arrow keys',
      'Slash (in the direction you face): scythe button, or <kbd>Space</kbd> / <kbd>J</kbd>',
      'Soul Pulse: skill button, or <kbd>K</kbd>',
      'Pause: top-right button, or <kbd>Esc</kbd> / <kbd>P</kbd>',
    ],
    actionKeys: ['Space', 'KeyJ'],
  },
  survivor: {
    title: 'Last Survivor',
    story: 'Mara reaches an empty tram stop in Bellwick. The route board points to the dawn refuge, but its gate has no power. A handwritten note is pinned beneath it: “Bring the fuse. Ring the bell. We are still here.”',
    rules: [
      'You have <strong>no weapon</strong>. One touch from a zombie ends the run.',
      'Zombies see you inside their red circle if no wall is in the way. Break line of sight and they give up after a few seconds.',
      'Tasks in order: take the <strong>fuse</strong>, install it in the <strong>power box</strong>, ring the <strong>bell</strong>.',
      'Then step through the open <strong>refuge door</strong> to win. The amber ring and edge arrow show where to go.',
      '<strong>Distraction</strong> tosses a noise-maker the way you face. Zombies nearby go to check it, unless they can already see you.',
    ],
    controls: [
      'Move: left joystick, or <kbd>WASD</kbd> / arrow keys',
      'Interact when close: hand button, or <kbd>E</kbd> / <kbd>Space</kbd>',
      'Distraction: skill button, or <kbd>K</kbd>',
      'Pause: top-right button, or <kbd>Esc</kbd> / <kbd>P</kbd>',
    ],
    actionKeys: ['KeyE', 'Space'],
  },
};

const ICONS = {
  scythe: '<svg viewBox="0 0 48 48"><path d="M30 6 L14 44" stroke="#2b2433" stroke-width="5" stroke-linecap="round"/><path d="M29 7 C 41 5, 47 16, 43 27 C 39 18, 34 13, 26 14 Z" fill="#e7e3ef"/></svg>',
  pulse: '<svg viewBox="0 0 48 48" fill="none" stroke="#baf45a" stroke-linecap="round"><circle cx="24" cy="24" r="6" fill="#baf45a" stroke="none"/><circle cx="24" cy="24" r="13" stroke-width="3.5"/><circle cx="24" cy="24" r="20" stroke-width="3" stroke-dasharray="6 7"/></svg>',
  rattle: '<svg viewBox="0 0 48 48" fill="none" stroke-linecap="round"><rect x="15" y="18" width="18" height="24" rx="5" fill="#ffd789"/><path d="M15 26h18" stroke="#b98a3d" stroke-width="2.5"/><path d="M12 13c2-3 5-5 8-6M36 13c-2-3-5-5-8-6M24 11V4" stroke="#ffd789" stroke-width="3.5"/></svg>',
  hand: '<svg viewBox="0 0 48 48"><path d="M17 26 V12 a3 3 0 0 1 6 0 V24 V9 a3 3 0 0 1 6 0 V24 V12 a3 3 0 0 1 6 0 V30 c0 8 -5 13 -12 13 c-6 0 -9 -3 -12 -8 l-5 -8 a3 3 0 0 1 5 -3 Z" fill="#ffd789"/></svg>',
};

// ---------------- Boot ----------------

const IMAGE_SRC = {
  backdrop: 'assets/img/bg-cemetery.jpg',
  ...KEEPER_IMAGES,
  ...SURVIVOR_IMAGES,
};
const COSMETIC_FILES = [...new Set(COSMETICS.flatMap((c) => Object.values(c.skin)))];
const MENU_ART = ['play', 'shop', 'characters', 'upgrades', 'settings', 'records', 'achievements', 'missions', 'daily', 'events', 'journal', 'quit'];
const PRELOAD = [...MENU_ART.map((n) => `assets/img/menu/${n}.png`), 'assets/img/ui/coin.png',
  // The HUD and controls appear the moment a story starts, so they mustn't still be downloading.
  'assets/img/ui/action.png', 'assets/img/ui/joystick.png', 'assets/img/ui/medallion.png', 'assets/img/ui/round.png', 'assets/img/btn-skull.png',
  'assets/img/v2/hud-lantern.png', 'assets/img/v2/heart-full.png', 'assets/img/v2/heart-empty.png', 'assets/img/bg-cemetery.jpg', 'assets/img/title-logo.webp', 'assets/img/banner-tap.png',
  'assets/img/banner-select.png', 'assets/img/card-keeper.webp', 'assets/img/card-survivor.webp'];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Decode during loading, so large art doesn't stall the first frame of a story.
    img.onload = () => Promise.resolve(img.decode?.()).catch(() => {}).then(() => resolve(img));
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
    // A cosmetic that fails to load falls back to the default look.
    await Promise.all(COSMETIC_FILES.map(async (f) => { try { images[f] = await loadImage(f); } catch { /* default art */ } }));
  } catch (err) {
    $('boot-status').textContent = `Could not load ${err.message}. Check your connection and try again.`;
    $('boot-retry').hidden = false;
    $('boot-retry').focus();
    return;
  }
  // The display font is optional; don't wait long for it.
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
  renderer = createRenderer($('game-canvas'), images);
  screens = createScreens({
    store, images, confirmDialog, openOverlay, closeOverlay, announce,
    startEvent: (id) => withName(() => startRun(id)),
    refreshGlobal,
    openPage,
    playerId,
  });
  refreshGlobal();
  claimActiveTab();
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
  const menuSound = $('btn-menu-sound');
  menuSound.setAttribute('aria-pressed', String(!s.muted));
  menuSound.setAttribute('aria-label', s.muted ? 'Sound off' : 'Sound on');
  menuSound.querySelector('img').src = soundIcon;
  sound.querySelector('img').src = soundIcon;
  sound.querySelector('span').textContent = s.muted ? 'Sound off' : 'Sound on';
  sound.setAttribute('aria-pressed', String(!s.muted));
  const hudSound = $('btn-hud-sound');
  hudSound.setAttribute('aria-pressed', String(!s.muted));
  hudSound.setAttribute('aria-label', s.muted ? 'Sound off' : 'Sound on');
  hudSound.querySelector('img').src = soundIcon;
  for (const el of document.querySelectorAll('[data-storage-note]')) el.hidden = store.available;
}

// Wallet, claim badges and anything else shown on more than one screen.
function refreshGlobal() {
  const coins = coinTag(store.data.wallet.graveCoins);
  for (const el of document.querySelectorAll('[data-wallet]')) el.innerHTML = coins;
  const counts = claimableCounts(store.data, Date.now());
  for (const el of document.querySelectorAll('[data-badge-count]')) {
    const n = counts[el.dataset.badgeCount];
    el.hidden = !n;
    el.textContent = n;
    el.setAttribute('aria-label', `${n} ready to claim`);
  }
  applySettings();
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
  if (!(await confirmDialog('Reset saved data?', 'This erases your Grave Coins, cosmetics, upgrades, records, achievements, missions, daily rewards, Night Journal, event results and settings on this device. It cannot be undone.', 'Erase'))) return;
  store.reset();
  syncSettingsForm();
  refreshGlobal();
  refreshSelect();
  screens.rerender();
  announce('Saved data reset.');
});

// ---------------- Screens & state machine ----------------

const SCREENS = {
  boot: 'screen-boot', splash: 'screen-splash', menu: 'screen-menu', page: 'screen-page', storySelect: 'screen-select', intro: 'screen-intro',
  playing: 'screen-game', paused: 'screen-game', victory: 'screen-results', defeat: 'screen-results',
};

let state = 'boot';
let campaign = 'keeper';
let run = null;
let renderer = null;
let screens = null;
let pageStack = []; // where Back goes from a destination page

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

function goMenu() {
  run = null;
  pageStack = [];
  screens?.clear();
  audio.resumeAudio();
  setState('menu');
  refreshGlobal();
  $('screen-menu').scrollTop = 0;
  $('btn-menu-play').focus({ preventScroll: true });
}

// Open a destination page, remembering how to come back.
function openPage(id) {
  pageStack.push({ state, page: screens.current, focus: document.activeElement });
  setState('page');
  screens.render(id);
  $('screen-page').scrollTop = 0;
  $('page-title').focus({ preventScroll: true });
}

function pageBack() {
  const prev = pageStack.pop();
  if (!prev) { goMenu(); return; }
  setState(prev.state);
  if (prev.state === 'page') screens.render(prev.page);
  else screens.clear();
  refreshGlobal();
  const target = prev.state === 'page' && prev.focus?.dataset?.key
    ? document.querySelector(`#page-body [data-key="${prev.focus.dataset.key}"]`)
    : prev.focus;
  if (target && document.contains(target)) target.focus({ preventScroll: true });
}

function goSelect() {
  setState('storySelect');
  refreshSelect();
  $('screen-select').scrollTop = 0;
  document.querySelector(`.story-card[data-campaign="${campaign}"]`)?.focus({ preventScroll: true });
}

function refreshSelect() {
  for (const b of document.querySelectorAll('[data-badge]')) b.hidden = !store.data.records.completions[b.dataset.badge];
  refreshGlobal();
}

function goIntro(which) {
  campaign = which;
  const c = CAMPAIGNS[which];
  $('intro-title').textContent = c.title;
  $('intro-story').textContent = c.story;
  $('intro-rules').innerHTML = c.rules.map((r) => `<li>${r}</li>`).join('');
  $('intro-controls').innerHTML = c.controls.map((r) => `<li>${r}</li>`).join('');
  setState('intro');
  $('screen-intro').scrollTop = 0;
  drawPreview($('intro-preview'), which, images, equippedSkin(which).overrides);
  $('btn-intro-start').focus({ preventScroll: true });
}

// The focus glow is only for people moving around with the keyboard.
document.addEventListener('keydown', (e) => { if (e.key === 'Tab') app.classList.add('keyboard-nav'); }, true);
document.addEventListener('pointerdown', () => app.classList.remove('keyboard-nav'), true);

// Splash: tap anywhere (outside its small buttons) begins.
$('screen-splash').addEventListener('click', (e) => {
  if (e.target.closest('.splash-row')) return;
  audio.unlockAudio();
  audio.startMusic();
  audio.sfx.click();
  goMenu();
});
$('btn-splash-settings').addEventListener('click', () => { audio.unlockAudio(); openSettings(); });
$('btn-splash-sound').addEventListener('click', toggleMute);

function toggleMute() {
  audio.unlockAudio();
  store.update((d) => { d.settings.muted = !d.settings.muted; });
  applySettings();
  const muted = store.data.settings.muted;
  announce(muted ? 'Sound off.' : 'Sound on.');
  if (!muted) audio.sfx.click();
}

$('btn-menu-sound').addEventListener('click', toggleMute);
$('btn-menu-play').addEventListener('click', () => { audio.unlockAudio(); audio.startMusic(); audio.sfx.click(); withName(goSelect); });
$('btn-menu-settings').addEventListener('click', openSettings);
for (const b of document.querySelectorAll('#screen-menu [data-route]')) {
  b.addEventListener('click', () => { audio.unlockAudio(); audio.sfx.click(); openPage(b.dataset.route); });
}
$('btn-page-back').addEventListener('click', () => { audio.sfx.click(); pageBack(); });
// A button whose art failed to load shows its label on plain stone instead.
document.addEventListener('error', (e) => {
  if (e.target.tagName === 'IMG') e.target.closest('.grave-btn')?.classList.add('no-art');
}, true);

$('btn-select-back').addEventListener('click', goMenu);
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
  el.style.zIndex = 20 + overlayStack.length; // the newest is always on top, whatever its page order
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

// ---------------- Player name ----------------

let nameSkipped = false; // asked once per visit, so Skip doesn't nag
let afterName = null;

// Runs `then` once the player has a name or has chosen to skip this visit.
function withName(then) {
  if (store.data.player.name || nameSkipped) then();
  else askName(then);
}

function askName(then = null) {
  afterName = then;
  $('name-input').value = store.data.player.name;
  $('name-status').textContent = 'Shown on the leaderboard with your high score. No account needed.';
  $('name-status').className = 'fine-print';
  $('btn-name-other').textContent = then ? 'Skip' : 'Cancel';
  openOverlay('overlay-name');
}

function leaveNameStep() {
  const then = afterName;
  afterName = null;
  closeOverlay();
  then?.();
}

$('name-input').maxLength = NAME_MAX;
$('name-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = cleanName($('name-input').value);
  if (!name.ok) {
    $('name-status').textContent = `⚠ ${name.reason}`;
    $('name-status').className = 'warn-line';
    announce(name.reason);
    $('name-input').focus();
    return;
  }
  store.update((d) => { d.player.name = name.name; });
  audio.sfx.click();
  leaveNameStep();
});
$('btn-name-other').addEventListener('click', () => {
  if (afterName) nameSkipped = true;
  leaveNameStep();
});
$('btn-settings-name').addEventListener('click', () => askName());

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
  if (!top) {
    if (e.key === 'Escape' && state === 'page') { e.preventDefault(); pageBack(); }
    return;
  }
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
  skillBtn: $('btn-skill'),
  surface: $('screen-game'),
  actionKeys: () => CAMPAIGNS[campaign].actionKeys,
  onPause: () => pause(),
  isActive: () => state === 'playing' && overlayStack.length === 0,
});

$('btn-pause').addEventListener('click', () => pause());
$('btn-hud-sound').addEventListener('click', toggleMute);

// ---------------- Runs ----------------

function equippedSkin(which, equipped = store.data.equippedByCampaign) {
  return skinFor(images, Object.values(equipped[which]));
}

// A random id for this device, so a player holds one row on the shared board.
function playerId() {
  if (!store.data.player.id) store.update((d) => { d.player.id = newRunId(); });
  return store.data.player.id;
}

function newRunId() {
  return crypto.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function startRun(eventId = null) {
  closeAllOverlays();
  pageStack = [];
  screens.clear();
  if (eventId) campaign = eventById(eventId).campaign;
  // Levels and looks are copied here, so nothing bought later can change this run.
  const loadout = runLoadout(store.data, eventId);
  run = campaign === 'keeper' ? createKeeperRun(Date.now(), loadout.keeper) : createSurvivorRun(loadout.survivor);
  run.id = newRunId();
  run.loadout = loadout;
  hudCache = {};
  renderer.reset();
  const skin = equippedSkin(campaign, loadout.equipped);
  renderer.setSkin(skin.overrides, skin.glow);
  setupHud();
  setState('playing');
  input.clear();
  accumulator = 0;
  lastFrame = performance.now();
  renderer.resize();
  // Draw before the browser paints, so the game never appears with an empty world. The first
  // draw builds the level's map layers, which is slow, so the clock starts after it.
  updateHud();
  drawWorld();
  lastFrame = performance.now();
  audio.resumeAudio();
  audio.startMusic();
  if (campaign === 'keeper') {
    const title = eventId ? eventById(eventId).name : 'Cemetery Keeper';
    toast(eventId ? title : 'Wave 1');
    announce(`${title}. Wave 1 of ${run.rules.waves.length}. Stop the undead before they reach the gate.`);
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
  renderer.recheck();
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
const DISCARD_NOTE = 'Unfinished coins and Night XP from this run are discarded.';
$('btn-restart').addEventListener('click', async () => {
  if (await confirmDialog('Restart?', `This run ends now. ${DISCARD_NOTE}`, 'Restart')) startRun(run?.loadout.eventId ?? null);
});
$('btn-pause-controls').addEventListener('click', () => showControls(false));
$('btn-pause-settings').addEventListener('click', openSettings);
$('btn-pause-select').addEventListener('click', async () => {
  if (await confirmDialog('Leave this run?', DISCARD_NOTE, 'Leave')) {
    closeAllOverlays();
    run = null;
    goSelect();
  }
});
$('btn-pause-quit').addEventListener('click', async () => {
  if (await confirmDialog('Quit to main menu?', DISCARD_NOTE, 'Quit')) {
    closeAllOverlays();
    goMenu();
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
  else {
    renderer?.recheck(); // backgrounded pages are where phones reclaim canvas memory
    if (state !== 'paused') audio.resumeAudio();
  }
});
window.addEventListener('blur', autoPause);

// One tab plays at a time, held by a Web Lock that the browser releases if the tab closes.
const TAB_LOCK = 'scythe-night-active';
function holdLock(options) {
  navigator.locks.request(TAB_LOCK, options, (lock) => {
    if (!lock) { showTabBlock(); return undefined; }
    hideTabBlock();
    return new Promise(() => {}); // held for as long as this page lives
  }).catch(showTabBlock); // another tab took over with "Play here"
}
function claimActiveTab() {
  if (navigator.locks) holdLock({ ifAvailable: true });
}
function showTabBlock() {
  autoPause();
  $('overlay-tab').hidden = false;
  $('btn-tab-here').focus();
}
function hideTabBlock() {
  $('overlay-tab').hidden = true;
  store.reload();
  refreshGlobal();
  screens?.rerender();
}
$('btn-tab-here').addEventListener('click', () => holdLock({ steal: true }));
// Keep the keyboard on the only live control while another tab has the game.
document.addEventListener('keydown', (e) => {
  if ($('overlay-tab').hidden) return;
  if (e.key !== 'Enter' && e.key !== ' ') e.preventDefault();
  e.stopImmediatePropagation();
  $('btn-tab-here').focus();
}, true);
// A change saved elsewhere refreshes what this tab shows.
window.addEventListener('storage', (e) => {
  if (e.key !== SAVE_KEY) return;
  store.reload();
  refreshGlobal();
  screens?.rerender();
});

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
    $('skill-icon').innerHTML = ICONS.pulse;
  } else {
    icon.innerHTML = ICONS.hand;
    btn.setAttribute('aria-label', 'Interact (E or Space)');
    $('skill-icon').innerHTML = ICONS.rattle;
  }
  $('skill-label').textContent = SKILLS[campaign].name;
}

function updateHud() {
  if (!run) return;
  const hudH = $('hud').offsetHeight;
  if (hudCache.hudH !== hudH) { hudCache.hudH = hudH; $('hud-sub').style.top = `${hudH}px`; }
  // Skill: whole seconds only, so the DOM isn't touched every frame.
  const wait = Math.ceil(run.skillCooldown);
  if (hudCache.skillWait !== wait) {
    hudCache.skillWait = wait;
    const name = SKILLS[run.campaign].name;
    const skillBtn = $('btn-skill');
    skillBtn.setAttribute('aria-disabled', String(wait > 0));
    skillBtn.setAttribute('aria-label', wait > 0 ? `${name}: ready in ${wait} seconds` : `${name} (K)`);
    skillBtn.classList.toggle('cooling', wait > 0);
    $('skill-cd').hidden = wait === 0;
    $('skill-cd').textContent = wait > 0 ? `${wait}s` : '';
    if (wait === 0 && hudCache.skillCooling) announce(`${name} ready.`);
    hudCache.skillCooling = wait > 0;
  }
  if (run.campaign === 'keeper') {
    const hearts = Array.from({ length: KEEPER.maxHealth }, (_, i) =>
      `<img src="assets/img/v2/heart-${i < run.health ? 'full' : 'empty'}.png" alt="">`).join('');
    const warn = run.breaches >= KEEPER.maxBreaches - 1 ? ' warn' : '';
    setHtml($('hud-left'), 'left',
      `<div class="score-panel"><img src="assets/img/v2/hud-lantern.png" alt=""><div><strong>${run.score.toLocaleString()}</strong><span>Score</span></div></div>` +
      `<div class="hud-row"><div class="heart-row" role="img" aria-label="Health ${run.health} of ${KEEPER.maxHealth}">${hearts}</div>` +
      `<div class="hud-chip breach${warn}" aria-label="Gate breaches ${run.breaches} of ${KEEPER.maxBreaches}"><span class="lbl">Gate</span>${run.breaches}/${KEEPER.maxBreaches}</div></div>`);
    setHtml($('hud-stats'), 'stats',
      `<div class="wave-box"><span class="lbl">WAVE</span><strong>${run.wave + 1}/${run.rules.waves.length}</strong></div>` +
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
        if (ev.wave < run.rules.waves.length) toast(`Wave ${ev.wave} sealed`);
        break;
      case 'waveStart':
        toast(`Wave ${ev.wave}`);
        announce(`Wave ${ev.wave} of ${run.rules.waves.length}.`);
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
      case 'pulse': audio.sfx.pulse(); break;
      case 'distraction': audio.sfx.rattle(); break;
      case 'skillDenied':
        audio.sfx.denied();
        toast('No room to throw', 1200);
        announce(ev.hint);
        break;
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
  // Rewards, records and the run's receipt commit now, before the results screen shows.
  const eventId = r.loadout.eventId;
  const summary = {
    id: r.id, campaign: r.campaign, eventId, result: r.outcome.result, time: r.time,
    score: r.campaign === 'keeper' ? r.score : null, upgrades: r.loadout.upgrades,
    souls: r.campaign === 'keeper' ? r.stats.souls : 0,
    seals: r.campaign === 'keeper' ? r.stats.seals : 0,
    breaches: r.campaign === 'keeper' ? r.breaches : 0,
    tasks: r.campaign === 'survivor' ? TASKS.filter((t) => r.done[t.id]).length : 0,
  };
  const receipt = store.transact((d) => commitRun(d, summary, Date.now()));
  refreshGlobal();
  // Let the final frame render before switching screens.
  setTimeout(() => showResults(r, win, receipt), win ? 500 : 700);
  input.clear();
  win ? audio.sfx.victory() : audio.sfx.defeat();
}

const rowIcon = (name) => `<img class="row-icon" src="assets/img/v2/${name}.png" alt="">`;

function rewardsHtml(r, receipt) {
  if (!receipt.ok) return '';
  const lines = receipt.lines.map((l) => `<li><span>${l.label}</span>${coinTag(l.amount)}</li>`).join('');
  const isEvent = !!r.loadout.eventId;
  const empty = isEvent ? 'No coins this time: event replays pay nothing, and only a first clear pays out.' : 'No coins this time. Free a soul or finish a task to earn some.';
  return `<h2 class="panel-heading">Grave Coins</h2>
    ${lines ? `<ul class="reward-lines">${lines}</ul>` : `<p class="fine-print">${empty}</p>`}
    <p class="wallet-change">Wallet ${coinTag(receipt.walletBefore)} \u2192 ${coinTag(receipt.walletAfter)}</p>
    ${isEvent ? '' : `<p class="xp-line">+${receipt.xp} Night XP</p>`}
    <p class="${receipt.saved ? 'saved-line' : 'warn-line'}">${receipt.saved ? '\u2713 Saved' : '\u26A0 Not saved: temporary session'}</p>`;
}

function showResults(r, win, receipt) {
  if (run !== r) return;
  closeAllOverlays();
  audio.resumeAudio();
  const rows = [];
  let best = '';
  let ending = '';
  if (r.campaign === 'keeper') {
    $('results-title').textContent = win ? 'Night shift complete' : r.outcome.reason === 'breach' ? 'The city gate has fallen' : 'The night caught you';
    $('results-reason').textContent = win
      ? (r.loadout.eventId ? `${eventById(r.loadout.eventId).name} cleared.` : 'All three breaches are sealed.')
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
    const prev = receipt.previousBest ?? 0;
    const bestName = r.loadout.eventId ? 'Event best' : 'Personal best';
    if (receipt.newBest) best = prev > 0 ? `New ${bestName.toLowerCase()}! (was ${prev.toLocaleString()})` : `New ${bestName.toLowerCase()}!`;
    else best = `${bestName}: ${prev.toLocaleString()}`;
    if (win && !r.loadout.eventId) ending = 'Pip coaxes a final spark into the cracked bell. One quiet note rings out, and the green windows of distant Bellwick fade to gold. “Night shift complete. Flowers mostly intact.”';
  } else {
    $('results-title').textContent = win ? 'Safe at last' : 'Caught in the streets';
    $('results-reason').textContent = win ? 'Mara reached the dawn refuge.' : 'A zombie caught Mara.';
    for (const t of TASKS) rows.push([`${rowIcon(TASK_ICONS[t.id])}${t.short}`, r.done[t.id] ? '✓ Done' : '—']);
    rows.push(['Time', formatTime(r.time)]);
    $('results-total').hidden = true;
    if (win && receipt.newBest) best = 'New fastest escape!';
    if (win) ending = 'The refuge door opens onto warm lanterns. Mara hears the distant cemetery bell answer her own, and leaves a chalk arrow on the door for the next survivor: “This way. Still here.”';
  }
  $('results-table').tBodies[0].innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
  $('results-best').textContent = best;
  $('results-ending').textContent = ending;
  $('results-rewards').innerHTML = rewardsHtml(r, receipt);
  setupPostForm(r);
  $('btn-results-select').textContent = r.loadout.eventId ? 'Events' : 'Stories';
  setState(win ? 'victory' : 'defeat');
  $('screen-results').scrollTop = 0;
  announce(`${$('results-title').textContent}. ${$('results-reason').textContent}${r.campaign === 'keeper' ? ` Score ${r.score}.` : ''} ${receipt.ok ? `Earned ${receipt.coins} coins.` : ''}`, true);
  $('btn-retry').focus({ preventScroll: true });
}

// Standard Keeper runs with a score go on the shared board by themselves; the database only
// keeps a player's best. A name is the one thing needed, so without one the form asks for it.
function setupPostForm(r) {
  const form = $('post-form');
  const eligible = r.campaign === 'keeper' && !r.loadout.eventId && r.score > 0;
  form.hidden = !eligible;
  if (!eligible) return;
  form.dataset.done = '';
  form.dataset.sending = '';
  const name = cleanName(store.data.player.name);
  if (name.ok) {
    askForPostName(false);
    sendScore(r, name.name);
  } else {
    askForPostName(true);
    setPostStatus('Add a name to put your score on the leaderboard. No account needed.', 'fine-print');
  }
}

function askForPostName(show) {
  $('post-row').hidden = !show;
  if (!show) return;
  $('post-name').value = store.data.player.name;
  $('post-name').disabled = false;
  $('btn-post').disabled = false;
}

function setPostStatus(text, className) {
  $('post-status').textContent = text;
  $('post-status').className = className;
}

async function sendScore(r, name) {
  const form = $('post-form');
  form.dataset.sending = '1';
  $('btn-post').disabled = true;
  setPostStatus(`Posting as ${name}\u2026`, 'fine-print');
  const posted = await submitScore(playerId(), name, {
    score: r.score, time: r.time, defeated: r.stats.defeated, souls: r.stats.souls, seals: r.stats.seals,
    health: Math.max(0, r.health), breaches: Math.min(3, r.breaches), result: r.outcome.result,
  });
  if (run !== r) return; // the player has already moved on to another run
  form.dataset.sending = '';
  if (!posted.ok) {
    // Keep the score reachable: the name may be the problem, or the connection may return.
    askForPostName(true);
    $('post-name').value = name;
    setPostStatus(`\u26A0 ${posted.error}`, 'warn-line');
    announce(posted.error);
    return;
  }
  form.dataset.done = '1';
  store.update((d) => { d.player.name = name; });
  $('post-row').hidden = true;
  const you = posted.you;
  const message = you && you.score > r.score
    ? `Your best of ${you.score.toLocaleString()} stands at #${you.rank}.`
    : `Posted as ${name}. You're #${you.rank} on the leaderboard.`;
  setPostStatus(`\u2713 ${message}`, 'saved-line');
  announce(message);
}

$('post-name').maxLength = NAME_MAX;
$('post-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = $('post-form');
  if (!run || form.dataset.done || form.dataset.sending) return;
  const name = cleanName($('post-name').value);
  if (!name.ok) {
    setPostStatus(`\u26A0 ${name.reason}`, 'warn-line');
    announce(name.reason);
    $('post-name').focus();
    return;
  }
  sendScore(run, name.name);
});

$('btn-retry').addEventListener('click', () => startRun(run?.loadout.eventId ?? null));
$('btn-results-menu').addEventListener('click', goMenu);
$('btn-results-select').addEventListener('click', () => {
  const wasEvent = run?.loadout.eventId;
  run = null;
  if (wasEvent) { pageStack = []; setState('menu'); openPage('events'); } else goSelect();
});
for (const b of document.querySelectorAll('[data-results-route]')) {
  b.addEventListener('click', () => openPage(b.dataset.resultsRoute));
}

// ---------------- Main loop (fixed timestep) ----------------

const STEP = 1 / 60;
let accumulator = 0;
let animTime = 0;
let lastFrame = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  try {
    tick(now);
  } catch (err) {
    // Without this, one error each frame would stop the drawing and look like a frozen game.
    // Rebuilding the canvas also clears any state the failed draw left behind.
    console.error('Frame failed; recovering.', err);
    accumulator = 0;
    renderer.reset();
    renderer.resize();
  }
}

function tick(now) {
  // Never negative: a frame's timestamp can be slightly older than a reset of lastFrame.
  const elapsed = Math.max(0, Math.min(0.25, (now - lastFrame) / 1000)); // cap so a long hitch can't jump the sim
  lastFrame = now;
  if (!run || (state !== 'playing' && state !== 'paused')) return;
  if (!$('overlay-tab').hidden) return;

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
  drawWorld();
}

function drawWorld() {
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
  window.__scythe = { get run() { return run; }, get state() { return state; }, get renderer() { return renderer; }, store, events: EVENTS, startRun };
}

applySettings();
requestAnimationFrame(frame);
boot();
