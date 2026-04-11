// ─── PLATE DIMENSIONS ────────────────────────────────────────────
// Japanese standard plate: 330mm × 165mm (cars)
// SVG viewBox: 0 0 330 165  → 1 SVG unit = 1 mm  (maps directly to mm in 3D)
export const PLATE_W = 330;
export const PLATE_H = 165;
export const BORDER = 6;       // inner border stroke width (mm)
export const CORNER_R = 6;     // rounded corner radius (mm)

// Keychain hole
export const HOLE_R = 5.5;    // radius (mm)
export const HOLE_CX = 14;    // center x (mm)
export const HOLE_CY = 14;    // center y (mm)

// ─── PLATE TYPE DEFINITIONS ───────────────────────────────────────
export const PLATE_TYPES = {
  private: {
    label: '私 Private',
    bg:     '#FFFFFF',
    text:   '#1a5c1a',
    border: '#FFFFFF',
  },
  commercial: {
    label: '営 Commercial',
    bg:     '#1a5c1a',
    text:   '#FFFFFF',
    border: '#FFFFFF',
  },
  kprivate: {
    label: '軽 Kei Private',
    bg:     '#FFFF00',
    text:   '#1a1a1a',
    border: '#1a1a1a',
  },
  kcommercial: {
    label: '軽 Kei Commercial',
    bg:     '#1a1a1a',
    text:   '#FFFF00',
    border: '#FFFF00',
  },
};

// ─── HIRAGANA LISTS (per plate type) ─────────────────────────────
// Source: Vehicle Registration Plates of Japan — valid hiragana per category
export const HIRAGANA = {
  private: [
    'さ','す','せ','そ','た','ち','つ','て','と',
    'な','に','ぬ','ね','の',
    'は','ひ','ふ','ほ',
    'ま','み','む','め','も',
    'や','ゆ',
    'ら','り','る','ろ',
  ],
  commercial: ['あ','い','う','え','か','き','く','け','こ','を'],
  kprivate: [
    'あ','い','う','え','か','き','く','け','こ',
    'さ','す','せ','そ','た','ち','つ','て','と',
    'な','に','ぬ','ね','の',
    'は','ひ','ふ','ほ',
    'ま','み','む','め','も',
    'や','ゆ','よ',
    'ら','る','ろ','を',
  ],
  kcommercial: ['り','れ'],
  private_rental: ['れ'],
  kprivate_rental: ['わ'],
};

// Map plate type → default hiragana list key
export const HIRAGANA_MAP = {
  private:     'private',
  commercial:  'commercial',
  kprivate:    'kprivate',
  kcommercial: 'kcommercial',
};

// ─── DEFAULT CONFIG ───────────────────────────────────────────────
export const DEFAULT_CONFIG = {
  plateType:       'private',
  prefecture:      '品川',
  classification:  '530',
  hiragana:        'た',
  serial:          '8888',
  keychainHole:    false,
  holeRadius:      5.5,   // mm  (2–15 mm) keychain hole radius
  holePosition:    'top-left', // 'top-left'|'top-center'|'top-right'|'bottom-left'|'bottom-center'|'bottom-right'|'custom'
  holeCustomX:     14,    // mm from left edge — used when holePosition === 'custom'
  holeCustomY:     14,    // mm from top edge  — used when holePosition === 'custom'
  plateThickness:  3.0,   // mm  (1–5 mm)
  textDepth:       5.0,   // mm — how far text protrudes above plate face (0.3–10 mm)
};
