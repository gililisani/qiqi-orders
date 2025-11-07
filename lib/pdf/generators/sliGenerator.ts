import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface SLIData {
  sli_number?: number;
  invoice_number?: string;
  consignee_name?: string;
  consignee_address_line1?: string;
  consignee_address_line2?: string;
  consignee_country?: string;
  forwarding_agent_line1?: string;
  forwarding_agent_line2?: string;
  forwarding_agent_line3?: string;
  forwarding_agent_line4?: string;
  in_bond_code?: string;
  instructions_to_forwarder?: string;
  sli_date?: string;
  selected_products?: Array<{
    product_id: string;
    quantity: number;
    hs_code?: string;
    item_name?: string;
  }>;
}

/**
 * Generate SLI PDF from rendered HTML
 * Uses the existing HTML template and converts it to PDF
 */
export async function generateSLIPDF(
  htmlElement: HTMLElement,
  filename: string
): Promise<void> {
  try {
    // Hide any navigation/button elements before capture
    const noPrintElements = document.querySelectorAll('.no-print');
    noPrintElements.forEach((el: any) => {
      el.style.display = 'none';
    });

    // Find the actual SLI page content (the div with class="page")
    const pageElement = htmlElement.querySelector('.page') as HTMLElement || htmlElement;

    // Capture the page element as canvas with fixed dimensions matching A4
    // A4 at 96 DPI: 210mm = 794px, 297mm = 1123px
    const canvas = await html2canvas(pageElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 794, // 210mm at 96 DPI
      height: 1123, // 297mm at 96 DPI
    });

    // Restore hidden elements
    noPrintElements.forEach((el: any) => {
      el.style.display = '';
    });

    // Create PDF - A4 portrait
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    const pdfWidth = 210; // A4 width in mm
    const pdfHeight = 297; // A4 height in mm
    
    // Convert canvas to image
    const imgData = canvas.toDataURL('image/png');
    
    // Since we captured at A4 dimensions (794x1123 px at scale 2 = 1588x2246)
    // We can add it directly to fill the page
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');

    // Save the PDF
    pdf.save(filename);
  } catch (error) {
    console.error('Error generating SLI PDF:', error);
    throw error;
  }
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
