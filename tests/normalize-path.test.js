// normalizeFilePath tests — migrated to ESM import from core module
import { normalizeFilePath } from '../src/core/normalize-path.js'

let failed = 0
const cases = [
  ['/c/Users/foo/bar', 'C:\\Users\\foo\\bar'],
  ['/d/Projects/tackmark/src', 'D:\\Projects\\tackmark\\src'],
  ['C:/Users/foo/bar', 'C:\\Users\\foo\\bar'],
  ['C:\\Users\\foo\\bar', 'C:\\Users\\foo\\bar'],
  ['', ''],
  [null, null],
  [42, 42],
]

for (const [input, expected] of cases) {
  const got = normalizeFilePath(input)
  const pass = got === expected
  if (!pass) failed++
  console.log(
    (pass ? 'PASS' : 'FAIL') +
    ': ' + JSON.stringify(input) +
    ' -> ' + JSON.stringify(got) +
    (pass ? '' : ' (expected ' + JSON.stringify(expected) + ')')
  )
}

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`)
  process.exit(1)
}
console.log('\nAll cases passed')
