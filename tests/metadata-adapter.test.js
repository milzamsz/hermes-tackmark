// Metadata adapter tests — generic capture, Odoo adapter, security deny list, deduplication
import { MetadataAdapter, OdooMetadataAdapter, MetadataAdapterRegistry } from '../src/core/metadata-adapter.js'
import { buildDOM } from './fixtures/mock-dom.js'

let pass = 0, fail = 0
function check(name, actual, expected) {
  if (actual === expected) { pass++; console.log('PASS: ' + name) }
  else { fail++; console.error('FAIL: ' + name + ' — got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected)) }
}
function checkTrue(name, actual) { check(name, Boolean(actual), true) }
function checkFalse(name, actual) { check(name, Boolean(actual), false) }

console.log('--- Generic adapter ---')

const adapter = new MetadataAdapter()

// data-testid
const dom1 = buildDOM({ children: [
  { tag: 'button', attrs: { 'data-testid': 'submit-btn', class: 'btn' }, text: 'Submit' }
]})
const el1 = dom1.body.children[0]
const hints1 = adapter.extract(el1)
check('captures data-testid', hints1.length, 1)
check('hint name', hints1[0].name, 'data-testid')
check('hint value', hints1[0].value, 'submit-btn')
check('hint source', hints1[0].source, 'generic')

console.log('\n--- Multiple attributes ---')

const dom2 = buildDOM({ children: [
  { tag: 'input', attrs: {
    'data-testid': 'email',
    'data-test': 'email-field',
    'data-cy': 'email-cy',
    'data-qa': 'email-qa',
    'type': 'email',
    'class': 'form-input',
  }}
]})
const el2 = dom2.body.children[0]
const hints2 = adapter.extract(el2)
check('captures 4 test attributes', hints2.length, 4)
checkTrue('has data-testid', hints2.some(h => h.name === 'data-testid'))
checkTrue('has data-test', hints2.some(h => h.name === 'data-test'))
checkTrue('has data-cy', hints2.some(h => h.name === 'data-cy'))
checkTrue('has data-qa', hints2.some(h => h.name === 'data-qa'))
checkFalse('does not capture type', hints2.some(h => h.name === 'type'))
checkFalse('does not capture class', hints2.some(h => h.name === 'class'))

console.log('\n--- Prefix matching (data-test-x) ---')

const dom3 = buildDOM({ children: [
  { tag: 'div', attrs: { 'data-testid': 'a', 'data-testid-helper': 'b', 'data-testid-other': 'c' } }
]})
const el3 = dom3.body.children[0]
const hints3 = adapter.extract(el3)
check('captures data-testid and data-testid-* variants', hints3.length, 3)

console.log('\n--- Security: denied attributes ---')

const dom4 = buildDOM({ children: [
  { tag: 'input', attrs: {
    'data-testid': 'safe',
    'data-password': 'secret123',
    'data-token': 'abc456',
    'data-secret': 'hidden',
    'data-auth': 'bearer xyz',
    'data-session': 'sess-123',
    'data-csrf': 'csrf-token',
  }}
]})
const el4 = dom4.body.children[0]
const hints4 = adapter.extract(el4)
check('only captures safe attribute', hints4.length, 1)
check('captured data-testid', hints4[0].name, 'data-testid')
checkFalse('no data-password', hints4.some(h => h.name === 'data-password'))
checkFalse('no data-token', hints4.some(h => h.name === 'data-token'))
checkFalse('no data-secret', hints4.some(h => h.name === 'data-secret'))
checkFalse('no data-auth', hints4.some(h => h.name === 'data-auth'))
checkFalse('no data-session', hints4.some(h => h.name === 'data-session'))
checkFalse('no data-csrf', hints4.some(h => h.name === 'data-csrf'))

console.log('\n--- Value bounding ---')

const longVal = 'x'.repeat(300)
const dom5 = buildDOM({ children: [
  { tag: 'div', attrs: { 'data-testid': longVal } }
]})
const el5 = dom5.body.children[0]
const hints5 = adapter.extract(el5)
check('value truncated', hints5[0].value.length, 200)

console.log('\n--- Null element ---')
check('null element returns empty', adapter.extract(null).length, 0)

console.log('\n--- Odoo adapter ---')

const odoo = new OdooMetadataAdapter()
const dom6 = buildDOM({ children: [
  { tag: 'span', attrs: {
    'data-oe-model': 'res.partner',
    'data-oe-id': '42',
    'data-oe-field': 'name',
    'data-testid': 'partner-name',
  }}
]})
const el6 = dom6.body.children[0]
const hints6 = odoo.extract(el6)
check('odoo captures 3 data-oe attrs', hints6.length, 3)
checkTrue('has data-oe-model', hints6.some(h => h.name === 'data-oe-model'))
checkTrue('has data-oe-id', hints6.some(h => h.name === 'data-oe-id'))
checkTrue('has data-oe-field', hints6.some(h => h.name === 'data-oe-field'))
checkFalse('odoo does not capture data-testid', hints6.some(h => h.name === 'data-testid'))
check('odoo source name', hints6[0].source, 'odoo')

console.log('\n--- Registry: deduplication ---')

const registry = new MetadataAdapterRegistry([adapter, odoo])
const hints7 = registry.extractAll(el6)
// data-testid captured by generic, data-oe-* captured by odoo
check('registry captures all 4 unique attrs', hints7.length, 4)
checkTrue('has data-testid', hints7.some(h => h.name === 'data-testid'))
checkTrue('has data-oe-model', hints7.some(h => h.name === 'data-oe-model'))

console.log('\n--- Registry: createDefault ---')

const defaultReg = MetadataAdapterRegistry.createDefault()
check('default has 1 adapter', defaultReg.adapters.length, 1)
check('default is generic', defaultReg.adapters[0].name, 'generic')

console.log('\n--- Registry: createWithOdoo ---')

const odooReg = MetadataAdapterRegistry.createWithOdoo()
check('odoo registry has 2 adapters', odooReg.adapters.length, 2)
check('first is generic', odooReg.adapters[0].name, 'generic')
check('second is odoo', odooReg.adapters[1].name, 'odoo')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
