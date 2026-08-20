/**
 * hermes-tackmark — Semantic metadata adapter
 *
 * Generic framework-agnostic adapter that captures useful data-*
 * attributes from an inspected element as structured hints.
 *
 * Framework-specific adapters (Odoo, React Testing Library, etc.)
 * extend this base with their own attribute prefixes and hint mappings.
 *
 * Security: Only reads attribute names/values. Never reads input values,
 * passwords, tokens, or content from secure inputs.
 */

/** Maximum attributes to capture per element. */
const MAX_ATTRIBUTES = 20

/** Maximum length per attribute value. */
const MAX_VALUE_LENGTH = 200

/**
 * Base adapter — captures generic data-* attributes as hints.
 */
export class MetadataAdapter {
  constructor(options = {}) {
    this.name = options.name || 'generic'
    /** Attribute prefixes to capture (without the data- prefix). */
    this.prefixes = options.prefixes || ['data-testid', 'data-test', 'data-cy', 'data-qa']
    /** Attributes to never capture (security). */
    this.denyAttributes = new Set([
      'data-password', 'data-token', 'data-secret',
      'data-auth', 'data-session', 'data-csrf',
    ])
  }

  /**
   * Extract metadata hints from a DOM element.
   * @param {Element} element - The inspected DOM element
   * @returns {object[]} Array of {name, value} hint pairs
   */
  extract(element) {
    if (!element || !element.getAttributeNames) return []

    const hints = []
    const attrs = element.getAttributeNames().slice(0, MAX_ATTRIBUTES)

    for (const attr of attrs) {
      // Security: skip denied attributes
      if (this.denyAttributes.has(attr)) continue

      // Check if this attribute matches any prefix
      if (!this._matches(attr)) continue

      const value = element.getAttribute(attr)
      if (value == null) continue

      // Bound the value length
      const boundedValue = String(value).slice(0, MAX_VALUE_LENGTH)

      hints.push({
        name: attr,
        value: boundedValue,
        source: this.name,
      })
    }

    return hints
  }

  /**
   * Check if an attribute name matches any configured prefix.
   */
  _matches(attrName) {
    for (const prefix of this.prefixes) {
      if (attrName === prefix || attrName.startsWith(prefix + '-')) {
        return true
      }
    }
    return false
  }
}

/**
 * Odoo adapter — captures data-oe-* attributes as model/field hints.
 * Lives in its own module per the kanban constraint (no Odoo-specific
 * behavior in selector core), but is defined here for discoverability.
 */
export class OdooMetadataAdapter extends MetadataAdapter {
  constructor() {
    super({
      name: 'odoo',
      prefixes: ['data-oe'],
    })
  }
}

/**
 * Registry of active adapters. The plugin configures which adapters
 * are active. Default: generic only.
 */
export class MetadataAdapterRegistry {
  constructor(adapters = []) {
    this.adapters = adapters
  }

  /**
   * Run all registered adapters on an element and merge results.
   */
  extractAll(element) {
    const allHints = []
    const seen = new Set()

    for (const adapter of this.adapters) {
      const hints = adapter.extract(element)
      for (const hint of hints) {
        // Deduplicate by name (first adapter wins)
        const key = hint.name + '=' + hint.value
        if (seen.has(key)) continue
        seen.add(key)
        allHints.push(hint)
      }
    }

    return allHints
  }

  /**
   * Add an adapter to the registry.
   */
  add(adapter) {
    this.adapters.push(adapter)
  }

  /**
   * Create a default registry with the generic adapter.
   */
  static createDefault() {
    return new MetadataAdapterRegistry([new MetadataAdapter()])
  }

  /**
   * Create a registry with generic + Odoo adapters.
   */
  static createWithOdoo() {
    return new MetadataAdapterRegistry([
      new MetadataAdapter(),
      new OdooMetadataAdapter(),
    ])
  }
}
