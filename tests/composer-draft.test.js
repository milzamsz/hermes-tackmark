import { draftInComposer, visibleComposerTarget } from '../src/core/composer-draft.js'

let pass = 0
let fail = 0
const check = (name, actual, expected) => {
  if (actual === expected) { pass++; console.log(`PASS: ${name}`) }
  else { fail++; console.error(`FAIL: ${name} — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`) }
}

const surface = {
  dataset: { composerTarget: 'tile:focused-session' },
  closest: () => null,
  getClientRects: () => [{ width: 500 }],
}
const documentObj = { querySelectorAll: () => [surface] }
const events = []
const windowObj = {
  setTimeout: callback => callback(),
  dispatchEvent: event => events.push({ type: event.type, detail: event.detail }),
}

check('visible target follows focused chat', visibleComposerTarget(documentObj), 'tile:focused-session')
check('empty draft rejected', draftInComposer('   ', [], { documentObj, windowObj }), false)
check('draft accepted', draftInComposer('  review this  ', [new Blob(['png'])], { documentObj, windowObj }), true)
check('insert event emitted', events[0].type, 'hermes:composer-insert')
check('draft is editable block', events[0].detail.mode, 'block')
check('draft targets focused chat', events[0].detail.target, 'tile:focused-session')
check('draft text trimmed', events[0].detail.text, 'review this')
check('screenshot attachment emitted', events[1].type, 'hermes:composer-attach-images')
check('composer focus emitted', events[2].type, 'hermes:composer-focus')
check('no submit event emitted', events.some(event => event.type === 'hermes:composer-submit'), false)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
