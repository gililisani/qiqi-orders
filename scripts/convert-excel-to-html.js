const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

async function convertExcelToHTML() {
  try {
    // Read the Excel file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('./public/templates/SLI - TEMPLATE.xlsx');
    
    // Get the first worksheet
    const worksheet = workbook.getWorksheet(1);
    
    console.log('Worksheet found:', !!worksheet);
    console.log('Worksheet name:', worksheet?.name);
    console.log('Workbook worksheets:', workbook.worksheets.map(ws => ws.name));
    
    // Generate HTML
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Shipper's Letter of Instructions</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    @page {
      size: A4;
      margin: 0;
    }

    body {
      font-family: Arial, sans-serif;
      font-size: 10pt;
      line-height: 1.2;
      color: #000;
      background: white;
    }

    .page {
      width: 210mm;
      height: 297mm;
      padding: 10mm;
      background: white;
      margin: 0 auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid #000;
    }

    td {
      border: 1px solid #000;
      padding: 3px;
      vertical-align: top;
      position: relative;
    }

    .field-label {
      font-size: 8pt;
      font-weight: bold;
      margin-bottom: 2px;
    }

    .field-value {
      min-height: 15px;
      border-bottom: 1px solid #000;
      margin-top: 2px;
    }

    .checkbox {
      width: 10px;
      height: 10px;
      border: 1px solid #000;
      display: inline-block;
      margin-right: 3px;
    }

    .checkbox.checked::after {
      content: '✓';
      position: absolute;
      font-size: 8pt;
      line-height: 10px;
    }

    @media print {
      body {
        width: 210mm;
        height: 297mm;
      }
      .page {
        margin: 0;
        padding: 10mm;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <table>`;

    // Convert worksheet to HTML table
    // Find the actual used range
    let maxRow = 0;
    let maxCol = 0;
    
    worksheet.eachRow((row, rowNumber) => {
      maxRow = Math.max(maxRow, rowNumber);
      row.eachCell((cell, colNumber) => {
        maxCol = Math.max(maxCol, colNumber);
      });
    });

    for (let row = 1; row <= maxRow; row++) {
      const rowData = worksheet.getRow(row);
      
      html += '<tr>';
      
      for (let col = 1; col <= maxCol; col++) {
        const cell = worksheet.getCell(row, col);
        const value = cell.value;
        
        // Get cell styling
        const fill = cell.fill?.fgColor?.argb || 'FFFFFF';
        const font = cell.font;
        const border = cell.border;
        
        // Convert fill color from ARGB to hex
        let bgColor = '#FFFFFF';
        if (fill && fill !== 'FFFFFF') {
          // Remove alpha and convert to hex
          const rgb = fill.slice(2); // Remove 'FF' prefix
          bgColor = `#${rgb}`;
        }
        
        // Build style string
        let style = `background-color: ${bgColor};`;
        
        if (font?.bold) style += ' font-weight: bold;';
        if (font?.italic) style += ' font-style: italic;';
        if (font?.size) style += ` font-size: ${font.size}pt;`;
        if (font?.color?.argb) {
          const textColor = font.color.argb.slice(2);
          style += ` color: #${textColor};`;
        }
        
        // Check for borders
        if (border?.top?.style) style += ' border-top: 1px solid #000;';
        if (border?.bottom?.style) style += ' border-bottom: 1px solid #000;';
        if (border?.left?.style) style += ' border-left: 1px solid #000;';
        if (border?.right?.style) style += ' border-right: 1px solid #000;';
        
        // Handle merged cells
        let colspan = 1;
        let rowspan = 1;
        
        if (cell.isMerged) {
          const mergeRange = worksheet.model[`${row}:${col}`];
          if (mergeRange) {
            colspan = mergeRange.right - mergeRange.left + 1;
            rowspan = mergeRange.bottom - mergeRange.top + 1;
          }
        }
        
        let colspanAttr = colspan > 1 ? ` colspan="${colspan}"` : '';
        let rowspanAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
        
        // Convert cell value to HTML
        let cellContent = '';
        if (value) {
          if (typeof value === 'string') {
            cellContent = value.replace(/\n/g, '<br>');
          } else if (typeof value === 'object' && value.richText) {
            cellContent = value.richText.map(part => part.text).join('');
          } else {
            cellContent = String(value);
          }
        }
        
        // Check if this looks like a field (has brackets or is empty)
        if (cellContent.includes('[') && cellContent.includes(']')) {
          cellContent = cellContent.replace(/\[([^\]]+)\]/g, '<span class="field-value">$1</span>');
        }
        
        html += `<td style="${style}"${colspanAttr}${rowspanAttr}>${cellContent}</td>`;
      }
      
      html += '</tr>';
    }

    html += `    </table>
  </div>
</body>
</html>`;

    // Write HTML file
    const outputPath = './public/templates/sli-from-excel.html';
    fs.writeFileSync(outputPath, html);
    
    console.log('✅ HTML file generated successfully!');
    console.log(`📁 Output: ${outputPath}`);
    
  } catch (error) {
    console.error('❌ Error converting Excel to HTML:', error);
  }
}

convertExcelToHTML();
