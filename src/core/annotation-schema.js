/**
 * hermes-tackmark — Annotation message schema and validation
 *
 * Versioned, bounded message schema for iframe → parent communication.
 * Treats every frame message as untrusted even though event.source is checked.
 */

export const SCHEMA_VERSION = 1

/** Field limits for untrusted message validation. */
export const LIMITS = {
  selector: 1000,
  text: 300,
  outerHTML: 2000,
  contextHTML: 3500,
  classes: 50,
  classLength: 200,
  attributes: 30,
  styleKeys: ['display', 'position', 'width', 'height', 'backgroundColor',
    'color', 'fontSize', 'fontFamily', 'padding', 'margin', 'borderRadius'],
  note: 2000,
  metadata: 20,
  metadataValue: 200,
  annotationsPerBatch: 20,
  totalPrompt: 20000, // 20 KB
}

/** Allowed message types from iframe. */
const ALLOWED_TYPES = ['tackmark-ready', 'tackmark-element-selected', 'tackmark-toggle-annotation']

/**
 * Validate a frame message object.
 *
 * @param {*} data - The event.data from the iframe
 * @returns {{ valid: boolean, type?: string, element?: object, reason?: string }}
 */
export function validateMessage(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: 'Message is not an object' }
  }

  if (!data.type || typeof data.type !== 'string') {
    return { valid: false, reason: 'Message missing type' }
  }

  if (!ALLOWED_TYPES.includes(data.type)) {
    return { valid: false, reason: `Unknown message type: ${data.type}` }
  }

  if (data.type !== 'tackmark-element-selected') {
    // ready/toggle messages need no element validation
    return { valid: true, type: data.type }
  }

  // Validate element payload
  const element = data.element
  if (!element || typeof element !== 'object') {
    return { valid: false, reason: 'Missing element object' }
  }

  // tag must be a non-empty string
  if (typeof element.tag !== 'string' || element.tag.length === 0) {
    return { valid: false, reason: 'element.tag must be a string' }
  }

  // classes must be an array of strings
  if (!Array.isArray(element.classes)) {
    return { valid: false, reason: 'element.classes must be an array' }
  }
  if (element.classes.length > LIMITS.classes) {
    return { valid: false, reason: `Too many classes (${element.classes.length} > ${LIMITS.classes})` }
  }
  for (const cls of element.classes) {
    if (typeof cls !== 'string' || cls.length > LIMITS.classLength) {
      return { valid: false, reason: `Class name too long or not a string` }
    }
  }

  // selector: optional but if present must be bounded string
  if (element.selector !== undefined && element.selector !== null) {
    if (typeof element.selector !== 'string' || element.selector.length > LIMITS.selector) {
      return { valid: false, reason: 'Selector too long or not a string' }
    }
  }

  // text: optional but bounded
  if (element.text !== undefined && element.text !== null) {
    if (typeof element.text !== 'string' || element.text.length > LIMITS.text) {
      return { valid: false, reason: 'Text snippet too long' }
    }
  }

  // id: optional, bounded string
  if (element.id !== undefined && element.id !== null) {
    if (typeof element.id !== 'string' || element.id.length > LIMITS.classLength) {
      return { valid: false, reason: 'ID too long or not a string' }
    }
  }

  // Rich DOM evidence: optional, bounded strings.
  for (const [key, limit] of [['outerHTML', LIMITS.outerHTML], ['contextHTML', LIMITS.contextHTML]]) {
    if (element[key] !== undefined && element[key] !== null) {
      if (typeof element[key] !== 'string' || element[key].length > limit) {
        return { valid: false, reason: `${key} too long or not a string` }
      }
    }
  }

  // styles: if present, must be object with allowed keys only
  if (element.styles !== undefined && element.styles !== null) {
    if (typeof element.styles !== 'object') {
      return { valid: false, reason: 'styles must be an object' }
    }
    const styleKeys = Object.keys(element.styles)
    if (styleKeys.length > LIMITS.attributes) {
      return { valid: false, reason: `Too many style keys (${styleKeys.length})` }
    }
    for (const key of styleKeys) {
      if (!LIMITS.styleKeys.includes(key)) {
        return { valid: false, reason: `Disallowed style key: ${key}` }
      }
      if (typeof element.styles[key] !== 'string') {
        return { valid: false, reason: `Style value for ${key} must be string` }
      }
    }
  }

  // metadata: optional, must be array of {name, value} with bounded sizes
  if (element.metadata !== undefined && element.metadata !== null) {
    if (!Array.isArray(element.metadata)) {
      return { valid: false, reason: 'metadata must be an array' }
    }
    if (element.metadata.length > LIMITS.metadata) {
      return { valid: false, reason: `Too many metadata hints (${element.metadata.length} > ${LIMITS.metadata})` }
    }
    for (const hint of element.metadata) {
      if (!hint || typeof hint !== 'object') {
        return { valid: false, reason: 'metadata hint must be an object' }
      }
      if (typeof hint.name !== 'string' || hint.name.length > LIMITS.classLength) {
        return { valid: false, reason: 'metadata name too long or not a string' }
      }
      if (typeof hint.value !== 'string' || hint.value.length > LIMITS.metadataValue) {
        return { valid: false, reason: 'metadata value too long or not a string' }
      }
    }
  }

  // rect/position: if present, must have finite numeric values
  const rect = element.rect || element.position
  if (rect !== undefined && rect !== null) {
    if (typeof rect !== 'object') {
      return { valid: false, reason: 'rect/position must be an object' }
    }
    for (const key of ['x', 'y', 'width', 'height']) {
      if (rect[key] !== undefined && rect[key] !== null) {
        if (typeof rect[key] !== 'number' || !Number.isFinite(rect[key])) {
          return { valid: false, reason: `rect.${key} must be a finite number` }
        }
      }
    }
  }

  // mouse: optional, must have finite numbers
  if (element.mouse !== undefined && element.mouse !== null) {
    if (typeof element.mouse !== 'object') {
      return { valid: false, reason: 'mouse must be an object' }
    }
    for (const key of ['x', 'y']) {
      if (element.mouse[key] !== undefined && element.mouse[key] !== null) {
        if (typeof element.mouse[key] !== 'number' || !Number.isFinite(element.mouse[key])) {
          return { valid: false, reason: `mouse.${key} must be a finite number` }
        }
      }
    }
  }

  return { valid: true, type: data.type, element }
}

/**
 * Create a new annotation object with schema version and UUID.
 *
 * @param {object} fields - Annotation fields (page, target, note, etc.)
 * @returns {object} - Schema-conformant annotation
 */
export function createAnnotation(fields) {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: `ann_${cryptoRandomUUID()}`,
    createdAt: new Date().toISOString(),
    ...fields,
    status: fields.status || 'pending',
  }
}

/** Generate a UUID v4, using crypto.randomUUID if available. */
function cryptoRandomUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback UUID v4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}
