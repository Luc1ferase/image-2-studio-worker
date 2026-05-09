#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CONFIG_PATH = "wrangler.jsonc";

export function normalizeCustomDomain(value) {
  const hostname = String(value ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (hostname === "" || hostname.includes("://") || hostname.includes("/") || hostname.includes(":")) {
    throw new Error("Custom Domain must be a hostname only, for example studio.example.com.");
  }
  if (!isValidCloudflareHostname(hostname)) {
    throw new Error("Custom Domain must be a Cloudflare-managed hostname, for example studio.example.com.");
  }
  return hostname;
}

export function setCustomDomainRoute(config, value) {
  const hostname = normalizeCustomDomain(value);
  const routes = Array.isArray(config.routes) ? config.routes : [];
  return {
    ...config,
    routes: [
      ...routes.filter((route) => route?.custom_domain !== true),
      {
        pattern: hostname,
        custom_domain: true,
      },
    ],
  };
}

export async function configureCustomDomain(configPath, value) {
  const rawConfig = await fs.readFile(configPath, "utf8");
  const config = JSON.parse(stripJsonComments(rawConfig));
  const nextConfig = setCustomDomainRoute(config, value);
  await fs.writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
  return nextConfig;
}

function isValidCloudflareHostname(hostname) {
  if (hostname.length > 253 || !hostname.includes(".") || hostname.includes("*")) {
    return false;
  }
  const labels = hostname.split(".");
  return labels.every((label) => (
    label.length >= 1
    && label.length <= 63
    && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  ));
}

function stripJsonComments(value) {
  let result = "";
  let inString = false;
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    const next = value[index + 1];

    if (inLineComment) {
      if (current === "\n" || current === "\r") {
        inLineComment = false;
        result += current;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += current;
      if (escaping) {
        escaping = false;
      } else if (current === "\\") {
        escaping = true;
      } else if (current === "\"") {
        inString = false;
      }
      continue;
    }

    if (current === "\"") {
      inString = true;
      result += current;
      continue;
    }

    if (current === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    result += current;
  }

  return result;
}

async function main() {
  const [domain] = process.argv.slice(2);
  if (!domain || domain === "--help" || domain === "-h") {
    const command = path.basename(process.argv[1] ?? "configure-custom-domain.js");
    console.log(`Usage: node scripts/${command} studio.example.com`);
    process.exit(domain ? 0 : 1);
  }
  const configPath = path.resolve(DEFAULT_CONFIG_PATH);
  const nextConfig = await configureCustomDomain(configPath, domain);
  const customDomain = nextConfig.routes.find((route) => route.custom_domain === true)?.pattern;
  console.log(`Configured Cloudflare Custom Domain: ${customDomain}`);
  console.log("Run `npm run cf:deploy` to publish this route.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
