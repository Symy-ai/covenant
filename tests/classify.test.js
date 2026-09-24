// 运行：node tests/classify.test.js   （无框架依赖，Node 原生 assert）
// 期望：26/26 passed
import assert from "node:assert/strict";
import { classify } from "../api/classify.js";
const cases = [
  ["A1 子域放行",       { email: "zhang@mail.tsinghua.edu.cn", institution: "清华大学", role: "教授" }, "auto"],
  ["A2 基准放行",       { email: "li@pku.edu.cn", institution: "北京大学", role: "" }, "auto"],
  ["A3 对抗域名",       { email: "a@tsinghua.edu.cn.evil.com", institution: "清华大学", role: "" }, "manual"],
  ["A4 伪域名",         { email: "a@faketsinghua.edu.cn", institution: "清华大学", role: "" }, "manual"],
  ["A5 短词误判已修",   { email: "w@tsinghua.edu.cn", institution: "清华同方", role: "" }, "manual"],
  ["A6 全称子串",       { email: "z@tsinghua.edu.cn", institution: "清华大学附属中学", role: "" }, "auto"],
  ["P01 合并生效",      { email: "a@gmail.com", institution: "清华大学", role: "" }, "manual"],
  ["P01b MIT",          { email: "a@gmail.com", institution: "MIT", role: "" }, "manual"],
  ["P02 小写绕过已封",  { email: "a@gmail.com", institution: "mit", role: "" }, "manual"],
  ["P02b 小写 openai",  { email: "a@gmail.com", institution: "openai", role: "" }, "manual"],
  ["P02c OpenAI 基准",  { email: "a@gmail.com", institution: "OpenAI", role: "" }, "manual"],
  ["P01d 双条件",       { email: "a@gmail.com", institution: "北京大学", role: "教师" }, "manual"],
  ["P03 双空转人工",    { email: "a@gmail.com", institution: "", role: "" }, "manual"],
  ["B 正常用户",        { email: "a@gmail.com", institution: "某科技公司", role: "前端工程师" }, "auto"],
  ["P1-4 副作用",       { email: "a@gmail.com", institution: "清华同方", role: "" }, "auto"],
  ["误伤 Director",     { email: "a@gmail.com", institution: "某公司", role: "Art Director" }, "manual"],
  ["P06 aliyun",        { email: "a@aliyun.com", institution: "某公司", role: "工程师" }, "auto"],
  ["误伤 校长",         { email: "a@163.com", institution: "某小学", role: "校长" }, "manual"],
  ["域名大小写",        { email: "a@GMAIL.COM", institution: "某公司", role: "工程师" }, "auto"],
  ["P07 PhD",           { email: "a@gmail.com", institution: "某大学", role: "PhD" }, "manual"],
  ["P07b Ph.D.",        { email: "a@gmail.com", institution: "某医院", role: "Ph.D." }, "manual"],
  ["P07c Doctor",       { email: "a@gmail.com", institution: "某医院", role: "Doctor" }, "manual"],
  ["C 未知域名",        { email: "a@unknown-corp.com", institution: "某公司", role: "工程师" }, "manual"],
  ["C 无 @ 容错",       { email: "not-an-email", institution: "清华大学", role: "" }, "manual"],
  ["P14b 多 @ 解析",    { email: "a@b@c.com", institution: "", role: "" }, "manual"],
  ["A7 邮箱大小写",     { email: "A@Mail.Tsinghua.Edu.CN", institution: "清华大学", role: "" }, "auto"],
];
let failed = 0;
for (const [name, input, expected] of cases) {
  try {
    assert.strictEqual(classify(input), expected, name);
    console.log("PASS " + name);
  } catch (e) {
    failed++;
    console.error("FAIL " + name + " -> " + e.message);
  }
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
