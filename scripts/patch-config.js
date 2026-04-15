#!/usr/bin/env node
// Patches the OpenCode config to register the OCRB plugin path.
// Called by install.sh and install.ps1 after cloning the repo.
// Usage: CONFIG_FILE=<path> PLUGIN_PATH=<path> node patch-config.js
import fs   from "node:fs";
import path from "node:path";

const configFile = process.env.CONFIG_FILE;
const pluginPath = process.env.PLUGIN_PATH;

if (!configFile || !pluginPath) {
  console.error("patch-config.js: CONFIG_FILE and PLUGIN_PATH env vars are required");
  process.exit(1);
}

let config = {};

if (fs.existsSync(configFile)) {
  const raw = fs.readFileSync(configFile, "utf8");
  try {
    config = JSON.parse(raw);
  } catch (err) {
    // Fail closed — never silently overwrite a config we cannot parse.
    console.error("Error: " + configFile + " exists but could not be parsed as JSON.");
    console.error("Fix or remove it manually, then re-run the installer.");
    console.error("Parse error: " + err.message);
    process.exit(1);
  }
}

if (!Array.isArray(config.plugin)) config.plugin = [];

if (config.plugin.includes(pluginPath)) {
  console.log("  Already registered — no changes needed.");
} else {
  // Write a backup before touching the original
  if (fs.existsSync(configFile)) {
    const backup = configFile + ".bak";
    fs.copyFileSync(configFile, backup);
    console.log("  Backup written to: " + backup);
  }

  config.plugin.push(pluginPath);
  fs.mkdirSync(path.dirname(configFile), { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n");
  console.log("  Written to: " + configFile);
}
