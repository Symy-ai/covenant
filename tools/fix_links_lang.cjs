// fix_links_lang.cjs — 修「了解完整计划」跳转 bug + plan.html 补语言切换按钮
// 幂等：已修过的步骤自动跳过
const fs = require('fs');

// ── bug1: index.html 了解完整计划 → LINKBASE 机制 ──
let h = fs.readFileSync('index.html', 'utf8');
const a = '<a href="plan.html" data-i18n="planLink">';
if (h.includes(a)) {
  h = h.replace(a, '<a href="LINKBASE/plan.html" data-int="1" data-i18n="planLink">');
  fs.writeFileSync('index.html', h);
  console.log('✓ index.html: 了解完整计划 → LINKBASE/plan.html + data-int');
} else if (h.includes('LINKBASE/plan.html')) {
  console.log('· index.html: 已修过，跳过');
} else { console.log('✗ index 链接未命中'); process.exit(1); }

// ── plan.html: 三链接 + 内链自适应脚本 + 语言按钮 ──
let p = fs.readFileSync('plan.html', 'utf8');
let n = 0;
for (const [from, to] of [
  ['<a class="cta" href="index.html" data-i18n="pepCtaSign">', '<a class="cta" href="LINKBASE/index.html" data-int="1" data-i18n="pepCtaSign">'],
  ['<a class="cta" href="signatures.html" data-i18n="pepCtaList">', '<a class="cta" href="LINKBASE/signatures.html" data-int="1" data-i18n="pepCtaList">'],
  ['<a href="index.html" data-i18n="pepBack">', '<a href="LINKBASE/index.html" data-int="1" data-i18n="pepBack">'],
]) {
  if (p.includes(from)) { p = p.replace(from, to); n++; }
}
console.log(n ? '✓ plan.html: ' + n + ' 条内链 → LINKBASE + data-int' : '· plan.html: 内链已修过');

// 删尾部直连 i18n.js（改由注入块负责——主站代理路径下也能正确加载）
if (p.includes('<script src="i18n.js"></script>')) {
  p = p.replace('<script src="i18n.js"></script>', '');
  console.log('✓ plan.html: 尾部直连 i18n.js 已移除');
} else console.log('· plan.html: 直连标签已移除，跳过');

// head 加内链自适应脚本（与 index/charter/signatures 同款）
if (!p.includes('内链自适应')) {
  const inject = [
    '<script>',
    '// 内链自适应: 主站代理(/covenant/*)带前缀, 直连域用根路径',
    '(function () {',
    '  var base = location.pathname.indexOf("/covenant") === 0 ? "/covenant" : "";',
    '  (function () {',
    '    var sc = document.createElement("script");',
    '    sc.src = base + "/i18n.js";',
    '    document.head.appendChild(sc);',
    '  })();',
    '  document.addEventListener("DOMContentLoaded", function () {',
    '    document.querySelectorAll(\'a[data-int="1"]\').forEach(function (a) {',
    '      a.setAttribute("href", a.getAttribute("href").replace("LINKBASE", base));',
    '    });',
    '  });',
    '})();',
    '</script>',
    '',
  ].join('\n');
  p = p.replace('</head>', inject + '</head>');
  console.log('✓ plan.html: 内链自适应脚本已注入 head');
} else console.log('· plan.html: 注入块已存在，跳过');

// CSS 补 .lang-switch 容器定位（按钮样式已有，plan 页自己的浅色配色）
if (!p.includes('.lang-switch {')) {
  p = p.replace('.lang-switch button {', '.lang-switch { position: absolute; top: 16px; right: 20px; font-size: 0.85em; }\n  .lang-switch button {');
  console.log('✓ plan.html: .lang-switch 容器定位已补');
} else console.log('· plan.html: 容器定位已有，跳过');

// body 加语言按钮（covLangToggle 在兜底块定义：正常网络分发 covenantI18n，坏网络用兜底词典）
if (!p.includes('class="lang-switch"')) {
  p = p.replace('<body>', '<body>\n  <div class="lang-switch"><button onclick="covLangToggle()">EN / 中</button></div>');
  console.log('✓ plan.html: 语言切换按钮已加');
} else console.log('· plan.html: 语言按钮已有，跳过');

fs.writeFileSync('plan.html', p);
console.log('done');
