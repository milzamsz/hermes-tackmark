/**
 * Golden-path reference — the upstream's original generateSelector logic,
 * preserved exactly for parity testing against the extracted module.
 *
 * This is the ORIGINAL behavior (no CSS escaping, no strategy metadata,
 * no test-attribute path) from freehul/tackmark before hermes-tackmark's
 * extraction work. It exists only to verify that the extracted module
 * does not regress on the same inputs.
 */

export function generateSelectorLegacy(element, root) {
  if (!element) return ''

  // 1. ID
  if (element.id) return `#${element.id}`

  // 2. Class combination (if unique)
  if (element.classList && element.classList.length > 0) {
    const classes = Array.from(element.classList)
    const selector = classes.map(c => `.${c}`).join('')
    try {
      const doc = root || (typeof document !== 'undefined' ? document : null)
      if (doc && doc.querySelectorAll(selector).length === 1) {
        return selector
      }
    } catch (e) {}
  }

  // 3. Structural nth-child path
  const path = []
  let current = element
  const doc = root || (typeof document !== 'undefined' ? document : null)
  while (current && current !== doc?.body) {
    let selector = current.tagName.toLowerCase()
    if (current.id) {
      selector = `#${current.id}`
      path.unshift(selector)
      break
    }
    if (current.classList && current.classList.length > 0) {
      selector += Array.from(current.classList).map(c => `.${c}`).join('')
    }
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children)
      const index = siblings.indexOf(current) + 1
      selector += `:nth-child(${index})`
    }
    path.unshift(selector)
    current = current.parentElement
  }

  return path.join(' > ')
}
