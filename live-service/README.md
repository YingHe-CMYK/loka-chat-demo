# LokaChat Twin

Twin 工作台从 `/twin` 打开。注册或登录后创建或打开已有 Twin，再依次设置形象与声音。工作台会准备一个明确标注为假设的决策情境，或根据用户主动提供的 Polymarket 主页和本机资料准备判断。用户可以在回放里直接点选、左右滑判断卡、保留疑问或稍后继续。

登录用户可以预览并确认要加入个人训练集的那一条结构化样本。原始本机文件与样本分别处理。选择仅本机继续时，对照结果留在当前工作台。保存的样本可在 **My training examples** 展开或撤回。

## 本地启动

使用 Node.js 24（包含 node:sqlite）。

```sh
cd live-service
npm ci
cp .env.example .env
# 在本机编辑 .env，填入 Privy 配置；不要提交此文件。
npm run build
npm start
```

浏览器打开 [Twin 工作台](http://localhost:8780/twin)。可以直接用 [本机体验入口](http://localhost:8780/twin?start=1) 走一遍，无需 Privy。真实邮箱登录需要在 Privy 配置所用的浏览器 origin，并配置服务端 App ID 和 Secret。Production 模式在缺少 Privy 配置时会拒绝启动。

前端开发可另外运行 npm run dev，默认 http://localhost:5173 ，/api 自动代理到 8780。真实登录时，把浏览器实际访问的 origin 加入 Privy 的开发应用。

## 环境变量

PRIVY_APP_ID：公开值，从 Privy 应用 Basics 获取。前端由 /api/config 读取，不需要重打包。
PRIVY_CLIENT_ID：可选公开值；未创建 App Client 时留空。
PRIVY_APP_SECRET：只读 App Secret。仅后端使用来读取已验证用户。不得使用 VITE_ 前缀，不进入前端源码或镜像。
DATABASE_PATH：SQLite 路径。本机默认为 ./data/loka.sqlite，Docker 为 /app/data/loka.sqlite。
PORT：默认 8780。
LOKA_DOMAIN：使用 Docker Compose 部署时的域名，例如 account.example.com，不含协议或路径。
TRUST_PROXY_HOPS：仅在确定只有 Caddy 一层可信反向代理时设为 1；Compose 已设置，直接运行默认 0。

## 服务器部署

当前 GitHub Pages 不会执行这个后端。使用支持持久磁盘的单实例 Linux Docker 服务器。准备域名 A/AAAA 指向服务器，放行 80/443；不要把容器 8780 端口额外暴露公网。

在服务器此目录创建 .env，填写 Privy 值和 LOKA_DOMAIN，然后：

```sh
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 loka
```

Caddy 自动配置 HTTPS。只有 web 服务暴露 80/443；loka 在容器内部监听。SQLite 保存到 loka_data 卷，不能使用 docker compose down -v，否则数据卷会被删除。该模板只支持单个应用实例；横向扩容前需改用共享数据库和共享限流存储。

备份时用 SQLite 一致性备份机制（或停止应用后备份整个数据卷），不能只复制运行中的主 .sqlite 文件而漏掉 WAL。首次上线前检查备份/恢复、域名、邮件送达、两个真实测试账户隔离以及个人训练集撤回。

## 验证

```sh
npm run quality
```

该命令执行 lint、类型检查、测试和构建。判断逻辑、账户归属和样本保存由现有接口支持。手机和桌面均可使用工作台。GitHub Pages 只能托管静态资源，邮箱登录和账户训练集需连接后端服务。
