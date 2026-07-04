# GameBlocks Usage

This folder uses GameBlocks as local building-block source material for a browser 3D dodge-and-deliver game.

## Copied Modules

- `gameblocks/modules/math/WorldBasis.js`
  - Reused as-is for camera target coordinate conversion and consistent world axes.
- `gameblocks/modules/math/ScalarUtils.js`
  - Reused as-is for `clamp`, `lerp`, and `smoothToward` in pointer movement, camera motion, and timing.
- `gameblocks/modules/math/Vector3Utils.js`
  - Reused as-is because the camera rig depends on it.
- `gameblocks/modules/math/RandomUtils.js`
  - Reused as-is for lane, participant, obstacle, and card particle variation.
- `gameblocks/modules/camera/BaseCameraRig.js`
  - Reused as-is as the base class for the follow camera rig.
- `gameblocks/modules/camera/PositionFollowCameraRig.js`
  - Reused as-is for the mobile third-person dash camera.
- `gameblocks/modules/user-interface/UiStateModel.js`
  - Reused as-is for HUD state updates.
- `gameblocks/modules/user-interface/DomHudRenderer.js`
  - Reused as-is for score, best score, card count, combo meter, and toast bindings.
- `gameblocks/modules/world/Object3DUtils.js`
  - Reused as-is for cleanup of spawned participants, obstacles, and effects.

## Integration Notes

- Runtime entrypoint: `src/game.js`
- Three.js is loaded from the GameBlocks-compatible CDN import map in `index.html`.
- The game is a mobile portrait one-handed dodge/delivery game: drag horizontally, deliver business cards to participants, avoid obstacles.
- Simulation state owns card count, combo, speed, score, spawn rows, and collision outcomes; Three.js groups are render adapters.
