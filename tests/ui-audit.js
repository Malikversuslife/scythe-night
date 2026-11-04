// Layout audit for manual checks. On the game opened with ?debug, at any viewport size:
//   const { audit } = await import('/tests/ui-audit.js'); await audit();
// Walks every screen and reports overflow, clipped labels, small targets and overlapping controls.
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const q = (s) => document.querySelector(s);

export async function audit() {
  const S = window.__scythe;
  const issues = [];
  const chk = (name) => {
    const scr = [...document.querySelectorAll('.screen')].find((x) => !x.hidden);
    if (scr && scr.scrollWidth > scr.clientWidth + 1) issues.push(`${name}: page wider than screen`);
    for (const b of document.querySelectorAll('button,.stone-card,.stat,.wallet,.option')) {
      if (!b.offsetParent) continue;
      const r = b.getBoundingClientRect();
      if (r.width === 0) continue;
      const label = b.id || b.dataset.key || b.className;
      if (r.right > innerWidth + 1 || r.left < -1) issues.push(`${name}: off-screen ${label}`);
      if (b.tagName === 'BUTTON' && (r.width < 44 || r.height < 44)) issues.push(`${name}: small target ${label} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (b.tagName === 'BUTTON' && b.scrollWidth > b.clientWidth + 2 && !b.classList.contains('grave-btn')) issues.push(`${name}: clipped ${label}`);
    }
  };
  if (S.state === 'splash') { q('#btn-play').click(); await wait(); }
  chk('menu');
  q('#btn-menu-play').click(); await wait(); chk('select');
  q('[data-campaign="survivor"]').click(); await wait(); chk('intro');
  q('#btn-intro-back').click(); await wait();
  q('#btn-select-back').click(); await wait();
  for (const r of ['shop', 'characters', 'upgrades']) {
    q(`#screen-menu [data-route="${r}"]`).click(); await wait(); chk(r);
    q('#btn-page-back').click(); await wait();
  }
  q('#screen-menu [data-route="more"]').click(); await wait(); chk('more');
  for (const r of ['records', 'achievements', 'missions', 'daily', 'events', 'journal']) {
    q(`#page-body [data-id="${r}"]`).click(); await wait(); chk(r);
    q('#btn-page-back').click(); await wait();
  }
  q('#btn-page-back').click(); await wait();
  for (const c of ['keeper', 'survivor']) {
    q('#btn-menu-play').click(); await wait();
    q(`[data-campaign="${c}"]`).click(); await wait();
    q('#btn-intro-start').click(); await wait(300);
    if (!q('#overlay-controls').hidden) q('#btn-controls-close').click();
    await wait(200);
    chk(`game-${c}`);
    const a = q('#joystick').getBoundingClientRect(), b = q('#btn-skill').getBoundingClientRect(), d = q('#btn-action').getBoundingClientRect();
    if (a.right > b.left || b.right > d.left) issues.push(`game-${c}: controls overlap`);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' })); await wait(200);
    chk(`pause-${c}`);
    q('#btn-pause-quit').click(); await wait(100);
    q('#btn-confirm-yes').click(); await wait(200);
  }
  return { size: `${innerWidth}x${innerHeight}`, issues: [...new Set(issues)] };
}
