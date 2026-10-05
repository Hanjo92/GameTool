import { LocalIntegration } from "./integration.js";
import { LocalAssets } from "./assets.js";
import { createServer } from "node:http";
import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";
import { Application } from "../../packages/core/application.js";
import { errorResult, AppError, idSchema } from "../../packages/core/model.js";
import { FileRepository, atomicJson } from "./repository.js";
import { LocalProduction, toolchains } from "./production.js";
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const arg = (key: string, fallback: string) => {
  const i = args.indexOf(key);
  return i >= 0 ? args[i + 1] : fallback;
};
const integrationRoots = args.flatMap((value, index) => {
  if (value !== "--integration-root") return [];
  const path = args[index + 1];
  if (!path || path.startsWith("--"))
    throw new Error(
      "--integration-root requires an existing host project directory",
    );
  return [resolve(path)];
});
const integration = new LocalIntegration(integrationRoots);
await integration.roots();
const workspace = resolve(arg("--workspace", join(repoRoot, ".gametool")));
const port = Number(arg("--port", "4317"));
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Invalid port");
await mkdir(workspace, { recursive: true, mode: 0o700 });
const lockPath = join(workspace, "service.lock");
async function lock() {
  try {
    const f = await open(lockPath, "wx", 0o600);
    await f.writeFile(String(process.pid));
    await f.close();
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
    const pid = Number(await readFile(lockPath, "utf8"));
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (err: any) {
      alive = err.code !== "ESRCH";
    }
    if (alive) throw new Error("This workspace already has a running service");
    await rm(lockPath);
    const f = await open(lockPath, "wx", 0o600);
    await f.writeFile(String(process.pid));
    await f.close();
  }
}
await lock();
process.on("exit", () => {
  /* asynchronous cleanup is handled below */
});
const repo = new FileRepository(workspace);
await repo.init();
const token = randomBytes(32).toString("hex");
let baseUrl = "";
let actualPort = port;
const production = new LocalProduction(workspace, () => baseUrl);
const app = new Application(
  repo,
  production,
  randomUUID,
  toolchains,
  new LocalAssets(workspace),
  integration,
);
const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff2": "font/woff2",
  ".bin": "application/octet-stream",
};
const server = createServer(async (req, res) => {
  const json = (status: number, data: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  };
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  try {
    if (
      ![`127.0.0.1:${actualPort}`, `localhost:${actualPort}`].includes(
        req.headers.host ?? "",
      )
    )
      throw new AppError("ACCESS_DENIED", "Invalid Host");
    const origin = req.headers.origin;
    if (
      (origin &&
        origin !== baseUrl &&
        origin !== `http://localhost:${actualPort}`) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      throw new AppError("ACCESS_DENIED", "Cross-origin request denied");
    const url = new URL(req.url ?? "/", baseUrl),
      path = decodeURIComponent(url.pathname);
    if (path === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (path === "/health" && req.method === "GET")
      return json(200, { ok: true, workspace });
    if (path === "/api/session" && req.method === "GET")
      return json(200, { token });
    if (path.startsWith("/api/")) {
      if (req.headers.authorization !== `Bearer ${token}`)
        throw new AppError("ACCESS_DENIED", "Session required");
      if (path === "/api/command" && req.method === "POST") {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const part of req) {
          size += part.length;
          if (size > 48 * 1024 * 1024)
            throw new AppError("LIMIT_EXCEEDED", "Request too large");
          chunks.push(part);
        }
        const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        return json(200, {
          result: await app.execute(data.command, data.input ?? {}),
        });
      }
      const match = path.match(/^\/api\/download\/([^/]+)$/);
      if (match && req.method === "GET") {
        const a = await repo.artifact(idSchema.parse(match[1]));
        const files: Record<string, Uint8Array> = {};
        for (const name of a.files)
          files[name] = await readFile(join(a.directory, name));
        files["manifest.json"] = strToU8(JSON.stringify(a, null, 2));
        res.writeHead(200, {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="gametool-${a.target}-${a.id.slice(0, 8)}.zip"`,
        });
        res.end(zipSync(files));
        return;
      }
      throw new AppError("NOT_FOUND", "Unknown route");
    }
    let root = join(repoRoot, "dist/editor"),
      relative = path === "/" ? "index.html" : path.slice(1);
    const preview = path.match(/^\/preview\/([^/]+)\/(.*)$/);
    if (preview) {
      const a = await repo.artifact(idSchema.parse(preview[1]));
      root = join(
        a.directory,
        a.target === "flutter" ? "build/web" : ".preview",
      );
      relative = preview[2] || "index.html";
    }
    const file = resolve(root, relative);
    if (!file.startsWith(resolve(root) + "/"))
      throw new AppError("ACCESS_DENIED", "Invalid path");
    const info = await stat(file);
    if (!info.isFile()) throw new AppError("NOT_FOUND", "Not a file");
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
    });
    res.end(await readFile(file));
  } catch (e: any) {
    const err = errorResult(e);
    json(
      err.code === "ACCESS_DENIED"
        ? 403
        : err.code === "NOT_FOUND" || e.code === "ENOENT"
          ? 404
          : err.code === "REVISION_CONFLICT"
            ? 409
            : 400,
      { error: err },
    );
  }
});
try {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  actualPort = (server.address() as { port: number }).port;
  baseUrl = `http://127.0.0.1:${actualPort}`;
  await atomicJson(join(workspace, "service.json"), {
    url: baseUrl,
    token,
    pid: process.pid,
  });
  console.error(`GameTool ready: ${baseUrl}\nWorkspace: ${workspace}`);
} catch (e) {
  await rm(lockPath, { force: true });
  throw e;
}
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  await app.shutdown();
  await rm(join(workspace, "service.json"), { force: true });
  await rm(lockPath, { force: true });
  process.exit(0);
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
