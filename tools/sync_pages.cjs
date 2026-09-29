// sync_pages.cjs — i18n.js 词典改动后，把值级 diff 同步到页面（初始文本 + COV_FB 兜底词典）
// 原理：旧词典从 git HEAD:i18n.js 提取，新词典从工作区提取，按变更项同步页面。
// 安全分级（2026-09-29 "Title" 误伤 docTitle/okTitle 事故后固化）：
//   · 长值（≥15 字符）：精确字符串替换（唯一性高，直接替换旧值→新值）
//   · 短值（<15 字符，如 thRole:"Title"/"头衔"）：必须 key 锚定——只替换 "k":"old"（COV_FB JSON）
//     和 data-i18n(-html)?="k">old（初始文本）两种形态，绝不裸替子串（key 名含同子串必误伤）
const fs = require('fs'), vm = require('vm'), { execSync } = require('child_process');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function extractDict(src) {
  const fakeDoc = { readyState: 'complete', addEventListener(){}, dispatchEvent(){}, querySelectorAll(){ return []; }, querySelector(){ return null; }, head: { querySelector(){ return null; } }, documentElement: {} };
  const ctx = { window: {}, document: fakeDoc, navigator: { language: 'zh' }, location: { search: '', pathname: '/' }, localStorage: { getItem(){ return null; }, setItem(){} }, history: { replaceState(){} }, URLSearchParams, setInterval(){}, clearInterval(){}, setTimeout(){}, CustomEvent: function(){}, console };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  const ci = ctx.window.covenantI18n;
  const keys = new Set();
  for (const m of src.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*["'{]/g)) keys.add(m[1]);
  const D = { zh: {}, en: {} };
  for (const l of ['zh', 'en']) { ci.langSwitch(l); for (const k of keys) { const v = ci.t(k); if (v && v !== k) D[l][k] = v; } }
  return D;
}

const newSrc = fs.readFileSync('i18n.js', 'utf8');
const oldSrc = execSync('git show HEAD:i18n.js').toString();
const oldD = extractDict(oldSrc), newD = extractDict(newSrc);

const changed = [];
for (const l of ['zh', 'en']) for (const k of Object.keys(newD[l])) {
  if (oldD[l][k] !== newD[l][k]) changed.push({ lang: l, k, old: oldD[l][k], now: newD[l][k] });
}
if (!changed.length) { console.log('词典无变更，无需同步'); process.exit(0); }
console.log('词典变更 ' + changed.length + ' 项（' + changed.map(c => c.lang + ':' + c.k).join(', ') + '）');

for (const p of ['index.html', 'plan.html', 'signatures.html', 'charter.html', 'signed.html']) {
  let h = fs.readFileSync(p, 'utf8'), n = 0;
  for (const c of changed) {
    if (c.old == null) continue; // 新增 key：初始文本不存在，COV_FB 需 rebuild 流程，此处跳过并报告
    if (c.old.length >= 15) {
      // 长值：精确替换（初始文本 + COV_FB 全覆盖）
      const parts = h.split(c.old);
      if (parts.length > 1) { h = parts.join(c.now); n += parts.length - 1; }
    } else {
      // 短值：key 锚定两形态，绝不裸替
      const jre = new RegExp('("' + esc(c.k) + '":")' + esc(c.old) + '(")', 'g');
      h = h.replace(jre, (m, a, b) => { n++; return a + c.now + b; });
      const tre = new RegExp('(data-i18n(?:-html)?="' + esc(c.k) + '"[^>]*>)' + esc(c.old) + '(</?)', 'g');
      h = h.replace(tre, (m, a, b) => { n++; return a + c.now + b; });
    }
  }
  fs.writeFileSync(p, h);
  console.log(p + ': 同步 ' + n + ' 处');
}

// 自检：COV_FB 块必须是合法 JSON（key 名被误改会在这里炸出来）
for (const p of ['index.html', 'plan.html', 'signatures.html', 'charter.html']) {
  const m = fs.readFileSync(p, 'utf8').match(/var COV_FB = (\{.*?\});\n/s);
  if (!m) { console.log(p + ': ⚠️ COV_FB 未找到'); continue; }
  try { JSON.parse(m[1]); console.log(p + ': COV_FB JSON ✓'); }
  catch (e) { console.log(p + ': ✗ COV_FB JSON 损坏——' + e.message); process.exit(1); }
}
