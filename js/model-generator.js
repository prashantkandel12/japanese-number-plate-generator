/**
 * model-generator.js
 * Converts a plate config → extruded Three.js geometry → STL download.
 *
 * Pipeline:
 *  1. Load font via opentype.js (CDN auto-load, fallback to user-uploaded file)
 *  2. Build base plate geometry (rounded rect + optional hole) via ExtrudeGeometry
 *  3. For each text element: font.getPath() → SVGLoader shapes → ExtrudeGeometry
 *  4. Merge all geometries, create mesh, render to 3D viewer
 *  5. STLExporter → Blob → download
 */

import * as THREE from 'three';
import { OrbitControls }         from 'three/addons/controls/OrbitControls.js';
import { SVGLoader }             from 'three/addons/loaders/SVGLoader.js';
import { STLExporter }           from 'three/addons/exporters/STLExporter.js';
import { mergeGeometries }       from 'three/addons/utils/BufferGeometryUtils.js';

import {
  PLATE_W, PLATE_H, BORDER, CORNER_R,
  HOLE_R, HOLE_CX, HOLE_CY,
  PLATE_TYPES,
} from './plate-data.js';

import { LAYOUT, getHoleCenter } from './svg-generator.js';

// ─── FONT URLS (try in order) ─────────────────────────────────────
// Japanese font (kanji + hiragana) — local asset first, then CDN
const FONT_URLS = [
  'assets/fonts/m-plus-1p-800.woff',
  'https://cdn.jsdelivr.net/npm/@fontsource/m-plus-1p@5/files/m-plus-1p-japanese-800-normal.woff',
  'https://cdn.jsdelivr.net/npm/@fontsource/m-plus-1p/files/m-plus-1p-japanese-800-normal.woff',
  'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-jp@5.1.0/files/noto-sans-jp-japanese-700-normal.woff',
];

// Number font (digits 0-9, separators) — Big Shoulders Display Black
const NUM_FONT_URLS = [
  'assets/fonts/big-shoulders-900.woff',
  'https://cdn.jsdelivr.net/npm/@fontsource/big-shoulders-display/files/big-shoulders-display-latin-900-normal.woff',
  'https://cdn.jsdelivr.net/npm/@fontsource/big-shoulders-display@5/files/big-shoulders-display-latin-900-normal.woff',
];

// ─── MODULE STATE ─────────────────────────────────────────────────
let _font = null;           // loaded opentype.Font (Japanese)
let _numFont = null;        // loaded opentype.Font (digits)
let _scene, _camera, _renderer, _controls, _mesh;
let _stlData = null;        // cached STL binary
let _lastBaseGeo = null;    // cached for 3MF export
let _lastTextGeo = null;    // cached for 3MF export
let _lastBorderGeo = null;  // cached for 3MF export
let _lastConfig  = null;    // cached for 3MF color lookup

// ─── FONT LOADING ─────────────────────────────────────────────────

/** Try URLs in sequence; rejects with the last error if all fail. */
async function tryLoadFont(urls) {
  let lastErr;
  for (const url of urls) {
    try {
      const font = await new Promise((resolve, reject) => {
        // opentype.js is loaded as UMD global before this module
        window.opentype.load(url, (err, f) => err ? reject(err) : resolve(f));
      });
      return font;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Load font from CDN. Returns opentype.Font.
 * Throws if all CDN URLs fail (caller should prompt user upload).
 */
export async function loadFontAuto(onStatus) {
  if (_font && _numFont) return _font;
  onStatus?.('Downloading fonts…');
  try {
    [_font, _numFont] = await Promise.all([
      _font    || tryLoadFont(FONT_URLS),
      _numFont || tryLoadFont(NUM_FONT_URLS).catch(() => null), // non-fatal
    ]);
    if (!_numFont) _numFont = _font; // fallback: use same font
    onStatus?.('Fonts loaded ✓');
    return _font;
  } catch (err) {
    onStatus?.('CDN font failed — please upload a font file');
    throw err;
  }
}

/**
 * Load font from a user-supplied File object.
 */
export async function loadFontFromFile(file) {
  const buffer = await file.arrayBuffer();
  _font = window.opentype.parse(buffer);
  _numFont = _font; // user-uploaded font used for both
  return _font;
}

export function getFont() { return _font; }

// ─── GEOMETRY BUILDERS ───────────────────────────────────────────

/**
 * Build a Three.js Shape for a rounded rectangle.
 * Uses THREE.Shape.absarc for corners.
 */
function makeRoundedRectShape(x, y, w, h, r) {
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(x + w, y + h - r);
  shape.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  shape.lineTo(x + r, y + h);
  shape.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(x, y + r);
  shape.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  shape.closePath();
  return shape;
}

/**
 * Add a circular hole as a hole path in a Shape.
 */
function addCircleHole(shape, cx, cy, r) {
  const hole = new THREE.Path();
  hole.absarc(cx, cy, r, 0, Math.PI * 2, true); // true = counter-clockwise = hole
  shape.holes.push(hole);
}

/**
 * Convert an opentype.Path to one or more THREE.Shape objects.
 * Uses SVGLoader.createShapes() internally after converting to SVG path data.
 */
function opentypePathToShapes(otPath) {
  const pathData = otPath.toPathData(4);
  if (!pathData || pathData.trim() === '') return [];
  try {
    // SVGLoader.parse() is an instance method that accepts SVG XML text
    const loader = new SVGLoader();
    const svgText = `<svg xmlns="http://www.w3.org/2000/svg"><path fill="#000000" d="${pathData}"/></svg>`;
    const parsed  = loader.parse(svgText);
    const shapes  = [];
    for (const p of parsed.paths) {
      const s = SVGLoader.createShapes(p);
      shapes.push(...s);
    }
    return shapes;
  } catch {
    return [];
  }
}

// ─── MAIN 3D BUILD ────────────────────────────────────────────────

/**
 * Generate the full plate 3D geometry.
 * The coordinate system is: 1 unit = 1 mm.
 * Origin = bottom-left of plate.
 * Z = 0 is the back face, z = plateThickness is the front face.
 * Text protrudes from z = plateThickness to z = plateThickness + textDepth.
 *
 * Three.js extrudes along +Z. We flip the plate flat (in XY) and the text
 * protrudes upward in Z. For printing: lay flat with back face on bed.
 */
export function buildPlate3D(config) {
  if (!_font) throw new Error('Font not loaded. Call loadFontAuto() first.');

  const {
    plateType,
    prefecture,
    classification,
    hiragana,
    serial,
    keychainHole,
    plateThickness,
    textDepth,
    holeRadius,
  } = config;

  // Separate geometry buckets so we can assign different colors
  const baseGeos   = [];   // plate body               → bg color
  const textGeos   = [];   // raised characters          → text color
  const borderGeos = [];   // border ridge               → border color

  // ── 1. PLATE BASE ──────────────────────────────────────────────
  const plateShape = makeRoundedRectShape(0, 0, PLATE_W, PLATE_H, CORNER_R + 2);
  if (keychainHole) {
    const { cx: holeCX, cy: holeCY } = getHoleCenter(config);
    addCircleHole(plateShape, holeCX, PLATE_H - holeCY, holeRadius ?? HOLE_R);
  }
  baseGeos.push(new THREE.ExtrudeGeometry(plateShape, {
    depth: plateThickness,
    bevelEnabled: false,
  }));

  // ── 2. BORDER RIDGE ────────────────────────────────────────────
  // Kept as a separate raised ring in the TEXT geometry so the plate base
  // is a single clean solid (avoids non-manifold edges from overlap).
  {
    const borderOuter = makeRoundedRectShape(
      BORDER / 2, BORDER / 2,
      PLATE_W - BORDER, PLATE_H - BORDER,
      CORNER_R,
    );
    const borderInnerPts = makeRoundedRectShape(
      BORDER * 1.5, BORDER * 1.5,
      PLATE_W - BORDER * 3, PLATE_H - BORDER * 3,
      Math.max(CORNER_R - 2, 1),
    ).getPoints(64);
    borderOuter.holes.push(new THREE.Path(borderInnerPts));
    // Extrude from z=0; textGeo translation will place it starting from the plate
    // front face. Override depth so ridge is just textDepth above the plate surface.
    const borderDepth = Math.min(textDepth * 0.6, 0.8);
    const borderGeo = new THREE.ExtrudeGeometry(borderOuter, {
      depth: borderDepth,
      bevelEnabled: false,
    });
    borderGeos.push(borderGeo);
  }

  // ── 3. TEXT EXTRUSIONS ─────────────────────────────────────────
  // Text extrudes by textDepth only; the merged geometry is translated
  // to sit on top of the front plate face (z = plateThickness in plate space).
  const textExtrudeDepth = textDepth;

  /** Return true for digits and separators — these use _numFont. */
  function isNumChar(ch) {
    return /[0-9\-\. ]/.test(ch); // · (middle dot) intentionally excluded — uses Japanese font
  }

  /**
   * Extrude each character of `str` starting at (x, baselineY) in SVG space.
   * Uses _numFont for digits/separators, _font for kanji/hiragana.
   * letterSpacing: extra mm added after each character's advance width.
   */
  function extrudeText(str, x, baselineY, fontSize, letterSpacing = 0) {
    let cursorX = x;
    for (const char of str) {
      if (char === ' ') {
        cursorX += fontSize * 0.3;
        continue;
      }
      // Special case: '·' — render as a manual circle at correct vertical centre
      // opentype.js glyph rendering varies by CDN font; a circle is always correct.
      if (char === '·') {
        const f = _font;
        const dotGlyph = f.charToGlyph('·');
        const advance  = dotGlyph
          ? Math.min((dotGlyph.advanceWidth / f.unitsPerEm) * fontSize, fontSize * 0.6)
          : fontSize * 0.55;
        const dotR  = fontSize * 0.09;
        const dotCx = cursorX + advance * 0.5;
        // Dot vertically centred at mid-cap of digits:
        // Three.js Y = (PLATE_H - baselineY) + fontSize * 0.36
        // (opentype paths have negative Y for ascenders, so we ADD the offset)
        const dotCy = (PLATE_H - baselineY) + fontSize * 0.36;
        const circle = new THREE.Shape();
        circle.absarc(dotCx, dotCy, dotR, 0, Math.PI * 2, false);
        textGeos.push(new THREE.ExtrudeGeometry(circle, { depth: textExtrudeDepth, bevelEnabled: false }));
        cursorX += advance;
        continue;
      }
      const f = isNumChar(char) ? _numFont : _font;
      const otPath = f.getPath(char, 0, 0, fontSize);
      const shapes  = opentypePathToShapes(otPath);
      const glyph   = f.charToGlyph(char);
      const advance = glyph ? (glyph.advanceWidth / f.unitsPerEm) * fontSize : fontSize;

      for (const shape of shapes) {
        const flipY = (p) => new THREE.Vector2(
          p.x + cursorX,
          (PLATE_H - baselineY) - p.y,
        );
        // Reverse restores correct winding after Y-flip
        const outer = shape.getPoints(48).map(flipY).reverse();
        const translated = new THREE.Shape(outer);

        for (const hole of shape.holes) {
          const hFlipped = hole.getPoints(32).map(flipY).reverse();
          translated.holes.push(new THREE.Path(hFlipped));
        }

        textGeos.push(new THREE.ExtrudeGeometry(translated, {
          depth: textExtrudeDepth,
          bevelEnabled: false,
        }));
      }
      cursorX += advance + letterSpacing;
    }
    return cursorX;
  }

  const {
    PAD_X, VSEP_X,
    FS_PREFECTURE, FS_CLASSIFICATION,
    FS_HIRAGANA, FS_SERIAL,
    BOT_ROW_MID_Y,
    TOP_ROW_BASELINE, BOT_ROW_BASELINE,
  } = LAYOUT;

  if (!_font) throw new Error('Font not loaded.');
  if (!_numFont) _numFont = _font;

  // Top row — each char uses its specific font
  const TOP_GAP = FS_CLASSIFICATION * 0.2;
  const topStr = `${prefecture || ''}${classification || ''}`;
  let topW = 0;
  for (const ch of topStr) {
    const f = isNumChar(ch) ? _numFont : _font;
    const g = f.charToGlyph(ch);
    topW += (g ? (g.advanceWidth / f.unitsPerEm) * FS_CLASSIFICATION : FS_CLASSIFICATION) + TOP_GAP;
  }
  topW -= TOP_GAP; // no trailing gap

  // Custom extrude that applies the letter-spacing gap and per-char font
  {
    let curX = PLATE_W / 2 - topW / 2;
    for (const char of topStr) {
      const f = isNumChar(char) ? _numFont : _font;
      const otPath = f.getPath(char, 0, 0, FS_CLASSIFICATION);
      const shapes  = opentypePathToShapes(otPath);
      const glyph   = f.charToGlyph(char);
      const advance = (glyph ? (glyph.advanceWidth / f.unitsPerEm) * FS_CLASSIFICATION : FS_CLASSIFICATION) + TOP_GAP;
      for (const shape of shapes) {
        const flipY = (p) => new THREE.Vector2(p.x + curX, (PLATE_H - TOP_ROW_BASELINE) - p.y);
        const outer = shape.getPoints(48).map(flipY).reverse();
        const translated = new THREE.Shape(outer);
        for (const hole of shape.holes) {
          translated.holes.push(new THREE.Path(hole.getPoints(32).map(flipY).reverse()));
        }
        textGeos.push(new THREE.ExtrudeGeometry(translated, { depth: textExtrudeDepth, bevelEnabled: false }));
      }
      curX += advance;
    }
  }

  // Hiragana — vertically centred at BOT_ROW_MID_Y (baseline offset = FS*0.35 so cap midpoint = BOT_ROW_MID_Y)
  const hirCenterX = (VSEP_X - PAD_X) / 2 + PAD_X;
  const hirGlyph   = _font.charToGlyph(hiragana || 'た');
  const hirW       = hirGlyph ? (hirGlyph.advanceWidth / _font.unitsPerEm) * FS_HIRAGANA : FS_HIRAGANA;
  extrudeText(hiragana || '', hirCenterX - hirW / 2, BOT_ROW_MID_Y + FS_HIRAGANA * 0.35, FS_HIRAGANA);

  // Serial (centered in right panel) — replace '.' with middle dot '·' (U+00B7)
  const serialLS   = FS_SERIAL * 0.1;  // proportional letter-spacing (same as SVG)
  const serialFull = ((serial || '').trim() || ' ').replace(/\./g, '·').padEnd(6, ' ');
  const serAreaW   = PLATE_W - (VSEP_X + 10) - PAD_X - 6;
  let serW = 0;
  for (const ch of serialFull) {
    if (ch === ' ') { serW += FS_SERIAL * 0.3; continue; }
    if (ch === '·') { serW += FS_SERIAL * 0.55 + serialLS; continue; }
    const g = _numFont.charToGlyph(ch);
    serW += (g ? (g.advanceWidth / _numFont.unitsPerEm) * FS_SERIAL : FS_SERIAL) + serialLS;
  }
  extrudeText(serialFull,
    VSEP_X + 10 + Math.max(0, (serAreaW - serW) / 2),
    BOT_ROW_BASELINE, FS_SERIAL, serialLS);

  // ── 4. MERGE EACH GROUP ────────────────────────────────────────
  const cx = -PLATE_W / 2;
  const cy = -PLATE_H / 2;
  const cz = -plateThickness / 2;

  const baseGeo = mergeGeometries(baseGeos);
  baseGeo.translate(cx, cy, cz);
  for (const g of baseGeos) g.dispose();

  let borderGeo = null;
  if (borderGeos.length > 0) {
    borderGeo = mergeGeometries(borderGeos);
    borderGeo.translate(cx, cy, cz + plateThickness);
    for (const g of borderGeos) g.dispose();
  }

  let textGeo = null;
  if (textGeos.length > 0) {
    textGeo = mergeGeometries(textGeos);
    // Offset by +plateThickness so text starts at the front face, not the back
    textGeo.translate(cx, cy, cz + plateThickness);
    for (const g of textGeos) g.dispose();
  }

  return { baseGeo, textGeo, borderGeo };
}

// ─── THREE.JS SCENE SETUP ─────────────────────────────────────────

export function initViewer(canvas) {
  const w = canvas.clientWidth  || 600;
  const h = canvas.clientHeight || 262;

  _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  _renderer.setPixelRatio(window.devicePixelRatio);
  _renderer.setSize(w, h, false);
  _renderer.setClearColor(0x111111, 1);

  _scene = new THREE.Scene();

  _camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 2000);
  _camera.position.set(0, -80, 260);
  _camera.lookAt(0, 0, 0);

  // Lights
  _scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(100, -100, 200);
  _scene.add(dir);
  const dir2 = new THREE.DirectionalLight(0x88bbff, 0.4);
  dir2.position.set(-100, 100, 50);
  _scene.add(dir2);

  _controls = new OrbitControls(_camera, _renderer.domElement);
  _controls.enableDamping = true;
  _controls.dampingFactor = 0.07;
  _controls.minDistance = 50;
  _controls.maxDistance = 800;

  // Render loop
  function animate() {
    requestAnimationFrame(animate);
    _controls.update();
    _renderer.render(_scene, _camera);
  }
  animate();

  // Resize observer
  const ro = new ResizeObserver(() => {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    _renderer.setSize(cw, ch, false);
    _camera.aspect = cw / ch;
    _camera.updateProjectionMatrix();
  });
  ro.observe(canvas);
}

/**
 * Update the 3D viewer with new geometry (two-color: plate + text).
 * Returns the THREE.Group added to the scene.
 */
export function updateViewer(config) {
  if (!_scene) return null;

  const { baseGeo, textGeo, borderGeo } = buildPlate3D(config);
  const theme = PLATE_TYPES[config.plateType] || PLATE_TYPES.private;

  // Cache for 3MF export BEFORE disposing old refs
  _lastBaseGeo   = baseGeo;
  _lastTextGeo   = textGeo;
  _lastBorderGeo = borderGeo;
  _lastConfig    = config;

  // Remove previous model
  if (_mesh) {
    _scene.remove(_mesh);
    if (_mesh.isGroup) {
      _mesh.traverse(child => {
        if (child.isMesh) {
          child.geometry?.dispose();
          child.material?.dispose();
        }
      });
    } else {
      _mesh.geometry?.dispose();
      _mesh.material?.dispose();
    }
  }

  const group = new THREE.Group();

  // ── Plate body (bg color) ──────────────────────────────
  const rawBgVal = (_lastConfig?.customBg) || theme.bg;
  const bgColor = new THREE.Color(rawBgVal);
  // Add slight warmth to white so it doesn't look flat
  if (rawBgVal.toUpperCase() === '#FFFFFF') bgColor.set(0xf5f5f0);

  const baseMat = new THREE.MeshPhongMaterial({
    color: bgColor,
    specular: new THREE.Color(0x888888),
    shininess: 90,
    side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(baseGeo, baseMat));

  // ── Text glyphs (text color) ──────────────────────────────
  if (textGeo) {
    const rawTextVal = (_lastConfig?.customText) || theme.text;
    const textMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(rawTextVal),
      specular: new THREE.Color(0x444444),
      shininess: 50,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(textGeo, textMat));
  }

  // ── Border ridge (border color) ──────────────────────────
  if (borderGeo) {
    const rawBorderVal = (_lastConfig?.customBorder) || theme.border;
    const borderMat = new THREE.MeshPhongMaterial({
      color: new THREE.Color(rawBorderVal),
      specular: new THREE.Color(0x888888),
      shininess: 80,
      side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(borderGeo, borderMat));
  }

  _scene.add(group);
  _mesh = group;

  // Auto-fit camera
  const box  = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  const dist = Math.max(size.x, size.y, size.z) * 1.8;
  _camera.position.set(0, -dist * 0.3, dist * 0.9);
  _camera.lookAt(0, 0, 0);
  _controls.reset();

  // Cache STL — merge all geos into one for single-body export
  const exporter2 = new STLExporter();
  const allGeos = [baseGeo.clone()];
  if (textGeo) allGeos.push(textGeo.clone());
  if (borderGeo) allGeos.push(borderGeo.clone());
  const stlGeos = allGeos.length > 1 ? mergeGeometries(allGeos) : allGeos[0];
  _stlData = exporter2.parse(new THREE.Mesh(stlGeos), { binary: true });
  stlGeos.dispose();

  return group;
}

// ─── STL EXPORT ──────────────────────────────────────────────────

/**
 * Download a ZIP containing two STL files — one per color body.
 * When imported into Bambu Studio / PrusaSlicer as separate objects,
 * each can be assigned a different filament color.
 */
export async function downloadSTL(filename = 'jp-plate.stl') {
  if (!_lastBaseGeo) throw new Error('No 3D model generated yet.');
  if (!window.JSZip)  throw new Error('JSZip not loaded.');

  const base = filename.replace(/\.stl$/i, '');
  const zip  = new window.JSZip();
  const exporter = new STLExporter();

  // Determine if border shares a color with plate or text, and merge accordingly
  const theme2  = PLATE_TYPES[(_lastConfig?.plateType) || 'private'] || PLATE_TYPES.private;
  const cfg2    = _lastConfig || {};
  const n = (c) => (c || '').replace(/^#/, '').toUpperCase();
  const bgN     = n(cfg2.customBg     || theme2.bg);
  const textN   = n(cfg2.customText   || theme2.text);
  const borderN = n(cfg2.customBorder || theme2.border);

  // Geos for each STL body
  const plateBodyGeos = [_lastBaseGeo.clone()];
  const textBodyGeos  = _lastTextGeo ? [_lastTextGeo.clone()] : [];
  if (_lastBorderGeo) {
    if (borderN === bgN) {
      plateBodyGeos.push(_lastBorderGeo.clone());
    } else if (borderN === textN) {
      textBodyGeos.push(_lastBorderGeo.clone());
    } else {
      // Unique border color — separate file
      const borderStlGeo = _lastBorderGeo.clone();
      const borderStl = exporter.parse(new THREE.Mesh(borderStlGeo), { binary: false });
      borderStlGeo.dispose();
      zip.file(`${base}-border.stl`, borderStl);
    }
  }

  const plateGeo = plateBodyGeos.length > 1 ? mergeGeometries(plateBodyGeos) : plateBodyGeos[0];
  const baseStl  = exporter.parse(new THREE.Mesh(plateGeo), { binary: false });
  if (plateBodyGeos.length > 1) plateGeo.dispose();
  else plateBodyGeos.forEach(g => g.dispose());

  zip.file(`${base}-plate.stl`, baseStl);

  if (textBodyGeos.length > 0) {
    const textGeo2 = textBodyGeos.length > 1 ? mergeGeometries(textBodyGeos) : textBodyGeos[0];
    const textStl  = exporter.parse(new THREE.Mesh(textGeo2), { binary: false });
    if (textBodyGeos.length > 1) textGeo2.dispose();
    else textBodyGeos.forEach(g => g.dispose());
    zip.file(`${base}-text.stl`, textStl);
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${base}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
// ─── 3MF EXPORT (colored, scaled) ────────────────────────────────

/**
 * Export the plate as a colored 3MF file compatible with Bambu Studio AMS.
 * Contains:
 *   3D/3dmodel.model     — two mesh objects, one per color
 *   Metadata/model_settings.config — Bambu extruder assignment (obj 2 → E1, obj 3 → E2)
 *
 * printLengthMm: desired physical width (default 70 mm).
 */
export async function download3MF(filename = 'jp-plate.3mf', printLengthMm = 70) {
  if (!_lastBaseGeo) throw new Error('No 3D model generated yet.');
  if (!window.JSZip)  throw new Error('JSZip not loaded.');

  const theme = PLATE_TYPES[(_lastConfig?.plateType) || 'private'] || PLATE_TYPES.private;
  const _cfg  = _lastConfig || {};
  const scale = printLengthMm / PLATE_W;

  /** Convert a BufferGeometry to 3MF <mesh> XML, applying scale. */
  function geoToMeshXML(geo) {
    const g   = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    const n   = pos.count;
    const verts = [];
    for (let i = 0; i < n; i++) {
      verts.push(`<vertex x="${(pos.getX(i) * scale).toFixed(4)}" y="${(pos.getY(i) * scale).toFixed(4)}" z="${(pos.getZ(i) * scale).toFixed(4)}"/>`);
    }
    const tris = [];
    for (let i = 0; i < n; i += 3) {
      tris.push(`<triangle v1="${i}" v2="${i + 1}" v3="${i + 2}"/>`);
    }
    if (g !== geo) g.dispose();
    return `<mesh><vertices>${verts.join('')}</vertices><triangles>${tris.join('')}</triangles></mesh>`;
  }

  const rawBg     = _cfg.customBg     || theme.bg;
  const rawText   = _cfg.customText   || theme.text;
  const rawBorder = _cfg.customBorder || theme.border;

  // Normalize: treat #FFFFFF as off-white for display, compare originals for slot assignment
  const norm = (c) => c.replace(/^#/, '').toUpperCase();
  const bgNorm     = norm(rawBg);
  const textNorm   = norm(rawText);
  const borderNorm = norm(rawBorder);

  const bgColor     = rawBg.toUpperCase()     === '#FFFFFF' ? '#F5F5F0' : rawBg.toUpperCase();
  const textColor   = rawText.toUpperCase();
  const borderColor = rawBorder.toUpperCase() === '#FFFFFF' ? '#F5F5F0' : rawBorder.toUpperCase();

  // Decide which extruder slot the border belongs to (Bambu uses 1-indexed slots)
  // If border color matches bg → share extruder 1 (plate slot)
  // If border color matches text → share extruder 2 (text slot)
  // Otherwise → own extruder 3
  const borderSlot = borderNorm === bgNorm ? 1 : borderNorm === textNorm ? 2 : 3;

  const baseMeshXML   = geoToMeshXML(_lastBaseGeo);
  const textMeshXML   = _lastTextGeo   ? geoToMeshXML(_lastTextGeo)   : null;
  const borderMeshXML = _lastBorderGeo ? geoToMeshXML(_lastBorderGeo) : null;

  // Build materials list (only include border material if it's a unique 3rd color)
  const extraMaterial = borderSlot === 3
    ? `\n      <base name="Border" displaycolor="${borderColor}"/>`
    : '';

  const textObject   = textMeshXML
    ? `<object id="3" name="Text" type="model" pid="1" pindex="1">${textMeshXML}</object>`
    : '';
  const borderPindex = borderSlot === 1 ? 0 : borderSlot === 2 ? 1 : 2;
  const borderObject = borderMeshXML
    ? `<object id="4" name="Border" type="model" pid="1" pindex="${borderPindex}">${borderMeshXML}</object>`
    : '';
  const buildItems = []
    .concat('<item objectid="2"/>')
    .concat(textMeshXML   ? '<item objectid="3"/>' : [])
    .concat(borderMeshXML ? '<item objectid="4"/>' : [])
    .join('');

  const modelXML = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06">
  <resources>
    <basematerials id="1">
      <base name="Plate" displaycolor="${bgColor}"/>
      <base name="Text"  displaycolor="${textColor}"/>${extraMaterial}
    </basematerials>
    <object id="2" name="Plate" type="model" pid="1" pindex="0">${baseMeshXML}</object>
    ${textObject}
    ${borderObject}
  </resources>
  <build>${buildItems}</build>
</model>`;

  // Bambu Studio uses 1-indexed extruder slots: value="1" = Filament 1, value="2" = Filament 2
  const settingsXML = `<?xml version="1.0" encoding="utf-8"?>
<config>
  <object id="2" instances_added="1">
    <metadata key="name" value="Plate"/>
    <metadata key="extruder" value="1"/>
  </object>${textMeshXML ? `
  <object id="3" instances_added="1">
    <metadata key="name" value="Text"/>
    <metadata key="extruder" value="2"/>
  </object>` : ''}${borderMeshXML ? `
  <object id="4" instances_added="1">
    <metadata key="name" value="Border"/>
    <metadata key="extruder" value="${borderSlot}"/>
  </object>` : ''}
</config>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels"   ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="model"  ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
  <Override PartName="/Metadata/model_settings.config" ContentType="application/xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel0"
    Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;

  const zip = new window.JSZip();
  zip.file('[Content_Types].xml', contentTypes);
  zip.folder('_rels').file('.rels', rels);
  zip.folder('3D').file('3dmodel.model', modelXML);
  zip.folder('Metadata').file('model_settings.config', settingsXML);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

// ─── VIDEO EXPORT ─────────────────────────────────────────────────

/**
 * Record a 5-second (default) rotating video of the 3D viewer.
 * The camera orbits 360° around the model and the result is downloaded as WebM.
 * @param {HTMLCanvasElement} canvas  - The Three.js renderer canvas
 * @param {number} durationMs         - Duration in ms (default 5000)
 * @param {function} onProgress       - Optional callback(0..1)
 */
export function captureRotationVideo(canvas, durationMs = 5000, onProgress) {
  return new Promise((resolve, reject) => {
    if (!_scene || !_camera || !_renderer) {
      return reject(new Error('3D viewer not initialised.'));
    }
    if (!window.MediaRecorder) {
      return reject(new Error('MediaRecorder is not supported in this browser.'));
    }

    // Pick best supported codec
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
      .find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';

    const stream   = canvas.captureStream(60);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks   = [];

    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onerror = e => reject(e.error);

    recorder.onstop = () => {
      const videoBlob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(videoBlob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = 'jp-plate-preview.webm';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      // Re-enable orbit controls
      if (_controls) _controls.enabled = true;
      resolve();
    };

    // Snapshot of initial camera position
    const startAzimuth = Math.atan2(
      _camera.position.x,
      _camera.position.z,
    );
    const radius = Math.sqrt(
      _camera.position.x ** 2 + _camera.position.z ** 2,
    );
    const camY   = _camera.position.y;

    // Disable user interaction during recording
    if (_controls) _controls.enabled = false;

    recorder.start();
    const startTime = performance.now();

    function frame() {
      const elapsed = performance.now() - startTime;
      const t       = Math.min(elapsed / durationMs, 1);

      // Full 360° rotation
      const angle = startAzimuth + t * Math.PI * 2;
      _camera.position.set(
        Math.sin(angle) * radius,
        camY,
        Math.cos(angle) * radius,
      );
      _camera.lookAt(0, 0, 0);
      _renderer.render(_scene, _camera);

      onProgress?.(t);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        recorder.stop();
      }
    }

    requestAnimationFrame(frame);
  });
}