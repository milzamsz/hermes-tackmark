// Annotation schema validation tests — frame message boundary, size limits, type checking
import { validateMessage, createAnnotation, SCHEMA_VERSION, LIMITS } from '../src/core/annotation-schema.js'

let pass = 0, fail = 0
function check(name, actual, expected) {
  if (actual === expected) { pass++; console.log('PASS: ' + name) }
  else { fail++; console.error('FAIL: ' + name + ' — got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected)) }
}
function checkTrue(name, actual) { check(name, Boolean(actual), true) }
function checkFalse(name, actual) { check(name, Boolean(actual), false) }

console.log('--- Valid messages ---')
checkTrue('ready message', validateMessage({ type: 'tackmark-ready' }).valid)
checkTrue('toggle message', validateMessage({ type: 'tackmark-toggle-annotation', enabled: true }).valid)

const validElement = {
  type: 'tackmark-element-selected',
  element: { tag: 'button', classes: ['btn', 'primary'], id: 'submit',
    selector: '#submit', text: 'Submit',
    styles: { display: 'flex', padding: '8px' },
    rect: { x: 10, y: 20, width: 100, height: 40 },
    mouse: { x: 50, y: 30 } }
}
checkTrue('valid element message', validateMessage(validElement).valid)

console.log('\n--- Invalid messages ---')
checkFalse('null rejected', validateMessage(null).valid)
checkFalse('non-object rejected', validateMessage('hello').valid)
checkFalse('missing type rejected', validateMessage({ element: {} }).valid)
checkFalse('unknown type rejected', validateMessage({ type: 'evil-type' }).valid)

console.log('\n--- Element validation ---')
checkFalse('missing element rejected', validateMessage({ type: 'tackmark-element-selected' }).valid)
checkFalse('element not object', validateMessage({ type: 'tackmark-element-selected', element: 'bad' }).valid)
checkFalse('tag missing', validateMessage({ type: 'tackmark-element-selected', element: { classes: [] } }).valid)
checkFalse('tag not string', validateMessage({ type: 'tackmark-element-selected', element: { tag: 42, classes: [] } }).valid)
checkFalse('classes not array', validateMessage({ type: 'tackmark-element-selected', element: { tag: 'div', classes: 'not-array' } }).valid)

console.log('\n--- Size limits ---')
// Too many classes
const tooManyClasses = { type: 'tackmark-element-selected', element: { tag: 'div', classes: Array(LIMITS.classes + 1).fill('c') } }
checkFalse('too many classes', validateMessage(tooManyClasses).valid)

// Too long selector
const longSelector = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [], selector: 'x'.repeat(LIMITS.selector + 1) } }
checkFalse('too long selector', validateMessage(longSelector).valid)

// Too long text
const longText = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [], text: 'x'.repeat(LIMITS.text + 1) } }
checkFalse('too long text', validateMessage(longText).valid)

const validHtml = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [],
  outerHTML: '<div>hello</div>', contextHTML: '<section><div>hello</div></section>' } }
checkTrue('bounded HTML evidence accepted', validateMessage(validHtml).valid)
const longOuterHtml = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [],
  outerHTML: 'x'.repeat(LIMITS.outerHTML + 1) } }
checkFalse('oversized outer HTML rejected', validateMessage(longOuterHtml).valid)
const longContextHtml = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [],
  contextHTML: 'x'.repeat(LIMITS.contextHTML + 1) } }
checkFalse('oversized nearby HTML rejected', validateMessage(longContextHtml).valid)

// Disallowed style key
const badStyle = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [], styles: { evilKey: 'value' } } }
checkFalse('disallowed style key', validateMessage(badStyle).valid)

// Non-finite rect value
const nanRect = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [], rect: { x: NaN, y: 10, width: 10, height: 10 } } }
checkFalse('NaN rect rejected', validateMessage(nanRect).valid)

const infRect = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [], rect: { x: Infinity, y: 10, width: 10, height: 10 } } }
checkFalse('Infinity rect rejected', validateMessage(infRect).valid)

console.log('\n--- createAnnotation ---')
const ann = createAnnotation({ page: { url: 'http://localhost:3000' }, target: { tag: 'button' }, note: 'Fix this' })
check('schema version', ann.schemaVersion, SCHEMA_VERSION)
checkTrue('has id prefix', ann.id.startsWith('ann_'))
checkTrue('has UUID', ann.id.length > 10)
check('default status', ann.status, 'pending')
checkTrue('has createdAt', Boolean(ann.createdAt))

console.log('\n--- Metadata validation ---')
// Valid metadata
const validMeta = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [],
  metadata: [{ name: 'data-testid', value: 'submit-btn' }] } }
checkTrue('valid metadata accepted', validateMessage(validMeta).valid)

// Multiple metadata hints
const multiMeta = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [],
  metadata: [
    { name: 'data-testid', value: 'submit-btn' },
    { name: 'data-oe-model', value: 'res.partner' },
    { name: 'data-oe-id', value: '42' },
  ] } }
checkTrue('multiple metadata accepted', validateMessage(multiMeta).valid)

// Metadata not an array
const badMeta1 = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [],
  metadata: 'not-array' } }
checkFalse('metadata not array rejected', validateMessage(badMeta1).valid)

// Too many metadata hints
const tooManyMeta = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [],
  metadata: Array(LIMITS.metadata + 1).fill(null).map((_, i) => ({ name: `data-test-${i}`, value: 'x' })) } }
checkFalse('too many metadata rejected', validateMessage(tooManyMeta).valid)

// Metadata hint not an object
const badHint = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [],
  metadata: ['not-object'] } }
checkFalse('metadata hint not object rejected', validateMessage(badHint).valid)

// Metadata name not a string
const badName = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [],
  metadata: [{ name: 42, value: 'x' }] } }
checkFalse('metadata name not string rejected', validateMessage(badName).valid)

// Metadata value too long
const longMetaVal = { type: 'tackmark-element-selected', element: { tag: 'div', classes: [],
  metadata: [{ name: 'data-testid', value: 'x'.repeat(LIMITS.metadataValue + 1) }] } }
checkFalse('metadata value too long rejected', validateMessage(longMetaVal).valid)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
