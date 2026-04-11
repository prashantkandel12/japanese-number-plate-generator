/**
 * svg-generator.js
 * Generates SVG strings for:
 *   - buildPreviewSVG(config)  → live browser preview using <text> elements + Google Fonts
 *   - The same layout constants are used by model-generator.js for 3D positioning
 */

import {
  PLATE_W, PLATE_H, BORDER, CORNER_R,
  HOLE_R, HOLE_CX, HOLE_CY,
  PLATE_TYPES,
} from './plate-data.js';

// ─── LAYOUT CONSTANTS ─────────────────────────────────────────────
// These match exactly what model-generator uses for text placement.
const PAD_X  = 12;   // horizontal padding from border edge
const PAD_Y  = 8;    // vertical padding from border edge

// Top row: y-band for prefecture + classification
const TOP_ROW_MID_Y = 46;   // vertical midpoint of top row (mm) — centred in top half 9–82mm

// Bottom row: y-band for hiragana + serial
const BOT_ROW_MID_Y = 122;  // vertical midpoint of bottom row (mm)

// Font sizes (mm = ~px in SVG with 1:1 viewBox)
const FS_PREFECTURE     = 34;   // 野田
const FS_CLASSIFICATION = 44;   // 530
const FS_HIRAGANA       = 34;   // た  (0.8× original 42)
const FS_DOT            = 34;
const FS_SERIAL         = 82;   // 9  77  (1.2× original 68)

// Shared text attrs
const TEXT_STYLE      = `font-family='M PLUS 1p, sans-serif' font-weight='800'`;           // kanji + hiragana
const TEXT_STYLE_NUM  = `font-family='Big Shoulders Display, sans-serif' font-weight='900'`; // digits + separators
const TEXT_STYLE_COND = TEXT_STYLE_NUM; // alias used in buildSerialSVG

// ─── HELPERS ─────────────────────────────────────────────────────

/** Rounded-rect SVG path string (clockwise). */
function roundedRectPath(x, y, w, h, r) {
  return [
    `M ${x + r},${y}`,
    `H ${x + w - r}`,
    `A ${r},${r} 0 0 1 ${x + w},${y + r}`,
    `V ${y + h - r}`,
    `A ${r},${r} 0 0 1 ${x + w - r},${y + h}`,
    `H ${x + r}`,
    `A ${r},${r} 0 0 1 ${x},${y + h - r}`,
    `V ${y + r}`,
    `A ${r},${r} 0 0 1 ${x + r},${y}`,
    'Z',
  ].join(' ');
}

/** Circle path for keychain hole (counter-clockwise so it cuts out with evenodd). */
function circlePath(cx, cy, r) {
  // Two arcs to form a full circle
  return [
    `M ${cx + r},${cy}`,
    `A ${r},${r} 0 1 0 ${cx - r},${cy}`,
    `A ${r},${r} 0 1 0 ${cx + r},${cy}`,
    'Z',
  ].join(' ');
}

/**
 * Parse a serial string into display slots.
 * Standard format: up to 4 digits with a separator (dash, dot, or space).
 * Returns an array: [left_part, separator, right_part]
 * e.g. "9 77" → [" 9", " ", "77"]  (left-padded to 2 chars each)
 */
function parseSerial(raw) {
  // Normalise: trim to 5 chars max
  const s = (raw || '').slice(0, 6);
  return s.padEnd(6, ' ');
}

// ─── PUBLIC API ───────────────────────────────────────────────────

/**
 * Compute keychain hole centre in SVG space (origin = top-left, Y measured downward).
 * Returns { cx, cy } in mm. Also imported by model-generator.
 */
export function getHoleCenter(config) {
  const r      = config.holeRadius ?? HOLE_R;
  const margin = Math.max(r + 8, 20);
  switch (config.holePosition) {
    case 'top-center':    return { cx: PLATE_W / 2,       cy: margin };
    case 'top-right':     return { cx: PLATE_W - margin,   cy: margin };
    case 'bottom-left':   return { cx: margin,             cy: PLATE_H - margin };
    case 'bottom-center': return { cx: PLATE_W / 2,        cy: PLATE_H - margin };
    case 'bottom-right':  return { cx: PLATE_W - margin,   cy: PLATE_H - margin };
    case 'custom':        return {
      cx: Math.min(Math.max(parseFloat(config.holeCustomX) || margin, r + 2), PLATE_W - r - 2),
      cy: Math.min(Math.max(parseFloat(config.holeCustomY) || margin, r + 2), PLATE_H - r - 2),
    };
    case 'top-left':
    default:              return { cx: margin,             cy: margin };
  }
}

/**
 * Build a full SVG string for live browser preview.
 * Uses <text> elements so no font loading is needed here.
 */
export function buildPreviewSVG(config) {
  const {
    plateType,
    prefecture,
    classification,
    hiragana,
    serial,
    keychainHole,
    holeRadius,
  } = config;

  const theme = PLATE_TYPES[plateType] || PLATE_TYPES.private;
  const bg     = config.customBg     || theme.bg;
  const fg     = config.customText   || theme.text;
  const border = config.customBorder || theme.border;
  const holeR = holeRadius ?? HOLE_R;
  const { cx: holeCX, cy: holeCY } = getHoleCenter(config);

  // ── Plate background with optional keychain hole ──
  const outerPath = roundedRectPath(0, 0, PLATE_W, PLATE_H, CORNER_R + 2);
  const holeStr  = keychainHole ? ` ${circlePath(holeCX, holeCY, holeR)}` : '';
  const bgPath   = `<path d="${outerPath}${holeStr}" fill="${bg}" fill-rule="evenodd" />`;

  // ── Inner border ──
  const borderPath = roundedRectPath(
    BORDER / 2, BORDER / 2,
    PLATE_W - BORDER, PLATE_H - BORDER,
    CORNER_R,
  );
  const borderEl = `<path d="${borderPath}" fill="none" stroke="${border}" stroke-width="${BORDER * 0.55}" />`;

  // ── Layout constants (no visible reference lines) ──
  const dividerY = 82;
  const vsepX    = 82;

  // ── TOP ROW ────────────────────────────────────────────────────
  // Combined as single centered text with 0.2em letter-spacing
  // Prefecture (kanji) uses M PLUS 1p; classification (digits) uses Big Shoulders Display
  // Rendered as two tspan elements inside one centered text anchor
  const topBaseline = TOP_ROW_MID_Y + FS_CLASSIFICATION * 0.35;
  const topLetterSpacing = (FS_CLASSIFICATION * 0.2).toFixed(2);
  const topText = `<text x="${PLATE_W / 2}" y="${topBaseline}" dominant-baseline="auto" text-anchor="middle" letter-spacing="${topLetterSpacing}">
  <tspan ${TEXT_STYLE} font-size="${FS_CLASSIFICATION}" fill="${fg}">${escapeXml(prefecture || '')}</tspan>
  <tspan ${TEXT_STYLE_NUM} font-size="${FS_CLASSIFICATION}" fill="${fg}">${escapeXml(classification || '')}</tspan>
</text>`;

  // ── BOTTOM ROW ─────────────────────────────────────────────────
  // Shared baseline: た and serial bottom-align at the same Y.
  const botBaseline = BOT_ROW_MID_Y + FS_SERIAL * 0.38;

  // Hiragana — vertically centred at BOT_ROW_MID_Y
  const hirText = `<text x="${(vsepX - PAD_X) / 2 + PAD_X}" y="${BOT_ROW_MID_Y}" ` +
    `${TEXT_STYLE} font-size="${FS_HIRAGANA}" fill="${fg}" dominant-baseline="middle" text-anchor="middle"` +
    `>${escapeXml(hiragana || '')}</text>`;
  const serialStr  = (serial || '').padEnd(6, ' ');
  const serialCx   = vsepX + 10 + (PLATE_W - vsepX - 10 - PAD_X - 6) / 2;
  const serialSvg  = buildSerialSVG(serialStr, vsepX + 10, botBaseline, fg, FS_SERIAL);

  // ── KEYCHAIN HOLE RING (visual guide) ──────────────────────────
  const holeRing = keychainHole
    ? `<circle cx="${holeCX}" cy="${holeCY}" r="${holeR + 1.5}" fill="none" stroke="${border}" stroke-width="1" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PLATE_W} ${PLATE_H}" width="${PLATE_W * 2}" height="${PLATE_H * 2}">
  <defs>
    <style>@import url('https://fonts.googleapis.com/css2?family=M+PLUS+1p:wght@800&amp;family=Big+Shoulders+Display:wght@900&amp;display=swap');</style>
  </defs>
  ${bgPath}
  ${borderEl}
  ${topText}
  ${hirText}
  ${serialSvg}
  ${holeRing}
</svg>`;
}

/**
 * Build SVG elements for the serial number row.
 * Characters are positioned left-to-right from a computed start X so that the
 * whole serial block is centred in the serial area.  The middle dot '·' is
 * rendered as an SVG <circle> placed at the correct computed horizontal and
 * vertical position (mid-cap of Big Shoulders Display digits).
 */
function buildSerialSVG(s, startX, baselineY, fg, fontSize) {
  const areaW   = PLATE_W - startX - PAD_X - 6;
  const raw     = s.replace(/\./g, '·');
  const display = raw.trim().length === 0 ? '・・-・・' : raw.trimEnd();
  const ls      = +(fontSize * 0.1).toFixed(2);  // proportional letter-spacing
  const lsN     = +ls;

  // Approximate advance widths for Big Shoulders Display 900 (condensed)
  function adv(ch) {
    if (ch === ' ')  return fontSize * 0.30;
    if (ch === '-')  return fontSize * 0.40;
    if (ch === '·')  return fontSize * 0.55;  // horizontal room for dot glyph
    return fontSize * 0.52;                     // digits 0–9
  }

  const chars = [...display];

  // Total width: sum of advances + inter-glyph letter-spacing for non-space chars
  let totalW = 0;
  for (let i = 0; i < chars.length; i++) {
    totalW += adv(chars[i]);
    if (chars[i] !== ' ' && i < chars.length - 1) totalW += lsN;
  }

  // Left edge of the centred block inside the serial area
  const lx = startX + Math.max(0, (areaW - totalW) / 2);

  const dotIdx = chars.indexOf('·');

  if (dotIdx === -1) {
    // No middle dot — single centred text element
    return `<text x="${(startX + areaW / 2).toFixed(2)}" y="${baselineY}" ` +
      `${TEXT_STYLE_COND} font-size="${fontSize}" fill="${fg}" ` +
      `dominant-baseline="auto" text-anchor="middle" letter-spacing="${ls}"` +
      `>${escapeXml(display)}</text>`;
  }

  // Compute the dot’s left-edge X by summing advances of preceding chars
  let dotX = lx;
  for (let i = 0; i < dotIdx; i++) {
    dotX += adv(chars[i]);
    if (chars[i] !== ' ') dotX += lsN;
  }
  const dotCX = +(dotX + adv('·') / 2).toFixed(2);
  const dotCY = +(baselineY - fontSize * 0.36).toFixed(2);
  const dotR  = +(fontSize * 0.08).toFixed(2);
  const circle = `<circle cx="${dotCX}" cy="${dotCY}" r="${dotR}" fill="${fg}" />`;

  // Before-dot text: starts at lx, left-aligned
  const beforePart = chars.slice(0, dotIdx).join('').trimStart();
  const beforeEl = beforePart
    ? `<text x="${lx.toFixed(2)}" y="${baselineY}" ` +
      `${TEXT_STYLE_COND} font-size="${fontSize}" fill="${fg}" ` +
      `dominant-baseline="auto" text-anchor="start" letter-spacing="${ls}"` +
      `>${escapeXml(beforePart)}</text>`
    : '';

  // After-dot text: starts right after the dot advance + ls
  const afterStartX = +(dotX + adv('·') + lsN).toFixed(2);
  const afterPart   = chars.slice(dotIdx + 1).join('').trimStart();
  const afterEl = afterPart
    ? `<text x="${afterStartX}" y="${baselineY}" ` +
      `${TEXT_STYLE_COND} font-size="${fontSize}" fill="${fg}" ` +
      `dominant-baseline="auto" text-anchor="start" letter-spacing="${ls}"` +
      `>${escapeXml(afterPart)}</text>`
    : '';

  return [beforeEl, circle, afterEl].filter(Boolean).join('\n  ');
}

/** Escape XML special chars for attribute/text content. */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── EXPORTED LAYOUT CONSTANTS (used by model-generator) ─────────
export const LAYOUT = {
  PAD_X,
  PAD_Y,
  TOP_ROW_MID_Y,
  BOT_ROW_MID_Y,
  FS_PREFECTURE,
  FS_CLASSIFICATION,
  FS_HIRAGANA,
  FS_SERIAL,
  VSEP_X: 82,
  DIVIDER_Y: 82,
  // Shared baselines — use these in model-generator for matching alignment
  TOP_ROW_BASELINE: TOP_ROW_MID_Y + FS_CLASSIFICATION * 0.35,
  BOT_ROW_BASELINE: BOT_ROW_MID_Y + FS_SERIAL * 0.38,
};
