import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

interface SLIData {
  // Header
  date?: string;
  quoteNumber?: string;
  
  // Company Information
  usppiName?: string;
  usppiAddress?: string;
  usppiZipCode?: string;
  usppiEin?: string;
  
  // Transaction Details
  partiesToTransaction?: 'RELATED' | 'NON-RELATED';
  intermediateConsignee?: string;
  consigneeType?: 'DIRECT_CONSUMER' | 'RESELLER' | 'GOVERNMENT_ENTITY' | 'OTHER_UNKNOWN';
  ultimateConsignee?: string;
  ultimateConsigneeAddress?: string;
  
  // Reference Numbers
  shipperRef?: string;
  consigneePO?: string;
  pointOfOrigin?: string;
  countryOfDestination?: string;
  inBondNumber?: string;
  routedExport?: 'YES' | 'NO';
  
  // Service Details
  insurance?: string;
  declaredValue?: string;
  serviceType?: 'AIR' | 'OCEAN';
  serviceOptions?: {
    air?: ('NOW' | 'PREMIUM' | 'VALUE' | 'DIRECT_IATA')[];
    ocean?: ('FCL' | 'LCL' | 'PYRAMID_LINES')[];
  };
  shipperCarrierContract?: string;
  freightPaymentTerms?: string;
  incoterms?: string;
  specialInstructions?: string;
  
  // Product Information
  products?: {
    description?: string;
    scheduleBNumber?: string;
    quantity?: string;
    shippingWeight?: string;
    value?: string;
    piecesDimensions?: string;
  }[];
  
  // Documents
  documentsAttached?: string[];
  documentsToPrepare?: string[];
  licenseNumber?: string;
  eccn?: string;
  
  // Authorization
  authorizedOfficer?: string;
  signature?: string; // Base64 image data
  title?: string;
  signatureDate?: string;
  authentication?: string;
  
  // Dangerous Goods
  dangerousGoods?: 'NO_DANGEROUS_GOODS' | 'CONTAINS_DANGEROUS_GOODS';
  
  // Additional
  driverAgentVehicle?: string;
  signForBy?: string;
  signTime?: string;
  signDate?: string;
}

export class SLIGenerator {
  private templatePath: string;
  
  constructor() {
    this.templatePath = path.join(process.cwd(), 'public', 'templates', 'SLI - TEMPLATE.xlsx');
  }
  
  async generateSLI(data: SLIData): Promise<Buffer> {
    try {
      // Read the Excel template
      const workbook = XLSX.readFile(this.templatePath);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      
      // Fill in the data
      this.fillData(worksheet, data);
      
      // Convert to PDF buffer
      const pdfBuffer = await this.convertToPDF(workbook);
      
      return pdfBuffer;
    } catch (error) {
      console.error('Error generating SLI:', error);
      throw new Error('Failed to generate SLI document');
    }
  }
  
  private fillData(worksheet: XLSX.WorkSheet, data: SLIData) {
    // Header fields
    if (data.date) {
      this.setCellValue(worksheet, 'B1', data.date);
    }
    if (data.quoteNumber) {
      this.setCellValue(worksheet, 'E1', data.quoteNumber);
    }
    
    // USPPI Information (Field 1)
    if (data.usppiName) {
      this.setCellValue(worksheet, 'B3', data.usppiName);
    }
    if (data.usppiAddress) {
      this.setCellValue(worksheet, 'B4', data.usppiAddress);
    }
    if (data.usppiZipCode) {
      this.setCellValue(worksheet, 'E4', data.usppiZipCode);
    }
    
    // USPPI EIN (Field 2)
    if (data.usppiEin) {
      this.setCellValue(worksheet, 'B6', data.usppiEin);
    }
    
    // Parties to Transaction (Field 3)
    if (data.partiesToTransaction) {
      if (data.partiesToTransaction === 'RELATED') {
        this.setCellValue(worksheet, 'D7', 'X');
      } else {
        this.setCellValue(worksheet, 'E7', 'X');
      }
    }
    
    // Intermediate Consignee (Field 4)
    if (data.intermediateConsignee) {
      this.setCellValue(worksheet, 'B8', data.intermediateConsignee);
    }
    
    // Consignee Type (Field 5)
    if (data.consigneeType) {
      const consigneeMap = {
        'DIRECT_CONSUMER': 'B11',
        'RESELLER': 'C11',
        'GOVERNMENT_ENTITY': 'B12',
        'OTHER_UNKNOWN': 'C12'
      };
      this.setCellValue(worksheet, consigneeMap[data.consigneeType], 'X');
    }
    
    // Ultimate Consignee (Field 6)
    if (data.ultimateConsignee) {
      this.setCellValue(worksheet, 'B13', data.ultimateConsignee);
    }
    if (data.ultimateConsigneeAddress) {
      this.setCellValue(worksheet, 'B14', data.ultimateConsigneeAddress);
    }
    
    // Reference Numbers (Fields 7-12)
    if (data.shipperRef) {
      this.setCellValue(worksheet, 'B16', data.shipperRef);
    }
    if (data.consigneePO) {
      this.setCellValue(worksheet, 'C16', data.consigneePO);
    }
    if (data.pointOfOrigin) {
      this.setCellValue(worksheet, 'B18', data.pointOfOrigin);
    }
    if (data.countryOfDestination) {
      this.setCellValue(worksheet, 'C18', data.countryOfDestination);
    }
    if (data.inBondNumber) {
      this.setCellValue(worksheet, 'B20', data.inBondNumber);
    }
    if (data.routedExport) {
      if (data.routedExport === 'YES') {
        this.setCellValue(worksheet, 'C21', 'X');
      } else {
        this.setCellValue(worksheet, 'D21', 'X');
      }
    }
    
    // Insurance and Declared Value (Fields 13-14)
    if (data.insurance) {
      this.setCellValue(worksheet, 'E10', data.insurance);
    }
    if (data.declaredValue) {
      this.setCellValue(worksheet, 'F10', data.declaredValue);
    }
    
    // Service Type (Field 15)
    if (data.serviceType) {
      if (data.serviceType === 'AIR') {
        this.setCellValue(worksheet, 'E12', 'X');
      } else {
        this.setCellValue(worksheet, 'F12', 'X');
      }
    }
    
    // Service Options
    if (data.serviceOptions) {
      if (data.serviceOptions.air) {
        data.serviceOptions.air.forEach(option => {
          const airMap = {
            'NOW': 'E14',
            'PREMIUM': 'E15',
            'VALUE': 'E16',
            'DIRECT_IATA': 'E17'
          };
          this.setCellValue(worksheet, airMap[option], 'X');
        });
      }
      if (data.serviceOptions.ocean) {
        data.serviceOptions.ocean.forEach(option => {
          const oceanMap = {
            'FCL': 'F14',
            'LCL': 'F15',
            'PYRAMID_LINES': 'F16'
          };
          this.setCellValue(worksheet, oceanMap[option], 'X');
        });
      }
    }
    
    if (data.shipperCarrierContract) {
      this.setCellValue(worksheet, 'F18', data.shipperCarrierContract);
    }
    
    // Freight Payment Terms (Field 16)
    if (data.freightPaymentTerms) {
      this.setCellValue(worksheet, 'E20', data.freightPaymentTerms);
    }
    
    // INCOTERMS
    if (data.incoterms) {
      // You'll need to specify which INCOTERM cell to fill
      this.setCellValue(worksheet, 'E22', data.incoterms);
    }
    
    // Special Instructions (Field 17)
    if (data.specialInstructions) {
      this.setCellValue(worksheet, 'B24', data.specialInstructions);
    }
    
    // Product Information (Fields 18-23)
    if (data.products && data.products.length > 0) {
      const product = data.products[0]; // Assuming one product for now
      if (product.description) {
        this.setCellValue(worksheet, 'C26', product.description);
      }
      if (product.scheduleBNumber) {
        this.setCellValue(worksheet, 'D26', product.scheduleBNumber);
      }
      if (product.quantity) {
        this.setCellValue(worksheet, 'E26', product.quantity);
      }
      if (product.shippingWeight) {
        this.setCellValue(worksheet, 'F26', product.shippingWeight);
      }
      if (product.value) {
        this.setCellValue(worksheet, 'G26', product.value);
      }
      if (product.piecesDimensions) {
        this.setCellValue(worksheet, 'H26', product.piecesDimensions);
      }
    }
    
    // Documents (Fields 24-25)
    if (data.documentsAttached) {
      data.documentsAttached.forEach(doc => {
        // You'll need to specify the exact cell for each document type
        // This is a simplified version
        this.setCellValue(worksheet, 'E28', doc);
      });
    }
    
    // License and ECCN (Fields 26-27)
    if (data.licenseNumber) {
      this.setCellValue(worksheet, 'B30', data.licenseNumber);
    }
    if (data.eccn) {
      this.setCellValue(worksheet, 'E30', data.eccn);
    }
    
    // Authorized Officer (Field 28)
    if (data.authorizedOfficer) {
      this.setCellValue(worksheet, 'B32', data.authorizedOfficer);
    }
    
    // Signature (Field 30)
    if (data.signature) {
      // For signature, you might want to use a different approach
      // This sets a placeholder text
      this.setCellValue(worksheet, 'B34', '[SIGNATURE]');
    }
    
    // Title (Field 31)
    if (data.title) {
      this.setCellValue(worksheet, 'B35', data.title);
    }
    
    // Date (Field 32)
    if (data.signatureDate) {
      this.setCellValue(worksheet, 'B36', data.signatureDate);
    }
    
    // Dangerous Goods (Field 33)
    if (data.dangerousGoods) {
      if (data.dangerousGoods === 'NO_DANGEROUS_GOODS') {
        this.setCellValue(worksheet, 'B38', 'X');
      } else {
        this.setCellValue(worksheet, 'C38', 'X');
      }
    }
    
    // Driver Info
    if (data.driverAgentVehicle) {
      this.setCellValue(worksheet, 'B40', data.driverAgentVehicle);
    }
    
    // Sign For By
    if (data.signForBy) {
      this.setCellValue(worksheet, 'D40', data.signForBy);
    }
    if (data.signTime) {
      this.setCellValue(worksheet, 'F40', data.signTime);
    }
    if (data.signDate) {
      this.setCellValue(worksheet, 'H40', data.signDate);
    }
  }
  
  private setCellValue(worksheet: XLSX.WorkSheet, cell: string, value: string | number) {
    if (worksheet[cell]) {
      worksheet[cell].v = value;
    } else {
      XLSX.utils.sheet_add_aoa(worksheet, [[value]], { origin: cell });
    }
  }
  
  private async convertToPDF(workbook: XLSX.WorkBook): Promise<Buffer> {
    // For now, we'll return the Excel file as buffer
    // In a real implementation, you'd convert to PDF using a library like puppeteer
    // or use Excel's built-in PDF export functionality
    
    const buffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx' 
    });
    
    return buffer;
  }
}

// Helper function to generate SLI from order data
export async function generateSLIFromOrder(orderData: any): Promise<Buffer> {
  const generator = new SLIGenerator();
  
  const sliData: SLIData = {
    date: new Date().toLocaleDateString(),
    quoteNumber: orderData.order_number || orderData.id,
    
    // Map order data to SLI fields
    usppiName: 'Qiqi Global', // Hardcoded
    usppiAddress: 'Your Company Address', // Hardcoded
    usppiZipCode: 'Your Zip Code', // Hardcoded
    usppiEin: 'Your EIN', // Hardcoded
    
    ultimateConsignee: orderData.company?.company_name,
    ultimateConsigneeAddress: [
      orderData.company?.ship_to_street_line_1,
      orderData.company?.ship_to_street_line_2,
      orderData.company?.ship_to_city,
      orderData.company?.ship_to_state,
      orderData.company?.ship_to_postal_code,
      orderData.company?.ship_to_country
    ].filter(Boolean).join(', '),
    
    shipperRef: orderData.order_number,
    consigneePO: orderData.po_number,
    countryOfDestination: orderData.company?.ship_to_country,
    
    serviceType: 'AIR', // Default or from order data
    freightPaymentTerms: orderData.company?.payment_terms,
    incoterms: orderData.company?.incoterms,
    
    products: orderData.order_items?.map((item: any) => ({
      description: item.product?.name,
      quantity: item.quantity?.toString(),
      value: item.total_price?.toString()
    })),
    
    specialInstructions: orderData.notes,
    
    authorizedOfficer: 'Authorized Officer Name', // Hardcoded
    title: 'Title', // Hardcoded
    signatureDate: new Date().toLocaleDateString(),
    
    dangerousGoods: 'NO_DANGEROUS_GOODS' // Default
  };
  
  return await generator.generateSLI(sliData);
}
