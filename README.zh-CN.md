# Image-2 Studio

简体中文 | [English](./README.md)

Image-2 Studio 是一个可以部署到 Cloudflare 的图片生成网页工具，用于调用 sub2api 或其他 OpenAI 兼容图片接口，主要面向 `gpt-image-2` / `image-2` 模型。

部署完成后，用户第一次打开网页时会设置管理员密码。之后在网页界面中填写 API Key 和 Base URL，即可生成、查看、管理图片。部署过程不需要提前配置 API Key、Base URL 或密码，也不会把你的密钥提交到仓库。

## 一键部署

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FLuc1ferase%2FImage-2-Studio-cloudflare)

Cloudflare 版本会使用 `wrangler.jsonc` 中声明的资源：

- Cloudflare Workers：运行后端 API 和静态网页
- Workers Static Assets：托管前端文件
- R2：保存生成的图片和请求/响应记录
- Queues：处理图片生成队列
- Durable Object：保存会话历史和任务状态

部署后打开 Worker 地址，先设置管理员密码，然后在网页左侧填写：

- API Key
- Base URL，例如 `https://api.example.com`
- Endpoint，通常是 `/images/generations`

这些配置会保存在当前浏览器的本地存储中，下次打开同一个网页时不需要重复填写。

## 使用方式

### Cloudflare 部署

1. 点击上方 `Deploy to Cloudflare`
2. 按 Cloudflare 页面提示完成部署
3. 打开部署后的 Worker 地址
4. 在网页中填写 API Key、Base URL 和生成参数
5. 点击生成

如果你手动部署，需要先创建 `wrangler.jsonc` 中引用的 Cloudflare 资源：

```bash
npx wrangler r2 bucket create image-2-studio-worker-outputs
npx wrangler queues create image-2-studio-worker-jobs
```

然后执行：

```bash
npm install
npm run cf:deploy
```

### 自定义域名

如果你的域名已经托管在同一个 Cloudflare 账号下，可以把 Worker 映射到一个 Custom Domain。

手动部署或使用自己的 fork 仓库时，可以在部署前写入域名配置：

```bash
npm run cf:domain -- studio.example.com
npm run cf:deploy
```

脚本会在 `wrangler.jsonc` 中写入：

```jsonc
"routes": [
  {
    "pattern": "studio.example.com",
    "custom_domain": true
  }
]
```

如果已经通过一键部署完成，也可以在 Cloudflare 后台部署后添加：

```text
Workers & Pages -> 当前 Worker -> Settings -> Domains & Routes -> Add -> Custom Domain
```

只填写主机名，例如 `studio.example.com`。不要填写 `https://` 或路径。该主机名必须属于同一个 Cloudflare 账号下已托管的 zone。

### 本地运行

```bash
git clone https://github.com/Luc1ferase/Image-2-Studio-cloudflare.git
cd Image-2-Studio-cloudflare
npm install
npm run gui
```

Windows 也可以运行：

```powershell
.\start-gui.cmd
```

浏览器打开终端输出的本地地址，通常是：

```text
http://127.0.0.1:4317
```

本地运行时可以直接在网页中填写 API 配置。如果你希望使用本地环境变量默认值，可以自行创建 `.env`：

```ini
IMAGE_API_BASE_URL=https://api.example.com
IMAGE_API_ENDPOINT_PATH=/images/generations
IMAGE_API_KEY=your-api-key
IMAGE_MODEL=gpt-image-2
IMAGE_SIZE=1024x1024
```

`.env` 已被 git 忽略，请不要提交真实 API Key。本仓库故意不提供 `.env.example`，因为 Cloudflare Deploy Button 会把其中的变量识别为部署时必填的 Secret。

## 功能特性

- 支持 Cloudflare 一键部署
- 支持 Cloudflare Custom Domain 自定义域名
- 首次访问设置管理员密码
- API 和生成图片访问需要登录
- 默认中文界面，也可切换英文
- 支持浅色 / 深色主题
- API Key、Base URL 和生成参数可在网页中配置并持久化
- 支持 `gpt-image-2`，并自动把 `image-2` 兼容为 `gpt-image-2`
- 默认使用 sub2api 常见的 `/images/generations` 端点
- 支持多尺寸预设，包括方图、横图、竖图、2K、4K
- 支持数量和线程数控制，Cloudflare 版本会按线程数限制队列并发
- Prompt 默认按整段文本处理，只有开启“批量按行”后才会按行拆分
- 支持历史会话查看、重命名、单个删除、批量删除
- 结果图片可点开查看、缩放、上一张 / 下一张切换
- 结果图片支持多选、批量下载、批量删除

## 配置说明

网页中可以配置：

- API Key
- Base URL
- Endpoint
- Model
- Size
- Count
- Threads
- Timeout
- Quality
- Output format
- Batch prompt mode
- Dry run mode
- Language
- Theme

Base URL 只填写接口主机，例如：

```text
https://api.example.com
```

Endpoint 在下拉框中单独选择，例如：

```text
/images/generations
```

## 登录与密码

Cloudflare 版本首次访问时会要求创建管理员密码，密码长度需要为 8 到 20 个字符。密码会使用 PBKDF2-SHA-256 哈希后保存到 Durable Object，不保存明文密码。

设置密码或登录成功后，系统会写入一个 HttpOnly Cookie，登录态有效期为 7 天。

Worker 会保护 API 路由和 `/outputs/*` 图片访问路径。没有登录态时，外部用户不能直接读取历史记录、生成接口或生成图片链接。

如果忘记管理员密码，需要重置该 Worker 对应的 Durable Object 存储，然后重新打开网页设置新密码。这个操作会清空 Durable Object 中的会话历史和登录状态；已经写入 R2 的图片不会自动删除。

## 关于尺寸和模型

项目默认使用 `gpt-image-2`。如果填写 `image-2`，程序会自动转换为 `gpt-image-2`。

尺寸是否真正可用取决于你的上游接口和 sub2api 配置。界面中提供了常见比例、2K、4K 等选项；如果上游不支持某个尺寸，生成请求会被上游拒绝。

ChatGPT Plus 和 OpenAI Platform API 是两套不同的计费体系。拥有 ChatGPT Plus 不代表 API 请求会自动可用或免费。

## 存储位置

Cloudflare 版本会把生成结果保存到 R2：

```text
outputs/YYYY-MM-DD/run-<timestamp>/
```

每个任务目录通常包含：

- `prompt.txt`
- `request.json`
- `response.json`
- `error.json`
- `image-01.png`、`image-01.jpg` 或 `image-01.webp`

本地模式会把同样的文件保存到项目目录下的 `outputs/` 文件夹。`outputs/` 已被 `.gitignore` 忽略。

## 开发检查

```bash
npm test
npm run check
```

## 安全说明

Cloudflare 部署后的网页地址是公开可访问的，但 API 和生成图片需要管理员密码登录后才能访问。API Key 保存在当前浏览器本地存储中，不会提交到仓库。

如果你的提示词或生成图片包含隐私内容，请不要公开本地 `outputs/` 文件夹，也不要把 R2 对象设置成公开可遍历。

## 许可证

Apache License 2.0
