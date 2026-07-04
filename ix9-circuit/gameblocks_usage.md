# GameBlocks usage

This page keeps the IX-Party browser game structure used by the other pages and imports a small local copy of GameBlocks modules.

- `UiStateModel` and `DomHudRenderer` drive the DOM HUD without mixing UI mutation into the render loop.
- `clamp`, `lerp`, and `smoothToward` keep steering, speed, and camera values stable across frame rates.
- `DEFAULT_WORLD_BASIS` is kept as the shared world orientation contract for camera and planar movement.
- `RandomGenerator` provides deterministic decoration variation from a page-local seed.
- `disposeObject3D` is used for temporary race effects.

The racing line and track collision are intentionally lightweight: the car follows a closed Three.js curve, while steering changes lateral offset inside the course. This keeps the mobile GitHub Pages build fast and predictable.
