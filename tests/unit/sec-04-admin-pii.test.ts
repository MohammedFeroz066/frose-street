import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CLIENT_DIR = path.resolve(process.cwd(), 'client');

function collectClientFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectClientFiles(full));
    } else if (entry.isFile() && /\.(html|js)$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

describe('SEC-04-ADMIN-PII: Remove frose_vendors_directory cross-tenant PII cache from client', () => {
  it('never reads or writes frose_vendors_directory anywhere in client/', () => {
    const files = collectClientFiles(CLIENT_DIR);
    const forbiddenHits: string[] = [];

    const readOrWriteRegex = /localStorage\.(?:getItem|setItem)\(\s*['"]frose_vendors_directory['"]/g;
    const helperRegex = /\b(?:getDynamicVendors|saveVendorToDirectory|CLOUD_BASELINE_VENDORS)\b/g;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const rel = path.relative(CLIENT_DIR, file);
      let m: RegExpExecArray | null;

      while ((m = readOrWriteRegex.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length;
        forbiddenHits.push(`${rel}:${line} -> ${m[0]}`);
      }
      while ((m = helperRegex.exec(content)) !== null) {
        const line = content.slice(0, m.index).split('\n').length;
        forbiddenHits.push(`${rel}:${line} -> ${m[0]}`);
      }
    }

    expect(forbiddenHits).toEqual([]);
  });

  it('explicitly wipes any leftover frose_vendors_directory key on admin load and logout', () => {
    const adminPageJs = fs.readFileSync(path.join(CLIENT_DIR, 'js/admin-page.js'), 'utf8');
    const apiClientJs = fs.readFileSync(path.join(CLIENT_DIR, 'js/api-client.js'), 'utf8');

    expect(adminPageJs).toContain("localStorage.removeItem('frose_vendors_directory')");
    expect(apiClientJs).toContain("removeItem('frose_vendors_directory')");
  });
});
