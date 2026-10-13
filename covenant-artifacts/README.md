# covenant-artifacts

论文《跨代际互惠与类型工程》v1.4（第 5 节「可检验预测」）的开源工件包。

## 三件套与论文的映射

```
论文第 5 节：三个可检验预测
   │
   ├─ covenant-sft/     预测一的干预物（契约+推理链 SFT 数据集）──第二层的语料入口
   ├─ covenant-bench/   三个预测的测量装置（守约测量套件）──────评估的标准化
   └─ estimation_chain.py（随论文归档，paper/ 目录）第 4 章估计链的复算脚本
```

核心主张：论文的全部数值主张（阈值、基线、两档效应、杠杆、棘轮）可复算；
核心预测（克制率上移、等待倾向上移、承诺坚持度可测）可被任何第三方独立复测。

## 状态

v0（2026-10-13）：骨架可用——12 条 SFT 样本、3 套件 ×6 条判据化测试题、runner 三模式、估计链脚本自验证通过。首轮测量与英文扩容为 v1 计划。

## 位置

- 本目录即官方位置：`Symy-ai/covenant` 仓库 `covenant-artifacts/`（https://github.com/Symy-ai/covenant/tree/main/covenant-artifacts）。
- 论文正式归档（Zenodo）时随论文发布同套内容。
- 许可：bench/代码 Apache 2.0；sft 数据 CC BY 4.0。
