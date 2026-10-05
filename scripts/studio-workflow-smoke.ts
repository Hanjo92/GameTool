/** Standalone local-only workflow acceptance. Does not write to any user game project. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { LocalIntegration } from "../apps/local-service/integration.js";
import { LocalProduction } from "../apps/local-service/production.js";
import { measurePreview } from "../apps/local-service/profiling.js";
import {
  defaultRecipe,
  recipeSchema,
  type Project,
  type Target,
} from "../packages/core/model.js";
import {
  createStudioNode,
  defaultStudio,
} from "../runtimes/shared/studio-types.js";
import {
  comparisonSamples,
  normalizeVariants,
  recipeDiff,
} from "../packages/core/studio-workflows.js";
import { sceneSnapshot } from "../runtimes/shared/motion.js";

const workspace = resolve(
  "output/validation",
  `studio-workflows-${Date.now()}`,
);
const host = join(workspace, "host");
await mkdir(host, { recursive: true });
await writeFile(join(host, "package.json"), '{"name":"untouched-host"}');
const node = createStudioNode("ui", "hp", "health-bar");
const recipe = recipeSchema.parse({
  ...defaultRecipe,
  studio: {
    ...structuredClone(defaultStudio),
    nodes: [node],
    quality: { ...defaultStudio.quality, instances: 3 },
  },
});
const project: Project = {
  id: randomUUID(),
  revision: 1,
  name: "Studio workflow smoke",
  updatedAt: new Date().toISOString(),
  recipe,
};
const variants = normalizeVariants(
  recipe,
  [
    { name: "red", patch: { color: "#ff5050" } },
    { name: "blue", patch: { color: "#5050ff" } },
  ],
  (value) => recipeSchema.parse(value),
);
assert.equal(variants.length, 2);
assert.ok(recipeDiff(recipe, variants[0].recipe).length);
assert.equal(comparisonSamples(variants, [0, 0.5, 1], sceneSnapshot).length, 2);
const artifacts = new Map<string, { directory: string; target: Target }>();
const types: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
};
const server = createServer(async (request, response) => {
  try {
    if (request.url === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }
    const match = new URL(request.url!, "http://localhost").pathname.match(
      /^\/preview\/([^/]+)\/(.*)$/,
    );
    if (!match || !artifacts.has(match[1])) throw Error("Unknown preview");
    const a = artifacts.get(match[1])!;
    const base = join(
      a.directory,
      a.target === "flutter" ? "build/web" : ".preview",
    );
    const path = resolve(base, decodeURIComponent(match[2] || "index.html"));
    if (!path.startsWith(base + "/")) throw Error("Invalid path");
    response.writeHead(200, {
      "Content-Type": types[extname(path)] ?? "application/octet-stream",
    });
    response.end(await readFile(path));
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const production = new LocalProduction(workspace, () => url);
const integration = new LocalIntegration([host]);
const rootId = (await integration.roots())[0].id;
const signal = new AbortController().signal;
const report: Record<string, unknown> = {
  workspace,
  variants: variants.length,
  integrations: {},
};
try {
  for (const target of ["flutter", "phaser", "three"] as const) {
    const artifact = await production.create(project, target, signal);
    artifacts.set(artifact.id, artifact);
    const plan = await integration.plan(artifact, rootId, "health-bar");
    const applied = await integration.apply(plan.planId, plan.expectedHash);
    assert.ok(applied.files.length > 10);
    if (target === "flutter")
      assert.ok(
        applied.files.some((file) =>
          file.path.endsWith("adapters/flame/lib/gametool_flame.dart"),
        ),
      );
    (report.integrations as Record<string, unknown>)[target] = {
      files: applied.files.length,
      applied: applied.applied,
    };
    if (target === "three") {
      await production.preview(artifact, 0.5, signal);
      report.profile = await measurePreview({
        url: `${url}/preview/${artifact.id}/`,
        recipe,
        frames: 60,
        signal,
      });
      const p = report.profile as Awaited<ReturnType<typeof measurePreview>>;
      assert.equal(p.measurement.frames, 60);
      assert.ok(p.measurement.frameIntervalMs.mean > 0);
      assert.equal(p.estimates.requestedInstances, 3);
      assert.equal(
        p.estimates.viewportTextureBytes,
        recipe.width * recipe.height * 4,
      );
      assert.equal((p.runtime as { instances: number }).instances, 3);
    }
  }
  assert.equal(
    await readFile(join(host, "package.json"), "utf8"),
    '{"name":"untouched-host"}',
  );
  await writeFile(
    resolve("output/validation/studio-workflows-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      ok: true,
      report: "output/validation/studio-workflows-report.json",
    }),
  );
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
