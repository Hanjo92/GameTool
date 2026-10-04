#!/usr/bin/env node
/** Configuration-free MCP client. Uses the GameTool installation's pinned SDK. */
import { readFile, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, join, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const help = `GameTool MCP client (Node.js 22+)
  node client.mjs [--root APP_DIR] [--workspace DATA_DIR] tools [TOOL]
  node client.mjs [options] call TOOL [INPUT.json|-] [--wait]
  node client.mjs [options] patch PROJECT_ID EXPECTED_REVISION PATCH.json|-
  node client.mjs [options] import IMAGE_OR_FONT
  node client.mjs [options] wait JOB_ID
Options: --timeout SECONDS (job wait, default 900), --help
GAMETOOL_ROOT overrides installation discovery; GAMETOOL_WORKSPACE overrides data directory.
Defaults: the containing repository; workspace APP_DIR/.gametool.
For a separately installed skill, provide --root or GAMETOOL_ROOT.
JSON goes to stdout; progress goes to stderr. No shell or client configuration changes.
A wait timeout leaves the job running: resume with wait JOB_ID. Never resubmit a mutation blindly.
`;
const args = process.argv.slice(2);
if (args.includes('--help') || !args.length) { process.stdout.write(help); process.exit(0); }
let rootArg = process.env.GAMETOOL_ROOT, workspaceArg = process.env.GAMETOOL_WORKSPACE, timeout = 900, wait = false;
const positional = [];
let client;
function failure(code, message, details = {}) { return Object.assign(new Error(message), { code, ...details }); }
async function jsonInput(path) {
  if (!path) return {};
  const text = path === '-' ? await new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    process.stdin.on('data', chunk => { size += chunk.length; if (size > 48 * 1024 * 1024) { reject(failure('INPUT_TOO_LARGE','Input exceeds 48 MiB')); process.stdin.destroy(); } else chunks.push(chunk); });
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  }) : await readFile(resolve(path), 'utf8');
  const value = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('INVALID_INPUT','Expected a JSON object');
  return value;
}
function merge(base, patch) {
  const result = { ...base };
  for (const [key,value] of Object.entries(patch)) {
    if (['__proto__','constructor','prototype'].includes(key)) throw failure('INVALID_INPUT','Unsafe object key');
    result[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? merge(base?.[key] && typeof base[key] === 'object' && !Array.isArray(base[key]) ? base[key] : {}, value)
      : value;
  }
  return result;
}
try {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--root','--workspace','--timeout'].includes(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('--')) throw failure('USAGE',`Missing value for ${arg}`);
      if (arg === '--root') rootArg = value;
      if (arg === '--workspace') workspaceArg = value;
      if (arg === '--timeout') timeout = Number(value);
    } else if (arg === '--wait') wait = true;
    else if (arg.startsWith('--')) throw failure('USAGE',`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 7200) throw failure('USAGE','Timeout must be 0 < seconds <= 7200');
  const [operation, ...values] = positional;
  const arities = { tools:[0,1], call:[1,2], patch:[3,3], import:[1,1], wait:[1,1] };
  if (!arities[operation] || values.length < arities[operation][0] || values.length > arities[operation][1]) throw failure('USAGE','Invalid command or arguments; use --help');
  if (wait && (operation !== 'call' || !['code_generate','preview_start','code_validate'].includes(values[0]))) throw failure('USAGE','--wait applies only to code_generate, preview_start or code_validate');
  if (Number(process.versions.node.split('.')[0]) < 22) throw failure('NODE_UNAVAILABLE','Node.js 22+ is required');
  const candidates = rootArg ? [resolve(rootArg)] : [fileURLToPath(new URL('../../../',import.meta.url))];
  let root;
  for (const candidate of candidates) {
    try { if (JSON.parse(await readFile(join(candidate,'package.json'),'utf8')).name === 'gametool') { root = candidate; break; } } catch {}
  }
  if (!root) throw failure('INSTALLATION_NOT_FOUND','Set --root or GAMETOOL_ROOT to an installed GameTool directory');
  const workspace = resolve(workspaceArg ?? join(root,'.gametool'));
  const require = createRequire(join(root,'package.json'));
  const { Client } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(require.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  client = new Client({name:'gametool-skill',version:'1.0.0'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[join(root,'scripts/mcp.mjs'),'--workspace',workspace],cwd:root,stderr:'pipe'}));
  async function call(name, input = {}) {
    const response = await client.callTool({name,arguments:input},undefined,{timeout:120000});
    const block = response.content.find(b=>b.type === 'text');
    if (!block) throw failure('INVALID_RESPONSE','Expected JSON text from GameTool');
    const result = JSON.parse(block.text);
    if (response.isError) throw failure(result.code ?? 'TOOL_ERROR',result.message ?? 'Tool failed',{details:result.details});
    // job_get also returns PNG content; its JSON already carries the local imagePath.
    return result;
  }
  async function waitFor(jobId) {
    const deadline = Date.now() + timeout * 1000; let previous;
    while (Date.now() < deadline) {
      const job = await call('job_get',{jobId});
      if (job.progress !== previous) { process.stderr.write(`${jobId}: ${job.progress}\n`); previous = job.progress; }
      if (job.status === 'succeeded') return job;
      if (['failed','cancelled','interrupted'].includes(job.status)) throw failure(job.error?.code ?? 'JOB_FAILED',job.error?.message ?? job.progress,{jobId,status:job.status});
      await new Promise(r=>setTimeout(r,500));
    }
    throw failure('WAIT_TIMEOUT','Job may still be running. Resume with wait; do not repeat its creation.',{jobId});
  }
  let result;
  if (operation === 'tools') {
    const list = await client.listTools();
    result = values.length ? list.tools.find(t=>t.name === values[0]) : list;
    if (!result) throw failure('NOT_FOUND','Tool not found');
  } else if (operation === 'call') {
    result = await call(values[0],await jsonInput(values[1]));
    if (wait) { if (!result.jobId) throw failure('INVALID_RESPONSE','Expected jobId'); result = await waitFor(result.jobId); }
  } else if (operation === 'wait') result = await waitFor(values[0]);
  else if (operation === 'patch') {
    const revision = Number(values[1]);
    if (!Number.isSafeInteger(revision) || revision < 1) throw failure('USAGE','EXPECTED_REVISION must be a positive integer');
    const patch = await jsonInput(values[2]);
    const project = await call('project_get',{projectId:values[0]});
    if (project.revision !== revision) throw failure('REVISION_CONFLICT','Read the current project and reconcile your patch before retrying',{details:{currentRevision:project.revision}});
    result = await call('project_update',{projectId:project.id,expectedRevision:revision,recipe:merge(project.recipe,patch)});
  } else if (operation === 'import') {
    const path = resolve(values[0]);
    if ((await stat(path)).size > 32 * 1024 * 1024) throw failure('INPUT_TOO_LARGE','Asset exceeds 32 MiB; images are limited to 8 MiB by GameTool');
    result = await call('asset_import',{name:basename(path),dataBase64:(await readFile(path)).toString('base64')});
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
} catch (error) {
  process.stdout.write(JSON.stringify({error:{code:error.code ?? 'CLIENT_ERROR',message:error.message,...(error.details ? {details:error.details}:{}),...(error.jobId ? {jobId:error.jobId}:{}),...(error.status ? {status:error.status}:{})}},null,2)+'\n');
  process.exitCode = error.code === 'WAIT_TIMEOUT' ? 2 : 1;
} finally { if (client) await client.close(); }
