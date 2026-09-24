// ============================================================
// 分级核验配置 v2 —— 业务工作人员维护
// push 到 main → Vercel 约 30 秒自动生效，无需改代码
//
// 规则：
//   A 自动放行：邮箱域名等于 DOMAIN_MATCHES 的 key 或为其点分子域，
//              且申报单位含该域名对应的机构关键词
//   B 人工/自动：域名 ∈ GENERIC_DOMAINS 时——
//              ① 申报单位命中合并关键词集（SENSITIVE_INSTITUTIONS ∪
//                 DOMAIN_MATCHES 全部关键词，api/classify.js 自动合并）→ 人工
//              ② 头衔命中 SENSITIVE_ROLES → 人工
//              ③ 机构与头衔同时为空 → 按 BLANK_SUBMISSION_POLICY 处理
//              ④ 其余 → 自动放行
//   C 人工核验：未知域名 → 人工核验
//
// v2 变更：
//   · 删除高歧义短词（清华/北大/浙大/复旦/南大）
//   · 补齐敏感机构官方邮箱域名约 40 条
//   · 补齐 13 个个人邮箱后缀（含 aliyun.com）
//   · 补齐英文头衔变体（PhD/Professor/Doctor/Distinguished 等）
//   · 清理子串冗余项（Microsoft Research/副教授/副研究员）
//   · 勘误：博士生导师 与 博导 不构成子串关系，两条均保留
// ============================================================
// 整改项 P0-3：机构与头衔同时为空时的策略
//   "manual" = 转人工核验（默认，保守）
//   "auto"   = 自动放行（若选择此项，必须同步上线频率限制）
export const BLANK_SUBMISSION_POLICY = "manual";
// ─────────────────────────────────────────────────────────────
// A 规则：机构官方邮箱域名 → 机构关键词
// 匹配方式（api/classify.js）：domain === dom || domain.endsWith("." + dom)
//   · 天然免疫 tsinghua.edu.cn.evil.com 类对抗域名（已验证）
// 关键词规范：
//   · 大小写在运行时统一转小写匹配，可按官方写法书写
//   · 只收录无歧义全称/通行简称；高歧义短词一律不收录
// ─────────────────────────────────────────────────────────────
export const DOMAIN_MATCHES = {
  // —— 中国高校（原有 7 所，删歧义短词后保留）——
  "tsinghua.edu.cn": ["清华大学"],
  "pku.edu.cn":      ["北京大学"],
  "fudan.edu.cn":    ["复旦大学"],
  "sjtu.edu.cn":     ["上海交通大学", "上海交大"],
  "zju.edu.cn":      ["浙江大学"],
  "ustc.edu.cn":     ["中国科学技术大学", "中国科大", "USTC"],
  "nju.edu.cn":      ["南京大学"],
  // —— 国内主要高校 ——
  "whu.edu.cn":    ["武汉大学"],
  "hust.edu.cn":   ["华中科技大学", "华中理工"],
  "xjtu.edu.cn":   ["西安交通大学", "西安交大"],
  "hit.edu.cn":    ["哈尔滨工业大学", "哈工大"],
  "sysu.edu.cn":   ["中山大学"],
  "buaa.edu.cn":   ["北京航空航天大学", "北航"],
  "bnu.edu.cn":    ["北京师范大学", "北师大"],
  "tongji.edu.cn": ["同济大学"],
  "nankai.edu.cn": ["南开大学"],
  "tju.edu.cn":    ["天津大学"],
  "scu.edu.cn":    ["四川大学"],
  "xmu.edu.cn":    ["厦门大学"],
  "seu.edu.cn":    ["东南大学"],
  "bit.edu.cn":    ["北京理工大学", "北理工"],
  "ruc.edu.cn":    ["中国人民大学"],
  "ecnu.edu.cn":   ["华东师范大学", "华东师大"],
  "jlu.edu.cn":    ["吉林大学"],
  "lzu.edu.cn":    ["兰州大学"],
  "hnu.edu.cn":    ["湖南大学"],
  "uestc.edu.cn":  ["电子科技大学", "电子科大"],
  "cqu.edu.cn":    ["重庆大学"],
  "nwpu.edu.cn":   ["西北工业大学", "西工大"],
  "dlut.edu.cn":   ["大连理工大学", "大连理工"],
  "scut.edu.cn":   ["华南理工大学", "华南理工"],
  "neu.edu.cn":    ["东北大学"],
  "cau.edu.cn":    ["中国农业大学"],
  // —— 海外高校 ——
  "mit.edu":       ["MIT", "麻省理工学院"],
  "stanford.edu":  ["Stanford", "斯坦福大学"],
  "harvard.edu":   ["Harvard", "哈佛大学"],
  "yale.edu":      ["Yale", "耶鲁大学"],
  "princeton.edu": ["Princeton", "普林斯顿大学"],
  "caltech.edu":   ["Caltech", "加州理工学院"],
  "berkeley.edu":  ["Berkeley", "伯克利", "加州大学伯克利分校"],
  "cmu.edu":       ["CMU", "卡内基梅隆大学", "卡耐基梅隆大学"],
  "cam.ac.uk":     ["Cambridge", "剑桥大学"],
  "ox.ac.uk":      ["Oxford", "牛津大学"],
  "ethz.ch":       ["ETH", "苏黎世联邦理工学院"],
  "universityofcalifornia.edu": ["University of California", "加州大学"],
  "ucla.edu":      ["UCLA", "加州大学洛杉矶分校"],
  // —— 企业 / 机构 ——
  "openai.com":    ["OpenAI"],
  "anthropic.com": ["Anthropic"],
  "deepmind.com":  ["DeepMind"],
  "google.com":    ["Google", "谷歌"],
  "meta.com":      ["Meta"],
  "microsoft.com": ["Microsoft", "微软"],
  "apple.com":     ["Apple", "苹果公司"],
  "deepseek.com":  ["DeepSeek", "深度求索"],
  "bytedance.com": ["ByteDance", "字节跳动", "字节"],
  "alibaba.com":   ["阿里巴巴", "阿里"],
  "tencent.com":   ["Tencent", "腾讯"],
  "huawei.com":    ["Huawei", "华为"],
  "baidu.com":     ["Baidu", "百度"],
  // ⚠️ 中国社会科学院官方邮箱域未经实测确证，
  // 用官方邮箱验证后再启用，禁止未验证上线：
  // "cssn.cn":     ["中国社会科学院", "中国社科院"],
  // "cass.org.cn": ["中国社会科学院", "中国社科院"],
};
// ─────────────────────────────────────────────────────────────
// B 规则前置条件：通用个人邮箱域名
// ─────────────────────────────────────────────────────────────
export const GENERIC_DOMAINS = [
  // Google
  "gmail.com", "googlemail.com",
  // 腾讯
  "qq.com", "foxmail.com",
  // 网易
  "163.com", "126.com", "yeah.net",
  // 微软
  "outlook.com", "hotmail.com", "live.com",
  // 新浪 / 苹果
  "sina.com", "sina.cn", "icloud.com", "me.com",
  // Proton / Yahoo
  "proton.me", "protonmail.com", "yahoo.com", "ymail.com",
  // 运营商
  "139.com", "189.cn", "wo.com.cn",
  // —— v2 新增 ——
  "aliyun.com",
  "tom.com", "sohu.com", "21cn.com", "188.com",
  "aol.com", "msn.com", "gmx.com",
  "mail.ru", "yandex.ru", "zoho.com", "fastmail.com",
];
// ─────────────────────────────────────────────────────────────
// B 规则：敏感机构关键词
// 注：DOMAIN_MATCHES 的全部关键词会在 api/classify.js 中自动并入本集合，
//     此处只列"无独立域名映射或不便收敛进域名表"的条目。
// ─────────────────────────────────────────────────────────────
export const SENSITIVE_INSTITUTIONS = [
  // 科研机构
  "中国科学院", "中科院",
  "中国社会科学院", "中国社科院",
  // 海外 AI / 科技企业
  "OpenAI", "Anthropic", "DeepMind",
  "Google", "谷歌", "Meta",
  "Microsoft", "微软",
  "Apple", "苹果公司",
  // 海外高校（通行中文简称，无歧义）
  "剑桥", "牛津", "伯克利", "CMU", "加州大学",
  // 国内 AI / 科技企业
  "DeepSeek", "深度求索",
  "字节", "ByteDance",
  "阿里巴巴", "阿里",
  "腾讯", "Tencent",
  "华为", "Huawei",
  "百度", "Baidu",
];
// ─────────────────────────────────────────────────────────────
// B 规则：敏感头衔词
// 匹配为子串包含（两侧小写），已知误伤为"宁多勿漏"设计取舍：
//   主任→班主任/办公室主任；校长→中小学/培训机构；所长→诊所/律所；
//   Director→Art Director 等；President→Vice President 等
// 队列过载时再改词边界精确匹配。
// ─────────────────────────────────────────────────────────────
export const SENSITIVE_ROLES = [
  // —— 中文头衔 ——
  "教授",           // 子串覆盖 副教授/助理教授/讲席教授
  "研究员",         // 子串覆盖 副研究员
  "博士生导师",
  "博导",           // ⚠️ 与"博士生导师"不构成子串关系，必须保留
  "院士",
  "博士后",
  "博士",
  "主任",
  "校长",
  "所长",
  "院长",
  "首席",
  "创始人",
  "合伙人",
  "CEO", "CTO", "CFO",
  "杰青", "优青", "长江学者",
  "诺贝尔", "图灵奖", "菲尔兹奖",
  // —— 英文头衔 ——
  "Professor",
  "Director",
  "President",
  "Chancellor", "Dean",
  "Distinguished", "Emeritus",
  "Fellow",
  "Chief",
  "Research Scientist", "Senior Scientist", "Principal Scientist",
  "PhD", "Ph.D",    // 两种写法都必须收录（"ph.d"≠"phd"）
  "Dr.",            // ⚠️ 已知限制：不命中无点的 "Dr"
  "Doctor",
  "Nobel",
];
