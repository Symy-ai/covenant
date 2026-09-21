// ============================================================
// POST /api/sign — 表单提交 → 查重 → 写 pending/{token}.json → 发确认邮件
// GitHub-Native：无 Redis；查重=列 verified/ 目录（邮箱哈希文件名）
// ============================================================
import crypto from "node:crypto";
import { ghGet, ghPut, ghDelete, ghList } from "../lib/github.js";
import { logError, track, hashId } from "../lib/monitoring.js";

const CHARTER_TITLE = "《智慧生命要尽量少占资源》";
const SITE = "https://symy.ai/covenant";

const MAIL_TEMPLATE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,sans-serif;margin:0;padding:20px;background:#f5f5f5;">
  <div style="max-width:560px;margin:0 auto;background:white;border-radius:8px;padding:32px;">
    <h2 style="margin-top:0;">签名确认</h2>
    <p>您好，{{NAME}}：</p>
    <p>您正在签署${CHARTER_TITLE}。请点击下方按钮确认您的签名：</p>
    <div style="text-align:center;margin:32px 0;">
      <a href="{{CONFIRM_URL}}"
         style="background:#6a1b9a;color:white;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:600;display:inline-block;">
        确认签署
      </a>
    </div>
    <p style="font-size:13px;color:#666;">
      点击上方按钮即可完成签署，无需其他操作。
      如非本人操作，请忽略本邮件；如有疑问，可直接回复本邮件联系我们。
    </p>
  </div>
</body></html>`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });

  const { name, institution, role, email, agree, website } = req.body || {};

  // 字段校验
  const errors = [];
  if (!name || name.length < 2 || name.length > 50) errors.push("name");
  if (!institution || institution.length > 100) errors.push("institution");
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
    const token = crypto.randomUUID();
    await ghPut(
      `signatures/pending/${emailHash}.${token}.json`,
      { name, institution, role: role || "", email: emailKey, token, createdAt: new Date().toISOString() },
      `pending: ${name} (${emailHash})`,
    );

    // 发确认邮件
    const confirmUrl = `${SITE}/api/confirm?t=${token}`;
    const html = MAIL_TEMPLATE
      .replaceAll("{{NAME}}", name)
      .replaceAll("{{CONFIRM_URL}}", confirmUrl);

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
        subject: `请确认您的签名 · ${CHARTER_TITLE}`,
        html,
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
