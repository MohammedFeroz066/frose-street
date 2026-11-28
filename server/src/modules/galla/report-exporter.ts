import zlib from 'node:zlib';
import type { PeriodReport } from './galla.service.js';
import { formatPaiseToInr } from './galla.service.js';

// ============================================================================
// Shared Formatting & Escaping Helpers
// ============================================================================

function formatRsAscii(paise: number): string {
  const num = Number(paise || 0);
  const neg = num < 0;
  const abs = Math.abs(Math.trunc(num));
  const inr = formatPaiseToInr(abs);
  const [whole, dec] = inr.split('.');
  const formattedWhole = Number(whole).toLocaleString('en-IN');
  return `${neg ? '-' : ''}Rs. ${formattedWhole}.${dec}`;
}

function escapePdfText(raw: string): string {
  const clean = String(raw ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
  return clean;
}

function escapeXml(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateText(str: string, maxLen: number): string {
  const s = String(str || '');
  return s.length > maxLen ? s.slice(0, maxLen - 3) + '...' : s;
}

function formatGeneratedIst(): string {
  const ist = new Date(Date.now() + 19_800_000).toISOString();
  return `${ist.slice(0, 10)} ${ist.slice(11, 16)} IST`;
}

// ============================================================================
// Pure Node.js Binary PDF (%PDF-1.4) Generator
// ============================================================================

interface PdfCmdPage {
  commands: string[];
  y: number;
}

export function generatePeriodReportPdf(report: PeriodReport): Buffer {
  const PAGE_W = 595.28; // A4 width in pt
  const PAGE_H = 841.89; // A4 height in pt
  const MARGIN_L = 42;
  const MARGIN_R = 42;
  const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R;
  const BOTTOM_LIMIT = 58;

  const pages: PdfCmdPage[] = [];
  let curPage: PdfCmdPage = { commands: [], y: PAGE_H - 44 };
  pages.push(curPage);

  const newPage = () => {
    curPage = { commands: [], y: PAGE_H - 48 };
    pages.push(curPage);
  };

  const ensureSpace = (neededPt: number) => {
    if (curPage.y - neededPt < BOTTOM_LIMIT) {
      newPage();
    }
  };

  const drawText = (
    text: string,
    x: number,
    y: number,
    opts?: { font?: 'F1' | 'F2' | 'F3'; size?: number; color?: [number, number, number] },
  ) => {
    const font = opts?.font || 'F1';
    const size = opts?.size || 10;
    const [r, g, b] = opts?.color || [0.06, 0.09, 0.16];
    curPage.commands.push(
      `BT /${font} ${size} Tf ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg ${x.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(text)}) Tj ET`,
    );
  };

  const drawRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    opts?: { fill?: [number, number, number]; stroke?: [number, number, number]; lineWidth?: number },
  ) => {
    const parts: string[] = [];
    if (opts?.lineWidth) parts.push(`${opts.lineWidth} w`);
    if (opts?.fill) parts.push(`${opts.fill[0].toFixed(3)} ${opts.fill[1].toFixed(3)} ${opts.fill[2].toFixed(3)} rg`);
    if (opts?.stroke) parts.push(`${opts.stroke[0].toFixed(3)} ${opts.stroke[1].toFixed(3)} ${opts.stroke[2].toFixed(3)} RG`);
    parts.push(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re`);
    parts.push(opts?.fill && opts?.stroke ? 'B' : opts?.fill ? 'f' : 'S');
    curPage.commands.push(parts.join(' '));
  };

  const drawHLine = (y: number, color: [number, number, number] = [0.85, 0.88, 0.92]) => {
    curPage.commands.push(
      `0.6 w ${color[0].toFixed(3)} ${color[1].toFixed(3)} ${color[2].toFixed(3)} RG ${MARGIN_L} ${y.toFixed(2)} m ${(PAGE_W - MARGIN_R).toFixed(2)} ${y.toFixed(2)} l S`,
    );
  };

  // --- Header Banner ---
  drawRect(MARGIN_L, curPage.y - 54, CONTENT_W, 64, { fill: [0.059, 0.09, 0.165] });
  drawText('FROSE STREET - BUSINESS PERFORMANCE REPORT', MARGIN_L + 14, curPage.y - 12, {
    font: 'F2',
    size: 13,
    color: [1, 1, 1],
  });
  drawText(truncateText(report.vendor.businessName, 55), MARGIN_L + 14, curPage.y - 30, {
    font: 'F2',
    size: 11,
    color: [0.204, 0.827, 0.6],
  });
  drawText(`Period: ${report.from} to ${report.to} (IST)`, MARGIN_L + 14, curPage.y - 45, {
    font: 'F1',
    size: 9,
    color: [0.8, 0.85, 0.9],
  });
  curPage.y -= 72;

  const metaBits: string[] = [];
  if (report.vendor.gstin) metaBits.push(`GSTIN: ${report.vendor.gstin}`);
  if (report.vendor.fssaiNumber) metaBits.push(`FSSAI: ${report.vendor.fssaiNumber}`);
  if (report.vendor.stallAddress) metaBits.push(`Address: ${truncateText(report.vendor.stallAddress, 45)}`);
  if (metaBits.length > 0) {
    drawText(metaBits.join('   |   '), MARGIN_L, curPage.y, {
      font: 'F1',
      size: 8.5,
      color: [0.35, 0.42, 0.52],
    });
    curPage.y -= 18;
  }

  // --- Financial Summary Section ---
  drawText('1. FINANCIAL SUMMARY', MARGIN_L, curPage.y, { font: 'F2', size: 11 });
  curPage.y -= 8;
  drawHLine(curPage.y);
  curPage.y -= 16;

  const summaryRows: Array<[string, string, boolean?]> = [
    ['Gross Sales', formatRsAscii(report.grossSalesPaise)],
    ['Cash Sales', formatRsAscii(report.cashSalesPaise)],
    ['UPI Sales (Marked paid UPI)', formatRsAscii(report.upiSalesPaise)],
    ['Split Orders Total', formatRsAscii(report.splitSalesPaise)],
    ['Paid Orders / Cancelled Orders', `${report.totalOrders} paid / ${report.cancelledOrders} void`],
    ['Average Order Value', formatRsAscii(report.averageOrderPaise)],
    ['Total Purchase / Stall Expenses', formatRsAscii(report.totalExpensesPaise)],
    ['Net Profit Adjustments', formatRsAscii(report.profitAdjustmentsPaise)],
    ['NET PROFIT', formatRsAscii(report.netProfitPaise), true],
  ];

  for (const [label, val, isHighlight] of summaryRows) {
    ensureSpace(22);
    if (isHighlight) {
      const isPos = report.netProfitPaise >= 0;
      drawRect(MARGIN_L, curPage.y - 5, CONTENT_W, 20, {
        fill: isPos ? [0.925, 0.992, 0.961] : [0.996, 0.949, 0.949],
        stroke: isPos ? [0.02, 0.588, 0.412] : [0.882, 0.114, 0.282],
        lineWidth: 0.8,
      });
      drawText(label, MARGIN_L + 8, curPage.y + 1, {
        font: 'F2',
        size: 10.5,
        color: isPos ? [0.02, 0.48, 0.34] : [0.75, 0.1, 0.22],
      });
      drawText(val, PAGE_W - MARGIN_R - 140, curPage.y + 1, {
        font: 'F2',
        size: 10.5,
        color: isPos ? [0.02, 0.48, 0.34] : [0.75, 0.1, 0.22],
      });
      curPage.y -= 24;
    } else {
      drawText(label, MARGIN_L + 6, curPage.y, { font: 'F1', size: 9.5, color: [0.25, 0.32, 0.42] });
      drawText(val, PAGE_W - MARGIN_R - 140, curPage.y, { font: 'F3', size: 9.5 });
      curPage.y -= 16;
    }
  }

  curPage.y -= 10;

  // --- Itemized Expenses Section ---
  ensureSpace(46);
  drawText(`2. ITEMIZED EXPENSES (${report.expenses.length})`, MARGIN_L, curPage.y, { font: 'F2', size: 11 });
  curPage.y -= 8;
  drawHLine(curPage.y);
  curPage.y -= 16;

  if (report.expenses.length === 0) {
    drawText('No expenses recorded in this period.', MARGIN_L + 6, curPage.y, {
      font: 'F1',
      size: 9,
      color: [0.45, 0.52, 0.6],
    });
    curPage.y -= 18;
  } else {
    drawRect(MARGIN_L, curPage.y - 4, CONTENT_W, 16, { fill: [0.945, 0.96, 0.98] });
    drawText('Date', MARGIN_L + 6, curPage.y, { font: 'F2', size: 8.5 });
    drawText('Description', MARGIN_L + 82, curPage.y, { font: 'F2', size: 8.5 });
    drawText('Category', MARGIN_L + 295, curPage.y, { font: 'F2', size: 8.5 });
    drawText('Mode', MARGIN_L + 375, curPage.y, { font: 'F2', size: 8.5 });
    drawText('Amount', PAGE_W - MARGIN_R - 86, curPage.y, { font: 'F2', size: 8.5 });
    curPage.y -= 18;

    for (const exp of report.expenses) {
      ensureSpace(18);
      drawText(exp.businessDate, MARGIN_L + 6, curPage.y, { font: 'F3', size: 8.5 });
      drawText(truncateText(exp.title, 34), MARGIN_L + 82, curPage.y, { font: 'F1', size: 8.5 });
      drawText(truncateText(exp.category, 14), MARGIN_L + 295, curPage.y, { font: 'F1', size: 8.5 });
      drawText(exp.paymentMethod.toUpperCase(), MARGIN_L + 375, curPage.y, { font: 'F1', size: 8.5 });
      drawText(formatRsAscii(exp.amountPaise), PAGE_W - MARGIN_R - 86, curPage.y, { font: 'F3', size: 8.5 });
      curPage.y -= 15;
    }
    curPage.y -= 8;
  }

  // --- Profit Adjustments Section ---
  if (report.adjustments.length > 0) {
    ensureSpace(46);
    drawText(`3. NET PROFIT ADJUSTMENTS AUDIT (${report.adjustments.length})`, MARGIN_L, curPage.y, {
      font: 'F2',
      size: 11,
    });
    curPage.y -= 8;
    drawHLine(curPage.y);
    curPage.y -= 16;

    for (const adj of report.adjustments) {
      ensureSpace(18);
      drawText(adj.businessDate, MARGIN_L + 6, curPage.y, { font: 'F3', size: 8.5 });
      drawText(truncateText(adj.note, 48), MARGIN_L + 82, curPage.y, { font: 'F1', size: 8.5 });
      drawText(formatRsAscii(adj.amountPaise), PAGE_W - MARGIN_R - 100, curPage.y, { font: 'F3', size: 8.5 });
      curPage.y -= 15;
    }
    curPage.y -= 8;
  }

  // --- Top Selling Items Section ---
  ensureSpace(46);
  drawText(`4. TOP SELLING ITEMS (${report.topItems.length})`, MARGIN_L, curPage.y, { font: 'F2', size: 11 });
  curPage.y -= 8;
  drawHLine(curPage.y);
  curPage.y -= 16;

  if (report.topItems.length === 0) {
    drawText('No item sales recorded in this period.', MARGIN_L + 6, curPage.y, {
      font: 'F1',
      size: 9,
      color: [0.45, 0.52, 0.6],
    });
    curPage.y -= 18;
  } else {
    drawRect(MARGIN_L, curPage.y - 4, CONTENT_W, 16, { fill: [0.945, 0.96, 0.98] });
    drawText('Dish / Item', MARGIN_L + 6, curPage.y, { font: 'F2', size: 8.5 });
    drawText('Qty Sold', MARGIN_L + 310, curPage.y, { font: 'F2', size: 8.5 });
    drawText('Revenue', PAGE_W - MARGIN_R - 95, curPage.y, { font: 'F2', size: 8.5 });
    curPage.y -= 18;

    for (const it of report.topItems) {
      ensureSpace(18);
      drawText(truncateText(it.itemName, 44), MARGIN_L + 6, curPage.y, { font: 'F1', size: 8.5 });
      drawText(String(it.quantity), MARGIN_L + 310, curPage.y, { font: 'F3', size: 8.5 });
      drawText(formatRsAscii(it.revenuePaise), PAGE_W - MARGIN_R - 95, curPage.y, { font: 'F3', size: 8.5 });
      curPage.y -= 15;
    }
  }

  // --- Daily Breakdown (if multi-day) ---
  if (report.dailyBreakdown.length > 1) {
    curPage.y -= 10;
    ensureSpace(46);
    drawText(`5. DAILY BREAKDOWN (${report.dailyBreakdown.length} Days)`, MARGIN_L, curPage.y, { font: 'F2', size: 11 });
    curPage.y -= 8;
    drawHLine(curPage.y);
    curPage.y -= 16;

    drawRect(MARGIN_L, curPage.y - 4, CONTENT_W, 16, { fill: [0.945, 0.96, 0.98] });
    drawText('Date', MARGIN_L + 6, curPage.y, { font: 'F2', size: 8.5 });
    drawText('Orders', MARGIN_L + 95, curPage.y, { font: 'F2', size: 8.5 });
    drawText('Sales', MARGIN_L + 165, curPage.y, { font: 'F2', size: 8.5 });
    drawText('Expenses', MARGIN_L + 290, curPage.y, { font: 'F2', size: 8.5 });
    drawText('Net Profit', PAGE_W - MARGIN_R - 100, curPage.y, { font: 'F2', size: 8.5 });
    curPage.y -= 18;

    for (const d of report.dailyBreakdown) {
      ensureSpace(18);
      drawText(d.date, MARGIN_L + 6, curPage.y, { font: 'F3', size: 8.5 });
      drawText(String(d.orderCount), MARGIN_L + 95, curPage.y, { font: 'F3', size: 8.5 });
      drawText(formatRsAscii(d.grossSalesPaise), MARGIN_L + 165, curPage.y, { font: 'F3', size: 8.5 });
      drawText(formatRsAscii(d.expensesPaise), MARGIN_L + 290, curPage.y, { font: 'F3', size: 8.5 });
      drawText(formatRsAscii(d.netProfitPaise), PAGE_W - MARGIN_R - 100, curPage.y, { font: 'F3', size: 8.5 });
      curPage.y -= 15;
    }
  }

  // Add footer to every page
  const generatedAt = formatGeneratedIst();
  const totalPages = pages.length;
  pages.forEach((pg, idx) => {
    pg.commands.push(
      `0.5 w 0.85 0.88 0.92 RG ${MARGIN_L} 40 m ${(PAGE_W - MARGIN_R).toFixed(2)} 40 l S`,
      `BT /F1 8 Tf 0.45 0.52 0.60 rg ${MARGIN_L} 28 Td (Generated ${escapePdfText(generatedAt)} | FROSE Street POS) Tj ET`,
      `BT /F1 8 Tf 0.45 0.52 0.60 rg ${(PAGE_W - MARGIN_R - 60).toFixed(2)} 28 Td (Page ${idx + 1} of ${totalPages}) Tj ET`,
    );
  });

  // Assemble PDF Objects with exact byte offsets
  const objects: string[] = [];
  // 1: Catalog, 2: Pages, 3: F1 Helvetica, 4: F2 Helvetica-Bold, 5: F3 Courier
  const pageObjIds: number[] = [];
  let nextId = 6;
  const pageContentPairs: Array<{ pageId: number; contentId: number; stream: string }> = [];
  for (const pg of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageObjIds.push(pageId);
    pageContentPairs.push({ pageId, contentId, stream: pg.commands.join('\n') });
  }

  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjIds.length} >>\nendobj\n`;
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;
  objects[4] = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n`;
  objects[5] = `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>\nendobj\n`;

  for (const pair of pageContentPairs) {
    objects[pair.pageId] =
      `${pair.pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${pair.contentId} 0 R >>\nendobj\n`;
    const streamLen = Buffer.byteLength(pair.stream, 'latin1');
    objects[pair.contentId] =
      `${pair.contentId} 0 obj\n<< /Length ${streamLen} >>\nstream\n${pair.stream}\nendstream\nendobj\n`;
  }

  const header = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const chunks: Buffer[] = [Buffer.from(header, 'latin1')];
  let byteOffset = chunks[0].length;
  const offsets: number[] = [0];

  for (let i = 1; i < objects.length; i++) {
    offsets[i] = byteOffset;
    const buf = Buffer.from(objects[i], 'latin1');
    chunks.push(buf);
    byteOffset += buf.length;
  }

  const xrefStart = byteOffset;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer =
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xrefStart}\n%%EOF\n`;

  chunks.push(Buffer.from(xref + trailer, 'latin1'));
  return Buffer.concat(chunks);
}

// ============================================================================
// Pure Node.js OOXML (.docx) ZIP Archive Generator (using node:zlib)
// ============================================================================

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC32_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildZipArchive(files: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const dataBuf = Buffer.from(f.content, 'utf8');
    const compressed = zlib.deflateRawSync(dataBuf);
    const crc = crc32(dataBuf);

    // Local file header (30 bytes + filename)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Version needed
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(8, 8); // Compression: Deflate
    localHeader.writeUInt16LE(0, 10); // Mod time
    localHeader.writeUInt16LE(0x5421, 12); // Mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + filename)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5421, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function wParagraph(text: string, opts?: { bold?: boolean; sizeHalfPt?: number; color?: string; spaceAfter?: number }): string {
  const rPr = [
    opts?.bold ? '<w:b/>' : '',
    opts?.sizeHalfPt ? `<w:sz w:val="${opts.sizeHalfPt}"/><w:szCs w:val="${opts.sizeHalfPt}"/>` : '',
    opts?.color ? `<w:color w:val="${opts.color}"/>` : '',
  ].join('');
  const pPr = opts?.spaceAfter !== undefined ? `<w:pPr><w:spacing w:after="${opts.spaceAfter}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function wTable(headers: string[], rows: string[][], widthsDxa: number[]): string {
  const buildRow = (cells: string[], isHeader: boolean) => {
    const cellsXml = cells
      .map((cell, idx) => {
        const w = widthsDxa[idx] || 2200;
        const shading = isHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="F1F5F9"/>' : '';
        return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shading}</w:tcPr>${wParagraph(cell, {
          bold: isHeader,
          sizeHalfPt: 19,
          spaceAfter: 40,
        })}</w:tc>`;
      })
      .join('');
    return `<w:tr>${cellsXml}</w:tr>`;
  };

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/>` +
    `<w:tblBorders>` +
    `<w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>` +
    `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>` +
    `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>` +
    `<w:left w:val="none"/><w:right w:val="none"/><w:insideV w:val="none"/>` +
    `</w:tblBorders></w:tblPr>` +
    buildRow(headers, true) +
    rows.map((r) => buildRow(r, false)).join('') +
    `</w:tbl>`
  );
}

export function generatePeriodReportDocx(report: PeriodReport): Buffer {
  const contentTypesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `</Types>`;

  const relsXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="word/styles.xml"/>` +
    `</Relationships>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal">` +
    `<w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr>` +
    `</w:style></w:styles>`;

  const parts: string[] = [];
  parts.push(wParagraph('FROSE STREET — BUSINESS REPORT', { bold: true, sizeHalfPt: 32, color: '0F172A', spaceAfter: 80 }));
  parts.push(wParagraph(report.vendor.businessName, { bold: true, sizeHalfPt: 26, color: '059669', spaceAfter: 60 }));
  parts.push(wParagraph(`Period: ${report.from} to ${report.to} (IST)`, { sizeHalfPt: 20, color: '475569', spaceAfter: 40 }));

  const complianceBits: string[] = [];
  if (report.vendor.gstin) complianceBits.push(`GSTIN: ${report.vendor.gstin}`);
  if (report.vendor.fssaiNumber) complianceBits.push(`FSSAI: ${report.vendor.fssaiNumber}`);
  if (report.vendor.stallAddress) complianceBits.push(`Address: ${report.vendor.stallAddress}`);
  if (complianceBits.length > 0) {
    parts.push(wParagraph(complianceBits.join(' | '), { sizeHalfPt: 18, color: '64748B', spaceAfter: 120 }));
  }

  parts.push(wParagraph('1. Financial Summary', { bold: true, sizeHalfPt: 24, color: '0F172A', spaceAfter: 80 }));
  parts.push(
    wTable(
      ['Metric', 'Value'],
      [
        ['Gross Sales', formatRsAscii(report.grossSalesPaise)],
        ['Cash Sales', formatRsAscii(report.cashSalesPaise)],
        ['UPI Sales (Marked paid UPI)', formatRsAscii(report.upiSalesPaise)],
        ['Split Orders Total', formatRsAscii(report.splitSalesPaise)],
        ['Total Paid Orders', String(report.totalOrders)],
        ['Cancelled / Void Orders', String(report.cancelledOrders)],
        ['Average Order Value', formatRsAscii(report.averageOrderPaise)],
        ['Total Expenses', formatRsAscii(report.totalExpensesPaise)],
        ['Profit Adjustments', formatRsAscii(report.profitAdjustmentsPaise)],
        ['NET PROFIT', formatRsAscii(report.netProfitPaise)],
      ],
      [5400, 3600],
    ),
  );

  parts.push(wParagraph('', { spaceAfter: 120 }));
  parts.push(wParagraph(`2. Itemized Expenses (${report.expenses.length})`, { bold: true, sizeHalfPt: 24, color: '0F172A', spaceAfter: 80 }));
  if (report.expenses.length === 0) {
    parts.push(wParagraph('No expenses recorded for this period.', { sizeHalfPt: 20, color: '64748B', spaceAfter: 100 }));
  } else {
    parts.push(
      wTable(
        ['Date', 'Description', 'Category', 'Mode', 'Amount'],
        report.expenses.map((e) => [
          e.businessDate,
          e.title,
          e.category,
          e.paymentMethod.toUpperCase(),
          formatRsAscii(e.amountPaise),
        ]),
        [1500, 3400, 1500, 1000, 1600],
      ),
    );
  }

  if (report.adjustments.length > 0) {
    parts.push(wParagraph('', { spaceAfter: 120 }));
    parts.push(wParagraph(`3. Profit Adjustments Audit (${report.adjustments.length})`, { bold: true, sizeHalfPt: 24, color: '0F172A', spaceAfter: 80 }));
    parts.push(
      wTable(
        ['Date', 'Note', 'Adjustment'],
        report.adjustments.map((a) => [a.businessDate, a.note, formatRsAscii(a.amountPaise)]),
        [1800, 5200, 2000],
      ),
    );
  }

  parts.push(wParagraph('', { spaceAfter: 120 }));
  parts.push(wParagraph(`4. Top Selling Dishes (${report.topItems.length})`, { bold: true, sizeHalfPt: 24, color: '0F172A', spaceAfter: 80 }));
  if (report.topItems.length === 0) {
    parts.push(wParagraph('No items sold during this period.', { sizeHalfPt: 20, color: '64748B', spaceAfter: 100 }));
  } else {
    parts.push(
      wTable(
        ['Dish Name', 'Qty Sold', 'Revenue'],
        report.topItems.map((it) => [it.itemName, String(it.quantity), formatRsAscii(it.revenuePaise)]),
        [5200, 1600, 2200],
      ),
    );
  }

  if (report.dailyBreakdown.length > 1) {
    parts.push(wParagraph('', { spaceAfter: 120 }));
    parts.push(wParagraph(`5. Daily Breakdown (${report.dailyBreakdown.length} Days)`, { bold: true, sizeHalfPt: 24, color: '0F172A', spaceAfter: 80 }));
    parts.push(
      wTable(
        ['Date', 'Orders', 'Sales', 'Expenses', 'Net Profit'],
        report.dailyBreakdown.map((d) => [
          d.date,
          String(d.orderCount),
          formatRsAscii(d.grossSalesPaise),
          formatRsAscii(d.expensesPaise),
          formatRsAscii(d.netProfitPaise),
        ]),
        [1800, 1200, 2000, 2000, 2000],
      ),
    );
  }

  parts.push(wParagraph('', { spaceAfter: 120 }));
  parts.push(wParagraph(`Generated ${formatGeneratedIst()} | FROSE Street Micro-POS`, { sizeHalfPt: 18, color: '64748B', spaceAfter: 40 }));

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${parts.join('')}<w:sectPr/></w:body>` +
    `</w:document>`;

  return buildZipArchive([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: relsXml },
    { name: 'word/styles.xml', content: stylesXml },
    { name: 'word/document.xml', content: documentXml },
  ]);
}
