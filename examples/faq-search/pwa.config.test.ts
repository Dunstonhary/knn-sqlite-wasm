import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pwaOptions } from './pwa.config.ts'

const PUBLIC_DIR = resolve(import.meta.dirname, 'public')

/**
 * Read the pixel dimensions straight out of a PNG's IHDR chunk: 8-byte
 * signature, 4-byte length, 4-byte type, then width and height as big-endian
 * uint32s. Cheaper than pulling in an image library to assert three files.
 */
function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(resolve(PUBLIC_DIR, file))
  const signature = buf.subarray(0, 8).toString('hex')
  expect(signature, `${file} is not a PNG`).toBe('89504e470d0a1a0a')
  expect(buf.subarray(12, 16).toString('ascii'), `${file} has no IHDR`).toBe('IHDR')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

describe('web app manifest', () => {
  const { manifest } = pwaOptions

  it('is emitted under the standard filename', () => {
    expect(pwaOptions.manifestFilename).toBe('manifest.webmanifest')
  })

  it('identifies the app', () => {
    expect(manifest.name).toBe('FAQ-KNN-Application')
    // Home-screen labels are truncated past ~12 characters on both platforms.
    expect(manifest.short_name).toBeTruthy()
    expect(manifest.short_name.length).toBeLessThanOrEqual(12)
  })

  it('launches standalone from a relative start URL', () => {
    expect(manifest.display).toBe('standalone')
    // Relative, so the installed app still resolves when the demo is served
    // from a sub-path rather than a domain root.
    expect(manifest.start_url).toBe('.')
    expect(manifest.scope).toBe('.')
  })

  it('uses the light --background token for both chrome colours', () => {
    // src/index.css: --background is oklch(1 0 0) in :root. Dark mode is
    // defined but never enabled (nothing sets .dark), so a single colour is
    // honest here — a dark toolbar over a light app would be worse.
    expect(manifest.theme_color).toBe('#ffffff')
    expect(manifest.background_color).toBe('#ffffff')
  })

  it('declares 192, 512 and a maskable variant', () => {
    const bySize = Object.fromEntries(
      manifest.icons.map((icon) => [`${icon.sizes}:${icon.purpose}`, icon]),
    )
    expect(Object.keys(bySize).sort()).toEqual([
      '192x192:any',
      '512x512:any',
      '512x512:maskable',
    ])
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png')
      // Relative for the same reason as start_url.
      expect(icon.src.startsWith('/'), `${icon.src} must be relative`).toBe(false)
    }
  })

  it('ships every declared icon at its declared pixel size', () => {
    for (const icon of manifest.icons) {
      const [w, h] = icon.sizes.split('x').map(Number)
      expect(pngSize(icon.src), `${icon.src}`).toEqual({ width: w, height: h })
    }
  })
})

describe('service worker', () => {
  const { workbox } = pwaOptions

  it('precaches the whole app shell', () => {
    // The FAQ corpus is bundled into the JS, so precaching the build output is
    // the entire offline story — there is no runtime fetch to fall back on.
    const patterns = workbox.globPatterns.join(' ')
    for (const ext of ['js', 'css', 'html', 'svg', 'png']) {
      expect(patterns, `missing .${ext}`).toContain(ext)
    }
  })

  it('supersedes an older deploy instead of serving it', () => {
    // A stale worker pinning old assets is worse than no worker at all.
    expect(pwaOptions.registerType).toBe('autoUpdate')
    expect(workbox.cleanupOutdatedCaches).toBe(true)
    expect(workbox.clientsClaim).toBe(true)
    expect(workbox.skipWaiting).toBe(true)
  })

  it('serves the SPA entry for unknown routes', () => {
    expect(workbox.navigateFallback).toBe('index.html')
  })
})
