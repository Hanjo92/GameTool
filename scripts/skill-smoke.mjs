/** Validate the installed skill's real client from an unrelated cwd. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const exec = promisify(execFile);
const root = resolve('.'), skill = process.argv[2] ? resolve(process.argv[2]) : join(root,'skills/gametool-effects');
const helper = join(skill,'scripts/client.mjs'), workspace = join(root,'output/validation',`skill-${Date.now()}`);
await mkdir(workspace,{recursive:true});
let serial = 0;
async function file(data) { const path=join(workspace,`input-${serial++}.json`); await writeFile(path,JSON.stringify(data)); return path; }
const outputs=[];
async function cli(args, expected=0) {
  let result;
  try { result=await exec(process.execPath,[helper,'--root',root,'--workspace',workspace,...args],{cwd:tmpdir(),timeout:240000,maxBuffer:16*1024*1024}); result.code=0; }
  catch(e) { result=e; }
  assert.equal(result.code,expected,result.stdout+'\n'+result.stderr);
  outputs.push(result.stdout);
  return JSON.parse(result.stdout);
}
const call = async (name,input={},extra=[],expected=0) => cli(['call',name,await file(input),...extra],expected);
try {
  const tools=await cli(['tools']);
  assert.equal(tools.tools.length,27);
  const schema=await cli(['tools','project_update']);
  assert.ok(schema.inputSchema.required.includes('expectedRevision'));
  const caps=await call('capabilities_get');
  const style=caps.particleStyles.find(s=>s.id==='vortex');
  assert.ok(style);
  const p=await call('project_create',{name:'Skill client integration',presetId:'battle'});
  const imagePath=join(workspace,'source.png');
  await sharp({create:{width:8,height:8,channels:4,background:'#437caaff'}}).png().toFile(imagePath);
  const asset=await cli(['import',imagePath]);
  const patch={text:'AGENT EFFECT',textVisible:false,background:{enabled:true,assetId:asset.id},particles:{...style.settings,enabled:true,advanced:true,count:12}};
  const p2=await cli(['patch',p.id,String(p.revision),await file(patch)]);
  assert.equal(p2.revision,p.revision+1);
  assert.equal(p2.recipe.width,p.recipe.width);
  assert.equal(p2.recipe.background.fit,p.recipe.background.fit);
  assert.equal(p2.recipe.particles.path,'vortex');
  const stale=await cli(['patch',p.id,String(p.revision),await file({text:'stale'})],1);
  assert.equal(stale.error.code,'REVISION_CONFLICT');
  const invalid=await cli(['patch',p.id,String(p2.revision),await file(JSON.parse('{"__proto__":{"unsafe":true}}'))],1);
  assert.equal(invalid.error.code,'INVALID_INPUT');
  const current=await call('project_get',{projectId:p.id});
  assert.deepEqual(current,p2);
  const timed=await call('preview_start',{projectId:p.id,expectedRevision:p2.revision,target:'three',timeSeconds:.6},['--wait','--timeout','.001'],2);
  assert.equal(timed.error.code,'WAIT_TIMEOUT');
  assert.ok(timed.error.jobId);
  const preview=await cli(['wait',timed.error.jobId,'--timeout','180']);
  assert.equal(preview.status,'succeeded');
  assert.ok(preview.previewUrl && preview.imagePath);
  assert.ok((await stat(preview.imagePath)).size>100);
  const completed=await call('job_get',{jobId:timed.error.jobId});
  assert.ok(JSON.stringify(completed).length<5000,'MCP image base64 must not flood JSON output');
  const validation=await call('code_validate',{artifactId:preview.artifactId},['--wait']);
  assert.equal(validation.status,'succeeded');
  const artifact=await call('artifact_get',{artifactId:preview.artifactId});
  assert.equal(artifact.validation.status,'passed');
  const source=await call('artifact_get',{artifactId:preview.artifactId,file:'recipe.json'});
  assert.deepEqual(JSON.parse(source.source),p2.recipe);
  const service=JSON.parse(await readFile(join(workspace,'service.json'),'utf8'));
  assert.ok(outputs.every(s=>!s.includes(service.token)),'Do not print service credentials');
  const report={status:'passed',skill,workspace,toolCount:tools.tools.length,artifactId:artifact.id,target:artifact.target,
    validation:artifact.validation,checks:['MCP tools and schema discovery','unrelated cwd','asset import','recipe merge preservation','stale revision rejected','unsafe patch rejected','wait timeout returns job ID','resume same preview job','PNG kept out of stdout','generated recipe equality','real target validation','token not printed']};
  await writeFile(join(root,'output/validation/skill-check.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {
  try { const service=JSON.parse(await readFile(join(workspace,'service.json'),'utf8')); process.kill(service.pid,'SIGTERM'); } catch {}
}
