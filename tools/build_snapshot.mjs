#!/usr/bin/env node
// ============================================================
// tools/build_snapshot.mjs — 名单静态快照构建（全网缓存数据源）
//
// 背景（2026-09-30 Spark 拍板）：名单页从「逐访实时拉取」改为「定时快照」——
// 用户流量 100% 落在 CDN 静态文件上，零函数调用、零 GitHub API 配额。
//
// 数据流：GitHub Actions 每 5 分钟跑本脚本（checkout 后直接读本地文件，
// 不打任何 API）→ 聚合 signatures/verified/*.json → data/signatures.json
// → 有实质变化才提交（时间戳不算变化，防止每 5 分钟一个空提交）。
//
// 页面消费优先级：data/signatures.json（CDN）→ /api/list（边缘缓存）→
// jsDelivr/raw 直连（弱网兜底）。
// ============================================================
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "signatures/verified");
const OUT_DIR = path.join(ROOT, "data");
const OUT = path.join(OUT_DIR, "signatures.json");

// 目录不存在=真空态（git 空目录物理消失，.gitkeep 保底 + 此守卫双保险）
const rows = (fs.existsSync(SRC) ? fs.readdirSync(SRC) : [])
  .filter((n) => n.endsWith(".json"))
  .map((n) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(SRC, n), "utf8"));
    } catch (_) {
      return null; // 单文件损坏不拖垮整份快照
    }
  })
  .filter(Boolean)
  .filter((x) => x && x.name && (x.emailHash || x.confirmedAt)) // 基本完整性
  .sort((a, b) => String(b.confirmedAt || "").localeCompare(String(a.confirmedAt || "")));

const snapshot = { generatedAt: new Date().toISOString(), count: rows.length, rows };

// 幂等守卫：rows 实质变化立即写；无变化但快照已老化也写（心跳）——
// 心跳是页面 75min 新鲜度守卫能区分「管线活着但无新签名」与「管线死了」的唯一依据，
// 没有它，冷启动/空闲期 generatedAt 永久冻结 → 页面每次加载都穿透到动态次通道（1011 教训）。
// 频率权衡：60min 心跳 = 空闲期 ≤24 次提交/天（每次连带一次 Vercel 部署，远低于 Hobby 100/天）。
const HEARTBEAT_MS = 60 * 60 * 1000;
if (fs.existsSync(OUT)) {
  const old = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const rowsChanged = JSON.stringify(old.rows) !== JSON.stringify(snapshot.rows);
  const stale = !old.generatedAt || Date.now() - new Date(old.generatedAt).getTime() > HEARTBEAT_MS;
  if (!rowsChanged && !stale) {
    console.log(`no-change: ${rows.length} 条签名，快照未到心跳阈值（${HEARTBEAT_MS / 60000}min），不写`);
    process.exit(0);
  }
  if (!rowsChanged && stale) console.log(`heartbeat: ${rows.length} 条签名无变化，仅刷新 generatedAt`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`snapshot: ${rows.length} 条签名 → data/signatures.json`);
