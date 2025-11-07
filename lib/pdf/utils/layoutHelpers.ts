/**
 * Layout and drawing utilities for PDF generation
 */
import jsPDF from 'jspdf';
import { PDFLineOptions, PDFRectOptions } from '../types';

/**
 * Draw a horizontal or vertical line
 */
export function addLine(
  pdf: jsPDF,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: PDFLineOptions = {}
): void {
  pdf.setDrawColor(
    options.color?.[0] ?? 229,
    options.color?.[1] ?? 229,
    options.color?.[2] ?? 229
  );
  pdf.setLineWidth(options.width || 0.1);
  pdf.line(x1, y1, x2, y2);
}

/**
 * Draw a rectangle
 */
export function addRect(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  options: PDFRectOptions = {}
): void {
  if (options.fillColor) {
    pdf.setFillColor(
      options.fillColor[0],
      options.fillColor[1],
      options.fillColor[2]
    );
    pdf.rect(x, y, width, height, 'F');
  }
  
  if (options.color) {
    pdf.setDrawColor(options.color[0], options.color[1], options.color[2]);
    pdf.setLineWidth(options.width || 0.1);
    pdf.rect(x, y, width, height, 'S');
  }
}

/**
 * Check if content fits on current page, add new page if needed
 */
export function ensurePageSpace(
  pdf: jsPDF,
  currentY: number,
  requiredHeight: number,
  pageHeight: number,
  margin: number
): number {
  if (currentY + requiredHeight > pageHeight - margin) {
    pdf.addPage();
    return margin;
  }
  return currentY;
}

