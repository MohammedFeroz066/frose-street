import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface BuildInfo {
  version: string;
  buildId: string;
  startedAt: string;
}

export interface GetBuildInfoOptions {
  clientDir?: string;
  refresh?: boolean;
}

interface CachedBuildState {
  clientDir: string;
  version: string;
  computedBuildId: string;
  startedAt: string;
}

let cachedState: CachedBuildState | null = null;

function readPackageVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
        return pkg.version.trim();
      }
    }
  } catch {
    // Fall back to default semantic version if package.json is unavailable
  }
  return '1.0.0';
}

function collectCoreClientAssets(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const collected: string[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        if (
          rel === 'manifest.json' ||
          rel === 'sw.js' ||
          rel.endsWith('.html') ||
          rel.endsWith('.js') ||
          rel.endsWith('.mjs') ||
          rel.endsWith('.css')
        ) {
          collected.push(fullPath);
        }
      }
    }
  };

  walk(rootDir);
  return collected.sort((a, b) => a.localeCompare(b));
}

function computeClientBuildId(clientDir: string, version: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`version:${version}\n`);

  const files = collectCoreClientAssets(clientDir);
  for (const filePath of files) {
    const rel = path.relative(clientDir, filePath).replace(/\\/g, '/');
    hash.update(`file:${rel}\n`);
    hash.update(fs.readFileSync(filePath));
    hash.update('\n');
  }

  return hash.digest('hex').slice(0, 12);
}

function sanitizeBuildId(raw: string): string {
  const cleaned = raw.trim().replace(/[^A-Za-z0-9._-]/g, '');
  return cleaned || 'dev';
}

/**
 * Computes and caches a deterministic 12-char SHA-256 buildId from client/ core assets
 * and package.json version, honoring process.env.APP_BUILD_ID when explicitly provided.
 */
export function getBuildInfo(options: GetBuildInfoOptions = {}): BuildInfo {
  const resolvedClientDir = path.resolve(options.clientDir || path.resolve(process.cwd(), 'client'));
  const needsCompute =
    options.refresh === true ||
    !cachedState ||
    cachedState.clientDir !== resolvedClientDir;

  if (needsCompute) {
    const version = readPackageVersion();
    const computedBuildId = computeClientBuildId(resolvedClientDir, version);
    cachedState = {
      clientDir: resolvedClientDir,
      version,
      computedBuildId,
      startedAt: new Date().toISOString(),
    };
  }

  const envOverride = process.env.APP_BUILD_ID;
  const buildId =
    typeof envOverride === 'string' && envOverride.trim().length > 0
      ? sanitizeBuildId(envOverride)
      : cachedState!.computedBuildId;

  return {
    version: cachedState!.version,
    buildId,
    startedAt: cachedState!.startedAt,
  };
}

export function resetBuildInfoCache(): void {
  cachedState = null;
}
