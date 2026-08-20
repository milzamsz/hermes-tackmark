/**
 * hermes-tackmark — HTML attribute escaping
 *
 * Preserved from upstream (src/plugin.js lines 39-43).
 * Used for <base href> injection safety.
 */
export function escapeHtmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
