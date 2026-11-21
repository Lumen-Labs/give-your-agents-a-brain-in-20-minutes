import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = join(homedir(), ".brainapi", "source", ".env");

function readToken() {
  if (process.env.BRAINPAT_TOKEN) return process.env.BRAINPAT_TOKEN;
  try {
    const match = readFileSync(envFile, "utf8").match(/^BRAINPAT_TOKEN=["']?([^"'\n]+)["']?/m);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

const token = readToken();
if (!token) {
  console.error("Set BRAINPAT_TOKEN or finish brainapi init first.");
  process.exit(1);
}

const child = spawn(process.execPath, [join(root, "src", "server.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    BRAINPAT_TOKEN: token,
    BRAINAPI_URL: process.env.BRAINAPI_URL || "http://localhost:8000",
    FIRM_BRAIN_ID: process.env.FIRM_BRAIN_ID || "firmdesk",
    JURISDICTION_ID: process.env.JURISDICTION_ID || "demolocal",
    JURISDICTION_BRAIN_ID: process.env.JURISDICTION_BRAIN_ID || "jdemolocal",
    DESK_PORT: process.env.DESK_PORT || "4173",
  },
});

child.on("exit", (code) => process.exit(code ?? 0));
