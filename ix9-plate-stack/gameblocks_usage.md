# GameBlocks Usage

This folder uses GameBlocks as local building-block source material for a browser 3D timing/stacking game.

## Copied Modules

- `gameblocks/modules/math/WorldBasis.js`
  - Reused as-is for camera target coordinate conversion and consistent right-handed world axes.
- `gameblocks/modules/math/ScalarUtils.js`
  - Reused as-is for `clamp`, `lerp`, and `smoothToward` in plate motion, camera motion, and timing.
- `gameblocks/modules/math/Vector3Utils.js`
  - Reused as-is because the camera rig depends on it.
- `gameblocks/modules/math/RandomUtils.js`
  - Reused as-is for particle and fragment variation.
- `gameblocks/modules/camera/BaseCameraRig.js`
  - Reused as-is as the base class for the follow camera rig.
- `gameblocks/modules/camera/PositionFollowCameraRig.js`
  - Reused as-is for the rising tower camera.
- `gameblocks/modules/user-interface/UiStateModel.js`
  - Reused as-is for HUD state updates.
- `gameblocks/modules/user-interface/DomHudRenderer.js`
  - Reused as-is for score, best score, floor, combo meter, and toast bindings.
- `gameblocks/modules/world/Object3DUtils.js`
  - Reused as-is for cleanup of moving plates, trimmed fragments, and effects.

## Integration Notes

- Runtime entrypoint: `src/game.js`
- Three.js is loaded from the GameBlocks-compatible CDN import map in `index.html`.
- The game is not a runner or shooter: it is a one-tap timing stack game.
- Simulation state owns plate dimensions, overlap, score, combo, and failure; Three.js groups are render adapters.
