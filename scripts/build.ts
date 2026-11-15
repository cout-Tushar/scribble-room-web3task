import { mkdir, cp, readFile, writeFile, rm } from "node:fs/promises";
import { build, type BuildOptions } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const outputDir = path.resolve(projectRoot, "dist");

export const serverBuild: BuildOptions = {
  entryPoints: ["server.ts"],
  outfile: "dist/server.js",
  platform: "node",
  absWorkingDir: projectRoot,
  format: "esm",
  target: "node22",
  sourcemap: true,
};
export const clientBuild: BuildOptions = {
  entryPoints: ["client/app.ts"],
  outfile: "dist/public/app.js",
  platform: "browser",
  absWorkingDir: projectRoot,
  target: "es2022",
  sourcemap: true,
};
export async function buildProject() {
  if (path.dirname(outputDir) !== path.resolve(projectRoot))
    throw Error("Invalid build output directory");
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(path.join(outputDir, "public"), { recursive: true });
  await cp(path.join(projectRoot, "public"), path.join(outputDir, "public"), {
    recursive: true,
  });
  await Promise.all([build(serverBuild), build(clientBuild)]);
  await cp(
    path.join(projectRoot, "package-lock.json"),
    path.join(outputDir, "package-lock.json"),
  );
  const manifest = JSON.parse(
    await readFile(path.join(projectRoot, "package.json"), "utf8"),
  );
  manifest.scripts = { start: "node server.js" };
  delete manifest.devDependencies;
  await writeFile(
    path.join(outputDir, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  await writeFile(
    path.join(outputDir, "README.md"),
    "# Scribble Room\n\nRun `npm ci --omit=dev` then `npm start`. Set PORT as needed. Use one persistent Node instance.\n",
  );
  console.log("TypeScript production build ready in dist/.");
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await buildProject();
