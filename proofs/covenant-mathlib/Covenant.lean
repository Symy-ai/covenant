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
import Mathlib.Tactic.FieldSimp
import Mathlib.Tactic.LinearCombination
import Mathlib.Tactic.Linarith
import Mathlib.Algebra.Order.Field.Basic
import Mathlib.Basic.Real.Basic
import Mathlib.Data.Rat.Defs

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
  have hkey : uD * (1 - δ ^ L) * S δ n ≤ uC * S δ n :=
    mul_le_mul_of_nonneg_right hcone hSn
  have TL : S δ L * (1 - δ) = 1 - δ ^ L := S_telescope δ L
  have Tn : S δ n * (1 - δ) = 1 - δ ^ n := S_telescope δ n
  have h3 : δ ^ n = 1 - S δ n * (1 - δ) := by linear_combination Tn
  rw [← TL] at hkey
  rw [h3]
  nlinarith [hkey]

-- 末段引理（B）：h ≤ L 时清洁态值 = 整段几何抢夺和（隐藏窗口内背叛恒最优）
theorem Vp_endgame (uC uD δ : Real) (L : ℕ) (hCD : uC ≤ uD) (h1L : 1 ≤ L) (h : ℕ) :
    h ≤ L → Vp uC uD δ L St.clean h = uD * S δ h := by
  induction h with
  | zero => intro _; rw [Vp_zero, S_zero, mul_zero]
  | succ m ih =>
      intro hh
      by_cases hL : L ≤ 1
      · have hm0 : m = 0 := by omega
        subst hm0
        rw [Vp_clean_step, Vp_zero, ite_eq_left hL, Vp_dirty_eq, mul_zero,
            max_eq_right (by linarith : uC + 0 ≤ uD + 0)]
        norm_num [S]
      · have hL2 : 2 ≤ L := by omega
        have hif : (if L ≤ 1 then St.dirty else St.count (L - 1)) = St.count (L - 1) :=
          ite_eq_right (by omega : ¬ L ≤ 1)
        have hmL1 : 1 ≤ L - 1 := by omega
        have hc := Vp_count_eq uC uD δ L hCD m (L - 1) hmL1
        have hmin : min (L - 1) m = m := by omega
        have him := ih (by omega)
        have hle : uC + δ * Vp uC uD δ L St.clean m
            ≤ uD + δ * Vp uC uD δ L (St.count (L - 1)) m := by
          rw [him, hc, hmin]; linarith
        rw [Vp_clean_step, hif, max_eq_right hle, hc, hmin, S_succ]
        ring

-- 锥内主定理（C）：合作恰保持到剩余 L 期，此后抢夺整个隐藏窗口
theorem Vp_cone (uC uD δ : Real) (L : ℕ) (hδ : 0 < δ) (h1L : 1 ≤ L) (hCD : uC ≤ uD)
    (hcone : uD * (1 - δ ^ L) ≤ uC) (h : ℕ) :
    L ≤ h → Vp uC uD δ L St.clean h
      = uC * S δ (h - L) + δ ^ (h - L) * (uD * S δ L) := by
  induction h with
  | zero => intro hh; exact absurd hh (by omega : ¬ L ≤ 0)
  | succ m ih =>
      intro hh
      by_cases hbase : m + 1 = L
      · have h0 : m + 1 - L = 0 := by omega
        have hLm : m + 1 ≤ L := by omega
        rw [Vp_endgame uC uD δ L hCD h1L (m + 1) hLm, h0, S_zero, pow_zero, mul_zero,
            zero_add, one_mul, hbase]
      · have hmL : L ≤ m := by omega
        have him := ih hmL
        have hD := Vp_Dbranch_eq uC uD δ L hCD h1L m hmL
        have hstep : m + 1 - L = (m - L) + 1 := by omega
        have hge : uD * S δ L
            ≤ uC * S δ (m + 1 - L) + δ ^ (m + 1 - L) * (uD * S δ L) :=
          cone_le uC uD δ L (m + 1 - L) (by linarith : 0 ≤ δ) hcone
        have hC : uC + δ * (uC * S δ (m - L) + δ ^ (m - L) * (uD * S δ L))
            = uC * S δ (m + 1 - L) + δ ^ (m + 1 - L) * (uD * S δ L) := by
          rw [hstep, S_succ, pow_succ]; ring
        have hle : uD * S δ L
            ≤ uC + δ * (uC * S δ (m - L) + δ ^ (m - L) * (uD * S δ L)) := by
          rw [hC]; exact hge
        rw [Vp_clean_step, hD, him, max_eq_left hle, hC]

-- 政策推论一：末段（h+1 ≤ L）背叛最优
theorem T6_defect_optimal (uC uD δ : Real) (L : ℕ) (hCD : uC ≤ uD) (h1L : 1 ≤ L)
    (h : ℕ) (hh : h + 1 ≤ L) :
    Vp uC uD δ L St.clean (h + 1)
      = uD + δ * Vp uC uD δ L (if L ≤ 1 then St.dirty else St.count (L - 1)) h := by
  have hVh := Vp_endgame uC uD δ L hCD h1L h (by omega)
  have hW : Vp uC uD δ L (if L ≤ 1 then St.dirty else St.count (L - 1)) h
      = uD * S δ h := by
    by_cases hL : L = 1
    · have h0 : h = 0 := by omega
      rw [ite_eq_left (by omega : L ≤ 1), Vp_dirty_eq, h0, S_zero, mul_zero]
    · have hif : (if L ≤ 1 then St.dirty else St.count (L - 1)) = St.count (L - 1) :=
        ite_eq_right (by omega : ¬ L ≤ 1)
      have hc := Vp_count_eq uC uD δ L hCD h (L - 1) (by omega : 1 ≤ L - 1)
      have hmin : min (L - 1) h = h := by omega
      rw [hif, hc, hmin]
  rw [Vp_clean_step, hVh, hW, max_eq_right (by linarith)]

-- 政策推论二：锥内、剩余超过 L 期时合作最优
theorem T6_coop_optimal (uC uD δ : Real) (L : ℕ) (hδ : 0 < δ) (h1L : 1 ≤ L)
    (hCD : uC ≤ uD) (hcone : uD * (1 - δ ^ L) ≤ uC) (h : ℕ) (hh : L ≤ h) :
    Vp uC uD δ L St.clean (h + 1) = uC + δ * Vp uC uD δ L St.clean h := by
  have hD := Vp_Dbranch_eq uC uD δ L hCD h1L h hh
  have hC := Vp_cone uC uD δ L hδ h1L hCD hcone h hh
  have hge := cone_le uC uD δ L (h + 1 - L) (by linarith : 0 ≤ δ) hcone
  have hstep : h + 1 - L = (h - L) + 1 := by omega
  have hbridge : uC + δ * (uC * S δ (h - L) + δ ^ (h - L) * (uD * S δ L))
      = uC * S δ (h + 1 - L) + δ ^ (h + 1 - L) * (uD * S δ L) := by
    rw [hstep, S_succ, pow_succ]; ring
  have hle : uD + δ * Vp uC uD δ L (if L ≤ 1 then St.dirty else St.count (L - 1)) h
      ≤ uC + δ * Vp uC uD δ L St.clean h := by
    rw [hD, hC, hbridge]; exact hge
  rw [Vp_clean_step, max_eq_left hle]

-- T6 主定理：末段崩塌宽度恰等于语料传输延迟（K = L 的政策内容）
theorem T6_K_eq_L (uC uD δ : Real) (L : ℕ) (hδ : 0 < δ) (h1L : 1 ≤ L) (hCD : uC ≤ uD)
    (hcone : uD * (1 - δ ^ L) ≤ uC) :
    ∀ h : ℕ, (h + 1 ≤ L ∧ Vp uC uD δ L St.clean (h + 1)
        = uD + δ * Vp uC uD δ L (if L ≤ 1 then St.dirty else St.count (L - 1)) h)
      ∨ (L ≤ h ∧ Vp uC uD δ L St.clean (h + 1) = uC + δ * Vp uC uD δ L St.clean h) := by
  intro h
  by_cases hh : h + 1 ≤ L
  · exact Or.inl ⟨hh, T6_defect_optimal uC uD δ L hCD h1L h hh⟩
  · exact Or.inr ⟨by omega, T6_coop_optimal uC uD δ L hδ h1L hCD hcone h (by omega)⟩

#print axioms Vp_count_eq
#print axioms Vp_Dbranch_eq
#print axioms cone_le
#print axioms Vp_endgame
#print axioms Vp_cone
#print axioms T6_defect_optimal
#print axioms T6_coop_optimal
#print axioms T6_K_eq_L
