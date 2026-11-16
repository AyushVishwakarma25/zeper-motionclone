/**
 * MotionClone Unified Design System & Theme Engine
 * 
 * Provides:
 * - Responsive Type Scale (display, h1, h2, body, caption) for 9:16, 16:9, 1:1
 * - Title-Safe Margins (8% sides, 12% top, 18% bottom)
 * - Contrast-Compliant Color Palettes (dark tech, warm cream, bold brand >= 4.5:1)
 * - Motion Tokens & Spring Configurations
 */

export const PALETTES = {
  dark_tech: {
    name: 'Dark Tech',
    bg: '#0a0a12',
    bgSecondary: '#12121e',
    cardBg: 'rgba(20, 22, 36, 0.88)',
    border: 'rgba(255, 255, 255, 0.12)',
    textPrimary: '#ffffff',
    textSecondary: '#a0a5b8',
    textMuted: '#64687a',
    accent: '#00f2fe',
    accentSecondary: '#4facfe',
    contrastRatio: 16.5 // #ffffff on #0a0a12
  },
  warm_cream: {
    name: 'Warm Cream',
    bg: '#f9f6ef',
    bgSecondary: '#f0ece1',
    cardBg: 'rgba(255, 255, 255, 0.92)',
    border: 'rgba(40, 30, 20, 0.12)',
    textPrimary: '#1a1917',
    textSecondary: '#4a4843',
    textMuted: '#7c7870',
    accent: '#d9531e',
    accentSecondary: '#f39c12',
    contrastRatio: 15.8 // #1a1917 on #f9f6ef
  },
  bold_brand: {
    name: 'Bold Brand',
    bg: '#0d1117',
    bgSecondary: '#161b22',
    cardBg: 'rgba(22, 27, 34, 0.90)',
    border: 'rgba(240, 246, 252, 0.14)',
    textPrimary: '#f0f6fc',
    textSecondary: '#8b949e',
    textMuted: '#6e7681',
    accent: '#58a6ff',
    accentSecondary: '#bc8cff',
    contrastRatio: 15.2
  }
};

export const MOTION_SPRINGS = {
  snappy: { damping: 12, stiffness: 180, mass: 0.5 },
  smooth: { damping: 15, stiffness: 120, mass: 0.8 },
  gentle: { damping: 20, stiffness: 90, mass: 1.0 },
  bouncy: { damping: 9, stiffness: 140, mass: 0.7 }
};

export function getTheme(width = 1080, height = 1920, paletteName = 'dark_tech') {
  const isVertical = height > width;
  const isSquare = height === width;
  const minDim = Math.min(width, height);
  const aspect = isVertical ? '9:16' : (isSquare ? '1:1' : '16:9');

  // Title-safe margins (8% sides, 12% top, 18% bottom)
  const safeMargins = {
    top: Math.round(height * 0.12),
    bottom: Math.round(height * 0.18),
    left: Math.round(width * 0.08),
    right: Math.round(width * 0.08),
    width: Math.round(width * 0.84),
    height: Math.round(height * 0.70)
  };

  // Responsive Type Scale
  // Scales based on min dimension with vertical height boost
  const vFactor = isVertical ? 1.15 : 1.0;
  const typeScale = {
    display: Math.max(38, Math.round(minDim * 0.075 * vFactor)),
    h1: Math.max(30, Math.round(minDim * 0.055 * vFactor)),
    h2: Math.max(24, Math.round(minDim * 0.038 * vFactor)),
    body: Math.max(16, Math.round(minDim * 0.025 * vFactor)),
    caption: Math.max(13, Math.round(minDim * 0.018 * vFactor))
  };

  const palette = PALETTES[paletteName] || PALETTES.dark_tech;

  const fontFamilies = {
    sans: "'Noto Sans Devanagari', 'Nirmala UI', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    mono: "Consolas, 'JetBrains Mono', 'Fira Code', monospace"
  };

  return {
    aspect,
    width,
    height,
    isVertical,
    isSquare,
    safeMargins,
    typeScale,
    palette,
    fontFamilies,
    springs: MOTION_SPRINGS
  };
}

