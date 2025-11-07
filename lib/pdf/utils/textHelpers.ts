/**
 * Text rendering utilities for PDF generation
 */
import jsPDF from 'jspdf';
import { PDFTextOptions } from '../types';

/**
 * Add text to PDF with customizable options
 */
export function addText(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  options: PDFTextOptions = {}
): void {
  pdf.setFontSize(options.fontSize || 10);
  pdf.setFont('helvetica', options.fontStyle || 'normal');

  if (options.color) {
    if (Array.isArray(options.color)) {
      pdf.setTextColor(options.color[0], options.color[1], options.color[2]);
    } else {
      pdf.setTextColor(options.color);
    }
  } else {
    pdf.setTextColor(0, 0, 0);
  }

  if (options.align === 'center') {
    pdf.text(text, x, y, { align: 'center' });
  } else if (options.align === 'right') {
    pdf.text(text, x, y, { align: 'right' });
  } else {
    pdf.text(text, x, y);
  }
}

/**
 * Add multi-line text with automatic wrapping
 */
export function addMultiLineText(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options: PDFTextOptions = {}
): number {
  pdf.setFontSize(options.fontSize || 10);
  pdf.setFont('helvetica', options.fontStyle || 'normal');

  if (options.color) {
    if (Array.isArray(options.color)) {
      pdf.setTextColor(options.color[0], options.color[1], options.color[2]);
    } else {
      pdf.setTextColor(options.color);
    }
  } else {
    pdf.setTextColor(0, 0, 0);
  }

  const lines = pdf.splitTextToSize(text, maxWidth);
  pdf.text(lines, x, y);
  
  return lines.length * (options.fontSize || 10) * 0.4; // Approximate line height
}

