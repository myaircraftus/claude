// Image quality heuristics for the scanner.
//
// Runs client-side on a Canvas / ImageData (but is isomorphic — works wherever
// we have a Uint8ClampedArray). We compute:
//   - Laplacian variance → focus/blur score
//   - Percentage of "hot" pixels (>245) → glare
//   - Mean luminance → low-light
//
// These are heuristics designed to be fast enough to run during preview.

import type { QualityResult } from './types'

export interface QualityInput {
  data: Uint8ClampedArray   // RGBA pixels
  width: number
  height: number
}

export function computeQuality(input: QualityInput): QualityResult {
  const { data, width, height } = input
  const lap = laplacianVariance(data, width, height)
  const glare = hotPixelRatio(data, width, height)
  const meanLum = averageLuminance(data)

  // Thresholds (tuned for document capture)
  const BLUR_THRESHOLD = 80           // below = blurry
  const GLARE_THRESHOLD = 0.08        // >8% hot pixels = glare
  const LOW_LIGHT_THRESHOLD = 60      // mean luminance below this = low light

  const warnings: string[] = []
  if (lap < BLUR_THRESHOLD) warnings.push('blur')
  if (glare > GLARE_THRESHOLD) warnings.push('glare')
  if (meanLum < LOW_LIGHT_THRESHOLD) warnings.push('low_light')

  // Composite score — normalized, favoring focus
  const focusScore = Math.max(0, Math.min(1, lap / 400))
  const glareScore = Math.max(0, 1 - glare * 5)
  const lightScore = Math.max(0, Math.min(1, meanLum / 180))
  const score = Number((focusScore * 0.55 + glareScore * 0.25 + lightScore * 0.2).toFixed(3))

  return { score, warnings }
}

/** Variance of Laplacian convolution — higher = sharper. */
function laplacianVariance(data: Uint8ClampedArray, w: number, h: number): number {
  // Sample every 2 pixels to speed up
  const step = 2
  let sum = 0, sumSq = 0, n = 0
  for (let y = 1; y < h - 1; y += step) {
    for (let x = 1; x < w - 1; x += step) {
      const i = (y * w + x) * 4
      const c = luminance(data, i)
      const l = luminance(data, i - 4)
      const r = luminance(data, i + 4)
      const u = luminance(data, i - w * 4)
      const d = luminance(data, i + w * 4)
      const lap = Math.abs(4 * c - l - r - u - d)
      sum += lap; sumSq += lap * lap; n++
    }
  }
  if (n === 0) return 0
  const mean = sum / n
  return sumSq / n - mean * mean
}

function hotPixelRatio(data: Uint8ClampedArray, w: number, h: number): number {
  const step = 4
  let hot = 0, total = 0
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      const lum = luminance(data, i)
      if (lum > 245) hot++
      total++
    }
  }
  return total > 0 ? hot / total : 0
}

function averageLuminance(data: Uint8ClampedArray): number {
  let sum = 0, n = 0
  for (let i = 0; i < data.length; i += 16) { // sample every 4 pixels (RGBA * 4)
    sum += luminance(data, i); n++
  }
  return n > 0 ? sum / n : 0
}

function luminance(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
}
