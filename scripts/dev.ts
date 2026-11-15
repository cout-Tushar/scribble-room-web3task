import { context } from "esbuild";
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { cp } from "node:fs/promises";
import { buildProject, serverBuild, clientBuild } from "./build.ts";

await buildProject();
const contexts = await Promise.all([
  context(serverBuild),
  context(clientBuild),
]);
await Promise.all(contexts.map((c) => c.watch()));
const assets = watch("public", { recursive: true }, () => {
  void cp("public", "dist/public", { recursive: true }).catch(console.error);
});
const server = spawn(process.execPath, ["--watch", "dist/server.js"], {
  stdio: "inherit",
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  assets.close();
  server.kill();
  await Promise.all(contexts.map((c) => c.dispose()));
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
server.on("exit", () => void stop());
