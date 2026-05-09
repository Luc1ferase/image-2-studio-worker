#!/usr/bin/env node
import { startGuiServer } from "./gui/server.js";

const { url } = await startGuiServer();

console.log(`Image GUI is running at ${url}`);
if (!url.endsWith(":4317")) {
  console.log("Default port 4317 was busy, so a free port was selected.");
}
console.log("Press Ctrl+C to stop.");
