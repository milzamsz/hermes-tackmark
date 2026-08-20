#!/usr/bin/env node
/**
 * Install hermes-tackmark plugin into Hermes Desktop's runtime plugin directory.
 *
 * Copies dist/plugin.js to ~/.hermes/desktop-plugins/hermes-tackmark/plugin.js
 * The Hermes runtime loader auto-discovers this folder and hot-loads the plugin.
 *
 * Usage: node scripts/install.mjs
 * Prerequisite: npm run bundle (must produce dist/plugin.js first)
 */

import { mkdir, copyFile, access, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const bundledFile = join(repoRoot, 'dist', 'plugin.js')
const hermesHome = join(homedir(), '.hermes')
const pluginDir = join(hermesHome, 'desktop-plugins', 'hermes-tackmark')
const installTarget = join(pluginDir, 'plugin.js')

async function main() {
  // Verify bundle exists
  try {
    await access(bundledFile)
  } catch {
    console.error('[install] dist/plugin.js not found — run `npm run bundle` first')
    process.exit(1)
  }

  // Create plugin directory
  await mkdir(pluginDir, { recursive: true })

  // Remove old copy if exists
  try { await rm(installTarget) } catch {}

  // Copy bundled plugin
  await copyFile(bundledFile, installTarget)

  console.log('[install] OK →', installTarget)
  console.log('[install] Restart Hermes Desktop (or ⌘K → "Reload desktop plugins") to activate.')
}

main().catch(err => {
  console.error('[install] FAILED:', err)
  process.exit(1)
})
