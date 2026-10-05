/** Real stdio MCP acceptance against an isolated local service and disposable host root. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = resolve(".");
const workspace = join(root, "output/validation", `studio-mcp-${Date.now()}`);
const host = join(workspace, "host");
await mkdir(host, { recursive: true });
const hostManifest =
  '{"name":"untouched-studio-mcp-host","dependencies":{"phaser":"3.90.0"}}';
await writeFile(join(host, "package.json"), hostManifest);
await writeFile(
  join(host, "host-game.ts"),
  "// host code must remain unchanged\n",
);
const service = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    join(root, "apps/local-service/main.ts"),
    "--workspace",
    workspace,
    "--port",
    "0",
    "--integration-root",
    host,
  ],
  { cwd: root, stdio: ["ignore", "ignore", "pipe"] },
);
let serviceErrors = "";
service.stderr.on("data", (data) => {
  serviceErrors = (serviceErrors + String(data)).slice(-12000);
});
const exited = new Promise<void>((resolve) =>
  service.once("exit", () => resolve()),
);
const client = new Client({
  name: "gametool-studio-mcp-smoke",
  version: "0.5.0",
});
const report: Record<string, unknown> = {
  workspace,
  status: "running",
  checks: [],
};
const checks = report.checks as string[];
const passed = (name: string) => {
  checks.push(name);
  console.log(`[MCP] ${name}`);
};
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
try {
  let ready = false;
  for (let i = 0; i < 600; i++) {
    try {
      await readFile(join(workspace, "service.json"), "utf8");
      ready = true;
      break;
    } catch {}
    if (service.exitCode !== null)
      throw Error(`Local service exited: ${serviceErrors}`);
    await delay(100);
  }
  assert.ok(ready, `Service startup timed out: ${serviceErrors}`);
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [join(root, "scripts/mcp.mjs"), "--workspace", workspace],
      cwd: tmpdir(),
      stderr: "pipe",
    }),
  );
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 27);
  assert.equal(
    tools.find((tool) => tool.name === "integration_apply")?.annotations
      ?.destructiveHint,
    true,
  );
  assert.equal(
    tools.find((tool) => tool.name === "recipe_diff")?.annotations
      ?.readOnlyHint,
    true,
  );
  report.toolCount = tools.length;
  const call = async (name: string, input: Record<string, unknown> = {}) => {
    const result: any = await client.callTool({ name, arguments: input });
    assert.ok(!result.isError, `${name}: ${JSON.stringify(result.content)}`);
    return JSON.parse(result.content[0].text);
  };
  const error = async (
    name: string,
    input: Record<string, unknown>,
    expected?: string,
  ) => {
    const result: any = await client.callTool({ name, arguments: input });
    assert.equal(result.isError, true, `${name} should reject this request`);
    const detail = JSON.parse(result.content[0].text);
    if (expected) assert.equal(detail.code, expected);
    return detail.code;
  };
  const wait = async (jobId: string) => {
    for (let i = 0; i < 1200; i++) {
      const job = await call("job_get", { jobId });
      if (job.status === "succeeded") return job;
      if (["failed", "cancelled", "interrupted"].includes(job.status))
        throw Error(`Job ${jobId}: ${JSON.stringify(job.error)}`);
      await delay(250);
    }
    throw Error(`Job ${jobId} timed out`);
  };
  const presets = await call("presets_list");
  assert.ok(presets.some((preset: any) => preset.id === "studio-hud"));
  const project = await call("project_create", {
    name: "Studio MCP acceptance",
    presetId: "studio-hud",
  });
  const ref = { projectId: project.id, expectedRevision: project.revision };
  assert.ok(
    project.recipe.studio.nodes.some(
      (node: any) => node.widget?.kind === "health-bar",
    ),
  );
  const variants = [
    { name: "HP 40", patch: { studio: { data: { hp: 40 } } } },
    { name: "HP 10", patch: { studio: { data: { hp: 10 } } } },
  ];
  const drafts = await call("studio_variants", { ...ref, variants });
  assert.equal(drafts.saved, false);
  assert.equal(drafts.variants[0].recipe.studio.data.hp, 40);
  assert.equal((await call("projects_list")).length, 1);
  passed("studio preset and variant draft without persistence");
  await error("studio_variants", {
    ...ref,
    save: true,
    variants: [variants[0], { name: "invalid", patch: { width: -1 } }],
  });
  assert.equal((await call("projects_list")).length, 1);
  await error(
    "studio_variants",
    { ...ref, expectedRevision: project.revision + 1, save: true, variants },
    "REVISION_CONFLICT",
  );
  assert.equal((await call("projects_list")).length, 1);
  passed("invalid and stale batches leave no partial projects");
  const saved = await call("studio_variants", { ...ref, save: true, variants });
  assert.equal(saved.saved, true);
  assert.equal(saved.projects.length, 2);
  assert.equal((await call("projects_list")).length, 3);
  assert.deepEqual(
    await call("project_get", { projectId: project.id }),
    project,
  );
  passed("valid batch saved atomically and source preserved");
  const difference = await call("recipe_diff", {
    ...ref,
    recipe: drafts.variants[0].recipe,
  });
  assert.ok(
    difference.changes.some(
      (change: any) =>
        change.path === "/studio/data/hp" &&
        change.before === 75 &&
        change.after === 40,
    ),
  );
  const compared = await call("studio_compare", {
    ...ref,
    variants: [variants[0]],
    times: [0, 0.5, 1],
  });
  assert.equal(compared.kind, "numerical-samples");
  assert.equal(compared.samples.length, 2);
  assert.equal(
    compared.samples[0].samples[1].state.studio.find(
      (node: any) => node.id === "hp",
    ).value,
    75,
  );
  assert.equal(
    compared.samples[1].samples[1].state.studio.find(
      (node: any) => node.id === "hp",
    ).value,
    40,
  );
  passed("recipe diff and deterministic numerical comparisons");
  const comparison = await wait(
    (
      await call("studio_comparison_start", {
        ...ref,
        variants: [variants[0]],
        target: "phaser",
        timeSeconds: 0.5,
      })
    ).jobId,
  );
  assert.equal(comparison.comparisons.length, 2);
  const images = await Promise.all(
    comparison.comparisons.map(async (item: any) => {
      const image = await readFile(item.imagePath);
      assert.deepEqual(
        [...image.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10],
      );
      assert.ok(image.length > 1000);
      return createHash("sha256").update(image).digest("hex");
    }),
  );
  assert.notEqual(
    images[0],
    images[1],
    "HP variation must change actual runtime pixels",
  );
  assert.equal(
    (await call("projects_list")).length,
    3,
    "Comparison drafts must not create projects",
  );
  report.comparisons = comparison.comparisons.map(
    (item: any, index: number) => ({ ...item, imageHash: images[index] }),
  );
  passed("actual Phaser base and variant previews render different PNGs");
  // Generate from a saved project so future regeneration retains stable project ownership.
  const generated = await wait(
    (await call("code_generate", { ...ref, target: "phaser" })).jobId,
  );
  const artifact = await call("artifact_get", {
    artifactId: generated.artifactId,
  });
  const { roots } = await call("integration_roots");
  assert.equal(roots.length, 1);
  const plan = await call("integration_plan", {
    artifactId: artifact.id,
    rootId: roots[0].id,
    effectId: "mcp-hud",
  });
  assert.ok(
    plan.files.some((file: any) => file.path.endsWith("/src/studio.ts")),
  );
  await assert.rejects(
    readFile(join(host, "gametool-effects/mcp-hud/phaser/src/effect.ts")),
  );
  const integrated = await call("integration_apply", {
    planId: plan.planId,
    expectedHash: plan.expectedHash,
  });
  assert.equal(integrated.applied, true);
  assert.equal(
    await readFile(join(host, "package.json"), "utf8"),
    hostManifest,
  );
  assert.equal(
    await readFile(join(host, "host-game.ts"), "utf8"),
    "// host code must remain unchanged\n",
  );
  const generatedSource = await call("artifact_get", {
    artifactId: artifact.id,
    file: "src/effect.ts",
  });
  assert.equal(
    await readFile(
      join(host, "gametool-effects/mcp-hud/phaser/src/effect.ts"),
      "utf8",
    ),
    generatedSource.source,
  );
  report.integration = {
    rootId: roots[0].id,
    files: plan.files.length,
    applied: true,
  };
  passed("configured-root plan/apply preserves host code and package manifest");
  const profiled = await wait(
    (await call("performance_start", { artifactId: artifact.id, frames: 30 }))
      .jobId,
  );
  assert.equal(profiled.profileReport.measurement.frames, 30);
  assert.ok(profiled.profileReport.measurement.frameIntervalMs.mean > 0);
  assert.equal(
    profiled.profileReport.runtime.instances,
    project.recipe.studio.quality.instances,
  );
  report.profile = profiled.profileReport;
  passed(
    "real Chromium performance job with measured timing and separate analytic estimates",
  );
  report.status = "passed";
  report.projectId = project.id;
  await writeFile(
    join(root, "output/validation/studio-mcp-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      status: report.status,
      tools: tools.length,
      checks: checks.length,
      report: "output/validation/studio-mcp-report.json",
    }),
  );
} finally {
  try {
    await client.close();
  } finally {
    service.kill("SIGTERM");
    const timeout = setTimeout(() => service.kill("SIGKILL"), 10000);
    timeout.unref();
    await exited;
    clearTimeout(timeout);
  }
}
