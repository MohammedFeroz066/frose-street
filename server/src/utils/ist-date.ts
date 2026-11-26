const IST_OFFSET_MS = 19_800_000; // Asia/Kolkata = UTC+05:30

/**
 * Returns the YYYY-MM-DD calendar date in Asia/Kolkata (IST, UTC+05:30).
 * Ensures daily token counters and Galla summaries roll over strictly at 00:00 IST.
 */
export function getIstDateString(dateInput?: Date | string | number): string {
  const date = dateInput !== undefined ? new Date(dateInput) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Date(safeDate.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Normalizes a PostgreSQL DATE column (Date or YYYY-MM-DD string) into YYYY-MM-DD
 * without shifting across timezone boundaries.
 */
export function normalizeDateColumnString(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(val).slice(0, 10);
}

/**
 * Computes the 4-digit Indian Financial Year (April 1 - March 31 IST) code,
 * e.g. '2627' for 2026-04-01 IST through 2027-03-31 IST.
 */
export function getIndianFinancialYearCode(dateInput?: Date | string | number): string {
  const istDate = getIstDateString(dateInput);
  const year = Number(istDate.slice(0, 4));
  const month = Number(istDate.slice(5, 7));
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  const startShort = String(startYear % 100).padStart(2, '0');
  const endShort = String(endYear % 100).padStart(2, '0');
  return `${startShort}${endShort}`;
}

/**
 * Formats a sequential Indian Financial Year receipt number (e.g. FS-2627-0001).
 */
export function formatReceiptNumber(fyCode: string, sequenceNumber: number): string {
  const seqStr = String(sequenceNumber).padStart(4, '0');
  return `FS-${fyCode}-${seqStr}`;
}
