import fs from 'node:fs';
import path from 'node:path';

const projectRoot = 'C:\\Projects\\frose-street';

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const allFiles = walk(projectRoot);

const results = {
  storage: [],
  domInjection: [],
  networkCalls: [],
  sensitiveDataUsage: [],
  envAndSecrets: [],
  rlsPolicies: [],
  adminRoutes: [],
  fileUploads: []
};

// 1. Storage & DOM Injection & Network
for (const file of allFiles) {
  const relPath = path.relative(projectRoot, file).replace(/\\/g, '/');
  if (!relPath.endsWith('.js') && !relPath.endsWith('.ts') && !relPath.endsWith('.html') && !relPath.endsWith('.sql')) continue;

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Storage
    if (/localStorage\.(setItem|getItem|removeItem|clear)|sessionStorage|indexedDB|indexedDb/i.test(line)) {
      results.storage.push({ file: relPath, line: lineNum, text: line.trim() });
    }

    // DOM Injection
    if (/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function\(/i.test(line)) {
      results.domInjection.push({ file: relPath, line: lineNum, text: line.trim() });
    }

    // Network Calls
    if (/fetch\(|new WebSocket\(|socket\.send|io\(|WebSocket/i.test(line)) {
      results.networkCalls.push({ file: relPath, line: lineNum, text: line.trim() });
    }

    // Sensitive data in logs or storage
    if (/(console\.(log|warn|error|info)|logger\.(info|warn|error|debug))\([^)]*(token|password|pin|phone|upi|secret|key|auth)/i.test(line)) {
      results.sensitiveDataUsage.push({ file: relPath, line: lineNum, text: line.trim() });
    }
  });
}

fs.writeFileSync(path.join(projectRoot, 'audit-collector-output.json'), JSON.stringify(results, null, 2), 'utf8');
console.log(`Audited ${allFiles.length} files:`);
console.log(`- Storage calls: ${results.storage.length}`);
console.log(`- DOM injection sinks: ${results.domInjection.length}`);
console.log(`- Network / WS calls: ${results.networkCalls.length}`);
console.log(`- Sensitive logging: ${results.sensitiveDataUsage.length}`);
