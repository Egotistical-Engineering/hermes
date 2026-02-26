#!/usr/bin/env node

/**
 * Build the Express server into a standalone binary for Tauri sidecar.
 *
 * Steps:
 * 1. Bundle server TypeScript into a single CJS file with esbuild
 * 2. Compile the bundle into a standalone binary with pkg
 * 3. Rename with the Rust target triple and place in src-tauri/binaries/
 */

import { execSync } from 'node:child_process';
import { mkdirSync, renameSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SERVER_DIR = resolve(ROOT, 'server');
const BINARIES_DIR = resolve(ROOT, 'apps/native/src-tauri/binaries');
const SIDECAR_NAME = 'hermes-server';

// Get the Rust target triple for the current platform
function getTargetTriple() {
  try {
    return execSync('rustc --print host-tuple', { encoding: 'utf-8' }).trim();
  } catch {
    // Fallback: construct from platform info
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    const platform = process.platform;
    if (platform === 'darwin') return `${arch}-apple-darwin`;
    if (platform === 'win32') return `${arch}-pc-windows-msvc`;
    return `${arch}-unknown-linux-gnu`;
  }
}

const targetTriple = getTargetTriple();
const ext = process.platform === 'win32' ? '.exe' : '';
const finalName = `${SIDECAR_NAME}-${targetTriple}${ext}`;

console.log(`Building sidecar for ${targetTriple}...`);

// Step 1: Bundle with esbuild
console.log('  Bundling server with esbuild...');
const bundlePath = resolve(SERVER_DIR, 'dist/sidecar-bundle.cjs');
execSync(
  `npx esbuild src/index.ts --bundle --platform=node --target=node20 --format=cjs --outfile=dist/sidecar-bundle.cjs --external:pino-pretty`,
  { cwd: SERVER_DIR, stdio: 'inherit' },
);

// Step 2: Compile with pkg
console.log('  Compiling standalone binary with pkg...');

// Determine pkg target
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const pkgPlatform = { darwin: 'macos', win32: 'win', linux: 'linux' }[process.platform] || 'linux';
const pkgTarget = `node20-${pkgPlatform}-${arch}`;
const pkgOutput = resolve(SERVER_DIR, `dist/${SIDECAR_NAME}${ext}`);

execSync(
  `npx @yao-pkg/pkg ${bundlePath} --target ${pkgTarget} --output ${pkgOutput}`,
  { cwd: SERVER_DIR, stdio: 'inherit' },
);

// Step 3: Move to binaries dir with target triple name
mkdirSync(BINARIES_DIR, { recursive: true });
const finalPath = resolve(BINARIES_DIR, finalName);
if (existsSync(finalPath)) rmSync(finalPath);
renameSync(pkgOutput, finalPath);

// Make executable on Unix
if (process.platform !== 'win32') {
  execSync(`chmod +x "${finalPath}"`);
}

console.log(`  ✓ Sidecar built: ${finalName}`);
console.log(`  Location: ${finalPath}`);
