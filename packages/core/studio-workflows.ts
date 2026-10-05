import { AppError } from "./model.js";
import type { Target } from "./model.js";
import type { Artifact } from "./application.js";

export interface IntegrationFile {
  path: string;
  action: "create" | "update" | "delete" | "unchanged";
  bytes: number;
}
export interface IntegrationPlan {
  planId: string;
  expectedHash: string;
  rootId: string;
  effectId: string;
  target: Target;
  files: IntegrationFile[];
  warnings: string[];
}
export interface IntegrationResult {
  applied: true;
  planId: string;
  rootId: string;
  effectId: string;
  target: Target;
  files: IntegrationFile[];
}
export interface IntegrationPort {
  roots(): Promise<{ id: string; name: string }[]>;
  plan(
    artifact: Artifact,
    rootId: string,
    effectId: string,
  ): Promise<IntegrationPlan>;
  apply(planId: string, expectedHash: string): Promise<IntegrationResult>;
}

export interface VariantInput {
  name: string;
  patch: Record<string, unknown>;
}
export interface RecipeDifference {
  path: string;
  kind: "add" | "remove" | "change";
  before?: unknown;
  after?: unknown;
}
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
function safeJson(value: unknown, depth = 0): void {
  if (depth > 40)
    throw new AppError("INVALID_PATCH", "Patch nesting exceeds 40 levels");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (typeof value !== "object")
    throw new AppError(
      "INVALID_PATCH",
      "Patches must contain finite JSON values",
    );
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new AppError("INVALID_PATCH", "Only plain objects are accepted");
  for (const key of Object.keys(value)) {
    if (forbidden.has(key))
      throw new AppError("INVALID_PATCH", `Unsafe property: ${key}`);
    safeJson((value as Record<string, unknown>)[key], depth + 1);
  }
}
function merge(base: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch))
    return structuredClone(patch);
  const result: Record<string, unknown> =
    base && typeof base === "object" && !Array.isArray(base)
      ? (structuredClone(base) as Record<string, unknown>)
      : {};
  for (const [key, value] of Object.entries(patch))
    result[key] = merge(result[key], value);
  return result;
}
/** Objects merge recursively; arrays replace in their entirety. Neither input is mutated. */
export function deepPatch<T>(base: T, patch: Record<string, unknown>): T {
  safeJson(base);
  safeJson(patch);
  if (patch === null || Array.isArray(patch) || typeof patch !== "object")
    throw new AppError("INVALID_PATCH", "Patch must be an object");
  return merge(base, patch) as T;
}
/** Pure all-or-nothing validation. Call asset validation on every result before persisting any. */
export function normalizeVariants<T>(
  base: T,
  variants: VariantInput[],
  validate: (value: unknown) => T,
): { name: string; recipe: T }[] {
  if (!variants.length || variants.length > 24)
    throw new AppError("LIMIT_EXCEEDED", "Provide between 1 and 24 variants");
  const names = new Set<string>();
  return variants.map((variant) => {
    const name = variant.name.trim();
    if (!name || name.length > 80 || names.has(name))
      throw new AppError(
        "INVALID_VARIANT",
        "Variant names must be unique and 1–80 characters",
      );
    names.add(name);
    return { name, recipe: validate(deepPatch(base, variant.patch)) };
  });
}
/** Stable JSON-pointer paths; arrays are a single replacement to match patch semantics. */
export function recipeDiff(
  before: unknown,
  after: unknown,
): RecipeDifference[] {
  safeJson(before);
  safeJson(after);
  const result: RecipeDifference[] = [];
  const visit = (a: unknown, b: unknown, path: string): void => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const object = (v: unknown): v is Record<string, unknown> =>
      v !== null && typeof v === "object" && !Array.isArray(v);
    if (object(a) && object(b)) {
      for (const key of [
        ...new Set([...Object.keys(a), ...Object.keys(b)]),
      ].sort()) {
        const next = `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;
        if (!Object.hasOwn(a, key))
          result.push({
            path: next,
            kind: "add",
            after: structuredClone(b[key]),
          });
        else if (!Object.hasOwn(b, key))
          result.push({
            path: next,
            kind: "remove",
            before: structuredClone(a[key]),
          });
        else visit(a[key], b[key], next);
      }
    } else
      result.push({
        path,
        kind: "change",
        before: structuredClone(a),
        after: structuredClone(b),
      });
  };
  visit(before, after, "");
  return result;
}
export function comparisonSamples<T>(
  variants: { name: string; recipe: T }[],
  times: number[],
  sample: (recipe: T, time: number) => unknown,
) {
  if (
    !variants.length ||
    variants.length > 25 ||
    !times.length ||
    times.length > 16 ||
    times.some((t) => !Number.isFinite(t) || t < 0 || t > 3600)
  )
    throw new AppError(
      "LIMIT_EXCEEDED",
      "Compare up to 25 recipes at 1–16 finite times within 0–3600 seconds",
    );
  return variants.map(({ name, recipe }) => ({
    name,
    samples: times.map((time) => ({ time, state: sample(recipe, time) })),
  }));
}
