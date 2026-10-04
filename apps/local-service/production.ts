import { particleFields, particleStyles } from "../../runtimes/shared/particle-options.js";
import { optionGroups } from "../../runtimes/shared/options.js";
import {
  stylePresets,
  gradientPresets,
} from "../../packages/core/reference-presets.js";
import { fontCatalog } from "../../packages/generators/fonts.js";
import { LocalAssets } from "./assets.js";
import {
  mkdir,
  writeFile,
  readFile,
  rename,
  rm,
  symlink,
  cp,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { build } from "esbuild";
import { chromium } from "playwright";
import { generate, versions } from "../../packages/generators/index.js";
import {
  evaluate,
  duration,
  assetIds,
  fontAssetIds,
  sceneSnapshot,
  backgroundMotions,
  imageFilters,
  textMotions,
  holdMotions,
} from "../../runtimes/shared/motion.js";
import {
  AppError,
  type Project,
  type Target,
} from "../../packages/core/model.js";
import type { Artifact, Production } from "../../packages/core/application.js";
import { atomicJson } from "./repository.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
/** Runs only fixed toolchain commands and terminates their process group on cancellation. */
export function run(
  command: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let output = "";
    const append = (data: Buffer) => {
      output = (output + data.toString()).slice(-16000);
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    const kill = () => {
      try {
        process.kill(-child.pid!, "SIGTERM");
      } catch {}
    };
    const timeout = setTimeout(kill, 600000);
    signal?.addEventListener("abort", kill, { once: true });
    const clean = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", kill);
    };
    child.on("error", (e: any) => {
      clean();
      reject(
        new AppError(
          e.code === "ENOENT" ? "TOOLCHAIN_UNAVAILABLE" : "PROCESS_FAILED",
          e.message,
        ),
      );
    });
    child.on("close", (code) => {
      clean();
      if (signal?.aborted) reject(new AppError("CANCELLED", "작업 취소"));
      else if (code !== 0)
        reject(
          new AppError("VALIDATION_FAILED", output || `Process exited ${code}`),
        );
      else resolve(output);
    });
  });
}
export async function toolchains() {
  let flutter: string | null = null;
  try {
    flutter = JSON.parse(
      await run("flutter", ["--version", "--machine"], root),
    ).frameworkVersion;
  } catch {}
  return {
    schemaVersion: 1,
    generatorVersion: "0.4.0",
    workspaceFeatures: {
      projectDuplicate: true,
      savedHistoryLimit: 30,
      restoreAsNewRevision: true,
      userPresets: true,
      presetAssetScope: "local-workspace",
    },
    targets: [
      {
        id: "flutter",
        sdk: versions.flutter,
        toolchainAvailable: !!flutter,
        installedSdk: flutter,
      },
      { id: "phaser", sdk: versions.phaser, toolchainAvailable: true },
      { id: "three", sdk: versions.three, toolchainAvailable: true },
    ],
    effects: ["fade", "slide", "pop"],
    content: ["text", "frame", "background", "image", "particles"],
    frameStyles: [
      "title",
      "box",
      "corners",
      "band",
      "tape",
      "lines",
      "underline",
      "sides",
      "bar",
    ],
    textModes: ["message", "trailer", "location"],
    trailerReveals: [
      "char",
      "solo",
      "spread",
      "line",
      "sweep",
      "all",
      "scroll",
    ],
    fontFormats: ["ttf", "otf", "woff", "woff2"],
    frameAnimations: ["draw", "fade", "none"],
    fonts: fontCatalog(),
    optionGroups,
    stylePresets,
    gradientPresets,
    imageFormats: ["png", "jpeg", "webp"],
    backgroundMotions,
    imageFilters,
    textMotions,
    holdMotions,
    particlePresets: ["snow", "sparks", "confetti"],
    particleStyles,
    particleFields,
    deferred: [],
    renderer: "actual generated code",
    validation: "per artifact",
  };
}
export class LocalProduction implements Production {
  private busy = new Set<string>();
  constructor(
    private dataRoot: string,
    private baseUrl: () => string,
  ) {}
  async create(
    project: Project,
    target: Target,
    signal: AbortSignal,
  ): Promise<Artifact> {
    signal.throwIfAborted();
    const id = randomUUID(),
      dir = join(this.dataRoot, "generated", id),
      temp = dir + ".tmp";
    const files = await generate(project, target);
    const assets = new LocalAssets(this.dataRoot);
    for (const assetId of assetIds(project.recipe))
      files[`assets/images/${assetId}.png`] = await assets.bytes(assetId);
    for (const id of fontAssetIds(project.recipe))
      files[`assets/fonts/${id}.ttf`] = await assets.bytes(id);
    try {
      await mkdir(temp, { recursive: true });
      const hashes: Record<string, string> = {};
      for (const [file, source] of Object.entries(files)) {
        signal.throwIfAborted();
        await mkdir(join(temp, file, ".."), { recursive: true });
        await writeFile(join(temp, file), source);
        hashes[file] = createHash("sha256").update(source).digest("hex");
      }
      const manifest = {
        id,
        projectId: project.id,
        revision: project.revision,
        target,
        directory: dir,
        files: Object.keys(files),
        hashes,
        generatorVersion: "0.4.0",
        sdk: versions[target],
        recipeHash: createHash("sha256")
          .update(JSON.stringify(project.recipe))
          .digest("hex"),
        validation: { status: "not_run" },
      };
      await atomicJson(join(temp, "manifest.json"), manifest);
      signal.throwIfAborted();
      await rename(temp, dir);
      return manifest;
    } catch (e) {
      await rm(temp, { recursive: true, force: true });
      throw e;
    }
  }
  private async verify(artifact: Artifact) {
    const m = JSON.parse(
      await readFile(join(artifact.directory, "manifest.json"), "utf8"),
    );
    for (const file of m.files) {
      const hash = createHash("sha256")
        .update(await readFile(join(artifact.directory, file)))
        .digest("hex");
      if (hash !== m.hashes[file])
        throw new AppError(
          "ARTIFACT_CHANGED",
          `Generated file changed: ${file}`,
        );
    }
  }
  private async compile(a: Artifact, signal: AbortSignal, full: boolean) {
    await this.verify(a);
    signal.throwIfAborted();
    const dir = a.directory;
    if (a.target === "flutter") {
      await run("flutter", ["pub", "get", "--offline"], dir, signal);
      if (full) await run("flutter", ["analyze", "--no-pub"], dir, signal);
      if (full) await run("flutter", ["test", "--no-pub"], dir, signal);
      await run(
        "flutter",
        [
          "build",
          "web",
          "--no-pub",
          "--no-web-resources-cdn",
          "--no-wasm-dry-run",
        ],
        dir,
        signal,
      );
    } else {
      try {
        await symlink(
          join(root, "node_modules"),
          join(dir, "node_modules"),
          "dir",
        );
      } catch (e: any) {
        if (e.code !== "EEXIST") throw e;
      }
      if (full)
        await run(
          process.execPath,
          [
            join(root, "node_modules/typescript/bin/tsc"),
            "--noEmit",
            "-p",
            join(dir, "tsconfig.json"),
          ],
          dir,
          signal,
        );
      await mkdir(join(dir, ".preview"), { recursive: true });
      await build({
        entryPoints: [join(dir, "src/main.ts")],
        bundle: true,
        outfile: join(dir, ".preview/app.js"),
        platform: "browser",
        logLevel: "silent",
      });
      await writeFile(
        join(dir, ".preview/index.html"),
        await readFile(join(dir, "index.html")),
      );
      await cp(join(dir, "assets"), join(dir, ".preview/assets"), {
        recursive: true,
      });
    }
    signal.throwIfAborted();
  }
  private async inspect(
    a: Artifact,
    time: number,
    signal: AbortSignal,
    full: boolean,
  ) {
    const previewUrl = `/preview/${a.id}/`;
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    const abort = () => void browser.close();
    signal.addEventListener("abort", abort, { once: true });
    try {
      const r = JSON.parse(
        await readFile(join(a.directory, "recipe.json"), "utf8"),
      );
      const page = await browser.newPage({
        viewport: { width: r.width, height: r.height },
      });
      const blocked: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("response", (response) => {
        if (response.status() >= 400)
          errors.push(`HTTP ${response.status()}: ${response.url()}`);
      });
      await page.route("**/*", (route) => {
        const url = route.request().url();
        if (new URL(url).origin === this.baseUrl()) return route.continue();
        blocked.push(url);
        return route.abort();
      });
      await page.goto(this.baseUrl() + previewUrl);
      await page.waitForFunction(
        () => !!(window as any).gametool,
        {},
        { timeout: 60000 },
      );
      if (full) {
        for (const t of [
          0,
          0.05,
          0.2,
          r.enter / 2,
          r.enter,
          r.enter + r.hold / 2,
          duration(r) - r.exit / 2,
          duration(r),
          duration(r) + 0.1,
        ]) {
          const state = await page.evaluate((t) => {
            const api = (window as any).gametool;
            api.pause();
            api.seek(t);
            return JSON.parse(api.snapshot());
          }, t);
          const expected = sceneSnapshot(r, t);
          const compare = (actual: any, expected: any, path: string) => {
            if (typeof expected === "number") {
              if (
                !Number.isFinite(actual) ||
                Math.abs(actual - expected) > 1e-5
              )
                throw new AppError(
                  "VALIDATION_FAILED",
                  `${a.target} ${path} differs at ${t}`,
                );
            } else {
              if (
                actual == null ||
                (Array.isArray(expected) && actual.length !== expected.length)
              )
                throw new AppError("VALIDATION_FAILED", path);
              for (const key of Object.keys(expected))
                compare(actual[key], expected[key], path + "." + key);
            }
          };
          compare(state, expected, "scene");
          for (const key of ["opacity", "y", "scale", "time"] as const)
            if (Math.abs(state[key] - expected[key]) > 1e-6)
              throw new AppError(
                "VALIDATION_FAILED",
                `${a.target} ${key} differs at ${t}`,
              );
        }
      }
      await page.evaluate((t) => {
        (window as any).gametool.pause();
        (window as any).gametool.seek(t);
      }, time);
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      const imagePath = join(a.directory, "preview.png");
      await page.screenshot({ path: imagePath });
      if (blocked.length)
        throw new AppError(
          "OFFLINE_VIOLATION",
          `External requests attempted: ${blocked.join(", ")}`,
        );
      if (errors.length)
        throw new AppError("VALIDATION_FAILED", errors.join("\n"));
      signal.throwIfAborted();
      return { previewUrl, imagePath };
    } finally {
      signal.removeEventListener("abort", abort);
      await browser.close();
    }
  }
  async preview(a: Artifact, time: number, signal: AbortSignal) {
    if (this.busy.has(a.id))
      throw new AppError("ARTIFACT_BUSY", "Artifact is already in use");
    this.busy.add(a.id);
    try {
      await this.compile(a, signal, false);
      return await this.inspect(a, time, signal, false);
    } finally {
      this.busy.delete(a.id);
    }
  }
  async validate(a: Artifact, signal: AbortSignal) {
    if (this.busy.has(a.id))
      throw new AppError("ARTIFACT_BUSY", "Artifact is already in use");
    this.busy.add(a.id);
    let validation: Record<string, unknown> = { status: "failed" };
    try {
      await this.compile(a, signal, true);
      const r = JSON.parse(
        await readFile(join(a.directory, "recipe.json"), "utf8"),
      );
      await this.inspect(a, r.enter, signal, true);
      validation = {
        status: "passed",
        sdk:
          a.target === "flutter"
            ? JSON.parse(
                await run("flutter", ["--version", "--machine"], root, signal),
              ).frameworkVersion
            : versions[a.target],
        platform: "Chrome / macOS",
        checks: [
          "source hashes",
          "static analysis",
          "build",
          "browser execution",
          "timeline fixtures",
          "no page errors",
          ...(a.target === "flutter" ? ["widget test"] : []),
        ],
        checkedAt: new Date().toISOString(),
      };
    } catch (e: any) {
      validation = {
        status: signal.aborted
          ? "cancelled"
          : e.code === "TOOLCHAIN_UNAVAILABLE"
            ? "unavailable"
            : "failed",
        message: e.message,
      };
      throw e;
    } finally {
      this.busy.delete(a.id);
      const m = JSON.parse(
        await readFile(join(a.directory, "manifest.json"), "utf8"),
      );
      await atomicJson(join(a.directory, "manifest.json"), {
        ...m,
        validation,
      });
    }
  }
}
