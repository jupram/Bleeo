import { build, context } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const outdir = path.join(root, "dist");
const watchMode = process.argv.includes("--watch");

const common = {
  bundle: true,
  sourcemap: watchMode,
  platform: "browser",
  target: "chrome120",
  format: "esm",
  outdir,
  entryNames: "[name]",
  legalComments: "none",
  minify: !watchMode,
  tsconfig: path.join(root, "tsconfig.json")
};

const entryPoints = {
  background: path.join(root, "src/background/index.ts"),
  content: path.join(root, "src/content/index.ts"),
  offscreen: path.join(root, "src/offscreen/index.ts"),
  popup: path.join(root, "src/popup/index.ts"),
  options: path.join(root, "src/options/index.ts")
};

async function copyPublic() {
  await mkdir(outdir, { recursive: true });
  await cp(path.join(root, "public"), outdir, { recursive: true });
}

async function runBuild() {
  await rm(outdir, { recursive: true, force: true });
  await copyPublic();
  await build({
    ...common,
    entryPoints
  });
}

if (watchMode) {
  await rm(outdir, { recursive: true, force: true });
  await copyPublic();

  const ctx = await context({
    ...common,
    entryPoints
  });

  await ctx.watch();
  process.stdout.write("Watching extension sources...\n");
} else {
  await runBuild();
}
