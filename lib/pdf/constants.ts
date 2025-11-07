/**
 * PDF page dimensions and constants
 */

export const PAGE_SIZES = {
  LETTER: {
    page: { width: 612, height: 792 },
    margin: 36, // 0.5 inch
    live: { width: 540, height: 720 },
  },
  A4: {
    page: { width: 595.28, height: 841.89 },
    margin: 34.02, // 12 mm
    live: { width: 527.24, height: 773.86 },
  },
};

export const COLORS = {
  black: '#000000',
  white: '#ffffff',
  gray: {
    100: '#f3f4f6',
    200: '#e5e7eb',
    300: '#d1d5db',
    400: '#9ca3af',
    500: '#6b7280',
    600: '#4b5563',
    700: '#374151',
    800: '#1f2937',
    900: '#111827',
  },
};

export const FONT_SIZES = {
  xs: 7,
  sm: 8,
  base: 9,
  md: 10,
  lg: 11,
  xl: 12,
  '2xl': 14,
  '3xl': 16,
};

