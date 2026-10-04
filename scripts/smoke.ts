import { defaultParticleOptions, particleStyles } from "../runtimes/shared/particle-options.js";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { standalone } from "./standalone.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
const root = resolve("."),
  workspace = join(root, "output", "validation", `workspace-${Date.now()}`);
const targets = process.argv.includes("--flutter-only")
  ? ["flutter"]
  : ["phaser", "three", "flutter"];
const reportFile = targets.length === 1 ? "report-flutter.json" : "report.json";
await mkdir(workspace, { recursive: true });
const service = spawn(
  process.execPath,
  [
    "--import",
    "tsx",
    "apps/local-service/main.ts",
    "--port",
    "0",
    "--workspace",
    workspace,
  ],
  { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
);
service.on("exit", (code, signal) =>
  console.error(`Service exit: code=${code}, signal=${signal}`),
);
let serverErrors = "";
service.stderr.on("data", (chunk) => (serverErrors += chunk));
let info: any;
for (let i = 0; i < 900; i++) {
  try {
    info = JSON.parse(await readFile(join(workspace, "service.json"), "utf8"));
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}
if (!info) {
  service.kill();
  throw new Error(serverErrors);
}
const client = new Client({ name: "gametool-smoke", version: "1.0.0" });
const report: any = { workspace, targets: {} };
try {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "scripts/mcp.mjs"), "--workspace", workspace],
    cwd: tmpdir(),
    stderr: "pipe",
  });
  await client.connect(transport);
  const listed = await client.listTools();
  assert.equal(listed.tools.length, 19);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result: any = await client.callTool({ name, arguments: args });
    if (result.isError) throw new Error(result.content[0].text);
    return JSON.parse(result.content[0].text);
  };
  const wait = async (id: string) => {
    for (let i = 0; i < 1200; i++) {
      const j = await call("job_get", { jobId: id });
      if (j.status === "succeeded") return j;
      if (["failed", "cancelled", "interrupted"].includes(j.status))
        throw new Error(JSON.stringify(j.error));
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error("Job timeout");
  };
  report.capabilities = await call("capabilities_get");
  let p = await call("project_create", {
    name: "Image + background + particles",
    presetId: "cutin",
  });
  const image = await sharp(
    Buffer.from(
      '<svg width="960" height="540" xmlns="http://www.w3.org/2000/svg"><rect width="960" height="540" fill="#18243c"/><path d="M0 460 L230 120 L450 400 L690 65 L960 470 V540 H0" fill="#405c85"/><circle cx="750" cy="130" r="65" fill="#f3c985"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const asset = await call("asset_import", {
    name: "mountains.png",
    dataBase64: image.toString("base64"),
  });
  const second = await call("asset_import", {
    name: "mountains-evening.png",
    dataBase64: (
      await sharp(image).modulate({ hue: 90 }).png().toBuffer()
    ).toString("base64"),
  });
  assert.equal((await call("assets_list")).length, 2);
  const font = await call("asset_import", {
    name: "Press Start 2P.ttf",
    dataBase64: (
      await readFile(
        join(
          root,
          "assets/fonts/catalog/press-start-2p/PressStart2P-Regular.ttf",
        ),
      )
    ).toString("base64"),
  });
  assert.equal(font.kind, "font");
  p = await call("project_update", {
    projectId: p.id,
    expectedRevision: p.revision,
    recipe: {
      ...p.recipe,
      text:
        targets.length === 1 ? 'CHAPTER 01\n새로운 여정 "$100"' : "전투 개시",
      loop: false,
      layout: {
        ...p.recipe.layout,
        font: "shippori-mincho-b1",
        subFont: font.id,
        weight: 800,
        subWeight: 400,
      },
      background: {
        ...p.recipe.background,
        assetId: asset.id,
        enabled: true,
        assetIds: [asset.id, second.id],
        filter: "evening",
        motion: "crossfade",
        amount: 0.2,
        fade: true,
      },
      image: {
        ...p.recipe.image,
        enabled: true,
        assetId: asset.id,
        scale: 0.2,
        x: 280,
        y: 130,
        rotation: 12,
        opacity: 0.8,
      },
      particles: {
        ...p.recipe.particles,
        ...defaultParticleOptions,
        ...particleStyles.find(s => s.id === "fireworks")!.settings,
        advanced: true,
        enabled: true,
        preset: "confetti",
        emission: "burst",
        seed: 2026,
        count: 40,
        size: 8,
        speed: 250,
        gravity: 150,
      },
    },
  });
  const conflict: any = await client.callTool({
    name: "project_update",
    arguments: { projectId: p.id, expectedRevision: 1, recipe: p.recipe },
  });
  assert.equal(conflict.isError, true);
  for (const target of targets) {
    console.log(`Generate and validate ${target}...`);
    const generated = await wait(
      (
        await call("code_generate", {
          projectId: p.id,
          expectedRevision: p.revision,
          target,
        })
      ).jobId,
    );
    await wait(
      (await call("code_validate", { artifactId: generated.artifactId })).jobId,
    );
    const artifact = await call("artifact_get", {
      artifactId: generated.artifactId,
    });
    assert.equal(artifact.validation.status, "passed");
    report.targets[target] = artifact;
    console.log(`${target}: ${artifact.validation.status}`);
  }
  assert.equal(
    (await fetch(info.url + "/api/command", { method: "POST", body: "{}" }))
      .status,
    403,
  );
  assert.equal(
    (
      await fetch(info.url + "/api/session", {
        headers: { Origin: "https://untrusted.example" },
      })
    ).status,
    403,
  );
  const download = await fetch(
    info.url + "/api/download/" + report.targets[targets[0]].id,
    { headers: { Authorization: `Bearer ${info.token}` } },
  );
  assert.equal(download.status, 200);
  assert.ok((await download.arrayBuffer()).byteLength > 1000);
  report.features =
    "image import, background crossfade/filter, image transform, advanced burst particles with lifetime color/size, glow and trails, glyph typography, animated frame";
  report.mcp = "initialize/list/call passed";
  report.http = "authentication/origin/download passed";
  await writeFile(
    join(root, "output/validation", reportFile),
    JSON.stringify(report, null, 2),
  );
  console.log(
    "PASS: MCP, revision conflict, all target builds/execution, local API boundaries.",
  );
} catch (error) {
  console.error(serverErrors);
  throw error;
} finally {
  await client.close();
  await new Promise<void>((r) => {
    if (service.exitCode !== null || service.signalCode !== null) {
      r();
      return;
    }
    service.once("exit", () => r());
    service.kill("SIGTERM");
  });
}
await standalone(report);
await writeFile(
  join(root, "output/validation", reportFile),
  JSON.stringify(report, null, 2),
);
console.log(
  "PASS: all generated examples run independently with GameTool stopped.",
);
