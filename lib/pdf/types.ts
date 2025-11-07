import jsPDF from 'jspdf';

export interface PDFTextOptions {
  fontSize?: number;
  fontStyle?: 'normal' | 'bold' | 'italic';
  color?: number | number[];
  align?: 'left' | 'center' | 'right';
}

export interface PDFPosition {
  x: number;
  y: number;
}

export interface PDFDimensions {
  width: number;
  height: number;
}

export interface PDFLineOptions {
  color?: number[];
  width?: number;
}

export interface PDFRectOptions {
  fillColor?: number[];
  strokeColor?: number[];
  lineWidth?: number;
}

export type PDFInstance = jsPDF;
