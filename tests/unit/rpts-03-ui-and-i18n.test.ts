import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('RPTS-03: Reports & Analytics UI, 4-Digit Owner PIN Sheet & i18n', () => {
  const clientDir = path.resolve(process.cwd(), 'client');

  it('payments-panel.js provides period pills, custom date range, net profit KPI, PIN sheet & PDF/DOCX downloads', () => {
    const js = fs.readFileSync(path.join(clientDir, 'js/payments-panel.js'), 'utf8');

    expect(js).toContain('/api/v1/galla/report');
    expect(js).toContain('/api/v1/galla/report/export');
    expect(js).toContain('/api/v1/auth/owner-pin');
    expect(js).toContain('/api/v1/auth/owner-pin/verify');
    expect(js).toContain('/api/v1/galla/profit-adjustments');
    expect(js).toContain('btn-period-today');
    expect(js).toContain('btn-period-yesterday');
    expect(js).toContain('btn-period-week');
    expect(js).toContain('btn-period-month');
    expect(js).toContain('btn-period-custom');
    expect(js).toContain('btn-export-report-pdf');
    expect(js).toContain('btn-export-report-docx');
    expect(js).toContain('kpi-net-profit');
    expect(js).toContain('btn-adjust-net-profit');
    expect(js).toContain("openSheet('owner-pin-sheet'");
    expect(js).toContain("closeSheet('owner-pin-sheet'");
  });

  it('billing.html defines owner-pin-sheet, expense-edit-sheet, and profit-adjust-sheet with Back buttons', () => {
    const html = fs.readFileSync(path.join(clientDir, 'billing.html'), 'utf8');

    expect(html).toContain('id="owner-pin-sheet"');
    expect(html).toContain('id="btn-owner-pin-back"');
    expect(html).toContain('id="expense-edit-sheet"');
    expect(html).toContain('id="profit-adjust-sheet"');
  });

  it('settings-component.js exposes 4-Digit Owner PIN configuration under Security', () => {
    const js = fs.readFileSync(path.join(clientDir, 'js/settings-component.js'), 'utf8');

    expect(js).toContain('/api/v1/auth/owner-pin');
    expect(js).toContain('sett-owner-pin');
    expect(js).toContain('btn-save-owner-pin');
  });

  it('i18n.js defines all new Reports & Owner PIN translation keys across en, te, hi, ta', () => {
    const i18nJs = fs.readFileSync(path.join(clientDir, 'js/i18n.js'), 'utf8');
    const requiredKeys = [
      'reports.period_today',
      'reports.period_yesterday',
      'reports.period_week',
      'reports.period_month',
      'reports.period_custom',
      'reports.net_profit',
      'reports.download_pdf',
      'reports.download_docx',
      'reports.adjust_profit',
      'pin.title_verify',
      'pin.title_setup',
    ];
    for (const key of requiredKeys) {
      const matches = i18nJs.match(new RegExp(`'${key}'`, 'g'));
      expect(matches?.length, `Key ${key} must exist in all 4 locales (en, te, hi, ta)`).toBe(4);
    }
  });
});
