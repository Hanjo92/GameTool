import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import type { Artifact } from "../../packages/core/application.js";
import { AppError } from "../../packages/core/model.js";
import type {
  IntegrationFile,
  IntegrationPlan,
  IntegrationPort,
  IntegrationResult,
} from "../../packages/core/studio-workflows.js";

const stateFile = ".gametool-ownership.json";
const digest = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const fail = (code: string, message: string): never => {
  throw new AppError(code, message);
};
const safeRelative = (path: string) => {
  if (
    !path ||
    path.length > 240 ||
    path.includes("\\") ||
    path.includes("\0") ||
    path.split("/").some((p) => !p || p === "." || p === "..") ||
    path.startsWith("/")
  )
    fail("INVALID_PATH", `Unsafe relative file path: ${path}`);
};
interface Ownership {
  version: 1;
  projectId: string;
  target: string;
  files: Record<string, string>;
}
interface StoredPlan {
  public: IntegrationPlan;
  artifact: Artifact;
  root: string;
  destination: string;
  original: Record<string, string>;
  sources: Map<string, Buffer>;
  ownership: Ownership;
}
/** Roots are constructor-only CLI configuration. Callers cannot supply paths through plan/apply. */
export class LocalIntegration implements IntegrationPort {
  private plans = new Map<string, StoredPlan>();
  private configured: Promise<
    { id: string; name: string; path: string; identity: string }[]
  >;
  constructor(allowedRoots: string[]) {
    this.configured = Promise.all(
      allowedRoots.map(async (path) => {
        const absolute = resolve(path);
        if ((await lstat(absolute)).isSymbolicLink())
          fail("INVALID_ROOT", "Integration roots cannot be symbolic links");
        const canonical = await realpath(absolute);
        const info = await lstat(canonical);
        if (!info.isDirectory())
          fail(
            "INVALID_ROOT",
            "Integration root must be an existing directory",
          );
        return {
          id: digest(canonical).slice(0, 24),
          name: basename(canonical),
          path: canonical,
          identity: `${info.dev}:${info.ino}`,
        };
      }),
    );
  }
  async roots() {
    return (await this.configured).map(({ id, name }) => ({ id, name }));
  }
  /** Reject symlink directories, including a swapped root or any intermediate segment. */
  private async contained(root: string, path: string) {
    if (path !== root && !path.startsWith(root + sep))
      fail("INVALID_PATH", "Path escapes configured root");
    const configured = (await this.configured).find((r) => r.path === root);
    const relative =
      path === root ? [] : path.slice(root.length + 1).split(sep);
    let current = root;
    for (const segment of ["", ...relative]) {
      if (segment) current = join(current, segment);
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink() || !info.isDirectory())
          fail(
            "INTEGRATION_CONFLICT",
            "Integration directories must not contain symlinks or files",
          );
        if (
          current === root &&
          configured &&
          `${info.dev}:${info.ino}` !== configured.identity
        )
          fail(
            "INTEGRATION_CONFLICT",
            "Configured root directory was replaced",
          );
        if ((await realpath(current)) !== current)
          fail(
            "INTEGRATION_CONFLICT",
            "Integration directory identity changed",
          );
      } catch (e: any) {
        if (e.code === "ENOENT" && current !== root) return;
        throw e;
      }
    }
  }
  private async bytes(path: string) {
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.nlink > 1)
        fail(
          "INTEGRATION_CONFLICT",
          "Only regular, unlinked files are allowed",
        );
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  }
  private async tree(directory: string): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    let entries = 0;
    const walk = async (dir: string, prefix: string) => {
      for (const entry of (await readdir(dir, { withFileTypes: true })).sort(
        (a, b) => a.name.localeCompare(b.name),
      )) {
        if (++entries > 10000)
          fail("LIMIT_EXCEEDED", "Integration subtree is too large");
        const relative = prefix + entry.name;
        safeRelative(relative);
        if (entry.isDirectory())
          await walk(join(dir, entry.name), relative + "/");
        else if (entry.isFile())
          files[relative] = digest(await this.bytes(join(dir, entry.name)));
        else
          fail(
            "INTEGRATION_CONFLICT",
            "Integration tree contains a symlink or special file",
          );
      }
    };
    try {
      await walk(directory, "");
    } catch (e: any) {
      if (e.code !== "ENOENT") throw e;
    }
    return files;
  }
  private async sources(artifact: Artifact) {
    const directory = await realpath(artifact.directory);
    const manifest = JSON.parse(
      (await this.bytes(join(directory, "manifest.json"))).toString(),
    );
    if (
      manifest.id !== artifact.id ||
      manifest.projectId !== artifact.projectId ||
      manifest.revision !== artifact.revision ||
      manifest.target !== artifact.target ||
      JSON.stringify(manifest.files) !== JSON.stringify(artifact.files)
    )
      fail("ARTIFACT_CHANGED", "Artifact identity does not match its manifest");
    const sources = new Map<string, Buffer>();
    for (const file of artifact.files) {
      safeRelative(file);
      if (file === stateFile || file === "INTEGRATION.md")
        fail("INVALID_PATH", "Artifact uses a reserved integration file");
      await this.contained(directory, dirname(join(directory, file)));
      const data = await this.bytes(join(directory, file));
      if (digest(data) !== manifest.hashes?.[file])
        fail("ARTIFACT_CHANGED", `Artifact changed: ${file}`);
      sources.set(file, data);
    }
    sources.set("INTEGRATION.md", Buffer.from(this.instructions(artifact)));
    return sources;
  }
  private instructions(a: Artifact) {
    const common = `# Host integration: ${a.target}\n\nThis directory is managed by GameTool for effect project ${a.projectId}, revision ${a.revision}. Host package manifests and files outside this directory are never changed. Keep custom host glue outside this directory. Regeneration refuses modified generated files. The generated README.md and ${a.target === "flutter" ? "lib/main.dart" : "src/main.ts"} are executable usage examples.\n\n`;
    if (a.target === "flutter")
      return (
        common +
        `Use this directory as a local Flutter package: add a path dependency named gametool_effect in your host pubspec.yaml, pointing here. Its generated pubspec.yaml records the SDK, assets and fonts. Import package:gametool_effect/effect.dart and package:gametool_effect/recipe.dart. For direct source embedding, copy lib except main.dart, register the generated assets/font declarations, and preserve asset keys used by loadSceneImages. For a local package, call loadSceneImages(recipe, assetPrefix: 'packages/gametool_effect/assets/images/') and register its font families in your host. A host can have only one dependency with that package name; embed generated lib files in separate host lib subdirectories for multiple effect packages. See lib/main.dart for image loading, EffectController, TextEffect and disposal. Optional Flame adapter is generated only if supported by this artifact. Run flutter pub get in the host after reviewing the dependency change.\n`
      );
    return (
      common +
      `Import SceneEffect from this directory's src/scene.ts and recipe from src/recipe.ts. Install the ${a.target} version declared in this directory's package.json in your host. Keep the host package.json unchanged until its owner reviews that dependency. Mount this directory's assets/ under a host URL and call loadImages(recipe, '/your-effect-assets/images/') or supply a preloaded image map. Register the generated font declarations from index.html with that asset prefix. Namespaced image IDs avoid image filename collisions; inspect existing font mappings before copying. ${a.target === "phaser" ? "Construct new SceneEffect(scene, recipe, images); the effect subscribes to Scene update and must be disposed on removal." : "Construct new SceneEffect(recipe, images), add effect.object to the scene, and call update(deltaSeconds) once per host frame; dispose on removal."} Keep host event/data-binding glue outside this managed directory.\n`
    );
  }
  private async dependencyWarnings(
    root: string,
    artifact: Artifact,
    sources: Map<string, Buffer>,
  ): Promise<string[]> {
    if (artifact.target === "flutter")
      return [
        "Flutter integration requires reviewing the generated pubspec.yaml assets/fonts and adding a local path dependency or embedding lib sources. Host pubspec.yaml is never rewritten.",
      ];
    let expected: string | undefined;
    try {
      expected = JSON.parse(sources.get("package.json")?.toString() ?? "{}")
        .dependencies?.[artifact.target];
    } catch {}
    if (!expected)
      return [
        "Generated package has no target dependency declaration; inspect package.json before connecting the host.",
      ];
    try {
      const manifest = JSON.parse(
        (await this.bytes(join(root, "package.json"))).toString(),
      );
      const installed =
        manifest.dependencies?.[artifact.target] ??
        manifest.devDependencies?.[artifact.target];
      return installed === expected
        ? []
        : [
            installed
              ? `Host declares ${artifact.target} ${installed}; artifact declares ${expected}. Compatibility needs host review.`
              : `Host has no ${artifact.target} dependency. Artifact requires ${expected}; review and add it in the host.`,
          ];
    } catch (e: any) {
      return [
        e.code === "ENOENT"
          ? `No host package.json found; artifact requires ${artifact.target} ${expected}.`
          : "Host package.json could not be safely inspected; review dependencies manually.",
      ];
    }
  }
  async plan(
    artifact: Artifact,
    rootId: string,
    effectId: string,
  ): Promise<IntegrationPlan> {
    if (!["flutter", "phaser", "three"].includes(artifact.target))
      fail("INVALID_TARGET", "Unknown artifact target");
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(effectId))
      fail(
        "INVALID_PATH",
        "Effect ID must use 1–64 lowercase letters, digits, hyphens or underscores",
      );
    const root = (await this.configured).find((r) => r.id === rootId);
    if (!root)
      fail(
        "ACCESS_DENIED",
        "Root was not explicitly configured with --integration-root",
      );
    const destination = join(
      root!.path,
      "gametool-effects",
      effectId,
      artifact.target,
    );
    await this.contained(root!.path, destination);
    const original = await this.tree(destination);
    let previous: Ownership | undefined;
    if (original[stateFile]) {
      previous = JSON.parse(
        (await this.bytes(join(destination, stateFile))).toString(),
      );
      if (
        previous?.version !== 1 ||
        previous.projectId !== artifact.projectId ||
        previous.target !== artifact.target ||
        !previous.files ||
        typeof previous.files !== "object"
      )
        fail(
          "INTEGRATION_CONFLICT",
          "Destination belongs to another project or has invalid ownership",
        );
      for (const [file, hash] of Object.entries(previous!.files)) {
        safeRelative(file);
        if (original[file] !== hash)
          fail(
            "INTEGRATION_CONFLICT",
            `Generated file was edited or removed: ${file}`,
          );
      }
    }
    const sources = await this.sources(artifact);
    const owned = Object.fromEntries(
      [...sources].map(([file, data]) => [file, digest(data)]),
    );
    const files: IntegrationFile[] = [];
    for (const [file, data] of sources) {
      if (original[file] && !previous?.files[file])
        fail(
          "INTEGRATION_CONFLICT",
          `Unowned destination file exists: ${file}`,
        );
      files.push({
        path: `gametool-effects/${effectId}/${artifact.target}/${file}`,
        action: !original[file]
          ? "create"
          : original[file] === owned[file]
            ? "unchanged"
            : "update",
        bytes: data.length,
      });
    }
    for (const file of Object.keys(previous?.files ?? {}))
      if (!sources.has(file))
        files.push({
          path: `gametool-effects/${effectId}/${artifact.target}/${file}`,
          action: "delete",
          bytes: 0,
        });
    const ownership: Ownership = {
      version: 1,
      projectId: artifact.projectId,
      target: artifact.target,
      files: owned,
    };
    const planId = randomUUID();
    const expectedHash = digest(
      JSON.stringify({
        rootId,
        effectId,
        artifactId: artifact.id,
        original,
        ownership,
      }),
    );
    const publicPlan: IntegrationPlan = {
      planId,
      expectedHash,
      rootId,
      effectId,
      target: artifact.target,
      files,
      warnings: [
        "Review INTEGRATION.md and generated dependency declarations before connecting the host. Host dependency manifests are not modified.",
        ...(await this.dependencyWarnings(root!.path, artifact, sources)),
      ],
    };
    if (this.plans.size >= 100)
      this.plans.delete(this.plans.keys().next().value!);
    this.plans.set(planId, {
      public: publicPlan,
      artifact,
      root: root!.path,
      destination,
      original,
      sources,
      ownership,
    });
    return structuredClone(publicPlan);
  }
  async apply(
    planId: string,
    expectedHash: string,
  ): Promise<IntegrationResult> {
    const p = this.plans.get(planId);
    if (!p || p.public.expectedHash !== expectedHash)
      fail(
        "PLAN_CONFLICT",
        "Unknown, expired, already applied, or mismatched plan",
      );
    const plan = p!;
    const parent = dirname(plan.destination);
    await this.contained(plan.root, parent);
    await mkdir(parent, { recursive: true });
    await this.contained(plan.root, parent);
    const lock = join(parent, ".gametool-integration.lock");
    let lockHandle;
    try {
      lockHandle = await open(lock, "wx", 0o600);
    } catch (e: any) {
      if (e.code === "EEXIST")
        fail(
          "INTEGRATION_BUSY",
          "Another integration is running; inspect a stale lock before removing it",
        );
      throw e;
    }
    const staging = join(parent, `.gametool-stage-${randomUUID()}`),
      backup = join(parent, `.gametool-backup-${randomUUID()}`);
    let moved = false,
      installed = false;
    try {
      const unchanged = async () => {
        await this.contained(plan.root, plan.destination);
        if (
          JSON.stringify(await this.tree(plan.destination)) !==
          JSON.stringify(plan.original)
        )
          fail(
            "PLAN_CONFLICT",
            "Destination changed since planning; make a new plan",
          );
      };
      await unchanged();
      const current = await this.sources(plan.artifact);
      if (
        JSON.stringify([...current].map(([f, d]) => [f, digest(d)])) !==
        JSON.stringify([...plan.sources].map(([f, d]) => [f, digest(d)]))
      )
        fail("ARTIFACT_CHANGED", "Artifact changed since planning");
      await mkdir(staging, { mode: 0o700 });
      // Copy only verified ordinary files, retaining unrelated host additions.
      for (const [file, hash] of Object.entries(plan.original)) {
        if (file === stateFile || Object.hasOwn(plan.ownership.files, file))
          continue;
        const oldOwnership = plan.original[stateFile]
          ? (JSON.parse(
              (await this.bytes(join(plan.destination, stateFile))).toString(),
            ) as Ownership)
          : undefined;
        if (oldOwnership?.files[file]) continue; // removed generated file
        const data = await this.bytes(join(plan.destination, file));
        if (digest(data) !== hash)
          fail("PLAN_CONFLICT", "Unrelated file changed during integration");
        await mkdir(dirname(join(staging, file)), { recursive: true });
        await writeFile(join(staging, file), data, { flag: "wx" });
      }
      for (const [file, data] of current) {
        await mkdir(dirname(join(staging, file)), { recursive: true });
        await writeFile(join(staging, file), data, { flag: "wx" });
      }
      await writeFile(
        join(staging, stateFile),
        JSON.stringify(plan.ownership, null, 2),
        { flag: "wx", mode: 0o600 },
      );
      await unchanged();
      try {
        await rename(plan.destination, backup);
        moved = true;
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
      await this.contained(plan.root, parent);
      await rename(staging, plan.destination);
      installed = true;
      this.plans.delete(planId);
      if (moved) await rm(backup, { recursive: true, force: true });
      return {
        applied: true,
        planId,
        rootId: plan.public.rootId,
        effectId: plan.public.effectId,
        target: plan.public.target,
        files: plan.public.files,
      };
    } catch (error) {
      if (moved && !installed) await rename(backup, plan.destination);
      throw error;
    } finally {
      await rm(staging, { recursive: true, force: true });
      await lockHandle!.close();
      await rm(lock, { force: true });
    }
  }
}
