#!/usr/bin/env node
// Patches the OpenCode config to register the OCRB plugin.
// Called by install.sh and install.ps1 after cloning the repo.
// Usage: CONFIG_FILE=<path> PLUGIN_URL=<file://...> node patch-config.js
import fs   from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const configFile = process.env.CONFIG_FILE;
const pluginUrl  = process.env.PLUGIN_URL;

if (!configFile || !pluginUrl) {
  console.error("patch-config.js: CONFIG_FILE and PLUGIN_URL env vars are required");
  process.exit(1);
}

// Validate PLUGIN_URL before it ever touches the config file
try {
  const u = new URL(pluginUrl);
  if (u.protocol !== "file:") {
    console.error("Error: PLUGIN_URL must be a file:// URL, got: " + pluginUrl);
    process.exit(1);
  }
} catch {
  console.error("Error: PLUGIN_URL is not a valid URL: " + pluginUrl);
  process.exit(1);
}

// ── Read existing config (fail closed on bad JSON or bad schema) ──────────────
let config = {};

if (fs.existsSync(configFile)) {
  let raw;
  try {
    raw = fs.readFileSync(configFile, "utf8");
  } catch (err) {
    console.error("Error: could not read " + configFile + ": " + err.message);
    process.exit(1);
  }
  try {
    config = JSON.parse(raw);
  } catch (err) {
    console.error("Error: " + configFile + " exists but is not valid JSON.");
    console.error("Fix or remove it manually, then re-run the installer.");
    console.error("Parse error: " + err.message);
    process.exit(1);
  }

  // Validate root shape — JSON.parse can return null, arrays, strings, etc.
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    console.error("Error: " + configFile + " is valid JSON but not an object (got " + (config === null ? "null" : Array.isArray(config) ? "array" : typeof config) + ").");
    console.error("Fix or remove it manually, then re-run the installer.");
    process.exit(1);
  }

  // Fail closed — if plugin field exists but is not a string array, refuse
  // to silently reset it and corrupt the user's existing config.
  if ("plugin" in config) {
    if (!Array.isArray(config.plugin) ||
        !config.plugin.every(p => typeof p === "string")) {
      console.error("Error: " + configFile + " has a 'plugin' field that is not a string array.");
      console.error("Fix it manually, then re-run the installer.");
      process.exit(1);
    }
  }
}

if (!Array.isArray(config.plugin)) config.plugin = [];

if (config.plugin.includes(pluginUrl)) {
  console.log("  Already registered — no changes needed.");
  process.exit(0);
}

// ── Write atomically: exclusive tmp file + rename ─────────────────────────────
const configDir = path.dirname(configFile);
try {
  fs.mkdirSync(configDir, { recursive: true });
} catch (err) {
  console.error("Error: could not create config directory: " + err.message);
  process.exit(1);
}

// Backup existing file before touching it
if (fs.existsSync(configFile)) {
  const backup = configFile + ".bak";
  try {
    fs.copyFileSync(configFile, backup);
    console.log("  Backup written to: " + backup);
  } catch (err) {
    console.error("Error: could not write backup: " + err.message);
    process.exit(1);
  }
}

const newConfig = { ...config, plugin: [...config.plugin, pluginUrl] };
const newJson   = JSON.stringify(newConfig, null, 2) + "\n";

// Use a random name + exclusive flag (wx) so we never follow a pre-existing
// symlink and never race with another writer in the same directory.
// writeFileSync loops internally until all bytes are written.
const tmpFile = path.join(configDir, ".ocrb-config-" + crypto.randomBytes(6).toString("hex") + ".tmp");
try {
  fs.writeFileSync(tmpFile, newJson, { encoding: "utf8", mode: 0o600, flag: "wx" });
  fs.renameSync(tmpFile, configFile);
  console.log("  Written to: " + configFile);
} catch (err) {
  try { fs.unlinkSync(tmpFile); } catch {}
  console.error("Error: could not write config: " + err.message);
  process.exit(1);
}
