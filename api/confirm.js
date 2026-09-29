// ============================================================
// GET /api/confirm?t={token} — 邮箱确认：找 pending → 查重 → 分级 → 写 verified
// 自动放行：写 main:signatures/verified/{emailHash}.json + 删 pending
// 人工队列：写 pending-review 分支（保留 pending 原文件）
// ============================================================
import { ghGet, ghPut, ghDelete, ghList, ghEnsureBranch } from "../lib/github.js";
import { classify } from "./classify.js";
import { logError, track, hashId } from "../lib/monitoring.js";

const SITE = "https://symy.ai/covenant";
// lang 穿透: 确认邮件按钮带 lang → 重定向 signed.html 继续透传(换设备点链接也保持语言)
// h 穿透: 已生效/已签署态带 emailHash → signed.html 分享链接指向个人化 share.html（名单校验防伪造）
const redirect = (status, lang, h) => `https://symy.ai/covenant/signed.html?status=${status}&lang=${lang === "en" ? "en" : "zh"}${h ? `&h=${h}` : ""}`;

/**
 * 写入 pending-review 分支（转人工队列）——manual 与数据损坏两条路径共用
 * 分支可能不存在 → Contents PUT 返 404：建引用后重试一次；仍失败则留 main pending（人工扫表兜底）
 * 不 re-throw：队列写入失败不应让用户看到 invalid/expired
 */
async function queueReview(record, label, fileName, emailHash) {
  const put = () =>
    ghPut(`signatures/pending/${fileName}`, record, `review-queue: ${label} (${emailHash || "unknown"})`, {
      branch: "pending-review",
    });
  for (let attempt = 1; ; attempt++) {
    try {
      return await put();
    } catch (e) {
      if (attempt === 1) {
        // 分支尚未建立 → Contents PUT 返 404：建引用后重试一次
        await ghEnsureBranch("pending-review");
        continue;
      }
      // 终失败：上报后静默（main 上的 pending 原件保留，人工扫表兜底）
      await logError(e, { stage: "confirm-pending-review", emailHash });
      return;
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const token = req.query.t;
  if (!token || !/^[0-9a-f-]{36}$/.test(token)) {
    return res.redirect(302, redirect("invalid", req.query.lang));
  }

  try {
    // 找 pending 文件（文件名 {emailHash}.{token}.json，令牌在末段——精确匹配）
    const pendings = await ghList("signatures/pending");
    const fileName = pendings.find((f) => f.endsWith(`.${token}.json`));
    if (!fileName) {
      // 无 pending：查令牌墓碑——已确认过的链接重复打开，按确认结果回显，不误报失效
      const tomb = await ghGet(`signatures/tokens/${token}.json`);
      if (tomb) {
        await track(tomb.content.emailHash, "covenant_confirm_reopen", { result: tomb.content.result });
        return res.redirect(302, redirect(tomb.content.result === "auto" ? "ok" : "pending", req.query.lang));
      }
      return res.redirect(302, redirect("expired", req.query.lang));
    }

    // 上游故障（网络/5xx）：令牌与 pending 都还在，只是此刻读不到
    //   → 回 error「系统繁忙，请稍后重试」，绝不回 invalid/expired
    //   （链接真的不在时，pending 分支已 return，下面的兜底按"查不到文件"处理）
    let rec = null;
    try {
      rec = await ghGet(`signatures/pending/${fileName}`);
    } catch (e) {
      await logError(e, { stage: "confirm-pending-read", token, fileName });
      return res.redirect(302, redirect("error", req.query.lang));
    }
    if (!rec || !rec.content || typeof rec.content !== "object") {
      // 列目录后文件被清理/未提交：与"读不到"不同，这是真读空了
      await logError(new Error("pending_read_empty"), { stage: "confirm-pending-read", token, fileName });
      return res.redirect(302, redirect("invalid", req.query.lang));
    }
    const data = rec.content;
    // 隐私：pending 不存明文邮箱，哈希由 sign 阶段算好随文件携带
    // 哈希来源（emailHash，旧记录为 email）都缺时不得对 undefined 求哈希——
    //   hashId(undefined) 是固定合法哈希，必然撞上任意一条 verified → 伪装成"已签署过"
    const hasIdentity = Boolean(data.emailHash || data.email);
    const emailHash = hasIdentity ? data.emailHash || hashId(data.email) : "";
    // 数据完整性：name / 身份来源 缺一即无法归一 → 不查重、不放行，直接转人工
    const missing = [];
    if (!data.name) missing.push("name");
    if (!hasIdentity) missing.push("emailHash/email");
    if (missing.length) {
      await logError(new Error("pending_malformed"), { stage: "confirm-malformed-pending", token, fileName, missing });
      // 转人工：复用 manual 的 pending-review 入队路径（分支不存在 → 建引用后重试一次）
      await queueReview({ ...data, reviewQueuedAt: new Date().toISOString() }, data.name || `unknown(${fileName})`, fileName, emailHash);
      // 墓碑同 manual：人工处理后用户重开链接见 pending 而非"链接无效"；无身份来源则无从写墓碑
      if (emailHash) {
        await ghPut(`signatures/tokens/${token}.json`, { emailHash, result: "manual", confirmedAt: new Date().toISOString() }, `token-tombstone: ${emailHash}`);
      }
      return res.redirect(302, redirect("pending", req.query.lang));
    }
    // 分级入参：隐私版 pending 只有 emailDomain（无完整 email），旧记录兜底从 email 提取
    const classifyInput = { email: data.email || `a@${data.emailDomain || "unknown.invalid"}`, institution: data.institution, role: data.role };

    // 幂等：已 verified → 直接提示已签署
    const already = await ghGet(`signatures/verified/${emailHash}.json`);
    if (already) {
      // 清残留 pending（若有）
      await ghDelete(`signatures/pending/${fileName}`, rec.sha, `cleanup-dup: ${emailHash}`);
      await track(emailHash, "covenant_confirm_duplicate", {});
      return res.redirect(302, redirect("duplicate", req.query.lang, emailHash));
    }

    const level = classify(classifyInput);

    if (level === "auto") {
      await ghPut(
        `signatures/verified/${emailHash}.json`,
        { name: data.name, institution: data.institution, role: data.role, emailHash, confirmedAt: new Date().toISOString() },
        `verified: ${data.name} (${emailHash})`,
      );
      // 令牌墓碑：重复打开已确认链接时回显结果，不再误报"链接已失效"
      await ghPut(`signatures/tokens/${token}.json`, { emailHash, result: "auto", confirmedAt: new Date().toISOString() }, `token-tombstone: ${emailHash}`);
      await ghDelete(`signatures/pending/${fileName}`, rec.sha, `confirm: ${emailHash}`);
      await track(emailHash, "covenant_confirm_success", { level: "auto" });
      return res.redirect(302, redirect("ok", req.query.lang, emailHash));
    }

    // manual → pending-review 分支（转人工）
    // 注意：此处不 re-throw——队列写入失败不应让用户看到 invalid
    await queueReview({ ...data, reviewQueuedAt: new Date().toISOString() }, data.name, fileName, emailHash);
    // 令牌墓碑（manual 同样需要：人工通过后用户重开链接应看到待核验而非失效）
    await ghPut(`signatures/tokens/${token}.json`, { emailHash, result: "manual", confirmedAt: new Date().toISOString() }, `token-tombstone: ${emailHash}`);
    await track(emailHash, "covenant_confirm_success", { level: "manual" });
    return res.redirect(302, redirect("pending", req.query.lang));
  } catch (e) {
    // 兜底仍出错的未知异常：上报并回 error（不谎称链接失效）
    await logError(e, { stage: "confirm" });
    return res.redirect(302, redirect("error", req.query.lang));
  }
}
