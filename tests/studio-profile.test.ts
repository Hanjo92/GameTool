import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalProduction } from "../apps/local-service/production.js";
import type {
  measurePreview,
  ProfileReport,
} from "../apps/local-service/profiling.js";
import type { Artifact } from "../packages/core/application.js";
import { defaultRecipe } from "../packages/core/model.js";

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const stats = { mean: 1, p50: 1, p95: 1, max: 1 };
const report: ProfileReport = {
  measurement: {
    environment: "controlled test",
    frames: 30,
    warmupFrames: 30,
    elapsedMs: 60,
    frameIntervalMs: stats,
    seekSubmissionMs: stats,
    observedFramesPerSecond: 60,
    overBudgetFrames: 0,
    frameBudgetMs: 1000 / 60,
    visibilityState: "visible",
  },
  estimates: {
    viewportTextureBytes: 0,
    viewportTextureAssumption: "test",
    imageAssetCount: 0,
    sourceParticleCount: 0,
    qualityParticleBudget: 0,
    requestedInstances: 1,
    requestedParticleInstances: 0,
    actualTextureBytes: null,
  },
  runtime: null,
  limitations: [],
};
async function fixture(measure: typeof measurePreview) {
  const directory = await mkdtemp(join(tmpdir(), "gametool-profile-lock-"));
  await writeFile(
    join(directory, "recipe.json"),
    JSON.stringify(defaultRecipe),
  );
  const artifact: Artifact = {
    id: randomUUID(),
    projectId: randomUUID(),
    revision: 1,
    target: "three",
    directory,
    files: [],
    validation: {},
  };
  const production = new LocalProduction(
    directory,
    () => "http://127.0.0.1:4317",
    measure,
  );
  const internals = production as unknown as {
    compile: (
      artifact: Artifact,
      signal: AbortSignal,
      full: boolean,
    ) => Promise<void>;
    inspect: (...args: unknown[]) => Promise<never>;
  };
  internals.compile = async (_artifact, signal) => signal.throwIfAborted();
  internals.inspect = async () => {
    throw Error(
      "Profile must use its injected measurement, not a second inspector",
    );
  };
  return {
    artifact,
    production,
    internals,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}
async function busy(production: LocalProduction, artifact: Artifact) {
  const signal = new AbortController().signal;
  await Promise.all([
    assert.rejects(production.profile(artifact, 30, signal), {
      code: "ARTIFACT_BUSY",
    }),
    assert.rejects(production.preview(artifact, 0, signal), {
      code: "ARTIFACT_BUSY",
    }),
    assert.rejects(production.validate(artifact, signal), {
      code: "ARTIFACT_BUSY",
    }),
  ]);
}

test(
  "profiling holds the same artifact lock across compilation and measurement, then releases it",
  { timeout: 10000 },
  async () => {
    const compiling = deferred(),
      compiled = deferred(),
      measuring = deferred(),
      measured = deferred<ProfileReport>();
    let compileCalls = 0,
      measurementCalls = 0,
      measurementUrl = "";
    const f = await fixture(async (options) => {
      measurementCalls++;
      measurementUrl = options.url;
      measuring.resolve();
      return measured.promise;
    });
    f.internals.compile = async (_artifact, signal) => {
      compileCalls++;
      compiling.resolve();
      await compiled.promise;
      signal.throwIfAborted();
    };
    try {
      const active = f.production.profile(
        f.artifact,
        30,
        new AbortController().signal,
      );
      await compiling.promise;
      await busy(f.production, f.artifact);
      compiled.resolve();
      await measuring.promise;
      assert.equal(
        measurementUrl,
        `http://127.0.0.1:4317/preview/${f.artifact.id}/`,
      );
      await busy(f.production, f.artifact);
      assert.equal(compileCalls, 1);
      assert.equal(measurementCalls, 1);
      measured.resolve(report);
      assert.equal(await active, report);
      assert.equal(
        await f.production.profile(
          f.artifact,
          30,
          new AbortController().signal,
        ),
        report,
      );
      assert.equal(compileCalls, 2);
      assert.equal(measurementCalls, 2);
    } finally {
      await f.cleanup();
    }
  },
);

test(
  "aborting during measurement releases the artifact lock and permits a new profile",
  { timeout: 10000 },
  async () => {
    const measuring = deferred();
    let calls = 0;
    const f = await fixture(async (options) => {
      if (++calls > 1) return report;
      return new Promise<ProfileReport>((_resolve, reject) => {
        options.signal!.addEventListener(
          "abort",
          () => reject(options.signal!.reason),
          { once: true },
        );
        measuring.resolve();
      });
    });
    try {
      const controller = new AbortController();
      const active = f.production.profile(f.artifact, 30, controller.signal);
      await measuring.promise;
      await busy(f.production, f.artifact);
      const rejected = assert.rejects(active, { name: "AbortError" });
      controller.abort();
      await rejected;
      assert.equal(
        await f.production.profile(
          f.artifact,
          30,
          new AbortController().signal,
        ),
        report,
      );
    } finally {
      await f.cleanup();
    }
  },
);

test(
  "measurement failure releases the artifact lock without hiding the original failure",
  { timeout: 10000 },
  async () => {
    const measuring = deferred(),
      failed = deferred<ProfileReport>();
    let calls = 0;
    const f = await fixture(async () => {
      if (++calls > 1) return report;
      measuring.resolve();
      return failed.promise;
    });
    try {
      const active = f.production.profile(
        f.artifact,
        30,
        new AbortController().signal,
      );
      await measuring.promise;
      await busy(f.production, f.artifact);
      const rejected = assert.rejects(active, /render failed/);
      failed.reject(new Error("render failed"));
      await rejected;
      assert.equal(
        await f.production.profile(
          f.artifact,
          30,
          new AbortController().signal,
        ),
        report,
      );
    } finally {
      await f.cleanup();
    }
  },
);

test("compile cancellation releases the artifact lock before any measurement begins", async () => {
  let measurements = 0;
  const f = await fixture(async () => {
    measurements++;
    return report;
  });
  try {
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      f.production.profile(f.artifact, 30, controller.signal),
      { name: "AbortError" },
    );
    assert.equal(measurements, 0);
    assert.equal(
      await f.production.profile(f.artifact, 30, new AbortController().signal),
      report,
    );
    assert.equal(measurements, 1);
  } finally {
    await f.cleanup();
  }
});

test("cancellation during browser launch closes the browser without starting measurement", async () => {
  const { chromium } = await import("playwright");
  const { measurePreview } = await import("../apps/local-service/profiling.js");
  const controller = new AbortController();
  let closed = 0;
  const launch = mock.method(chromium, "launch", async () => {
    controller.abort();
    return {
      close: async () => {
        closed++;
      },
      newPage: async () => {
        throw Error("Must not open a page after launch was cancelled");
      },
    } as unknown as Awaited<ReturnType<typeof chromium.launch>>;
  });
  try {
    await assert.rejects(
      measurePreview({
        url: "http://127.0.0.1:4317/preview/test/",
        recipe: defaultRecipe,
        frames: 30,
        signal: controller.signal,
      }),
      { name: "AbortError" },
    );
    assert.equal(closed, 1);
  } finally {
    launch.mock.restore();
  }
});
