# Scythe Night

A mobile-first cartoon cemetery game for the browser with two stories:

- **Cemetery Keeper**: play as Pip the reaper. Slash undead in a grave maze, free their souls, and stop them reaching the city gate. Three waves, three health, three breaches.
- **Last Survivor**: play as Mara. Avoid zombies in the city streets, collect the fuse, restore power, ring the bell, and reach the refuge.

## Run it

The game is plain HTML, CSS, and JavaScript modules, so there is no build step. Browsers won't load ES modules from `file://`, so serve the folder:

```bash
python -m http.server 5173
```

Then open <http://localhost:5173>. Logic tests run at <http://localhost:5173/tests/>.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Move | Left joystick | WASD / arrow keys |
| Slash (Keeper) | Scythe button | Space / J |
| Interact (Survivor) | Hand button | E / Space |
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
src/storage.js    versioned localStorage save with in-memory fallback
tests/            browser test page for the game rules
assets/img/       art exported from the Figma file
```

## Assets

- `assets/img/`: menu and v1 art exported from the project's Figma file (splash, story select, sprite and button sheets).
- `assets/img/ui/`: the stone UI kit, generated without text so labels stay real HTML. It includes stretchable slab buttons, the board frame and winged-skull crest, round buttons, the joystick base, the action button, medallions, and lime icons. Buttons and boards are 9-slice `border-image`s in `styles.css`. Labels use Lilita One from Google Fonts.
- `assets/img/v2/`: art for both campaigns, generated with Figma AI in the reference style. The source images are in the same Figma file.
  - Cemetery Keeper: seamless ground and wall textures, gravestones and props, the mausoleum, trees and gate, HUD icons, and effects.
  - Last Survivor: street, rooftop and facade textures, street props, the kiosk, power box, bell and refuge door (with their before and after states), the clock tower, and shop signs.
  - Characters (reaper, Mara, two zombies) are split into parts and animated in code by `src/rig.js`. Preview the rigs at `/tests/rig-preview.html`.

All sound is synthesized at runtime, so there are no audio files. The Butcherman heading font loads from Google Fonts (SIL Open Font License) and falls back to a system font if it can't load.

## Debugging

Add `?debug` to the URL to expose the current run as `window.__scythe.run` in the browser console.
