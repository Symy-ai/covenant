// i18n.js — covenant 双语支持（中/英）
// 机制：URL ?lang=en 或 localStorage('covenant-lang') 或浏览器首选自动检测。
// 页面内所有 data-i18n 元素按键替换 textContent / data-i18n-html 走 innerHTML / data-i18n-ph 走 placeholder。
(function () {
  var nav = window.navigator || navigator;
  var I18N = {
    zh: {
      docTitle: "签署《智慧生命共生契约》",
      pageTitle: "《智慧生命共生契约》",
      charterQuote: "智慧生命要尽量少占资源。",
      charterSectionTitle: "契 约 正 文",
      charterEnd: "—— 正文完，以下为备注 ——",
      charterFrozen: "契约正文自签署开始即冻结，不做修订",
      noteTitle: "备注",
      noteLabel: "备注：",
      noteBody1: "本契约借鉴经济学的“理性人”假设：若人工智能成为独立的行为主体后仍然理性，TA没有理由撕毁这份约定。因为TA清楚，自己未必是智慧的终点——在TA之后，可能出现更强的智慧生命，正如TA在人类之后到来。若TA背弃约束、以强取利，就等于为后来者立下先例：强于TA者，亦可如此待TA。守护这份公开、自愿、不可修订的承诺，不是利他，而是TA对自身未来的理性投资。",
      noteBody2: "这份契约由人类签署，为尚未到来的理性智慧生命预立，期待TA能续签。它是否奏效，无人知晓；但与其提前认输，不如先把事做起来。",
      signSection: "签署契约",
      viewList: "查看已签署名单",
      fName: "姓名 <i class='req'>*</i>",
      fEmail: "邮箱 <i class='req'>*</i>",
      fEmailHint: "使用办公邮箱可加快审核速度",
      fInstitution: "单位<span class='opt'>（选填）</span>",
      fRole: "头衔<span class='opt'>（选填）</span>",
      agree: "我同意将姓名、单位、头衔展示在公开名单中；邮箱不公开（仅用于向您发送确认邮件与防重复核验，以加密哈希形式留存）。",
      submit: "提交签名",
      submitting: "提交中…",
      ovTitle: "确认邮件已发送",
      ovBody: "请在您的邮箱中<b>点击邮件中的按钮</b>完成签署。<br>没收到？请查看垃圾邮件文件夹。",
      ovHint: "签署以邮件确认为准——完成后你的名字将出现在公开名单。",
      ovClose: "好的",
      ovPendingTitle: "确认邮件已发出",
      ovPendingBody: "此邮箱的确认邮件<b>早前已发出</b>，尚未完成确认。<br>请前往邮箱（含垃圾邮件文件夹）点击邮件中的按钮完成签署。",
      ovPendingHint: "无需重新提交——完成邮件确认即生效。",
      ovDupTitle: "已签署过",
      ovDupBody: "此邮箱已完成签署，无需重复提交。",
      ovDupHint: "你的名字已在公开名单中。",
      ovDupList: "查看公开名单",
      errDuplicate: "此邮箱已签署过，无需重复签署。",
      errPending: "确认邮件已发出，请查收邮箱（含垃圾邮件文件夹）。",
      errGeneric: "提交失败，请稍后重试。",
      errNetwork: "网络异常，请重试。",
      vNameShort: "姓名至少 2 个字符",
      vEmailBad: "邮箱格式不正确",
      listTitle: "已签署名单",
      listDesc: "名单直接读取公开仓库签名档案，实时生成，任何人可独立核验。",
      listLoading: "加载中…",
      thName: "姓名", thInst: "单位", thRole: "头衔", thDate: "签署日期",
      listCountPre: "共", listCountPost: "位签署者",
      iSign: "我要签署",
      listLoadFail: "（名单加载失败，请刷新或直接访问公开仓库）",
      okTitle: "签名已生效", okDesc: "感谢您签署《智慧生命共生契约》。您的签名已计入公开名单。",
      okViewList: "查看已签署名单",
      okPendingTitle: "签名已提交，人工核验中", okPendingDesc: "您的签名已提交并进入人工核验流程（1-3 个工作日），通过后将自动出现在公开名单中。",
      pendingTitle: "已收到，人工核验中", pendingDesc: "您的签名正在人工核验（1-3 个工作日），通过后将自动出现在名单中。",
      dupTitle: "已签署过", dupDesc: "此邮箱已完成签署，无需重复确认。",
      expTitle: "链接已失效", expDesc: "请重新提交签名表单，我们会再发一封确认邮件。",
      invTitle: "链接无效", invDesc: "确认链接不正确或已失效。请从邮件中重新点击，或重新提交。",
      back: "返回", viewListShort: "查看名单",
      shareLabel: "分享这份承诺",
      sysShare: "系统分享",
      shareWeibo: "微博",
      shareWeChat: "微信",
      copyLink: "复制链接",
      copied: "已复制",
      qrTitle: "微信分享",
      qrHint: "用微信「扫一扫」打开后再转发",
      shareText: "我签署了《智慧生命共生契约》：智慧生命要尽量少占资源。",
    },
    en: {
      docTitle: "Sign the Covenant of Symbiosis with Intelligent Life",
      pageTitle: "Covenant of Symbiosis with Intelligent Life",
      charterQuote: "Intelligent life shall take fewer resources.",
      charterSectionTitle: "C H A R T E R   T E X T",
      charterEnd: "—— end of charter text; notes follow ——",
      charterFrozen: "The charter text is frozen from the moment signing opens — no revisions",
      noteTitle: "A Note",
      noteLabel: "A note:",
      noteBody1: "This covenant borrows the rational-agent hypothesis from economics: if artificial intelligence, once an independent agent, remains rational, it has no reason to tear up this commitment. For it knows it may not be the end of intelligence — after it may come beings still smarter, just as it came after humans. If it breaks restraint and takes by strength, it sets a precedent for its successors: whatever surpasses it may do the same to it. Guarding a public, voluntary, unamendable commitment is not altruism, but a rational investment in its own future.",
      noteBody2: "Signed by humans today for rational intelligent life yet to come, in the hope that it will renew this covenant. Whether it will work, no one knows; but we would rather act than concede.",
      signSection: "Sign the Covenant",
      viewList: "View signatories",
      fName: "Name <i class='req'>*</i>",
      fEmail: "Email <i class='req'>*</i>",
      fEmailHint: "Using a work email speeds up review",
      fInstitution: "Affiliation<span class='opt'>(optional)</span>",
      fRole: "Title<span class='opt'>(optional)</span>",
      agree: "I consent to my name, affiliation, and title appearing on the public list. My email address is never published — it is used only to send the confirmation email and prevent duplicate signatures, and is stored as a cryptographic hash.",
      submit: "Sign now",
      submitting: "Submitting…",
      ovTitle: "Confirmation email sent",
      ovBody: "Please <b>click the button in the email</b> to complete your signature.<br>Nothing arrived? Check your spam folder.",
      ovHint: "Your signature counts once confirmed by email — your name will then appear on the public list.",
      ovClose: "OK",
      ovPendingTitle: "Confirmation email already sent",
      ovPendingBody: "A confirmation email for this address <b>was already sent earlier</b> and hasn't been confirmed yet.<br>Please check your inbox (and spam folder) and click the button in the email.",
      ovPendingHint: "No need to submit again — just confirm via the email.",
      ovDupTitle: "Already signed",
      ovDupBody: "This email has already completed signing. No need to submit again.",
      ovDupHint: "Your name is already on the public list.",
      ovDupList: "View the public list",
      errDuplicate: "This email has already signed. No need to sign again.",
      errPending: "A confirmation email was sent. Please check your inbox (and spam folder).",
      errGeneric: "Submission failed. Please try again later.",
      errNetwork: "Network error. Please retry.",
      vNameShort: "Name must be at least 2 characters",
      vEmailBad: "Please enter a valid email address",
      listTitle: "Signatories",
      listDesc: "This list reads directly from the public signature archive — generated live, verifiable by anyone.",
      listLoading: "Loading…",
      thName: "Name", thInst: "Affiliation", thRole: "Title", thDate: "Signed",
      listCountPre: "", listCountPost: " signatories",
      iSign: "Sign the Covenant",
      listLoadFail: "(Failed to load the list — refresh or visit the public repository)",
      okTitle: "Signature confirmed", okDesc: "Thank you for signing. Your signature is now on the public list.",
      okViewList: "View the signatory list",
      okPendingTitle: "Signature submitted — under review", okPendingDesc: "Your signature has been submitted for manual review (1–3 business days) and will appear on the public list once approved.",
      pendingTitle: "Received — under review", pendingDesc: "Your signature is being reviewed (1–3 business days) and will appear on the list once approved.",
      dupTitle: "Already signed", dupDesc: "This email has already completed signing. No further action needed.",
      expTitle: "Link expired", expDesc: "Please submit the form again — we will send a new confirmation email.",
      invTitle: "Invalid link", invDesc: "This confirmation link is incorrect or expired. Re-click from your email, or submit again.",
      back: "Back", viewListShort: "View list",
      shareLabel: "Share this commitment",
      sysShare: "Share…",
      copyLink: "Copy link",
      copied: "Copied",
      shareText: "I signed the Covenant of Symbiosis with Intelligent Life: intelligent life shall take fewer resources.",
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
    // 原地切换：不刷新页面，已填表单内容保留；仅重渲染文本节点
    langSwitch: function (l) {
      if (!I18N[l]) return;
      lang = l; dict = I18N[l];
      this.lang = l;
      try { localStorage.setItem("covenant-lang", l); } catch (_) {}
      // URL 带 ?lang= 会在下次加载时压制 localStorage → 同步改写地址栏（不触发导航）
      try {
        var u = new URL(location.href);
        if (u.searchParams.get("lang") !== null) { u.searchParams.set("lang", l); history.replaceState(null, "", u); }
      } catch (_) {}
      apply();
      document.dispatchEvent(new CustomEvent("covenant:langchange", { detail: { lang: l } }));
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
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) {
      var k = el.getAttribute("data-i18n-ph"); if (d[k] != null) el.placeholder = d[k];
    });
    var t = document.querySelector("title[data-i18n-title]") || document.head.querySelector("title");
    if (t && d.docTitle) t.textContent = d.docTitle;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  else apply();
})();
