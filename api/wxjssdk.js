// ============================================================
// GET /api/wxjssdk?url=<encodeURIComponent(当前页URL)> — 微信 JS-SDK 签名
// 背景: 微信「···」转发发送的是纯链接消息，只有卡片消息才带 og 标题/描述/缩略图。
//      前端引入 wx.config 注册分享卡片内容（title/desc/link/imgUrl）后，
//      用户点「···」→「发送给朋友」即发出带封面卡片的邀请。
// 密钥: 复用企微应用（WECOM_KEY，同时用于发确认邮件）的 corpsecret 派生
//      access_token —— 与邮件通道同一凭据，不新增任何 secret。
//      jsapi_ticket 用 access_token 调 getJsapiTicket 获取，进程内缓存 7000s。
// 安全: 签名算法 SHA1(jsapi_ticket=xxx&noncestr=xxx&timestamp=xxx&url=xxx)，
//      url 必须与调用页的 location.href.split('#')[0] 完全一致（含查询串）。
// 降级: 任一步骤失败（未配置/企微故障/网络异常）返回 { ok:false }，
//      前端跳过 wx.config —— 分享回退为纯链接，页面其余功能不受影响。
// ============================================================
import { logError } from "../lib/monitoring.js";

const CORP_ID = process.env.WECOM_CORP_ID || "";
const AGENT_ID = process.env.WECOM_AGENT_ID || "";
const SECRET = process.env.WECOM_SECRET || process.env.WECOMP_SECRET || process.env.WECOMP_APP_KEY || "";
const BASE = "https://qyapi.weixin.qq.com/cgi-bin";

// access_token / jsapi_ticket 进程内缓存（企微有效期 7200s，提前 200s 续）
let TOKEN = { at: 0, val: "" };
let TICKET = { at: 0, val: "" };

async function getToken() {
  if (TOKEN.val && Date.now() - TOKEN.at < 7000_000) return TOKEN.val;
  const r = await fetch(`${BASE}/gettoken?corpid=${CORP_ID}&corpsecret=${SECRET}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error("wx-token: " + (j.errmsg || r.status));
  TOKEN = { at: Date.now(), val: j.access_token };
  return j.access_token;
}

async function getTicket() {
  if (TICKET.val && Date.now() - TICKET.at < 7000_000) return TICKET.val;
  const token = await getToken();
  const r = await fetch(`${BASE}/get_jsapi_ticket?access_token=${token}&type=corp`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!j.ticket) throw new Error("wx-ticket: " + (j.errmsg || r.status));
  TICKET = { at: Date.now(), val: j.ticket };
  return j.ticket;
}

async function sha1hex(str) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const url = String(req.query.url || "");
  if (!/^https?:\/\//.test(url)) return res.status(400).json({ ok: false, error: "bad_url" });
  if (!CORP_ID || !SECRET) return res.status(200).json({ ok: false, error: "not_configured" });

  try {
    const ticket = await getTicket();
    const nonce = Math.random().toString(36).slice(2, 18);
    const ts = Math.floor(Date.now() / 1000);
    const sig = await sha1hex(`jsapi_ticket=${ticket}&noncestr=${nonce}&timestamp=${ts}&url=${url}`);
    return res.status(200).json({ ok: true, appId: CORP_ID, agentid: AGENT_ID, timestamp: ts, nonceStr: nonce, signature: sig });
  } catch (e) {
    await logError(e, { stage: "wxjssdk" });
    return res.status(200).json({ ok: false, error: "upstream" });
  }
}
