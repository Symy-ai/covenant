// ============================================================
// GitHub Contents API 极简封装（零依赖）
// 存储模型：signatures/pending/{token}.json → signatures/verified/{emailHash}.json
// 环境变量：GITHUB_TOKEN（服务账号 fine-grained PAT, Contents RW）
//           GITHUB_REPO（owner/repo，默认 symy-ai/covenant）
// ============================================================
const API = "https://api.github.com";

function repo() {
  return process.env.GITHUB_REPO || "symy-ai/covenant";
}

function headers(extra = {}) {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

/** 读文件：{ content, sha } | null（404） */
export async function ghGet(path, branch = "main") {
  const r = await fetch(
    `${API}/repos/${repo()}/contents/${path}?ref=${encodeURIComponent(branch)}&t=${Date.now()}`,
    { headers: headers(), cache: "no-store" },
  );
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`ghGet ${path} → ${r.status}`);
  const j = await r.json();
  return {
    sha: j.sha,
    content: JSON.parse(Buffer.from(j.content, "base64").toString("utf8")),
  };
}

/** 写（新建/覆盖）：需 sha（覆盖时）；返回 commit sha */
export async function ghPut(path, obj, message, { branch = "main", sha } = {}) {
  const body = {
    message,
    branch,
    content: Buffer.from(JSON.stringify(obj, null, 2)).toString("base64"),
  };
  if (sha) body.sha = sha;
  const r = await fetch(`${API}/repos/${repo()}/contents/${path}`, {
    method: "PUT",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (r.status === 409) return { conflict: true }; // 已存在 → 幂等拦截用
  if (!r.ok) throw new Error(`ghPut ${path} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  return { conflict: false, sha: j.commit.sha };
}

/** 删（需文件 sha） */
export async function ghDelete(path, sha, message, branch = "main") {
  const r = await fetch(`${API}/repos/${repo()}/contents/${path}`, {
    method: "DELETE",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message, branch, sha }),
  });
  if (!r.ok && r.status !== 404) throw new Error(`ghDelete ${path} → ${r.status}`);
}

/** 列目录（文件名数组；空目录/不存在 → []） */
export async function ghList(dir, branch = "main") {
  const r = await fetch(
    `${API}/repos/${repo()}/contents/${dir}?ref=${encodeURIComponent(branch)}&t=${Date.now()}`,
    { headers: headers(), cache: "no-store" },
  );
  if (r.status === 404) return [];
  if (!r.ok) throw new Error(`ghList ${dir} → ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j.filter((x) => x.type === "file").map((x) => x.name) : [];
}
