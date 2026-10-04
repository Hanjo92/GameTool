---
name: gametool-effects
description: Create, edit, preview, and validate local game UI and particle effects with GameTool MCP, producing standalone Flutter, Phaser, or Three.js code. Use for animated titles, cut-ins, trailers, background motion, image layers, particles, and reusable effect presets.
---

# GameTool Effects

Use the local GameTool application to author executable effects. Honor the requested runtime and existing project; a PNG preview is evidence, not the deliverable. Generated packages include runtime source, examples, assets, and licenses.

## Connect

Prefer an already available GameTool MCP server. Tool namespaces vary by client; discover `capabilities_get` and `project_get`, then use its `tools/list` schemas.

Without a registered MCP server, use the bundled **stdio MCP client**. It resolves the pinned SDK from the GameTool installation and works from other project directories without editing client configuration:

```sh
node "<skill-dir>/scripts/client.mjs" call capabilities_get
node "<skill-dir>/scripts/client.mjs" tools project_update
```

Replace `<skill-dir>` with this skill's directory. The repository copy discovers its containing GameTool installation. When copied elsewhere, pass `--root "/path/to/GameTool"` or set `GAMETOOL_ROOT`. Node.js 22+ and the application's dependencies/font cache are required. If missing, read the application's README and prepare the requested toolchain; do not silently substitute a different renderer.

The default data workspace is `<GameTool>/.gametool`, shared with its GUI. Use `--workspace "/absolute/data/path"` / `GAMETOOL_WORKSPACE` only when the task calls for another workspace. A new workspace cannot resolve another workspace's image/font/preset IDs. The server auto-starts when absent and stays running after the client closes. Do not stop a shared service to clean up your own client.

For invocation syntax and job handling, read [references/client.md](references/client.md). For initial client registration, provide the documented stdio command if requested; installing this skill alone does not authorize changes to Claude, Cursor, Codex, or other client configuration.

## Author an effect

1. Read `capabilities_get`; find an appropriate recipe with `presets_list`. Use returned IDs/options instead of guessing supported features. Query existing `projects_list` / `project_get` when continuing work. Use `project_duplicate` for a requested variant; otherwise create a named project.
2. Get the current project and revision. `project_update` takes the **whole recipe**, not a partial layer. Merge only requested fields into that snapshot, preserving other layers, timing, fonts, and images. Send its `expectedRevision`. The helper's `patch PROJECT_ID EXPECTED_REVISION PATCH.json` does this merge; arrays replace, objects merge, null stays null. On REVISION_CONFLICT, reload and reconcile the user's change; do not just increment the number or resubmit the stale recipe.
3. Import requested files through `asset_import` (or helper `import PATH`), then use returned IDs. Images: static PNG/JPEG/WebP, 8 MiB/16 MP. Fonts: TTF/OTF/WOFF/WOFF2, 32 MiB. Originals are retained. Prefer font files/catalog fonts for portable output; `local:` names require that font on the target computer.
4. Apply text, frame, background, image, and/or particles as requested. Read [references/effects.md](references/effects.md) for timing, style application, layer composition, and parameter pitfalls. The installed app's `docs/mcp-contract.md` is the full model reference; live tool schemas and capabilities take priority over this skill's version notes.
5. Save before starting production. `preview_start` and `code_generate` pin an exact revision. Review relevant entry/hold/exit or burst times in the actual target preview. A single successful still does not prove the animation works.

## Produce and verify

- `code_generate` produces files but leaves validation unrun. `preview_start` builds a target preview. Both return a job ID; poll `job_get` until succeeded/failed/cancelled/interrupted. Flutter builds can take a few minutes.
- Inspect the completed job's artifact with `artifact_get`. For execution assurance, call `code_validate` and wait for its job, then re-read the manifest. Report `validation.status`, the actual SDK/platform, and any failure honestly. Code generation, preview, runtime validation, native device tests, and deployment are different evidence.
- The helper supports `call TOOL INPUT.json --wait` and `wait JOB_ID`; timeout does not cancel the job. Resume polling that ID. Never blindly retry project/asset/job creation after an ambiguous connection failure. Read project/job state first.
- Inspect returned `imagePath` and `previewUrl` when available. Native MCP `job_get` can also contain a PNG image. The helper prints only JSON, avoiding base64 image floods. Artifact source files are accessed by manifest-listed paths; do not read binary font/image files as text.
- Give the user the project/revision, target, generated directory/entrypoint or GUI ZIP location, and the validation result. Integrate into the user's game only within their requested scope; retain source boundaries and asset licenses. Do not overwrite unrelated hand-written code.

## Reuse and boundaries

`preset_save` captures an exact saved revision. `project_history` lists up to 30 previous saves; `project_restore` writes the chosen state as a new revision and retains the state being replaced. `preset_delete` removes only a user preset, but do it only when deletion was requested or for a clearly scoped disposable test fixture.

Use MCP/Core for project mutations; do not edit `.gametool/projects` JSON directly. Do not print or copy the `service.json` token. No API key or cloud model is required. Current effects are 2D screen-space compositions with one particle emitter, not volumetric 3D simulation or a shader graph. GameTool outputs runtime code; APNG/WebP sprite encoding is not the workflow.
