// 向四页插入兜底 i18n 脚本块（</head> 前）
const fs = require('fs');
const tpl = (json) => `<script>
// ===== 兜底 i18n：网络差 i18n.js 加载失败时本页仍完整显示（初始文本已内置中文；i18n.js 到达后自动接管）=====
var COV_FB = ${json};
var COV_FB_LANG = (function () {
  var q = new URLSearchParams(location.search).get("lang");
  if (q === "zh" || q === "en") return q;
  try { var s = localStorage.getItem("covenant-lang"); if (s === "zh" || s === "en") return s; } catch (_) {}
  return ((navigator.language || "zh").toLowerCase().indexOf("zh") === 0) ? "zh" : "en";
})();
function covFbApply() {
  var d = COV_FB[COV_FB_LANG]; if (!d) return;
  document.documentElement.lang = COV_FB_LANG === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach(function (el) { var k = el.getAttribute("data-i18n"); if (d[k] != null) el.textContent = d[k]; });
  document.querySelectorAll("[data-i18n-html]").forEach(function (el) { var k = el.getAttribute("data-i18n-html"); if (d[k] != null) el.innerHTML = d[k]; });
  document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { var k = el.getAttribute("data-i18n-ph"); if (d[k] != null) el.placeholder = d[k]; });
  var t = document.querySelector("title[data-i18n-title]");
  if (t) { var tk = t.getAttribute("data-i18n-title"); if (d[tk] != null) t.textContent = d[tk]; }
}
// 语言切换：i18n.js 在用真词典切换，不在用兜底词典切换（坏网络下切换可用）
function covLangToggle() {
  if (window.covenantI18n) { covenantI18n.langSwitch(covenantI18n.lang === "zh" ? "en" : "zh"); return; }
  COV_FB_LANG = COV_FB_LANG === "zh" ? "en" : "zh";
  try { localStorage.setItem("covenant-lang", COV_FB_LANG); } catch (_) {}
  var u = new URL(location.href);
  if (u.searchParams.get("lang") !== null) { u.searchParams.set("lang", COV_FB_LANG); history.replaceState(null, "", u); }
  covFbApply();
  document.dispatchEvent(new CustomEvent("covenant:langchange", { detail: { lang: COV_FB_LANG } }));
}
document.addEventListener("DOMContentLoaded", function () { if (!window.covenantI18n) covFbApply(); });
</script>
`;
for (const p of ['index.html', 'plan.html', 'signatures.html', 'charter.html']) {
  let html = fs.readFileSync(p, 'utf8');
  if (html.includes('COV_FB')) { console.log(p + ': 已插入，跳过'); continue; }
  const fb = JSON.parse(fs.readFileSync('/tmp/fb_' + p.replace('.html', '') + '.json', 'utf8'));
  const block = tpl(JSON.stringify(fb));
  html = html.replace('</head>', block + '</head>');
  fs.writeFileSync(p, html);
  console.log(p + ': 插入兜底脚本（词典 zh=' + Object.keys(fb.zh).length + '/en=' + Object.keys(fb.en).length + ' key）');
}
