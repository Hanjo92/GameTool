/** Publication preflight. Print locations/rule names, never matching secret values. */
import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
const paths = text => text.split('\0').filter(Boolean);
const candidates = [...new Set(paths(git('ls-files', '--cached', '--others', '--exclude-standard', '-z')))];
const trackedIgnored = paths(git('ls-files', '--cached', '--ignored', '--exclude-standard', '-z'));
const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['provider-token', /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,}|xox[baprs]-[A-Za-z0-9-]{20,}|AKIA[A-Z0-9]{16})\b/],
  ['assigned-secret', /["']?(?:api[_-]?key|access[_-]?token|secret|password|token)["']?\s*[:=]\s*["'][A-Za-z0-9_+/=-]{24,}["']/i],
  ['credential-url', /https?:\/\/[^\s/:]+:[^\s/@]+@/],
  ['personal-path', /\/(?:Users|home)\/[^/\s"']+|\/Volumes\/[^/\s"']+/],
];
const findings = trackedIgnored.map(file => ({ file, rule: 'tracked-but-ignored' }));
let bytes = 0, textFiles = 0;
for (const file of candidates) {
  const info = await lstat(file);
  if (!info.isFile()) { findings.push({ file, rule: 'non-regular-file' }); continue; }
  bytes += info.size;
  if (info.size > 10 * 1024 * 1024) { findings.push({ file, rule: 'large-file-over-10MiB' }); continue; }
  const content = await readFile(file);
  if (content.includes(0)) { findings.push({ file, rule: 'binary-needs-review' }); continue; }
  textFiles++;
  const lines = content.toString('utf8').split('\n');
  lines.forEach((line, index) => {
    for (const [rule, pattern] of rules)
      if (pattern.test(line)) findings.push({ file, line: index + 1, rule });
  });
}
console.log(JSON.stringify({ status: findings.length ? 'failed' : 'passed', files: candidates.length, textFiles, bytes, findings }, null, 2));
if (findings.length) process.exitCode = 1;
