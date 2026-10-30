# Privy 注册与配置：按顺序做

本指南对应 live-service 代码，不是当前 GitHub Pages 上的模拟注册页。接口查阅日期：2026-10-30。

## 1. 注册你自己的 Privy 账户

打开 https://dashboard.privy.io ，按页面提供的方式注册或登录。账户和服务条款由你本人确认。使用你长期控制的邮箱；创建应用后可以在后台邀请团队成员。

## 2. 创建 Loka 应用

创建一个新应用，命名 Loka Chat Development，先用于开发验证。生产上线再创建 Loka Chat Production，分开使用 App ID 和 Secret。

进入 Configuration → App settings → Basics，复制 App ID。它是公开标识，可以提供给开发者。

## 3. 开启 Email 登录

进入 Authentication 页面，启用 Email。此次先不启用 SMS、社交或外部钱包登录。

用户在 Loka 点击 Continue with email 后会打开 Privy 的官方邮箱登录弹窗，邮件验证码由 Privy 发出和验证，Loka 不生成固定验证码。官方文档说明 OTP 有效期为 10 分钟；以后台当前设置为准。

代码已配置 loginMethods: ['email'] 和 embeddedWallets.ethereum.createOnLogin: 'all-users'。钱包随官方登录弹窗创建；用户取消时，账户页有 Create wallet 重试。不要改成自定义 loginWithCode 后仍以为这个自动创建选项会生效。

## 4. 配置允许访问的域名

进入 Configuration → App settings → Domains → Allowed origins → Web & mobile web。

开发应用按需要添加：
http://localhost:8780
http://localhost:5173

生产应用添加最终真实服务的 HTTPS origin，例如：
https://account.your-domain.com

只填 origin，不填 /mirror-loop.html、/loka-chat-demo/ 或其他路径。不要填通配公共托管域名。当前真实服务还没有部署域名，生产 origin 要等服务器和域名确定后再填写。

现有 https://yinghe-cmyk.github.io 只有静态 demo，不运行此后端，因此现在不需要为了这个独立接入服务把它加入允许域名。

## 5. 创建服务端 Secret

在应用设置的 App secrets 区域创建 Read-only Secret。本后端只读取用户及其已关联钱包，不使用服务端创建/转账/签名接口，所以不需要 Full access。

保存到服务器的密钥设置或本机 live-service/.env：
PRIVY_APP_ID=你的公开AppID
PRIVY_APP_SECRET=只放服务端的Secret

PRIVY_CLIENT_ID 可暂时留空；如果另建 App Client，再填对应公开 Client ID。

Secret 不要粘贴到聊天、前端、GitHub 文件或截图里。官方说明 Secret 丢失后不能找回，只能重新生成。不要把钱包私钥当作 App Secret 填进去。

## 6. 启动代码

安装 Node.js 24，在 live-service 目录执行：
npm ci
cp .env.example .env

编辑 .env 填写上一节配置，然后：
npm run build
npm start

打开 http://localhost:8780 。在开发环境允许列表里使用同样的 localhost，避免改用 127.0.0.1 导致 origin 不一致。

服务器部署步骤见 README.md 的 Docker Compose 章节。真实服务需要服务器和持久数据库，不能只把本目录推到 GitHub Pages 就认为后端上线了。

## 7. 第一轮真实验收

使用本人邮箱收取真实验证码。验证成功后设置用户名；账户页应显示由 Privy 返回的真实 0x 地址，而不是 DEMO ID。

退出再登录，用户名和钱包地址应相同。换另一台设备登录同一邮箱，也应读到相同账户。取消钱包创建应提供重试，而非显示成功。第二个测试账户选择相同用户名应提示已被占用。

目前没有余额、转账或资产授权入口，不需要充值来验证注册与钱包创建。模型也尚未接入，不会读取或上传你的个人资料。

## 官方参考

创建应用与获取凭据：https://docs.privy.io/basics/get-started/dashboard/create-new-app
开启邮箱登录：https://docs.privy.io/basics/get-started/dashboard/configure-login-methods
配置允许域名：https://docs.privy.io/recipes/dashboard/allowed-domains
自动创建钱包：https://docs.privy.io/basics/react/advanced/automatic-wallet-creation
服务端令牌验证：https://docs.privy.io/authentication/user-authentication/access-tokens
