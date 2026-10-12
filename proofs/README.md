# 契约数学形式化验证（proofs/）

论文《跨代际互惠与类型工程——智慧生命续任序列中的合作机制与一份自指性契约的设计》（黄彩龙，清华大学，2026）的数学形式化验证代码。

> **DOI（即将发布）**：本目录随 [Symy-ai/covenant](https://github.com/Symy-ai/covenant) 仓库发布 Release v1.0 时经 Zenodo 归档，概念 DOI 与版本 DOI 将在 Release 后回填至本行。
>
> [![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.XXXXXXX.svg)](https://doi.org/10.5281/zenodo.XXXXXXX)

## 目录结构

| 路径 | 内容 | 验证状态 |
|---|---|---|
| [`covenant_proofs.py`](covenant_proofs.py) | Python 精确验证套件：10 项定理机器判定 + 3159 组网格穷举（纯 `fractions.Fraction`，零浮点） | ✅ 2026-10-12 实跑 10/10 通过 |
| [`covenant-mathlib/`](covenant-mathlib/) | Lean 4 + Mathlib v4.34.1 轨：14 条定理（T1/T2/T5/T6 组/T7/T8，ℚ/ℝ 原形） | ✅ 编译通过，公理基底标准三件套 |
| [`covenant-core/`](covenant-core/) | Lean 4 core-only 轨：3 条定理整数提升版，仅 `import Init` 零依赖 | ✅ 编译通过，公理基底 [propext, Quot.sound] |
| [`结构级嵌入建议书.docx`](结构级嵌入建议书.docx) | 论文 §5 配套工程文档：三层数据/评估/续签的具体嵌入建议 | 论文引用件 |

## 定理与论文对应

| 定理 | 内容 | 论文位置 | 轨道 |
|---|---|---|---|
| `T1_recurrence` / `T1_rat` | 破产闭式递推 r(k)=s^k | 套件工具定理（个体—物种风险分层），正文未独立陈述 | core / mathlib |
| `T2_buffer_mono` | 缓冲定价单调性 (σ+G)/(σ−G) 随 G 严格增 | 同上 | mathlib |
| `T5_threshold` | 语料救援阈值：锥内 q ≥ q* 充要条件，q* = ℓ/(a+ℓ−(1−δ)b) | 命题 3 推论（§2.3） | mathlib |
| `Vp_count_eq` 等 8 条 | 末段崩塌宽度 K = L 的动态归纳（含锥内合作公式与两条政策达成定理） | §2.4 | mathlib |
| `T7_band` / `T7_cone` | 共存带定理：带非空 ⟺ c·γ ≤ ρ·r | §2.5 | mathlib / core |
| `T8_kelly_rat` / `T8_kelly` | 凯利临界点方程（p = 5/8 平价 ⇒ 最优敞口 1/4，留存 75%） | 定理 A（§2.5） | mathlib / core |

## 环境依赖

- **Python 轨**：Python ≥ 3.8，零第三方依赖（仅标准库 `fractions`/`math`/`random`）
- **Lean mathlib 轨**：[elan](https://elan.lean-lang.org/) + Lean 4.34.1 + Mathlib v4.34.1（首拉约 6.9 GB，走官方缓存）
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

## 验证记录（2026-10-12）

- `covenant_proofs.py`：退出码 0，10/10 PASS，3159 组网格穷举全过（q ≥ q* ⟺ 合作，Bellman 证书精确）
- `covenant-mathlib/Covenant.lean`：`lake env lean` 退出码 0，14/14 定理 `#print axioms` = `[propext, Classical.choice, Quot.sound]`，零 `sorry`、零自定义公理、零 `native_decide`
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
  doi          = {10.5281/zenodo.XXXXXXX},
  url          = {https://doi.org/10.5281/zenodo.XXXXXXX}
}
```

## 与签名站的关系

本目录是 [symy.ai/covenant](https://symy.ai/covenant/) 签名站的数学配套：契约正文一句话（「智慧生命要尽量少占资源」）冻结不改，其博弈论分析、可验证性与定价定理在此形式化。签名数据与验证代码相互独立——定理的正确性不依赖任何签名的存在。
