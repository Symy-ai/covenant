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
- [ ] 用机构邮箱提交 → 收到确认邮件 → 点击 → 名单即时出现（自动放行）
- [ ] 用 gmail+「教授」头衔提交 → 点击 → 显示「人工核验中」（进 pending-review）
- [ ] 同邮箱重复提交 → 提示已签署
- [ ] 旧确认链接再点 → 提示已签署（幂等）

## 人工审核（每周 ~15 分钟）
pending-review 分支的 `signatures/pending/` 即审核队列：核对邮箱域名/单位官网/头衔公开信息 → 合格则把文件（改名为 `{emailHash}.json`）PUT 到 main 的 verified/（走 PR）；不合格删文件并在 `REVOKED.md` 记录。

## 核验分级（review-config.js，改配置即生效）
- 机构邮箱域名匹配申报单位 → 自动放行
- 通用邮箱 + 无敏感头衔/机构 → 自动放行
- 其余（冒名高发组合）→ 人工审核 1-3 工作日

## 开源协议

[The Unlicense](LICENSE) —— 公共领域奉献（public domain dedication）。复制、修改、商用、闭源 fork 全部自由，无需署名。比 MIT 更宽松：连保留版权声明的要求都没有。
