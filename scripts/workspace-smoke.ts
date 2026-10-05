import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// An isolated workspace exercises the real stdio adapter and local file store.
const root = resolve("."), workspace = join(root, "output/validation", `reuse-${Date.now()}`);
await mkdir(workspace, { recursive: true });
const client = new Client({ name: "gametool-reuse-smoke", version: "1.0.0" });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [join(root, "scripts/mcp.mjs"), "--workspace", workspace], stderr: "pipe" }));
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 27);
  assert.equal(listed.tools.find(t => t.name === "project_history")?.annotations?.readOnlyHint, true);
  assert.equal(listed.tools.find(t => t.name === "preset_delete")?.annotations?.destructiveHint, true);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result: any = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, JSON.stringify(result.content));
    return JSON.parse(result.content[0].text);
  };
  let p = await call("project_create", { name: "MCP 재사용 검증", presetId: "ref-message-battle" });
  const original = structuredClone(p);
  p = await call("project_update", { projectId: p.id, expectedRevision: p.revision, recipe: { ...p.recipe, text: "MCP 저장 이력" } });
  const h = await call("project_history", { projectId: p.id });
  assert.equal(h.entries.length, 1);
  p = await call("project_restore", { projectId: p.id, expectedRevision: p.revision, revision: 1 });
  assert.equal(p.revision, 3);
  assert.deepEqual(p.recipe, original.recipe);
  const ref = { projectId: p.id, expectedRevision: p.revision };
  const copy = await call("project_duplicate", { ...ref, name: "독립 사본" });
  const preset = await call("preset_save", { ...ref, name: "내 전투 스타일" });
  const fresh = await call("project_create", { name: "프리셋 재사용", presetId: preset.id });
  assert.deepEqual(copy.recipe, fresh.recipe);
  assert.equal((await call("presets_list")).length, 94);
  const stale: any = await client.callTool({ name: "project_restore", arguments: { ...ref, expectedRevision: 1, revision: 2 } });
  assert.equal(stale.isError, true);
  assert.equal(JSON.parse(stale.content[0].text).code, "REVISION_CONFLICT");
  await call("preset_delete", { presetId: preset.id });
  assert.equal((await call("presets_list")).length, 93);
  assert.deepEqual(await call("project_get", { projectId: fresh.id }), fresh);
  const artifacts = [];
  for (const target of ["flutter", "phaser", "three"]) {
    const { jobId } = await call("code_generate", { projectId: fresh.id, expectedRevision: fresh.revision, target });
    let job;
    for (let attempt = 0; attempt < 120; attempt++) {
      job = await call("job_get", { jobId });
      if (["succeeded", "failed", "cancelled"].includes(job.status)) break;
      await new Promise(r => setTimeout(r, 250));
    }
    assert.equal(job.status, "succeeded", JSON.stringify(job.error));
    const source = await call("artifact_get", { artifactId: job.artifactId, file: "recipe.json" });
    assert.deepEqual(JSON.parse(source.source), original.recipe);
    artifacts.push({ target, artifactId: job.artifactId, generation: "passed" });
  }
  const report = { status: "passed", toolCount: listed.tools.length, workspace, projectId: p.id,
    checks: ["restore", "duplicate", "user preset save/create/delete", "stale revision", "all-target recipe generation"], artifacts };
  await writeFile(join(root, "output/validation/workspace-check.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
  try {
    const service = JSON.parse(await readFile(join(workspace, "service.json"), "utf8"));
    process.kill(service.pid, "SIGTERM");
  } catch {}
}
