# Covenant · 《智慧生命共生契约》签署系统

独立开源的公开契约签名系统。**零数据库**（GitHub 仓库即事实源）、零 npm 依赖、全免费托管。

> 系统设计文档（面向程序员）：[doc/design.md](doc/design.md)

- 契约全文：`charter/charter.md`（一次性定稿，签署开始后冻结）
- 签名档案：`signatures/verified/`（公开可核验）
- 架构：Vercel Serverless + GitHub Contents API + Resend 邮件

## 部署手册（owner 视角）

### 1. GitHub 建仓
1. 新建公开仓库 `Symy-ai/covenant`，推送本目录。
2. 从 main 拉出 `pending-review` 分支（人工审核队列用）。
3. 注册服务账号（如 `symy-sign-bot`），加入 Symy-ai 组织，对 covenant 仓库给 write 权限。
4. main 分支保护：Require PR（1 approval）；**服务账号加入 Bypass 名单**（自动放行的写入通道，Git 历史可审计）。不配 bypass，自动放行写入会 403。

### 2. 服务账号 Token
fine-grained PAT：Repository access 仅勾 covenant；Permissions 仅 **Contents: Read and write**。

### 3. Resend 发件
resend.com → Domains → 添加 `symy.ai` → 按 Cloudflare 指引加 TXT（SPF/DKIM）。
补充（2026-09-24）：根域 SPF 与 DMARC 缺失会导致 QQ 邮箱等显示"由 send.symy.ai 代发"。需在 Cloudflare 加齐三条：
- `symy.ai` TXT `v=spf1 include:amazonses.com ~all`（根域 SPF）
- `_dmarc.symy.ai` TXT `v=DMARC1; p=none; rua=mailto:covenant@symy.ai`（DMARC，过 SPF/DKIM 对齐后客户端不再显示代发）
- `resend._domainkey.symy.ai` TXT（DKIM 公钥，Resend 提供）

### 4. Cloudflare 收件
symy.ai → Email Routing → Enable → `covenant@symy.ai` → Forward 到值班人员邮箱。

### 5. Vercel 部署
导入 covenant 仓库（同一账号），环境变量（Production）：

| 变量 | 值 |
|---|---|
| GITHUB_TOKEN | 服务账号 `github_pat_...` |
| GITHUB_REPO | `symy-ai/covenant` |
| RESEND_API_KEY | Resend `re_...` |
| SENTRY_DSN | （可选）现有 Sentry 项目 DSN |
| POSTHOG_API_KEY | （可选）现有 PostHog key |

### 6. 主站集成（symy.ai/covenant）
主仓 `next.config.js` 加 rewrites（改完本地 `next build` 验证再 push——**配置写错影响主站构建**）：

```javascript
async rewrites() {
  return [
    { source: '/covenant', destination: 'https://<covenant项目名>.vercel.app/' },
    { source: '/covenant/:path*', destination: 'https://<covenant项目名>.vercel.app/:path*' },
  ];
}
```

### 7. 验证清单
- [ ] 打开 `symy.ai/covenant`：契约页+表单正常
- [ ] 提交 → 收到确认邮件 → 点击 → 显示「人工核验中」（当前为全量人工模式，见下节）
- [ ] 同邮箱重复提交 → 提示已签署
- [ ] 旧确认链接再点 → 提示已签署（幂等）

## 人工审核（每周 ~15 分钟）
> **当前模式：全量人工（2026-10-01 起）**——`review-config.js` 的 `REVIEW_ALL_MANUAL = true`，所有确认一律进人工队列、A/B/C 分级暂停。上线初期审慎运行：签名公信力优先，先人工把关跑稳；平稳期置 `false` 恢复分级（`tests/classify.test.js` 双态兼容，两种状态都应全绿）。此模式下队列积压属预期，放行节奏见下。

### 分支模型：为什么 pending-review 和 main「不一致」是常态

两个分支职责不同，**永远不必相等**：

| | main | pending-review |
|---|---|---|
| 角色 | 生产分支（Vercel 只部署它）+ 全部签名数据正本 | 人工审核工作台，只承载「已确认、待放行」的队列条目 |
| 未确认 pending | ✅ 住这里（提交即写入） | ❌ 不出现 |
| 已确认待审 | ❌ 不新增（main 的 pending 在放行前保留） | ✅ 确认邮件一点，队列条目就写入这里 |
| 代码更新 | ✅ 功能提交都在这 | 不需要（不部署、不服务流量） |

因此每次有人确认签名，pending-review 就会多一个 main 永远不会有的提交（`review-queue: ...`），每次放行又少一个——**两边 SHA 不相等恰恰是系统正常工作的样子**。判断状态是否健康，看内容不看 SHA：队列目录（`pending-review:signatures/pending/`）里有没有待放行条目、main 的数据是否完好。

⚠️ **铁律：队列非空时绝不能把 pending-review 强制对齐/重置到 main**——那会把待审签名整个擦掉。对齐只允许在队列空且确有理由时做（如 2026-10-01 修复队列路径冲突那次的基线重置）。

pending-review 分支的 `signatures/pending/` 即审核队列：核对邮箱域名/单位官网/头衔公开信息 → 合格则放行，不合格删文件并在 `REVOKED.md` 记录。

### 放行：一条命令（2026-09-30 起，必须走脚本）

```bash
node tools/approve.mjs <emailHash> --note "放行理由"
```

脚本自动完成四步（单 commit）：写 `verified/{emailHash}.json`（`review: manual-approved` 留痕）→ 删 main pending → **token 墓碑 `result: "ok"`** → 清 pending-review 队列。幂等：verified 已存在时跳过重写但补齐墓碑/队列。

**为什么必须走脚本（勿手工）**：放行是四步联动操作，2026-09-30 手工放行漏改墓碑语义（写了 `result:"ok"` 但 confirm.js 当时只认 `"auto"`），用户重开确认链接仍显示「人工核验中」。confirm.js 现已同时接受 `auto | ok` 两种墓碑终态，但脚本保证以后不会再有漏步——墓碑值、verified 格式、队列清理一处都不会错。

### 人工审核：邮箱核验 SOP（2026-09-24 起）

隐私设计：公开仓不存明文邮箱，pending/审核文件只有 `emailHash`（sha256 截 16 hex）。
邮箱归属核验走 Resend 发件记录：

1. 审核文件含 `reviewQueuedAt`（转人工时间）与 `emailHash`
2. 登录 Resend Dashboard → Emails → 搜索框直接粘贴 `emailHash`（如 `2721d36b339643a2`）——2026-09-24 起确认邮件正文带 `ref: {emailHash}` 灰字 + `X-Covenant-Hash` 邮件头，可精确检索
3. 老邮件（无 ref 标记）：按收件人域名过滤（如 `@qq.com`）+ `reviewQueuedAt` 前 1 小时时间窗 → 候选中比对 `sha256(小写邮箱).hex 截 16 位` == 文件 `emailHash`
4. 核验"邮箱域名 ↔ 申报单位/头衔"是否相称 → 合格转 verified，不合格删除 + REVOKED.md
5. 注意：Resend 发件记录保留约 30 天；超期未审的提交按无法核验处理（不通过），不保留明文回查通道

### 隐私声明（历史数据说明）

2026-09-24 前的测试期 pending 文件（git 历史中已删除的提交）含明文邮箱字段。
均为主办方内部测试数据，发现问题后已修复（公开仓不再落明文）；历史提交按"测试过程记录"保留，不做历史重写。

## 核验分级（review-config.js，改配置即生效）
- 机构邮箱域名匹配申报单位 → 自动放行
- 通用邮箱 + 无敏感头衔/机构 → 自动放行
- 其余（冒名高发组合）→ 人工审核 1-3 工作日

## 开源协议

[The Unlicense](LICENSE) —— 公共领域奉献（public domain dedication）。复制、修改、商用、闭源 fork 全部自由，无需署名。比 MIT 更宽松：连保留版权声明的要求都没有。
