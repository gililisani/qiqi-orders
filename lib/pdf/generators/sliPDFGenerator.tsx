import { pdf } from '@react-pdf/renderer';
import { SLIDocument } from '../components/SLIDocument';
import type { SLIDocumentData } from '../components/SLIDocument';

/**
 * Generate and download SLI PDF using React-PDF
 */
export async function generateAndDownloadSLIPDF(
  data: SLIDocumentData,
  filename?: string
): Promise<void> {
  try {
    console.log('Generating PDF with data:', data);
    console.log('Products:', data.products);
    console.log('Products length:', data.products?.length);
    
    // Generate PDF blob
    const blob = await pdf(<SLIDocument data={data} />).toBlob();
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `SLI-${data.sli_number || 'document'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating SLI PDF:', error);
    throw error;
  }
}

/**
 * Generate SLI PDF blob (for upload to storage, etc.)
 */
export async function generateSLIPDFBlob(data: SLIDocumentData): Promise<Blob> {
  return await pdf(<SLIDocument data={data} />).toBlob();
}

