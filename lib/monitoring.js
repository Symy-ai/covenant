// ============================================================
// 观测层：Sentry 错误上报 + PostHog 漏斗事件
// 零依赖实现：不引 SDK，直接用 fetch 调两端的最小 API
// 设计原则：尽力而为——任何上报失败都不影响业务主流程
// 环境变量（部署时由 owner 配置，本地留空即自动停用）：
//   SENTRY_DSN / POSTHOG_API_KEY / POSTHOG_HOST
// ============================================================
import crypto from "node:crypto";

// 隐私：distinctId 用邮箱哈希，不向分析平台发送明文邮箱
export function hashId(email) {
  return crypto
    .createHash("sha256")
    .update(String(email).toLowerCase().trim())
    .digest("hex")
    .slice(0, 16);
}

// ---------- Sentry（可选）：解析 DSN → store 端点 ----------
function sentryStoreUrl(dsn) {
  try {
    const u = new URL(dsn);
    const key = u.username;
    const projectId = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!key || !projectId) return null;
    return (
      `${u.protocol}//${u.host}/api/${projectId}/store/` +
      `?sentry_key=${encodeURIComponent(key)}&sentry_version=7&sentry_client=covenant/1.0`
    );
  } catch (_) {
    return null;
  }
}

// 错误上报：console（Vercel 日志）+ Sentry issue 双通道
export async function logError(e, context = {}) {
  console.error("[covenant]", e, JSON.stringify(context));
  const url = process.env.SENTRY_DSN && sentryStoreUrl(process.env.SENTRY_DSN);
  if (!url) return;
  try {
    const err = e instanceof Error ? e : new Error(String(e));
    const event = {
      timestamp: new Date().toISOString(),
      platform: "node",
      level: "error",
      environment: process.env.VERCEL_ENV || "production",
      server_name: "covenant",
      logger: "covenant",
      exception: {
        values: [
          {
            type: err.name,
            value: err.message,
            stacktrace: err.stack
              ? {
                  frames: err.stack
                    .split("\n")
                    .slice(0, 10)
                    .map((line) => ({ filename: "api", function: line.trim().slice(0, 200) })),
                }
              : undefined,
          },
        ],
      },
      extra: context,
    };
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
  } catch (_) {
    /* 观测失败不影响业务 */
  }
}

// 漏斗事件：PostHog capture API
// 事件清单：covenant_sign_submitted / covenant_sign_rejected /
//           covenant_email_failed / covenant_confirm_success /
//           covenant_confirm_error / covenant_confirm_duplicate
// （蜜罐拦截有意不埋点——静默是安全设计）
export async function track(distinctId, event, props = {}) {
  const key = process.env.POSTHOG_API_KEY;
  if (!key) return;
  try {
    await fetch(`${process.env.POSTHOG_HOST || "https://app.posthog.com"}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        event,
        distinct_id: distinctId,
        properties: props,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (_) {
    /* 观测失败不影响业务 */
  }
}
