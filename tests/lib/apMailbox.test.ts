import { describe, expect, it } from 'vitest';
import { htmlToText, invoiceAttachments, parseAuthResults } from '@/lib/ap/mailbox';

describe('parseAuthResults', () => {
  it('reads the SPF / DKIM / DMARC verdicts', () => {
    const headers = [
      { name: 'Received', value: 'from x' },
      {
        name: 'Authentication-Results',
        value: 'spf=pass (sender IP is 209.85.1.1) smtp.mailfrom=gmail.com; dkim=pass (signature was verified) header.d=gmail.com;dmarc=pass action=none header.from=gmail.com;compauth=pass reason=100',
      },
    ];
    expect(parseAuthResults(headers)).toEqual({ spf: 'pass', dkim: 'pass', dmarc: 'pass' });
    expect(parseAuthResults([{ name: 'authentication-results', value: 'spf=SoftFail; dkim=none' }])).toEqual({ spf: 'softfail', dkim: 'none', dmarc: null });
    expect(parseAuthResults(undefined)).toEqual({ spf: null, dkim: null, dmarc: null });
  });
});

describe('htmlToText', () => {
  it('keeps the words and the line structure, drops styles and tags', () => {
    const html = '<html><head><style>p{color:red}</style></head><body><p>Receipt&nbsp;#123</p><table><tr><td>Total</td><td>$34.35</td></tr></table>Paid with Visa &amp; done<br/>Thanks</body></html>';
    expect(htmlToText(html)).toBe('Receipt #123\nTotal $34.35\nPaid with Visa & done\nThanks');
  });
});

describe('invoiceAttachments', () => {
  const file = (over: Partial<Parameters<typeof invoiceAttachments>[0][number]>) => ({
    id: 'a', name: 'x', contentType: null, size: 100_000, isInline: false, '@odata.type': '#microsoft.graph.fileAttachment', ...over,
  });
  it('keeps PDFs and real images; drops logos, embedded emails and other files', () => {
    const kept = invoiceAttachments([
      file({ id: '1', name: 'Invoice-1.pdf', contentType: 'application/pdf' }),
      file({ id: '2', name: 'receipt.PDF', contentType: 'application/octet-stream' }),
      file({ id: '3', name: 'scan.jpg', contentType: 'image/jpeg', size: 400_000 }),
      file({ id: '4', name: 'logo.png', contentType: 'image/png', size: 8_000 }),
      file({ id: '5', name: 'banner.png', contentType: 'image/png', size: 90_000, isInline: true }),
      file({ id: '6', name: 'original.eml', '@odata.type': '#microsoft.graph.itemAttachment' }),
      file({ id: '7', name: 'terms.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }),
    ]);
    expect(kept.map((a) => a.id)).toEqual(['1', '2', '3']);
  });
});
