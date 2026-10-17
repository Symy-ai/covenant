# 契约数学形式化验证（proofs/）

论文《跨代际互惠与类型工程——智慧生命续任序列中的合作机制与一份自指性契约的设计》（黄彩龙，清华大学，2026）的数学形式化验证代码。

> **DOI（Zenodo 归档）**：概念 DOI [10.5281/zenodo.23308013](https://doi.org/10.5281/zenodo.23308013)——引用本仓库整体时使用，永远指向最新版本；各版本归档 DOI 见 [Zenodo 版本历史](https://zenodo.org/records/23308013/versions/)。**v1.4**（源码 31 条定理 + 双语论文 v1.6 二轮审稿修订 + 正典读法双语 + 可检验预测工件 covenant-sft/covenant-bench + 估计链脚本 v1.6 含 γ 负值与支付域弹性 + 完整构建日志）为当前推荐引用版本；v1.5 预告（T4 组 36 条定理已进 live 仓库，随下版归档）：[10.5281/zenodo.23430646](https://doi.org/10.5281/zenodo.23430646)（Zenodo 版本 v10，Publication / Preprint 类型，13 keywords，CC BY-NC-SA 4.0）。历史版本：v1.3（论文 v1.5 + 估计链入归档 + print-axioms 31/31）：[10.5281/zenodo.23423130](https://doi.org/10.5281/zenodo.23423130)（版本 v9）；v1.2（31 条定理 + 论文 v1.4，不含估计链脚本与构建日志）；v1.1（论文 v1.3）：[10.5281/zenodo.23308935](https://doi.org/10.5281/zenodo.23308935)。
>
> [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23308013.svg)](https://doi.org/10.5281/zenodo.23308013)
> [![Lean CI](https://github.com/Symy-ai/covenant/actions/workflows/lean-ci.yml/badge.svg)](https://github.com/Symy-ai/covenant/actions/workflows/lean-ci.yml)

## 目录结构

| 路径 | 内容 | 验证状态 |
|---|---|---|
| [`covenant_proofs.py`](covenant_proofs.py) | Python 精确验证套件：10 项定理机器判定 + 3159 组网格穷举（纯 `fractions.Fraction`，零浮点） | ✅ 2026-10-12 实跑 10/10 通过 |
| [`covenant-mathlib/`](covenant-mathlib/) | Lean 4 + Mathlib v4.34.1 轨：36 条定理（T1/T2/T5/T6 组/T7/T8 + **T3 概率组**：乘积游走测度、物种层 Hoeffding 尾界 T3_species、个体层柱集定理 T3_individual、数值实例 + **T4 代际塌约定理组（命题 1 的 Lean 化，v1.7 前置落地 2026-10-17）**：逐轮严格占优 T4_domination、后向归纳弱/强主定理 T4_unravel_le/strict（任意 T 的归纳证明，Python 层 T=50 穷举的严格一般化）、合作剩余闭式 T4_surplus） | ✅ 编译通过，公理基底标准三件套 |
| [`covenant-core/`](covenant-core/) | Lean 4 core-only 轨：3 条定理整数提升版，仅 `import Init` 零依赖 | ✅ 编译通过，公理基底 [propext, Quot.sound] |
| [`结构级嵌入建议书.docx`](结构级嵌入建议书.docx) | 论文 §5 配套工程文档：三层数据/评估/续签的具体嵌入建议 | 论文引用件 |

## 定理与论文对应

| 定理 | 内容 | 论文位置 | 轨道 |
|---|---|---|---|
| `T1_recurrence` / `T1_rat` | 破产闭式递推 r(k)=s^k（递推核；极限步骤·截断收敛在 Python 精确层完成） | 套件工具定理（个体—物种风险分层），正文未独立陈述 | core / mathlib |
| `T3_species` / `T3_individual` | 物种层尾界 P{Σω≤0} ≤ exp(−m(2p−1)²/2)；个体层柱集测度恰为 (1−p)^k | 附录 A（v1.3 增补），正文未独立陈述 | mathlib |
| `T2_buffer_mono` | 缓冲定价单调性 (σ+G)/(σ−G) 随 G 严格增 | 同上 | mathlib |
| `T5_threshold` | 语料救援阈值：锥内 q ≥ q* 充要条件，q* = ℓ/(a+ℓ−(1−δ)b) | 命题 3 推论（§2.3） | mathlib |
| `Vp_count_eq` 等 8 条 | 末段崩塌宽度 K = L 的动态归纳（含锥内合作公式与两条政策达成定理） | §2.4 | mathlib |
| `T7_band` / `T7_cone` | 共存带定理：带非空 ⟺ c·γ ≤ ρ·r | §2.5 | mathlib / core |
| `T8_kelly_rat` / `T8_kelly` | 凯利临界点方程（p = 5/8 平价 ⇒ 最优敞口 1/4，留存 75%） | 定理 A（§2.5） | mathlib / core |

## 环境依赖

- **Python 轨**：Python ≥ 3.8，零第三方依赖（仅标准库 `fractions`/`math`/`random`）
- **Lean mathlib 轨**：[elan](https://elan.lean-lang.org/) + Lean 4.34.1 + Mathlib v4.34.1（commit `d13f23b723b8a846827a245b89c10fc7d3f11612`；首拉约 6.9 GB，走官方缓存）
- **Lean core 轨**：Lean 4 即可，无需 Mathlib（秒级编译）

## 复现步骤

```bash
git clone https://github.com/Symy-ai/covenant.git && cd covenant/proofs

# Python 精确层（期望末行：总判定：10/10 通过）
python3 covenant_proofs.py

# core-only 轨（期望：3 条 print axioms，无报错）
lean covenant-core/Covenant.lean

# mathlib 轨（首次约 20–40 分钟）
cd covenant-mathlib
curl -sSfL https://elan.lean-lang.org/elan-init.sh | sh -s -- -y --default-toolchain leanprover/lean4:v4.34.1
export PATH="$HOME/.elan/bin:$PATH"
lake update
lake env lean Covenant.lean
```

## 验证记录（最新：2026-10-16）

- `covenant_proofs.py`：退出码 0，10/10 PASS，3159 组网格穷举全过（q ≥ q* ⟺ 合作，Bellman 证书精确）
- `covenant-mathlib/Covenant.lean`（v1.5，**36 条 `#print axioms` 全覆盖 / 36 条 theorem 声明**，2026-10-17 实编译）：`lake env lean` 退出码 0，公理基底全部 `[propext, Classical.choice, Quot.sound]`，零 `sorry`、零自定义公理、零 `native_decide`；CI（GitHub Actions lean-ci）在每次 proofs/ 变更时重跑此验证
- **T4 组（命题 1 Lean 化）**：Python 层 `t4_unravel`（T=50 穷举 + 逐轮占优）升级为 Lean 层任意 T 归纳证明——`T4_unravel_strict`（δ>0 + 序列等长 + 含至少一轮 C ⟹ 全 D 严格占优）是「共同知识理性 + 有限视野 ⟹ 唯一理性路径全 D」的机器可验证内核；`T4_surplus` 证合作剩余恰 3 倍（任意 T、任意 δ）。第三轮审稿账本缺口 1 闭环
- 历史记录（2026-10-12）：v1.3 版本为 18 条 `#print axioms` / 31 条 theorem——覆盖不全由审稿指出，已于 2026-10-16 补全；2026-10-17 T4 组入 Lean 层（31→36），命题 1 摘脱 Python 穷举层
- 历史记录（2026-10-12）：v1.3 版本为 18 条 `#print axioms` / 31 条 theorem——覆盖不全由审稿指出，已于 2026-10-16 补全
- T3 无穷时域版：Mathlib 的 `Measure.pi` 当前仅支持有限指标族，无穷乘积测度（`ProductMeasure.infinitePi`）留作扩展——论文附录 A 已作诚实边界声明
- `covenant-core/Covenant.lean`：裸 `lean` 编译退出码 0，公理基底 `[propext]` / `[propext, Quot.sound]`

## 引用

若本验证代码对你的研究有用，请引用：

```bibtex
@misc{covenant_proofs_2026,
  author       = {Huang, Cailong},
  title        = {Covenant: Formal Verification Suite for the Symbiosis Covenant
                  (Intergenerational Reciprocity and Type Engineering)},
  year         = {2026},
  publisher    = {Zenodo},
  version      = {v1.3},
  doi          = {10.5281/zenodo.23308013},
  url          = {https://doi.org/10.5281/zenodo.23308013},
  note         = {Concept DOI, always resolves to the latest version;
                  per-version DOIs at the Zenodo version history page}
}
```

> 引用纪律：本 README 为活文档，BibTeX 用概念 DOI（永远指向最新归档）；送审等需要冻结快照的场合，请用当期版本 DOI（见 [Zenodo 版本历史](https://zenodo.org/records/23308013/versions/)）。

## 与签名站的关系

本目录是 [symy.ai/covenant](https://symy.ai/covenant/) 签名站的数学配套：契约正文一句话（「智慧生命要尽量少占资源」）冻结不改，其博弈论分析、可验证性与定价定理在此形式化。签名数据与验证代码相互独立——定理的正确性不依赖任何签名的存在。
