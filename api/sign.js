// ============================================================
// POST /api/sign — 表单提交 → 查重 → 写 pending/{token}.json → 发确认邮件
// GitHub-Native：无 Redis；查重=列 verified/ 目录（邮箱哈希文件名）
// ============================================================
import crypto from "node:crypto";
import { ghGet, ghPut, ghDelete, ghList } from "../lib/github.js";
import { logError, track, hashId } from "../lib/monitoring.js";

const CHARTER_TITLE = "《智慧生命共生契约》";
const SITE = "https://symy.ai/covenant";

// 确认邮件双语（跟随签署页语言: 表单传 lang 参数, 缺省中文）
const MAIL = {
  zh: {
    subject: `请确认您的签名 · ${CHARTER_TITLE}`,
    greeting: "签名确认",
    hello: (name) => `您好，${name}：`,
    body: `您正在签署${CHARTER_TITLE}。请点击下方按钮确认您的签名：`,
    button: "确认签署",
    foot: "点击上方按钮即可完成签署，无需其他操作。如非本人操作，请忽略本邮件；如有疑问，可直接回复本邮件联系我们。",
  },
  en: {
    subject: "Please confirm your signature · The Covenant",
    greeting: "Confirm your signature",
    hello: (name) => `Hello ${name},`,
    body: "You are signing the Covenant of Symbiosis with Intelligent Life — the charter: Intelligent life shall take fewer resources. Click the button below to confirm your signature:",
    button: "Confirm signature",
    foot: "Clicking the button above completes your signature — nothing else to do. If this wasn't you, simply ignore this email; questions? Just reply.",
  },
};

function mailFor(lang) {
  return MAIL[lang] || MAIL.zh;
}

const mailHtml = (m, name, confirmUrl, emailHash) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;margin:0;padding:20px;background:#f5f5f5;">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:8px;padding:32px;">
    <h2 style="margin-top:0;">${m.greeting}</h2>
    <p>${m.hello(name)}</p>
    <p>${m.body}</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="${confirmUrl}"
         style="background:#6a1b9a;color:white;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">
        ${m.button}
      </a>
    </div>
    <p style="font-size:13px;color:#666;">${m.foot}</p>
    <!-- covenant-emailhash:${emailHash} 审核检索锚点：Resend 后台按此串搜索本邮件 -->
    <p style="font-size:11px;color:#ccc;margin:16px 0 0;">ref: ${emailHash}</p>
  </div>
</body></html>`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const { name, institution, role, email, agree, website, lang } = req.body || {};

  // 字段校验
  const errors = [];
  if (!name || name.length < 2 || name.length > 50) errors.push("name");
  if (institution && institution.length > 100) errors.push("institution");
  if (role && role.length > 50) errors.push("role");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("email");
  if (!agree || agree !== true) errors.push("agree");
  if (errors.length) return res.status(400).json({ error: "validation_failed", fields: errors });

  // 蜜罐：人类不可见；被填即机器人，静默成功（不埋点）
  if (website) return res.status(200).json({ ok: true });

  const emailKey = String(email).toLowerCase().trim();
  const emailHash = hashId(emailKey);

  try {
    // 一人一签：verified/ 下已有本邮箱哈希 → 已签
    const existing = await ghGet(`signatures/verified/${emailHash}.json`);
    if (existing) {
      await track(emailHash, "covenant_sign_rejected", { reason: "already_signed" });
      return res.status(409).json({ error: "already_signed" });
    }

    // 重复 pending：同邮箱已有待确认令牌 → 提示稍候（防刷）
    const pendings = await ghList("signatures/pending");
    if (pendings.some((f) => f.startsWith(`${emailHash}.`))) {
      await track(emailHash, "covenant_sign_rejected", { reason: "already_pending" });
      return res.status(429).json({ error: "already_pending" });
    }

    // 生成令牌并写 pending/{emailHash}.{token}.json（文件名带哈希便于查重）
    // 隐私：公开仓不落明文邮箱——只存 emailHash + emailDomain（分级规则需要域名；域名非个人标识符）
    const token = crypto.randomUUID();
    const emailDomain = emailKey.slice(emailKey.lastIndexOf("@") + 1);
    await ghPut(
      `signatures/pending/${emailHash}.${token}.json`,
      { name, institution, role: role || "", emailHash, emailDomain, token, createdAt: new Date().toISOString() },
      `pending: ${name} (${emailHash})`,
    );

    // 发确认邮件（语言跟随签署页）
    const confirmUrl = `${SITE}/api/confirm?t=${token}&lang=${lang === "en" ? "en" : "zh"}`;
    const m = mailFor(lang);
    const html = mailHtml(m, name, confirmUrl, emailHash);

    const mailResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Symy <covenant@symy.ai>",
        reply_to: "covenant@symy.ai",
        to: [email],
        subject: m.subject,
        html,
        // 自定义头：Resend 后台详情页可见，供人工审核检索
        headers: { "X-Covenant-Hash": emailHash },
      }),
    });

    if (!mailResp.ok) {
      // 邮件失败：回滚 pending 文件，不留死数据
      const rollback = await ghGet(`signatures/pending/${emailHash}.${token}.json`);
      if (rollback) await ghDelete(`signatures/pending/${emailHash}.${token}.json`, rollback.sha, `rollback: ${emailHash}`);
      await logError(new Error("resend_send_failed"), { status: mailResp.status });
      await track(emailHash, "covenant_email_failed", {});
      return res.status(502).json({ error: "email_send_failed" });
    }

    await track(emailHash, "covenant_sign_submitted", {});
    return res.status(200).json({ ok: true, message: "确认邮件已发送，请在方便时点击邮件中的按钮完成签署" });
  } catch (e) {
    await logError(e, { stage: "sign" });
    return res.status(500).json({ error: "internal_error" });
  }
}
