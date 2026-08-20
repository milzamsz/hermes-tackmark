// SvelteKit/Tailwind fixture tests — realistic DOM structures from
// SvelteKit apps using Tailwind CSS. Tests selector generation and
// metadata extraction against patterns common in real apps:
// - Nested component layouts
// - Tailwind utility classes with special chars
// - Svelte data-* attributes
// - Form elements
// - Dynamic class lists

import { generateSelector } from '../src/core/selectors.js'
import { MetadataAdapter, MetadataAdapterRegistry } from '../src/core/metadata-adapter.js'
import { buildDOM } from './fixtures/mock-dom.js'

let pass = 0, fail = 0
function check(name, actual, expected) {
  if (actual === expected) { pass++; console.log('PASS: ' + name) }
  else { fail++; console.error('FAIL: ' + name + ' — got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected)) }
}
function checkTrue(name, actual) { check(name, Boolean(actual), true) }

const adapter = new MetadataAdapter()
const registry = MetadataAdapterRegistry.createDefault()

console.log('--- SvelteKit nav bar ---')

const nav = buildDOM({ children: [
  { tag: 'nav', attrs: { class: 'flex items-center justify-between px-4 py-2 bg-slate-900' }, children: [
    { tag: 'div', attrs: { class: 'flex items-center gap-3' }, children: [
      { tag: 'a', attrs: { href: '/', class: 'text-lg font-bold text-white' }, text: 'MyApp' }
    ]},
    { tag: 'div', attrs: { class: 'flex items-center gap-4' }, children: [
      { tag: 'a', attrs: { href: '/dashboard', class: 'text-sm text-slate-300 hover:text-white' }, text: 'Dashboard' },
      { tag: 'a', attrs: { href: '/settings', class: 'text-sm text-slate-300 hover:text-white' }, text: 'Settings' },
      { tag: 'button', attrs: { class: 'px-3 py-1 text-sm rounded bg-blue-500 hover:bg-blue-600' }, text: 'Sign out' }
    ]}
  ]}
]})

const signOutBtn = nav.querySelectorAll('button')[0]
const r1 = generateSelector(signOutBtn, nav)
checkTrue('nav button has selector', r1.selector)
// Classes with colons (hover:bg-blue-600) need escaping
checkTrue('nav button selector resolves to 1 element', nav.querySelectorAll(r1.selector).length === 1)

console.log('\n--- SvelteKit form with data-testid ---')

const form = buildDOM({ children: [
  { tag: 'form', attrs: { class: 'space-y-4 max-w-md mx-auto' }, children: [
    { tag: 'div', attrs: { class: 'space-y-1' }, children: [
      { tag: 'label', attrs: { for: 'email', class: 'block text-sm font-medium text-slate-700' }, text: 'Email' },
      { tag: 'input', attrs: { type: 'email', id: 'email', 'data-testid': 'email-input',
        class: 'block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500' }}
    ]},
    { tag: 'div', attrs: { class: 'space-y-1' }, children: [
      { tag: 'label', attrs: { for: 'password', class: 'block text-sm font-medium text-slate-700' }, text: 'Password' },
      { tag: 'input', attrs: { type: 'password', id: 'password', 'data-testid': 'password-input',
        class: 'block w-full rounded-md border-slate-300 shadow-sm focus:border-blue-500 focus:ring-blue-500' }}
    ]},
    { tag: 'button', attrs: { type: 'submit', 'data-testid': 'submit-btn',
      class: 'w-full py-2 px-4 bg-green-600 text-white rounded-md hover:bg-green-700' }, text: 'Sign in' }
  ]}
]})

const emailInput = form.querySelectorAll('input')[0]
const r2 = generateSelector(emailInput, form)
check('form input uses id strategy', r2.strategy, 'id')
check('form input selector', r2.selector, '#email')

const submitBtn = form.querySelectorAll('button')[0]
const r3 = generateSelector(submitBtn, form)
check('submit uses test-attr strategy', r3.strategy, 'test-attr')
checkTrue('submit selector has data-testid', r3.selector.includes('data-testid'))

// Metadata extraction
const hints3 = registry.extractAll(submitBtn)
checkTrue('submit has data-testid hint', hints3.some(h => h.name === 'data-testid'))
check('submit hint value', hints3.find(h => h.name === 'data-testid')?.value, 'submit-btn')

console.log('\n--- Tailwind card grid ---')

const grid = buildDOM({ children: [
  { tag: 'div', attrs: { class: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4' }, children: [
    { tag: 'div', attrs: { class: 'rounded-lg shadow-md p-4 bg-white' }, children: [
      { tag: 'h3', attrs: { class: 'text-lg font-semibold text-slate-800' }, text: 'Card 1' },
      { tag: 'p', attrs: { class: 'text-sm text-slate-600 mt-1' }, text: 'Description 1' }
    ]},
    { tag: 'div', attrs: { class: 'rounded-lg shadow-md p-4 bg-white' }, children: [
      { tag: 'h3', attrs: { class: 'text-lg font-semibold text-slate-800' }, text: 'Card 2' },
      { tag: 'p', attrs: { class: 'text-sm text-slate-600 mt-1' }, text: 'Description 2' }
    ]}
  ]}
]})

const card2Title = grid.querySelectorAll('h3')[1]
const r4 = generateSelector(card2Title, grid)
checkTrue('card 2 title has selector', r4.selector)
checkTrue('card title selector resolves', grid.querySelectorAll(r4.selector).length === 1)

console.log('\n--- Tailwind responsive classes ---')

const responsive = buildDOM({ children: [
  { tag: 'div', attrs: { class: 'flex flex-col md:flex-row lg:flex-row-reverse' }, children: [
    { tag: 'div', attrs: { class: 'w-full md:w-1/2 lg:w-1/3 p-2' }, text: 'Main' },
    { tag: 'aside', attrs: { class: 'w-full md:w-1/2 lg:w-2/3 p-2' }, text: 'Sidebar' }
  ]}
]})

const sidebar = responsive.querySelectorAll('aside')[0]
const r5 = generateSelector(sidebar, responsive)
checkTrue('sidebar has escaped selector', r5.selector.includes('\\'))
checkTrue('sidebar resolves to 1', responsive.querySelectorAll(r5.selector).length === 1)

console.log('\n--- SvelteKit dynamic class list ---')

const dynamic = buildDOM({ children: [
  { tag: 'button', attrs: {
    class: 'px-4 py-2 rounded-lg transition-colors active:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed',
    'data-testid': 'dynamic-btn'
  }, text: 'Click me' }
]})

const dynBtn = dynamic.querySelectorAll('button')[0]
const r6 = generateSelector(dynBtn, dynamic)
check('dynamic uses test-attr', r6.strategy, 'test-attr')
checkTrue('dynamic selector resolves', dynamic.querySelectorAll(r6.selector).length === 1)

const hints6 = registry.extractAll(dynBtn)
checkTrue('dynamic has hint', hints6.length > 0)

console.log('\n--- Deeply nested structure ---')

const deep = buildDOM({ children: [
  { tag: 'div', attrs: { class: 'app' }, children: [
    { tag: 'main', attrs: { class: 'container mx-auto' }, children: [
      { tag: 'section', attrs: { class: 'py-8' }, children: [
        { tag: 'div', attrs: { class: 'max-w-2xl mx-auto' }, children: [
          { tag: 'article', attrs: { class: 'prose' }, children: [
            { tag: 'p', text: 'Deep content' }
          ]}
        ]}
      ]}
    ]}
  ]}
]})

const deepP = deep.querySelectorAll('p')[0]
const r7 = generateSelector(deepP, deep)
checkTrue('deep p has selector', r7.selector)
checkTrue('deep p uses structural', r7.strategy === 'structural')
checkTrue('deep p selector resolves', deep.querySelectorAll(r7.selector).length === 1)

console.log('\n' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
