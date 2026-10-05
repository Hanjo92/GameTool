import { evaluateStudio } from "../../runtimes/shared/studio.js";
import {
  normalizeVariants,
  recipeDiff,
  comparisonSamples,
  type IntegrationPort,
} from "./studio-workflows.js";
import {
  assetIds,
  fontAssetIds,
  evaluate,
  backgroundAt,
  frameAt,
  glyphAt,
  particlesAt,
} from "../../runtimes/shared/motion.js";
import { currentText } from "../../runtimes/shared/sequence.js";
import { z } from "zod";
import {
  AppError,
  errorResult,
  idSchema,
  presets,
  recipeSchema,
  targetSchema,
  type Project,
  type ProjectSnapshot,
  type UserPreset,
  type Target,
} from "./model.js";
/** Bound response size and glyph evaluation work across up to 400 comparison samples. */
function comparisonSceneSample(recipe: Project["recipe"], time: number) {
  const glyphCount = recipe.typography?.enabled
    ? Array.from(currentText(recipe, time)).length
    : 0;
  const particles = particlesAt(recipe, time);
  return {
    ...evaluate(recipe, time),
    background: backgroundAt(recipe, time),
    frame: frameAt(recipe, time),
    glyphCount,
    glyphSample: Array.from({ length: Math.min(3, glyphCount) }, (_, index) =>
      glyphAt(recipe, time, index, glyphCount),
    ),
    particleCount: particles.length,
    particleSample: particles.slice(0, 3),
  };
}
export interface Asset {
  kind?: "image" | "font";
  family?: string;
  id: string;
  name: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  originalHash: string;
  runtimeHash: string;
  createdAt: string;
}
export interface AssetStore {
  list(): Promise<Asset[]>;
  get(id: string): Promise<Asset>;
  import(name: string, dataBase64: string): Promise<Asset>;
}
export interface Artifact {
  id: string;
  projectId: string;
  revision: number;
  target: Target;
  files: string[];
  directory: string;
  validation: unknown;
}
export interface Job {
  id: string;
  kind: string;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "cancelled"
    | "interrupted";
  progress: string;
  artifactId?: string;
  error?: unknown;
  previewUrl?: string;
  imagePath?: string;
  profileReport?: unknown;
  comparisons?: {
    name: string;
    artifactId: string;
    previewUrl: string;
    imagePath?: string;
  }[];
}
export interface Repository {
  projects(): Promise<Project[]>;
  project(id: string): Promise<Project>;
  save(project: Project, history?: ProjectSnapshot[]): Promise<void>;
  saveBatch?(projects: Project[]): Promise<void>;
  history(id: string): Promise<ProjectSnapshot[]>;
  presets(): Promise<UserPreset[]>;
  savePreset(preset: UserPreset): Promise<void>;
  deletePreset(id: string): Promise<void>;
  artifact(id: string): Promise<Artifact>;
  source(id: string, file: string): Promise<string>;
  jobs(): Promise<Job[]>;
  saveJob(job: Job): Promise<void>;
}
export interface Production {
  create(
    project: Project,
    target: Target,
    signal: AbortSignal,
  ): Promise<Artifact>;
  preview(
    artifact: Artifact,
    time: number,
    signal: AbortSignal,
  ): Promise<{ previewUrl: string; imagePath?: string }>;
  validate(artifact: Artifact, signal: AbortSignal): Promise<void>;
  profile?(
    artifact: Artifact,
    frames: number,
    signal: AbortSignal,
  ): Promise<unknown>;
}
const projectRef = z.object({
  projectId: idSchema,
  expectedRevision: z.number().int().positive(),
});
const variantSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    patch: z.record(z.string(), z.unknown()),
  })
  .strict();
export const inputs = {
  studio_variants: projectRef
    .extend({
      variants: z.array(variantSchema).min(1).max(24),
      save: z.boolean().default(false),
    })
    .strict(),
  recipe_diff: projectRef.extend({ recipe: recipeSchema }).strict(),
  studio_compare: projectRef
    .extend({
      variants: z.array(variantSchema).max(24).default([]),
      times: z
        .array(z.number().min(0).max(3600))
        .min(1)
        .max(16)
        .default([0, 0.25, 0.6, 1, 2]),
    })
    .strict(),
  studio_comparison_start: projectRef
    .extend({
      variants: z.array(variantSchema).min(1).max(6),
      target: targetSchema,
      timeSeconds: z.number().min(0).max(3600).default(0.6),
    })
    .strict(),
  integration_roots: z.object({}).strict(),
  integration_plan: z
    .object({
      artifactId: idSchema,
      rootId: z.string().min(1).max(80),
      effectId: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
    })
    .strict(),
  integration_apply: z
    .object({
      planId: z.string().min(1).max(100),
      expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  performance_start: z
    .object({
      artifactId: idSchema,
      frames: z.number().int().min(30).max(600).default(120),
    })
    .strict(),
  assets_list: z.object({}).strict(),
  asset_import: z
    .object({
      name: z.string().trim().min(1).max(120),
      dataBase64: z.string().min(4).max(44739244),
    })
    .strict(),
  capabilities_get: z.object({}).strict(),
  presets_list: z.object({}).strict(),
  preset_save: projectRef
    .extend({ name: z.string().trim().min(1).max(80) })
    .strict(),
  preset_delete: z.object({ presetId: idSchema }).strict(),
  projects_list: z.object({}).strict(),
  project_create: z
    .object({
      name: z.string().trim().min(1).max(80),
      presetId: z.string().min(1).max(100).default("battle"),
    })
    .strict(),
  project_get: z.object({ projectId: idSchema }).strict(),
  project_duplicate: projectRef
    .extend({ name: z.string().trim().min(1).max(80) })
    .strict(),
  project_history: z.object({ projectId: idSchema }).strict(),
  project_restore: projectRef
    .extend({ revision: z.number().int().positive() })
    .strict(),
  project_update: projectRef
    .extend({
      recipe: recipeSchema,
      name: z.string().trim().min(1).max(80).optional(),
    })
    .strict(),
  code_generate: projectRef.extend({ target: targetSchema }).strict(),
  preview_start: projectRef
    .extend({
      target: targetSchema,
      timeSeconds: z.number().min(0).max(3600).default(0.6),
    })
    .strict(),
  code_validate: z.object({ artifactId: idSchema }).strict(),
  job_get: z.object({ jobId: idSchema }).strict(),
  job_cancel: z.object({ jobId: idSchema }).strict(),
  artifact_get: z
    .object({ artifactId: idSchema, file: z.string().max(240).optional() })
    .strict(),
};
export type Command = keyof typeof inputs;
/** All adapters use this single command boundary. Serial mutations protect revisions. */
export class Application {
  private queue: Promise<unknown> = Promise.resolve();
  private controllers = new Map<string, AbortController>();
  private running = new Map<string, Job>();
  constructor(
    private repo: Repository,
    private production: Production,
    private uuid: () => string,
    private capabilities: () => Promise<unknown>,
    private assets?: AssetStore,
    private integration?: IntegrationPort,
  ) {}
  execute(command: string, input: unknown): Promise<any> {
    const task = this.queue.then(() => this.dispatch(command, input));
    this.queue = task.catch(() => {});
    return task;
  }
  private async snapshot(id: string, revision: number) {
    const p = await this.repo.project(id);
    if (p.revision !== revision)
      throw new AppError(
        "REVISION_CONFLICT",
        "다른 편집 내용이 저장되었습니다. 다시 불러오세요.",
        { currentRevision: p.revision },
      );
    return p;
  }
  private async validateAssets(recipe: Project["recipe"]) {
    const images = assetIds(recipe),
      fonts = fontAssetIds(recipe);
    for (const id of new Set([...images, ...fonts])) {
      if (!this.assets)
        throw new AppError("UNAVAILABLE", "Asset storage unavailable");
      const asset = await this.assets.get(id);
      if (fonts.includes(id) && asset.kind !== "font")
        throw new AppError(
          "INVALID_ASSET",
          "텍스트 폰트에는 폰트 파일을 지정하세요.",
        );
      if (images.includes(id) && asset.kind === "font")
        throw new AppError(
          "INVALID_ASSET",
          "배경과 이미지에는 이미지 파일을 지정하세요.",
        );
    }
  }
  /** Current state and its previous 30 snapshots are committed atomically. */
  private async replace(p: Project, recipe: Project["recipe"], name: string) {
    await this.validateAssets(recipe);
    const { id: _id, ...snapshot } = p;
    const history = [...(await this.repo.history(p.id)), snapshot].slice(-30);
    const next = {
      ...p,
      recipe,
      name,
      revision: p.revision + 1,
      updatedAt: new Date().toISOString(),
    };
    await this.repo.save(next, history);
    return next;
  }
  private async dispatch(command: string, raw: unknown): Promise<unknown> {
    if (!Object.hasOwn(inputs, command))
      throw new AppError("NOT_FOUND", "Unknown command");
    const a: any = inputs[command as Command].parse(raw);
    switch (command) {
      case "integration_roots":
        return { roots: (await this.integration?.roots()) ?? [] };
      case "integration_plan": {
        if (!this.integration)
          throw new AppError(
            "UNAVAILABLE",
            "Start the service with --integration-root to enable project integration",
          );
        return this.integration.plan(
          await this.repo.artifact(a.artifactId),
          a.rootId,
          a.effectId,
        );
      }
      case "integration_apply": {
        if (!this.integration)
          throw new AppError(
            "UNAVAILABLE",
            "Integration roots are not configured",
          );
        return this.integration.apply(a.planId, a.expectedHash);
      }
      case "recipe_diff": {
        const p = await this.snapshot(a.projectId, a.expectedRevision);
        return {
          projectId: p.id,
          revision: p.revision,
          changes: recipeDiff(p.recipe, a.recipe),
        };
      }
      case "studio_variants":
      case "studio_compare":
      case "studio_comparison_start": {
        const p = await this.snapshot(a.projectId, a.expectedRevision);
        const variants = a.variants.length
          ? normalizeVariants(p.recipe, a.variants, (value) =>
              recipeSchema.parse(value),
            )
          : [];
        // Validate every draft and asset before persisting or starting any production work.
        for (const variant of variants)
          await this.validateAssets(variant.recipe);
        if (command === "studio_compare")
          return {
            kind: "numerical-samples",
            projectId: p.id,
            revision: p.revision,
            samples: comparisonSamples(
              [{ name: p.name, recipe: p.recipe }, ...variants],
              a.times,
              (recipe, time) => ({
                ...comparisonSceneSample(recipe, time),
                studio: evaluateStudio(recipe, time).map((n) => ({
                  id: n.id,
                  kind: n.kind,
                  x: n.x,
                  y: n.y,
                  scale: n.scale,
                  rotation: n.rotation,
                  opacity: n.opacity,
                  visible: n.visible,
                  value: n.value,
                  state: n.state,
                  particleCount: n.points.length,
                  particleSample: n.points.slice(0, 3),
                })),
              }),
            ),
          };
        if (command === "studio_comparison_start")
          return this.start(command, async (signal, job) => {
            job.comparisons = [];
            for (const variant of [
              { name: p.name, recipe: p.recipe },
              ...variants,
            ]) {
              signal.throwIfAborted();
              const draft: Project = {
                id: this.uuid(),
                name: variant.name,
                revision: 1,
                recipe: variant.recipe,
                updatedAt: new Date().toISOString(),
              };
              const artifact = await this.production.create(
                draft,
                a.target,
                signal,
              );
              const preview = await this.production.preview(
                artifact,
                a.timeSeconds,
                signal,
              );
              job.comparisons.push({
                name: variant.name,
                artifactId: artifact.id,
                ...preview,
              });
              job.progress = `비교 미리보기 ${job.comparisons.length}/${variants.length + 1}`;
              await this.repo.saveJob(job);
            }
          });
        const result = {
          saved: false,
          variants: variants.map((v) => ({
            ...v,
            changes: recipeDiff(p.recipe, v.recipe),
          })),
          projects: [] as Project[],
        };
        if (a.save) {
          if (!this.repo.saveBatch)
            throw new AppError(
              "UNAVAILABLE",
              "Atomic batch persistence is unavailable",
            );
          result.projects = variants.map((v) => ({
            id: this.uuid(),
            name: v.name,
            recipe: v.recipe,
            revision: 1,
            updatedAt: new Date().toISOString(),
          }));
          await this.repo.saveBatch(result.projects);
          result.saved = true;
        }
        return result;
      }
      case "performance_start": {
        if (!this.production.profile)
          throw new AppError("UNAVAILABLE", "Runtime profiling is unavailable");
        const artifact = await this.repo.artifact(a.artifactId);
        return this.start(command, async (signal, job) => {
          job.artifactId = artifact.id;
          job.profileReport = await this.production.profile!(
            artifact,
            a.frames,
            signal,
          );
        });
      }
      case "assets_list":
        return this.assets?.list() ?? [];
      case "asset_import": {
        if (!this.assets)
          throw new AppError("UNAVAILABLE", "Asset storage unavailable");
        return this.assets.import(a.name, a.dataBase64);
      }
      case "capabilities_get":
        return this.capabilities();
      case "presets_list":
        return [...presets, ...(await this.repo.presets())];
      case "preset_save": {
        const p = await this.snapshot(a.projectId, a.expectedRevision);
        const recipe = recipeSchema.parse(p.recipe);
        await this.validateAssets(recipe);
        const preset: UserPreset = {
          id: this.uuid(),
          name: a.name,
          description: "내가 저장한 효과",
          group: "user",
          recipe,
          createdAt: new Date().toISOString(),
        };
        await this.repo.savePreset(preset);
        return preset;
      }
      case "preset_delete":
        await this.repo.deletePreset(a.presetId);
        return { deleted: true };
      case "projects_list":
        return this.repo.projects();
      case "project_create": {
        const preset = [...presets, ...(await this.repo.presets())].find(
          (p) => p.id === a.presetId,
        );
        if (!preset)
          throw new AppError("NOT_FOUND", "프리셋을 찾을 수 없습니다.");
        const recipe = recipeSchema.parse(preset.recipe);
        await this.validateAssets(recipe);
        const p: Project = {
          id: this.uuid(),
          name: a.name,
          revision: 1,
          recipe,
          updatedAt: new Date().toISOString(),
        };
        await this.repo.save(p);
        return p;
      }
      case "project_get":
        return this.repo.project(a.projectId);
      case "project_duplicate": {
        const source = await this.snapshot(a.projectId, a.expectedRevision);
        const recipe = recipeSchema.parse(source.recipe);
        await this.validateAssets(recipe);
        const p: Project = {
          id: this.uuid(),
          name: a.name,
          recipe,
          revision: 1,
          updatedAt: new Date().toISOString(),
        };
        await this.repo.save(p);
        return p;
      }
      case "project_history": {
        const p = await this.repo.project(a.projectId);
        const history = await this.repo.history(p.id);
        return {
          currentRevision: p.revision,
          limit: 30,
          entries: history.reverse(),
        };
      }
      case "project_restore": {
        const p = await this.snapshot(a.projectId, a.expectedRevision);
        const snapshot = (await this.repo.history(p.id)).find(
          (h) => h.revision === a.revision,
        );
        if (!snapshot)
          throw new AppError(
            "NOT_FOUND",
            "보관된 저장 이력을 찾을 수 없습니다.",
          );
        return this.replace(
          p,
          recipeSchema.parse(snapshot.recipe),
          snapshot.name,
        );
      }
      case "project_update": {
        const p = await this.snapshot(a.projectId, a.expectedRevision);
        return this.replace(p, a.recipe, a.name ?? p.name);
      }
      case "code_generate":
      case "preview_start": {
        const p = await this.snapshot(a.projectId, a.expectedRevision);
        return this.start(command, async (signal, job) => {
          const artifact = await this.production.create(p, a.target, signal);
          job.artifactId = artifact.id;
          if (command === "preview_start") {
            job.progress = "대상 런타임을 빌드하고 있습니다";
            await this.repo.saveJob(job);
            Object.assign(
              job,
              await this.production.preview(artifact, a.timeSeconds, signal),
            );
          }
        });
      }
      case "code_validate": {
        const artifact = await this.repo.artifact(a.artifactId);
        return this.start(command, async (signal, job) => {
          job.artifactId = artifact.id;
          await this.production.validate(artifact, signal);
        });
      }
      case "job_get": {
        const job =
          this.running.get(a.jobId) ??
          (await this.repo.jobs()).find((j) => j.id === a.jobId);
        if (!job) throw new AppError("NOT_FOUND", "Job not found");
        return structuredClone(job);
      }
      case "job_cancel":
        this.controllers.get(a.jobId)?.abort();
        return { requested: this.controllers.has(a.jobId) };
      case "artifact_get":
        return a.file
          ? {
              file: a.file,
              source: await this.repo.source(a.artifactId, a.file),
            }
          : this.repo.artifact(a.artifactId);
    }
  }
  async shutdown() {
    for (const controller of this.controllers.values()) controller.abort();
    for (let n = 0; n < 50 && this.running.size; n++)
      await new Promise((r) => setTimeout(r, 100));
  }
  private async start(
    kind: string,
    work: (signal: AbortSignal, job: Job) => Promise<void>,
  ) {
    if (this.controllers.size >= 3)
      throw new AppError(
        "LIMIT_EXCEEDED",
        "작업 3개가 진행 중입니다. 완료 후 다시 시도하세요.",
      );
    const job: Job = {
      id: this.uuid(),
      kind,
      status: "queued",
      progress: "작업 대기",
    };
    const controller = new AbortController();
    this.controllers.set(job.id, controller);
    this.running.set(job.id, job);
    await this.repo.saveJob(job);
    void (async () => {
      try {
        job.status = "running";
        job.progress = "코드 생성·검증 중";
        await this.repo.saveJob(job);
        await work(controller.signal, job);
        controller.signal.throwIfAborted();
        job.status = "succeeded";
        job.progress = "완료";
      } catch (error) {
        job.status = controller.signal.aborted ? "cancelled" : "failed";
        job.progress = job.status === "cancelled" ? "취소됨" : "실패";
        job.error = errorResult(error);
      } finally {
        this.controllers.delete(job.id);
        await this.repo.saveJob(job);
        this.running.delete(job.id);
      }
    })().catch(() => {
      this.controllers.delete(job.id);
      this.running.delete(job.id);
    });
    return { jobId: job.id };
  }
}
