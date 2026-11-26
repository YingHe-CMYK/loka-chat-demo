import { createHash } from "node:crypto";
const providers = {
  calendar: { name: "Google Calendar", family: "google", description: "\u8BFB\u53D6\u65E5\u5386\u6D3B\u52A8\uFF1B\u9884\u89C8\u4E3B\u65E5\u5386\u672A\u6765 7 \u5929\u7684\u5B89\u6392\u3002", scopes: ["https://www.googleapis.com/auth/calendar.events.readonly"] },
  gmail: { name: "Gmail", family: "google", description: "\u6388\u6743\u8303\u56F4\u5305\u542B\u8BFB\u53D6\u90AE\u4EF6\uFF1B\u9884\u89C8\u6700\u8FD1 5 \u5C01\u672A\u8BFB\u90AE\u4EF6\u7684\u6807\u9898\u3001\u53D1\u4EF6\u4EBA\u4E0E\u6458\u8981\u3002", scopes: ["https://www.googleapis.com/auth/gmail.readonly"] },
  slack: { name: "Slack", family: "slack", description: "\u4EE5\u4F60\u6388\u6743\u7684 Slack \u8D26\u6237\u8BFB\u53D6\u9891\u9053\u76EE\u5F55\u53CA\u53EF\u8BBF\u95EE\u7684\u9891\u9053\u6D88\u606F\uFF0C\u4E0D\u5305\u542B\u79C1\u4FE1\u3002", scopes: ["channels:read", "channels:history", "groups:read", "groups:history"] },
  notion: { name: "Notion", family: "notion", description: "\u4EC5\u8BBF\u95EE\u4F60\u5728 Notion \u6388\u6743\u7684\u9875\u9762\uFF1B\u9884\u89C8\u9875\u9762\u6807\u9898\u3002", scopes: [] },
  drive: { name: "Google Drive", family: "google", description: "\u8BFB\u53D6\u6587\u4EF6\u76EE\u5F55\u3001\u540D\u79F0\u548C\u4FEE\u6539\u65F6\u95F4\uFF1B\u5F53\u524D\u4E0D\u8BFB\u53D6\u6587\u4EF6\u6B63\u6587\u3002", scopes: ["https://www.googleapis.com/auth/drive.metadata.readonly"] },
  github: { name: "GitHub", family: "github", description: "\u901A\u8FC7 GitHub App\uFF0C\u53EA\u8BFB\u8BBF\u95EE\u4F60\u6307\u5B9A\u7684\u516C\u5F00\u6216\u79C1\u6709\u4ED3\u5E93\u4FE1\u606F\u53CA Pull Request\uFF0C\u4E0D\u4FEE\u6539\u4EE3\u7801\u3002", scopes: [] }
};
const isProvider = (value) => Object.hasOwn(providers, value);
class ConnectionError extends Error {
  constructor(message, code = "PROVIDER_UNAVAILABLE", status = 502, retryAfter) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
  code;
  status;
  retryAfter;
}
const text = (value) => typeof value === "string" ? value : "";
const scopes = (value) => text(value).split(/[ ,]+/).filter(Boolean);
function settings(provider, env = {}) {
  const family = providers[provider].family;
  const prefix = family.toUpperCase();
  const clientId = env[`${prefix}_CLIENT_ID`] || "";
  const clientSecret = env[`${prefix}_CLIENT_SECRET`] || "";
  const api = new URL(env.PUBLIC_API_BASE_URL || "https://loka-chat-mirror-v1.yinghe-vela-live.workers.dev/api");
  const frontend = new URL(env.FRONTEND_ORIGIN || "https://loka-chat-mirror-v1.yinghe-vela-live.workers.dev");
  for (const url of [api, frontend]) {
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error("OAuth requires HTTPS or localhost");
    if (url.username || url.password || url.search || url.hash) throw new Error("Invalid OAuth public URL");
  }
  if (api.origin !== frontend.origin || api.pathname.replace(/\/$/, "") !== "/api") throw new Error("Use the frontend same-origin /api proxy for OAuth callbacks");
  return { family, clientId, clientSecret, frontend: frontend.origin, redirect: `${api.href.replace(/\/$/, "")}/connections/callback/${family}`, secure: api.protocol === "https:" };
}
function githubInstallationUrl(env = {}) {
  const slug = env.GITHUB_APP_SLUG || "";
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? `https://github.com/apps/${slug}/installations/new` : void 0;
}
const githubHeaders = (token) => ({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Loka-source-connector" });
function authorizationUrl(provider, state, verifier, env = {}) {
  const config = settings(provider, env);
  const url = new URL(config.family === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : config.family === "slack" ? "https://slack.com/oauth/v2/authorize" : config.family === "github" ? "https://github.com/login/oauth/authorize" : "https://api.notion.com/v1/oauth/authorize");
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirect, response_type: "code", state }).toString();
  if (config.family === "google") {
    url.searchParams.set("scope", ["openid", "email", ...providers[provider].scopes].join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent select_account");
    url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  } else if (config.family === "github") {
    url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  } else if (config.family === "slack") url.searchParams.set("user_scope", providers[provider].scopes.join(","));
  else url.searchParams.set("owner", "user");
  return url;
}
class ProviderClient {
  constructor(http = fetch, env = {}) {
    this.http = http;
    this.env = env;
  }
  http;
  env;
  async json(url, init = {}, array = false) {
    let response;
    try {
      response = await this.http(url, { ...init, redirect: "error", signal: AbortSignal.timeout(12e3) });
    } catch {
      throw new ConnectionError("\u6682\u65F6\u8FDE\u4E0D\u4E0A\u8BE5\u5E73\u53F0\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    }
    if (response.status === 429) throw new ConnectionError("\u5E73\u53F0\u8BF7\u6C42\u8F83\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002", "RATE_LIMITED", 429, Math.min(3600, Math.max(1, Number(response.headers.get("retry-after")) || 60)));
    if (url.startsWith("https://api.github.com/") && response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after"))) {
      const seconds = Number(response.headers.get("retry-after")) || Math.ceil(Number(response.headers.get("x-ratelimit-reset")) - Date.now() / 1e3) || 60;
      throw new ConnectionError("GitHub \u8BF7\u6C42\u8F83\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002", "RATE_LIMITED", 429, Math.min(3600, Math.max(1, seconds)));
    }
    let body;
    try {
      body = await response.json();
      if (!body || typeof body !== "object") throw new Error();
    } catch {
      throw new ConnectionError("\u5E73\u53F0\u8FD4\u56DE\u4E86\u65E0\u6548\u54CD\u5E94\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    }
    const code = typeof body.error === "string" ? body.error : body.error?.status;
    if (url.startsWith("https://api.github.com/") && response.status === 403 && /rate limit|abuse detection/i.test(text(body.message))) throw new ConnectionError("GitHub \u8BF7\u6C42\u8F83\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5\u3002", "RATE_LIMITED", 429, 60);
    if (["invalid_client", "invalid_client_id", "invalid_client_secret", "invalid_redirect_uri", "incorrect_client_credentials", "redirect_uri_mismatch"].includes(code)) throw new ConnectionError("\u5E73\u53F0\u5E94\u7528\u914D\u7F6E\u6709\u8BEF\uFF0C\u8BF7\u8054\u7CFB\u7BA1\u7406\u5458\u6838\u5BF9\u3002", "CONNECTOR_CONFIGURATION_ERROR", 503);
    if (response.status === 401 || ["invalid_grant", "invalid_auth", "token_revoked", "token_expired", "account_inactive", "bad_refresh_token"].includes(code)) throw new ConnectionError("\u6388\u6743\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u3002", "RECONNECT_REQUIRED", 409);
    if (response.status === 403 || code === "missing_scope" || code === "restricted_action") throw new ConnectionError("\u5F53\u524D\u6388\u6743\u4E0D\u8DB3\uFF0C\u6216\u5E73\u53F0\u3001\u7EC4\u7EC7\u9650\u5236\u4E86\u8BBF\u95EE\u3002\u8BF7\u68C0\u67E5\u6743\u9650\u540E\u91CD\u65B0\u8FDE\u63A5\u3002", "PERMISSION_REQUIRED", 403);
    if (["not_in_channel", "channel_not_found"].includes(code)) throw new ConnectionError("\u5F53\u524D Slack \u8D26\u6237\u65E0\u6CD5\u8BBF\u95EE\u6B64\u9891\u9053\uFF0C\u8BF7\u68C0\u67E5\u9891\u9053\u6743\u9650\u3002", "CHANNEL_UNAVAILABLE", 403);
    if (url.startsWith("https://api.github.com/") && response.status === 404) throw new ConnectionError("\u8BE5\u4ED3\u5E93\u5DF2\u79FB\u9664\u6216\u4E0D\u5728\u5F53\u524D\u6388\u6743\u8303\u56F4\u5185\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9\u6388\u6743\u4ED3\u5E93\u3002", "REPOSITORY_UNAVAILABLE", 404);
    if (!response.ok || body.ok === false || body.error) throw new ConnectionError("\u8BE5\u5E73\u53F0\u6682\u65F6\u65E0\u6CD5\u5B8C\u6210\u8BF7\u6C42\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    if (Array.isArray(body) !== array) throw new ConnectionError("\u5E73\u53F0\u8FD4\u56DE\u4E86\u65E0\u6548\u54CD\u5E94\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
    return body;
  }
  async token(provider, values) {
    const { family, clientId, clientSecret } = settings(provider, this.env);
    const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
    if (family === "github") return this.json("https://github.com/login/oauth/access_token", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ ...values, client_id: clientId, client_secret: clientSecret }) });
    if (family === "notion") return this.json("https://api.notion.com/v1/oauth/token", { method: "POST", headers: { Authorization: basic, "Content-Type": "application/json" }, body: JSON.stringify(values) });
    return this.json(family === "google" ? "https://oauth2.googleapis.com/token" : "https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...family === "slack" ? { Authorization: basic } : {} },
      body: new URLSearchParams({ ...values, ...family === "google" ? { client_id: clientId, client_secret: clientSecret } : {} })
    });
  }
  credential(provider, body, previous) {
    if (!text(body.access_token)) throw new ConnectionError("\u5E73\u53F0\u6CA1\u6709\u8FD4\u56DE\u6709\u6548\u6388\u6743\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u3002", "RECONNECT_REQUIRED", 409);
    const granted = typeof body.scope === "string" ? scopes(body.scope) : previous?.scopes || [];
    if (providers[provider].scopes.some((scope) => !granted.includes(scope))) throw new ConnectionError("\u5C1A\u672A\u83B7\u5F97\u6240\u9700\u7684\u8BFB\u53D6\u6743\u9650\uFF0C\u8BF7\u91CD\u65B0\u6388\u6743\u3002", "PERMISSION_REQUIRED", 403);
    return {
      accessToken: body.access_token,
      refreshToken: text(body.refresh_token) || previous?.refreshToken,
      expiresAt: Number(body.expires_in) > 0 ? Date.now() + Number(body.expires_in) * 1e3 : void 0,
      scopes: granted
    };
  }
  async exchange(provider, code, verifier) {
    const config = settings(provider, this.env);
    const body = await this.token(provider, { grant_type: "authorization_code", code, redirect_uri: config.redirect, ...["google", "github"].includes(config.family) ? { code_verifier: verifier } : {} });
    if (config.family === "slack" && (!text(body.authed_user?.id) || body.authed_user?.token_type !== "user")) throw new ConnectionError("\u6CA1\u6709\u83B7\u5F97 Slack \u7528\u6237\u6388\u6743\uFF0C\u8BF7\u68C0\u67E5\u5E94\u7528\u7684 User Token Scopes \u914D\u7F6E\u3002", "PERMISSION_REQUIRED", 403);
    const credential = this.credential(provider, config.family === "slack" ? body.authed_user : body);
    if (config.family === "github") {
      const identity = await this.json("https://api.github.com/user", { headers: githubHeaders(credential.accessToken) });
      if (!Number.isSafeInteger(identity.id) || identity.id <= 0 || !text(identity.login)) throw new ConnectionError("\u65E0\u6CD5\u786E\u8BA4 GitHub \u8D26\u6237\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u3002");
      return { credential, id: String(identity.id), label: `@${identity.login}` };
    }
    if (config.family === "google") {
      const identity = await this.json("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${credential.accessToken}` } });
      if (!text(identity.sub)) throw new ConnectionError("\u65E0\u6CD5\u786E\u8BA4 Google \u8D26\u6237\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u3002");
      return { credential, id: text(identity.sub), label: text(identity.email) || "Google \u8D26\u6237" };
    }
    const id = text(config.family === "slack" ? body.team?.id : body.workspace_id);
    if (!id) throw new ConnectionError("\u5E73\u53F0\u6CA1\u6709\u8FD4\u56DE\u6709\u6548\u7684\u5DE5\u4F5C\u533A\u4FE1\u606F\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u3002");
    return { credential, id: config.family === "slack" ? `${id}:${body.authed_user.id}` : id, label: text(config.family === "slack" ? body.team?.name : body.workspace_name) || (config.family === "slack" ? "Slack \u5DE5\u4F5C\u533A" : "Notion \u5DE5\u4F5C\u533A") };
  }
  async refresh(provider, credential) {
    if (!credential.refreshToken) throw new ConnectionError("\u6388\u6743\u5DF2\u5230\u671F\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u3002", "RECONNECT_REQUIRED", 409);
    return this.credential(provider, await this.token(provider, { grant_type: "refresh_token", refresh_token: credential.refreshToken }), credential);
  }
  async preview(provider, credential, selection) {
    if (provider === "github") return this.githubPreview(credential, selection);
    const headers = { Authorization: `Bearer ${credential.accessToken}`, ...provider === "notion" ? { "Notion-Version": "2022-06-28", "Content-Type": "application/json" } : {} };
    if (provider === "calendar") {
      const params = new URLSearchParams({ timeMin: (/* @__PURE__ */ new Date()).toISOString(), timeMax: new Date(Date.now() + 7 * 864e5).toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "10" });
      const data2 = await this.json(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers });
      return { items: (data2.items || []).map((item) => ({ id: text(item.id), title: text(item.summary) || "\u672A\u547D\u540D\u65E5\u7A0B", date: text(item.start?.dateTime || item.start?.date), detail: text(item.location), url: text(item.htmlLink) })), hasMore: Boolean(data2.nextPageToken) };
    }
    if (provider === "gmail") {
      const data2 = await this.json("https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is%3Aunread&maxResults=5", { headers });
      const items = await Promise.all((data2.messages || []).slice(0, 5).map(async (message) => {
        const mail = await this.json(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(text(message.id))}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, { headers });
        const header = (name) => (mail.payload?.headers || []).find((value) => text(value.name).toLowerCase() === name)?.value;
        return { id: text(mail.id), title: text(header("subject")) || "\u65E0\u4E3B\u9898", detail: [text(header("from")), text(mail.snippet)].filter(Boolean).join("\n"), date: Number(mail.internalDate) > 0 ? new Date(Number(mail.internalDate)).toISOString() : "" };
      }));
      return { items, hasMore: Boolean(data2.nextPageToken) };
    }
    if (provider === "drive") {
      const params = new URLSearchParams({ q: "trashed = false", pageSize: "10", orderBy: "modifiedTime desc", fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)" });
      const data2 = await this.json(`https://www.googleapis.com/drive/v3/files?${params}`, { headers });
      return { items: (data2.files || []).map((item) => ({ id: text(item.id), title: text(item.name) || "\u672A\u547D\u540D\u6587\u4EF6", detail: text(item.mimeType), date: text(item.modifiedTime), url: text(item.webViewLink) })), hasMore: Boolean(data2.nextPageToken) };
    }
    if (provider === "notion") {
      const data2 = await this.json("https://api.notion.com/v1/search", { method: "POST", headers, body: JSON.stringify({ page_size: 10, filter: { value: "page", property: "object" }, sort: { direction: "descending", timestamp: "last_edited_time" } }) });
      return { items: (data2.results || []).map((page) => {
        const title = Object.values(page.properties || {}).find((property) => property?.type === "title");
        return { id: text(page.id), title: (title?.title || []).map((part) => text(part.plain_text)).join("") || "\u65E0\u6807\u9898\u9875\u9762", date: text(page.last_edited_time), url: text(page.url) };
      }), hasMore: Boolean(data2.has_more) };
    }
    if (selection) {
      if (!/^[CG][A-Z0-9]{4,}$/.test(selection)) throw new ConnectionError("\u8BF7\u9009\u62E9\u6709\u6548\u7684 Slack \u9891\u9053\u3002", "INVALID_CHANNEL", 400);
      const data2 = await this.json(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(selection)}&limit=15`, { headers });
      return { items: (data2.messages || []).map((message) => ({ id: text(message.ts), title: text(message.text) || "\u975E\u6587\u5B57\u6D88\u606F", detail: text(message.user), date: Number(message.ts) > 0 ? new Date(Number(message.ts) * 1e3).toISOString() : "" })), hasMore: Boolean(data2.has_more) };
    }
    const data = await this.json("https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=100", { headers });
    return { items: (data.channels || []).filter((item) => item.is_member).map((item) => ({ id: text(item.id), title: `# ${text(item.name)}`, detail: text(item.purpose?.value), kind: "channel" })), hasMore: Boolean(data.response_metadata?.next_cursor) };
  }
  async githubPreview(credential, selection) {
    if (selection && !/^\d{1,20}:\d{1,20}$/.test(selection)) throw new ConnectionError("\u8BF7\u9009\u62E9\u6709\u6548\u7684 GitHub \u4ED3\u5E93\u3002", "INVALID_REPOSITORY", 400);
    const headers = githubHeaders(credential.accessToken);
    const data = await this.json("https://api.github.com/user/installations?per_page=5", { headers });
    if (!Array.isArray(data.installations)) throw new ConnectionError("GitHub \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u5B89\u88C5\u4FE1\u606F\u3002");
    const installations = data.installations.filter((item) => Number.isSafeInteger(item.id) && item.id > 0 && !item.suspended_at).slice(0, 5);
    if (!installations.length) throw new ConnectionError("\u8BF7\u5148\u9009\u62E9\u6388\u6743\u4ED3\u5E93\u5E76\u5B89\u88C5 GitHub App\uFF1B\u7EC4\u7EC7\u4ED3\u5E93\u53EF\u80FD\u9700\u8981\u7BA1\u7406\u5458\u6279\u51C6\u3002\u5B8C\u6210\u540E\u518D\u8BD5\u3002", "INSTALLATION_REQUIRED", 409);
    const lists = await Promise.all(installations.map(async (installation) => {
      const list = await this.json(`https://api.github.com/user/installations/${installation.id}/repositories?per_page=10`, { headers });
      if (!Array.isArray(list.repositories)) throw new ConnectionError("GitHub \u8FD4\u56DE\u4E86\u65E0\u6548\u7684\u4ED3\u5E93\u5217\u8868\u3002");
      return { installation: installation.id, repositories: list.repositories.slice(0, 10), more: Number(list.total_count) > 10 };
    }));
    const repositories = lists.flatMap((list) => list.repositories.filter((repo) => Number.isSafeInteger(repo.id) && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text(repo.full_name))).map((repo) => ({ id: `${list.installation}:${repo.id}`, repo })));
    if (selection) {
      const chosen = repositories.find((item) => item.id === selection);
      if (!chosen) throw new ConnectionError("\u8BE5\u4ED3\u5E93\u5DF2\u79FB\u9664\u6216\u4E0D\u5728\u672C\u6B21\u6388\u6743\u5217\u8868\u5185\uFF0C\u8BF7\u8FD4\u56DE\u4ED3\u5E93\u5217\u8868\u91CD\u65B0\u9009\u62E9\u3002", "REPOSITORY_UNAVAILABLE", 404);
      const path = text(chosen.repo.full_name).split("/").map(encodeURIComponent).join("/");
      const pulls = await this.json(`https://api.github.com/repos/${path}/pulls?state=all&sort=updated&direction=desc&per_page=11`, { headers }, true);
      return { items: pulls.slice(0, 10).map((item) => ({ id: String(item.id), title: `#${item.number} ${text(item.title)}`, detail: [item.merged_at ? "\u5DF2\u5408\u5E76" : item.state === "closed" ? "\u5DF2\u5173\u95ED" : "\u5F85\u5408\u5E76", text(item.user?.login) ? `@${item.user.login}` : ""].filter(Boolean).join(" \xB7 "), date: text(item.updated_at), url: text(item.html_url) })), hasMore: pulls.length > 10 };
    }
    return { items: repositories.map(({ id, repo }) => ({ id, title: text(repo.full_name), detail: [repo.private ? "\u79C1\u6709\u4ED3\u5E93" : "\u516C\u5F00\u4ED3\u5E93", text(repo.description)].filter(Boolean).join(" \xB7 "), date: text(repo.pushed_at), url: text(repo.html_url), kind: "repository" })), hasMore: Number(data.total_count) > 5 || lists.some((list) => list.more) };
  }
}
export {
  ConnectionError,
  ProviderClient,
  authorizationUrl,
  githubInstallationUrl,
  isProvider,
  providers,
  settings
};
