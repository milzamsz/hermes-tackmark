/**
 * Minimal DOM shim for testing selector logic without a browser/jsdom.
 * Provides just enough API: classList, querySelectorAll, tagName, id,
 * getAttribute, parentElement, children, indexOf.
 */

class MockElement {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName
    this.id = attrs.id || ''
    this._attrs = { ...attrs }
    this._classes = attrs.class ? attrs.class.split(/\s+/).filter(Boolean) : []
    this.children = []
    this.parentElement = null
    this.textContent = attrs.text || ''
  }

  get classList() {
    // Return array directly — Array.from() works, .length works
    return this._classes
  }

  getAttribute(name) {
    return this._attrs[name] ?? null
  }

  getElementsByTagName(tag) {
    if (tag === '*') return this._allDescendants()
    return this._allDescendants().filter(el => el.tagName === tag.toUpperCase())
  }

  _allDescendants() {
    let result = [...this.children]
    for (const child of this.children) {
      result = result.concat(child._allDescendants())
    }
    return result
  }

  querySelectorAll(selector) {
    return matchElements(selector, this._allDescendants().concat(this))
  }
}

/** Global CSS stub for CSS.escape */
const CSS = {
  escape(name) {
    if (typeof name !== 'string' || name.length === 0) return ''
    // CSS.escape per spec:
    // - hyphens are valid except: at start, or if followed by a digit at start
    // - escape: ! " # $ % & ' ( ) * + , . / : ; < = > ? @ [ \ ] ^ ` { | } ~
    let result = ''
    for (let i = 0; i < name.length; i++) {
      const ch = name[i]
      if (i === 0 && /\d/.test(ch)) {
        // First char is a digit → escape as hex
        result += '\\' + ch
      } else if (i === 0 && ch === '-' && /\d/.test(name[1] || '')) {
        // Leading hyphen followed by digit → escape the hyphen
        result += '\\-'
      } else if ('!"#$%&\'()*+,./:;<=>?@[\\]^`{|}~'.includes(ch)) {
        result += '\\' + ch
      } else {
        result += ch
      }
    }
    return result || '\\3$1 '
  }
}

/**
 * Simple CSS selector matcher: supports tag, #id, .class, [attr="val"],
 * :nth-child(n), and descendant combinator (a > b).
 */
function matchElements(selector, elements) {
  const parts = selector.split(' > ')
  let matched = elements

  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].trim()
    matched = matched.filter(el => matchesSimpleSelector(part, el))

    // Move to parents for next (ancestor) segment
    if (i > 0) {
      matched = matched.map(el => el.parentElement).filter(Boolean)
    }
  }
  return matched
}

function matchesSimpleSelector(sel, el) {
  // Parse: tag.class#id[attr="val"]:nth-child(n)
  const tagMatch = sel.match(/^([a-z][\w-]*)?/)
  let idx = 0
  if (tagMatch && tagMatch[1]) {
    if (el.tagName.toLowerCase() !== tagMatch[1]) return false
    idx = tagMatch[1].length
  }

  const rest = sel.slice(idx)
  // Match classes, ids, attrs, nth-child (handle escaped chars like \: \/ \[ etc.)
  const tokenRe = /(\.[^.\[:]+|#[^.\[:]+|\[[^\]]+\]|:nth-child\(\d+\))/g
  let m
  while ((m = tokenRe.exec(rest)) !== null) {
    const token = m[0]
    if (token.startsWith('.')) {
      // Strip backslash escapes to compare against raw class name
      const cls = token.slice(1).replace(/\\/g, '')
      if (!el._classes.includes(cls)) return false
    } else if (token.startsWith('#')) {
      const id = token.slice(1).replace(/\\/g, '')
      if (el.id !== id) return false
    } else if (token.startsWith('[')) {
      const am = token.match(/^\[([\w-]+)="([^"]*)"\]$/)
      if (!am) return false
      if (el.getAttribute(am[1]) !== am[2]) return false
    } else if (token.startsWith(':nth-child')) {
      const nm = token.match(/:nth-child\((\d+)\)/)
      if (!nm) return false
      if (!el.parentElement) return false
      const index = el.parentElement.children.indexOf(el) + 1
      if (index !== parseInt(nm[1], 10)) return false
    }
  }
  return true
}

/** Build a mock document from an HTML-like structure. */
export function buildDOM(tree) {
  const root = new MockElement('html', { id: '' })
  root.body = new MockElement('body', {})
  root.body.parentElement = root
  root.children = [root.body]

  function appendChildren(parent, children) {
    for (const child of children) {
      const el = new MockElement(child.tag || 'div', child.attrs || {})
      el.textContent = child.text || ''
      el.parentElement = parent
      parent.children.push(el)
      if (child.children) appendChildren(el, child.children)
    }
  }
  if (tree.children) appendChildren(root.body, tree.children)
  root.querySelectorAll = (sel) => matchElements(sel, root._allDescendants())
  root.body.querySelectorAll = (sel) => matchElements(sel, root.body._allDescendants())
  return root
}

export { MockElement, CSS }
