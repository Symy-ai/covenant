#!/usr/bin/env node
// ============================================================
// tools/approve.mjs — 人工审核放行（一键、幂等、防漏步）
//
// 背景（2026-09-30 bug 复盘）：人工放行是四步操作（写 verified / 删 main
// pending / 更新 token 墓碑 / 清 pending-review 队列），手工逐步做极易漏
// 步或写错值——当天手写墓碑 result:"ok" 而 confirm.js 只认 "auto"，
// 导致用户重开确认链接仍显示「人工核验中」。
//
// 用法（repo 根目录）:
//   node tools/approve.mjs <emailHash> [--note "放行理由"]
//   node tools/approve.mjs 633f330d52b520ba --note "本人测试，Spark 拍板"
//
// 做什么（全流程原子化，单 commit）:
//   1. git pull main（保证在最新状态操作）
//   2. 在 signatures/pending/ 找 {emailHash}.*.json（重复提交可能多条）
//   3. 写 signatures/verified/{emailHash}.json（review: manual-approved 留痕）
//   4. 删 main 上该 emailHash 的全部 pending 文件
//   5. 每个涉及的 token 墓碑 → { result: "ok", reviewApprovedAt }
//      （confirm.js 墓碑终态值域：auto=自动确认 / ok=人工放行 → 都回成功页）
//   6. commit + push main
//   7. 清 pending-review 分支上该 emailHash 的队列文件（有才动，无则跳过）
//
// 幂等: verified 已存在 → 报告并继续做墓碑/队列清理（补齐漏步），不重写
//       （--force 强制重写 verified）
// 安全: 只按 emailHash 前缀精确匹配，绝不碰他人记录；队列分支无匹配即不动
// ============================================================
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const h = args[0];
const noteIdx = args.indexOf("--note");
const note = noteIdx > -1 ? args[noteIdx + 1] || "" : "";
const force = args.includes("--force");

if (!h || !/^[0-9a-f]{16}$/.test(h)) {
  console.error("用法: node tools/approve.mjs <emailHash(16位hex)> [--note \"理由\"] [--force]");
  process.exit(1);
}

const sh = (cmd) => execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const fail = (msg) => { console.error("✗ " + msg); process.exit(1); };

// 1. 同步 main
sh("git fetch origin main");
const head = sh("git rev-parse HEAD").trim();
const origin = sh("git rev-parse origin/main").trim();
if (head !== origin) {
  sh("git pull --rebase origin main");
  console.log("✓ 已同步 main");
}

// 2. 找 pending（重复提交可能多条）
const pendDir = "signatures/pending";
const pendings = fs.existsSync(pendDir)
  ? fs.readdirSync(pendDir).filter((f) => f.startsWith(h + "."))
  : [];
if (!pendings.length) console.log("· main 无 pending 记录（可能已清理，继续检查其余步骤）");

let name = "", institution = "", role = "";
const tokens = [];
for (const f of pendings) {
  const rec = JSON.parse(fs.readFileSync(path.join(pendDir, f), "utf8"));
  name = name || rec.name; institution = institution || rec.institution || "";
  role = role || rec.role || "";
  if (rec.token) tokens.push(rec.token);
}

// 3. verified（幂等）
const vPath = `signatures/verified/${h}.json`;
const vExists = fs.existsSync(vPath);
if (vExists && !force) {
  const old = JSON.parse(fs.readFileSync(vPath, "utf8"));
  name = old.name || name; institution = old.institution || institution; role = old.role || role;
  console.log(`· verified 已存在（${name}），跳过写入${force ? "" : "，--force 可重写"}`);
} else {
  if (!name) fail(`找不到该 emailHash 的任何记录（pending 无、verified 无）——确认 hash 是否正确`);
  fs.writeFileSync(vPath, JSON.stringify({
    name, institution, role, emailHash: h,
    confirmedAt: new Date().toISOString(),
    review: "manual-approved",
    reviewNote: note || undefined,
  }, null, 2) + "\n");
  console.log(`✓ verified 写入：${name}${institution ? " · " + institution : ""}`);
}

// 4. 删 main pending
for (const f of pendings) fs.rmSync(path.join(pendDir, f));
if (pendings.length) console.log(`✓ main pending 删除 ×${pendings.length}`);

// 5. 墓碑 → ok
//    （main pending 的 token + pending-review 队列同 emailHash 文件的 token——
//     队列文件就是 pending 文件副本。先 fetch 队列分支并记 ref，避免 FETCH_HEAD 时序坑：
//     第 1 步 fetch main 后 FETCH_HEAD=main，此时 ls-tree 拿不到队列内容——首跑实锤 bug）
let queueTokens = [];
let queueFiles = [];
try {
  sh("git fetch origin pending-review 2>/dev/null || true");
  const QUEUE = "origin/pending-review";
  queueFiles = sh(`git ls-tree -r --name-only ${QUEUE} signatures/pending/ 2>/dev/null || true`)
    .trim().split("\n").filter((f) => f && path.basename(f).startsWith(h + "."));
  for (const f of queueFiles) {
    const rec = JSON.parse(sh(`git show ${QUEUE}:${f}`));
    if (rec.token) queueTokens.push(rec.token);
  }
} catch (_) { /* 队列分支不存在或无匹配 */ }
const allTokens = [...new Set([...tokens, ...queueTokens])];
for (const t of allTokens) {
  const tPath = `signatures/tokens/${t}.json`;
  const tRec = fs.existsSync(tPath) ? JSON.parse(fs.readFileSync(tPath, "utf8")) : { emailHash: h };
  tRec.result = "ok";
  tRec.reviewApprovedAt = new Date().toISOString();
  fs.writeFileSync(tPath, JSON.stringify(tRec, null, 2) + "\n");
}
if (allTokens.length) console.log(`✓ token 墓碑 → ok ×${allTokens.length}`);

// 6. commit + push main（只提交签名数据——绝不卷入工作区无关变更，脏 commit 教训）
const changed = sh("git status --porcelain signatures/").trim();
if (changed) {
  sh("git add signatures/");
  sh(`git commit -m "review: 放行 ${h}${name ? `（${name}）` : ""}${note ? "——" + note : ""} [approve.mjs]"`);
  sh("git push origin main");
  console.log("✓ main 已推送");
} else {
  console.log("· main 无变更（幂等完成）");
}

// 7. 清 pending-review 队列（队列 ref 已在第 5 步 fetch，queueFiles 已在手）
try {
  const qlist = queueFiles;
  if (qlist.length) {
    sh("git checkout -q -B review-clean origin/pending-review");
    for (const f of qlist) sh(`git rm -q "${f}"`);
    sh(`git commit -m "review: 放行 ${h}——队列清理 [approve.mjs]"`);
    sh("git push origin HEAD:pending-review");
    sh("git checkout -q main");
    sh("git branch -q -D review-clean");
    console.log(`✓ pending-review 队列清理 ×${qlist.length}`);
  } else {
    console.log("· 队列无该记录（已是干净状态）");
  }
} catch (e) {
  try { sh("git checkout -q main"); sh("git branch -q -D review-clean 2>/dev/null || true"); } catch (_) {}
  fail("队列清理失败（main 部分已完成）：" + e.message);
}

console.log("\n放行完成 ✅  名单最坏 60s 后可见（list 进程缓存）；CDN 通道最长 12h，但 GitHub 通道实时合并。");
