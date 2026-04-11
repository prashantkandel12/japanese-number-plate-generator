# 日本のナンバープレート Generator

**A free, open-source web app to design and 3D-print Japanese number plates.**

Live at → [putali.aishwarya.co.jp](https://putali.aishwarya.co.jp/)

---

## Features

- 🎌 All four plate types: Private (白), Commercial (緑), Kei Private (黄), Kei Commercial (黒)
- ✏️ Fully customizable: prefecture kanji, classification number, hiragana, serial
- 🎨 Custom colors for plate background, text, and border
- 🕳️ Optional keychain hole with preset or custom X/Y position
- 📐 Live SVG preview — updates instantly as you type
- 🖨️ **3MF export** with full AMS color support for Bambu Studio (3 separate objects: plate / text / border)
- 🗂️ **STL export** as a ZIP of per-color bodies for multi-filament PrusaSlicer / Bambu workflow
- 🎬 **5-second rotating WebM video** capture of the 3D model
- 🔗 Every setting is serialized to a shareable URL query string
- 🌙 Light / dark theme with persistent preference
- 🌐 English / Japanese UI toggle
- 📱 Responsive two-panel layout

---

## Quick Start

No build step required — plain HTML/JS with ES modules.

```bash
git clone git@github.com:prashantkandel12/japanese-number-plate-generator.git
cd japanese-number-plate-generator
python3 -m http.server 8787
# open http://localhost:8787
```

> A local HTTP server is required because the app uses ES modules and loads local font files via `fetch`. Opening `index.html` directly from the filesystem will not work.

---

## Usage

1. Select a **plate type** (top buttons)
2. Enter **prefecture**, **classification**, **hiragana**, and **serial number**
3. Optionally adjust colors, plate thickness, emboss depth, and keychain hole
4. Click **Generate 3D Model** to build the Three.js preview
5. Download as **3MF** (colored, Bambu Studio ready) or **STL ZIP** (multi-body for PrusaSlicer)

### Bambu Studio import

- Import the `.3mf` directly — Bambu will detect 3 objects (Plate / Text / Border) pre-assigned to AMS slots 1, 2, 3
- For STL: import `*-plate.stl` and `*-text.stl` as separate objects, then assign filaments manually

### Query string parameters

All settings round-trip through the URL for easy sharing:

| Param | Description |
|-------|-------------|
| `t` | Plate type (`private` / `commercial` / `kprivate` / `kcommercial`) |
| `p` | Prefecture kanji |
| `c` | Classification number |
| `h` | Hiragana character |
| `s` | Serial number |
| `th` | Plate thickness (mm) |
| `em` | Emboss depth (mm) |
| `cbg` | Custom background color (hex) |
| `ctxt` | Custom text color (hex) |
| `cbrd` | Custom border color (hex) |
| `k` | Keychain hole (`1` = on) |
| `hr` | Hole radius (mm) |
| `hp` | Hole position preset |
| `hx` / `hy` | Custom hole X / Y (mm from edge) |

---

## Tech Stack

| Library | Version | Purpose |
|---------|---------|---------|
| [Three.js](https://threejs.org/) | r165 | 3D rendering, geometry, extrusion |
| [opentype.js](https://opentype.js/) | 1.3.4 | Font glyph → SVG path → 3D shape |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | 3MF / STL ZIP packaging |
| M PLUS 1p 800 | — | Japanese kanji + hiragana |
| Big Shoulders Display 900 | — | Classification digits |

All dependencies are loaded from CDN (jsDelivr). Local WOFF fallbacks are stored in `assets/fonts/` for offline use.

---

## Project Structure

```
├── index.html              # App shell, meta tags, importmap
├── css/
│   └── styles.css          # Light/dark theme via CSS variables
├── js/
│   ├── plate-data.js       # Constants, plate types, hiragana lists, defaults
│   ├── svg-generator.js    # Live SVG preview builder
│   ├── model-generator.js  # Three.js 3D build, STL/3MF export, video capture
│   └── app.js              # UI wiring, URL state, i18n, theme toggle
└── assets/
    ├── putali-logo.png
    └── fonts/
        ├── m-plus-1p-800.woff
        └── big-shoulders-900.woff
```

---

## Contributing

PRs welcome. This project has no build toolchain — just edit and refresh.

Issues and feature requests: [github.com/prashantkandel12/japanese-number-plate-generator/issues](https://github.com/prashantkandel12/japanese-number-plate-generator/issues)

---

## License

MIT — see [LICENSE](LICENSE)

---

> This is an AI-generated open source project by [Putali](https://putali.aishwarya.co.jp/).
