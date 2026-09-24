// ============================================================
// GET /api/confirm?t={token} — 邮箱确认：找 pending → 查重 → 分级 → 写 verified
// 自动放行：写 main:signatures/verified/{emailHash}.json + 删 pending
// 人工队列：写 pending-review 分支（保留 pending 原文件）
// ============================================================
import { ghGet, ghPut, ghDelete, ghList } from "../lib/github.js";
import { classify } from "./classify.js";
import { logError, track, hashId } from "../lib/monitoring.js";

const SITE = "https://symy.ai/covenant";
// lang 穿透: 确认邮件按钮带 lang → 重定向 signed.html 继续透传(换设备点链接也保持语言)
const redirect = (status, lang) => `https://symy.ai/covenant/signed.html?status=${status}&lang=${lang === "en" ? "en" : "zh"}`;

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

    const rec = await ghGet(`signatures/pending/${fileName}`);
    const data = rec.content;
    // 隐私：pending 不存明文邮箱，哈希由 sign 阶段算好随文件携带
    const emailHash = data.emailHash || hashId(data.email);

    // 幂等：已 verified → 直接提示已签署
    const already = await ghGet(`signatures/verified/${emailHash}.json`);
    if (already) {
      // 清残留 pending（若有）
      await ghDelete(`signatures/pending/${fileName}`, rec.sha, `cleanup-dup: ${emailHash}`);
      await track(emailHash, "covenant_confirm_duplicate", {});
      return res.redirect(302, redirect("duplicate", req.query.lang));
    }

    const level = classify(data);

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
      return res.redirect(302, redirect("ok", req.query.lang));
    }

    // manual → pending-review 分支（转人工）
    await ghPut(
      `signatures/pending/${fileName}`,
      { ...data, reviewQueuedAt: new Date().toISOString() },
      `review-queue: ${data.name} (${emailHash})`,
      { branch: "pending-review" },
    ).catch(async () => {
      // pending-review 分支可能不存在 → 从 main 建引用（空树提交由 GitHub 拒绝时退化：直接留在 main pending，人工扫表）
    });
    // 令牌墓碑（manual 同样需要：人工通过后用户重开链接应看到待核验而非失效）
    await ghPut(`signatures/tokens/${token}.json`, { emailHash, result: "manual", confirmedAt: new Date().toISOString() }, `token-tombstone: ${emailHash}`);
    await track(emailHash, "covenant_confirm_success", { level: "manual" });
    return res.redirect(302, redirect("pending", req.query.lang));
  } catch (e) {
    await logError(e, { stage: "confirm" });
    return res.redirect(302, redirect("invalid", req.query.lang));
  }
}
