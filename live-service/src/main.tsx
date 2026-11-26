import ExperienceIdentity from "./ExperienceIdentity";
import Workspace from "./board/Board";
import React, { lazy, Suspense, useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import type { Account, Companion } from "./contracts";
import "./style.css";
const messages: Record<string, string> = {
  USERNAME_TAKEN: "这个用户名已被使用，请换一个。",
  USERNAME_INVALID: "用户名需为 2–24 个字，支持中文、字母、数字和常见分隔符。",
  AI_NAME_INVALID: "名字需为 1–24 个字，请勿使用特殊符号。",
  SESSION_INVALID_OR_EXPIRED: "登录已过期，请退出后重新验证邮箱。",
  PROFILE_REQUIRED: "请先保存个人用户名。",
};
function Character() {
  return <div className="character" role="img" aria-label="银紫色 Loka 角色" />;
}
interface PointsStatement {
  balance_minor: number;
  scale: number;
  entries: { id: string; amount_minor: number; kind: string; created_at: string }[];
}

function App() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const [me, setMe] = useState<Account | null>(null),
    [ai, setAI] = useState<Companion | null>(null),
    [name, setName] = useState(""),
    [aiName, setAIName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState("home"),
    [loaded, setLoaded] = useState(false);
  const [points, setPoints] = useState<PointsStatement | null>(null);
  const [pointsError, setPointsError] = useState(false);
  const api = useCallback(
    async (path: string, method = "GET", body?: unknown) => {
      const token = await getAccessToken();
      if (!token) throw Error("SESSION_INVALID_OR_EXPIRED");
      const r = await fetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error || "暂时无法连接服务，请重试。");
      return result;
    },
    [getAccessToken],
  );
  useEffect(() => {
    setPoints(null);
    setPointsError(false);
    if (page !== 'space' || !authenticated || !me?.profile) return;
    let active = true;
    api('/api/points')
      .then(statement => { if (active) setPoints(statement); })
      .catch(() => { if (active) setPointsError(true); });
    return () => { active = false; };
  }, [api, authenticated, me, page]);
  const refresh = useCallback(async () => {
    const account = await api("/api/me");
    setMe(account);
    setName(account.profile?.username || "");
    if (account.profile) {
      const result = await api("/api/companion");
      setAI(result.companion);
      setAIName(result.companion?.name || "");
    }
    setLoaded(true);
  }, [api]);
  useEffect(() => {
    let active = true;
    if (ready && authenticated) {
      refresh().catch((e) => {
        if (active) {
          setError(messages[e.message] || e.message);
          setLoaded(true);
        }
      });
    } else {
      setMe(null);
      setAI(null);
      setLoaded(false);
    }
    return () => {
      active = false;
    };
  }, [ready, authenticated, refresh]);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await work();
    } catch (e) {
      setError(messages[(e as Error).message] || (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const saveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await api("/api/me", "PUT", { username: name });
      await refresh();
      setStatus("个人资料已保存。");
    });
  };
  const saveAI = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await api("/api/companion", "PUT", { name: aiName });
      setAI(result.companion);
      setPage("home");
      setStatus("名字已保存，AI 身份保持不变。");
    });
  };
  const copy = (value: string) =>
    void run(async () => {
      await navigator.clipboard.writeText(value);
      setStatus("已复制。");
    });
  return (
    <main>
      <header>
        <a href="/" className="brand">
          Loka<span>与你一起成长</span>
        </a>
        {authenticated && (
          <button
            className="quiet"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await logout();
                setMe(null);
                setAI(null);
                setPage("home");
              })
            }
          >
            退出
          </button>
        )}
      </header>
      {!ready ? (
        <p role="status">正在连接登录服务…</p>
      ) : !authenticated ? (
        <section>
          <img
            className="brand-symbol"
            src="/brand/loka-mark.svg"
            alt="Loka 品牌标志"
          />
          <small>属于你的个人 AI</small>
          <h1>
            从相识开始，
            <br />
            一起形成判断。
          </h1>
          <p>通过邮箱建立你的账户，再为自己的 Loka 起一个名字。</p>
          <button
            className="primary"
            onClick={() => login({ loginMethods: ["email"] })}
          >
            邮箱注册 / 登录
          </button>
          <button
            className="quiet full"
            onClick={() => login({ loginMethods: ["email"] })}
          >
            已有账户？验证邮箱恢复登录
          </button>
          <p className="note">验证码由登录服务发送。已有账户会恢复原有身份。</p>
        </section>
      ) : !loaded ? (
        <p role="status">正在恢复你的空间…</p>
      ) : !me ? (
        <section>
          <h1>账户连接未完成</h1>
          <button onClick={() => void run(refresh)}>重新连接</button>
        </section>
      ) : !me.profile ? (
        <section>
          <small>01 / 本人的身份</small>
          <h1>先认识你。</h1>
          <p>{me.email}</p>
          <form onSubmit={saveProfile}>
            <label htmlFor="username">个人用户名</label>
            <input
              id="username"
              autoComplete="nickname"
              required
              minLength={2}
              maxLength={24}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="note">用户名可以修改，个人 ID 不会随之改变。</p>
            <button className="primary" disabled={busy}>
              {busy ? "保存中…" : "保存并认识 Loka"}
            </button>
          </form>
        </section>
      ) : !ai ? (
        <section>
          <small>02 / 你的 Loka</small>
          <Character />
          <h1>给它一个名字。</h1>
          <p>它已经拥有理解世界的基础能力。属于你的共同经历，从这里开始。</p>
          <form onSubmit={saveAI}>
            <label htmlFor="ai-name">Loka 的名字</label>
            <input
              id="ai-name"
              required
              maxLength={24}
              value={aiName}
              onChange={(e) => setAIName(e.target.value)}
            />
            <button className="primary" disabled={busy}>
              {busy ? "创建中…" : "建立我们的共同身份"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <nav aria-label="主导航">
            {[
              ["home", "我的 Loka"],
              ["growth", "成长"],
              ["space", "我的空间"],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-current={page === id ? "page" : undefined}
                onClick={() => setPage(id)}
              >
                {label}
              </button>
            ))}
          </nav>
          {page === "home" ? (
            <section>
              <small>共同经历 · 持续成长</small>
              <Character />
              <h1>{ai.name}，在这里。</h1>
              <p>
                你好，{me.profile.username}。你的 Loka
                身份已保存在账户中，重新登录后会继续保留。
              </p>
              <article>
                <h2>从真实资料开始了解</h2>
                <p>
                  打开 Twin 工作台，选择一份本机文件，查看变化和依据。工作台资料保留在当前浏览器。
                </p>
                <a className="mirror-link" href="/twin-workspace">打开 Twin 工作台 →</a>
                <button className="quiet" onClick={() => setPage("sources")}>
                  查看资料连接
                </button>
              </article>
            </section>
          ) : page === "growth" ? (
            <section>
              <small>培养与验证</small>
              <h1>成长，要有依据。</h1>
              <article>
                <h2>还没有已验证能力</h2>
                <p>
                  模型与训练接口尚未接入。学习计划、预算确认和能力验证将在服务启用后开放。
                </p>
                <p className="note">
                  当前不会产生学习费用，也不会将命名或使用次数计作能力提升。
                </p>
              </article>
            </section>
          ) : page === "sources" ? (
            <section>
              <button className="quiet" onClick={() => setPage("home")}>
                返回我的 Loka
              </button>
              <h1>资料与用途</h1>
              <p>每个来源单独授权。推理与训练许可分别管理。</p>
              {["日历与安排", "文件与笔记", "健康记录"].map((label) => (
                <article key={label}>
                  <h2>{label}</h2>
                  <p>连接服务未接入 · 尚未读取资料</p>
                </article>
              ))}
            </section>
          ) : (
            <section>
              <h1>我的空间</h1>
              <article>
                <h2>个人身份</h2>
                <p>{me.email}</p>
                <p className="address">{me.id}</p>
                <button className="quiet" onClick={() => copy(me.id)}>
                  复制个人 ID
                </button>
                <form onSubmit={saveProfile}>
                  <label htmlFor="profile-name">个人用户名</label>
                  <input
                    id="profile-name"
                    required
                    minLength={2}
                    maxLength={24}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button disabled={busy}>保存用户名</button>
                </form>
              </article>
              <article>
                <h2>Loka 身份卡</h2>
                <p className="address">{ai.ai_id}</p>
                <p className="note">
                  诞生于 {new Date(ai.created_at).toLocaleDateString("zh-CN")}
                </p>
                <button className="quiet" onClick={() => copy(ai.ai_id)}>
                  复制 AI ID
                </button>
                <form onSubmit={saveAI}>
                  <label htmlFor="rename">角色名字</label>
                  <input
                    id="rename"
                    value={aiName}
                    required
                    maxLength={24}
                    onChange={(e) => setAIName(e.target.value)}
                  />
                  <button disabled={busy}>保存名字</button>
                </form>
              </article>
              <article>
                <h2>我的 Loka 积分</h2>
                {pointsError ? <p role="status">暂时无法读取积分。稍后重新打开「我的空间」可重试。</p>
                  : points ? (
                    <>
                      <p>余额 {(points.balance_minor / points.scale).toFixed(2)} LP</p>
                      <h3>积分流水</h3>
                      {points.entries.length ? (
                        <ul>{points.entries.map(entry => (
                          <li key={entry.id}>{entry.kind} · {(entry.amount_minor / points.scale).toFixed(2)} LP · {entry.created_at}</li>
                        ))}</ul>
                      ) : <p>暂无积分流水。</p>}
                    </>
                  ) : <p role="status">正在读取积分…</p>}
              </article>
            </section>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p role="status" aria-live="polite">
        {status}
      </p>
    </main>
  );
}
function Bootstrap() {
  const [config, setConfig] = useState<{
      appId: string;
      clientId: string;
      ready: boolean;
    } | null>(null),
    [error, setError] = useState(false);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setConfig)
      .catch(() => setError(true));
  }, []);
  if (!config || !config.ready || error)
    return (
      <main>
        <header>
          <span className="brand">
            Loka<span>你的个人 AI</span>
          </span>
        </header>
        <img
          className="brand-symbol"
          src="/brand/loka-mark.svg"
          alt="Loka 品牌标志"
        />
        <small>账户与共同身份</small>
        <h1>
          {error ? "暂时无法连接" : "从相识开始，"}
          <br />
          {error ? "请稍后重试。" : "一起形成判断。"}
        </h1>
        <p>
          {!config && !error
            ? "正在检查登录服务…"
            : "邮箱登录服务尚未开通，请待服务配置完成后再注册。"}
        </p>
        <article>
          <h2>你的身份会持续保留</h2>
          <p>
            使用邮箱注册或登录，建立个人 ID，为 Loka 命名。登录后可在「我的空间」查看积分。
          </p>
        </article>
        <a className="mirror-link" href="/twin-workspace">
          体验本机 Twin 工作台 →
        </a>
        <a className="mirror-link" href="/design">
          查看完整产品流程 →
        </a>
        <button className="primary" onClick={() => location.reload()}>
          重新检查服务
        </button>
      </main>
    );
  return (
    <PrivyProvider
      appId={config.appId}
      clientId={config.clientId || undefined}
      config={{
        loginMethods: ["email"],
        appearance: { theme: "light", accentColor: "#726286" },
        embeddedWallets: { ethereum: { createOnLogin: "off" } },
      }}
    >
      <App />
    </PrivyProvider>
  );
}
const TradeEntry = lazy(() => import('./twin-workspace/trade-entry'));
const TwinWorkspace = lazy(() => import('./twin-workspace/workspace-page'));
const isTwinRoute = /^\/(?:twin-workspace|twin)\/?$/.test(location.pathname);
const isIdentityRoute = new URLSearchParams(location.search).has("identity");
if (isTwinRoute || isIdentityRoute) document.documentElement.lang = "en";
createRoot(document.getElementById("root")!).render(
  isTwinRoute
    ? <Suspense fallback={<p role="status">Opening Twin workspace…</p>}><TradeEntry><TwinWorkspace /></TradeEntry></Suspense>
    : isIdentityRoute ? <ExperienceIdentity /> : location.pathname === "/design" ? <div className="h5-phone"><Workspace /></div> : <Bootstrap />,
);
