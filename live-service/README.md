# Loka 真实账户与内嵌钱包服务

本目录是可构建的真实接入代码，和上层静态 demo 分开。没有配置 Privy 时只显示配置缺失；不会接受 123456 或生成模拟钱包。当前未上线，也未进行真实邮箱收信与钱包创建验收。

## 真实用户路径

打开页面 → Privy 官方邮箱 OTP 弹窗 → 验证成功 → Privy 创建 EVM 内嵌钱包 → Loka 服务端验证登录令牌 → 设置用户名 → SQLite 保存账户 → 查看真实钱包地址。

同一 Privy 用户 ID 是账户主键，邮箱和用户名都不是身份凭证。重新登录和更换设备后，通过同一个后端取回用户名。钱包以 Privy linked_accounts 为准。若用户取消钱包创建，可以在账户页重试；不会把未创建的钱包显示为成功。此版本没有转账、资产授权、私钥导出、交易历史或余额查询入口。

当前页面在账户准备完成处结束。现有镜子 demo 的推断/健康/八字/关系页面仍为模拟；没有将它们冒充真实模型结果或将旧 localStorage 内容自动上传。把真实账户接回镜子业务需要后续模型接口和逐项数据授权。

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

浏览器打开 http://localhost:8780 。未配置也能在开发模式启动检查配置缺失页面；production 模式没有 App ID / Secret 会拒绝启动。

前端开发可另外运行 npm run dev，默认 http://localhost:5173 ，/api 自动代理到 8780。两个开发 origin 都需要按实际使用情况加入 Privy 开发应用。

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

备份时用 SQLite 一致性备份机制（或停止应用后备份整个数据卷），不能只复制运行中的主 .sqlite 文件而漏掉 WAL。首次上线前检查备份/恢复、域名、邮件送达、两个真实测试账户隔离和钱包取消重试。

## API

GET /api/health：进程存活及配置状态，不代表 Privy 邮件和钱包端到端可用。
GET /api/config：仅公开 App ID / Client ID 和配置是否存在，无密钥。
GET /api/me：Bearer token 验证后返回该用户账户、邮箱和 Privy 内嵌钱包。
PUT /api/me：只允许提交 username；用户 ID 从验证过的 token 获取。用户名 2–24 字，NFKC 规范化后不区分大小写判重。
POST /api/models/judgment：预留判断模型。
POST /api/models/prediction：预留行为预测模型。
POST /api/models/adjudication：预留裁决模型。

模型端点均要求登录，当前返回 HTTP 501 MODEL_NOT_CONNECTED，不接收/转发私人材料到未配置服务。后续在 server/app.mjs 替换预留处理器，加入版本、证据来源、超时、用量记录、用户许可和真实响应校验；不得直接把浏览器提供的 URL 当上游地址。

## 权限与密钥边界

前端不接触 App Secret；后端不创建、保存或代签用户私钥。账户页从服务端确认的 linked_accounts 展示钱包，不能通过前端伪造地址关联到账户。未认证返回 401，未配置返回 503；模型未接入返回 501。使用官方 SDK 验证令牌签名、audience 和过期时间。

开发测试用人工签署的短期测试令牌验证 SDK 校验，不是调用 Privy 生产服务；账户 API 测试注入假身份，只用于验证账户隔离、校验和持久化。生产入口没有测试身份开关。

## 验收

npm test
npm run build

需在 Privy 配好后真人完成：邮件收信、正确与错误验证码、创建钱包、取消后重试、退出/跨设备登录保持同一地址、两个用户相同用户名冲突、服务故障提示。自动化检查不能替代这些真实服务验收。

依赖已通过 package-lock.json 锁定；SDK 会引入较大的钱包依赖。构建成功但有第三方包的 PURE 注释和 chunk 大小警告。Docker 镜像构建需在有 Docker 的环境执行；当前机器尚未验证镜像运行。
