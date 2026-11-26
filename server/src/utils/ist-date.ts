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
