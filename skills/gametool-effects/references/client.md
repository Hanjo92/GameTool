# Client invocation

The helper is a real MCP SDK client, not an HTTP bypass. Every call goes through `scripts/mcp.mjs` and the shared validated command boundary.

Set a task variable to the script path (do not replace system environment variables):

```sh
gametool_client="/absolute/path/to/skill/scripts/client.mjs"
node "$gametool_client" --help
node "$gametool_client" --root "/absolute/path/to/GameTool" tools project_create
node "$gametool_client" call capabilities_get > /tmp/gametool-capabilities.json
node "$gametool_client" call presets_list > /tmp/gametool-presets.json
```

For an installed skill outside the GameTool repository, set `GAMETOOL_ROOT` to the application directory or include `--root` on each call.

Read the JSON and pick actual returned IDs. `call` accepts a JSON file or `-` for stdin. Omitting input supplies `{}`. Command input is data, not shell interpolation:

```sh
node "$gametool_client" call project_create - <<'JSON'
{"name":"Boss arrival","presetId":"battle"}
JSON
```

Use the returned project ID and revision in subsequent commands. For example, put the intended **recipe patch** in a local file:

```json
{
  "text": "보스 등장",
  "frame": {"enabled": true, "animation": "draw", "textDelay": 0.25},
  "particles": {"enabled": true, "advanced": true, "shape": "star", "blend": "add", "glow": 12}
}
```

Then invoke `node "$gametool_client" patch PROJECT_ID EXPECTED_REVISION patch.json`. This reads the saved recipe, checks that revision, merges the patch, and calls project_update with the same expectedRevision. It does not retry a conflict. A patch cannot rename a project; use native project_update with name and the whole recipe for that.

Start generation using the returned revision:

```json
{"projectId":"ACTUAL_PROJECT_UUID","expectedRevision":2,"target":"three"}
```

Save this JSON to a file and invoke:

```sh
node "$gametool_client" call code_generate generate.json --wait
node "$gametool_client" wait ACTUAL_JOB_UUID --timeout 900
```

The first command already waits; the second illustrates resuming a timed-out/disconnected wait, not a required extra step. For a preview use `preview_start` with the same input plus `timeSeconds`. For validation use `code_validate` with `{"artifactId":"ACTUAL_ARTIFACT_UUID"}` and `--wait`. Finally query `artifact_get` to confirm validation on that artifact.

`import PATH` reads the specified local file and sends base64 bytes through asset_import. Other clients can do the same through their native MCP adapter. `tools TOOL` returns the live input schema/annotations; `tools` lists all tools. The currently supported commands include project CRUD/duplicate/history/restore, presets, assets, generation/preview/validation, jobs, and artifacts; enumerate rather than relying on a fixed count.

JSON results go to stdout; progress goes to stderr. Failures exit 1 with a JSON error. A job wait timeout exits 2 with jobId; the job may still be running. Tool calls have a bounded transport timeout, and a timed-out mutation must not be repeated without checking state.

## Different working directories or clients

```sh
node "/absolute/skill/scripts/client.mjs" --root "/absolute/GameTool" --workspace "/absolute/data" call projects_list
```

For a client supporting stdio MCP, the registration command is `node /absolute/GameTool/scripts/mcp.mjs --workspace /absolute/data`. Arguments are separate JSON array entries, so spaces in paths need no embedded quotes. Make client configuration changes only when the user has authorized configuring that client. A skill can be copied to another agent's skill directory or supplied as a SKILL.md path; automatic discovery depends on that agent's skill support.
