import { chromium } from "playwright";
import { AppError } from "../../packages/core/model.js";
import {
  assetIds,
  duration,
  type Recipe,
} from "../../runtimes/shared/motion.js";

export interface TimingStats {
  mean: number;
  p50: number;
  p95: number;
  max: number;
}
export interface ProfileReport {
  measurement: {
    environment: string;
    frames: number;
    warmupFrames: number;
    elapsedMs: number;
    frameIntervalMs: TimingStats;
    seekSubmissionMs: TimingStats;
    observedFramesPerSecond: number;
    overBudgetFrames: number;
    frameBudgetMs: number;
    visibilityState: string;
  };
  estimates: {
    viewportTextureBytes: number;
    viewportTextureAssumption: string;
    imageAssetCount: number;
    sourceParticleCount: number;
    qualityParticleBudget: number;
    requestedInstances: number;
    requestedParticleInstances: number;
    actualTextureBytes: null;
  };
  runtime: unknown;
  limitations: string[];
}
export function timingStats(values: number[]): TimingStats {
  if (!values.length || values.some((v) => !Number.isFinite(v) || v < 0))
    throw new AppError(
      "INVALID_METRIC",
      "Timing samples must be finite and nonnegative",
    );
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
  return {
    mean: values.reduce((sum, v) => sum + v, 0) / values.length,
    p50: at(0.5),
    p95: at(0.95),
    max: sorted.at(-1)!,
  };
}
/** Measured RAF intervals and synchronous render submission, not invented GPU timing or device FPS. */
export async function measurePreview(options: {
  url: string;
  recipe: Recipe;
  frames?: number;
  signal?: AbortSignal;
}): Promise<ProfileReport> {
  const frames = options.frames ?? 120;
  if (!Number.isInteger(frames) || frames < 30 || frames > 600)
    throw new AppError(
      "INVALID_PROFILE",
      "frames must be an integer from 30 to 600",
    );
  const url = new URL(options.url);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname)
  )
    throw new AppError(
      "INVALID_PROFILE",
      "Profiling only accepts a local preview URL",
    );
  options.signal?.throwIfAborted();
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const abort = () => void browser.close();
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    // Cancellation may arrive while launch is awaiting, before the listener exists.
    options.signal?.throwIfAborted();
    const page = await browser.newPage({
      viewport: { width: options.recipe.width, height: options.recipe.height },
    });
    const errors: string[] = [],
      blocked: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(`HTTP ${response.status()}`);
    });
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === url.origin)
        return route.continue();
      blocked.push(route.request().url());
      return route.abort();
    });
    await page.goto(options.url);
    await page.waitForFunction(
      () => !!(window as any).gametool,
      {},
      { timeout: 60000 },
    );
    const samples = await page.evaluate(
      async ({ frames, total }) => {
        const api = (window as any).gametool;
        api.pause();
        const intervals: number[] = [],
          submissions: number[] = [];
        let previous = 0;
        const started = performance.now();
        for (let i = 0; i < frames + 30; i++) {
          const now = await new Promise<number>((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error("Preview frame timed out")),
              5000,
            );
            requestAnimationFrame((time) => {
              clearTimeout(timeout);
              resolve(time);
            });
          });
          const before = performance.now();
          api.seek((i / 60) % Math.max(total, 0.001));
          const submitted = performance.now() - before;
          if (i >= 30) {
            intervals.push(now - previous);
            submissions.push(submitted);
          }
          previous = now;
        }
        let runtime = typeof api.profile === "function" ? api.profile() : null;
        if (typeof runtime === "string") runtime = JSON.parse(runtime);
        return {
          intervals,
          submissions,
          elapsedMs: performance.now() - started,
          visibilityState: document.visibilityState,
          runtime,
        };
      },
      { frames, total: duration(options.recipe) },
    );
    options.signal?.throwIfAborted();
    if (errors.length || blocked.length)
      throw new AppError(
        "PROFILE_FAILED",
        [
          ...errors,
          ...blocked.map((u) => `Blocked external request: ${u}`),
        ].join("\n"),
      );
    const r = options.recipe,
      studio = r.studio?.enabled ? r.studio : undefined;
    const instances = studio?.quality.instances ?? 1;
    const particleCount =
      (r.particles?.enabled ? r.particles.count : 0) +
      (studio?.nodes
        .filter((n) => n.enabled && n.kind === "particles")
        .reduce((sum, n) => sum + (n.particles?.count ?? 0), 0) ?? 0);
    const frameIntervalMs = timingStats(samples.intervals),
      frameBudgetMs = 1000 / (studio?.quality.fpsTarget ?? 60);
    return {
      measurement: {
        environment: "headless Chromium on this host",
        frames,
        warmupFrames: 30,
        elapsedMs: samples.elapsedMs,
        frameIntervalMs,
        seekSubmissionMs: timingStats(samples.submissions),
        observedFramesPerSecond: 1000 / frameIntervalMs.mean,
        overBudgetFrames: samples.intervals.filter(
          (t) => t > frameBudgetMs * 1.05,
        ).length,
        frameBudgetMs,
        visibilityState: samples.visibilityState,
      },
      estimates: {
        viewportTextureBytes: r.width * r.height * 4,
        viewportTextureAssumption:
          "One shared RGBA8 viewport buffer: stress instances overlap within this buffer. Excludes source images, GPU copies, mipmaps and renderer overhead; not measured allocation.",
        imageAssetCount: assetIds(r).length,
        sourceParticleCount: particleCount,
        qualityParticleBudget: studio?.quality.particleBudget ?? 1000,
        requestedInstances: instances,
        requestedParticleInstances: particleCount * instances,
        actualTextureBytes: null,
      },
      runtime: samples.runtime,
      limitations: [
        "RAF intervals include browser scheduling; these are not GPU render times or a mobile-device benchmark.",
        "seekSubmissionMs measures synchronous API submission only; asynchronous paint and GPU work can occur later.",
        "Particle and texture figures are analytic estimates, not measured GPU memory or live particle counts.",
        "Profile invokes silent absolute-time seeks; event/audio host handlers are excluded.",
      ],
    };
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await browser.close();
  }
}
