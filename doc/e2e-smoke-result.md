# e2e 冒烟结果：邮件签名全链回归护栏

- 日期：2026-09-27
- 范围：`tests/e2e-smoke.test.js`（新增）、`tests/index.js`（新增）、`lib/github.js` + `lib/monitoring.js`（仅测试缝）
- 结论：**全绿**。`node --test tests/` → 31/31 pass；`node tests/classify.test.js` → 28/28 passed；`node --check` 10 个文件全过
- 红线核对：`api/` 零改动；零新 npm 依赖（只用 `node:test` / `node:assert/strict` / `node:child_process`）；测试不触网（Resend 与观测请求全部被桩拦下）

---

## 1. 验证结果

### 1.1 任务指定命令

```
$ node --test tests/
# 28/28 passed                 ← 既有 classify.test.js（子进程内，见 §3.3）
1..31
# tests 31
# pass 31
# fail 0
EXIT=0
```

三种写法都绿，且互为等价：

| 命令 | 结果 |
|---|---|
| `node --test tests/` | 31 pass / 0 fail（含 classify 28/28） |
| `node --test tests` | 同上 |
| `node --test tests/*.test.js` | 32 pass / 0 fail（31 + classify 文件级 1 项） |
| `node tests/classify.test.js`（既有直跑方式） | 28/28 passed，未被破坏 |

> 说明：加钩子之前 `node --test tests/` 就是**红的**（`Error: Cannot find module .../tests`）——Node 22 的 `--test` 不展开目录参数，与本次改动无关，已在纯净副本上复现确认。新增 `tests/index.js` 后该命令才可用，详见 §3.3。

### 1.2 语法检查

```
$ for f in api/*.js lib/*.js tests/*.js; do node --check "$f"; done
OK   api/classify.js      OK   lib/github.js       OK   tests/classify.test.js
OK   api/confirm.js       OK   lib/monitoring.js   OK   tests/e2e-smoke.test.js
OK   api/list.js          OK   lib/qrcode.js       OK   tests/index.js
OK   api/sign.js
```

### 1.3 变异的护栏自测（证明它真能拦）

只写绿测试等于没写。对 `api/` 与 `lib/` 注入 16 处语义变异，逐个确认被捕获（在 `/tmp` 副本上做，仓内文件未受影响）：

| # | 变异 | 结果 |
|---|---|---|
| M1 | sign: 去掉 `name` 长度下限校验 | KILLED |
| M2 | sign: 关闭 email 格式校验 | KILLED |
| M3 | sign: GitHub 写失败不再返回 500（改回 200 ok） | KILLED |
| M4 | sign: 邮件失败不回滚 pending | KILLED |
| M5 | sign: 蜜罐不再静默 | KILLED |
| M6 | confirm: 非法令牌回 `expired` 而非 `invalid` | KILLED |
| M7 | confirm: 恒走 auto（绕过分级） | KILLED |
| M8 | confirm: auto 路径不删 pending | KILLED |
| M9 | confirm: 人工队列写到 `main` 而非 `pending-review` | KILLED |
| M10 | confirm: 删掉 `ghEnsureBranch` 调用 | KILLED |
| M11 | confirm: 删掉队列重试（只建分支不重试） | KILLED |
| M12 | confirm: 队列双 catch 退化为 re-throw（用户见 invalid） | KILLED |
| M13 | confirm: 队列终失败不上报 logError | KILLED |
| M14 | lib: ghPut 409 幂等短路被删 | KILLED |
| M15 | lib: ghEnsureBranch 422 race 不再视成功 | KILLED |
| M16 | lib: ghGet 404 返回 `{}` 而非 `null`；ghList 去掉 type 过滤；钩子守卫失效；logError 观察缝丢失 | KILLED（各 1 例） |

**16/16 变异全部被杀死。** 这批变异覆盖了 batch116-a 修复的每一个决策点（建分支 / 重试一次 / 终 catch 不 re-throw），因此该修复今后被静默改回去会立刻红。

---

## 2. 用例清单（31 例）

### 2.1 POST /api/sign（11 例）

| # | 用例 | 钉死的契约 |
|---|---|---|
| 1 | 非 POST | 405 `{error:"method_not_allowed"}` |
| 2 | 缺 name / name 过短 / name 过长 / 缺 email / 缺 agree | 400 `validation_failed` + `fields` 数组非空 + **一次 GitHub 都不碰** |
| 3 | email 非法 6 种（`not-an-email` / `a@b` / 含空格 / `@b.com` / `a@.com` / 尾随空格） | 400 且 `fields` 含 `email` + 不碰 GitHub |
| 4 | institution 101 字符 / role 51 字符 | 400 且点名对应字段 |
| 5 | OPTIONS 预检 | 204 + `Access-Control-Allow-Origin: *` |
| 6 | 蜜罐 `website` 命中 | 静默 200 `{ok:true}`，不埋点、不碰 GitHub、不发邮件 |
| 7 | verified 已有本邮箱 | 409 `{error:"already_signed"}` |
| 8 | 同邮箱已有 pending | 429 `{error:"already_pending"}` |
| 9 | **ghPut 抛错** | 500 `{error:"internal_error"}` + `logError` 恰好 1 次（`stage:"sign"`）+ 响应已 end + **不发邮件** |
| 10 | Resend 500 | 502 `{error:"email_send_failed"}` + logError 1 次（`status:500`）+ 不写 verified |
| 11 | happy path | 200 + pending 文件名形如 `pending/{hash}.{uuid36}.json` + 记录含 `emailHash`/`emailDomain`/`emailDomain==="example.com"` + **无明文 email** + 真的向 `api.resend.com/emails` 发出带 `Bearer` 头的 POST |

### 2.2 GET /api/confirm（13 例）

| # | 用例 | 钉死的契约 |
|---|---|---|
| 12 | 缺 t / `t="nope"` / 35 位 / 非法字符 | 302 → `status=invalid` + `lang=zh` 缺省 + 不触网 |
| 13 | 非法令牌但 `lang=en` | 302 → `status=invalid&lang=en`（lang 穿透） |
| 14 | 非 GET | 405 `method_not_allowed` |
| 15 | 无 pending、无墓碑 | 302 → `status=expired` + 只查 1 次墓碑 |
| 16 | 墓碑 `result:"auto"` 重开 | 302 → `status=ok`（不误报失效） |
| 17 | 墓碑 `result:"manual"` 重开 | 302 → `status=pending`（**非** invalid） |
| 18 | **auto 路径**（tsinghua 官方域 + 关键词） | 302 → `status=ok&lang=en` + 写 `verified/{hash}.json`（含 name/confirmedAt）+ **ghDelete pending 带 sha `p1`** + 写令牌墓碑 1 次 + 不写 pending-review |
| 19 | 令牌长度合法但 pending 中途消失（ghGet→null） | 302 → `status=invalid` + logError（不崩） |
| 20 | 读 pending 抛错（GitHub 502） | 302 → `status=invalid` + logError 1 次（`stage:"confirm"`） |
| 21 | 已 verified（重复确认） | 302 → `status=duplicate` + 清理残留 pending（message 前缀 `cleanup-dup:`）+ 不再写 verified |
| 22 | **manual 路径** | 302 → `status=pending` + 写 `pending-review` 分支 1 次（含 `reviewQueuedAt`、保留原字段）+ 不写 verified + **不删 main pending** + 不建分支 + 写墓碑 |
| 23 | **[batch116-a] 分支不存在（PUT 404）** | PUT 尝试恰好 2 次（首次 404 + 一次重试）+ `ghEnsureBranch("pending-review","main")` 恰好 1 次且**发生在重试之前** + 用户见 `status=pending` + **logError 0 次** + 写墓碑 |
| 24 | **[batch116-a] 建分支后重试仍失败** | 用户见 `status=pending`（**绝不** invalid）+ 仍尝试建分支 1 次 + 2 次 PUT + logError 恰好 1 次（`stage:"confirm-pending-review"`, `emailHash` 正确）+ 不删 main pending + 不写 verified |

### 2.3 钩子护栏自检（7 例，25–31）

这组用例把「生产默认行为不变」本身变成可执行断言——期望值即加钩子前的既有契约：

| # | 用例 | 断言要点 |
|---|---|---|
| 25 | ghGet | URL 形如 `.../contents/{path}?ref=main`、`Authorization: Bearer …`、`Accept: application/vnd.github+json`；200 解 base64；404→`null`；500→抛 `ghGet … → 500` |
| 26 | ghPut | 请求体落盘格式 `JSON.stringify(obj,null,2)`、未传 sha 时不带 sha、200→`{conflict:false,sha}`、**409→`{conflict:true}`**、5xx→抛错并带正文前 200 字符 |
| 27 | ghDelete | 请求体带 sha、204/404 静默成功、500→抛错 |
| 28 | ghList | 只保留 `type==="file"`；404→`[]` |
| 29 | ghEnsureBranch | 已存在→`{created:false}` 不发请求；不存在→以 **main 的 HEAD sha** 建 `refs/heads/pending-review`；建引用 422→`{created:false}`（race 视成功） |
| 30 | 钩子开/关 | 开启时五个导出被完全短路、**fetch 零调用**、返回值透传；关闭后立刻回到真实实现并发出真实请求 |
| 31 | 端到端不触网 | 钩子生效时跑一次 handler，`globalThis.fetch` 调用数 = 0 |

---

## 3. mock 策略

### 3.1 边界选择：为什么用 `setTestOverrides` 而不是 `node:module` mock

`api/sign.js:6`、`api/confirm.js:6` 都是 **ESM 静态 import**：

```js
import { ghGet, ghPut, ghDelete, ghList, ghEnsureBranch } from "../lib/github.js";
```

ESM 导入在模块求值时就把活绑定绑定好，之后无法从外部换掉。`node:module` 的 `register`/`mock.module` 需 `--experimental-test-module-mocks`（Node 22 仍是实验特性，会打警告），且这套仓是**零依赖 + 部署在 Vercel** 的极简项目，测试也不该为了 mock 而引入实验开关和 preload 装配。

故按任务书授权走**显式注入 + 早退守卫**：

```js
// lib/github.js
let OVERRIDES = null;                              // 生产恒 null
export function setTestOverrides(next) { OVERRIDES = next || null; }

export async function ghGet(path, branch = "main") {
  if (OVERRIDES && OVERRIDES.ghGet) return OVERRIDES.ghGet(path, branch);
  /* ↓ 以下与加钩子前逐字一致 */
```

守卫是「一次布尔判断 + 立即 return」，因此：

- **默认路径字节级不变**：原函数体一行未删、未改、未重排（`git diff lib/github.js` = 15 行纯新增，`+15/-0`）
- 不新增请求、不改默认返回值、不改默认抛错文案
- 无需重构 `api/`——`api/` 保持零改动，红线满足

### 3.2 `logError` 为什么也动了

任务书允许的改动只提到 `lib/github.js`，但「500/logError 被调」「重试也失败 → logError 被调」这两条断言要求观察 `logError`。它同样被 ESM 静态绑定，且 `--import` 捕获 `console.error` 只能看到格式化后的字符串，**拿不到 error 对象与 context**（测不出 `stage:"confirm-pending-review"`、`emailHash` 是否正确）。

因此在 `lib/monitoring.js` 加了一个**观察缝**（2 处，合计 10 行纯新增）：

```js
let TASK_HOOK = null;                                  // 生产恒 null
export function setTestLogError(onError) { TASK_HOOK = typeof onError === "function" ? { onError } : null; }

export async function logError(e, context = {}) {
  if (TASK_HOOK) TASK_HOOK.onError(e, context);        // ← 唯一新增行，观察点
  console.error("[covenant]", e, JSON.stringify(context));
  /* ↓ 以下逐字不变 */
}
```

- 变量名取 `TASK_HOOK` 而非 `TEST_HOOK`：库代码读它像设计的一部分（"任务级观察者"），不必每次都解释"这是测试专用的"
- `typeof onError === "function"` 而非直接赋值：传 `null`/非函数不会留下坏钩子
- 副作用为零：不改返回值、不改 `console.error`、不改 Sentry 分支

**净改动合计：`lib/github.js` +15、`lib/monitoring.js` +10，全部为新增行，零删除、零修改行。`api/` 与 `package.json` 未动。**

### 3.3 测试替身清单

| 组件 | 手法 | 说明 |
|---|---|---|
| `res` | 自写 `mockRes()`：`{statusCode, headers, body, redirect, ended}` + `setHeader/status/json/redirect/end` | 约 25 行。`redirect` 落成 `{code, url}` 对象便于断言目标 URL；`end()` 幂等且不写 socket，重复调用无害 |
| `req` | `mockReq({method, query, body, headers})` | Vercel 风格的 `{query, body}` |
| GitHub | `setTestOverrides` 注入 5 个桩，统一记录 `calls[]` | 默认返回值贴近真实（`ghPut`→`{conflict:false,sha:"c1"}`、`ghGet`→`{sha, content}`），断言写 `putsTo(calls, path, branch)` 之类的过滤助手 |
| Resend | 覆写 `globalThis.fetch`，只认 `api.resend.com` 前缀 | 断到 `globalThis.fetch` 而非 `undici` 内部；用原生 `Response` 对象，无需自造 |
| Sentry / PostHog | 断言「fetch 调用数」+ 模块加载时 `delete process.env.{SENTRY_DSN,POSTHOG_API_KEY,POSTHOG_HOST}` | 守住"无 env 即停用"的既有行为：这两条通道若被改动而开始外呼，用例会因 fetch 计数变化而红；反之若将来真要发上报，必须同步更新此断言 |
| `logError` | `setTestLogError` 捕获 `(error, context)`，同时静音 `console.error` 避免污染 TAP | `restore()` 同时复位钩子与 console |
| 隔离 | 每个用例 `beforeEach` 复位 fetch/钩子，`afterEach` 兜底复位 | 用例间零泄漏 |

### 3.4 `tests/index.js`（新增 24 行，任务书未提及）

`node --test tests/` 在 Node 22 里**不展开目录参数**：目录被当作模块路径解析，找不到就报 `Cannot find module .../tests`（已实测：加钩子前即如此）。要让任务书指定的那条命令真的能跑，必须有 `tests/index.js` 作为目录入口。

该文件做两件事：

1. `spawnSync` 跑 `classify.test.js`（**不能 import**：它是入口脚本，末尾 `process.exit`，会带崩整个测试进程——第一版就是这么写的，只跑出 1 个用例就被 28/28 的 classify 干掉）
2. `await import("./e2e-smoke.test.js")` 跑契约测试

结果：`node --test tests/` 与 `node --test tests/*.test.js` 等价，`node tests/classify.test.js` 的直跑方式也照旧可用。

---

## 4. 顺带被测出来的两个既有边界（非本次改动引入，记录备查）

1. **`api/confirm.js` 读 pending 抛错 → 用户看到 `invalid`**。`ghGet` 返回 `null`（文件刚被清理）时 `rec.content` 解引用抛 `TypeError`，落进外层 catch 回 `invalid`。用例 19/20 已把现状钉住，但它**不是**"链接真的失效"，对用户是误报。修法只需一处判空后回 `expired`——属业务逻辑改动，未在本批做，留给 owner 决定。
2. **pending 记录字段全缺时静默回 `duplicate`**。`emailHash = data.emailHash || hashId(data.email)` 在 `undefined` 上算出固定哈希 → 查 verified 命中 → 回 `duplicate`。数据损坏静默伪装成"已签署"，比回 `invalid` 更难排查。用例 21 覆盖了合法 duplicate，未覆盖损坏输入——修需要加显式校验，同属业务逻辑改动，未做。

---

## 5. 结论

- 邮件签名全链的 **HTTP 层契约已固化**：31 例覆盖 `/api/sign` 与 `/api/confirm` 的状态码、响应体形状、redirect 目标与 lang 穿透、GitHub 写入/删除的路径·分支·次数·顺序。
- **batch116-a（pending-review 自动建分支）已有回归护栏**：用例 23/24 钉住"建分支 → 重试一次 → 终失败不 re-throw"三点，16/16 变异全部被杀，改回去必红。
- `api/` 零改动；`lib/` 仅两处共 25 行**纯新增**的测试缝，默认关闭时行为字节级不变，并有 7 条用例把这件事本身断言住。
- 零新 npm 依赖；测试全程不出网。
- 未提交（工作区留改），按需由 owner 决定提交时机。
