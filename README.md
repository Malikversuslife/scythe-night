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
src/render.js     canvas rendering
src/input.js      keyboard + joystick + action button
src/audio.js      Web Audio synthesized music and effects
src/storage.js    versioned localStorage save with in-memory fallback
tests/            browser test page for the game rules
assets/img/       art exported from the Figma file
```

## Assets

The images in `assets/img/` were exported from the project's Figma file (splash, story-select, sprite and button sheets). Map tiles, props, and the HUD are drawn in code. All sound is synthesized at runtime, so there are no audio files. The Butcherman heading font loads from Google Fonts (SIL Open Font License) and falls back to a system font if it can't load.
