import { mkdir, cp, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

// Keep the existing zero-bundler runtime. Produce a deployable Node application,
// including the real backend rather than a static-only imitation of the game.
for (const file of ["server.js", "public/app.js"]) {
  execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
}
await mkdir("dist", { recursive: true });
await cp("public", "dist/public", { recursive: true });
await cp("server.js", "dist/server.js");
await cp("package-lock.json", "dist/package-lock.json");
const manifest = JSON.parse(await readFile("package.json", "utf8"));
manifest.scripts = { start: "node server.js" };
delete manifest.devDependencies;
await writeFile("dist/package.json", JSON.stringify(manifest, null, 2) + "\n");
await writeFile(
  "dist/README.md",
  "# Scribble Room\n\nRun `npm ci --omit=dev` then `npm start`. The server serves the frontend and Socket.IO on the same origin. Set PORT as required. Use a single persistent Node instance.\n",
);
console.log(
  "Production package ready in dist/ (frontend + unchanged Socket.IO backend).",
);
