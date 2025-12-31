## Dev Image Tools

A lightweight, static web toolbox for common image-related utilities. The app is menu-driven (JSON config) and loads each tool as an isolated page inside an iframe, making it easy to extend and host (e.g., GitHub Pages).

## Project Structure

- [index.html](index.html): Main shell UI (sidebar + workspace iframe).
- [menu.json](menu.json): Tool registry used to render the left menu and route pages.
- [assets/css/style.css](assets/css/style.css): Global styling for the shell UI.
- [assets/js/main.js](assets/js/main.js): Builds the menu from `menu.json` and loads tools into the iframe.
- `functions/`: Self-contained tool pages (each tool lives in its own folder, usually `index.html` + optional JS/CSS).

## Built-in Tools

All tool entries are defined in [menu.json](menu.json).

- **Channel Merger** (`functions/image-tools/channel-merger`): Merge channels (R/G/B/A) from up to 4 input images, preview, then export a merged PNG at a chosen resolution.
- **Image 2 SDF** (`functions/image-tools/img-2-sdf`): Batch-generate Signed Distance Field (SDF) textures from input images using a Web Worker; supports invert input, output resolution, and max distance.
- **Gradient Tools** (`functions/image-tools/gradient-tools`): Build multi-row gradients, reorder rows, bake to an image, and store configuration in PNG metadata for reload.
- **Separate Objects** (`functions/image-tools/separate-objects`): Detect opaque connected regions, manage/merge bounding boxes, and export all regions as a ZIP.
- **Image Alpha Fill** (`functions/image-tools/img-alpha-fill`): Fill RGB values in transparent areas from nearby opaque pixels to avoid fringe artifacts; saves PNG while preserving original alpha.
- **Crop Image** (`functions/image-tools/crop-image`): Create multiple rectangular selections (Ctrl/Cmd + drag) and export each selection as a separate PNG.
- **Batch Resize Images** (`functions/image-tools/image-resizer`): Batch resize images into multiple preset/custom resolutions with different scaling modes and download as a ZIP.
- **About** (`functions/other/about`): Quick explanation of the JSON-driven extension model.

## Getting Started

Because the menu is loaded via `fetch('menu.json')`, open the project through a local web server instead of double-clicking `index.html`.

- Python (recommended):

```bash
python -m http.server 8000
```

Then open `http://localhost:8000/`.

## Extending (Add a New Tool)

- Create a new folder under `functions/` and add an `index.html` (and optional scripts/styles).
- Add a new entry into [menu.json](menu.json) with `name` and `path` pointing to the folder.
