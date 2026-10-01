// ============================================================
// GET /api/list — 签名墙数据聚合（同源端点）
// 背景: 主站 symy.ai 全站 CSP 的 connect-src 未含 jsdelivr/github 域名,
//      名单页在主站代理路径下所有前端数据 fetch 均被浏览器拦截(直连域正常)。
//      服务端聚合不受浏览器 CSP 约束 → 主站/直连两域统一走此同源端点。
// 通道: ① jsDelivr CDN(秒开底座, 最多滞后12h) ② GitHub API(token 实时增量) 合并去重
// 缓存: 进程内 60s + 响应 Cache-Control(浏览器60s/边缘120s)——次通道兜底（主通道是 5 分钟静态快照 + 60min 心跳）
// 2026-09-30 Spark 拍板: 主通道 data/signatures.json（cron */5 + 签名生效数据变化即提交）
// ============================================================
import { ghList, ghGet } from "../lib/github.js";
import { logError } from "../lib/monitoring.js";

const REPO = process.env.GITHUB_REPO || "symy-ai/covenant";
const CDN = `https://cdn.jsdelivr.net/gh/${REPO}@main/signatures/verified`;
const CDN_LIST = `https://data.jsdelivr.com/v1/packages/gh/${REPO}@main?structure=flat`;
const TTL_MS = 60_000;

const key = (x) => x.emailHash || `${x.name}|${x.confirmedAt || ""}`;
let CACHE = null; // { at, payload }

async function fromJsdelivr() {
  const r = await fetch(`${CDN_LIST}?t=${Date.now()}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`cdn-list ${r.status}`);
  const pkg = await r.json();
  const names = (pkg.files || [])
    .map((f) => f.name)
    .filter((n) => n.startsWith("/signatures/verified/") && n.endsWith(".json"))
    .map((n) => n.slice("/signatures/verified/".length));
  if (!names.length) return []; // 空目录是合法状态（名单真空），非故障
  const settled = await Promise.allSettled(
    names.map(async (n) => {
      const r2 = await fetch(`${CDN}/${n}?t=${Date.now()}`, { cache: "no-store" });
      if (!r2.ok) throw new Error(`cdn-file ${n} ${r2.status}`);
      return r2.json();
    }),
  );
  const rows = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (!rows.length) {
    // 清一色 404 = data-api 目录清单缓存滞后（幽灵文件：清单说有、文件层已无，
    // 如清零/撤销后 12h+ 的窗口期）。通道降级但不视为名单真空——真伪由 GitHub 通道裁决。
    const all404 = settled.every((s) => / 404$/.test(String((s.reason && s.reason.message) || s.reason)));
    throw new Error(all404 ? "cdn-ghost-listing" : "cdn-all-failed");
  }
  return rows;
}

async function fromGithub() {
  // .json 过滤必须先于空判：清零后目录只剩 .gitkeep（b020ab6 保目录用），
  // 若先判 names 非空再过滤，allSettled([]) → rows 空 → 会被误判 gh-all-failed，
  // 把合法的名单真空态当成通道故障（1011 空态 502 的 GitHub 侧根因）
  const names = (await ghList("signatures/verified")).filter((n) => n.endsWith(".json"));
  if (!names.length) return []; // 无 .json = 名单真空（.gitkeep/空目录均合法），非故障
  const settled = await Promise.allSettled(
    names.map(async (n) => (await ghGet(`signatures/verified/${n}`)).content),
  );
  const rows = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (!rows.length) throw new Error("gh-all-failed");
  return rows;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const live = req.query.live === "1"; // 签名者刚签完实时查——绕过进程缓存直读上游（低频：仅 signed 页 fresh 进入触发）
  if (!live && CACHE && Date.now() - CACHE.at < TTL_MS) {
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120");
    res.setHeader("X-Covenant-Cache", "hit");
    return res.status(200).json(CACHE.payload);
  }

  const merged = new Map();
  const sources = [];
  try {
    for (const x of await fromJsdelivr()) merged.set(key(x), x);
    sources.push("cdn");
  } catch (_) { /* CDN 挂了走纯 GitHub */ }
  try {
    for (const x of await fromGithub()) merged.set(key(x), x);
    sources.push("github");
  } catch (_) { /* 限流时 CDN 结果仍完整可用 */ }

  // 空态判定：sources 非空 = 至少一个上游活着。0 条签名是合法状态（如初始化/清空后），返回 200 空名单；
  // 仅当两个通道都异常（无 source）才是真故障。
  if (!sources.length) {
    await logError(new Error("list: both channels empty"), { stage: "list" });
    return res.status(502).json({ error: "upstream_empty" });
  }

  // 白名单字段输出(隐私: 只透传名单页需要的列)
  const rows = Array.from(merged.values())
    .map(({ name, institution, role, confirmedAt, emailHash }) => ({
      name,
      institution,
      role,
      confirmedAt,
      emailHash,
    }))
    .sort((a, b) => (b.confirmedAt || "").localeCompare(a.confirmedAt || ""));

  const payload = { count: rows.length, sources, rows };
  CACHE = { at: Date.now(), payload };
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120");
  return res.status(200).json(payload);
}
