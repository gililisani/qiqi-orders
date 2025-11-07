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
    const noPrintElements = htmlElement.querySelectorAll('.no-print');
    noPrintElements.forEach((el: any) => {
      el.style.display = 'none';
    });

    // Capture the HTML element as canvas
    const canvas = await html2canvas(htmlElement, {
      scale: 2, // High quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
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
    
    // Calculate dimensions - fit image to page width
    const imgWidthPx = canvas.width;
    const imgHeightPx = canvas.height;
    const aspectRatio = imgHeightPx / imgWidthPx;
    
    // Image will fill the full PDF width
    const imgWidthMM = pdfWidth;
    const imgHeightMM = pdfWidth * aspectRatio;

    // Check if content fits on one page
    if (imgHeightMM <= pdfHeight) {
      // Single page - add the full image
      pdf.addImage(imgData, 'PNG', 0, 0, imgWidthMM, imgHeightMM, undefined, 'FAST');
    } else {
      // Multiple pages - need to split
      const totalPages = Math.ceil(imgHeightMM / pdfHeight);
      const heightPerPageMM = pdfHeight;
      const heightPerPagePx = (heightPerPageMM / imgWidthMM) * imgWidthPx;
      
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        const sourceY = page * heightPerPagePx;
        const sourceHeight = Math.min(heightPerPagePx, imgHeightPx - sourceY);
        const destHeight = (sourceHeight / imgWidthPx) * imgWidthMM;

        // Create temporary canvas for this page slice
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgWidthPx;
        tempCanvas.height = sourceHeight;
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(
            canvas,
            0,
            sourceY,
            imgWidthPx,
            sourceHeight,
            0,
            0,
            imgWidthPx,
            sourceHeight
          );
          const pageImgData = tempCanvas.toDataURL('image/png');
          pdf.addImage(pageImgData, 'PNG', 0, 0, imgWidthMM, destHeight, undefined, 'FAST');
        }
      }
    }

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
