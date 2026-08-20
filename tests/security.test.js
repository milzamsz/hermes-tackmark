// 测试 src/plugin.js 的安全防御纯函数：URL 白名单 + HTML 属性转义
// 用例覆盖 PR-A 修复的注入链（baseUrl 属性逃逸 XSS）
const fs = require('fs')
const path = require('path')

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'plugin.js'), 'utf8')

function extract(name) {
  const m = src.match(new RegExp('export function ' + name + '[\\s\\S]*?\\n\\}'))
  if (!m) {
    console.error('FAIL: ' + name + ' 函数未在 src/plugin.js 中找到')
    process.exit(1)
  }
  return new Function('return ' + m[0].replace('export ', ''))()
}

const isAllowedPreviewUrl = extract('isAllowedPreviewUrl')
const escapeHtmlAttr = extract('escapeHtmlAttr')

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

// --- isAllowedPreviewUrl：URL scheme 白名单 ---
check('http 通过', isAllowedPreviewUrl('http://localhost:3000'), true)
check('https 通过', isAllowedPreviewUrl('https://example.com/page'), true)
check('data: 拒绝', isAllowedPreviewUrl('data:text/html,<script>alert(1)</script>'), false)
check('javascript: 拒绝', isAllowedPreviewUrl('javascript:alert(1)'), false)
check('无 scheme 拒绝', isAllowedPreviewUrl('localhost:3000'), false)
check('空串拒绝', isAllowedPreviewUrl(''), false)
check('非字符串拒绝', isAllowedPreviewUrl(42), false)

// --- escapeHtmlAttr：<base href> 属性值转义 ---
check('尖括号转义', escapeHtmlAttr('<script>'), '&lt;script&gt;')
check('双引号转义', escapeHtmlAttr('x"><script>'), 'x&quot;&gt;&lt;script&gt;')
check('& 优先转义', escapeHtmlAttr('a&b'), 'a&amp;b')
check('单引号转义', escapeHtmlAttr("it's"), 'it&#39;s')
check('实测注入 payload 完整转义', escapeHtmlAttr('http://x.com/"><script>alert(1)//'),
  'http://x.com/&quot;&gt;&lt;script&gt;alert(1)//')
check('数字输入', escapeHtmlAttr(42), '42')

console.log('\n' + pass + ' 通过, ' + fail + ' 失败')
if (fail > 0) process.exit(1)
