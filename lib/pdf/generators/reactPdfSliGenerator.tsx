import { pdf } from '@react-pdf/renderer';
import { SLIDocument, SLIDocumentData } from '../components/SLIDocument';

/**
 * Generate and download SLI PDF using React-PDF
 */
export async function generateAndDownloadSLIPDF(
  data: SLIDocumentData
): Promise<void> {
  try {
    // Generate PDF blob
    const blob = await pdf(<SLIDocument data={data} />).toBlob();
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SLI-${data.sli_number || data.invoice_number || 'document'}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error generating SLI PDF:', error);
    throw error;
  }
}

