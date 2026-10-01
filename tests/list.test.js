// ============================================================
// GET /api/list 回归——空态与幽灵清单（1011 生产事故固化）
//
// 事故形态（2026-10-01 11:29 报障）：全量清零后 signatures/verified/ 只剩
// .gitkeep，fromGithub 先判 names 非空再过滤 .json → allSettled([]) →
// 误判 gh-all-failed；叠加 jsDelivr data-api 目录清单缓存滞后（幽灵文件：
// 清单说有、文件层已 404）→ 双通道全断 → 502 upstream_empty。
//
// 本文件锁定四条契约：
//   ① 空目录仅 .gitkeep → 200 真空名单（sources 双通道）
//   ② jsDelivr 幽灵清单 + GitHub 真空 → 200（CDN 通道降级，GitHub 裁决）
//   ③ 双通道真故障 → 502 upstream_empty（不得把故障伪装成空名单）
//   ④ 有签名 → 白名单字段输出（隐私列不得泄漏）
//
// 不触网：lib/github.js 走 setTestOverrides 桩；globalThis.fetch 拦下 jsDelivr。
// 运行：node --test tests/*.test.js
// ============================================================
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { setTestOverrides } from "../lib/github.js";
import { setTestLogError } from "../lib/monitoring.js";
import listHandler from "../api/list.js";

// ---------- 测试替身（与 e2e-smoke 同型，见那边注释） ----------

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
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
    end() {
      this.ended = true;
      return this;
    },
  };
  return res;
}

const mockReq = (o = {}) => ({ method: "GET", query: {}, headers: {}, ...o });

function installFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler ? handler(String(url), init) : new Response("", { status: 404 });
  };
  return { calls, restore() { globalThis.fetch = original; } };
}

// jsDelivr data-api 目录清单（flat 结构）
const cdnListing = (names) => ({
  files: names.map((n) => ({ name: `/signatures/verified/${n}` })),
});

for (const k of ["SENTRY_DSN", "POSTHOG_API_KEY", "POSTHOG_HOST"]) delete process.env[k];

let fetchStub;
let logged;

beforeEach(() => {
  fetchStub = installFetch();
  setTestOverrides(null);
  setTestLogError(null);
  logged = [];
});

afterEach(() => {
  fetchStub.restore();
  setTestOverrides(null);
  setTestLogError(null);
});

// ---------- ① 1011 事故形态：空目录仅 .gitkeep ----------

test("list: verified/ 仅 .gitkeep → 200 真空名单（1011 事故回归）", async () => {
  // CDN 清单健康但无 .json（.gitkeep 不以 .json 结尾，前缀+后缀双条件天然排除）
  fetchStub = installFetch(() => new Response(JSON.stringify(cdnListing([".gitkeep"])), { status: 200 }));
  // GitHub 通道：ghList 返回目录真身——只有 .gitkeep（修复前这里会走 gh-all-failed）
  setTestOverrides({
    ghList: async () => [".gitkeep"],
    ghGet: async () => { throw new Error("不应触达 ghGet：.gitkeep 不是签名文件"); },
  });

  const res = mockRes();
  await listHandler(mockReq({ query: { live: "1" } }), res);

  assert.equal(res.statusCode, 200, "真空名单是合法状态，不得 502");
  assert.equal(res.body.count, 0);
  assert.deepEqual(res.body.rows, []);
  assert.deepEqual(res.body.sources, ["cdn", "github"], "双通道都活着，都该在册");
});

test("list: 双通道都空（目录物理缺失 + 清单无文件）→ 200 真空名单", async () => {
  fetchStub = installFetch(() => new Response(JSON.stringify({ files: [] }), { status: 200 }));
  setTestOverrides({
    ghList: async () => [], // 404 → []（目录被清空后 git 物理消失）
    ghGet: async () => null,
  });

  const res = mockRes();
  await listHandler(mockReq({ query: { live: "1" } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 0);
  assert.deepEqual(res.body.sources, ["cdn", "github"]);
});

// ---------- ② jsDelivr 幽灵清单（data-api 缓存滞后） ----------

test("list: 幽灵清单（清单有/文件层 404）+ GitHub 真空 → 200，仅 github 通道", async () => {
  fetchStub = installFetch((url) => {
    if (url.startsWith("https://data.jsdelivr.com/")) {
      // 清零前缓存的目录清单：说有 2 个签名文件
      return new Response(JSON.stringify(cdnListing(["2721d36b.json", "c8eadfd0.json"])), { status: 200 });
    }
    // cdn.jsdelivr.net 文件层：早已 404
    return new Response("Couldn't find the requested file", { status: 404 });
  });
  setTestOverrides({
    ghList: async () => [".gitkeep"], // GitHub 真身：真空
    ghGet: async () => null,
  });

  const res = mockRes();
  await listHandler(mockReq({ query: { live: "1" } }), res);

  assert.equal(res.statusCode, 200, "GitHub 通道活着就有真相：真空，不是故障");
  assert.equal(res.body.count, 0);
  assert.deepEqual(res.body.sources, ["github"], "幽灵通道降级下线，不得计入 sources");
});

// ---------- ③ 双通道真故障 → 502（故障不得伪装成空名单） ----------

test("list: 双通道全断 → 502 upstream_empty + logError", async () => {
  fetchStub = installFetch(() => new Response("", { status: 500 })); // CDN 清单层 500
  setTestOverrides({
    ghList: async () => { throw new Error("ghList signatures/verified → 401"); }, // token 失效形态
  });
  setTestLogError((e, ctx) => logged.push({ msg: e.message, ctx }));

  const res = mockRes();
  await listHandler(mockReq({ query: { live: "1" } }), res);

  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { error: "upstream_empty" });
  assert.ok(logged.some((x) => /both channels empty/.test(x.msg)), "必须留观测痕迹");
});

test("list: 清单有真文件但文件层全 500 → CDN 降级，GitHub 裁决", async () => {
  fetchStub = installFetch((url) => {
    if (url.startsWith("https://data.jsdelivr.com/")) {
      return new Response(JSON.stringify(cdnListing(["a.json"])), { status: 200 });
    }
    return new Response("", { status: 500 }); // 非 404 的全灭：真故障形态
  });
  setTestOverrides({
    ghList: async () => [".gitkeep"],
    ghGet: async () => null,
  });

  const res = mockRes();
  await listHandler(mockReq({ query: { live: "1" } }), res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.sources, ["github"]);
});

// ---------- ④ 有签名：合并去重 + 隐私白名单 ----------

test("list: 双通道同名去重 + 仅白名单字段（email/ip 等隐私列不得透出）", async () => {
  fetchStub = installFetch((url) => {
    if (url.startsWith("https://data.jsdelivr.com/")) {
      return new Response(JSON.stringify(cdnListing(["abc.json"])), { status: 200 });
    }
    // CDN 文件层：同一人（同 emailHash），institution 较旧
    return new Response(JSON.stringify({
      name: "Ada", institution: "旧单位", role: "前端工程师",
      confirmedAt: "2026-09-28T10:00:00Z", emailHash: "h-ada",
      email: "secret@example.com", ip: "1.2.3.4",
    }), { status: 200 });
  });
  setTestOverrides({
    ghList: async () => [".gitkeep", "abc.json"],
    ghGet: async (path) => {
      assert.ok(path.startsWith("signatures/verified/"), `ghGet 只该碰签名目录: ${path}`);
      return {
        content: {
          name: "Ada", institution: "清华大学", role: "前端工程师",
          confirmedAt: "2026-09-30T12:00:00Z", emailHash: "h-ada",
          email: "secret@example.com", ip: "1.2.3.4",
        },
      };
    },
  });

  const res = mockRes();
  await listHandler(mockReq({ query: { live: "1" } }), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 1, "同 emailHash 双通道去重为 1");
  const row = res.body.rows[0];
  assert.equal(row.institution, "清华大学", "GitHub 实时通道后写入，覆盖 CDN 滞后值");
  assert.deepEqual(
    Object.keys(row).sort(),
    ["confirmedAt", "emailHash", "institution", "name", "role"],
    "只透传白名单五列",
  );
});

// ---------- 通用守卫 ----------

test("list: 非 GET → 405", async () => {
  const res = mockRes();
  await listHandler(mockReq({ method: "POST" }), res);
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: "method_not_allowed" });
});

test("list: 进程缓存命中（60s 内二次请求不再触网）", async () => {
  fetchStub = installFetch(() => new Response(JSON.stringify({ files: [] }), { status: 200 }));
  setTestOverrides({
    ghList: async () => [".gitkeep"],
    ghGet: async () => null,
  });

  const first = mockRes();
  await listHandler(mockReq({ query: { live: "1" } }), first);
  assert.equal(first.statusCode, 200);
  const fetchCallsAfterFirst = fetchStub.calls.length;
  const ghListCalls = []; // 计数 GitHub 桩命中

  // 第二次：不带 live → 走进程缓存
  const second = mockRes();
  await listHandler(mockReq({}), second);
  assert.equal(second.statusCode, 200);
  assert.equal(second.headers["X-Covenant-Cache"], "hit");
  assert.equal(fetchStub.calls.length, fetchCallsAfterFirst, "缓存命中期间不得再出网");
});
