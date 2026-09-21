// ============================================================
// 分级核验配置 —— 业务工作人员维护
// push 到 main → Vercel 约 30 秒自动生效，无需改代码
//
// 规则：
//   A 域名匹配：邮箱域名后缀命中 DOMAIN_MATCHES 的键，
//     且申报单位含对应任一关键词 → 自动放行（即时上墙）
//   B 通用邮箱：域名在 GENERIC_DOMAINS，且申报单位不含敏感词
//     （含本文件所有机构关键词，自动合并）、头衔为空或不含敏感头衔词
//     → 自动放行
//   C 其余 → pending-review 分支，人工审核（1-3 个工作日）
// 维护建议：重点邀约对象的机构域名提前补全，
// 大佬的机构邮箱签名即点即生效。
// ============================================================

// 机构邮箱域名 → 申报单位关键词（包含匹配，支持子域）
export const DOMAIN_MATCHES = {
  "tsinghua.edu.cn": ["清华大学", "清华"],
  "pku.edu.cn": ["北京大学", "北大"],
  "fudan.edu.cn": ["复旦大学", "复旦"],
  "sjtu.edu.cn": ["上海交通大学", "上海交大"],
  "zju.edu.cn": ["浙江大学", "浙大"],
  "ustc.edu.cn": ["中国科学技术大学", "中科大", "USTC"],
  "nju.edu.cn": ["南京大学", "南大"],
  "cas.cn": ["中国科学院", "中科院"],
  "mit.edu": ["MIT", "麻省理工"],
  "stanford.edu": ["斯坦福", "Stanford"],
  // 按需继续添加……
};

// 通用个人邮箱域名（无法证明机构身份，走规则 B）
export const GENERIC_DOMAINS = [
  "gmail.com", "googlemail.com", "qq.com", "foxmail.com",
  "163.com", "126.com", "yeah.net",
  "outlook.com", "hotmail.com", "live.com",
  "sina.com", "sina.cn", "icloud.com", "me.com",
  "proton.me", "protonmail.com", "yahoo.com", "ymail.com",
  "139.com", "189.cn",
];

// 敏感机构词：通用邮箱申报含 → 人工审核（宁多勿漏）
export const SENSITIVE_INSTITUTIONS = [
  "中国科学院", "中科院", "中国社会科学院",
  "OpenAI", "Anthropic", "DeepMind", "Google", "Meta",
  "Microsoft", "Microsoft Research", "Apple",
  "剑桥", "牛津", "伯克利", "CMU", "加州大学",
  "DeepSeek", "字节", "阿里", "腾讯", "华为", "百度",
];

// 敏感头衔词：头衔含 → 人工审核（不区分大小写）
export const SENSITIVE_ROLES = [
  "院士", "教授", "副教授", "研究员", "副研究员",
  "博导", "博士生导师", "院长", "副校长", "校长",
  "所长", "主任", "首席", "创始人", "合伙人",
  "CEO", "CTO", "CFO", "President", "Director",
  "Professor", "Dr.", "Ph.D.",
];
