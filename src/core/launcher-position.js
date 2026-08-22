export function clampLauncherPosition(position, viewport, size = { width: 44, height: 44 }, margin = 4) {
  const minX = margin
  const minY = Math.max(margin, viewport?.top || 0)
  const maxX = Math.max(minX, (viewport?.width || size.width) - size.width - margin)
  const maxY = Math.max(minY, (viewport?.height || size.height) - size.height - margin)
  const x = Number.isFinite(position?.x) ? position.x : maxX
  const y = Number.isFinite(position?.y) ? position.y : minY
  return {
    x: Math.min(maxX, Math.max(minX, Math.round(x))),
    y: Math.min(maxY, Math.max(minY, Math.round(y))),
  }
}
