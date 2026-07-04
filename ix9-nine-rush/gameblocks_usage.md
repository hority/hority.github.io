# GameBlocks Usage

This folder uses GameBlocks as local building-block source material for the browser 3D runtime.

## Copied Modules

- `gameblocks/modules/math/WorldBasis.js`
  - Reused as-is for the right-handed world basis and camera target coordinate conversion.
- `gameblocks/modules/math/ScalarUtils.js`
  - Reused as-is for `clamp`, `lerp`, and `smoothToward` in player control and frame timing.
- `gameblocks/modules/math/Vector3Utils.js`
  - Reused as-is because the camera rig depends on it.
- `gameblocks/modules/math/RandomUtils.js`
  - Reused as-is for deterministic lane and spawn variation.
- `gameblocks/modules/camera/BaseCameraRig.js`
  - Reused as-is as the base class for the follow camera rig.
- `gameblocks/modules/camera/PositionFollowCameraRig.js`
  - Reused as-is for the mobile third-person runner camera.
- `gameblocks/modules/user-interface/UiStateModel.js`
  - Reused as-is for HUD state updates.
- `gameblocks/modules/user-interface/DomHudRenderer.js`
  - Reused as-is for score, best score, level, combo meter, and toast bindings.
- `gameblocks/modules/world/Object3DUtils.js`
  - Reused as-is for cleanup of spawned pickups, obstacles, gates, and short-lived effects.

## Integration Notes

- Runtime entrypoint: `src/game.js`
- Three.js is loaded from the GameBlocks-compatible CDN import map in `index.html`.
- The game keeps simulation state in `NineRushGame` and treats Three.js objects as render adapters.
- Dynamic object cleanup uses `disposeObject3D`; repeated world pieces and player meshes are persistent.

## Theme Sources Used

- IX-Party: Saga Smart Community page identifies it as a DX study group centered on young business owners in Imari, Saga, and explains the IX / Nine naming.
- 九伊万里絵: Public Instagram profile text identifies her as IX-Party's virtual PR character.
- Imari ware: Imari City's Old Imari page informed the porcelain colors and dish motif.
