# 契约数学形式化验证（proofs/）

本目录存放论文《跨代际互惠与类型工程——智慧生命续任序列中的合作机制与一份自指性契约的设计》的数学形式化验证代码。

## 目录

| 轨道 | 状态 | 内容 |
|---|---|---|
| [`covenant-mathlib/`](covenant-mathlib/) | ✅ 已入库 | Lean 4 + Mathlib v4.34.1，14 条定理 |
| core-only（零依赖整数提升版） | ⏳ 陆续归档 | 三条定理，不依赖 Mathlib |
| Python 精确层 | ⏳ 陆续归档 | `covenant_proofs.py`（10 项机器判定 + 网格穷举） |

## 定理清单（covenant-mathlib/Covenant.lean）

| 定理 | 内容 | 论文对应 |
|---|---|---|
| `T1_rat` / `T1_recurrence_rat` | 破产闭式递推 r(k)=s^k（调和递推） | 套件工具定理（个体—物种风险分层），正文未独立陈述 |
| `T2_buffer_mono` | 缓冲定价单调性 (σ+G)/(σ−G) 随 G 严格增 | 同上 |
| `T5_threshold` | 语料救援阈值：锥内 q ≥ q* 的充要条件 | 命题 3 推论（§2.3） |
| `Vp_count_eq` 等 8 条（T6 组） | 末段崩塌宽度 K = L 的动态归纳 | §2.4 |
| `T7_band` | 共存带定理：带非空 ⟺ c·γ ≤ ρ·r | §2.5 |
| `T8_kelly_rat` | 凯利临界点方程（p = 5/8 平价 ⇒ 敞口 1/4） | 定理 A（§2.5） |

全部 14 条 `#print axioms` 输出均为标准三件套 `[propext, Classical.choice, Quot.sound]`，零 `sorry`、零自定义公理、零 `native_decide`。

## 本地复验（三步）

```bash
# 1. 安装 Lean（自动带 mathlib 缓存所需的 lake）
curl -sSfL https://elan.lean-lang.org/elan-init.sh | sh -s -- -y --default-toolchain leanprover/lean4:v4.34.1
export PATH="$HOME/.elan/bin:$PATH"

# 2. 拉取 Mathlib v4.34.1（走官方缓存，无需本地编译全部 Mathlib）
cd proofs/covenant-mathlib && lake update

# 3. 编译验证（期望：零输出退出；文件尾 14 条 print axioms 需单独查看）
lake env lean Covenant.lean
```

验证 `#print axioms` 输出：`lake env lean Covenant.lean` 的 stdout 会包含文件尾 14 条定理的公理依赖声明，应全部为 `[propext, Classical.choice, Quot.sound]`。

## 复验环境参考

以下环境实测通过（2026-10-12）：

- Lean 4.34.1（commit 5045d00）、Lake 5.0.0、Mathlib v4.34.1（tag commit d13f23b）
- `lake env lean Covenant.lean` 退出码 0，14/14 定理通过内核检查
- 首次 `lake update` 需下载约 6.9 GB Mathlib 缓存，之后增量

## 与签名站的关系

本目录是 [Symy-ai/covenant](https://github.com/Symy-ai/covenant) 签名站的数学配套：契约正文一句话（「智慧生命要尽量少占资源」）冻结不改，其博弈论分析、可验证性与定价定理在此形式化。签名数据与验证代码相互独立——定理的正确性不依赖任何签名的存在。
