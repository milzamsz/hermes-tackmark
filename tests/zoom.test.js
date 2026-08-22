import { normalizeZoomPercent, stepZoomPercent } from '../src/core/zoom.js'

let pass = 0, fail = 0
const check = (name, actual, expected) => {
  if (actual === expected) { pass++; console.log(`PASS: ${name}`) }
  else { fail++; console.error(`FAIL: ${name} — got ${actual}, want ${expected}`) }
}
check('default zoom', normalizeZoomPercent(null), 100)
check('saved zoom parsed', normalizeZoomPercent('130'), 130)
check('minimum clamped', normalizeZoomPercent(10), 50)
check('maximum clamped', normalizeZoomPercent(999), 200)
check('zoom in step', stepZoomPercent(100, 1), 110)
check('zoom out step', stepZoomPercent(100, -1), 90)
check('zoom in stays bounded', stepZoomPercent(200, 1), 200)
check('zoom out stays bounded', stepZoomPercent(50, -1), 50)
console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
