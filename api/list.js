// ============================================================
// GET /api/list — 签名墙数据聚合（同源端点）
// 背景: 主站 symy.ai 全站 CSP 的 connect-src 未含 jsdelivr/github 域名,
//      名单页在主站代理路径下所有前端数据 fetch 均被浏览器拦截(直连域正常)。
//      服务端聚合不受浏览器 CSP 约束 → 主站/直连两域统一走此同源端点。
// 通道: ① jsDelivr CDN(秒开底座, 最多滞后12h) ② GitHub API(token 实时增量) 合并去重
// 缓存: 进程内 60s + 响应 Cache-Control(边缘), 防高频刷穿上游
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
  if (!names.length) throw new Error("cdn-empty");
  const settled = await Promise.allSettled(
    names.map(async (n) => {
      const r2 = await fetch(`${CDN}/${n}?t=${Date.now()}`, { cache: "no-store" });
      if (!r2.ok) throw new Error(`cdn-file ${n} ${r2.status}`);
      return r2.json();
    }),
  );
  const rows = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (!rows.length) throw new Error("cdn-all-failed");
  return rows;
}

async function fromGithub() {
  const names = await ghList("signatures/verified");
  if (!names.length) throw new Error("gh-empty");
  const settled = await Promise.allSettled(
    names
      .filter((n) => n.endsWith(".json"))
      .map(async (n) => (await ghGet(`signatures/verified/${n}`)).content),
  );
  const rows = settled.filter((s) => s.status === "fulfilled").map((s) => s.value);
  if (!rows.length) throw new Error("gh-all-failed");
  return rows;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  if (CACHE && Date.now() - CACHE.at < TTL_MS) {
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60");
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

  if (!merged.size) {
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
  res.setHeader("Cache-Control", "public, max-age=30, s-maxage=60");
  return res.status(200).json(payload);
}
