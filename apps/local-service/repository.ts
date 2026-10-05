import {
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
  unlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  AppError,
  idSchema,
  type Project,
  type ProjectSnapshot,
  type UserPreset,
} from "../../packages/core/model.js";
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
    for (const part of [
      "projects",
      "project-batches",
      "generated",
      "jobs",
      "presets",
    ])
      await mkdir(join(this.root, part), { recursive: true });
    for (const job of await this.jobs())
      if (["queued", "running"].includes(job.status))
        await this.saveJob({
          ...job,
          status: "interrupted",
          progress: "이전 서비스 종료로 중단됨",
        });
  }
  private async batchProjects(): Promise<Project[]> {
    let files: string[];
    try {
      files = await readdir(join(this.root, "project-batches"));
    } catch (e: any) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
    return (
      await Promise.all(
        files
          .filter((f) => f.endsWith(".json"))
          .map((f) => this.json(join(this.root, "project-batches", f))),
      )
    ).flatMap((batch) => batch.projects);
  }
  async projects(): Promise<Project[]> {
    const projects = new Map(
      (await this.batchProjects()).map((p) => [p.id, p]),
    );
    for (const file of (await readdir(join(this.root, "projects"))).filter(
      (f) => f.endsWith(".json"),
    )) {
      const { history: _history, ...project } = await this.json(
        join(this.root, "projects", file),
      );
      projects.set(project.id, project);
    }
    return [...projects.values()];
  }
  async project(id: string): Promise<Project> {
    idSchema.parse(id);
    try {
      const { history: _history, ...project } = await this.json(
        join(this.root, "projects", `${id}.json`),
      );
      return project as Project;
    } catch (error: any) {
      if (error.code !== "NOT_FOUND") throw error;
      const project = (await this.batchProjects()).find((p) => p.id === id);
      if (!project) throw error;
      return project;
    }
  }
  /** One manifest rename makes an entire new-project batch visible atomically. */
  async saveBatch(projects: Project[]) {
    if (!projects.length || projects.length > 24)
      throw new AppError("INVALID_INPUT", "Batch requires 1..24 projects");
    const existing = new Set((await this.projects()).map((p) => p.id));
    for (const project of projects) {
      idSchema.parse(project.id);
      if (existing.has(project.id))
        throw new AppError("REVISION_CONFLICT", "Duplicate project in batch");
      existing.add(project.id);
    }
    await mkdir(join(this.root, "project-batches"), { recursive: true });
    await atomicJson(
      join(this.root, "project-batches", `${randomUUID()}.json`),
      { projects },
    );
  }
  save(p: Project, history: ProjectSnapshot[] = []) {
    return atomicJson(
      join(this.root, "projects", `${idSchema.parse(p.id)}.json`),
      { ...p, history },
    );
  }
  async history(id: string): Promise<ProjectSnapshot[]> {
    await this.project(id);
    try {
      return (
        (
          await this.json(
            join(this.root, "projects", `${idSchema.parse(id)}.json`),
          )
        ).history ?? []
      );
    } catch (e: any) {
      if (e.code === "NOT_FOUND") return [];
      throw e;
    }
  }
  async presets(): Promise<UserPreset[]> {
    const items: UserPreset[] = await Promise.all(
      (await readdir(join(this.root, "presets")))
        .filter((f) => f.endsWith(".json"))
        .map((f) => this.json(join(this.root, "presets", f))),
    );
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  savePreset(p: UserPreset) {
    return atomicJson(
      join(this.root, "presets", `${idSchema.parse(p.id)}.json`),
      p,
    );
  }
  async deletePreset(id: string) {
    try {
      await unlink(join(this.root, "presets", `${idSchema.parse(id)}.json`));
    } catch (e: any) {
      if (e.code === "ENOENT")
        throw new AppError("NOT_FOUND", "프리셋을 찾을 수 없습니다.");
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
