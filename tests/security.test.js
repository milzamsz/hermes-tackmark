// Security tests — migrated to ESM import from core modules
import { isAllowedPreviewUrl } from '../src/core/url-policy.js'
import { escapeHtmlAttr } from '../src/core/html.js'

let pass = 0, fail = 0
function check(name, actual, expected) {
  if (actual === expected) { pass++; console.log('PASS: ' + name) }
  else { fail++; console.error('FAIL: ' + name + ' — got ' + JSON.stringify(actual) + ', want ' + JSON.stringify(expected)) }
}

// --- isAllowedPreviewUrl (now uses stricter local-first policy) ---
check('http localhost allowed', isAllowedPreviewUrl('http://localhost:3000'), true)
check('http 127.0.0.1 allowed', isAllowedPreviewUrl('http://127.0.0.1:8080'), true)
check('https remote now denied by default', isAllowedPreviewUrl('https://example.com/page'), false)
check('data: rejected', isAllowedPreviewUrl('data:text/html,<script>alert(1)</script>'), false)
check('javascript: rejected', isAllowedPreviewUrl('javascript:alert(1)'), false)
check('no scheme rejected', isAllowedPreviewUrl('localhost:3000'), false)
check('empty rejected', isAllowedPreviewUrl(''), false)
check('non-string rejected', isAllowedPreviewUrl(42), false)

// --- escapeHtmlAttr ---
check('angle brackets escaped', escapeHtmlAttr('<script>'), '&lt;script&gt;')
check('double quote escaped', escapeHtmlAttr('x"><script>'), 'x&quot;&gt;&lt;script&gt;')
check('& escaped first', escapeHtmlAttr('a&b'), 'a&amp;b')
const sq = escapeHtmlAttr("it's")
check('single quote escaped', sq, "it&#39;s")
check('injection payload fully escaped', escapeHtmlAttr('http://x.com/"><script>alert(1)//'),
  'http://x.com/&quot;&gt;&lt;script&gt;alert(1)//')
check('numeric input', escapeHtmlAttr(42), '42')

console.log('\n' + pass + ' passed, ' + fail + ' failed')
if (fail > 0) process.exit(1)
