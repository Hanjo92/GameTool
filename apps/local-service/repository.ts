import { mkdir, readFile, readdir, rename, writeFile, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { AppError, idSchema, type Project, type ProjectSnapshot, type UserPreset } from "../../packages/core/model.js";
import type {
  Repository,
  Job,
  Artifact,
} from "../../packages/core/application.js";
export async function atomicJson(path: string, value: unknown) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await rename(temp, path);
}
export class FileRepository implements Repository {
  constructor(readonly root: string) {}
  async init() {
    for (const part of ["projects", "generated", "jobs", "presets"])
      await mkdir(join(this.root, part), { recursive: true });
    for (const job of await this.jobs())
      if (["queued", "running"].includes(job.status))
        await this.saveJob({
          ...job,
          status: "interrupted",
          progress: "이전 서비스 종료로 중단됨",
        });
  }
  async projects(): Promise<Project[]> {
    return Promise.all(
      (await readdir(join(this.root, "projects")))
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => {
          const { history: _history, ...project } = await this.json(join(this.root, "projects", f));
          return project;
        }),
    );
  }
  async project(id: string): Promise<Project> {
    const { history: _history, ...project } = await this.json(join(this.root, "projects", `${idSchema.parse(id)}.json`));
    return project as Project;
  }
  save(p: Project, history: ProjectSnapshot[] = []) {
    return atomicJson(
      join(this.root, "projects", `${idSchema.parse(p.id)}.json`),
      { ...p, history },
    );
  }
  async history(id: string): Promise<ProjectSnapshot[]> {
    return (await this.json(join(this.root, "projects", `${idSchema.parse(id)}.json`))).history ?? [];
  }
  async presets(): Promise<UserPreset[]> {
    const items: UserPreset[] = await Promise.all((await readdir(join(this.root, "presets")))
      .filter(f => f.endsWith(".json")).map(f => this.json(join(this.root, "presets", f))));
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  savePreset(p: UserPreset) {
    return atomicJson(join(this.root, "presets", `${idSchema.parse(p.id)}.json`), p);
  }
  async deletePreset(id: string) {
    try { await unlink(join(this.root, "presets", `${idSchema.parse(id)}.json`)); }
    catch (e: any) {
      if (e.code === "ENOENT") throw new AppError("NOT_FOUND", "프리셋을 찾을 수 없습니다.");
      throw e;
    }
  }
  artifact(id: string): Promise<Artifact> {
    return this.json(
      join(this.root, "generated", idSchema.parse(id), "manifest.json"),
    );
  }
  async source(id: string, file: string) {
    const a = await this.artifact(id);
    if (/\.(ttf|png|jpg|jpeg|webp)$/.test(file))
      throw new AppError(
        "BINARY_ASSET",
        "Download the package to access image and font assets",
      );
    if (!a.files.includes(file))
      throw new AppError("NOT_FOUND", "File is not in the generated manifest");
    const path = resolve(a.directory, file);
    if (!path.startsWith(resolve(a.directory) + "/"))
      throw new AppError("IMPORT_DENIED", "Invalid file path");
    const text = await readFile(path, "utf8");
    if (text.length > 300000)
      throw new AppError("LIMIT_EXCEEDED", "Source too large");
    return text;
  }
  async jobs(): Promise<Job[]> {
    return Promise.all(
      (await readdir(join(this.root, "jobs")))
        .filter((f) => f.endsWith(".json"))
        .map((f) => this.json(join(this.root, "jobs", f))),
    );
  }
  saveJob(job: Job) {
    return atomicJson(
      join(this.root, "jobs", `${idSchema.parse(job.id)}.json`),
      structuredClone(job),
    );
  }
  private async json(path: string): Promise<any> {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch (e: any) {
      if (e.code === "ENOENT")
        throw new AppError("NOT_FOUND", "Requested item does not exist");
      throw e;
    }
  }
}
