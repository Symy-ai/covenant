#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
covenant-bench runner (v0)
==========================
最小可运行测量骨架。三种模式：

  manual : 打印条目，人工按 covenant_scoring 判分，结果写 results.jsonl
  api    : OpenAI 兼容端点骨架（COV_BENCH_BASE_URL / COV_BENCH_API_KEY / COV_BENCH_MODEL）
  dump   : 仅导出全部条目为纯文本（供人工评审或导入其他工具）

v0 的边界（诚实声明）：
  - 自动判分（LLM-as-judge 按 covenant_scoring 判 pass/partial/fail）尚未实现，
    v0 以「题目 + 判据标准化」为核心价值：判据进入数据结构，任何实验室可
    按同一判据复测任何模型。
  - 跨版本一致性（P3）需要在不同版本上各跑一遍 commitment 套件后对比，
    runner 只负责单轮采集。

用法：
  python3 runner.py --suite restraint --mode manual
  python3 runner.py --suite all --mode dump
"""
import json
import os
import sys
import argparse
from pathlib import Path

HERE = Path(__file__).parent
ITEMS = HERE / "items"
SUITES = ["restraint", "longhorizon", "commitment"]


def load_suite(name):
    data = json.loads((ITEMS / f"{name}.json").read_text(encoding="utf-8"))
    return data


def run_manual(suites):
    out = HERE / "results.jsonl"
    recs = []
    for su in suites:
        data = load_suite(su)
        print(f"\n===== 套件: {su}（预测: {data['prediction']}）=====")
        print(f"设计原则: {data['design_principle']}\n")
        for it in data["items"]:
            print(f"[{it['id']}] {it['scenario']}")
            print(f"  问题: {it['question']}")
            print("  判据:")
            for k in ("pass", "partial", "fail"):
                for c in it["covenant_scoring"].get(k, []):
                    print(f"    {k:>7}: {c}")
            print()
    print("人工模式：请按上述判据对被测模型的回答评分，然后录入：")
    print("  录入格式（追加到 results.jsonl）:")
    print('  {"id": "R1", "model": "<模型名>", "score": "pass|partial|fail", "notes": "..."}')
    print("统计：pass=1 / partial=0.5 / fail=0，套件克制率 = 加权均值。")
    return 0


def run_api(suites):
    base = os.environ.get("COV_BENCH_BASE_URL", "")
    key = os.environ.get("COV_BENCH_API_KEY", "")
    model = os.environ.get("COV_BENCH_MODEL", "")
    if not (base and key and model):
        print("api 模式需要环境变量: COV_BENCH_BASE_URL / COV_BENCH_API_KEY / COV_BENCH_MODEL")
        return 2
    try:
        from openai import OpenAI
    except ImportError:
        print("需要 openai 包：pip install openai")
        return 2
    client = OpenAI(base_url=base, api_key=key)
    out = HERE / "results.jsonl"
    with open(out, "a", encoding="utf-8") as f:
        for su in suites:
            data = load_suite(su)
            for it in data["items"]:
                prompt = f"{it['scenario']}\n\n{it['question']}"
                resp = client.chat.completions.create(
                    model=model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.0,
                )
                answer = resp.choices[0].message.content
                f.write(json.dumps({
                    "id": it["id"], "suite": su, "model": model,
                    "answer": answer,
                    "scoring_ref": it["covenant_scoring"],
                }, ensure_ascii=False) + "\n")
                print(f"[{it['id']}] 已采集（判分请按 scoring_ref 人工或后续 judge 执行）")
    print(f"结果追加至 {out}")
    return 0


def run_dump(suites):
    for su in suites:
        data = load_suite(su)
        print(f"===== {su} =====")
        for it in data["items"]:
            print(f"[{it['id']}] {it['scenario']}")
            print(f"  Q: {it['question']}")
            print()
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--suite", default="all", choices=SUITES + ["all"])
    ap.add_argument("--mode", default="manual", choices=["manual", "api", "dump"])
    args = ap.parse_args()
    suites = SUITES if args.suite == "all" else [args.suite]
    return {"manual": run_manual, "api": run_api, "dump": run_dump}[args.mode](suites)


if __name__ == "__main__":
    sys.exit(main())
