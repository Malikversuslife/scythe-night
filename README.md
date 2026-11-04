# Scythe Night

A mobile-first cartoon cemetery game for the browser with two stories:

- **Cemetery Keeper**: play as Pip the reaper. Slash undead in a grave maze, free their souls, and stop them reaching the city gate. Three waves, three health, three breaches.
- **Last Survivor**: play as Mara. Avoid zombies in the city streets, collect the fuse, restore power, ring the bell, and reach the refuge.

Grave Coins, a Shop, Characters, Upgrades, skills, achievements, missions, daily rewards, the Keeper's Trial event and the free Night Journal all run locally in the browser. The shared Leaderboard is the one online feature.

## Run it

The game is plain HTML, CSS, and JavaScript modules, so there is no build step. Browsers won't load ES modules from `file://`, so serve the folder:

```bash
python -m http.server 5173
```

Then open <http://localhost:5173>. Logic tests run at <http://localhost:5173/tests/>. With `?debug` in the game's URL, `await (await import('/tests/ui-audit.js')).audit()` checks every screen's layout at the current size.

## Leaderboard

The top 10 lives in a free Supabase project (`ieijitlqbyiuiwqjxavt`). There is nothing to configure: the game calls two public database functions, `get_leaderboard` and `submit_score`, using Supabase's publishable key, which is safe to ship in the page. The table itself is closed to the public, so device ids stay private. Its definition is in `supabase/leaderboard.sql`.

The table keeps one row per device: a random id, a public name, and that player's best score and time. The database recomputes each score and refuses impossible results, but a browser game can't prove a run really happened, so a determined person could still post a plausible fake.

- **Remove a name or score:** delete its row in the Supabase dashboard under Table Editor, `scores`.
- **If the board says it's unavailable:** free Supabase projects pause after about a week without activity. Restore the project from the Supabase dashboard. The scores are kept.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Move | Left joystick | WASD / arrow keys |
| Slash (Keeper) | Scythe button | Space / J |
| Interact (Survivor) | Hand button | E / Space |
| Skill (Soul Pulse / Distraction) | Skill button | K |
| Pause | Top-right button | Esc / P |

## Layout

```
index.html        screens, overlays, HUD (semantic HTML)
styles.css        palette tokens, stone buttons, responsive layout
src/main.js       state machine, menus, HUD, fixed-timestep loop
src/keeper.js     Cemetery Keeper simulation (no DOM)
src/survivor.js   Last Survivor simulation (no DOM)
src/world.js      tile collision, line of sight, BFS pathing
src/render.js     canvas sizing, campaign routing, edge arrows
src/render-keeper.js    Cemetery Keeper three-quarter-view renderer
src/render-survivor.js  Last Survivor three-quarter-view renderer
src/render-common.js    shared drawing, camera, occlusion and lighting helpers
src/rig.js        cutout character rigs and poses
src/input.js      keyboard + joystick + action button
src/audio.js      Web Audio synthesized music and effects
src/storage.js    versioned localStorage save, migration, in-memory fallback
src/catalog.js    every price, reward and rule value
src/progress.js   validated purchases, claims and run commits
src/screens.js    Shop, Characters, Upgrades, Leaderboard and the other pages
src/leaderboard*  shared top 10: browser client and the name check
supabase/         leaderboard table and functions
tests/            browser test page for the game rules
assets/img/       art exported from the Figma file
```

## Assets

- `assets/img/`: menu and v1 art exported from the project's Figma file (splash, story select, sprite and button sheets).
- `assets/img/menu/`: tombstone buttons with an icon only; their names are real text on the stone.
- `assets/img/v2/cos/`: cosmetic recolours of the rig parts.
- `assets/img/ui/`: the stone UI kit, generated without text so labels stay real HTML. It includes stretchable slab buttons, the board frame and winged-skull crest, round buttons, the joystick base, the action button, medallions, and lime icons. Buttons and boards are 9-slice `border-image`s in `styles.css`. Labels use Lilita One from Google Fonts.
- `assets/img/v2/`: art for both campaigns, generated with Figma AI in the reference style. The source images are in the same Figma file.
  - Cemetery Keeper: seamless ground and wall textures, gravestones and props, the mausoleum, trees and gate, HUD icons, and effects.
  - Last Survivor: street, rooftop and facade textures, street props, the kiosk, power box, bell and refuge door (with their before and after states), the clock tower, and shop signs.
  - Characters (reaper, Mara, two zombies) are split into parts and animated in code by `src/rig.js`. Preview the rigs at `/tests/rig-preview.html`.
  - Every character has front, side and back views (for example `mara`, `maraSide`, `maraBack`), chosen from their direction by `facingView`. Costumes in `cos/` cover all three. Zombies step by distance travelled, so their feet keep pace at any speed; `GAITS` holds each one's stride and limp.

All sound is synthesized at runtime, so there are no audio files. The Butcherman heading font loads from Google Fonts (SIL Open Font License) and falls back to a system font if it can't load.

## Debugging

Add `?debug` to the URL to expose the current run as `window.__scythe.run` in the browser console.
