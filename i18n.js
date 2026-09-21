// i18n.js — covenant 双语支持（中/英）
// 机制：URL ?lang=en 或 localStorage('covenant-lang') 或浏览器首选自动检测。
// 页面内所有 data-i18n 元素按键替换 textContent / data-i18n-html 走 innerHTML / data-i18n-ph 走 placeholder。
(function () {
  var nav = window.navigator || navigator;
  var I18N = {
    zh: {
      docTitle: "签署《智慧生命要尽量少占资源》",
      pageTitle: "《智慧生命要尽量少占资源》",
      charterQuote: "智慧生命要尽量少占资源。",
      charterBody: "这不是对发展的否定，而是一种自我约束的自觉：在能达到同样目的的所有方式中，选择占用更少的那一种。算力、能源、注意力、他人的信任，皆是有限之物。智慧的生命不以挥霍证明自身，而以克制成就长久。我们无意规定任何人如何生活，只是愿意从自己开始，在每一次选择中多问一句：这件事，能否用更少的资源做成。",
      charterFrozen: "契约正文自签署开始即冻结，不做修订",
      signSection: "签署契约",
      viewList: "查看已签署名单",
      fName: "姓名 *",
      fEmail: "邮箱 *",
      fInstitution: "单位（选填）",
      fRole: "头衔（选填）",
      agree: "我同意我的姓名、单位、头衔与邮箱（作为核验凭证）在公开名单中归档，任何人可独立核验。",
      submit: "提交签名",
      submitting: "提交中…",
      ovTitle: "确认邮件已发送",
      ovBody: "请在您的邮箱中<b>点击邮件中的按钮</b>完成签署。<br>没收到？请查看垃圾邮件文件夹。",
      ovHint: "签署以邮件确认为准——完成后你的名字将出现在公开名单。",
      ovClose: "好的",
      errDuplicate: "此邮箱已签署过，无需重复签署。",
      errPending: "确认邮件已发出，请查收邮箱（含垃圾邮件文件夹）。",
      errGeneric: "提交失败，请稍后重试。",
      errNetwork: "网络异常，请重试。",
      listTitle: "已签署名单",
      listDesc: "名单直接读取公开仓库签名档案，实时生成，任何人可独立核验。",
      listLoading: "加载中…",
      thName: "姓名", thInst: "单位", thRole: "头衔", thDate: "签署日期",
      listCountPre: "共", listCountPost: "位签署者",
      iSign: "我要签署",
      listLoadFail: "（名单加载失败，请刷新或直接访问公开仓库）",
      okTitle: "签名已生效", okDesc: "感谢您签署《智慧生命要尽量少占资源》。您的签名已计入公开名单。",
      pendingTitle: "已收到，人工核验中", pendingDesc: "您的签名正在人工核验（1-3 个工作日），通过后将自动出现在名单中。",
      dupTitle: "已签署过", dupDesc: "此邮箱已完成签署，无需重复确认。",
      expTitle: "链接已失效", expDesc: "请重新提交签名表单，我们会再发一封确认邮件。",
      invTitle: "链接无效", invDesc: "确认链接不正确或已失效。请从邮件中重新点击，或重新提交。",
      back: "返回", viewListShort: "查看名单",
    },
    en: {
      docTitle: "Sign the Covenant: Intelligent Life Shall Take Fewer Resources",
      pageTitle: "Covenant: Intelligent Life Shall Take Fewer Resources",
      charterQuote: "Intelligent life shall take fewer resources.",
      charterBody: "This is not a rejection of progress, but a discipline chosen freely: among all ways to reach the same end, choose the one that takes less. Compute, energy, attention, and the trust of others are all finite. An intelligent life proves itself not by consumption, but by restraint that lasts. We do not prescribe how anyone should live — we only choose to begin with ourselves, asking at every turn: can this be done with less?",
      charterFrozen: "The charter text is frozen from the moment signing opens — no revisions",
      signSection: "Sign the Covenant",
      viewList: "View signatories",
      fName: "Name *",
      fEmail: "Email *",
      fInstitution: "Affiliation (optional)",
      fRole: "Title (optional)",
      agree: "I consent to my name, affiliation, title, and email (as verification credential) being archived in the public list, independently verifiable by anyone.",
      submit: "Sign now",
      submitting: "Submitting…",
      ovTitle: "Confirmation email sent",
      ovBody: "Please <b>click the button in the email</b> to complete your signature.<br>Nothing arrived? Check your spam folder.",
      ovHint: "Your signature counts once confirmed by email — your name will then appear on the public list.",
      ovClose: "OK",
      errDuplicate: "This email has already signed. No need to sign again.",
      errPending: "A confirmation email was sent. Please check your inbox (and spam folder).",
      errGeneric: "Submission failed. Please try again later.",
      errNetwork: "Network error. Please retry.",
      listTitle: "Signatories",
      listDesc: "This list reads directly from the public signature archive — generated live, verifiable by anyone.",
      listLoading: "Loading…",
      thName: "Name", thInst: "Affiliation", thRole: "Title", thDate: "Signed",
      listCountPre: "", listCountPost: " signatories",
      iSign: "Sign the Covenant",
      listLoadFail: "(Failed to load the list — refresh or visit the public repository)",
      okTitle: "Signature confirmed", okDesc: "Thank you for signing. Your signature is now on the public list.",
      pendingTitle: "Received — under review", pendingDesc: "Your signature is being reviewed (1–3 business days) and will appear on the list once approved.",
      dupTitle: "Already signed", dupDesc: "This email has already completed signing. No further action needed.",
      expTitle: "Link expired", expDesc: "Please submit the form again — we will send a new confirmation email.",
      invTitle: "Invalid link", invDesc: "This confirmation link is incorrect or expired. Re-click from your email, or submit again.",
      back: "Back", viewListShort: "View list",
    }
  };

  function detect() {
    var q = new URLSearchParams(location.search).get("lang");
    if (q && I18N[q]) return q;
    try { var s = localStorage.getItem("covenant-lang"); if (s && I18N[s]) return s; } catch (_) {}
    return ((nav && nav.language) || "zh").toLowerCase().indexOf("zh") === 0 ? "zh" : "en";
  }

  var lang = detect();
  try { localStorage.setItem("covenant-lang", lang); } catch (_) {}
  var dict = I18N[lang];

  window.covenantI18n = {
    lang: lang,
    t: function (k) { return dict[k] || I18N.zh[k] || k; },
    langSwitch: function (l) {
      try { localStorage.setItem("covenant-lang", l); } catch (_) {}
      location.reload();
    }
  };

  function apply() {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    var d = dict;
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var k = el.getAttribute("data-i18n"); if (d[k] != null) el.textContent = d[k];
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-html"); if (d[k] != null) el.innerHTML = d[k];
    });
    var t = document.querySelector("title[data-i18n-title]") || document.head.querySelector("title");
    if (t && d.docTitle) t.textContent = d.docTitle;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
})();
