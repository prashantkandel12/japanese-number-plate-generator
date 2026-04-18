/**
 * app.js — Main entry point.
 * Wires up all UI events and coordinates SVG preview + 3D generation.
 */

import { DEFAULT_CONFIG, HIRAGANA, HIRAGANA_MAP, PLATE_TYPES } from './plate-data.js';
import { buildPreviewSVG } from './svg-generator.js';
import {
  loadFontAuto,
  initViewer,
  updateViewer,
  downloadSTL,
  download3MF,
  captureRotationVideo,
} from './model-generator.js';

// ─── CURRENT CONFIG ───────────────────────────────────────────────
const config = { ...DEFAULT_CONFIG };

// ─── DOM REFS ─────────────────────────────────────────────────────
const elPrefecture      = document.getElementById('input-prefecture');
const elClassification  = document.getElementById('input-classification');
const elHiragana        = document.getElementById('input-hiragana');
const elSerial          = document.getElementById('input-serial');
const elSerialError     = document.getElementById('serial-error');
const elThickness       = document.getElementById('input-thickness');
const elThicknessVal    = document.getElementById('thickness-val');
const elEmboss          = document.getElementById('input-emboss');
const elEmbossVal       = document.getElementById('emboss-val');
const elKeychain        = document.getElementById('input-keychain');
const elHoleRadiusSection = document.getElementById('hole-radius-section');
const elHoleRadius      = document.getElementById('input-hole-radius');
const elHoleRadiusVal   = document.getElementById('hole-radius-val');
const elHolePos         = document.getElementById('input-hole-pos');
const elHoleCustomXY    = document.getElementById('hole-custom-xy');
const elHoleX           = document.getElementById('input-hole-x');
const elHoleXVal        = document.getElementById('hole-x-val');
const elHoleY           = document.getElementById('input-hole-y');
const elHoleYVal        = document.getElementById('hole-y-val');
const elFontStatus      = { textContent: '' }; // status sink (no UI element)
const elColorBg         = document.getElementById('input-color-bg');
const elColorText       = document.getElementById('input-color-text');
const elColorBorder     = document.getElementById('input-color-border');
const elChkBorderText   = document.getElementById('chk-border-text');
const elSvgPreview      = document.getElementById('svg-preview');
const elBtnSvg          = document.getElementById('btn-svg');
const elBtnGenerate     = document.getElementById('btn-generate');
const elBtnStl          = document.getElementById('btn-stl');          // 3MF
const elBtnStlPlain     = document.getElementById('btn-stl-plain');    // STL
const elBtnVideo        = document.getElementById('btn-video');        // Video
const elBtnShare        = document.getElementById('btn-share');
const elBtnLang         = document.getElementById('btn-lang');
const elBtnTheme        = document.getElementById('btn-theme');
const elPrintLength     = document.getElementById('input-print-length');
const elPrintLengthVal  = document.getElementById('print-length-val');
const elPrintabilityNote = document.getElementById('printability-note');
const elThreePlaceholder = document.getElementById('three-placeholder');
const elThreeCanvas     = document.getElementById('three-canvas');
const elTypeGroup       = document.getElementById('plate-type-group');

// ─── HIRAGANA SELECT ──────────────────────────────────────────────
function populateHiragana() {
  const list = HIRAGANA[HIRAGANA_MAP[config.plateType]] || HIRAGANA.private;
  elHiragana.innerHTML = '';
  for (const h of list) {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    if (h === config.hiragana) opt.selected = true;
    elHiragana.appendChild(opt);
  }
  // Fallback: if current hiragana not in new list, pick first
  if (!list.includes(config.hiragana)) {
    config.hiragana = list[0];
    elHiragana.value = config.hiragana;
  }
}

// ─── SERIAL VALIDATION ───────────────────────────────────────────
/**
 * Validate serial number.
 * Allowed chars: 0-9, dash (-), dot (.), space
 * Max 6 chars.
 */
function validateSerial(s) {
  return /^[0-9\-\. ]{0,6}$/.test(s);
}

function parseFiniteNumber(value) {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : null;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseHexColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value.toUpperCase() : null;
}

// ─── I18N ─────────────────────────────────────────────────────────
const I18N = {
  en: {
    appTitle: 'Japanese Number Plate Generator',
    appSub: '3D Print & Download',
    plateType: 'Plate Type',
    prefecture: 'Region / Prefecture',
    prefLabel: 'Prefecture Kanji',
    prefHint: '(e.g. \u91ce\u7530, \u54c1\u5ddd)',
    classification: 'Classification Number',
    classLabel: '1\u20133 digits',
    classHint: '(e.g. 530)',
    hiragana: 'Hiragana Character',
    serial: 'Serial Number',
    serialLabel: 'Format: XX-XX or \u00b79 77',
    options3d: '3D Options',
    thickness: 'Plate Thickness',
    emboss: 'Text Emboss Depth',
    keychainHole: 'Keychain Hole',
    holeRadius: 'Hole Radius',
    holePos: 'Position',
    printLength: 'Print Length',
    fontSection: 'Font File',
    btnSvg: '\u2b07 Download SVG',
    btnGenerate: '\u2699 Generate 3D Model',
    btnStl: '\u2b07 STL',
    btn3mf: '\u2b07 3MF',
    colors: 'Colors',
    colorBg: 'Plate Background',
    colorText: 'Text & Characters',
    colorBorder: 'Border',
    borderSameAsText: 'Border same as text color',
    resetColors: '↺ Reset',
    posTopLeft: '↖ Top Left',
    posTopCenter: '↑ Top Center',
    posTopRight: '↗ Top Right',
    posBotLeft: '↙ Bottom Left',
    posBotCenter: '↓ Bottom Center',
    posBotRight: '↘ Bottom Right',
    posCustom: '✎ Custom X / Y',
    holeXFrom: 'X from left',
    holeYFrom: 'Y from top',
  },
  ja: {
    appTitle: '\u65e5\u672c\u306e\u30ca\u30f3\u30d0\u30fc\u30d7\u30ec\u30fc\u30c8 \u30b8\u30a7\u30cd\u30ec\u30fc\u30bf\u30fc',
    appSub: '3D\u30d7\u30ea\u30f3\u30c8\u7528',
    plateType: '\u30d7\u30ec\u30fc\u30c8\u7a2e\u5225',
    prefecture: '\u767b\u9332\u5730\u57df',
    prefLabel: '\u5730\u57df\u540d\uff08\u6f22\u5b57\uff09',
    prefHint: '(\u4f8b: \u91ce\u7530, \u54c1\u5ddd)',
    classification: '\u5206\u985e\u756a\u53f7',
    classLabel: '1\u20133\u6841',
    classHint: '(\u4f8b: 530)',
    hiragana: '\u3072\u3089\u304c\u306a',
    serial: '\u4e00\u9023\u756a\u53f7',
    serialLabel: '\u5f62\u5f0f: XX-XX \u307e\u305f\u306f \u00b79 77',
    options3d: '3D\u30aa\u30d7\u30b7\u30e7\u30f3',
    thickness: '\u30d7\u30ec\u30fc\u30c8\u306e\u539a\u3055',
    emboss: '\u6587\u5b57\u306e\u6d6e\u304d\u51fa\u3057\u6df1\u3055',
    keychainHole: '\u30ad\u30fc\u30db\u30eb\u30c0\u30fc\u7a74',
    holeRadius: '\u7a74\u306e\u534a\u5f84',
    holePos: '\u4f4d\u7f6e',
    printLength: '\u5370\u5237\u30b5\u30a4\u30ba',
    fontSection: '\u30d5\u30a9\u30f3\u30c8\u30d5\u30a1\u30a4\u30eb',
    btnSvg: '\u2b07 SVG\u3092\u30c0\u30a6\u30f3\u30ed\u30fc\u30c9',
    btnGenerate: '\u2699 3D\u30e2\u30c7\u30eb\u3092\u751f\u6210',
    btnStl: '\u2b07 STL',
    btn3mf: '\u2b07 3MF',
    colors: '\u8272',
    colorBg: '\u30d7\u30ec\u30fc\u30c8\u80cc\u666f',
    colorText: '\u6587\u5b57\u30fb\u8a18\u53f7',
    colorBorder: '\u67a0\u7dda',
    borderSameAsText: '\u67a0\u7dda\u3092\u6587\u5b57\u8272\u3068\u540c\u3058\u306b\u3059\u308b',
    resetColors: '\u21ba \u30ea\u30bb\u30c3\u30c8',
    posTopLeft: '\u2196 \u5de6\u4e0a',
    posTopCenter: '\u2191 \u4e0a\u4e2d\u592e',
    posTopRight: '\u2197 \u53f3\u4e0a',
    posBotLeft: '\u2199 \u5de6\u4e0b',
    posBotCenter: '\u2193 \u4e0b\u4e2d\u592e',
    posBotRight: '\u2198 \u53f3\u4e0b',
    posCustom: '\u270e \u30ab\u30b9\u30bf\u30e0 X / Y',
    holeXFrom: '\u5de6\u304b\u3089X',
    holeYFrom: '\u4e0a\u304b\u3089Y',
  },
};

let _currentLang = 'en';

function applyLang(lang) {
  _currentLang = lang;
  const dict = I18N[lang] || I18N.en;
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    if (dict[key] !== undefined) el.textContent = dict[key];
  });
  document.querySelectorAll('[data-i18n-btn]').forEach(el => {
    const key = el.dataset.i18nBtn;
    if (dict[key] !== undefined) el.textContent = dict[key];
  });
  document.documentElement.lang = lang === 'ja' ? 'ja' : 'en';
  elBtnLang.textContent = lang === 'ja' ? 'EN' : 'JP';
  updatePrintabilityNote();
  try { localStorage.setItem('jpplate-lang', lang); } catch (_) {}
}

function updatePrintabilityNote() {
  const length = parseFiniteNumber(elPrintLength.value) ?? 70;
  if (length >= 60) {
    elPrintabilityNote.textContent = '';
    elPrintabilityNote.classList.add('hidden');
    elPrintabilityNote.classList.remove('warning');
    return;
  }

  const msg = _currentLang === 'ja'
    ? '60mm未満では、漢字とひらがなの細い線が0.4mmノズルでつぶれたり欠けたりしやすくなります。60mm以上、または0.2mmノズルを推奨します。'
    : 'Below 60mm overall width, kanji and hiragana strokes are often too fine for a 0.4mm nozzle. Use 60mm+ or a 0.2mm nozzle for cleaner slicing.';
  elPrintabilityNote.textContent = msg;
  elPrintabilityNote.classList.remove('hidden');
  elPrintabilityNote.classList.add('warning');
}

// ─── URL SHARING ─────────────────────────────────────────────────
function updateURL() {
  const p = new URLSearchParams();
  p.set('t',  config.plateType);
  p.set('p',  config.prefecture);
  p.set('c',  config.classification);
  p.set('h',  config.hiragana);
  p.set('s',  config.serial);
  p.set('th', config.plateThickness);
  p.set('em', config.textDepth);
  p.set('pl', elPrintLength.value);
  p.set('lang', _currentLang);
  p.set('theme', document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  if (config.customBg)     p.set('cbg',  config.customBg);
  if (config.customText)   p.set('ctxt', config.customText);
  if (config.customBorder) p.set('cbrd', config.customBorder);
  if (config.keychainHole) {
    p.set('k',  '1');
    p.set('hr', config.holeRadius);
    p.set('hp', config.holePosition);
    if (config.holePosition === 'custom') {
      p.set('hx', config.holeCustomX);
      p.set('hy', config.holeCustomY);
    }
  }
  history.replaceState(null, '', '?' + p.toString());
}

function loadFromURL() {
  const p = new URLSearchParams(location.search);
  if (p.has('t'))  config.plateType       = p.get('t');
  if (p.has('p'))  config.prefecture      = p.get('p');
  if (p.has('c'))  config.classification  = p.get('c');
  if (p.has('h'))  config.hiragana        = p.get('h');
  if (p.has('s'))  config.serial          = p.get('s');
  if (p.has('th')) {
    const value = parseFiniteNumber(p.get('th'));
    if (value !== null) config.plateThickness = clampNumber(value, 1, 20);
  }
  if (p.has('em')) {
    const value = parseFiniteNumber(p.get('em'));
    if (value !== null) config.textDepth = clampNumber(value, 0.3, 20);
  }
  if (p.has('k')) config.keychainHole = p.get('k') === '1';
  if (p.has('hr')) {
    const value = parseFiniteNumber(p.get('hr'));
    if (value !== null) config.holeRadius = clampNumber(value, 2, 15);
  }
  if (p.has('hp')) config.holePosition = p.get('hp');
  if (p.has('hx')) {
    const value = parseFiniteNumber(p.get('hx'));
    if (value !== null) config.holeCustomX = clampNumber(value, 5, 325);
  }
  if (p.has('hy')) {
    const value = parseFiniteNumber(p.get('hy'));
    if (value !== null) config.holeCustomY = clampNumber(value, 5, 160);
  }
  if (p.has('pl')) {
    const value = parseFiniteNumber(p.get('pl'));
    if (value !== null) elPrintLength.value = String(clampNumber(value, 30, 330));
  }
  if (p.has('cbg')) {
    const value = parseHexColor(p.get('cbg'));
    if (value) config.customBg = value;
  }
  if (p.has('ctxt')) {
    const value = parseHexColor(p.get('ctxt'));
    if (value) config.customText = value;
  }
  if (p.has('cbrd')) {
    const value = parseHexColor(p.get('cbrd'));
    if (value) config.customBorder = value;
  }
  if (p.has('lang')) {
    const value = p.get('lang');
    if (value === 'en' || value === 'ja') _currentLang = value;
  }
  if (p.has('theme')) {
    const value = p.get('theme');
    if (value === 'light' || value === 'dark') {
      document.documentElement.dataset.theme = value === 'dark' ? 'dark' : '';
    }
  }
}

// ─── SVG PREVIEW ─────────────────────────────────────────────────
function updatePreview() {
  const svgStr = buildPreviewSVG(config);
  elSvgPreview.innerHTML = svgStr;
}

// ─── EVENT HANDLERS ───────────────────────────────────────────────

// Plate type buttons
elTypeGroup.addEventListener('click', (e) => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  config.plateType = btn.dataset.type;
  // Reset custom colours so the new type's defaults apply
  config.customBg = '';
  config.customText = '';
  config.customBorder = '';
  syncColorPickers();
  populateHiragana();
  updatePreview();
  updateURL();
});

// ─── COLOR PICKERS ───────────────────────────────────────────────
function syncColorPickers() {
  const theme = PLATE_TYPES[config.plateType] || PLATE_TYPES.private;
  elColorBg.value     = config.customBg     || theme.bg;
  elColorText.value   = config.customText   || theme.text;
  elColorBorder.value = config.customBorder || theme.border;
  config.customBg     = elColorBg.value;
  config.customText   = elColorText.value;
  config.customBorder = elColorBorder.value;
}

elColorBg.addEventListener('input', () => {
  config.customBg = elColorBg.value;
  updatePreview();
  updateURL();
});
elColorText.addEventListener('input', () => {
  config.customText = elColorText.value;
  if (elChkBorderText.checked) {
    config.customBorder = elColorText.value;
    elColorBorder.value = elColorText.value;
  }
  updatePreview();
  updateURL();
});
elColorBorder.addEventListener('input', () => {
  config.customBorder = elColorBorder.value;
  if (elChkBorderText.checked) elChkBorderText.checked = false;
  updatePreview();
  updateURL();
});

elChkBorderText.addEventListener('change', () => {
  if (elChkBorderText.checked) {
    config.customBorder = elColorText.value;
    elColorBorder.value = elColorText.value;
    elColorBorder.disabled = true;
  } else {
    elColorBorder.disabled = false;
  }
  updatePreview();
  updateURL();
});

document.getElementById('btn-reset-colors').addEventListener('click', () => {
  config.customBg = '';
  config.customText = '';
  config.customBorder = '';
  elChkBorderText.checked = false;
  elColorBorder.disabled = false;
  syncColorPickers();
  updatePreview();
  updateURL();
});

// Prefecture
elPrefecture.addEventListener('input', () => {
  config.prefecture = elPrefecture.value;
  updatePreview();
  updateURL();
});

// Classification
elClassification.addEventListener('input', () => {
  // Only digits and spaces
  elClassification.value = elClassification.value.replace(/[^0-9 ]/g, '');
  config.classification = elClassification.value;
  updatePreview();
  updateURL();
});

// Hiragana
elHiragana.addEventListener('change', () => {
  config.hiragana = elHiragana.value;
  updatePreview();
  updateURL();
});

// Serial
elSerial.addEventListener('input', () => {
  const val = elSerial.value;
  if (!validateSerial(val)) {
    elSerialError.classList.remove('hidden');
  } else {
    elSerialError.classList.add('hidden');
    config.serial = val;
    updatePreview();
    updateURL();
  }
});

// Thickness slider
elThickness.addEventListener('input', () => {
  config.plateThickness = parseFloat(elThickness.value);
  elThicknessVal.textContent = config.plateThickness.toFixed(1);
});

// Emboss slider
elEmboss.addEventListener('input', () => {
  config.textDepth = parseFloat(elEmboss.value);
  elEmbossVal.textContent = config.textDepth.toFixed(1);
});

// Keychain hole
elKeychain.addEventListener('change', () => {
  config.keychainHole = elKeychain.checked;
  elHoleRadiusSection.style.display = elKeychain.checked ? 'block' : 'none';
  updatePreview();
  updateURL();
});

// Hole radius slider
elHoleRadius.addEventListener('input', () => {
  config.holeRadius = parseFloat(elHoleRadius.value);
  elHoleRadiusVal.textContent = config.holeRadius.toFixed(1);
  if (config.keychainHole) updatePreview();
  updateURL();
});

// Hole position
elHolePos.addEventListener('change', () => {
  config.holePosition = elHolePos.value;
  elHoleCustomXY.style.display = elHolePos.value === 'custom' ? 'block' : 'none';
  if (config.keychainHole) updatePreview();
  updateURL();
});

// Custom hole X
elHoleX.addEventListener('input', () => {
  config.holeCustomX = parseFloat(elHoleX.value);
  elHoleXVal.textContent = config.holeCustomX;
  if (config.keychainHole && config.holePosition === 'custom') updatePreview();
  updateURL();
});

// Custom hole Y
elHoleY.addEventListener('input', () => {
  config.holeCustomY = parseFloat(elHoleY.value);
  elHoleYVal.textContent = config.holeCustomY;
  if (config.keychainHole && config.holePosition === 'custom') updatePreview();
  updateURL();
});

// Download SVG
elBtnSvg.addEventListener('click', () => {
  const svg = buildPreviewSVG(config);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `jp-plate-${config.plateType}-${config.prefecture}${config.classification}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
});

// Generate 3D Model
elBtnGenerate.addEventListener('click', async () => {
  elBtnGenerate.disabled = true;
  elBtnGenerate.textContent = '⏳ Generating…';
  elBtnStl.disabled = true;
  elBtnStlPlain.disabled = true;

  try {
    // Ensure font loaded
    await loadFontAuto((msg) => { elFontStatus.textContent = msg; });

    // Hide placeholder, show canvas
    elThreePlaceholder.classList.add('hidden');

    // Update 3D viewer
    updateViewer(config);

    elBtnStl.disabled = false;
    elBtnStlPlain.disabled = false;
    elBtnVideo.disabled = false;
    elBtnGenerate.textContent = I18N[_currentLang]?.btnGenerate || '⚙ Regenerate 3D Model';
  } catch (err) {
    alert(`3D generation failed: ${err.message}\n\nPlease try uploading a font file manually.`);
    elBtnGenerate.textContent = I18N[_currentLang]?.btnGenerate || '⚙ Generate 3D Model';
    elThreePlaceholder.classList.remove('hidden');
  } finally {
    elBtnGenerate.disabled = false;
  }
});

// Print length slider
elPrintLength.addEventListener('input', () => {
  elPrintLengthVal.textContent = elPrintLength.value;
  updatePrintabilityNote();
  updateURL();
});

// Download 3MF (colored)
elBtnStl.addEventListener('click', async () => {
  try {
    elBtnStl.disabled = true;
    await download3MF(
      `jp-plate-${config.plateType}-${config.prefecture}${config.classification}.3mf`,
      parseFloat(elPrintLength.value),
    );
  } catch (err) {
    alert(err.message);
  } finally {
    elBtnStl.disabled = false;
  }
});

// Download STL (plain)
elBtnStlPlain.addEventListener('click', async () => {
  try {
    elBtnStlPlain.disabled = true;
    await downloadSTL(
      `jp-plate-${config.plateType}-${config.prefecture}${config.classification}.stl`,
      parseFloat(elPrintLength.value),
    );
  } catch (err) {
    alert(err.message);
  } finally {
    elBtnStlPlain.disabled = false;
  }
});

// Record 10-second rotating video
elBtnVideo.addEventListener('click', async () => {
  try {
    elBtnVideo.disabled = true;
    elBtnVideo.textContent = '⏺ Recording…';
    const canvas = elThreeCanvas || document.querySelector('#three-container canvas');
    if (!canvas) throw new Error('3D canvas not found.');
    await captureRotationVideo(canvas, 10000, t => {
      const pct = Math.round(t * 100);
      elBtnVideo.textContent = `⏺ Recording… ${pct}%`;
    });
    elBtnVideo.textContent = '✓ Video saved!';
    setTimeout(() => { elBtnVideo.textContent = '🎬 Record 10s Video'; }, 2000);
  } catch (err) {
    alert(`Video export failed: ${err.message}`);
    elBtnVideo.textContent = '🎬 Record 10s Video';
  } finally {
    elBtnVideo.disabled = false;
  }
});

// Share link — copy URL to clipboard
elBtnShare.addEventListener('click', () => {
  updateURL();
  navigator.clipboard.writeText(location.href).then(() => {
    showToast('✓ Link copied!');
  }).catch(() => {
    // Fallback: select a temp input
    const tmp = document.createElement('input');
    tmp.value = location.href;
    document.body.appendChild(tmp);
    tmp.select();
    document.execCommand('copy');
    document.body.removeChild(tmp);
    showToast('✓ Link copied!');
  });
});

// ─── THEME ──────────────────────────────────────────────
function applyTheme(dark) {
  document.documentElement.dataset.theme = dark ? 'dark' : '';
  const sunIcon  = document.getElementById('theme-icon-sun');
  const moonIcon = document.getElementById('theme-icon-moon');
  if (sunIcon)  sunIcon.style.display  = dark ? 'none'  : '';
  if (moonIcon) moonIcon.style.display = dark ? ''      : 'none';
  try { localStorage.setItem('jpplate-theme', dark ? 'dark' : 'light'); } catch (_) {}
  updateURL();
}

elBtnTheme.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme !== 'dark');
});

// Language toggle
elBtnLang.addEventListener('click', () => {
  applyLang(_currentLang === 'ja' ? 'en' : 'ja');
  updateURL();
});

// Toast helper
function showToast(msg) {
  let toast = document.getElementById('share-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'share-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('visible'), 2500);
}

// ─── INIT ─────────────────────────────────────────────────────────
function init() {
  // Restore config from URL query params (overrides defaults)
  loadFromURL();

  // Set initial values from default config
  elPrefecture.value     = config.prefecture;
  elClassification.value = config.classification;
  elSerial.value         = config.serial;
  elThickness.value      = config.plateThickness;
  elThicknessVal.textContent = config.plateThickness.toFixed(1);
  elEmboss.value         = config.textDepth;
  elEmbossVal.textContent = config.textDepth.toFixed(1);
  elKeychain.checked     = config.keychainHole;
  elHoleRadius.value     = config.holeRadius;
  elHoleRadiusVal.textContent = config.holeRadius.toFixed(1);
  elHolePos.value        = config.holePosition || 'top-left';
  elHoleCustomXY.style.display = (config.holePosition === 'custom') ? 'block' : 'none';
  elHoleX.value          = config.holeCustomX || 14;
  elHoleXVal.textContent = config.holeCustomX || 14;
  elHoleY.value          = config.holeCustomY || 14;
  elHoleYVal.textContent = config.holeCustomY || 14;
  elHoleRadiusSection.style.display = config.keychainHole ? 'block' : 'none';
  elPrintLengthVal.textContent = elPrintLength.value;
  updatePrintabilityNote();

  // Activate correct type button + populate hiragana
  document.querySelectorAll('.type-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === config.plateType);
  });

  // Initialise color pickers from plate type defaults
  syncColorPickers();

  // Populate hiragana dropdown
  populateHiragana();

  // Initial preview
  updatePreview();

  // Init Three.js viewer
  initViewer(elThreeCanvas);

  // Attempt auto-font load in background (don't block)
  loadFontAuto((msg) => { elFontStatus.textContent = msg; }).catch(() => {
    // User will be prompted on "Generate 3D" click if still failing
  });

  // Apply saved language unless URL already provided one.
  let savedLang = _currentLang;
  try {
    if (!new URLSearchParams(location.search).has('lang')) {
      savedLang = localStorage.getItem('jpplate-lang') || _currentLang;
    }
  } catch (_) {}
  applyLang(savedLang);

  // Apply saved theme unless URL already provided one.
  let savedTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  try {
    if (!new URLSearchParams(location.search).has('theme')) {
      savedTheme = localStorage.getItem('jpplate-theme') || savedTheme;
    }
  } catch (_) {}
  applyTheme(savedTheme === 'dark');

  // Write initial URL params
  updateURL();
}

init();
