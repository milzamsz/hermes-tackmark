export const MIN_ZOOM_PERCENT = 50
export const MAX_ZOOM_PERCENT = 200
export const ZOOM_STEP_PERCENT = 10

export function normalizeZoomPercent(value, fallback = 100) {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  const valid = Number.isFinite(parsed) ? parsed : fallback
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, valid))
}

export function stepZoomPercent(current, direction) {
  const base = normalizeZoomPercent(current)
  return normalizeZoomPercent(base + Math.sign(direction) * ZOOM_STEP_PERCENT)
}
