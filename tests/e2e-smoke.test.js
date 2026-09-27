// ============================================================
// e2e 冒烟：邮件签名全链的 HTTP 层契约（node:test，无框架依赖）
//
// 覆盖：
//   POST /api/sign     校验失败的 400 形状 / GitHub 写失败 → 500 + logError / 蜜罐 / 查重 / 邮件失败回滚
//   GET  /api/confirm  坏令牌 → invalid / auto 路径 → ok + 写 verified + 删 pending
//                       manual 路径 → pending-review 分支 PUT 失败 → ghEnsureBranch → 重试成功
//                       （batch116-a 回归护栏）/ 重试再失败 → logError 但用户仍见 pending
//
// 不起真服务器：直接 import handler，注入极简 req/res 桩。
// 不触网：lib/github.js 全走 setTestOverrides 桩；globalThis.fetch 拦下 Resend 与观测上报。
// 运行：node --test tests/*.test.js
// ============================================================
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { setTestOverrides } from "../lib/github.js";
import { setTestLogError, hashId } from "../lib/monitoring.js";
import signHandler from "../api/sign.js";
import confirmHandler from "../api/confirm.js";

// ---------- 测试替身 ----------

/** 极简 res 桩：截获 status / json / redirect / setHeader；end() 幂等且不写 socket */
function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    redirect: undefined,
    ended: false,
    setHeader(k, v) {
      this.headers[k] = v;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(obj) {
      this.body = obj;
      this.ended = true;
      return this;
    },
    redirect(code, url) {
      this.redirect = { code, url };
      this.statusCode = code;
      this.ended = true;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
  return res;
}

const mockReq = (o = {}) => ({ method: "GET", query: {}, body: {}, headers: {}, ...o });

/** 记录全部 lib/github.js 调用的假 GitHub */
function installGitHub(overrides = {}) {
  const calls = [];
  const record = (name) =>
    (...args) => {
      calls.push({ fn: name, args });
      return overrides[name] ? overrides[name](...args) : undefined;
    };
  setTestOverrides({
    ghGet: record("ghGet"),
    ghPut: record("ghPut"),
    ghDelete: record("ghDelete"),
    ghList: record("ghList"),
    ghEnsureBranch: record("ghEnsureBranch"),
  });
  return calls;
}

const putsTo = (calls, path, branch) =>
  calls.filter((c) => c.fn === "ghPut" && c.args[0] === path && (!branch || (c.args[3] || {}).branch === branch));

/** 把 logError 的 console.error 静音（断言用桩捕获，避免污染 TAP） */
function captureLogError() {
  const errors = [];
  setTestLogError((e, context) => errors.push({ message: String((e && e.message) || e), context }));
  const realConsoleError = console.error;
  console.error = () => {};
  return {
    errors,
    restore() {
      console.error = realConsoleError;
      setTestLogError(null);
    },
  };
}

/** 全局 fetch 桩：默认 404（Resend/观测都不该被打到真网） */
function installFetch(handler) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler ? handler(String(url), init) : new Response("", { status: 404 });
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const EMAIL = "ada@example.com";
const HASH = hashId(EMAIL);
const TOKEN = "3f2504e0-4f89-41d3-9a0c-0305e82c3301"; // 36 位，形态匹配确认端点的令牌正则
const PENDING_BODY = {
  name: "Ada",
  institution: "",
  role: "前端工程师",
  email: EMAIL, // 旧记录形态（真实 sign 阶段不落明文；confirm 对两种形态都要兼容）
};

const sign400Body = (patch = {}) => ({
  name: "Ada",
  email: EMAIL,
  agree: true,
  ...patch,
});

// 有 env 就停用观测通道：单测不能因为 Sentry/PostHog 的 URL 形态变化而红
for (const k of ["SENTRY_DSN", "POSTHOG_API_KEY", "POSTHOG_HOST"]) delete process.env[k];

let fetchStub;
let logStub;

beforeEach(() => {
  fetchStub = installFetch();
  setTestOverrides(null);
  setTestLogError(null);
});

afterEach(() => {
  fetchStub.restore();
  console.error = console.error;
  setTestOverrides(null);
  setTestLogError(null);
});

// ---------- POST /api/sign ----------

test("sign: 非 POST → 405 method_not_allowed", async () => {
  installGitHub();
  const res = mockRes();
  await signHandler(mockReq({ method: "GET" }), res);
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: "method_not_allowed" });
});

test("sign: 缺 name / email / agree → 400 validation_failed（逐字段点名）", async () => {
  for (const [name, body] of [
    ["缺 name", { email: EMAIL, agree: true }],
    ["name 过短", { name: "A", email: EMAIL, agree: true }],
    ["name 过长", { name: "x".repeat(51), email: EMAIL, agree: true }],
    ["缺 email", { name: "Ada", agree: true }],
    ["缺 agree", { name: "Ada", email: EMAIL }],
  ]) {
    const calls = installGitHub();
    const res = mockRes();
    await signHandler(mockReq({ method: "POST", body }), res);
    assert.equal(res.statusCode, 400, name);
    assert.equal(res.body.error, "validation_failed", name);
    assert.ok(Array.isArray(res.body.fields), name);
    assert.ok(res.body.fields.length > 0, name);
    assert.equal(calls.length, 0, `${name}：校验失败不得触碰 GitHub`);
  }
});

test("sign: email 非法格式 → 400 且 fields 含 email", async () => {
  for (const bad of ["not-an-email", "a@b", "a b@c.com", "@b.com", "a@.com", "a@b.com x"]) {
    const install = installGitHub();
    const res = mockRes();
    await signHandler(mockReq({ method: "POST", body: sign400Body({ email: bad }) }), res);
    assert.equal(res.statusCode, 400, bad);
    assert.equal(res.body.error, "validation_failed", bad);
    assert.ok(res.body.fields.includes("email"), `${bad} → ${JSON.stringify(res.body.fields)}`);
    assert.equal(install.length, 0, `${bad}：不得触碰 GitHub`);
  }
});

test("sign: institution / role 超长 → 400 且点名对应字段", async () => {
  const r1 = mockRes();
  await signHandler(mockReq({ method: "POST", body: sign400Body({ institution: "x".repeat(101) }) }), r1);
  assert.equal(r1.statusCode, 400);
  assert.ok(r1.body.fields.includes("institution"));

  const r2 = mockRes();
  await signHandler(mockReq({ method: "POST", body: sign400Body({ role: "x".repeat(51) }) }), r2);
  assert.equal(r2.statusCode, 400);
  assert.ok(r2.body.fields.includes("role"));
});

test("sign: OPTIONS → 204 CORS 预检", async () => {
  installGitHub();
  const res = mockRes();
  await signHandler(mockReq({ method: "OPTIONS" }), res);
  assert.equal(res.statusCode, 204);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});

test("sign: 蜜罐字段 website → 静默 200（不埋点、不触网）", async () => {
  const calls = installGitHub();
  const res = mockRes();
  await signHandler(mockReq({ method: "POST", body: sign400Body({ website: "http://spam.example" }) }), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(calls.length, 0, "蜜罐命中不得碰 GitHub");
  assert.equal(fetchStub.calls.length, 0, "蜜罐命中不得发邮件");
});

test("sign: 已 verified → 409 already_signed", async () => {
  installGitHub({ ghGet: async (p) => (p === `signatures/verified/${HASH}.json` ? { sha: "s1", content: {} } : null) });
  const res = mockRes();
  await signHandler(mockReq({ method: "POST", body: sign400Body() }), res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: "already_signed" });
});

test("sign: 同邮箱已有 pending → 429 already_pending", async () => {
  installGitHub({
    ghGet: async () => null,
    ghList: async () => [`${HASH}.some-other-token.json`],
  });
  const res = mockRes();
  await signHandler(mockReq({ method: "POST", body: sign400Body() }), res);
  assert.equal(res.statusCode, 429);
  assert.deepEqual(res.body, { error: "already_pending" });
});

test("sign: GitHub 写失败（ghPut 抛错）→ 500 internal_error + logError（不崩）", async () => {
  const err = new Error("ghPut signatures/pending/... → 500: boom");
  const calls = installGitHub({ ghGet: async () => null, ghList: async () => [], ghPut: async () => { throw err; } });
  logStub = captureLogError();
  try {
    const res = mockRes();
    await signHandler(mockReq({ method: "POST", body: sign400Body() }), res);
    assert.equal(res.statusCode, 500, "GitHub 写失败必须收敛为 500");
    assert.deepEqual(res.body, { error: "internal_error" });
    assert.equal(res.ended, true, "响应必须被 end，避免挂起");
    assert.equal(logStub.errors.length, 1, "logError 必须被调用一次");
    assert.equal(logStub.errors[0].message, err.message);
    assert.equal(logStub.errors[0].context.stage, "sign");
    assert.equal(calls.filter((c) => c.fn === "ghPut").length, 1);
    assert.equal(fetchStub.calls.length, 0, "写 pending 失败后不得继续发邮件");
  } finally {
    logStub.restore();
  }
});

test("sign: Resend 发送失败 → 502 email_send_failed + 回滚 pending + logError", async () => {
  const calls = installGitHub({
    ghGet: async () => null,
    ghList: async () => [],
    ghPut: async () => ({ conflict: false, sha: "c1" }),
  });
  fetchStub.restore();
  fetchStub = installFetch((url) =>
    url.startsWith("https://api.resend.com/") ? new Response("nope", { status: 500 }) : new Response("", { status: 404 })
  );
  logStub = captureLogError();
  try {
    const res = mockRes();
    await signHandler(mockReq({ method: "POST", body: sign400Body() }), res);
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, { error: "email_send_failed" });
    assert.equal(putsTo(calls, `signatures/verified/${HASH}.json`).length, 0);
    assert.equal(logStub.errors.length, 1);
    assert.equal(logStub.errors[0].message, "resend_send_failed");
    assert.equal(logStub.errors[0].context.status, 500);
  } finally {
    logStub.restore();
  }
});

test("sign: happy path → 200 + 写 pending/（文件名含哈希与令牌、不落明文邮箱）", async () => {
  const calls = installGitHub({ ghGet: async () => null, ghList: async () => [] });
  fetchStub.restore();
  fetchStub = installFetch((url) =>
    url.startsWith("https://api.resend.com/") ? new Response(JSON.stringify({ id: "mail_1" }), { status: 200 }) : new Response("", { status: 404 })
  );
  const res = mockRes();
  await signHandler(mockReq({ method: "POST", body: sign400Body() }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  assert.match(res.body.message, /确认邮件/);
  const pending = calls.filter((c) => c.fn === "ghPut" && c.args[0].startsWith("signatures/pending/"));
  assert.equal(pending.length, 1);
  const [path, obj] = pending[0].args;
  assert.match(path, new RegExp(`^signatures/pending/${HASH}\\.[0-9a-f-]{36}\\.json$`));
  assert.equal(obj.emailHash, HASH);
  assert.equal(obj.emailDomain, "example.com");
  assert.equal(obj.email, undefined, "公开仓不落明文邮箱");
  const mail = fetchStub.calls.find((c) => c.url.startsWith("https://api.resend.com/emails"));
  assert.ok(mail, "必须真的向 Resend 发起发送");
  assert.match(mail.init.headers.Authorization, /^Bearer /);
});

// ---------- GET /api/confirm ----------

test("confirm: 缺令牌 / 非法格式令牌 → 302 invalid", async () => {
  for (const q of [{}, { t: "nope" }, { t: "3f2504e0-4f89-41d3-9a0c-0305e82c330" }, { t: "ZZ2504e0-4f89-41d3-9a0c-0305e82c3301" }]) {
    const calls = installGitHub();
    const res = mockRes();
    await confirmHandler(mockReq({ method: "GET", query: q }), res);
    assert.equal(res.statusCode, 302, JSON.stringify(q));
    assert.match(res.redirect.url, /status=invalid/, JSON.stringify(q));
    assert.match(res.redirect.url, /lang=zh/, "缺省中文");
    assert.equal(calls.length, 0, "非法令牌不得触网");
  }
});

test("confirm: 令牌格式非法但给了 lang=en → redirect 穿透 en", async () => {
  installGitHub();
  const res = mockRes();
  await confirmHandler(mockReq({ method: "GET", query: { t: "bad", lang: "en" } }), res);
  assert.equal(res.statusCode, 302);
  assert.match(res.redirect.url, /status=invalid/);
  assert.match(res.redirect.url, /lang=en/);
});

test("confirm: 非 GET → 405 method_not_allowed", async () => {
  installGitHub();
  const res = mockRes();
  await confirmHandler(mockReq({ method: "POST" }), res);
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: "method_not_allowed" });
});

test("confirm: 无 pending 且无墓碑 → 302 expired", async () => {
  const calls = installGitHub({ ghList: async () => [], ghGet: async () => null });
  const res = mockRes();
  await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN, lang: "en" } }), res);
  assert.equal(res.statusCode, 302);
  assert.match(res.redirect.url, /status=expired/);
  assert.match(res.redirect.url, /lang=en/);
  assert.equal(calls.filter((c) => c.fn === "ghGet").length, 1, "只查一次墓碑");
});

test("confirm: 已确认过的链接重开（墓碑）→ 302 ok（auto）", async () => {
  installGitHub({
    ghList: async () => [],
    ghGet: async (p) => (p === `signatures/tokens/${TOKEN}.json` ? { sha: "t1", content: { emailHash: HASH, result: "auto" } } : null),
  });
  const res = mockRes();
  await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN } }), res);
  assert.equal(res.statusCode, 302);
  assert.match(res.redirect.url, /status=ok/);
});

test("confirm: 人工队列墓碑重开 → 302 pending（非 invalid）", async () => {
  installGitHub({
    ghList: async () => [],
    ghGet: async (p) => (p === `signatures/tokens/${TOKEN}.json` ? { sha: "t1", content: { emailHash: HASH, result: "manual" } } : null),
  });
  const res = mockRes();
  await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN } }), res);
  assert.equal(res.statusCode, 302);
  assert.match(res.redirect.url, /status=pending/);
  assert.doesNotMatch(res.redirect.url, /status=invalid/);
});

/** auto 路径（机构官方域名 + 关键词）的 GitHub 桩 */
function autoPending() {
  return {
    ghList: async (dir) => (dir === "signatures/pending" ? [`${HASH}.${TOKEN}.json`] : []),
    ghGet: async (p) => {
      if (p === `signatures/pending/${HASH}.${TOKEN}.json`) {
        return { sha: "p1", content: { ...PENDING_BODY, emailHash: HASH, email: undefined, emailDomain: "tsinghua.edu.cn", institution: "清华大学", role: "教授" } };
      }
      return null; // verified 不存在 → 非重复
    },
  };
}

test("confirm: auto 路径 → 302 ok + 写 verified + 删 pending + 写令牌墓碑", async () => {
  const calls = installGitHub(autoPending());
  const res = mockRes();
  await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN, lang: "en" } }), res);
  assert.equal(res.statusCode, 302);
  assert.match(res.redirect.url, /status=ok/);
  assert.match(res.redirect.url, /lang=en/);

  const verified = putsTo(calls, `signatures/verified/${HASH}.json`);
  assert.equal(verified.length, 1, "auto 必须写 verified");
  assert.equal(verified[0].args[1].emailHash, HASH);
  assert.equal(verified[0].args[1].name, "Ada");
  assert.ok(verified[0].args[1].confirmedAt, "verified 记录须带确认时间");

  const dels = calls.filter((c) => c.fn === "ghDelete");
  assert.equal(dels.length, 1, "auto 必须删掉 pending");
  assert.equal(dels[0].args[0], `signatures/pending/${HASH}.${TOKEN}.json`);
  assert.equal(dels[0].args[1], "p1", "删除须带 pending 的 sha");

  assert.equal(putsTo(calls, `signatures/tokens/${TOKEN}.json`).length, 1, "须写令牌墓碑（重开链接回显 ok）");
  assert.equal(putsTo(calls, `signatures/pending/${HASH}.${TOKEN}.json`).length, 0, "auto 不进人工队列");
  assert.equal(calls.filter((c) => c.fn === "ghEnsureBranch").length, 0);
});

test("confirm: 令牌长度合法但 pending 文件被删（中途消失）→ 302 invalid + logError（不崩）", async () => {
  installGitHub({
    ghList: async () => [`${HASH}.${TOKEN}.json`],
    ghGet: async () => null, // 列目录后文件被清理/未提交
  });
  logStub = captureLogError();
  try {
    const res = mockRes();
    await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN } }), res);
    assert.equal(res.statusCode, 302);
    assert.match(res.redirect.url, /status=invalid/);
    assert.ok(logStub.errors.length >= 1, "异常必须上报");
  } finally {
    logStub.restore();
  }
});

test("confirm: 读 pending 抛错（GitHub 5xx）→ 302 error（非 invalid）+ logError（不崩）", async () => {
  installGitHub({
    ghList: async () => [`${HASH}.${TOKEN}.json`],
    ghGet: async (p) => {
      if (p.startsWith("signatures/pending/")) throw new Error("ghGet → 502: upstream down");
      return null;
    },
  });
  logStub = captureLogError();
  try {
    const res = mockRes();
    await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN, lang: "en" } }), res);
    assert.equal(res.statusCode, 302);
    assert.match(res.redirect.url, /status=error/, "上游故障是系统繁忙，不是链接失效");
    assert.doesNotMatch(res.redirect.url, /status=invalid/);
    assert.match(res.redirect.url, /lang=en/);
    assert.equal(logStub.errors.length, 1);
    assert.equal(logStub.errors[0].context.stage, "confirm-pending-read");
  } finally {
    logStub.restore();
  }
});

// ---------- b122 边界护栏：故障 vs 失效 vs 数据损坏 ----------

test("confirm [b122]: 读 pending 遇网络层故障（fetch reject）→ status=error，且不查 verified/不写任何文件", async () => {
  const calls = installGitHub({
    ghList: async () => [`${HASH}.${TOKEN}.json`],
    ghGet: async (p) => {
      if (p.startsWith("signatures/pending/")) {
        const e = new Error("ghGet signatures/pending/x.json → network error: fetch failed");
        e.status = 0;
        throw e;
      }
      return null;
    },
  });
  logStub = captureLogError();
  try {
    const res = mockRes();
    await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN } }), res);
    assert.equal(res.statusCode, 302);
    assert.match(res.redirect.url, /status=error/, "网络错 = 系统繁忙，不是链接失效");
    assert.doesNotMatch(res.redirect.url, /status=invalid/);
    assert.doesNotMatch(res.redirect.url, /status=expired/);
    assert.equal(logStub.errors.length, 1, "上游故障必须上报");
    assert.equal(logStub.errors[0].context.stage, "confirm-pending-read");
    assert.equal(logStub.errors[0].context.fileName, `${HASH}.${TOKEN}.json`, "上报须带文件名便于定位");
    const getPaths = calls.filter((c) => c.fn === "ghGet").map((c) => c.args[0]);
    assert.ok(
      getPaths.every((p) => p.startsWith("signatures/pending/")),
      `故障后不得继续查 verified（读了才可能误判 duplicate/放行）：${JSON.stringify(getPaths)}`,
    );
    assert.equal(calls.filter((c) => c.fn === "ghPut").length, 0, "故障路径不得写任何文件");
    assert.equal(calls.filter((c) => c.fn === "ghDelete").length, 0, "故障路径不得删 pending");
  } finally {
    logStub.restore();
  }
});

test("confirm [b122]: pending 缺 name（数据损坏）→ 转人工（写 pending-review）而非 duplicate", async () => {
  const HASH_OF_UNDEFINED = hashId(undefined); // 旧实现会拿它去撞 verified → 伪装成"已签署过"
  const calls = installGitHub({
    ghList: async (dir) => (dir === "signatures/pending" ? [`${HASH}.${TOKEN}.json`] : []),
    ghGet: async (p) => {
      if (p === `signatures/pending/${HASH}.${TOKEN}.json`) return { sha: "p1", content: { institution: "某大学", role: "教授" } };
      if (p === `signatures/verified/${HASH_OF_UNDEFINED}.json`) return { sha: "v1", content: { name: "某个已签者" } };
      return null;
    },
  });
  logStub = captureLogError();
  try {
    const res = mockRes();
    await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN } }), res);
    assert.equal(res.statusCode, 302);
    assert.doesNotMatch(res.redirect.url, /status=duplicate/, "缺 name 的损坏记录不得被当作已签署");
    assert.match(res.redirect.url, /status=pending/, "缺关键字段 → 转人工");

    assert.ok(
      !calls.some((c) => c.fn === "ghGet" && c.args[0] === `signatures/verified/${HASH_OF_UNDEFINED}.json`),
      "不得对 undefined 求哈希后再查 verified（旧 bug 的误判入口）",
    );
    assert.equal(logStub.errors.length, 1, "损坏数据必须上报");
    assert.equal(logStub.errors[0].message, "pending_malformed");
    assert.equal(logStub.errors[0].context.stage, "confirm-malformed-pending");
    assert.deepEqual(logStub.errors[0].context.missing, ["name", "emailHash/email"]);

    const queued = putsTo(calls, `signatures/pending/${HASH}.${TOKEN}.json`, "pending-review");
    assert.equal(queued.length, 1, "必须写入 pending-review 人工队列");
    assert.ok(queued[0].args[1].reviewQueuedAt, "入队记录须带入队时间");
    assert.equal(queued[0].args[1].institution, "某大学", "入队记录保留原字段，交人工判读");
    assert.equal(putsTo(calls, `signatures/verified/${HASH}.${TOKEN}.json`).length, 0);
    assert.equal(calls.filter((c) => c.fn === "ghGet" && c.args[0].startsWith("signatures/verified/")).length, 0, "损坏数据不查重");
    assert.equal(calls.filter((c) => c.fn === "ghDelete").length, 0, "损坏数据不得删 pending 原件");
    assert.equal(putsTo(calls, `signatures/tokens/${TOKEN}.json`).length, 0, "无身份来源 → 无从写墓碑");
  } finally {
    logStub.restore();
  }
});

test("confirm [b122]: pending 读不到（真 404/ghGet→null）→ 仍是 invalid（旧行为不回归）", async () => {
  // 契约层（桩返回 null，等价于 lib/github.js 对 404 的唯一降级路径）
  const calls = installGitHub({
    ghList: async () => [`${HASH}.${TOKEN}.json`],
    ghGet: async () => null,
  });
  logStub = captureLogError();
  try {
    const res = mockRes();
    await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN } }), res);
    assert.equal(res.statusCode, 302);
    assert.match(res.redirect.url, /status=invalid/, "真 404 仍回 invalid（与上游故障区分）");
    assert.doesNotMatch(res.redirect.url, /status=error/);
    assert.ok(logStub.errors.length >= 1, "读空必须上报");
    assert.equal(calls.filter((c) => c.fn === "ghPut").length, 0, "读不到不写任何文件");
  } finally {
    logStub.restore();
  }
});

test("护栏·ghGet [b122]: 传输层故障绝不降级成 null（非 404 一律抛，带 status/cause）", async () => {
  defaultGitHub();
  // ① fetch 本身 reject（DNS/超时/连接重置）——此前会冒出 "fetch failed" 原生错，与业务错无法区分
  fetchStub.restore();
  fetchStub = installFetch(() => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(
    () => GH.ghGet("signatures/pending/x.json"),
    (e) => {
      assert.match(e.message, /ghGet signatures\/pending\/x\.json → network error: fetch failed/);
      assert.equal(e.status, 0, "网络层故障 status=0，供上层分流");
      assert.ok(e.cause instanceof TypeError, "原始错误挂在 cause 上，不丢栈");
      return true;
    },
  );
  assert.equal(fetchStub.calls.length, 1, "确实发起了请求（只是失败了），不是提前短路");

  // ② 5xx：带状态码抛出，调用方据此判"上游故障"
  fetchStub.restore();
  fetchStub = installFetch(() => new Response("boom", { status: 503 }));
  await assert.rejects(
    () => GH.ghGet("signatures/pending/x.json"),
    (e) => {
      assert.equal(e.message, "ghGet signatures/pending/x.json → 503");
      assert.equal(e.status, 503);
      return true;
    },
  );

  // ③ 404：唯一允许返回 null 的情形（文件真不存在）
  fetchStub.restore();
  fetchStub = installFetch(() => new Response("", { status: 404 }));
  assert.equal(await GH.ghGet("signatures/pending/x.json"), null, "404 仍是 null（不回归）");
});

test("confirm: 已 verified（重复确认）→ 302 duplicate + 清理残留 pending", async () => {
  const calls = installGitHub({
    ghList: async () => [`${HASH}.${TOKEN}.json`],
    ghGet: async (p) => {
      if (p === `signatures/pending/${HASH}.${TOKEN}.json`) return { sha: "p1", content: { ...PENDING_BODY, emailHash: HASH } };
      if (p === `signatures/verified/${HASH}.json`) return { sha: "v1", content: { name: "Ada" } };
      return null;
    },
  });
  const res = mockRes();
  await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN } }), res);
  assert.equal(res.statusCode, 302);
  assert.match(res.redirect.url, /status=duplicate/);
  assert.equal(putsTo(calls, `signatures/verified/${HASH}.json`).length, 0, "重复确认不得再写 verified");
  const dels = calls.filter((c) => c.fn === "ghDelete");
  assert.equal(dels.length, 1, "须清掉残留 pending");
  assert.match(dels[0].args[2], /^cleanup-dup: /);
});

/** manual 路径（未知域名 → 转人工）的 GitHub 桩 */
function manualPending(overrides = {}) {
  return {
    ghList: async (dir) => (dir === "signatures/pending" ? [`${HASH}.${TOKEN}.json`] : []),
    ghGet: async (p) =>
      p === `signatures/pending/${HASH}.${TOKEN}.json` ? { sha: "p1", content: { ...PENDING_BODY, emailHash: HASH } } : null,
    ...overrides,
  };
}

test("confirm: manual 路径 → 写 pending-review 分支 + 302 pending + 不碰 main verified", async () => {
  const calls = installGitHub(manualPending());
  const res = mockRes();
  await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN } }), res);
  assert.equal(res.statusCode, 302);
  assert.match(res.redirect.url, /status=pending/);
  const queued = putsTo(calls, `signatures/pending/${HASH}.${TOKEN}.json`, "pending-review");
  assert.equal(queued.length, 1, "manual 必须写 pending-review 分支");
  assert.ok(queued[0].args[1].reviewQueuedAt, "入队记录须带入队时间");
  assert.equal(queued[0].args[1].name, "Ada", "入队记录须保留原字段");
  assert.equal(putsTo(calls, `signatures/verified/${HASH}.json`).length, 0, "manual 不得写 verified");
  assert.equal(calls.filter((c) => c.fn === "ghDelete").length, 0, "manual 保留 main 上的 pending 原件");
  assert.equal(calls.filter((c) => c.fn === "ghEnsureBranch").length, 0, "首次写入成功不需要建分支");
  assert.equal(putsTo(calls, `signatures/tokens/${TOKEN}.json`).length, 1, "manual 同样写墓碑（result=manual）");
});

test("confirm [batch116-a]: pending-review 分支不存在（PUT 404）→ 建分支 + 重试成功 + 用户见 pending", async () => {
  let attempts = 0;
  const calls = installGitHub(
    manualPending({
      ghPut: async (path, obj, msg, opts) => {
        if (path === `signatures/pending/${HASH}.${TOKEN}.json` && (opts || {}).branch === "pending-review") {
          attempts++;
          if (attempts === 1) throw new Error("ghPut → 404: branch not found"); // 分支尚未建立
        }
        return { conflict: false, sha: "c1" };
      },
    })
  );
  logStub = captureLogError();
  try {
    const res = mockRes();
    await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN, lang: "en" } }), res);
    assert.equal(res.statusCode, 302);
    assert.match(res.redirect.url, /status=pending/, "队列写入最终成功 → 用户见 pending");
    assert.match(res.redirect.url, /lang=en/);
    assert.equal(attempts, 2, "第一次 404 + 一次重试");
    const ensure = calls.filter((c) => c.fn === "ghEnsureBranch");
    assert.equal(ensure.length, 1, "重试前必须先建 pending-review 分支");
    assert.equal(ensure[0].args[0], "pending-review");
    assert.equal(ensure[0].args[1], "main", "从 main HEAD 建引用");
    assert.equal(putsTo(calls, `signatures/pending/${HASH}.${TOKEN}.json`, "pending-review").length, 2);
    assert.equal(logStub.errors.length, 0, "重试成功不应报错");
    assert.equal(putsTo(calls, `signatures/tokens/${TOKEN}.json`).length, 1, "入队后写墓碑");
  } finally {
    logStub.restore();
  }
});

test("confirm [batch116-a]: 建分支后重试仍失败 → logError + 用户仍见 pending（非 invalid）+ main pending 保留", async () => {
  const boom = new Error("ghPut → 500: still broken");
  const calls = installGitHub(
    manualPending({
      ghPut: async (path, obj, msg, opts) => {
        if (path === `signatures/pending/${HASH}.${TOKEN}.json` && (opts || {}).branch === "pending-review") throw boom;
        return { conflict: false, sha: "c1" };
      },
    })
  );
  logStub = captureLogError();
  try {
    const res = mockRes();
    await confirmHandler(mockReq({ method: "GET", query: { t: TOKEN } }), res);
    assert.equal(res.statusCode, 302);
    assert.match(res.redirect.url, /status=pending/, "队列失败不得让用户看到 invalid（人工扫表兜底）");
    assert.doesNotMatch(res.redirect.url, /status=invalid/);
    assert.equal(calls.filter((c) => c.fn === "ghEnsureBranch").length, 1, "仍须尝试建分支");
    assert.equal(putsTo(calls, `signatures/pending/${HASH}.${TOKEN}.json`, "pending-review").length, 2, "一次原始 + 一次重试");
    assert.equal(logStub.errors.length, 1, "终 catch 必须上报一次");
    assert.equal(logStub.errors[0].message, boom.message);
    assert.equal(logStub.errors[0].context.stage, "confirm-pending-review");
    assert.equal(logStub.errors[0].context.emailHash, HASH);
    assert.equal(calls.filter((c) => c.fn === "ghDelete").length, 0, "人工队列失败不得删 main pending");
    assert.equal(putsTo(calls, `signatures/verified/${HASH}.json`).length, 0);
  } finally {
    logStub.restore();
  }
});

// ---------- 护栏自检：测试缝不改变生产默认行为 ----------
// 直接对 lib/github.js 六个导出做「钉死值」断言。断言里的期望值 = 加钩子前的既有契约
// （HTTP 状态码 → 返回值/异常），钩子默认关闭时必须逐条仍然成立。
const GH = (await import("../lib/github.js"));
const overrideGitHub = () => GH.setTestOverrides({});
const defaultGitHub = () => GH.setTestOverrides(null);
const GH_PATH = "https://api.github.com/repos/symy-ai/covenant"; // GITHUB_REPO 未设 → 默认仓库

test("护栏·ghGet: 200 解 base64 / 404→null / 500 抛错（钩子关闭时行为不变）", async () => {
  defaultGitHub();
  let req = null;
  fetchStub.restore();
  fetchStub = installFetch((url, init) => {
    req = { url, method: init.method || "GET", auth: init.headers.Authorization, accept: init.headers.Accept };
    return new Response(JSON.stringify({ sha: "s1", content: Buffer.from('{"a":1}', "utf8").toString("base64") }), { status: 200 });
  });
  assert.deepEqual(await GH.ghGet("signatures/x.json"), { sha: "s1", content: { a: 1 } });
  assert.ok(req.url.startsWith(`${GH_PATH}/contents/signatures/x.json?ref=main`), req.url);
  assert.equal(req.auth, "Bearer undefined"); // GITHUB_TOKEN 未设 → 生产同形态
  assert.equal(req.accept, "application/vnd.github+json");

  fetchStub.restore();
  fetchStub = installFetch(() => new Response("", { status: 404 }));
  assert.equal(await GH.ghGet("signatures/missing.json"), null);

  fetchStub.restore();
  fetchStub = installFetch(() => new Response("boom", { status: 500 }));
  await assert.rejects(() => GH.ghGet("signatures/x.json"), /ghGet signatures\/x\.json → 500/);
});

test("护栏·ghPut: 成功返回 commit sha / 409→{conflict:true} / 5xx 抛错且带正文摘要", async () => {
  defaultGitHub();
  let body = null;
  fetchStub.restore();
  fetchStub = installFetch((url, init) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ commit: { sha: "c1" } }), { status: 200 });
  });
  assert.deepEqual(await GH.ghPut("signatures/x.json", { a: 1 }, "msg: 签名", { branch: "pending-review" }), {
    conflict: false,
    sha: "c1",
  });
  assert.equal(body.branch, "pending-review");
  assert.equal(body.message, "msg: 签名");
  assert.equal(Buffer.from(body.content, "base64").toString("utf8"), JSON.stringify({ a: 1 }, null, 2), "落盘格式（两空格缩进）不变");
  assert.equal(body.sha, undefined, "未传 sha 时请求体不得带 sha");

  fetchStub.restore();
  fetchStub = installFetch(() => new Response("", { status: 409 }));
  assert.deepEqual(await GH.ghPut("signatures/x.json", { a: 1 }, "m", { sha: "old" }), { conflict: true });

  fetchStub.restore();
  fetchStub = installFetch(() => new Response("server exploded", { status: 500 }));
  await assert.rejects(() => GH.ghPut("signatures/x.json", { a: 1 }, "m"), /ghPut signatures\/x\.json → 500: server exploded/);
});

test("护栏·ghDelete: 204/404 静默成功 / 500 抛错", async () => {
  defaultGitHub();
  for (const status of [204, 404]) {
    fetchStub.restore();
    fetchStub = installFetch((url, init) => {
      const b = JSON.parse(init.body);
      assert.equal(init.method, "DELETE");
      assert.equal(b.sha, "s1");
      return new Response(status === 204 ? null : "", { status });
    });
    assert.equal(await GH.ghDelete("signatures/x.json", "s1", "confirm: x"), undefined);
  }
  fetchStub.restore();
  fetchStub = installFetch(() => new Response("", { status: 500 }));
  await assert.rejects(() => GH.ghDelete("signatures/x.json", "s1", "m"), /ghDelete signatures\/x\.json → 500/);
});

test("护栏·ghList: 只保留 file 项 / 空目录与不存在→[]", async () => {
  defaultGitHub();
  fetchStub.restore();
  fetchStub = installFetch(() =>
    new Response(JSON.stringify([{ type: "file", name: "a.json" }, { type: "dir", name: "sub" }, { type: "file", name: "b.json" }]), { status: 200 })
  );
  assert.deepEqual(await GH.ghList("signatures/pending"), ["a.json", "b.json"]);
  fetchStub.restore();
  fetchStub = installFetch(() => new Response("", { status: 404 }));
  assert.deepEqual(await GH.ghList("signatures/pending"), []);
});

test("护栏·ghEnsureBranch: 幂等（已存在 no-op / 422 race 视成功 / 不存在则从 main 建）", async () => {
  defaultGitHub();
  const refProbe = (status, body = "") => {
    fetchStub.restore();
    fetchStub = installFetch((url, init) => {
      const path = new URL(url).pathname;
      if (path.endsWith(`/git/ref/${encodeURIComponent("refs/heads/pending-review")}`)) return new Response(body, { status });
      if (path.endsWith("/git/ref/heads/main")) return new Response(JSON.stringify({ object: { sha: "base-sha" } }), { status: 200 });
      return new Response(JSON.stringify({ ref: "refs/heads/pending-review" }), { status: 201 });
    });
  };
  refProbe(200); // 分支已存在
  assert.deepEqual(await GH.ghEnsureBranch("pending-review"), { created: false });

  refProbe(404); // 不存在 → 建；并发下 422 = 别人先建出 → 视为成功
  assert.deepEqual(await GH.ghEnsureBranch("pending-review"), { created: true });

  refProbe(404);
  fetchStub.restore();
  fetchStub = installFetch((url, init) => {
    const path = new URL(url).pathname;
    if (path === `/repos/symy-ai/covenant/git/ref/${encodeURIComponent("refs/heads/pending-review")}`) {
      return new Response("", { status: 404 });
    }
    if (path === "/repos/symy-ai/covenant/git/ref/heads/main") {
      return new Response(JSON.stringify({ object: { sha: "base-sha" } }), { status: 200 });
    }
    assert.equal(path, "/repos/symy-ai/covenant/git/refs");
    assert.equal(init.method, "POST");
    assert.equal(JSON.parse(init.body).ref, "refs/heads/pending-review");
    assert.equal(JSON.parse(init.body).sha, "base-sha", "须以 main 的 HEAD sha 建引用");
    return new Response(JSON.stringify({}), { status: 422 });
  });
  assert.deepEqual(await GH.ghEnsureBranch("pending-review"), { created: false }, "422 race 视为成功");
});

test("护栏: 钩子开启时对应导出被完全短路（fetch 零调用），关闭时恢复真实请求", async () => {
  overrideGitHub();
  const hits = [];
  GH.setTestOverrides({
    ghGet: async () => { hits.push("ghGet"); return "SENTINEL"; },
    ghPut: async () => { hits.push("ghPut"); return "SENTINEL"; },
    ghDelete: async () => { hits.push("ghDelete"); return "SENTINEL"; },
    ghList: async () => { hits.push("ghList"); return "SENTINEL"; },
    ghEnsureBranch: async () => { hits.push("ghEnsureBranch"); return "SENTINEL"; },
  });
  assert.equal(await GH.ghGet("a"), "SENTINEL");
  assert.equal(await GH.ghPut("a", {}, "m"), "SENTINEL");
  assert.equal(await GH.ghDelete("a", "s", "m"), "SENTINEL");
  assert.equal(await GH.ghList("d"), "SENTINEL");
  assert.equal(await GH.ghEnsureBranch("b"), "SENTINEL");
  assert.equal(fetchStub.calls.length, 0, "桩生效时不得有一个出网请求");
  assert.deepEqual(hits, ["ghGet", "ghPut", "ghDelete", "ghList", "ghEnsureBranch"]);

  defaultGitHub();
  fetchStub.restore();
  fetchStub = installFetch(() => new Response("", { status: 404 }));
  assert.equal(await GH.ghGet("a"), null, "关闭后回到真实实现");
  assert.equal(fetchStub.calls.length, 1, "关闭后必须真的发请求");
});


test("护栏: 钩子生效时一个 fetch 都不发（纯内存驱动）", async () => {
  installGitHub({ ghGet: async () => null, ghList: async () => [] });
  const res = mockRes();
  await signHandler(mockReq({ method: "POST", body: sign400Body({ website: "x" }) }), res);
  assert.equal(res.statusCode, 200);
  assert.equal(fetchStub.calls.length, 0, "mock 生效时不得有任何真实出网请求");
});
