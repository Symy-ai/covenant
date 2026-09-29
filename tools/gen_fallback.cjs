// 从 i18n.js 提取每页兜底词典 + 初始文本中文化替换
const fs = require('fs'), vm = require('vm');
const src = fs.readFileSync('i18n.js', 'utf8');
const fakeDoc = { readyState: 'complete', addEventListener(){}, dispatchEvent(){}, querySelectorAll(){ return []; }, querySelector(){ return null; }, head: { querySelector(){ return null; } }, documentElement: {} };
const ctx = { window: {}, document: fakeDoc, navigator: { language: 'zh' }, location: { search: '', pathname: '/' }, localStorage: { getItem(){ return null; }, setItem(){} }, history: { replaceState(){} }, URLSearchParams, setInterval(){}, clearInterval(){}, setTimeout(){}, CustomEvent: function(){}, console };
vm.createContext(ctx);
vm.runInContext(src, ctx);
const ci = ctx.window.covenantI18n;
if (!ci) { console.error('covenantI18n 未挂载'); process.exit(1); }
const dict = {};
for (const l of ['zh','en']) { ci.langSwitch(l); const d = {}; for (const k of Object.keys(ctx.window.__keys || {})) {} dict[l] = null; }
// 直接从 t() 逐 key 拿：先收集全部 key
ci.langSwitch('zh');
const allKeys = new Set();
// 从源码正则抓所有 key 名（含同行多 key 写法）
for (const m of src.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*["'{]/g)) allKeys.add(m[1]);
const D = { zh: {}, en: {} };
for (const l of ['zh','en']) {
  ci.langSwitch(l);
  for (const k of allKeys) { const v = ci.t(k); if (v && v !== k) D[l][k] = v; }
}
console.log('词典 key 总数: zh=' + Object.keys(D.zh).length + ' en=' + Object.keys(D.en).length);

// 每页 key 提取
const pages = ['index.html','plan.html','signatures.html','charter.html','signed.html','share.html'];
const result = {};
for (const p of pages) {
  const html = fs.readFileSync(p, 'utf8');
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n(?:-html|-ph|-title)?="([^"]+)"/g)) keys.add(m[1]);
  for (const m of html.matchAll(/\bT\(([^)]*)\)/g)) for (const q of m[1].matchAll(/["']([^"']+)["']/g)) keys.add(q[1]);
  const missing = [...keys].filter(k => !D.zh[k]);
  result[p] = { keys: [...keys].sort(), missing };
}
fs.writeFileSync('/tmp/fb_keys.json', JSON.stringify(result, null, 1));
fs.writeFileSync('/tmp/fb_dict.json', JSON.stringify(D, null, 1));
for (const p of pages) console.log(p + ': ' + result[p].keys.length + ' keys' + (result[p].missing.length ? '  ⚠️词典缺: ' + result[p].missing.join(',') : ''));

// ===== Part 2: 初始文本 key→中文 + 生成每页兜底词典文件 =====
// 安全规则：仅当「元素初始文本 trim 后 === key 本身」才替换（JS 里 querySelector('[data-i18n=...]') 等代码绝不会被误伤）
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
for (const p of ['index.html', 'plan.html', 'signatures.html', 'charter.html']) {
  let html = fs.readFileSync(p, 'utf8');
  let n = 0;
  // data-i18n-html="k">k< → 中文 HTML（值本身是 HTML 片段，直接嵌入）
  html = html.replace(/(data-i18n-html="([^"]+)"[^>]*>)([\s\S]*?)(<\/)/g, (m, a, k, t, e) => {
    if (t.trim() !== k) return m; const v = D.zh[k]; if (v == null) return m; n++; return a + v + e;
  });
  // data-i18n="k">k< → 中文纯文本
  html = html.replace(/(data-i18n="([^"]+)"[^>]*>)([^<]*)(<)/g, (m, a, k, t, e) => {
    if (t.trim() !== k) return m; const v = D.zh[k]; if (v == null) return m; n++; return a + esc(v) + e;
  });
  // placeholder（仅当 placeholder 值 === key 时替换）
  html = html.replace(/(placeholder=")([^"]*)("[^>]*data-i18n-ph="([^"]+)")/g, (m, a, t, e, k) => {
    if (t.trim() !== k) return m; const v = D.zh[k]; if (v == null) return m; n++; return a + esc(v) + e;
  });
  html = html.replace(/(data-i18n-ph="([^"]+)"[^>]*placeholder=")([^"]*)(")/g, (m, a, k, t, e) => {
    if (t.trim() !== k) return m; const v = D.zh[k]; if (v == null) return m; n++; return a + esc(v) + e;
  });
  fs.writeFileSync(p, html);
  // 每页词典（zh 全量 + en 全量，仅该页 key）
  const fb = {};
  for (const l of ['zh', 'en']) { fb[l] = {}; for (const k of result[p].keys) if (D[l][k] != null) fb[l][k] = D[l][k]; }
  fs.writeFileSync('/tmp/fb_' + p.replace('.html', '') + '.json', JSON.stringify(fb));
  console.log(p + ': 初始文本替换 ' + n + ' 处, 兜底词典 zh=' + Object.keys(fb.zh).length + '/en=' + Object.keys(fb.en).length + ' key');
}
