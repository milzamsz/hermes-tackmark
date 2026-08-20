// 测试 src/plugin.js 中 normalizeFilePath 的 MSYS 路径转换防御逻辑
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'plugin.js'), 'utf8')
const m = src.match(/export function normalizeFilePath[\s\S]*?\n\}/)
if (!m) {
  console.error('FAIL: normalizeFilePath 函数未在 src/plugin.js 中找到')
  process.exit(1)
}

// 提取函数体并执行
const fn = new Function('return ' + m[0].replace('export ', ''))()

const cases = [
  // [输入, 期望输出]
  ['/c/Users/foo/bar', 'C:\\Users\\foo\\bar'],                    // MSYS 风格
  ['/d/Projects/tackmark/src', 'D:\\Projects\\tackmark\\src'],    // MSYS 风格
  ['C:/Users/foo/bar', 'C:\\Users\\foo\\bar'],                    // 正斜杠 Windows
  ['C:\\Users\\foo\\bar', 'C:\\Users\\foo\\bar'],                 // 已正确
  ['', ''],
  [null, null],
  [42, 42],
]

let failed = 0
for (const [input, expected] of cases) {
  const got = fn(input)
  const pass = got === expected
  if (!pass) failed++
  console.log(
    (pass ? 'PASS' : 'FAIL') +
    ': ' + JSON.stringify(input) +
    ' -> ' + JSON.stringify(got) +
    (pass ? '' : ' (期望 ' + JSON.stringify(expected) + ')')
  )
}

if (failed > 0) {
  console.error(`\n${failed} 个用例失败`)
  process.exit(1)
}
console.log('\n全部用例通过')
