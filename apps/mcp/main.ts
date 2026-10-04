import { readFile, open } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { inputs } from "../../packages/core/application.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
const i = process.argv.indexOf("--workspace");
const workspace = resolve(
  i >= 0 ? process.argv[i + 1] : join(root, ".gametool"),
);
interface Service {
  url: string;
  token: string;
  pid: number;
}
async function discover(): Promise<Service | undefined> {
  try {
    const s = JSON.parse(
      await readFile(join(workspace, "service.json"), "utf8"),
    );
    if (new URL(s.url).hostname !== "127.0.0.1") return;
    const r = await fetch(s.url + "/health", {
      signal: AbortSignal.timeout(1000),
    });
    if (r.ok) return s;
  } catch {}
}
let service = await discover();
if (!service) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      join(root, "apps/local-service/main.ts"),
      "--workspace",
      workspace,
      "--port",
      "0",
    ],
    { cwd: root, detached: true, stdio: "ignore" },
  );
  child.unref();
  for (let n = 0; n < 600 && !service; n++) {
    await new Promise((r) => setTimeout(r, 100));
    service = await discover();
  }
}
if (!service)
  throw new Error(
    "Cannot start local service. Run npm run build and npm start first.",
  );
const server = new McpServer({ name: "gametool", version: "0.4.0" });
const descriptions: Record<string, string> = {
  assets_list: "List imported local image and font assets and IDs.",
  asset_import:
    "Import PNG/JPEG/WebP images (8 MiB, 16 MP) or TTF/OTF/WOFF/WOFF2 fonts (32 MiB) as base64. Preserves original; returns asset ID for background/image layers or layout.font/layout.subFont. Never reads arbitrary paths.",
  capabilities_get: "Report implemented effects and local SDK availability.",
  presets_list: "List text, background and particle presets.",
  preset_save: "Save an immutable user preset from an exact project revision, including asset references. Local workspace only.",
  preset_delete: "Delete a user preset by UUID. Does not change projects, built-in presets or assets.",
  projects_list: "List saved local projects.",
  project_create: "Create a layered effect project.",
  project_get: "Read the current project revision.",
  project_update: "Save validated recipe; reject stale revisions.",
  project_duplicate: "Copy an exact project revision into a new independent project, sharing immutable local assets.",
  project_history: "Read the previous 30 saved snapshots, newest first, and current revision. Older pre-feature history is unavailable.",
  project_restore: "Restore a retained snapshot as a NEW revision; preserve current state in history. Requires expectedRevision.",
  code_generate:
    "Generate standalone Flutter, Phaser or Three.js code. Returns a job ID.",
  preview_start:
    "Build and run generated code in the target runtime; returns job ID. Flutter can take a minute.",
  code_validate:
    "Analyze, build and execute a generated artifact; returns job ID.",
  job_get: "Read job state; completed previews include a PNG image.",
  job_cancel: "Cancel a running job.",
  artifact_get: "Read generated manifest or a source file listed in it.",
};
for (const [name, schema] of Object.entries(inputs)) {
  server.registerTool(
    name,
    {
      description: descriptions[name],
      inputSchema: schema,
      annotations: {
        readOnlyHint: [
          "capabilities_get",
          "presets_list",
          "projects_list",
          "assets_list",
          "project_get",
          "project_history",
          "job_get",
          "artifact_get",
        ].includes(name),
        destructiveHint: name === "preset_delete",
        openWorldHint: false,
      },
    },
    async (input: any) => {
      let response: Response | undefined;
      const readOnly = [
        "capabilities_get",
        "presets_list",
        "projects_list",
        "assets_list",
        "project_get",
        "project_history",
        "job_get",
        "artifact_get",
      ].includes(name);
      for (let attempt = 0; attempt < (readOnly ? 3 : 1); attempt++) {
        try {
          response = await fetch(service!.url + "/api/command", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${service!.token}`,
            },
            body: JSON.stringify({ command: name, input }),
            signal: AbortSignal.timeout(120000),
          });
          break;
        } catch (e: any) {
          if (!readOnly || attempt === 2)
            throw new Error(
              `Local service request failed: ${e.cause?.code ?? e.name}: ${e.cause?.message ?? e.message}`,
            );
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      const data = (await response!.json()) as any;
      if (data.error)
        return {
          isError: true,
          content: [
            { type: "text" as const, text: JSON.stringify(data.error) },
          ],
        };
      const content: any[] = [
        { type: "text", text: JSON.stringify(data.result) },
      ];
      if (
        name === "job_get" &&
        data.result.status === "succeeded" &&
        data.result.imagePath
      )
        content.push({
          type: "image",
          mimeType: "image/png",
          data: (await readFile(data.result.imagePath)).toString("base64"),
        });
      return { content };
    },
  );
}
await server.connect(new StdioServerTransport());
