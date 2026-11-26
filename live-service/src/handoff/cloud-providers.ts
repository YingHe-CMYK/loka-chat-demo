import { createHash } from 'node:crypto'
export type Provider = 'calendar'|'gmail'|'slack'|'notion'|'drive'|'github'
export type Credential={accessToken:string;refreshToken?:string;expiresAt?:number;scopes:string[]}
export type ConnectorEnv=Record<string,string|undefined>

export const providers: Record<Provider, { name: string; family: 'google' | 'slack' | 'notion' | 'github'; description: string; scopes: string[] }> = {
  calendar: { name: 'Google Calendar', family: 'google', description: '读取日历活动；预览主日历未来 7 天的安排。', scopes: ['https://www.googleapis.com/auth/calendar.events.readonly'] },
  gmail: { name: 'Gmail', family: 'google', description: '授权范围包含读取邮件；预览最近 5 封未读邮件的标题、发件人与摘要。', scopes: ['https://www.googleapis.com/auth/gmail.readonly'] },
  slack: { name: 'Slack', family: 'slack', description: '以你授权的 Slack 账户读取频道目录及可访问的频道消息，不包含私信。', scopes: ['channels:read', 'channels:history', 'groups:read', 'groups:history'] },
  notion: { name: 'Notion', family: 'notion', description: '仅访问你在 Notion 授权的页面；预览页面标题。', scopes: [] },
  drive: { name: 'Google Drive', family: 'google', description: '读取文件目录、名称和修改时间；当前不读取文件正文。', scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'] },
  github: { name: 'GitHub', family: 'github', description: '通过 GitHub App，只读访问你指定的公开或私有仓库信息及 Pull Request，不修改代码。', scopes: [] },
}
export const isProvider = (value: string): value is Provider => Object.hasOwn(providers, value)
export type Item = { id: string; title: string; detail?: string; date?: string; url?: string; kind?: 'channel' | 'repository' }
export class ConnectionError extends Error {
  constructor(message: string, public code = 'PROVIDER_UNAVAILABLE', public status = 502, public retryAfter?: number) { super(message) }
}
type Json = Record<string, any>
const text = (value: unknown) => typeof value === 'string' ? value : ''
const scopes = (value: unknown) => text(value).split(/[ ,]+/).filter(Boolean)

export function settings(provider: Provider, env: ConnectorEnv = {}) {
  const family = providers[provider].family
  const prefix = family.toUpperCase()
  const clientId = env[`${prefix}_CLIENT_ID`] || ''
  const clientSecret = env[`${prefix}_CLIENT_SECRET`] || ''
  const api = new URL(env.PUBLIC_API_BASE_URL || 'https://loka-chat-mirror-v1.yinghe-vela-live.workers.dev/api')
  const frontend = new URL(env.FRONTEND_ORIGIN || 'https://loka-chat-mirror-v1.yinghe-vela-live.workers.dev')
  for (const url of [api, frontend]) {
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw new Error('OAuth requires HTTPS or localhost')
    if (url.username || url.password || url.search || url.hash) throw new Error('Invalid OAuth public URL')
  }
  if (api.origin !== frontend.origin || api.pathname.replace(/\/$/, '') !== '/api') throw new Error('Use the frontend same-origin /api proxy for OAuth callbacks')
  return { family, clientId, clientSecret, frontend: frontend.origin, redirect: `${api.href.replace(/\/$/, '')}/connections/callback/${family}`, secure: api.protocol === 'https:' }
}
export function githubInstallationUrl(env: ConnectorEnv = {}) {
  const slug = env.GITHUB_APP_SLUG || ''
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? `https://github.com/apps/${slug}/installations/new` : undefined
}
const githubHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Loka-source-connector' })
export function authorizationUrl(provider: Provider, state: string, verifier: string, env: ConnectorEnv = {}) {
  const config = settings(provider, env)
  const url = new URL(config.family === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : config.family === 'slack' ? 'https://slack.com/oauth/v2/authorize' : config.family === 'github' ? 'https://github.com/login/oauth/authorize' : 'https://api.notion.com/v1/oauth/authorize')
  url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirect, response_type: 'code', state }).toString()
  if (config.family === 'google') {
    // Separate consent for each source. Do not silently turn on the other Google sources.
    url.searchParams.set('scope', ['openid', 'email', ...providers[provider].scopes].join(' '))
    url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent select_account')
    url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
    url.searchParams.set('code_challenge_method', 'S256')
  } else if (config.family === 'github') {
    // GitHub App permissions are configured on the app, never OAuth's broad repo scope.
    url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'))
    url.searchParams.set('code_challenge_method', 'S256')
  } else if (config.family === 'slack') url.searchParams.set('user_scope', providers[provider].scopes.join(','))
  else url.searchParams.set('owner', 'user')
  return url
}

export class ProviderClient {
  constructor(private http: typeof fetch = fetch, private env: ConnectorEnv = {}) {}
  private async json(url: string, init?: RequestInit, array?: false): Promise<Json>
  private async json(url: string, init: RequestInit, array: true): Promise<Json[]>
  private async json(url: string, init: RequestInit = {}, array = false): Promise<Json | Json[]> {
    let response: Response
    try { response = await this.http(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(12000) }) }
    catch { throw new ConnectionError('暂时连不上该平台，请稍后重试。') }
    if (response.status === 429) throw new ConnectionError('平台请求较频繁，请稍后再试。', 'RATE_LIMITED', 429, Math.min(3600, Math.max(1, Number(response.headers.get('retry-after')) || 60)))
    if (url.startsWith('https://api.github.com/') && response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))) {
      const seconds = Number(response.headers.get('retry-after')) || Math.ceil(Number(response.headers.get('x-ratelimit-reset')) - Date.now() / 1000) || 60
      throw new ConnectionError('GitHub 请求较频繁，请稍后再试。', 'RATE_LIMITED', 429, Math.min(3600, Math.max(1, seconds)))
    }
    let body: Json
    try { body = await response.json() as Json; if (!body || typeof body !== 'object') throw new Error() }
    catch { throw new ConnectionError('平台返回了无效响应，请稍后重试。') }
    const code = typeof body.error === 'string' ? body.error : body.error?.status
    if (url.startsWith('https://api.github.com/') && response.status === 403 && /rate limit|abuse detection/i.test(text(body.message))) throw new ConnectionError('GitHub 请求较频繁，请稍后再试。', 'RATE_LIMITED', 429, 60)
    if (['invalid_client', 'invalid_client_id', 'invalid_client_secret', 'invalid_redirect_uri', 'incorrect_client_credentials', 'redirect_uri_mismatch'].includes(code)) throw new ConnectionError('平台应用配置有误，请联系管理员核对。', 'CONNECTOR_CONFIGURATION_ERROR', 503)
    if (response.status === 401 || ['invalid_grant', 'invalid_auth', 'token_revoked', 'token_expired', 'account_inactive', 'bad_refresh_token'].includes(code)) throw new ConnectionError('授权已失效，请重新连接。', 'RECONNECT_REQUIRED', 409)
    if (response.status === 403 || code === 'missing_scope' || code === 'restricted_action') throw new ConnectionError('当前授权不足，或平台、组织限制了访问。请检查权限后重新连接。', 'PERMISSION_REQUIRED', 403)
    if (['not_in_channel', 'channel_not_found'].includes(code)) throw new ConnectionError('当前 Slack 账户无法访问此频道，请检查频道权限。', 'CHANNEL_UNAVAILABLE', 403)
    if (url.startsWith('https://api.github.com/') && response.status === 404) throw new ConnectionError('该仓库已移除或不在当前授权范围内，请重新选择授权仓库。', 'REPOSITORY_UNAVAILABLE', 404)
    if (!response.ok || body.ok === false || body.error) throw new ConnectionError('该平台暂时无法完成请求，请稍后重试。')
    if (Array.isArray(body) !== array) throw new ConnectionError('平台返回了无效响应，请稍后重试。')
    return body
  }
  private async token(provider: Provider, values: Record<string, string>) {
    const { family, clientId, clientSecret } = settings(provider, this.env)
    const basic = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    if (family === 'github') return this.json('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...values, client_id: clientId, client_secret: clientSecret }) })
    if (family === 'notion') return this.json('https://api.notion.com/v1/oauth/token', { method: 'POST', headers: { Authorization: basic, 'Content-Type': 'application/json' }, body: JSON.stringify(values) })
    return this.json(family === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://slack.com/api/oauth.v2.access', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(family === 'slack' ? { Authorization: basic } : {}) },
      body: new URLSearchParams({ ...values, ...(family === 'google' ? { client_id: clientId, client_secret: clientSecret } : {}) }),
    })
  }
  private credential(provider: Provider, body: Json, previous?: Credential): Credential {
    if (!text(body.access_token)) throw new ConnectionError('平台没有返回有效授权，请重新连接。', 'RECONNECT_REQUIRED', 409)
    const granted = typeof body.scope === 'string' ? scopes(body.scope) : previous?.scopes || []
    if (providers[provider].scopes.some(scope => !granted.includes(scope))) throw new ConnectionError('尚未获得所需的读取权限，请重新授权。', 'PERMISSION_REQUIRED', 403)
    return { accessToken: body.access_token, refreshToken: text(body.refresh_token) || previous?.refreshToken,
      expiresAt: Number(body.expires_in) > 0 ? Date.now() + Number(body.expires_in) * 1000 : undefined, scopes: granted }
  }
  async exchange(provider: Provider, code: string, verifier: string) {
    const config = settings(provider, this.env)
    const body = await this.token(provider, { grant_type: 'authorization_code', code, redirect_uri: config.redirect, ...(['google', 'github'].includes(config.family) ? { code_verifier: verifier } : {}) })
    if (config.family === 'slack' && (!text(body.authed_user?.id) || body.authed_user?.token_type !== 'user')) throw new ConnectionError('没有获得 Slack 用户授权，请检查应用的 User Token Scopes 配置。', 'PERMISSION_REQUIRED', 403)
    const credential = this.credential(provider, config.family === 'slack' ? body.authed_user : body)
    if (config.family === 'github') {
      const identity = await this.json('https://api.github.com/user', { headers: githubHeaders(credential.accessToken) })
      if (!Number.isSafeInteger(identity.id) || identity.id <= 0 || !text(identity.login)) throw new ConnectionError('无法确认 GitHub 账户，请重新连接。')
      return { credential, id: String(identity.id), label: `@${identity.login}` }
    }
    if (config.family === 'google') {
      const identity = await this.json('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${credential.accessToken}` } })
      if (!text(identity.sub)) throw new ConnectionError('无法确认 Google 账户，请重新连接。')
      return { credential, id: text(identity.sub), label: text(identity.email) || 'Google 账户' }
    }
    const id = text(config.family === 'slack' ? body.team?.id : body.workspace_id)
    if (!id) throw new ConnectionError('平台没有返回有效的工作区信息，请重新连接。')
    return { credential, id: config.family === 'slack' ? `${id}:${body.authed_user.id}` : id, label: text(config.family === 'slack' ? body.team?.name : body.workspace_name) || (config.family === 'slack' ? 'Slack 工作区' : 'Notion 工作区') }
  }
  async refresh(provider: Provider, credential: Credential) {
    if (!credential.refreshToken) throw new ConnectionError('授权已到期，请重新连接。', 'RECONNECT_REQUIRED', 409)
    return this.credential(provider, await this.token(provider, { grant_type: 'refresh_token', refresh_token: credential.refreshToken }), credential)
  }
  async preview(provider: Provider, credential: Credential, selection?: string): Promise<{ items: Item[]; hasMore: boolean }> {
    if (provider === 'github') return this.githubPreview(credential, selection)
    const headers = { Authorization: `Bearer ${credential.accessToken}`, ...(provider === 'notion' ? { 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' } : {}) }
    if (provider === 'calendar') {
      const params = new URLSearchParams({ timeMin: new Date().toISOString(), timeMax: new Date(Date.now() + 7 * 86400000).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '10' })
      const data = await this.json(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers })
      return { items: (data.items || []).map((item: Json) => ({ id: text(item.id), title: text(item.summary) || '未命名日程', date: text(item.start?.dateTime || item.start?.date), detail: text(item.location), url: text(item.htmlLink) })), hasMore: Boolean(data.nextPageToken) }
    }
    if (provider === 'gmail') {
      const data = await this.json('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is%3Aunread&maxResults=5', { headers })
      const items = await Promise.all((data.messages || []).slice(0, 5).map(async (message: Json) => {
        const mail = await this.json(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(text(message.id))}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, { headers })
        const header = (name: string) => (mail.payload?.headers || []).find((value: Json) => text(value.name).toLowerCase() === name)?.value
        return { id: text(mail.id), title: text(header('subject')) || '无主题', detail: [text(header('from')), text(mail.snippet)].filter(Boolean).join('\n'), date: Number(mail.internalDate) > 0 ? new Date(Number(mail.internalDate)).toISOString() : '' }
      }))
      return { items, hasMore: Boolean(data.nextPageToken) }
    }
    if (provider === 'drive') {
      const params = new URLSearchParams({ q: 'trashed = false', pageSize: '10', orderBy: 'modifiedTime desc', fields: 'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)' })
      const data = await this.json(`https://www.googleapis.com/drive/v3/files?${params}`, { headers })
      return { items: (data.files || []).map((item: Json) => ({ id: text(item.id), title: text(item.name) || '未命名文件', detail: text(item.mimeType), date: text(item.modifiedTime), url: text(item.webViewLink) })), hasMore: Boolean(data.nextPageToken) }
    }
    if (provider === 'notion') {
      const data = await this.json('https://api.notion.com/v1/search', { method: 'POST', headers, body: JSON.stringify({ page_size: 10, filter: { value: 'page', property: 'object' }, sort: { direction: 'descending', timestamp: 'last_edited_time' } }) })
      return { items: (data.results || []).map((page: Json) => {
        const title = Object.values(page.properties || {}).find((property: any) => property?.type === 'title') as Json | undefined
        return { id: text(page.id), title: (title?.title || []).map((part: Json) => text(part.plain_text)).join('') || '无标题页面', date: text(page.last_edited_time), url: text(page.url) }
      }), hasMore: Boolean(data.has_more) }
    }
    if (selection) {
      if (!/^[CG][A-Z0-9]{4,}$/.test(selection)) throw new ConnectionError('请选择有效的 Slack 频道。', 'INVALID_CHANNEL', 400)
      const data = await this.json(`https://slack.com/api/conversations.history?channel=${encodeURIComponent(selection)}&limit=15`, { headers })
      return { items: (data.messages || []).map((message: Json) => ({ id: text(message.ts), title: text(message.text) || '非文字消息', detail: text(message.user), date: Number(message.ts) > 0 ? new Date(Number(message.ts) * 1000).toISOString() : '' })), hasMore: Boolean(data.has_more) }
    }
    const data = await this.json('https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=100', { headers })
    return { items: (data.channels || []).filter((item: Json) => item.is_member).map((item: Json) => ({ id: text(item.id), title: `# ${text(item.name)}`, detail: text(item.purpose?.value), kind: 'channel' })), hasMore: Boolean(data.response_metadata?.next_cursor) }
  }
  private async githubPreview(credential: Credential, selection?: string): Promise<{ items: Item[]; hasMore: boolean }> {
    if (selection && !/^\d{1,20}:\d{1,20}$/.test(selection)) throw new ConnectionError('请选择有效的 GitHub 仓库。', 'INVALID_REPOSITORY', 400)
    const headers = githubHeaders(credential.accessToken)
    // Re-read installation membership on every preview, including PR navigation.
    // A public repository outside this app's installations is not implicitly allowed.
    const data = await this.json('https://api.github.com/user/installations?per_page=5', { headers })
    if (!Array.isArray(data.installations)) throw new ConnectionError('GitHub 返回了无效的安装信息。')
    const installations = data.installations.filter((item: Json) => Number.isSafeInteger(item.id) && item.id > 0 && !item.suspended_at).slice(0, 5)
    if (!installations.length) throw new ConnectionError('请先选择授权仓库并安装 GitHub App；组织仓库可能需要管理员批准。完成后再试。', 'INSTALLATION_REQUIRED', 409)
    const lists = await Promise.all(installations.map(async (installation: Json) => {
      const list = await this.json(`https://api.github.com/user/installations/${installation.id}/repositories?per_page=10`, { headers })
      if (!Array.isArray(list.repositories)) throw new ConnectionError('GitHub 返回了无效的仓库列表。')
      return { installation: installation.id, repositories: list.repositories.slice(0, 10), more: Number(list.total_count) > 10 }
    }))
    const repositories = lists.flatMap(list => list.repositories.filter((repo: Json) => Number.isSafeInteger(repo.id) && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text(repo.full_name))).map((repo: Json) => ({ id: `${list.installation}:${repo.id}`, repo })))
    if (selection) {
      const chosen = repositories.find(item => item.id === selection)
      if (!chosen) throw new ConnectionError('该仓库已移除或不在本次授权列表内，请返回仓库列表重新选择。', 'REPOSITORY_UNAVAILABLE', 404)
      const path = text(chosen.repo.full_name).split('/').map(encodeURIComponent).join('/')
      const pulls = await this.json(`https://api.github.com/repos/${path}/pulls?state=all&sort=updated&direction=desc&per_page=11`, { headers }, true)
      return { items: pulls.slice(0, 10).map(item => ({ id: String(item.id), title: `#${item.number} ${text(item.title)}`, detail: [item.merged_at ? '已合并' : item.state === 'closed' ? '已关闭' : '待合并', text(item.user?.login) ? `@${item.user.login}` : ''].filter(Boolean).join(' · '), date: text(item.updated_at), url: text(item.html_url) })), hasMore: pulls.length > 10 }
    }
    return { items: repositories.map(({ id, repo }) => ({ id, title: text(repo.full_name), detail: [repo.private ? '私有仓库' : '公开仓库', text(repo.description)].filter(Boolean).join(' · '), date: text(repo.pushed_at), url: text(repo.html_url), kind: 'repository' })), hasMore: Number(data.total_count) > 5 || lists.some(list => list.more) }
  }
}
