/**
 * hermes-tackmark — Selector generation
 *
 * De-duplicated from two diverged upstream copies (parent scope + iframe
 * annotation script) into a single shared module.
 *
 * Strategy order:
 *   1. unique stable ID
 *   2. stable testing attribute (data-testid, data-test)
 *   3. escaped class combination (if unique)
 *   4. bounded structural path with nth-child fallback
 */

/** Maximum selector length before forcing structural fallback. */
const MAX_SELECTOR_LENGTH = 500

/** Maximum depth for structural path traversal. */
const MAX_STRUCTURAL_DEPTH = 15

/** Test attributes preferred for stable targeting, in priority order. */
const TEST_ATTRIBUTES = ['data-testid', 'data-test']

/**
 * Escape a CSS identifier (ID or class name) for use in a selector.
 * Uses CSS.escape when available, falls back to manual escaping.
 */
export function escapeCssIdentifier(name) {
  if (typeof name !== 'string' || name.length === 0) return ''
  // CSS.escape is available in all modern browsers
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(name)
  }
  // Manual fallback per CSS Syntax spec:
  // hyphens are valid except at start followed by a digit
  let result = ''
  for (let i = 0; i < name.length; i++) {
    const ch = name[i]
    if (i === 0 && /\d/.test(ch)) {
      result += '\\' + ch
    } else if (i === 0 && ch === '-' && /\d/.test(name[1] || '')) {
      result += '\\-'
    } else if ('!"#$%&\'()*+,./:;<=>?@[\\]^`{|}~'.includes(ch)) {
      result += '\\' + ch
    } else {
      result += ch
    }
  }
  return result || '\\3$1 '
}

/**
 * Build an escaped ID selector.
 */
export function idSelector(id) {
  if (!id) return ''
  return '#' + escapeCssIdentifier(id)
}

/**
 * Build an escaped class selector from an array of class names.
 */
export function classSelector(classes) {
  if (!Array.isArray(classes) || classes.length === 0) return ''
  return classes.map(c => '.' + escapeCssIdentifier(c)).join('')
}

/**
 * Check whether a selector string matches exactly one element in the document.
 */
function isUniqueSelector(selector, root = document) {
  try {
    return root.querySelectorAll(selector).length === 1
  } catch {
    // Invalid selector (e.g. Tailwind arbitrary syntax)
    return false
  }
}

/**
 * Generate a selector for an element.
 *
 * @param {Element} element - The DOM element to target
 * @param {Document|DocumentFragment} [root=document] - Root for uniqueness checks
 * @returns {{ selector: string, strategy: string }} - The selector and its strategy
 */
export function generateSelector(element, root = null) {
  if (!element) return { selector: '', strategy: 'none' }

  const doc = root || (typeof document !== 'undefined' ? document : null)

  // 1. Unique stable ID
  if (element.id) {
    const sel = idSelector(element.id)
    if (sel && isUniqueSelector(sel, doc)) {
      return { selector: sel, strategy: 'id' }
    }
  }

  // 2. Stable testing attribute
  for (const attr of TEST_ATTRIBUTES) {
    const val = element.getAttribute(attr)
    if (val) {
      const sel = `[${attr}="${escapeCssIdentifier(val)}"]`
      if (isUniqueSelector(sel, doc)) {
        return { selector: sel, strategy: 'test-attr' }
      }
    }
  }

  // 3. Escaped class combination (if unique)
  if (element.classList && element.classList.length > 0) {
    const classes = Array.from(element.classList)
    const sel = classSelector(classes)
    if (sel && sel.length <= MAX_SELECTOR_LENGTH && isUniqueSelector(sel, doc)) {
      return { selector: sel, strategy: 'classes' }
    }
    // Try progressively shorter class combinations
    for (let len = classes.length - 1; len >= 1; len--) {
      const subset = classes.slice(0, len)
      const subSel = classSelector(subset)
      if (subSel.length <= MAX_SELECTOR_LENGTH && isUniqueSelector(subSel, doc)) {
        return { selector: subSel, strategy: 'classes' }
      }
    }
  }

  // 4. Bounded structural path with nth-child fallback
  const path = []
  let current = element
  let depth = 0

  while (current && current !== (doc?.body || doc) && depth < MAX_STRUCTURAL_DEPTH) {
    let segment = current.tagName.toLowerCase()

    // Try ID within the path
    if (current.id) {
      segment = idSelector(current.id)
      path.unshift(segment)
      break
    }

    // Try classes in the path segment
    if (current.classList && current.classList.length > 0) {
      segment += classSelector(Array.from(current.classList))
    }

    // nth-child for position
    const parent = current.parentElement
    if (parent && parent !== doc) {
      const siblings = Array.from(parent.children)
      const index = siblings.indexOf(current) + 1
      segment += `:nth-child(${index})`
    }

    path.unshift(segment)
    current = parent
    depth++
  }

  const selector = path.join(' > ')
  return { selector, strategy: 'structural' }
}

/** Strategy order for documentation/testing. */
export const STRATEGY_ORDER = ['id', 'test-attr', 'classes', 'structural']
