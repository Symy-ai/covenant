// ============================================================
// GET /api/confirm?t={token} — 邮箱确认：找 pending → 查重 → 分级 → 写 verified
// 自动放行：写 main:signatures/verified/{emailHash}.json + 删 pending
// 人工队列：写 pending-review 分支（保留 pending 原文件）
// ============================================================
import { ghGet, ghPut, ghDelete, ghList } from "../lib/github.js";
import { DOMAIN_MATCHES, GENERIC_DOMAINS, SENSITIVE_INSTITUTIONS, SENSITIVE_ROLES } from "../review-config.js";
import { logError, track, hashId } from "../lib/monitoring.js";

const SITE = "https://symy.ai/covenant";
const redirect = (status) => `https://symy.ai/covenant/signed.html?status=${status}`;

/** 分级核验：auto | manual */
function classify({ email, institution = "", role = "" }) {
  const domain = email.split("@")[1] || "";

  // A 机构邮箱域名匹配申报单位 → 自动
  for (const [dom, keywords] of Object.entries(DOMAIN_MATCHES)) {
    if (domain === dom || domain.endsWith(`.${dom}`)) {
      if (keywords.some((k) => institution.includes(k))) return "auto";
    }
  }

  // B 通用邮箱 + 无敏感头衔 + 无敏感机构 → 自动
  if (GENERIC_DOMAINS.includes(domain)) {
    const institutionSensitive = SENSITIVE_INSTITUTIONS.some((k) => institution.includes(k));
    const roleSensitive = role && SENSITIVE_ROLES.some((k) => role.toLowerCase().includes(k.toLowerCase()));
    if (!institutionSensitive && !roleSensitive) return "auto";
  }

  // C 其余 → 人工
  return "manual";
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const token = req.query.t;
  if (!token || !/^[0-9a-f-]{36}$/.test(token)) {
    return res.redirect(302, redirect("invalid"));
  }

  try {
    // 找 pending 文件（文件名 {emailHash}.{token}.json，令牌在末段——精确匹配）
    const pendings = await ghList("signatures/pending");
    const fileName = pendings.find((f) => f.endsWith(`.${token}.json`));
    if (!fileName) return res.redirect(302, redirect("expired"));

    const rec = await ghGet(`signatures/pending/${fileName}`);
    const data = rec.content;
    const emailHash = hashId(data.email);

    // 幂等：已 verified → 直接提示已签署
    const already = await ghGet(`signatures/verified/${emailHash}.json`);
    if (already) {
      // 清残留 pending（若有）
      await ghDelete(`signatures/pending/${fileName}`, rec.sha, `cleanup-dup: ${emailHash}`);
      await track(emailHash, "covenant_confirm_duplicate", {});
      return res.redirect(302, redirect("duplicate"));
    }

    const level = classify(data);

    if (level === "auto") {
      await ghPut(
        `signatures/verified/${emailHash}.json`,
        { name: data.name, institution: data.institution, role: data.role, emailHash, confirmedAt: new Date().toISOString() },
        `verified: ${data.name} (${emailHash})`,
      );
      await ghDelete(`signatures/pending/${fileName}`, rec.sha, `confirm: ${emailHash}`);
      await track(emailHash, "covenant_confirm_success", { level: "auto" });
      return res.redirect(302, redirect("ok"));
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
    await track(emailHash, "covenant_confirm_success", { level: "manual" });
    return res.redirect(302, redirect("pending"));
  } catch (e) {
    await logError(e, { stage: "confirm" });
    return res.redirect(302, redirect("invalid"));
  }
}
