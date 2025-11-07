import { PDFInstance } from '../types';

/**
 * Draw a line
 */
export function drawLine(
  pdf: PDFInstance,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number[] = [0, 0, 0],
  width: number = 0.5
): void {
  pdf.setDrawColor(color[0], color[1], color[2]);
  pdf.setLineWidth(width);
  pdf.line(x1, y1, x2, y2);
}

/**
 * Draw a rectangle
 */
export function drawRect(
  pdf: PDFInstance,
  x: number,
  y: number,
  width: number,
  height: number,
  style: 'S' | 'F' | 'FD' = 'S',
  fillColor?: number[],
  strokeColor?: number[]
): void {
  if (fillColor) {
    pdf.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
  }
  if (strokeColor) {
    pdf.setDrawColor(strokeColor[0], strokeColor[1], strokeColor[2]);
  }
  pdf.rect(x, y, width, height, style);
}

