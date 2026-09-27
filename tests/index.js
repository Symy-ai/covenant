// tests/index.js —— 单一测试入口（零依赖，仅 node: 内置）
//
// 为什么存在：`node --test tests/` 不展开目录参数，只有存在 tests/index.js 时
// Node 才把它当入口；没有它时无论目录里有什么都会报 "Cannot find module tests"
// （与本次新增文件无关，加钩子前即如此，已实测）。
//
// 于是两种写法等价：
//   node --test tests/            ← 目录入口（本文件）
//   node --test tests/*.test.js   ← shell 展开，classify 的 process.exit 不影响别的进程
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// classify.test.js 是自研 runner（入口脚本 + 末尾 process.exit），不能 import——
// 它会带崩整个测试进程。改用子进程跑，并按退出码传递成败。
const legacy = spawnSync(process.execPath, [fileURLToPath(new URL("./classify.test.js", import.meta.url))], {
  stdio: "inherit",
});
if (legacy.status !== 0) {
  console.error(`tests/classify.test.js 失败（退出码 ${legacy.status}）`);
  process.exitCode = 1;
}

// 契约测试：node:test 原生
await import("./e2e-smoke.test.js");
