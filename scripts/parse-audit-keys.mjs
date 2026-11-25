import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('audit-collector-output.json', 'utf8'));

const storageKeys = new Map();
data.storage.forEach(s => {
  const m = s.text.match(/localStorage\.(?:getItem|setItem|removeItem)\(['"]([^'"]+)['"]/);
  if (m) {
    const k = m[1];
    if (!storageKeys.has(k)) storageKeys.set(k, []);
    storageKeys.get(k).push(`${s.file}:${s.line}`);
  }
});

console.log('=== LOCALSTORAGE KEYS IN USE ===');
for (const [k, locs] of storageKeys.entries()) {
  let isPII = /phone|vendor|user|owner|stall_name|token|auth|qr|pin/i.test(k);
  console.log(`- ${k} [PII/Sensitive: ${isPII ? 'YES' : 'No'}] (${locs.length} refs: e.g. ${locs[0]})`);
}
