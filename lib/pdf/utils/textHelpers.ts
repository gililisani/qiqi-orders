import { PDFInstance, PDFTextOptions } from '../types';

/**
 * Add text to PDF with common options
 */
export function addText(
  pdf: PDFInstance,
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
 * Split text to fit within a width
 */
export function splitText(pdf: PDFInstance, text: string, maxWidth: number): string[] {
  return pdf.splitTextToSize(text, maxWidth);
}
