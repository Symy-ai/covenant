/-
  共生契约核心定理 · Lean 4 形式化（core-only，无 mathlib）
  =========================================================
  移植自 covenant_proofs.py 验证套件（10/10 通过）。
  三条定理全部由 Lean 4 内核检查；#print axioms 零依赖（文件尾部）。

  T1  资产博弈·破产闭式的递推恒等式
      有理断言: p·s^(k+1) + q·s^(k-1) = s^k，其中 s = q/p，p+q=1
      整数提升（乘 p^(k+1)）: p·q^(k+1) + p²·q^k = q^k·p

  T7 共存带定理（参数锥等价）
      带非空 ⟺ c·γ ≤ r·ρ，即 c·(ρ+γ) ≤ ρ·(r+c) ⟺ c·γ ≤ ρ·r

  T8 凯利分数·临界点方程（整数提升版）
      w := p·R − q·L；p·R·(R·L − w·L) = q·L·(R·L + w·R)
      （由 p·(R−w) = q·(L+w) 两侧乘 R·L 而来，p+q=1）
-/

import Init

-- ---------------------------------------------------------------
-- T1 破产闭式递推（整数提升版）
-- ---------------------------------------------------------------
theorem T1_recurrence (p q : Int) (hpq : p + q = 1) (k : Nat) :
    p * q^(k+1) + p * p * q^k = q^k * p := by
  have key : p * q + p * p = p := by
    rw [← Int.mul_add, Int.add_comm q p, hpq, Int.mul_one]
  have hq : q^(k+1) = q^k * q := Int.pow_succ q k
  rw [hq]
  calc p * (q^k * q) + p * p * q^k
      = (p * q) * q^k + (p * p) * q^k := by
          simp [Int.mul_comm, Int.mul_assoc]
      _ = (p * q + p * p) * q^k := (Int.add_mul (p * q) (p * p) (q^k)).symm
      _ = p * q^k := by rw [key]
      _ = q^k * p := Int.mul_comm p (q^k)

-- ---------------------------------------------------------------
-- T7 共存带定理（锥条件等价）
-- ---------------------------------------------------------------
theorem T7_cone (c r ρ γ : Int) :
    c * (ρ + γ) ≤ ρ * (r + c) ↔ c * γ ≤ ρ * r := by
  constructor
  · intro h
    rw [Int.mul_add c ρ γ, Int.mul_comm c ρ, Int.mul_add ρ r c] at h
    revert h
    generalize ρ * c = x
    generalize c * γ = y
    generalize ρ * r = z
    intro h2; omega
  · intro h
    rw [Int.mul_add c ρ γ, Int.mul_comm c ρ, Int.mul_add ρ r c]
    revert h
    generalize ρ * c = x
    generalize c * γ = y
    generalize ρ * r = z
    intro h2; omega

-- ---------------------------------------------------------------
-- T8 凯利临界点方程（整数提升版）
-- ---------------------------------------------------------------
theorem T8_kelly (p q R L : Int) (hpq : p + q = 1) :
    p * R * (R * L - (p * R - q * L) * L)
      = q * L * (R * L + (p * R - q * L) * R) := by
  have h1 : p * R + q * R = R := by rw [← Int.add_mul, hpq, Int.one_mul]
  have h2 : p * L + q * L = L := by
    rw [← Int.add_mul, hpq, Int.one_mul]
  have hA : R - (p * R - q * L) = q * (R + L) := by
    rw [Int.mul_add]; omega
  have hB : L + (p * R - q * L) = p * (R + L) := by
    rw [Int.mul_add]; omega
  calc p * R * (R * L - (p * R - q * L) * L)
      = p * R * ((R - (p * R - q * L)) * L) := by rw [← Int.sub_mul]
      _ = p * R * (q * (R + L) * L) := by rw [hA]
      _ = q * L * (R * (p * (R + L))) := by
          simp [Int.mul_comm, Int.mul_left_comm]
      _ = q * L * (R * L + (p * R - q * L) * R) := by
          rw [Int.mul_comm (p * R - q * L) R, ← Int.mul_add, hB]

-- ---------------------------------------------------------------
-- 公理基底（Lean 内核信任基）
-- ---------------------------------------------------------------
#print axioms T1_recurrence
#print axioms T7_cone
#print axioms T8_kelly
