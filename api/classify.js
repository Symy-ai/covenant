// api/classify.js —— 分级核验逻辑 v2
// 整改项：P0-1 合并、P0-2 大小写、P0-3 空申报、P1-4 域名解析健壮性
import {
  DOMAIN_MATCHES,
  GENERIC_DOMAINS,
  SENSITIVE_INSTITUTIONS,
  SENSITIVE_ROLES,
  BLANK_SUBMISSION_POLICY,
  REVIEW_ALL_MANUAL,
} from "../review-config.js";
// ── 上线初期总开关：全部转人工（REVIEW_ALL_MANUAL）──────────
// 开启期间 A/B/C 分级整体暂停——所有确认进人工队列，由 approve.mjs 放行。
// 队列积压属预期；恢复分级将 review-config.js 的开关置 false 即可。
// ── P0-1：B 规则机构敏感词自动合并 ──────────────────────────
// 旧实现只查 SENSITIVE_INSTITUTIONS，导致
//   "gmail + 机构「清华大学」+ 头衔空" 直接自动上墙（冒名路径）
// 现合并 DOMAIN_MATCHES 全部关键词，兑现配置文件注释承诺
const ALL_INSTITUTION_KEYWORDS = [
  ...SENSITIVE_INSTITUTIONS,
  ...Object.values(DOMAIN_MATCHES).flat(),
];
// ── P0-2：大小写统一，配置侧一次性转小写，运行时零开销 ──────
const INSTITUTION_KEYWORDS_LC = [
  ...new Set(ALL_INSTITUTION_KEYWORDS.map((k) => k.toLowerCase())),
];
const ROLES_LC = [...new Set(SENSITIVE_ROLES.map((k) => k.toLowerCase()))];
// 小写化包含匹配（haystack 允许为 null/undefined/非字符串）
function includesAnyLC(haystack, needlesLC) {
  const h = (haystack || "").toString().toLowerCase();
  return needlesLC.some((k) => h.includes(k));
}
// ── P1-4：规范化域名提取 —— 取最后一个 @ 之后的部分 ────────
// 免疫 "a@b@c.com" 解析错位；无 @ 返回空串（落入 C 规则人工）
function extractDomain(email) {
  if (typeof email !== "string") return "";
  const at = email.lastIndexOf("@");
  if (at === -1) return "";
  return email.slice(at + 1).trim().toLowerCase();
}
/** 分级核验：auto | manual */
export function classify({ email, institution = "", role = "" }) {
  // 上线初期总开关：全量人工（REVIEW_ALL_MANUAL，恢复分级见 review-config.js）
  if (REVIEW_ALL_MANUAL) return "manual";
  const domain = extractDomain(email);
  // ── A 规则：机构官方域名 + 对应关键词 → 自动放行 ──
  // 域名匹配为"等于或点分子域"，免疫 tsinghua.edu.cn.evil.com（已验证）
  // 关键词匹配经 includesAnyLC 小写化（P0-2）
  for (const [dom, keywords] of Object.entries(DOMAIN_MATCHES)) {
    if (domain === dom || domain.endsWith("." + dom)) {
      const kwLC = keywords.map((k) => k.toLowerCase());
      if (includesAnyLC(institution, kwLC)) return "auto";
    }
  }
  // ── B / C 规则 ──
  const institutionSensitive = includesAnyLC(institution, INSTITUTION_KEYWORDS_LC);
  const roleSensitive = includesAnyLC(role, ROLES_LC);
  // ── P0-3：机构与头衔双空申报，按策略处理 ──
  const blankSubmission =
    (institution || "").toString().trim() === "" &&
    (role || "").toString().trim() === "";
  if (GENERIC_DOMAINS.includes(domain)) {
    if (institutionSensitive || roleSensitive) return "manual";
    if (blankSubmission && BLANK_SUBMISSION_POLICY === "manual") return "manual";
    return "auto";
  }
  // C 规则：未知域名 → 人工核验
  return "manual";
}
