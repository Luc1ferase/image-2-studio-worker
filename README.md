# Image-2 Studio

[简体中文](./README.zh-CN.md) | English

Image-2 Studio is a Cloudflare-deployable browser GUI for generating and managing images through sub2api or other OpenAI-compatible image endpoints.

It is designed for self-hosted or privately managed image endpoints. Deploy the app to Cloudflare, then configure the API key, Base URL, endpoint path, model, image size, quality, output format, prompt text, count, and concurrency directly in the web interface.

## Deploy to Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2FLuc1ferase%2FImage-2-Studio-cloudflare)

The Cloudflare deployment uses the Worker, static assets, R2 bucket, Queue, and Durable Object declared in `wrangler.jsonc`. Deployment does not require an API key, Base URL, or password. After the site is live, open the deployed URL, create the first-run admin password, then enter your API Key and Base URL in the GUI.

Cloudflare mode stores generated images in R2 and session history in Durable Objects. It also stores the admin password hash and active login sessions in the same Durable Object. It does not create a local `outputs/` folder.

## Features

- One-click Cloudflare deployment
- Optional Cloudflare Custom Domain mapping
- Static frontend served by Cloudflare Workers
- Generated images stored in Cloudflare R2
- Session history stored in a Durable Object
- Generation jobs processed through Cloudflare Queues
- First-run admin password setup
- Password-protected API and generated image access
- Chinese and English interface
- Light and dark themes
- Persistent local settings in browser storage
- Editable history names and batch history deletion
- Result image viewer with zoom and previous/next controls
- Multi-select result delete and download
- Concurrent image generation jobs
- Prompt batching by explicit toggle
- `gpt-image-2` defaults with sub2api-compatible `/images/generations` endpoint
- High-resolution size presets, including 2K and 4K aspect-ratio options

## Requirements

- Node.js 22 or newer for local Cloudflare development
- Node.js 18 or newer for the local-only GUI server
- An API key and Base URL for a sub2api or OpenAI-compatible image endpoint

The project has no npm runtime dependencies.

Cloudflare deployment uses Wrangler, which is installed as a development dependency.

## Local Setup

Clone the repository:

```bash
git clone https://github.com/Luc1ferase/Image-2-Studio-cloudflare.git
cd Image-2-Studio-cloudflare
```

You can enter API settings in the GUI. If you prefer local environment defaults, create an optional `.env` file:

```ini
IMAGE_API_BASE_URL=https://api.example.com
IMAGE_API_ENDPOINT_PATH=/images/generations
IMAGE_API_KEY=your-api-key
IMAGE_MODEL=gpt-image-2
IMAGE_SIZE=1024x1024
```

`.env` is ignored by git. Do not commit real API keys. This repository intentionally does not include `.env.example` because Cloudflare Deploy Button treats variables in that file as deployment secrets.

## Start

```bash
npm run gui
```

On Windows you can also run:

```powershell
.\start-gui.cmd
```

Open the URL printed in the terminal, usually:

```text
http://127.0.0.1:4317
```

If port `4317` is busy, the app automatically picks another local port and prints it.

## Cloudflare Development

Install dev dependencies, then run Wrangler:

```bash
npm install
npm run cf:dev
```

Deploy manually:

```bash
npm run cf:deploy
```

Before a manual deployment, create the Cloudflare resources referenced by `wrangler.jsonc` if they do not already exist:

```bash
npx wrangler r2 bucket create image-2-studio-worker-outputs
npx wrangler queues create image-2-studio-worker-jobs
```

## Custom Domain

If your domain is already hosted in the same Cloudflare account, you can map the Worker to a Custom Domain.

For manual deployment or a forked repository, configure the hostname before deploying:

```bash
npm run cf:domain -- studio.example.com
npm run cf:deploy
```

This writes a Wrangler route like:

```jsonc
"routes": [
  {
    "pattern": "studio.example.com",
    "custom_domain": true
  }
]
```

For a one-click deployment, you can also add the domain after deployment in the Cloudflare dashboard:

```text
Workers & Pages -> your Worker -> Settings -> Domains & Routes -> Add -> Custom Domain
```

Use a hostname only, such as `studio.example.com`. Do not include `https://` or a path. The hostname must belong to a zone managed by the same Cloudflare account.

## Configuration

The GUI can configure:

- API Key
- Base URL
- Endpoint path, including `/images/generations` and `/v1/images/generations`
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

User settings are saved in local browser storage after edits, so reopening the page keeps the last selected options. Environment variables still work as defaults, but saved browser settings take priority in the GUI.

## Authentication

On the first Cloudflare visit, Image-2 Studio asks you to create an administrator password. Passwords must be 8 to 20 characters. The password is hashed with PBKDF2-SHA-256 and stored in the Durable Object; plaintext passwords are never stored. Successful setup or login creates an HttpOnly session cookie that lasts seven days.

The Worker protects API routes and `/outputs/*`, so generated image URLs are not readable without a valid session cookie.

If you forget the administrator password, reset the Durable Object storage for this Worker deployment, then open the site again and set a new password. This also clears session history stored in the Durable Object; images already written to R2 are not automatically deleted.

## Endpoint Notes

Use your endpoint host as the Base URL, for example:

```text
https://api.example.com
```

The endpoint path is selected separately in the GUI.

The shorthand model name `image-2` is normalized to `gpt-image-2`. For `gpt-image-*` models, Image-2 Studio does not send the legacy `response_format` field. Returned images are saved as PNG, JPEG, or WebP based on the response payload.

Size support depends on your upstream provider and sub2api configuration. The GUI exposes common square, portrait, landscape, 2K, and 4K presets, but unsupported sizes may be rejected by the upstream service.

ChatGPT Plus and OpenAI Platform API billing are separate. A Plus subscription does not automatically make API requests available or free through an API-compatible endpoint.

## Storage Layout

Cloudflare mode stores generated files in R2 under:

```text
outputs/YYYY-MM-DD/run-<timestamp>/
```

Each job directory may contain:

- `prompt.txt`
- `request.json`
- `response.json`
- `error.json`
- `image-01.png`, `image-01.jpg`, or `image-01.webp`

Local mode stores the same artifacts in the project `outputs/` folder. The `outputs/` folder is ignored by git.

## Development Checks

```bash
npm test
npm run check
```

## Security

For local mode, Image-2 Studio binds to `127.0.0.1` by default. Cloudflare deployments are public at the URL, but the app requires the first-run admin password before API routes or generated images can be accessed. Keep API keys in `.env` or browser storage only, and do not publish local `outputs/` files or public R2 objects if prompts or generated images are private.

## License

Apache License 2.0
