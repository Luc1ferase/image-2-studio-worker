import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  normalizeCustomDomain,
  setCustomDomainRoute,
} from "../scripts/configure-custom-domain.js";

describe("Custom Domain config", () => {
  it("adds a Wrangler Custom Domain route for a hostname", () => {
    const config = {
      name: "image-2-studio-worker",
      main: "src/cloudflare/worker.js",
    };

    const nextConfig = setCustomDomainRoute(config, "images.example.com");

    assert.deepEqual(nextConfig.routes, [
      {
        pattern: "images.example.com",
        custom_domain: true,
      },
    ]);
    assert.equal(nextConfig.name, "image-2-studio-worker");
  });

  it("replaces an existing Custom Domain route without removing regular routes", () => {
    const config = {
      routes: [
        { pattern: "old.example.com", custom_domain: true },
        { pattern: "api.example.com/*", zone_name: "example.com" },
      ],
    };

    const nextConfig = setCustomDomainRoute(config, "studio.example.com");

    assert.deepEqual(nextConfig.routes, [
      { pattern: "api.example.com/*", zone_name: "example.com" },
      { pattern: "studio.example.com", custom_domain: true },
    ]);
  });

  it("normalizes hostnames and rejects URLs or invalid hostnames", () => {
    assert.equal(normalizeCustomDomain(" Studio.Example.COM "), "studio.example.com");
    assert.throws(() => normalizeCustomDomain("https://studio.example.com"), /hostname only/);
    assert.throws(() => normalizeCustomDomain("studio.example.com/path"), /hostname only/);
    assert.throws(() => normalizeCustomDomain("localhost"), /Cloudflare-managed hostname/);
  });

  it("exposes a package script for configuring a Custom Domain", async () => {
    const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));

    assert.equal(packageJson.scripts["cf:domain"], "node scripts/configure-custom-domain.js");
  });
});
