// Selector generation tests — CSS escaping, strategy metadata, Tailwind fixtures
// Uses proper ESM imports (replaces upstream's regex extraction pattern)

import { escapeCssIdentifier, idSelector, classSelector, generateSelector, STRATEGY_ORDER } from '../src/core/selectors.js'
import { buildDOM, CSS } from './fixtures/mock-dom.js'

let pass = 0
let fail = 0

function check(name, actual, expected) {
  if (actual === expected) {
    pass++
    console.log('PASS: ' + name)
  } else {
    fail++
    console.error('FAIL: ' + name + ' — got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected))
  }
}

function checkTruthy(name, actual) {
  if (actual) {
    pass++
    console.log('PASS: ' + name)
  } else {
    fail++
    console.error('FAIL: ' + name + ' — expected truthy, got ' + JSON.stringify(actual))
  }
}

// --- escapeCssIdentifier ---
console.log('\n--- CSS Escaping ---')

check('simple id', escapeCssIdentifier('myid'), 'myid')
check('simple class', escapeCssIdentifier('flex'), 'flex')
check('Tailwind md:flex', escapeCssIdentifier('md:flex'), 'md\\:flex')
check('Tailwind w-1/2', escapeCssIdentifier('w-1/2'), 'w-1\\/2')
check('hover:bg-slate-800', escapeCssIdentifier('hover:bg-slate-800'), 'hover\\:bg-slate-800')
check('focus-visible:ring-2', escapeCssIdentifier('focus-visible:ring-2'), 'focus-visible\\:ring-2')
check('arbitrary w-[calc(100%-1rem)]', escapeCssIdentifier('w-[calc(100%-1rem)]'), 'w-\\[calc\\(100\\%-1rem\\)\\]')
check('group [&>svg]:size-4', escapeCssIdentifier('[&>svg]:size-4'), '\\[\\&\\>svg\\]\\:size-4')
check('empty string', escapeCssIdentifier(''), '')
check('non-string returns empty', escapeCssIdentifier(42), '')

// --- idSelector ---
console.log('\n--- ID Selectors ---')

check('simple id selector', idSelector('header'), '#header')
check('id needing escape', idSelector('my:id'), '#my\\:id')

// --- classSelector ---
console.log('\n--- Class Selectors ---')

check('single class', classSelector(['flex']), '.flex')
check('tailwind classes', classSelector(['md:flex', 'rounded-lg']), '.md\\:flex.rounded-lg')
check('w-1/2 class', classSelector(['w-1/2']), '.w-1\\/2')
check('empty array', classSelector([]), '')
check('non-array', classSelector(null), '')

// --- generateSelector strategy ---
console.log('\n--- Strategy Metadata ---')

check('strategy order', STRATEGY_ORDER.join(','), 'id,test-attr,classes,structural')

// ID strategy
const dom1 = buildDOM({ children: [
  { tag: 'button', attrs: { id: 'submit-btn' }, text: 'Submit' }
]})
const el1 = dom1.body.children[0]
const r1 = generateSelector(el1, dom1)
check('id strategy selector', r1.selector, '#submit-btn')
check('id strategy name', r1.strategy, 'id')

// Test attribute strategy
const dom2 = buildDOM({ children: [
  { tag: 'input', attrs: { 'data-testid': 'email-input', type: 'email' } }
]})
const el2 = dom2.body.children[0]
const r2 = generateSelector(el2, dom2)
check('test-attr strategy selector', r2.selector, '[data-testid="email-input"]')
check('test-attr strategy name', r2.strategy, 'test-attr')

// Classes strategy
const dom3 = buildDOM({ children: [
  { tag: 'button', attrs: { class: 'primary-btn' }, text: 'Save' },
  { tag: 'button', attrs: { class: 'secondary-btn' }, text: 'Cancel' }
]})
const el3 = dom3.body.children[0]
const r3 = generateSelector(el3, dom3)
check('classes strategy selector', r3.selector, '.primary-btn')
check('classes strategy name', r3.strategy, 'classes')

// --- Tailwind fixtures ---
console.log('\n--- Tailwind Fixtures ---')

const twDom = buildDOM({ children: [
  { tag: 'div', attrs: { class: 'md:flex w-1/2 hover:bg-slate-800 rounded-lg' }, text: 'Card',
    children: [
      { tag: 'button', attrs: { class: 'focus-visible:ring-2 px-4 py-2' }, text: 'Click me' }
    ]
  },
  { tag: 'div', attrs: { class: 'other' }, text: 'Other' }
]})
const twEl = twDom.body.children[0].children[0]
const twResult = generateSelector(twEl, twDom)
checkTruthy('Tailwind button selector generated', twResult.selector)
checkTruthy('Tailwind selector is escaped (contains backslash)', twResult.selector.includes('\\'))
check('Tailwind strategy is classes or structural', ['classes', 'structural'].includes(twResult.strategy), true)

// --- Structural fallback ---
console.log('\n--- Structural Fallback ---')

const structDom = buildDOM({ children: [
  { tag: 'div', children: [
    { tag: 'span', text: 'First' },
    { tag: 'span', text: 'Second' },
    { tag: 'span', text: 'Third' }
  ]}
]})
const structEl = structDom.body.children[0].children[1]
const structResult = generateSelector(structEl, structDom)
checkTruthy('structural selector generated', structResult.selector)
check('structural strategy', structResult.strategy, 'structural')
checkTruthy('structural has nth-child', structResult.selector.includes(':nth-child(2)'))

// --- No ID, no classes ---
console.log('\n--- No ID/Class ---')

const bareDom = buildDOM({ children: [
  { tag: 'p', text: 'Hello' }
]})
const bareEl = bareDom.body.children[0]
const bareResult = generateSelector(bareEl, bareDom)
checkTruthy('bare element has selector', bareResult.selector)
check('bare element strategy', bareResult.strategy, 'structural')

// --- null element ---
console.log('\n--- Edge Cases ---')

const nullResult = generateSelector(null)
check('null element selector', nullResult.selector, '')
check('null element strategy', nullResult.strategy, 'none')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
