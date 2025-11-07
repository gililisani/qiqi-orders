/**
 * SLI (Shipper's Letter of Instruction) PDF Generator
 * Uses client-side jsPDF to generate PDFs, similar to packing slip
 */
import jsPDF from 'jspdf';
import { addText, addMultiLineText } from '../utils/textHelpers';
import { addLine, addRect, ensurePageSpace } from '../utils/layoutHelpers';
import { A4_PORTRAIT } from '../types';

export interface SLIPDFData {
  sli_number: number;
  creation_date: string;
  invoice_number: string;
  consignee_name: string;
  consignee_address_line1: string;
  consignee_address_line2?: string;
  consignee_address_line3?: string;
  consignee_country: string;
  forwarding_agent_line1?: string;
  forwarding_agent_line2?: string;
  forwarding_agent_line3?: string;
  forwarding_agent_line4?: string;
  date_of_export?: string;
  in_bond_code?: string;
  instructions_to_forwarder?: string;
  products: Array<{
    hs_code: string;
    quantity: number;
    case_qty: number;
    case_weight: number;
    total_price: number;
    made_in: string;
    item_name?: string;
  }>;
}

/**
 * Generate SLI PDF using jsPDF (client-side)
 */
export async function generateSLIPDF(data: SLIPDFData): Promise<jsPDF> {
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pageWidth = A4_PORTRAIT.width;
  const pageHeight = A4_PORTRAIT.height;
  const margin = A4_PORTRAIT.margin;
  const contentWidth = pageWidth - (margin * 2);
  let currentY = margin;

  // Title
  addText(pdf, 'SHIPPER\'S LETTER OF INSTRUCTIONS', pageWidth / 2, currentY, {
    fontSize: 14,
    fontStyle: 'bold',
    align: 'center',
  });
  currentY += 10;

  // SLI Number and Date
  addText(pdf, `SLI Number: ${data.sli_number}`, margin, currentY, {
    fontSize: 10,
    fontStyle: 'bold',
  });
  addText(pdf, `Date: ${data.creation_date}`, pageWidth - margin, currentY, {
    fontSize: 10,
    align: 'right',
  });
  currentY += 8;

  // Line separator
  addLine(pdf, margin, currentY, pageWidth - margin, currentY);
  currentY += 5;

  // Invoice Number
  addText(pdf, `Invoice Number: ${data.invoice_number}`, margin, currentY, {
    fontSize: 10,
  });
  currentY += 8;

  // Consignee Section
  addText(pdf, 'Ultimate Consignee:', margin, currentY, {
    fontSize: 10,
    fontStyle: 'bold',
  });
  currentY += 6;

  addText(pdf, data.consignee_name, margin + 5, currentY, {
    fontSize: 10,
  });
  currentY += 5;

  addText(pdf, data.consignee_address_line1, margin + 5, currentY, {
    fontSize: 10,
  });
  currentY += 5;

  if (data.consignee_address_line2) {
    addText(pdf, data.consignee_address_line2, margin + 5, currentY, {
      fontSize: 10,
    });
    currentY += 5;
  }

  if (data.consignee_address_line3) {
    addText(pdf, data.consignee_address_line3, margin + 5, currentY, {
      fontSize: 10,
    });
    currentY += 5;
  }

  addText(pdf, data.consignee_country, margin + 5, currentY, {
    fontSize: 10,
  });
  currentY += 10;

  // Forwarding Agent (if provided)
  if (data.forwarding_agent_line1) {
    addText(pdf, 'Forwarding Agent:', margin, currentY, {
      fontSize: 10,
      fontStyle: 'bold',
    });
    currentY += 6;

    if (data.forwarding_agent_line1) {
      addText(pdf, data.forwarding_agent_line1, margin + 5, currentY, {
        fontSize: 10,
      });
      currentY += 5;
    }
    if (data.forwarding_agent_line2) {
      addText(pdf, data.forwarding_agent_line2, margin + 5, currentY, {
        fontSize: 10,
      });
      currentY += 5;
    }
    if (data.forwarding_agent_line3) {
      addText(pdf, data.forwarding_agent_line3, margin + 5, currentY, {
        fontSize: 10,
      });
      currentY += 5;
    }
    if (data.forwarding_agent_line4) {
      addText(pdf, data.forwarding_agent_line4, margin + 5, currentY, {
        fontSize: 10,
      });
      currentY += 5;
    }
    currentY += 5;
  }

  // Additional info
  if (data.date_of_export) {
    addText(pdf, `Date of Export: ${data.date_of_export}`, margin, currentY, {
      fontSize: 10,
    });
    currentY += 6;
  }

  if (data.in_bond_code) {
    addText(pdf, `In-Bond Code: ${data.in_bond_code}`, margin, currentY, {
      fontSize: 10,
    });
    currentY += 6;
  }

  currentY += 5;

  // Products Table Header
  currentY = ensurePageSpace(pdf, currentY, 30, pageHeight, margin);
  
  const tableTopY = currentY;
  addRect(pdf, margin, currentY - 5, contentWidth, 8, {
    fillColor: [229, 229, 229],
  });
  
  const colWidths = {
    name: 60,
    hsCode: 25,
    quantity: 20,
    weight: 25,
    price: 30,
    madeIn: 30,
  };
  
  let colX = margin + 5;
  addText(pdf, 'Product', colX, currentY, { fontSize: 9, fontStyle: 'bold' });
  colX += colWidths.name;
  
  addText(pdf, 'HS Code', colX, currentY, { fontSize: 9, fontStyle: 'bold' });
  colX += colWidths.hsCode;
  
  addText(pdf, 'Qty', colX, currentY, { fontSize: 9, fontStyle: 'bold' });
  colX += colWidths.quantity;
  
  addText(pdf, 'Weight', colX, currentY, { fontSize: 9, fontStyle: 'bold' });
  colX += colWidths.weight;
  
  addText(pdf, 'Price', colX, currentY, { fontSize: 9, fontStyle: 'bold' });
  colX += colWidths.price;
  
  addText(pdf, 'Made In', colX, currentY, { fontSize: 9, fontStyle: 'bold' });
  currentY += 8;

  // Products Table Rows
  for (const product of data.products) {
    currentY = ensurePageSpace(pdf, currentY, 10, pageHeight, margin);
    
    colX = margin + 5;
    const productName = product.item_name || 'N/A';
    const nameLines = pdf.splitTextToSize(productName, colWidths.name - 5);
    pdf.text(nameLines, colX, currentY, { maxWidth: colWidths.name - 5 });
    const nameHeight = nameLines.length * 4;
    colX += colWidths.name;
    
    addText(pdf, product.hs_code || 'N/A', colX, currentY, { fontSize: 9 });
    colX += colWidths.hsCode;
    
    addText(pdf, product.quantity.toString(), colX, currentY, { fontSize: 9 });
    colX += colWidths.quantity;
    
    const totalWeight = product.quantity * product.case_weight;
    addText(pdf, totalWeight.toFixed(2), colX, currentY, { fontSize: 9 });
    colX += colWidths.weight;
    
    addText(pdf, `$${product.total_price.toFixed(2)}`, colX, currentY, {
      fontSize: 9,
    });
    colX += colWidths.price;
    
    addText(pdf, product.made_in || 'N/A', colX, currentY, { fontSize: 9 });
    
    currentY += Math.max(nameHeight, 6);
    addLine(pdf, margin, currentY - 2, pageWidth - margin, currentY - 2);
    currentY += 3;
  }

  // Instructions to Forwarder (if provided)
  if (data.instructions_to_forwarder) {
    currentY = ensurePageSpace(pdf, currentY, 30, pageHeight, margin);
    currentY += 5;
    
    addText(pdf, 'Instructions to Forwarder:', margin, currentY, {
      fontSize: 10,
      fontStyle: 'bold',
    });
    currentY += 6;
    
    currentY += addMultiLineText(
      pdf,
      data.instructions_to_forwarder,
      margin + 5,
      currentY,
      contentWidth - 10,
      { fontSize: 9 }
    );
  }

  return pdf;
}

/**
 * Generate and download SLI PDF
 */
export async function generateAndDownloadSLIPDF(data: SLIPDFData): Promise<void> {
  const pdf = await generateSLIPDF(data);
  // Use invoice number if SLI number is 0 (for order-based SLIs)
  const identifier = data.sli_number === 0 ? data.invoice_number : data.sli_number.toString();
  const filename = `SLI-${identifier}.pdf`;
  pdf.save(filename);
}

