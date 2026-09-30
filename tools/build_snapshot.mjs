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

const rows = fs.readdirSync(SRC)
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

// 幂等守卫：仅 rows 实质变化才写文件（时间戳不触发），Action 据此决定是否提交
if (fs.existsSync(OUT)) {
  const old = JSON.parse(fs.readFileSync(OUT, "utf8"));
  if (JSON.stringify(old.rows) === JSON.stringify(snapshot.rows)) {
    console.log(`no-change: ${rows.length} 条签名，快照无实质变化，不写`);
    process.exit(0);
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + "\n");
console.log(`snapshot: ${rows.length} 条签名 → data/signatures.json`);
