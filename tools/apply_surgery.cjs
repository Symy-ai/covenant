// 三处 JS 手术：T() 兜底化 / onclick 语言按钮 / index 分享 lang
const fs = require('fs');
for (const p of ['index.html', 'signatures.html']) {
  let h = fs.readFileSync(p, 'utf8');
  const before = h;
  h = h.replace(/(var|const) T = function \(k\) \{ return window\.covenantI18n \? covenantI18n\.t\(k\) : k; \};/,
    '$1 T = function (k) { if (window.covenantI18n) { var v = covenantI18n.t(k); if (v && v !== k) return v; } return (COV_FB[COV_FB_LANG] && COV_FB[COV_FB_LANG][k]) || k; };');
  if (h === before) { console.log(p + ' ⚠️ T 未替换（可能已改）'); continue; }
  fs.writeFileSync(p, h); console.log(p + ': T() 已改造');
}
for (const p of ['index.html', 'signatures.html', 'charter.html', 'plan.html']) {
  let h = fs.readFileSync(p, 'utf8');
  const n = (h.match(/onclick="covenantI18n\.langSwitch\(covenantI18n\.lang==='zh'\?'en':'zh'\)"/g) || []).length;
  if (n) { h = h.replace(/onclick="covenantI18n\.langSwitch\(covenantI18n\.lang==='zh'\?'en':'zh'\)"/g, 'onclick="covLangToggle()"'); fs.writeFileSync(p, h); }
  console.log(p + ': onclick 改造 ' + n + ' 处');
}
let h = fs.readFileSync('index.html', 'utf8');
if (h.includes('lang: window.covenantI18n ? covenantI18n.lang : "zh",')) {
  h = h.replace('lang: window.covenantI18n ? covenantI18n.lang : "zh",', 'lang: (window.covenantI18n && covenantI18n.lang) || COV_FB_LANG,');
  fs.writeFileSync('index.html', h); console.log('index.html: 分享 lang 已接兜底');
} else console.log('index.html: 分享 lang ' + (h.includes('COV_FB_LANG,') ? '已是兜底版' : '⚠️ 未找到目标'));
