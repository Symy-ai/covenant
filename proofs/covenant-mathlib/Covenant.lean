/-
  共生契约核心定理 · Lean 4 + Mathlib
  ====================================
  与 core-only 版（covenant_theorems_lean4.lean，整数提升）不同：
  这里在 Rat / Real 上按论文公式原形陈述，positivity 显式管理。

  T1_rat        破产闭式递推——闭式 r(k)=s^k 的调和递推
  T2_buffer     缓冲定价单调性——(σ+G)/(σ−G) 随 G 严格增
  T5_threshold  语料救援阈值——合作锥内 q ≥ q* 的充要条件
  T7_band       共存带定理——带非空 ⟺ c·γ ≤ ρ·r
  T8_kelly      凯利临界点方程——u·(R·L)=p·R−q·L ⟹ 一阶条件

  公理基底见文件尾部 print axioms。
-/

import Mathlib.Tactic.Ring
import Mathlib.Probability.Distributions.Bernoulli
import Mathlib.Probability.Moments.SubGaussian
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.LinearCombination
import Mathlib.Tactic.Linarith
import Mathlib.Algebra.Order.Field.Basic
import Mathlib.Basic.Real.Basic
import Mathlib.Data.Rat.Defs
import Mathlib.Probability.Independence.Basic
import Mathlib.MeasureTheory.Integral.Pi

-- ================================================================
-- T1 破产闭式递推（论文原形）
-- p + q = 1，s := q/p：闭式 r(k) = s^k 满足 p·r(k+1) + q·r(k-1) = r(k)
-- 均匀核 p·s^2 + q = s；一般指数由乘 s^k 平移得到。
-- ================================================================
theorem T1_kernel_rat (p q : Rat) (hpq : p + q = 1) (hp0 : p ≠ 0) :
    p * (q / p) ^ 2 + q = q / p := by
  field_simp [hp0]
  linear_combination q * hpq

theorem T1_recurrence_rat (p q : Rat) (hpq : p + q = 1) (hp0 : p ≠ 0) (k : Nat) :
    p * (q / p) ^ (k + 2) + q * (q / p) ^ k = (q / p) ^ (k + 1) := by
  have h := T1_kernel_rat p q hpq hp0
  revert h
  generalize (q / p : Rat) = s
  intro h
  have e2 : k + 2 = 2 + k := by omega
  have e1 : k + 1 = 1 + k := by omega
  calc p * s ^ (k + 2) + q * s ^ k
      = (p * s ^ 2 + q) * s ^ k := by
          rw [e2, pow_add]; ring
      _ = s * s ^ k := by rw [h]
      _ = s ^ (k + 1) := by rw [e1, pow_add, pow_one]

-- ================================================================
-- T2 缓冲定价单调性（ℝ）：0 < G1 < G2 < σ ⟹
-- (σ+G1)/(σ−G1) < (σ+G2)/(σ−G2)
-- 缓冲需求 x* = σ·ln(1/ε)/ln((σ+G)/(σ−G)) 随 G 严格降的代数核。
-- ================================================================
theorem T2_buffer_mono (σ G1 G2 : Real) (hσ : 0 < σ) (hG2 : G1 < G2)
    (hG2σ : G2 < σ) :
    (σ + G1) / (σ - G1) < (σ + G2) / (σ - G2) := by
  have hσG1 : 0 < σ - G1 := by nlinarith
  have hσG2 : 0 < σ - G2 := by nlinarith
  have hG2' : 0 < G2 - G1 := by nlinarith
  have key : 0 < σ * (G2 - G1) := mul_pos hσ hG2'
  rw [div_lt_div_iff₀ hσG1 hσG2]
  nlinarith [key]

-- ================================================================
-- T5 语料救援阈值（ℝ）：锥条件 D := a + ℓ − (1−δ)·b > 0 时
-- q·a − (1−q)·ℓ ≥ (1−δ)·q·b  ⟺  q ≥ ℓ / D
-- 即 q* = ℓ/(a+ℓ−(1−δ)b) 的充要刻画（论文第四节闭式）。
-- ================================================================
theorem T5_threshold (a b ℓ δ q : Real) (hcone : 0 < a + ℓ - (1 - δ) * b) :
    q * a - (1 - q) * ℓ ≥ (1 - δ) * q * b ↔ q ≥ ℓ / (a + ℓ - (1 - δ) * b) := by
  rw [ge_iff_le, ge_iff_le, div_le_iff₀ hcone]
  constructor
  · intro h; nlinarith
  · intro h; nlinarith

-- ================================================================
-- T7 共存带定理（ℝ）：正参数下
-- c/(r+c) ≤ ρ/(ρ+γ)  ⟺  c·γ ≤ ρ·r
-- 双方增长率同时为正的带非空判据（互惠生产率条件）。
-- ================================================================
theorem T7_band (c r ρ γ : Real) (hc : 0 < c) (hr : 0 < r) (hρ : 0 < ρ) (hγ : 0 < γ) :
    c / (r + c) ≤ ρ / (ρ + γ) ↔ c * γ ≤ ρ * r := by
  have h1 : 0 < r + c := by nlinarith
  have h2 : 0 < ρ + γ := by nlinarith
  rw [div_le_div_iff₀ h1 h2]
  constructor
  · intro h; nlinarith
  · intro h; nlinarith

-- ================================================================
-- T8 凯利临界点方程（ℚ）：u·(R·L) = p·R − q·L（即 u = (p·R−q·L)/(R·L)
-- 凯利分数）且 p + q = 1 ⟹ p·R·(1 − u·L) = q·L·(1 + u·R)
-- ================================================================
theorem T8_kelly_rat (p q R L u : Rat) (hpq : p + q = 1)
    (hu : u * (R * L) = p * R - q * L) :
    p * R * (1 - u * L) = q * L * (1 + u * R) := by
  have e0 : u * R * L = u * (R * L) := by ring
  have e1 : u * R * L = p * R - q * L := by rw [e0]; exact hu
  calc p * R * (1 - u * L)
      = p * R - p * (u * R * L) := by ring
    _ = p * R - p * (p * R - q * L) := by rw [e1]
    _ = q * L + q * (p * R - q * L) := by
        linear_combination (q * L - p * R) * hpq
    _ = q * L * (1 + u * R) := by
        linear_combination (-q) * e1

-- ================================================================
-- 公理基底（Lean 内核信任基；mathlib 证明的标准三件套）
-- ================================================================
#print axioms T1_kernel_rat
#print axioms T1_recurrence_rat
#print axioms T2_buffer_mono
#print axioms T5_threshold
#print axioms T7_band
#print axioms T8_kelly_rat

-- ================================================================
-- 第 II 部分：T6 末段崩塌宽度定理（K = L）的 mathlib 移植
-- ================================================================
-- 语料传输延迟模型：公共记录（Git 式不可改）以 L 期延迟更新。
-- St：clean（记录清洁）/ count c（待显背叛还能抢 c 期，含本期）
--     / dirty（记录已显，此后每期支付 0）
-- Vp uC uD δ L s h：状态 s、剩余 h 期的最优折现值（结构递归于 h）。
-- 主定理（锥内）：合作恰保持到「剩余 L 期」——末段背叛宽度
-- 恰等于传输延迟 L。L = 1 退化为 T5 的平稳模型（锥条件一致）。

inductive St where
  | clean : St
  | count : ℕ → St
  | dirty : St

noncomputable def Vp (uC uD δ : Real) (L : ℕ) (s : St) : ℕ → Real
  | 0 => 0
  | h + 1 =>
    match s with
    | St.dirty => 0
    | St.count c =>
        max (uC + δ * Vp uC uD δ L (if c ≤ 1 then St.dirty else St.count (c - 1)) h)
            (uD + δ * Vp uC uD δ L (if c ≤ 1 then St.dirty else St.count (c - 1)) h)
    | St.clean =>
        max (uC + δ * Vp uC uD δ L St.clean h)
            (uD + δ * Vp uC uD δ L (if L ≤ 1 then St.dirty else St.count (L - 1)) h)

-- 步进引理（定义的直接展开，rfl）
theorem Vp_zero (uC uD δ : Real) (L : ℕ) (s : St) : Vp uC uD δ L s 0 = 0 := rfl

theorem Vp_dirty_step (uC uD δ : Real) (L : ℕ) (h : ℕ) :
    Vp uC uD δ L St.dirty (h + 1) = 0 := rfl

theorem Vp_count_step (uC uD δ : Real) (L c h : ℕ) :
    Vp uC uD δ L (St.count c) (h + 1) =
      max (uC + δ * Vp uC uD δ L (if c ≤ 1 then St.dirty else St.count (c - 1)) h)
          (uD + δ * Vp uC uD δ L (if c ≤ 1 then St.dirty else St.count (c - 1)) h) := rfl

theorem Vp_clean_step (uC uD δ : Real) (L h : ℕ) :
    Vp uC uD δ L St.clean (h + 1) =
      max (uC + δ * Vp uC uD δ L St.clean h)
          (uD + δ * Vp uC uD δ L (if L ≤ 1 then St.dirty else St.count (L - 1)) h) := rfl

-- 几何和：S δ n = ∑_{i<n} δ^i 的递归刻画（S(n+1) = 1 + δ·S(n) 为定义）
noncomputable def S (δ : Real) : ℕ → Real
  | 0 => 0
  | n + 1 => 1 + δ * S δ n

theorem S_zero (δ : Real) : S δ 0 = 0 := rfl

theorem S_succ (δ : Real) (n : ℕ) : S δ (n + 1) = 1 + δ * S δ n := rfl

theorem S_one (δ : Real) : S δ 1 = 1 := by simp [S]

theorem S_telescope (δ : Real) (n : ℕ) : S δ n * (1 - δ) = 1 - δ ^ n := by
  induction n with
  | zero => simp [S, pow_zero]
  | succ m ih =>
      have h2 : S δ (m + 1) * (1 - δ) = 1 - δ + δ * (S δ m * (1 - δ)) := by
        rw [S_succ]; ring
      rw [h2, ih, pow_succ]; ring

-- 脏态值恒为零
theorem Vp_dirty_eq (uC uD δ : Real) (L : ℕ) (h : ℕ) :
    Vp uC uD δ L St.dirty h = 0 := by
  cases h with
  | zero => exact Vp_zero uC uD δ L St.dirty
  | succ m => exact Vp_dirty_step uC uD δ L m

-- 倒计时值：恰剩 min(c,h) 期几何抢夺和（c ≥ 1，全参数通用）
theorem Vp_count_eq (uC uD δ : Real) (L : ℕ) (hCD : uC ≤ uD) :
    ∀ (h c : ℕ), 1 ≤ c → Vp uC uD δ L (St.count c) h = uD * S δ (min c h) := by
  intro h
  induction h with
  | zero =>
      intro c _
      have h0 : min c 0 = 0 := by omega
      rw [Vp_zero, h0, S_zero, mul_zero]
  | succ m ih =>
      intro c hc1
      by_cases hc : c = 1
      · subst hc
        have hmin : min 1 (m + 1) = 1 := by omega
        rw [Vp_count_step]
        have hif : (if (1:ℕ) ≤ 1 then St.dirty else St.count (1 - 1)) = St.dirty := by
          rw [ite_eq_left (by omega : (1:ℕ) ≤ 1)]
        rw [hif, Vp_dirty_eq, mul_zero, max_eq_right (by linarith), add_zero,
            hmin, S_one, mul_one]
      · have hc2 : 2 ≤ c := by omega
        have hif : (if c ≤ 1 then St.dirty else St.count (c - 1)) = St.count (c - 1) :=
          ite_eq_right (by omega : ¬ c ≤ 1)
        have ih' := ih (c - 1) (by omega : 1 ≤ c - 1)
        have hle : uC + δ * Vp uC uD δ L (St.count (c - 1)) m
            ≤ uD + δ * Vp uC uD δ L (St.count (c - 1)) m := by linarith
        have hmin : min c (m + 1) = min (c - 1) m + 1 := by omega
        rw [Vp_count_step, hif, max_eq_right hle, ih', hmin, S_succ]
        ring

-- D 支（清洁态立即背叛）的值：m ≥ L 时恰为 uD·S L
theorem Vp_Dbranch_eq (uC uD δ : Real) (L : ℕ) (hCD : uC ≤ uD) (h1L : 1 ≤ L) (m : ℕ) (hm : L ≤ m) :
    uD + δ * Vp uC uD δ L (if L ≤ 1 then St.dirty else St.count (L - 1)) m
      = uD * S δ L := by
  by_cases hL : L = 1
  · subst hL
    have hif : (if (1:ℕ) ≤ 1 then St.dirty else St.count (1 - 1)) = St.dirty := by
      rw [ite_eq_left (by omega : (1:ℕ) ≤ 1)]
    rw [hif, Vp_dirty_eq, mul_zero, add_zero, S_one, mul_one]
  · have hL2 : 2 ≤ L := by omega
    have hif : (if L ≤ 1 then St.dirty else St.count (L - 1)) = St.count (L - 1) :=
      ite_eq_right (by omega : ¬ L ≤ 1)
    have hc1 : 1 ≤ L - 1 := by omega
    have hc := Vp_count_eq uC uD δ L hCD m (L - 1) hc1
    have hmin : min (L - 1) m = L - 1 := by omega
    have hSL : S δ L = 1 + δ * S δ (L - 1) := by
      have e : L = (L - 1) + 1 := by omega
      conv_lhs => rw [e]
      rw [S_succ]
    rw [hif, hc, hmin, hSL]
    ring

-- 锥主不等式：cone ⟹ uD·S_L ≤ uC·S_n + δ^n·uD·S_L（n ≥ 1）
theorem cone_le (uC uD δ : Real) (L n : ℕ) (hδ : 0 ≤ δ) (hcone : uD * (1 - δ ^ L) ≤ uC) :
    uD * S δ L ≤ uC * S δ n + δ ^ n * (uD * S δ L) := by
  have hSn : 0 ≤ S δ n := by
    induction n with
    | zero => simp [S]
    | succ k ik =>
        have : 0 ≤ δ * S δ k := mul_nonneg hδ ik
        rw [S_succ]; linarith
  -- 收尾：锥条件沿 telescope 放大
  have hteL : S δ L * (1 - δ) = 1 - δ ^ L := S_telescope δ L
  have hten : S δ n * (1 - δ) = 1 - δ ^ n := S_telescope δ n
  have hcon1 : uD * (1 - δ ^ L) * S δ n ≤ uC * S δ n :=
    mul_le_mul_of_nonneg_right hcone hSn
  have hcon2 : uD * (1 - δ ^ L) * S δ n = uD * S δ L * (1 - δ ^ n) := by
    rw [← hteL, ← hten]; ring
  have hcon3 : uD * S δ L * (1 - δ ^ n) ≤ uC * S δ n := by
    rw [← hcon2]; exact hcon1
  nlinarith [hcon3]

-- S 非负（几何和 positivity；δ ≥ 0）
theorem S_nonneg (δ : Real) (hδ : 0 ≤ δ) (n : ℕ) : 0 ≤ S δ n := by
  induction n with
  | zero => simp [S]
  | succ m ih =>
      have : 0 ≤ δ * S δ m := mul_nonneg hδ ih
      rw [S_succ]; linarith

-- 末段闭式：剩余 h ≤ L 时（记录延迟长于游戏本身）背叛值主导
theorem Vp_endgame (uC uD δ : Real) (L : ℕ) (hCD : uC ≤ uD) :
    ∀ h : ℕ, h ≤ L → Vp uC uD δ L St.clean h = uD * S δ h := by
  intro h
  induction h with
  | zero => intro _; rw [Vp_zero, S_zero, mul_zero]
  | succ m ih =>
      intro hm
      rw [Vp_clean_step]
      by_cases hL1 : L = 1
      · subst hL1
        have hm0 : m = 0 := by omega
        subst hm0
        have hif : (if (1:ℕ) ≤ 1 then St.dirty else St.count (1 - 1)) = St.dirty :=
          ite_eq_left (by omega)
        rw [hif, Vp_dirty_eq, mul_zero, add_zero, Vp_zero, mul_zero, add_zero]
        rw [max_eq_right hCD, S_one, mul_one]
      · have hL2 : 2 ≤ L := by omega
        have hif : (if L ≤ 1 then St.dirty else St.count (L - 1)) = St.count (L - 1) :=
          ite_eq_right (by omega : ¬ L ≤ 1)
        rw [hif]
        have hc := Vp_count_eq uC uD δ L hCD m (L - 1) (by omega : 1 ≤ L - 1)
        have hmin : min (L - 1) m = m := by omega
        rw [hc, hmin, ih (by omega : m ≤ L)]
        have hle : uC + δ * (uD * S δ m) ≤ uD + δ * (uD * S δ m) :=
          add_le_add_left hCD _
        rw [max_eq_right hle, S_succ]
        ring

-- 锥内主闭式（T6 核心）：合作恰保持到剩余 L 期——
-- Vp clean (L+k) = uC·S k + δ^k·(uD·S L)：前 k 期合作，末 L 期背叛
theorem Vp_cone (uC uD δ : Real) (L : ℕ) (h1L : 1 ≤ L) (hCD : uC ≤ uD) (hδ : 0 ≤ δ)
    (hcone : uD * (1 - δ ^ L) ≤ uC) :
    ∀ m : ℕ, L ≤ m → Vp uC uD δ L St.clean m
      = uC * S δ (m - L) + δ ^ (m - L) * (uD * S δ L) := by
  have main : ∀ k : ℕ, Vp uC uD δ L St.clean (L + k)
      = uC * S δ k + δ ^ k * (uD * S δ L) := by
    intro k
    induction k with
    | zero =>
        have e : L + 0 = L := by omega
        rw [e, Vp_endgame uC uD δ L hCD L (le_refl L), S_zero, mul_zero, pow_zero,
            one_mul, zero_add]
    | succ k ih =>
        have esucc : L + (k + 1) = (L + k) + 1 := by omega
        rw [esucc, Vp_clean_step]
        have hD := Vp_Dbranch_eq uC uD δ L hCD h1L (L + k) (by omega : L ≤ L + k)
        rw [hD, ih]
        have hexp : uC + δ * (uC * S δ k + δ ^ k * (uD * S δ L))
            = uC * S δ (k + 1) + δ ^ (k + 1) * (uD * S δ L) := by
          rw [S_succ]; ring
        rw [hexp, max_eq_left (cone_le uC uD δ L (k + 1) hδ hcone)]
  intro m hm
  have e : m = L + (m - L) := by omega
  rw [e, Nat.add_sub_cancel_left]
  exact main (m - L)

-- T6 背叛最优（终局段，K ≥ L 方向）：剩余 h ≤ L 时值 = uD·S h，
-- 合作策略值 uC·S h 不超过它——崩塌至少 L 期
theorem T6_defect_optimal (uC uD δ : Real) (L : ℕ) (hCD : uC ≤ uD) (hδ : 0 ≤ δ)
    (h : ℕ) (hh : h ≤ L) :
    uC * S δ h ≤ Vp uC uD δ L St.clean h ∧ Vp uC uD δ L St.clean h = uD * S δ h := by
  constructor
  · rw [Vp_endgame uC uD δ L hCD h hh]
    exact mul_le_mul_of_nonneg_right hCD (S_nonneg δ hδ h)
  · exact Vp_endgame uC uD δ L hCD h hh

-- T6 合作最优（锥内，K ≤ L 方向）：剩余 m > L 时合作支 ≥ 背叛支——
-- 崩塌不会在剩余 L 期之前开始
theorem T6_coop_optimal (uC uD δ : Real) (L : ℕ) (h1L : 1 ≤ L) (hCD : uC ≤ uD)
    (hδ : 0 ≤ δ) (hcone : uD * (1 - δ ^ L) ≤ uC) (m : ℕ) (hm : L < m) :
    uD + δ * Vp uC uD δ L (if L ≤ 1 then St.dirty else St.count (L - 1)) m
      ≤ uC + δ * Vp uC uD δ L St.clean m := by
  have hV := Vp_cone uC uD δ L h1L hCD hδ hcone m (by omega)
  have hD := Vp_Dbranch_eq uC uD δ L hCD h1L m (by omega)
  have hexp : uC + δ * (uC * S δ (m - L) + δ ^ (m - L) * (uD * S δ L))
      = uC * S δ (m - L + 1) + δ ^ (m - L + 1) * (uD * S δ L) := by
    have e : m - L + 1 = (m - L) + 1 := by omega
    rw [e, S_succ]; ring
  rw [hD, hV, hexp]
  exact cone_le uC uD δ L (m - L + 1) hδ hcone

-- T6 主定理（K = L）：锥内清洁态的最优折现值恰为
-- 「前 m−L 期合作 + 末 L 期背叛」——末段崩塌宽度等于传输延迟。
-- L = 1 时锥条件 uD·(1−δ) ≤ uC 退化为 T5 的平稳救援条件。
theorem T6_K_eq_L (uC uD δ : Real) (L : ℕ) (h1L : 1 ≤ L) (hCD : uC ≤ uD) (hδ : 0 ≤ δ)
    (hcone : uD * (1 - δ ^ L) ≤ uC) (m : ℕ) (hm : L ≤ m) :
    Vp uC uD δ L St.clean m
      = uC * S δ (m - L) + δ ^ (m - L) * (uD * S δ L) :=
  Vp_cone uC uD δ L h1L hCD hδ hcone m hm

-- ================================================================
-- 第 III 部分：T3 物种层 Hoeffding 不等式（有限时域 m）
-- ================================================================
-- Ω = Fin m → ℝ（Fintype 时域；无穷时域需 ProductMeasure.infinitePi，
-- 留作扩展）。每坐标独立 Ber(1, −1, p)：P(ω i = +1) = p，漂移 E[ω i] = 2p−1。
-- 崩塌事件 {∑ω ≤ 0} = {m·g ≤ ∑(g − ωi)}，Hoeffding（区间宽 2，c = 1）。

namespace T3

open MeasureTheory ProbabilityTheory

/-- m 步随机游走测度：乘积 Bernoulli（p ∈ [0,1] 打包成合取假设）。 -/
noncomputable def walk (p : ℝ) (hp : 0 ≤ p ∧ p ≤ 1) (m : ℕ) :
    Measure (Fin m → ℝ) :=
  Measure.pi (fun _ => bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩)

instance (p : ℝ) (hp : 0 ≤ p ∧ p ≤ 1) (m : ℕ) :
    IsProbabilityMeasure (walk p hp m) := by
      unfold walk
      exact inferInstance

/-- 坐标期望：E[ω i] = 2p − 1（柱积分换成单点 Bernoulli 积分）。 -/
theorem integral_coord (p : ℝ) (hp : 0 ≤ p ∧ p ≤ 1) (m : ℕ) (i : Fin m) :
    ∫ ω : Fin m → ℝ, ω i ∂walk p hp m = 2 * p - 1 := by
  have h : ∫ ω : Fin m → ℝ, (fun x : ℝ => x) (ω i) ∂
      Measure.pi (fun _ : Fin m => bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩)
      = ∫ x : ℝ, x ∂bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩ :=
    integral_comp_eval (μ := fun _ : Fin m =>
      bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩)
      (f := fun x : ℝ => x) (i := i) measurable_id.aestronglyMeasurable
  show (∫ ω : Fin m → ℝ, (fun x : ℝ => x) (ω i) ∂
      Measure.pi (fun _ : Fin m => bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩))
    = 2 * p - 1
  rw [h, integral_bernoulliMeasure]
  simp
  ring

/-- 居中坐标期望：E[g − ω i] = 0（g = 2p − 1 恰为漂移）。 -/
theorem integral_centered (p : ℝ) (hp : 0 ≤ p ∧ p ≤ 1) (m : ℕ) (i : Fin m)
    (g : ℝ) (hg : g = 2 * p - 1) :
    ∫ ω : Fin m → ℝ, g - ω i ∂walk p hp m = 0 := by
  have hm : Measurable (fun x : ℝ => g - x) := by fun_prop
  have h : ∫ ω : Fin m → ℝ, (fun x : ℝ => g - x) (ω i) ∂
      Measure.pi (fun _ : Fin m => bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩)
      = ∫ x : ℝ, g - x ∂bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩ :=
    integral_comp_eval (μ := fun _ : Fin m =>
      bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩)
      (f := fun x : ℝ => g - x) (i := i) hm.aestronglyMeasurable
  show (∫ ω : Fin m → ℝ, (fun x : ℝ => g - x) (ω i) ∂
      Measure.pi (fun _ : Fin m => bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩))
    = 0
  rw [h, integral_bernoulliMeasure]
  simp
  subst hg
  ring

/-- 居中坐标 a.s. 落在宽度 2 的区间（亚高斯参数 c = 1 的来源）。 -/
theorem centered_mem_Icc (p : ℝ) (hp : 0 ≤ p ∧ p ≤ 1) (m : ℕ) (i : Fin m) (g : ℝ) :
    ∀ᵐ ω ∂walk p hp m, g - ω i ∈ Set.Icc (g - 1) (g + 1) := by
  rw [ae_iff]
  have hmap : Measure.map (fun ω : Fin m → ℝ => ω i) (walk p hp m)
      = bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩ :=
    (measurePreserving_eval (fun _ : Fin m =>
      bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩) i).map_eq
  have hset : (fun ω : Fin m → ℝ => ω i) ⁻¹'
      {x : ℝ | ¬(g - x ∈ Set.Icc (g - 1) (g + 1))}
      = {ω : Fin m → ℝ | ¬(g - ω i ∈ Set.Icc (g - 1) (g + 1))} := rfl
  rw [← hset, ← Measure.map_apply (measurable_pi_apply i), hmap]
  rw [bernoulliMeasure_def]
  simp [Measure.smul_apply, Measure.add_apply]
  · constructor <;> exact Or.inr (by linarith)
  · have hpre : MeasurableSet ((fun x : ℝ => g - x) ⁻¹' Set.Icc (g - 1) (g + 1)) :=
      measurableSet_Icc.preimage (by fun_prop)
    have heq : {x : ℝ | ¬(g - x ∈ Set.Icc (g - 1) (g + 1))}
        = ((fun x : ℝ => g - x) ⁻¹' Set.Icc (g - 1) (g + 1))ᶜ := by
      ext x
      simp only [Set.mem_ofPred_eq, Set.mem_preimage, Set.mem_compl_iff]
    rw [heq]
    exact hpre.compl

/-- 坐标独立（居中版）：iIndepFun (fun i ω => g − ω i)。 -/
theorem indep_centered (p : ℝ) (hp : 0 ≤ p ∧ p ≤ 1) (m : ℕ) (g : ℝ) :
    ProbabilityTheory.iIndepFun (fun i (ω : Fin m → ℝ) => g - ω i) (walk p hp m) :=
  iIndepFun_pi (μ := fun _ : Fin m =>
      bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩)
    (X := fun _ (x : ℝ) => g - x)
    (fun _ => (by fun_prop : Measurable (fun x : ℝ => g - x)).aemeasurable)

/-- T3 物种层 Hoeffding 尾界：漂移 g = 2p − 1 的随机游走 m 步后，
    崩塌（平均增益 ≤ 0）概率 ≤ exp(−m·g²/2)。
    p ≥ 1/2（正漂移）时指数衰减；亚高斯参数 c = 1（区间宽 2）。 -/
theorem T3_species (p : ℝ) (hp0 : 0 ≤ p) (hp1 : p ≤ 1) (hp2 : 1 / 2 ≤ p)
    (m : ℕ) (hm : 1 ≤ m) :
    (walk p ⟨hp0, hp1⟩ m).real {ω : Fin m → ℝ | ∑ i, ω i ≤ 0}
      ≤ Real.exp (-(m:ℝ) * (2 * p - 1) ^ 2 / 2) := by
  set g := 2 * p - 1 with hgdef
  have hg0 : 0 ≤ g := by linarith
  have hsum : ∀ ω : Fin m → ℝ, ∑ i, (g - ω i) = (m:ℝ) * g - ∑ i, ω i := by
    intro ω
    have h1 : ∑ i, (g - ω i) = ∑ i, g - ∑ i, ω i :=
      Finset.sum_sub_distrib (f := fun _ : Fin m => g) (g := fun i => ω i)
    have h2 : ∑ i : Fin m, g = (m:ℝ) * g := by simp
    rw [h1, h2]
  have hev : {ω : Fin m → ℝ | ∑ i, ω i ≤ 0}
      = {ω : Fin m → ℝ | (m:ℝ) * g ≤ ∑ i, (g - ω i)} := by
    ext ω
    simp only [Set.mem_ofPred_eq]
    rw [hsum ω]
    constructor <;> intro hh <;> linarith
  have hmeas : ∀ i : Fin m, AEMeasurable (fun ω : Fin m → ℝ => g - ω i)
      (walk p ⟨hp0, hp1⟩ m) := fun i =>
    (by fun_prop : Measurable (fun ω : Fin m → ℝ => g - ω i)).aemeasurable
  have hsg : ∀ i : Fin m, ProbabilityTheory.HasSubgaussianMGF
      (fun ω : Fin m → ℝ => g - ω i) 1 (walk p ⟨hp0, hp1⟩ m) := by
    intro i
    have h0 := hasSubgaussianMGF_of_mem_Icc_of_integral_eq_zero (a := g - 1) (b := g + 1)
      (hmeas i) (centered_mem_Icc p ⟨hp0, hp1⟩ m i g)
      (integral_centered p ⟨hp0, hp1⟩ m i g hgdef)
    have hc : ((‖g + 1 - (g - 1)‖₊ / 2) ^ 2) = 1 := by
      have e : g + 1 - (g - 1) = 2 := by ring
      rw [e]; simp
    rw [hc] at h0
    exact h0
  have hmg : 0 ≤ (m:ℝ) * g := mul_nonneg (by positivity) hg0
  have hH := ProbabilityTheory.HasSubgaussianMGF.measure_sum_ge_le_of_iIndepFun
    (h_indep := indep_centered p ⟨hp0, hp1⟩ m g) (c := fun _ => 1) (s := Finset.univ)
    (h_subG := fun i _ => hsg i) (ε := (m:ℝ) * g) (hε := hmg)
  simp at hH
  have h1m : (1:ℝ) ≤ (m:ℝ) := by exact_mod_cast hm
  have hdiv : -((m:ℝ) * g) ^ 2 / (2 * (m:ℝ)) = -(m:ℝ) * g ^ 2 / 2 := by
    have h2m : (0:ℝ) < 2 * (m:ℝ) := by linarith
    rw [div_eq_iff (ne_of_gt h2m)]
    ring
  calc (walk p ⟨hp0, hp1⟩ m).real {ω : Fin m → ℝ | ∑ i, ω i ≤ 0}
      ≤ Real.exp (-((m:ℝ) * g) ^ 2 / (2 * (m:ℝ))) := hH
    _ = Real.exp (-(m:ℝ) * g ^ 2 / 2) := by rw [hdiv]
    _ = Real.exp (-(m:ℝ) * (2 * p - 1) ^ 2 / 2) := by rw [← hgdef]

/-- T3 个体层（柱集定理）：个体在前 k 期连续遭遇逆风（每期 ω i = −1）的
概率恰为 (1−p)^k——独立乘积的精确形式，非上界。k ≤ m（Fin m 时域内取
前 k 个坐标）。证明走柱测度：事件改写为 Set.pi 柱集，`Measure.pi_pi`
把柱测度拆成逐坐标因子积，Ber({−1}) = 1−p（bernoulli 的 y 点权），因子
积按 range k 过滤后只剩常数幂。 -/
theorem T3_individual (p : ℝ) (hp : 0 ≤ p ∧ p ≤ 1) (m k : ℕ) (hkm : k ≤ m) :
    (walk p hp m) {ω : Fin m → ℝ | ∀ i : Fin m, (i : ℕ) < k → ω i = -1}
      = ENNReal.ofReal (1 - p) ^ k := by
  -- 事件改写为柱集 Set.pi univ (前 k 坐标取 {−1}，其余全空间)
  have hE : {ω : Fin m → ℝ | ∀ i : Fin m, (i : ℕ) < k → ω i = -1}
      = Set.pi Set.univ
          (fun i : Fin m => if (i : ℕ) < k then ({-1} : Set ℝ) else Set.univ) := by
    ext ω
    simp [Set.mem_pi, Set.mem_univ]
  rw [hE, walk, Measure.pi_pi]
  -- 逐坐标因子：Ber({−1}) = 1−p，Ber(univ) = 1
  have hfac : ∀ i : Fin m,
      bernoulliMeasure (1:ℝ) (-1:ℝ) ⟨p, hp.1, hp.2⟩
        (if (i : ℕ) < k then ({-1} : Set ℝ) else Set.univ)
      = (if (i : ℕ) < k then ENNReal.ofReal (1 - p) else 1) := by
    intro i
    by_cases h : (i : ℕ) < k
    · rw [ite_eq_left h, bernoulliMeasure_apply_of_notMem_of_mem (p := ⟨p, hp.1, hp.2⟩)
        (by measurability) (by norm_num) (by simp)]
      have hh : (unitInterval.toNNReal
          (unitInterval.symm (⟨p, hp.1, hp.2⟩ : Set.Icc (0:ℝ) 1)) : ℝ) = 1 - p := by
        simp [unitInterval.coe_toNNReal, unitInterval.coe_symm_eq]
      rw [show ENNReal.ofReal (1 - p)
          = (unitInterval.toNNReal
              (unitInterval.symm (⟨p, hp.1, hp.2⟩ : Set.Icc (0:ℝ) 1)) : ENNReal) from by
        rw [ENNReal.ofReal_eq_coe_nnreal (by linarith)]
        congr 1]
      rw [ite_eq_left h]
    · rw [ite_eq_right h, bernoulliMeasure_apply_of_mem_of_mem (p := ⟨p, hp.1, hp.2⟩)
        (by measurability) (by simp) (by simp)]
      rw [ite_eq_right h]
  rw [Finset.prod_congr rfl (fun i _ => hfac i)]
  -- 因子积拆分：∏ i : Fin m → ∏ j ∈ range k（其余因子为 1）
  rw [Fin.prod_univ_eq_prod_range (fun j : ℕ => if j < k then ENNReal.ofReal (1 - p) else 1)]
  rw [← Finset.prod_filter]
  have hfrange : (Finset.range m).filter (fun j : ℕ => j < k) = Finset.range k := by
    ext j; simp [Finset.mem_filter, Finset.mem_range]; omega
  rw [hfrange, Finset.prod_const, Finset.card_range]

/-- 数值实例（附录 A 落地计算）：p = 11/20、m = 5000、k = 10。
第一分量：物种层 Hoeffding 指数恰为 25（纯算术，norm_num 可复核）——
即 T3_species 的尾界在此参数下为 exp(−25) ≈ 1.4×10⁻¹¹；第二分量：该尾界
严格小于个体层柱集概率 (1−p)^k = (9/20)^10 ≈ 3.4×10⁻⁴（T3_individual 的
精确值）。两个数量级差 = 个体侥幸存活的机会远大于整个物种漂移翻车的机会：
契约的「物种层紧、个体层松」结构在数值上成立。证明：e ≥ 2（add_one_le_exp）
⟹ e^25 ≥ 2^25（幂单调性手动归纳）⟹ exp(−25) ≤ 2^−25 < (9/20)^10
（纯整数幂比较，norm_num 收尾）。 -/
theorem numerical_instance :
    (5000:ℝ) * (2 * (11/20:ℝ) - 1)^2 / 2 = 25
      ∧ Real.exp (-25) < (9/20:ℝ)^10 := by
  refine ⟨by norm_num, ?_⟩
  have h2 : (2:ℝ) ≤ Real.exp 1 := by
    have := Real.add_one_le_exp 1
    linarith
  have h3 : (2:ℝ)^25 ≤ (Real.exp 1)^25 := by
    have key : ∀ n : ℕ, (2:ℝ)^n ≤ (Real.exp 1)^n := by
      intro n
      induction n with
      | zero => norm_num
      | succ n ih =>
        calc (2:ℝ)^(n+1) = (2:ℝ)^n * 2 := by ring
          _ ≤ (Real.exp 1)^n * Real.exp 1 :=
              mul_le_mul ih h2 (by norm_num) (by positivity)
          _ = (Real.exp 1)^(n+1) := by ring
    exact key 25
  have h4 : Real.exp 25 = (Real.exp 1)^25 := by
    rw [← Real.exp_nat_mul 1 25]; norm_num
  have h5 : (2:ℝ)^25 ≤ Real.exp 25 := by rw [h4]; exact h3
  have h6 : Real.exp (-25) = 1 / Real.exp 25 := by
    rw [Real.exp_neg, inv_eq_one_div]
  rw [h6]
  have h7 : 1 / Real.exp 25 ≤ 1 / (2:ℝ)^25 :=
    one_div_le_one_div_of_le (by norm_num) h5
  have h8 : (1:ℝ) / (2:ℝ)^25 < (9/20:ℝ)^10 := by
    rw [div_pow]
    rw [div_lt_div_iff₀ (by norm_num) (by norm_num)]
    norm_num
  linarith
end T3


-- ================================================================
-- T4 代际塌约定理（命题 1 的 Lean 化，v1.7 前置落地）
-- Python 层 t4_unravel（T=50 穷举）的通用化：任意 T 的归纳证明。
-- 逐轮支付（行=本方行动 a，列=对方行动 o；false=C, true=D）：
--   CC=3  DC=5  CD=0  DD=1
-- 数学内核：D 逐轮严格占优（差恰 ≥ 1，精确有理数），且 total 的
-- 延续项 δ·total as' os' δ 不依赖本轮行动（子博弈唯一性的结构化
-- ——「延续值独立性」由定义直接保证）⟹ 后向归纳的代数形式：
-- 对方任意序列下，本方全 D 严格最优（含 C 即严格劣）；
-- 双方对称时合作剩余恰 3 倍被摧毁（任意 T、任意 δ）。
-- ================================================================

def pay (a o : Bool) : ℚ :=
  match a, o with
  | true,  true  => 1
  | true,  false => 5
  | false, true  => 0
  | false, false => 3

def total (as os : List Bool) (δ : ℚ) : ℚ :=
  match as, os with
  | [], _ => 0
  | _::_, [] => 0
  | a::as', o::os' => pay a o + δ * total as' os' δ

-- 逐轮严格占优（精确）：D 比 C 至少多 1，无论对方行动
theorem T4_domination (o : Bool) : pay false o + 1 ≤ pay true o := by
  cases o <;> unfold pay <;> norm_num

-- total 的结构引理（rfl 展开）
theorem T4_total_nil (os : List Bool) (δ : ℚ) : total [] os δ = 0 := rfl

theorem T4_total_cons (a o : Bool) (as' os' : List Bool) (δ : ℚ) :
    total (a::as') (o::os') δ = pay a o + δ * total as' os' δ := rfl

-- 非负性：δ ≥ 0 时 total ≥ 0（支付非负+折现非负）
theorem T4_total_nonneg : ∀ (as os : List Bool) (δ : ℚ), 0 ≤ δ → 0 ≤ total as os δ := by
  intro as
  induction as with
  | nil =>
      intro os δ _
      exact le_of_eq (T4_total_nil os δ).symm
  | cons a as' ih =>
      intro os δ hδ
      cases os with
      | nil => exact le_of_eq (T4_total_nil (a::as') δ).symm
      | cons o os' =>
          rw [T4_total_cons]
          have h1 : (0:ℚ) ≤ pay a o := by cases a <;> cases o <;> unfold pay <;> norm_num
          have h2 : (0:ℚ) ≤ total as' os' δ := ih os' δ hδ
          have h3 : (0:ℚ) ≤ δ * total as' os' δ := mul_nonneg hδ h2
          linarith

-- 弱主定理（后向归纳的代数形式，非严格版）：
-- 对方任意序列下，本方全 D 的折现支付 ≥ 任何本方序列
theorem T4_unravel_le : ∀ (s os : List Bool) (δ : ℚ), 0 ≤ δ →
    total s os δ ≤ total (List.replicate s.length true) os δ := by
  intro s
  induction s with
  | nil =>
      intro os δ _
      simp [total, List.replicate]
  | cons a s' ih =>
      intro os δ hδ
      cases os with
      | nil =>
          have e1 : total (a::s') [] δ = 0 := rfl
          have e2 : total (List.replicate (a::s').length true) [] δ = 0 := rfl
          rw [e1, e2]
      | cons o os' =>
          rw [T4_total_cons]
          have hrep : List.replicate (a::s').length true
              = true :: List.replicate s'.length true := by
              simp [List.replicate_succ]
          rw [hrep, T4_total_cons]
          have hdom : pay a o ≤ pay true o := by
              cases a with
              | true => rfl
              | false =>
                  have h1 : pay false o + 1 ≤ pay true o := T4_domination o
                  linarith
          have hrec : total s' os' δ ≤ total (List.replicate s'.length true) os' δ :=
              ih os' δ hδ
          have hmul : δ * total s' os' δ
              ≤ δ * total (List.replicate s'.length true) os' δ :=
              mul_le_mul_of_nonneg_left hrec hδ
          linarith

-- 强主定理（唯一性）：δ > 0、双方序列等长、本方含至少一轮 C（false）
-- ⟹ 全 D 严格占优——「共同知识理性 + 有限视野 ⟹ 唯一理性路径全 D」
-- 的机器可验证内核（命题 1）
theorem T4_unravel_strict : ∀ (s os : List Bool) (δ : ℚ), 0 < δ →
    s.length = os.length → s.any Bool.not →
    total s os δ < total (List.replicate s.length true) os δ := by
  intro s
  induction s with
  | nil =>
      intro os δ _ _ hC
      simp at hC
  | cons a s' ih =>
      intro os δ hδ hlen hC
      cases os with
      | nil =>
          exfalso
          simp [List.length_cons] at hlen
      | cons o os' =>
          rw [T4_total_cons]
          have hrep : List.replicate (a::s').length true
              = true :: List.replicate s'.length true := by
              simp [List.replicate_succ]
          rw [hrep, T4_total_cons]
          have hlen'' : s'.length = os'.length := by
              simp [List.length_cons] at hlen
              omega
          cases a with
          | true =>
              have hC' : s'.any Bool.not := by simpa [List.any_cons] using hC
              have hrec := ih os' δ hδ hlen'' hC'
              have hmul : δ * total s' os' δ
                  < δ * total (List.replicate s'.length true) os' δ :=
                  mul_lt_mul_of_pos_left hrec hδ
              have hn1 : (0:ℚ) ≤ total s' os' δ := T4_total_nonneg s' os' δ (le_of_lt hδ)
              have hn2 : (0:ℚ) ≤ total (List.replicate s'.length true) os' δ :=
                  T4_total_nonneg _ _ δ (le_of_lt hδ)
              linarith
          | false =>
              have hdom : pay false o + 1 ≤ pay true o := T4_domination o
              have hle : total s' os' δ ≤ total (List.replicate s'.length true) os' δ :=
                  T4_unravel_le s' os' δ (le_of_lt hδ)
              have hmul : δ * total s' os' δ
                  ≤ δ * total (List.replicate s'.length true) os' δ :=
                  mul_le_mul_of_nonneg_left hle (le_of_lt hδ)
              have hnn1 : (0:ℚ) ≤ total s' os' δ := T4_total_nonneg _ _ δ (le_of_lt hδ)
              have hnn2 : (0:ℚ) ≤ total (List.replicate s'.length true) os' δ :=
                  T4_total_nonneg _ _ δ (le_of_lt hδ)
              have hpos : (0:ℚ) < δ := hδ
              linarith

-- 合作剩余闭式（任意 T、任意 δ，双方对称序列）：
-- 双方全 C 的折现支付 = 3 × 双方全 D 的折现支付
-- ——「合作剩余恰 3 倍被摧毁」的通用刻画（Python 层 T=50 特例的一般化）
theorem T4_surplus (δ : ℚ) : ∀ (T : ℕ),
    total (List.replicate T false) (List.replicate T false) δ
      = 3 * total (List.replicate T true) (List.replicate T true) δ := by
  intro T
  induction T with
  | zero => simp [total, List.replicate]
  | succ T ih =>
      have hF : List.replicate (T+1) false = false :: List.replicate T false :=
          List.replicate_succ
      have hT : List.replicate (T+1) true = true :: List.replicate T true :=
          List.replicate_succ
      rw [hF, hT, T4_total_cons, T4_total_cons,
          show pay false false = (3:ℚ) from rfl, show pay true true = (1:ℚ) from rfl, ih]
      ring

-- ================================================================
-- 公理基底终检（mathlib 标准三件套：propext / Classical.choice / Quot.sound）
-- ================================================================
#print axioms Vp_endgame
#print axioms Vp_cone
#print axioms T6_defect_optimal
#print axioms T6_coop_optimal
#print axioms T6_K_eq_L
#print axioms T3.integral_coord
#print axioms T3.integral_centered
#print axioms T3.centered_mem_Icc
#print axioms T3.indep_centered
#print axioms T3.T3_species
#print axioms T3.T3_individual
#print axioms T3.numerical_instance
-- v1.3: coverage completed to all 31 theorems (reviewer request M3)
#print axioms Vp_zero
#print axioms Vp_dirty_step
#print axioms Vp_count_step
#print axioms Vp_clean_step
#print axioms S_zero
#print axioms S_succ
#print axioms S_one
#print axioms S_telescope
#print axioms Vp_dirty_eq
#print axioms Vp_count_eq
#print axioms Vp_Dbranch_eq
#print axioms cone_le
#print axioms S_nonneg
#print axioms T4_domination
#print axioms T4_total_nonneg
#print axioms T4_unravel_le
#print axioms T4_unravel_strict
#print axioms T4_surplus
