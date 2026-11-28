import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import zlib from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../server/src/app.js';
import { getDatabase, closeDatabase } from '../../server/src/db/database.js';
import { AuthService } from '../../server/src/modules/auth/auth.service.js';
import { signJoseAccessToken, getJwtKeyRotationConfig } from '../../server/src/modules/auth/jwt-jose.js';
import { loadConfig } from '../../server/src/config/env.js';
import { OrderService } from '../../server/src/modules/orders/order.service.js';
import { GallaService } from '../../server/src/modules/galla/galla.service.js';
import { getIstDateString } from '../../server/src/utils/ist-date.js';

function extractZipEntries(buf: Buffer): Record<string, string> {
  const entries: Record<string, string> = {};
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;
    const method = buf.readUInt16LE(offset + 8);
    const compSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const name = buf.subarray(nameStart, nameStart + nameLen).toString('utf8');
    const dataStart = nameStart + nameLen + extraLen;
    const rawData = buf.subarray(dataStart, dataStart + compSize);
    const content = method === 8 ? zlib.inflateRawSync(rawData).toString('utf8') : rawData.toString('utf8');
    entries[name] = content;
    offset = dataStart + compSize;
  }
  return entries;
}

describe('RPTS-02: Real Binary PDF & Word (.docx) Report Export Engine', () => {
  let app: FastifyInstance;
  let ownerCookie = '';
  let cookCookie = '';
  let vendorId = '';
  const todayIst = getIstDateString();

  beforeAll(async () => {
    process.env.USE_MEMORY_DB = 'true';
    process.env.JWT_SECRET = 'test-secret-key-for-rpts-02-unit-tests-only';
    app = await buildApp({ logger: false, rateLimitMax: 500 });
    await app.ready();

    const db = getDatabase();
    const config = loadConfig();
    const jwtConfig = getJwtKeyRotationConfig(config);

    const reg = await AuthService.registerVendor(db, {
      businessName: 'Feroz & Sons <Chai & Momos>',
      ownerName: 'Feroz',
      phone: '9855002211',
      password: 'StrongPassword@2026',
      city: 'Hyderabad',
    });
    vendorId = reg.vendor.id;

    await AuthService.updateVendorProfile(db, vendorId, {
      taxMode: 'regular',
      gstin: '36AABCU9603R1ZM',
      fssaiNumber: '12345678901234',
      gstRateBps: 500,
    });

    const ownerToken = await signJoseAccessToken(
      {
        sub: vendorId,
        phone: reg.vendor.phone,
        businessName: reg.vendor.business_name,
        role: 'owner',
        edition: 'cloud',
      },
      jwtConfig,
      900,
    );
    ownerCookie = `frose_access_token=${ownerToken}`;

    const cookToken = await signJoseAccessToken(
      {
        sub: vendorId,
        phone: reg.vendor.phone,
        businessName: reg.vendor.business_name,
        role: 'cook',
        edition: 'cloud',
      },
      jwtConfig,
      900,
    );
    cookCookie = `frose_access_token=${cookToken}`;

    const item = await db
      .insertInto('menu_items')
      .values({
        vendor_id: vendorId,
        name: 'Butter & Garlic <Momos>',
        category: 'Momos',
        price_paise: 10000,
        is_veg: true,
        display_order: 1,
        is_available: true,
        is_active: true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    await OrderService.createOrder(db, vendorId, {
      items: [{ menuItemId: item.id, quantity: 2 }], // subtotal 20000 + 5% GST = 21000 paise
      paymentMethod: 'cash',
      paymentStatus: 'paid',
    });

    await GallaService.logExpense(db, vendorId, {
      amountPaise: 5000,
      description: 'Gas & Oil <Refill>',
      category: 'fuel',
      paymentMethod: 'cash',
      expenseDate: todayIst,
    });

    await AuthService.setOwnerPin(db, vendorId, { pin: '1357' });
    await GallaService.addProfitAdjustment(db, vendorId, {
      businessDate: todayIst,
      amountPaise: 1000,
      note: 'Supplier <Discount> & Rebate',
      ownerPin: '1357',
    });
  });

  afterAll(async () => {
    if (app) await app.close();
    await closeDatabase();
  });

  it('rejects unauthenticated (401), cook role (403), and invalid format (400)', async () => {
    const unauth = await app.inject({
      method: 'GET',
      url: `/api/v1/galla/report/export?from=${todayIst}&to=${todayIst}&format=pdf`,
    });
    expect(unauth.statusCode).toBe(401);

    const cookRes = await app.inject({
      method: 'GET',
      url: `/api/v1/galla/report/export?from=${todayIst}&to=${todayIst}&format=pdf`,
      headers: { cookie: cookCookie },
    });
    expect(cookRes.statusCode).toBe(403);

    const badFmt = await app.inject({
      method: 'GET',
      url: `/api/v1/galla/report/export?from=${todayIst}&to=${todayIst}&format=xlsx`,
      headers: { cookie: ownerCookie },
    });
    expect(badFmt.statusCode).toBe(400);
  });

  it('generates a valid binary PDF (%PDF-1.4) with exact financial figures and headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/galla/report/export?from=${todayIst}&to=${todayIst}&format=pdf`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="frose-street-report-${todayIst}-to-${todayIst}.pdf"`,
    );

    const raw = res.rawPayload;
    expect(raw.subarray(0, 8).toString('ascii')).toBe('%PDF-1.4');
    const pdfText = raw.toString('latin1');
    expect(pdfText).toContain('xref');
    expect(pdfText).toContain('%%EOF');
    expect(pdfText).toContain('Feroz & Sons');
    expect(pdfText).toContain('36AABCU9603R1ZM');
    expect(pdfText).toContain('210.00'); // Gross sales
    expect(pdfText).toContain('50.00'); // Expenses
    expect(pdfText).toContain('170.00'); // Net profit: 210 - 50 + 10 = 170.00
  });

  it('generates a valid OOXML .docx archive (PK\\x03\\x04) with escaped XML and exact report numbers', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/galla/report/export?from=${todayIst}&to=${todayIst}&format=docx`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="frose-street-report-${todayIst}-to-${todayIst}.docx"`,
    );

    const raw = res.rawPayload;
    expect(raw[0]).toBe(0x50); // P
    expect(raw[1]).toBe(0x4b); // K
    expect(raw[2]).toBe(0x03);
    expect(raw[3]).toBe(0x04);

    const entries = extractZipEntries(raw);
    expect(entries['[Content_Types].xml']).toBeDefined();
    expect(entries['_rels/.rels']).toBeDefined();
    expect(entries['word/document.xml']).toBeDefined();
    expect(entries['word/styles.xml']).toBeDefined();

    const docXml = entries['word/document.xml'];
    expect(docXml).toContain('Feroz &amp; Sons &lt;Chai &amp; Momos&gt;');
    expect(docXml).toContain('Gas &amp; Oil &lt;Refill&gt;');
    expect(docXml).toContain('Butter &amp; Garlic &lt;Momos&gt;');
    expect(docXml).toContain('Supplier &lt;Discount&gt; &amp; Rebate');
    expect(docXml).toContain('210.00');
    expect(docXml).toContain('50.00');
    expect(docXml).toContain('170.00');
  });
});
