import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('audit-collector-output.json', 'utf8'));

console.log('=== DETAILED DOM INJECTION (XSS) SINKS ===');
data.domInjection.forEach(d => {
  console.log(`${d.file}:${d.line} -> ${d.text.substring(0, 100)}`);
});
