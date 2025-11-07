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
    // Capture the HTML element as canvas with high quality
    const canvas = await html2canvas(htmlElement, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: htmlElement.scrollWidth,
      windowHeight: htmlElement.scrollHeight,
    });

    // Create PDF - A4 portrait
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    const pdfWidth = 210; // A4 width in mm
    const pdfHeight = 297; // A4 height in mm
    
    // Convert canvas to image
    const imgData = canvas.toDataURL('image/png');
    
    // Calculate the image dimensions in mm
    // The canvas is captured at scale=2, so we have high-res pixels
    // We want to fit the content to the full PDF width
    const imgWidthMM = pdfWidth; // Fill the full page width
    const imgHeightMM = (canvas.height / canvas.width) * imgWidthMM; // Maintain aspect ratio

    // Check if content fits on one page
    if (imgHeightMM <= pdfHeight) {
      // Single page - center vertically if there's space
      const yOffset = 0; // Start from top
      pdf.addImage(imgData, 'PNG', 0, yOffset, imgWidthMM, imgHeightMM, undefined, 'FAST');
    } else {
      // Multiple pages - split the canvas
      const totalPages = Math.ceil(imgHeightMM / pdfHeight);
      
      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        // Calculate which portion of the canvas to use for this page
        const pageStartMM = page * pdfHeight;
        const pageHeightMM = Math.min(pdfHeight, imgHeightMM - pageStartMM);
        
        // Convert back to pixels
        const pageStartPx = (pageStartMM / imgWidthMM) * canvas.width;
        const pageHeightPx = (pageHeightMM / imgWidthMM) * canvas.width;

        // Create temporary canvas for this page slice
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = pageHeightPx;
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(
            canvas,
            0,
            pageStartPx,
            canvas.width,
            pageHeightPx,
            0,
            0,
            canvas.width,
            pageHeightPx
          );
          const pageImgData = tempCanvas.toDataURL('image/png');
          pdf.addImage(pageImgData, 'PNG', 0, 0, imgWidthMM, pageHeightMM, undefined, 'FAST');
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
