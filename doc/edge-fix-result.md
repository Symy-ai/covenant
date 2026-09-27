# b122 · confirm.js 两处边界 bug 修复结果

> 起点：`doc/e2e-smoke-result.md` §4「顺带被测出来的两个既有边界」。
> 状态：**已修复并固化护栏**，`node --test tests/` 35/35 全绿（31 + 4），零新依赖。
> 未提交（工作区留改），按需由 owner 决定提交时机。

---

## 0. 先核实：这两条路径原先真的是什么样

任务书把根因描述为「ghGet 吞错返回 null」。逐行读源码后结论是**部分成立、需要分开修**：

| 故障形态 | 修复前 `lib/github.js` 的行为 | 修复前 `api/confirm.js` 的用户所见 |
|---|---|---|
| HTTP 5xx / 4xx（403/429/…） | `throw new Error("ghGet … → 500")`（**没有**吞错，已 throw） | 被外层 catch 一律 `status=invalid`「链接已失效」 |
| 传输层（DNS/超时/连接重置） | fetch 自身 reject，原生 `TypeError: fetch failed` 冒到 confirm | 同上 `status=invalid` |
| 404（文件真不在） | `return null` | `rec.content` 解引用 `TypeError` → `invalid` |

即：**HTTP 层错误本来就没被吞**（`!r.ok → throw`，`lib/github.js:40` 原行），但 `throw` 之后 `confirm` 只有一个 catch，无条件回 `invalid`——所以症状与「吞错」完全一样。真正的吞错在第三种：**传输层 reject 直接绕过 ghGet 的错误规范**，冒出一条不含路径、不含状态码的原生错，调用方无从判断是网络还是文件不存在。

修法因此是三处而非两处：**库层把传输层错误也规范化抛出并带 `status` → confirm 按「抛错 / 读空 / 数据坏」三分流**。

---

## 1. 边界一：上游故障被谎报成「链接已失效」

### 根因

`ghGet` 对 5xx 抛的错不带状态码（只有文案里的数字），传输层 reject 更是连错都不带；`confirm` 的外层 catch 把**一切**异常收敛成 `redirect("invalid")`。用户在邮箱里点合法链接，GitHub 抖一下 → 看到「链接无效 / 确认链接不正确或已失效，请重新提交」——**手里明明有有效链接，却被劝去重填一遍表单并制造第二个 pending**。

### 修法

**`lib/github.js`（+13 行）**

```js
let r;
try { r = await fetch(...); }
catch (e) {
  const err = new Error(`ghGet ${path} → network error: ${(e && e.message) || e}`);
  err.status = 0;          // 网络层故障：0（非 HTTP 状态）
  err.cause = e;           // 原生错挂 cause，栈不丢
  throw err;
}
if (r.status === 404) return null;          // 唯一允许 null 的情形
if (!r.ok) { const err = new Error(`ghGet ${path} → ${r.status}`); err.status = r.status; throw err; }
```

404 语义不变、非 404 一律抛（带 `status` 供上层分流）。**其它调用方的承受力已逐一核实**：

- `api/sign.js:136` `catch → logError → 500 internal_error`：本来就吃 throw，行为零变化。
- `api/list.js:46` 在 `Promise.allSettled` 里，异常被过滤成"该行不展示"，本就设计如此。
- `api/confirm.js` 下面 §2 分流。

**`api/confirm.js`（读 pending 处）**——三分流：

```js
let rec = null;
try { rec = await ghGet(`signatures/pending/${fileName}`); }
catch (e) {                                  // ① 上游故障
  await logError(e, { stage: "confirm-pending-read", token, fileName });
  return res.redirect(302, redirect("error", req.query.lang));   // 「系统繁忙」，不催重填表单
}
if (!rec || !rec.content || typeof rec.content !== "object") {   // ② 真读空（404 竞态/未提交）
  await logError(new Error("pending_read_empty"), { stage: "confirm-pending-read", token, fileName });
  return res.redirect(302, redirect("invalid", req.query.lang));  // 保持既有语义，不回归
}
```

外层兜底 catch 的 `invalid` 一并改成 `error`（未知异常同样不该谎称链接失效）。

**`signed.html` + `i18n.js`（+1 / +2 行，必要配套）**
`signed.html:57` 的 `M` 映射与 `M[s] || M.invalid` 兜底意味着：**不注册 `error` 状态，用户就仍然看到「链接无效」**——这正是本 bug 要消灭的那句话。故新增 `error: {icon:"🔧", title:"errTitle", desc:"errDesc"}` 与中英文案（`errDesc` 明确写"您的确认链接仍然有效……无需重新提交"，与"请重新提交"的 `expDesc` 语义切开）。这属必要配套，不改任何既有状态分支。

---

## 2. 边界二：pending 字段缺失时静默伪装成「已签署过」

### 根因

`const emailHash = data.emailHash || hashId(data.email)` 在 `data.email` 为 `undefined` 时照样算出**一个格式完全合法的 16 位十六进制哈希**（`hashId(undefined)` = `String("undefined")` 的 sha256 前缀）。接着 `ghGet(signatures/verified/{该哈希}.json)` 几乎必然命中某条记录（首个数据损坏的用户就能撞上，命中率高得离谱）→ 回 `status=duplicate`「此邮箱已完成签署」。

三重危害：① 用户的签名**永远不会**进 verified，也没进人工队列，**彻底静默丢失**；② 页面明示"无需重复确认"，用户不会重试；③ 事后排查时看到的是"已签署过"，与真实的 `confirm_malformed` 事件毫无关联，最难定位。

### 修法

```js
const hasIdentity = Boolean(data.emailHash || data.email);
const emailHash = hasIdentity ? data.emailHash || hashId(data.email) : "";   // 不再对 undefined 求哈希
const missing = [];
if (!data.name) missing.push("name");
if (!hasIdentity) missing.push("emailHash/email");
if (missing.length) {
  await logError(new Error("pending_malformed"),
    { stage: "confirm-malformed-pending", token, fileName, missing });
  await queueReview({ ...data, reviewQueuedAt: new Date().toISOString() },
    data.name || `unknown(${fileName})`, fileName, emailHash);   // 复用 ghEnsureBranch 入队路径
  if (emailHash) { await ghPut(`signatures/tokens/${token}.json`, {...result:"manual"}); }
  return res.redirect(302, redirect("pending", req.query.lang));
}
```

- **不查重**（损坏数据不进 `already` 分支）→ 从根上杜绝 duplicate；
- **不入 auto**（`classify` 在校验之后调用）→ 损坏数据不会带着空 `name` 上墙；
- **转人工**：与 `manual` 同一套入队路径，人工从 `reviewQueuedAt` + 原字段判读；用户见 `pending`「已收到，人工核验中」，与"待核验"事实相符；
- `emailHash` 来源保留 `email`（旧记录形态）——否则"缺 emailHash"会把**所有**带明文邮箱的历史记录误判成损坏。

**顺带重构**（零行为变化）：原 manual 分支那段「`.catch(建分支).catch(上报)`」双层 Promise 链抽成模块级 `queueReview(record, label, fileName, emailHash)`，两条路径共用：

```js
for (let attempt = 1; ; attempt++) {
  try { return await put(); }
  catch (e) {
    if (attempt === 1) { await ghEnsureBranch("pending-review"); continue; }
    await logError(e, { stage: "confirm-pending-review", emailHash });
    return;                                   // 终失败不 re-throw：main pending 原件保留，人工扫表兜底
  }
}
```

两次尝试上限、ensure→retry 顺序、`stage:"confirm-pending-review"` 上报点全部逐字保留——已用 batch116-a 的两条既有用例钉住（用例 23/24 断言 attempts==2、ensure 恰好 1 次且在重试前、终失败 logError 恰好 1 次）。

---

## 3. 用例清单（`node --test tests/`：31 → **35**）

| # | 用例 | 钉住的断言 |
|---|---|---|
| 20 | **改** 读 pending 抛错（GitHub 5xx） | `status=error` 且 `not status=invalid`、`lang=en` 穿透、logError 1 次 `stage:"confirm-pending-read"`（原用例断言 `invalid`，是这次 bug 的化石记录，已按新契约改写） |
| 21 | **新** `[b122]` 读 pending 遇网络层故障 | `status=error`、`not invalid`、`not expired`、logError 1 次且带 `fileName`；**后续 ghGet 全部指向 `signatures/pending/`**（故障后绝不查 verified——那正是可能误判 duplicate/放行的入口）、ghPut/ghDelete 零次 |
| 22 | **新** `[b122]` pending 缺 name | `not status=duplicate`、`status=pending`、**未对 `hashId(undefined)` 发过 verified 查询**、logError 1 次 `message:"pending_malformed"` / `stage:"confirm-malformed-pending"` / `missing:["name","emailHash/email"]`、写 `pending-review` 恰好 1 次（含 `reviewQueuedAt`、保留 `institution`）、不删 pending、不写 verified、无身份来源则不写墓碑 |
| 23 | **新** `[b122]` pending 读不到（真 404） | `status=invalid`、`not status=error`、logError ≥1、零写入（**老行为不回归**） |
| 24 | **新** 护栏·ghGet `[b122]` 库层契约 | fetch reject → 抛 `ghGet … → network error: fetch failed` 且 `status===0`、`cause instanceof TypeError`、`fetch` 确实被调用 1 次（不是提前短路）；503 → 抛且 `status===503`；404 → 仍 `null` |

用例 22 用真实哈希 `hashId(undefined)` 造桩——旧实现正是拿它去撞 `verified`，桩里预置了那条"已签记录"，所以旧代码跑这条必然回 `duplicate`（变异实测确认，见 §4）。

### 变异测试：四处回退全部被杀

| 回退方式 | 失败用例 |
|---|---|
| ① 故障重定向改回 `invalid` | 20、21 红 |
| ② 损坏 pending 不校验（回落旧逻辑） | 22 红 |
| ③ `ghGet` 传输层错误吞成 `return null` | 24 红 |
| ④ 404 也抛错 | 24、29、34 红 |

改回去必红，护栏有效。**35/35 全绿**（含 classify.test.js 16 例经 `tests/index.js` 子进程）；`node --check` 9 个文件全过；`package.json` 零改动（零新依赖）。

---

## 4. 影响面与红线核对

- **`api/sign.js` 零改动**（`git diff --stat` 无此文件），业务逻辑未动 ✅
- **verified / pending-review 主路径未变**：auto 路径、`duplicate` 幂等、manual 入队（含建分支重试与终失败不 re-throw）逐行保留，既有用例 18/21/22/23/24 全绿未改 ✅
- **零新依赖**：`package.json` 零 diff ✅
- **`api/list.js` 零改动**：`allSettled` 对新增 `status/cause` 字段无感 ✅
- **行为变更面（主动告知）**：
  1. `status=invalid` 现在的触发面**收窄**为「令牌格式非法」+「pending 竞态读空」；「GitHub 侧故障」全部走新的 `error`。
  2. 兜底 catch 由 `invalid` 改 `error`（未知异常不谎称链接失效）。
  3. pending 字段缺失的用户从（大概率）"已签署过"改为"人工核验中"——**这是修复，不是回归**：原路径下这些签名其实一份都没生效。
  4. `signed.html` 新增一个状态分支（`error`），其余五个状态与 `s === "ok"` 的分享区逻辑未动。

**部署注意**：`signed.html` 与 `i18n.js` 是静态资源，与 `api/confirm.js` 需**同批发布**——若只发函数不更新页面，`error` 会命中 `M[s] || M.invalid` 兜底，页面仍显示旧的「链接无效」文案（服务端行为正确，用户文案不更新）。

## 5. 改动清单

| 文件 | 规模 | 内容 |
|---|---|---|
| `lib/github.js` | +21/-4 | `ghGet` 传输层错误规范化抛出 + `status`/`cause`；404→null 与 200 行为不变 |
| `api/confirm.js` | +62/-22 | 读 pending 三分流（故障 `error` / 读空 `invalid`）；pending 完整性校验 → 转人工 + `logError(confirm-malformed-pending)`；抽出 `queueReview` 供两路径共用；兜底 catch 改 `error` |
| `tests/e2e-smoke.test.js` | +141/-6 | 改写用例 20，新增用例 21–24（4 例） |
| `signed.html` | +1 | `error` 状态映射（否则回退「链接无效」） |
| `i18n.js` | +2 | `errTitle`/`errDesc` 中英文案 |
| `doc/edge-fix-result.md` | 新增 | 本文件 |

**无失败项**：四个变异全部被护栏捕获，无跳过的断言，无 TODO 遗留。
