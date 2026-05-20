import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const servers = [
  { name: "main", file: join(__dirname, "server.ts"), color: "\x1b[36m" },
  { name: "risk", file: join(__dirname, "risk-server.ts"), color: "\x1b[35m" },
  { name: "catalog", file: join(__dirname, "../catalog/src/server.ts"), color: "\x1b[33m" },
];

const reset = "\x1b[0m";

const processes = servers.map(({ name, file, color }) => {
  const prefix = `${color}[${name}]${reset}`;
  const child = spawn(process.execPath, ["--import", "tsx", file], {
    env: process.env,
    stdio: "pipe",
  });

  child.stdout.on("data", (chunk: Buffer) =>
    chunk.toString().split("\n").filter(Boolean).forEach((line) => console.log(`${prefix} ${line}`)),
  );
  child.stderr.on("data", (chunk: Buffer) =>
    chunk.toString().split("\n").filter(Boolean).forEach((line) => console.error(`${prefix} ${line}`)),
  );
  child.on("exit", (code, signal) =>
    console.log(`${prefix} exited (code=${code ?? signal})`),
  );

  return child;
});

const shutdown = (signal: string) => {
  console.log(`\n[orchestrator] ${signal} — stopping all servers`);
  processes.forEach((p) => p.kill(signal as NodeJS.Signals));
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
