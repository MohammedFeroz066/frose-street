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
    } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.js'))) {
      results.push(full);
    }
  }
  return results;
}

describe('SEC-09-CSP-EXTRACT: Zero inline scripts or inline event handlers in client/', () => {
  it('has zero inline <script> blocks without src in client/**/*.html', () => {
    const htmlFiles = collectClientFiles(CLIENT_DIR).filter((f) => f.endsWith('.html'));
    const violations: string[] = [];
    const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;

    for (const file of htmlFiles) {
      const content = fs.readFileSync(file, 'utf8');
      let match: RegExpExecArray | null;
      while ((match = scriptRegex.exec(content)) !== null) {
        if (match[1].trim().length > 0) {
          const line = content.slice(0, match.index).split('\n').length;
          violations.push(`${path.relative(CLIENT_DIR, file)}:${line}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('has zero inline on*= event handler attributes in client/**/*.{html,js}', () => {
    const files = collectClientFiles(CLIENT_DIR);
    const violations: string[] = [];
    const inlineHandlerRegex = /(?:^|[\s"'`<])on(?:click|change|input|submit|error|load|keyup|keydown|keypress|focus|blur|mouseover|mouseout|mousedown|mouseup|touchstart|touchend)\s*=/i;

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (inlineHandlerRegex.test(line)) {
          violations.push(`${path.relative(CLIENT_DIR, file)}:${idx + 1}: ${line.trim().slice(0, 100)}`);
        }
        inlineHandlerRegex.lastIndex = 0;
      });
    }

    expect(violations).toEqual([]);
  });
});
