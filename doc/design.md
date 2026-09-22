# 《智慧生命共生契约》系统设计文档

> 面向维护者/贡献者的设计说明。只讲设计，不讲代码。

## 1. 系统定位

公开契约签名墙：双语契约页 + 邮箱确认签署 + 实时可核验的公开名单。

三条硬约束贯穿全部设计：

1. **公信力**：签名记录可被任何第三方独立核验，不可被平台方悄悄篡改
2. **零成本**：全免费额度内运行（托管、邮件、观测）
3. **零依赖**：不引入 npm 依赖，供应链风险面为零，随拿随维护

## 2. 架构总览

```
浏览器
  │  https://symy.ai/covenant/*          （主站反代，Next.js rewrites）
  │  https://covenant-blond-gamma.vercel.app （直连域）
  ▼
静态页（4 个 HTML + i18n.js，纯 fetch）
  │ 签署表单 POST ──────► /api/sign    ──► GitHub Contents API ──► signatures/pending/
  │ 确认链接 GET ───────► /api/confirm ──► 分级核验 ──► signatures/verified/ 或 pending-review 分支
  │ 名单页 GET ─────────► /api/list    ──► 服务端聚合 jsDelivr CDN + GitHub API
  ▼
GitHub 仓库 Symy-ai/covenant（唯一事实源）
```

- 三个 Serverless Function 部署在 Vercel，静态页同域同源
- 邮件通道：Resend（确认邮件）
- 观测：Sentry（错误）+ PostHog（漏斗），直调最小 API，均为可选

## 3. 核心设计决策

### D1 GitHub 仓库即数据库
签名公信力的本质是"公开、可独立核验"。GitHub 仓库的公开历史即审计日志，任何人对签名数据有疑问可直接查 raw 文件与提交历史。附带收益：零运维、零费用。代价：无事务保证——用"文件名幂等 + 已存在即拒绝"补偿（见 §6）。

### D2 零 npm 依赖
全部逻辑 = 原生 fetch + node:crypto。收益：部署秒级冷启动、无供应链攻击面、升级零负担。代价：观测层手写（Sentry/PostHog 的最小 REST 调用约 100 行，已封装为尽力而为模式，上报失败不影响业务）。

### D3 签署确认 = 邮箱所有权证明
表单提交不直接上墙，先落 pending 并发一次性令牌确认邮件。用户点击邮件按钮才完成签署。这挡住了无邮箱的机器人提交，并让每个签名背后有一个真实可回收邮箱。

### D4 分级核验（自动放行 + 人工队列）
不是全人工也不是全自动，按冒名风险三档分级（规则配置与代码分离，业务人员可维护）：

| 档 | 条件 | 路径 |
|---|---|---|
| A | 机构邮箱域名与申报单位关键词匹配（如 tsinghua.edu.cn + 清华） | 自动上墙 |
| B | 通用邮箱（gmail/qq 等）且无敏感机构词、无敏感头衔词 | 自动上墙 |
| C | 其余一切（机构词+通用邮箱、敏感头衔、未知域名） | 人工审核队列 |

设计取向：**宁可人工，宁可漏放慢，不可错放大佬**。重点邀约对象提前把机构域名补进 A 档配置，其签署即点即生效。

### D5 名单数据同源聚合端点
主站 symy.ai 全站 CSP 的 connect-src 不含 jsdelivr/github 域名，前端直连这些域会被浏览器拦截（直连域无 CSP 所以正常）。因此名单页不从前端跨域拉数据，统一走同源 /api/list 服务端聚合：

- 通道① jsDelivr CDN（秒开底座，最多滞后 12h）
- 通道② GitHub Contents API（token 实时增量）
- 两通道 Map 按 emailHash 去重合并；单通道挂掉不影响可用性
- 进程内 60s 缓存 + 响应 Cache-Control，防高频刷穿上游

教训沉淀：**凡是挂在主站代理路径下的页面，数据一律走同源 api/\*，前端不做跨域 fetch。**

### D6 自研 126 行 i18n
站点就 4 个页面，双语字典一个文件解决。语言检测优先级：URL ?lang → localStorage → 浏览器语言。确认邮件语言跟随签署页语言，并穿透整个确认→重定向链路。

## 4. 数据模型

存储即文件，文件名即索引：

| 路径 | 生命周期 | 字段 |
|---|---|---|
| signatures/pending/{emailHash}.{token}.json | 提交时写，确认/过期清理 | 姓名、单位、头衔、邮箱、令牌、提交时间 |
| signatures/verified/{emailHash}.json | 确认后永久（正文冻结同理，不删不改） | 姓名、单位、头衔、emailHash、确认时间 |
| pending-review 分支 | 人工队列 | pending 记录 + 入队时间 |

- emailHash = 邮箱（小写）SHA-256 前 16 hex
- **verified 文件名 = emailHash** → 一人一签的查重就是一次文件存在性检查
- pending 文件名带 emailHash 前缀 → 同邮箱防刷扫描无需读文件内容
- 隐私红线：verified 记录不含明文邮箱；名单 API 只透传展示所需列；分析平台只收 emailHash

## 5. 关键流程

**签署**：表单校验（含蜜罐）→ verified 查重（已签 → 409）→ pending 防刷（同邮箱待确认 → 429）→ 写 pending → 发确认邮件 → 邮件失败回滚 pending（不留死数据）。

**确认**：令牌格式校验 → 在 pending 目录按令牌后缀精确匹配文件（令牌一次性：确认后文件即删）→ 幂等检查（已 verified → duplicate）→ 分级核验 → auto：写 verified + 删 pending；manual：写入 pending-review 分支转人工。全程带 lang 穿透，redirect 落到双语结果页。

**名单**：/api/list 双通道聚合（见 D5）→ 按 emailHash 去重 → 白名单字段输出 → 按确认时间倒序。

## 6. 反滥用设计

| 手段 | 机制 | 对抗目标 |
|---|---|---|
| 蜜罐字段 | 隐藏 input 有值 = 机器人，静默返回成功（不埋点，静默即安全） | 脚本机器人 |
| 一人一签 | verified/{emailHash} 存在性检查 | 重复签署/刷榜 |
| pending 防刷 | 同邮箱已有待确认令牌 → 429 | 短时间轰炸 |
| 令牌一次性 | 确认即删 pending 文件；令牌不可猜（UUIDv4） | 重放、枚举 |
| 分级核验 C 档 | 冒名风险特征全进人工队列 | 大佬冒名 |

已知限制：GitHub Contents API 无事务，两人并发确认同一邮箱存在小窗口竞态——但两个 verified 文件名相同，最后写者胜，结果仍收敛于"一人一签"。

## 7. 环境变量

| 变量 | 作用 | 缺省行为 |
|---|---|---|
| GITHUB_TOKEN | 服务账号 fine-grained PAT（Contents RW） | 必配，缺省 API 全挂 |
| GITHUB_REPO | 仓库坐标，默认 symy-ai/covenant | 有默认值 |
| RESEND_API_KEY | 确认邮件发送 | 必配，缺则提交后回滚报错 |
| SENTRY_DSN | 错误上报 | 留空自动停用（仍有 Vercel 日志） |
| POSTHOG_API_KEY / POSTHOG_HOST | 漏斗事件 | 留空自动停用 |

## 8. 部署与域名

- push main → Vercel 自动部署（约 30-60s）；API 函数上限 60s（vercel.json）
- 主站 symy.ai/covenant 由 Symy 主仓 Next.js beforeFiles rewrites 反代到本站，主站 push 后自动跟随
- 主站 CSP 教训见 D5：任何新页面数据必须走同源 API

## 9. 运维手册

- **人工审核**：扫 pending-review 分支；该分支不可用时退化为主仓 pending 目录扫表（确认页提示 1-3 个工作日）。审核通过 = 把记录以标准格式提交到 main 的 signatures/verified/
- **规则维护**：review-config.js 是纯业务配置（域名表/敏感词表），push main 约 30s 生效，无需动代码
- **事件漏斗**（PostHog）：sign_submitted / sign_rejected / email_failed / confirm_success / confirm_error / confirm_duplicate——提交到确认的转化率是核心健康指标
- **内容冻结**：契约正文"智慧生命要尽量少占资源。"自签署开启即冻结，任何改动都不允许（含错别字）；阐释类内容可调，但需在冻结行留透明记录

## 10. 目录速览

```
index.html        签署页（表单+备注）
charter.html      契约全文页
signatures.html   公开名单页
signed.html       确认结果页（极简状态页）
i18n.js           双语字典+语言检测
api/              sign（提交）/ confirm（确认分级）/ list（名单聚合）
lib/              GitHub API 封装 / 观测层
charter/          契约正文的 markdown 源
review-config.js  分级核验业务配置
doc/              设计文档
LICENSE           The Unlicense（公共领域）
```
