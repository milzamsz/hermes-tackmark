// Golden-path parity test — verifies the extracted module produces selectors
// that resolve to the same elements as the upstream's original logic.
//
// The extracted module adds CSS escaping and strategy metadata, so the
// selector STRING may differ for elements with special chars (e.g. `.w\-1\/2`
// vs `.w-1/2`), but both must identify the same element.
//
// For elements WITHOUT special chars, selector strings should be identical.

import { generateSelector } from '../src/core/selectors.js'
import { generateSelectorLegacy } from './fixtures/legacy-selector.js'
import { buildDOM } from './fixtures/mock-dom.js'

let pass = 0, fail = 0
function check(name, actual, expected) {
  if (actual === expected) { pass++; console.log('PASS: ' + name) }
  else { fail++; console.error('FAIL: ' + name + ' — got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected)) }
}
function checkTrue(name, actual) { check(name, Boolean(actual), true) }

console.log('--- Parity: simple elements (strings should match) ---')

const doc1 = buildDOM({ children: [
  { tag: 'button', attrs: { id: 'btn1', class: 'btn primary' }, text: 'Submit' },
  { tag: 'div', attrs: { class: 'card' }, children: [
    { tag: 'span', attrs: { class: 'label' }, text: 'Hello' }
  ]}
]})

const btn1 = doc1.body.children[0]
const mod1 = generateSelector(btn1, doc1)
const leg1 = generateSelectorLegacy(btn1, doc1)
check('simple id: same selector', mod1.selector, leg1)

const label1 = doc1.body.children[1].children[0]
const mod1b = generateSelector(label1, doc1)
const leg1b = generateSelectorLegacy(label1, doc1)
check('class-only: same selector', mod1b.selector, leg1b)

console.log('\n--- Parity: structural fallback (strings should match) ---')

const doc2 = buildDOM({ children: [
  { tag: 'ul', children: [
    { tag: 'li', text: 'First' },
    { tag: 'li', text: 'Second' },
    { tag: 'li', text: 'Third' },
  ]}
]})

const li2 = doc2.body.children[0].children[1]
const mod2 = generateSelector(li2, doc2)
const leg2 = generateSelectorLegacy(li2, doc2)
check('structural: same selector', mod2.selector, leg2)
checkTrue('structural: has nth-child', mod2.selector.includes('nth-child'))

console.log('\n--- Parity: Tailwind classes (strings differ, module is correct) ---')

const doc3 = buildDOM({ children: [
  { tag: 'button', attrs: { class: 'w-1/2 hover:bg-slate-800' }, text: 'Click' }
]})

const tw3 = doc3.body.children[0]
const mod3 = generateSelector(tw3, doc3)
const leg3 = generateSelectorLegacy(tw3, doc3)
// Module escapes special chars; legacy does not — strings differ
checkTrue('tailwind: module has escaped selector', mod3.selector.includes('\\'))
checkTrue('tailwind: legacy has raw selector', !leg3.includes('\\'))
// Module resolves correctly
checkTrue('tailwind: module resolves to 1 element', doc3.querySelectorAll(mod3.selector).length === 1)

console.log('\n--- Parity: null element ---')
check('null: module empty', generateSelector(null, doc1).selector, '')
check('null: legacy empty', generateSelectorLegacy(null, doc1), '')

console.log('\n--- Parity: nested structural path ---')

const doc4 = buildDOM({ children: [
  { tag: 'table', children: [
    { tag: 'tbody', children: [
      { tag: 'tr', children: [
        { tag: 'td', text: 'Cell 1' },
        { tag: 'td', text: 'Cell 2' },
      ]}
    ]}
  ]}
]})

const cell2 = doc4.body.children[0].children[0].children[0].children[1]
const mod4 = generateSelector(cell2, doc4)
const leg4 = generateSelectorLegacy(cell2, doc4)
check('nested: same selector', mod4.selector, leg4)
checkTrue('nested: has tbody in path', mod4.selector.includes('tbody'))

console.log('\n--- Parity: multiple siblings ---')

const doc5 = buildDOM({ children: [
  { tag: 'div', attrs: { class: 'item' }, text: 'A' },
  { tag: 'div', attrs: { class: 'item' }, text: 'B' },
  { tag: 'div', attrs: { class: 'item' }, text: 'C' },
  { tag: 'div', attrs: { class: 'item' }, text: 'D' },
]})

const items = doc5.body.children
for (let i = 0; i < items.length; i++) {
  const mod = generateSelector(items[i], doc5)
  const leg = generateSelectorLegacy(items[i], doc5)
  check(`sibling ${i}: same selector`, mod.selector, leg)
}

console.log('\n--- Parity: element with no special chars (id only) ---')

const doc6 = buildDOM({ children: [
  { tag: 'input', attrs: { id: 'name', type: 'text' } }
]})
const el6 = doc6.body.children[0]
check('id only: same selector', generateSelector(el6, doc6).selector, generateSelectorLegacy(el6, doc6))

console.log('\n' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
