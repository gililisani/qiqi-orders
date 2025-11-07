/**
 * Common types for PDF generation
 */

export interface PDFTextOptions {
  fontSize?: number;
  fontStyle?: 'normal' | 'bold' | 'italic';
  color?: number[] | string;
  align?: 'left' | 'center' | 'right';
}

export interface PDFLineOptions {
  color?: number[];
  width?: number;
}

export interface PDFRectOptions {
  color?: number[];
  fillColor?: number[];
  width?: number;
}

export interface PDFPage {
  width: number;
  height: number;
  margin: number;
}

export const A4_PORTRAIT: PDFPage = {
  width: 210, // mm
  height: 297, // mm
  margin: 15,
};

export const A4_LANDSCAPE: PDFPage = {
  width: 297, // mm
  height: 210, // mm
  margin: 15,
};

