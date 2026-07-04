# GameBlocks Usage

This folder uses GameBlocks as local building-block source material for a browser 3D shooting game.

## Copied Modules

- `gameblocks/modules/math/WorldBasis.js`
  - Reused as-is for camera target coordinate conversion and consistent world axes.
- `gameblocks/modules/math/ScalarUtils.js`
  - Reused as-is for `clamp`, `lerp`, and `smoothToward` in pointer aiming, camera motion, and frame timing.
- `gameblocks/modules/math/Vector3Utils.js`
  - Reused as-is because the camera rig depends on it.
- `gameblocks/modules/math/RandomUtils.js`
  - Reused as-is for deterministic enemy wave and lane variation.
- `gameblocks/modules/camera/BaseCameraRig.js`
  - Reused as-is as the base class for the follow camera rig.
- `gameblocks/modules/camera/PositionFollowCameraRig.js`
  - Reused as-is for the mobile third-person shooter camera.
- `gameblocks/modules/user-interface/UiStateModel.js`
  - Reused as-is for HUD state updates.
- `gameblocks/modules/user-interface/DomHudRenderer.js`
  - Reused as-is for score, best score, HP, combo meter, and toast bindings.
- `gameblocks/modules/world/Object3DUtils.js`
  - Reused as-is for cleanup of spawned enemies, bullets, and effects.

## Integration Notes

- Runtime entrypoint: `src/game.js`
- Three.js is loaded from the GameBlocks-compatible CDN import map in `index.html`.
- Simulation state lives in `NineShooterGame`; Three.js objects are render adapters.
- The game is designed for mobile portrait one-handed play: drag horizontally to aim, auto-fire handles shooting.
