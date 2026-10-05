import { $, field } from "./dom.js";
import type { Recipe } from "../../runtimes/shared/motion.js";
import type { Project, Target } from "../../packages/core/model.js";
import type { Artifact } from "../../packages/core/application.js";

interface Context {
  api(command: string, input?: unknown): Promise<any>;
  run(work: () => Promise<void>): void;
  save(): Promise<void>;
  project(): Project;
  target(): Target;
  artifact(): Promise<Artifact>;
  wait(id: string): Promise<any>;
  status(text: string, error?: boolean): void;
  refreshProjects(): Promise<void>;
}
interface Variant {
  name: string;
  color: string;
  scale: number;
  count: number;
  advanced: string;
}
const variants: Variant[] = [
  { name: "희귀 · 청록", color: "#71e5ed", scale: 1, count: 80, advanced: "" },
  {
    name: "전설 · 금빛",
    color: "#ffcd70",
    scale: 1.2,
    count: 160,
    advanced: "",
  },
];
function btn(text: string, fn: () => void) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = text;
  b.onclick = fn;
  return b;
}
function input(
  label: string,
  type: string,
  current: string | number,
  onchange: (value: string) => void,
) {
  const l = document.createElement("label");
  l.className = "field";
  l.textContent = label;
  const i = document.createElement("input");
  i.type = type;
  i.value = String(current);
  if (type === "number") {
    i.step = "any";
    i.min = "0";
  }
  i.onchange = () => onchange(i.value);
  l.append(i);
  return l;
}
function show(id: string, data: unknown) {
  $(id).textContent =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);
}
export function setupStudioWorkflows(ctx: Context) {
  const panel = document.createElement("details");
  panel.id = "studio-workflows";
  panel.className = "code-panel studio-workflows";
  panel.innerHTML = `<summary>변형 제작 · 비교 · 게임 연결 <span>배치 / 통합 계획 / 성능 측정</span></summary><div class="studio-workflow-body"><details open class="studio-section"><summary>색상 · 크기 · 희귀도 변형</summary><p class="hint">현재 프로젝트를 저장한 뒤 변형을 계산합니다. 배열을 포함한 고급 패치는 전체 배열을 교체합니다.</p><div id="studio-variants"></div><div class="studio-workflow-actions"><button type="button" id="variant-add">＋ 변형 추가</button><button type="button" id="variant-check">변경 내용 검토</button><button type="button" id="variant-save">모든 변형을 새 프로젝트로 저장</button></div><pre id="variant-result" class="studio-result" aria-live="polite">변형을 계산하면 변경점이 표시됩니다.</pre><div class="studio-workflow-actions"><label class="field">비교 시점 (초)<input id="comparison-time" type="number" min="0" max="120" value="0.6" step="0.1"/></label><button type="button" id="variant-compare">실제 런타임 나란히 비교</button><button type="button" id="variant-numbers">수치 비교</button></div><p class="hint">화면 비교는 최대 6개 변형을 실제로 생성합니다. Flutter는 빌드 시간이 필요합니다.</p><div id="studio-comparison" class="studio-comparison"></div></details><details class="studio-section"><summary>게임 프로젝트에 연결</summary><p class="hint">등록된 로컬 프로젝트에 생성 파일을 배치합니다. 파일 변경 계획을 확인한 뒤 적용하세요. 직접 수정한 생성 파일은 덮어쓰지 않습니다.</p><label class="field">연결 대상<select id="integration-root"><option value="">등록 대상 확인 필요</option></select></label><p id="integration-root-info" class="hint"></p><label class="field">효과 ID<input id="integration-effect" value="game-ui" pattern="[a-z0-9][a-z0-9_\\-]{0,63}" maxlength="64"/></label><div class="studio-workflow-actions"><button type="button" id="integration-roots">등록 대상 새로고침</button><button type="button" id="integration-plan">파일 변경 계획 보기</button><button type="button" id="integration-apply" disabled>검토한 계획 적용</button></div><pre id="integration-result" class="studio-result" aria-live="polite">계획을 생성하면 경로·파일 변경·의존성 안내를 표시합니다.</pre></details><details class="studio-section"><summary>성능 · 품질 점검</summary><p class="hint">저장된 품질·입자 예산·동시 인스턴스 설정으로 생성 런타임을 측정합니다. CPU 측정과 계산된 입자·텍스처 추정치를 구분해서 표시합니다.</p><div class="studio-workflow-actions"><label class="field">측정 프레임<input id="profile-frames" type="number" min="30" max="600" value="120" step="30"/></label><button type="button" id="profile-run">성능 측정 실행</button></div><pre id="profile-result" class="studio-result" aria-live="polite">측정 결과 대기</pre></details></div>`;
  document.querySelector(".stage-column")!.append(panel);
  let plan: { planId: string; expectedHash: string } | undefined;
  const invalidatePlan = () => {
    plan = undefined;
    $<HTMLButtonElement>("integration-apply").disabled = true;
  };
  $("properties").addEventListener("input", invalidatePlan);
  window.addEventListener("gametool-project-loaded", invalidatePlan);
  window.addEventListener("gametool-target-changed", invalidatePlan);
  $("integration-root").addEventListener("change", invalidatePlan);
  $("integration-effect").addEventListener("input", invalidatePlan);
  const renderVariants = () => {
    const root = $("studio-variants");
    root.replaceChildren();
    variants.forEach((v, i) => {
      const card = document.createElement("div");
      card.className = "studio-variant";
      const row = document.createElement("div");
      row.className = "studio-row";
      row.append(
        input("변형 이름", "text", v.name, (next) => (v.name = next)),
        input("색상", "color", v.color, (next) => (v.color = next)),
        input(
          "크기 배율",
          "number",
          v.scale,
          (next) => (v.scale = Number(next)),
        ),
        input("입자 수", "number", v.count, (next) => (v.count = Number(next))),
        btn("삭제", () => {
          variants.splice(i, 1);
          renderVariants();
        }),
      );
      const advanced = document.createElement("details");
      advanced.className = "studio-section";
      advanced.append(document.createElement("summary"));
      advanced.firstElementChild!.textContent = "고급 레시피 패치 JSON";
      const t = document.createElement("textarea");
      t.rows = 3;
      t.value = v.advanced;
      t.placeholder = '예: {"studio":{"quality":{"level":"low"}}}';
      t.setAttribute("aria-label", `${v.name} 고급 패치`);
      t.oninput = () => (v.advanced = t.value);
      advanced.append(t);
      card.append(row, advanced);
      root.append(card);
    });
  };
  const patchVariants = (recipe: Recipe) =>
    variants.map((v) => {
      if (
        !v.name.trim() ||
        !Number.isFinite(v.scale) ||
        v.scale <= 0 ||
        !Number.isInteger(v.count) ||
        v.count < 0
      )
        throw new Error(
          "변형 이름, 양수 크기 배율, 정수 입자 수를 확인하세요.",
        );
      let patch: Record<string, unknown> = {
        color: v.color,
        fontSize: Math.round(recipe.fontSize * v.scale),
        particles: { color: v.color, count: v.count },
      };
      if (recipe.studio)
        patch.studio = {
          nodes: recipe.studio.nodes.map((n) => ({
            ...n,
            color: v.color,
            scale: n.scale * v.scale,
            ...(n.particles
              ? {
                  particles: { ...n.particles, color: v.color, count: v.count },
                }
              : {}),
            ...(n.widget ? { widget: { ...n.widget, fill: v.color } } : {}),
          })),
        };
      if (v.advanced.trim()) {
        const parsed = JSON.parse(v.advanced);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
          throw new Error("고급 패치는 JSON 객체여야 합니다.");
        patch = merge(patch, parsed);
      }
      return { name: v.name, patch };
    });
  const ref = () => ({
    projectId: ctx.project().id,
    expectedRevision: ctx.project().revision,
  });
  const calculate = (save: boolean) =>
    ctx.run(async () => {
      await ctx.save();
      const result = await ctx.api("studio_variants", {
        ...ref(),
        variants: patchVariants(ctx.project().recipe),
        save,
      });
      show("variant-result", result);
      if (save) await ctx.refreshProjects();
      ctx.status(
        save
          ? "변형을 새 프로젝트로 저장했습니다."
          : "변형 변경 내용을 계산했습니다.",
      );
    });
  $("variant-add").onclick = () => {
    if (variants.length >= 24) return;
    variants.push({
      name: `변형 ${variants.length + 1}`,
      color: "#c6fa73",
      scale: 1,
      count: 80,
      advanced: "",
    });
    renderVariants();
  };
  $("variant-check").onclick = () => calculate(false);
  $("variant-save").onclick = () => calculate(true);
  $("variant-numbers").onclick = () =>
    ctx.run(async () => {
      await ctx.save();
      show(
        "variant-result",
        await ctx.api("studio_compare", {
          ...ref(),
          variants: patchVariants(ctx.project().recipe),
          times: [0, Number(field("comparison-time").value)],
        }),
      );
      ctx.status("수치 비교 완료. 렌더링 화면은 나란히 비교에서 확인하세요.");
    });
  $("variant-compare").onclick = () =>
    ctx.run(async () => {
      await ctx.save();
      const variantsInput = patchVariants(ctx.project().recipe);
      if (!variantsInput.length || variantsInput.length > 6)
        throw new Error("화면 비교는 1~6개 변형을 지원합니다.");
      const time = Number(field("comparison-time").value);
      const started = await ctx.api("studio_comparison_start", {
        ...ref(),
        variants: variantsInput,
        target: ctx.target(),
        timeSeconds: time,
      });
      const job = await ctx.wait(started.jobId);
      const root = $("studio-comparison");
      root.replaceChildren();
      for (const result of job.comparisons ?? []) {
        const card = document.createElement("figure");
        const caption = document.createElement("figcaption");
        caption.textContent = result.name;
        const frame = document.createElement("iframe");
        frame.title = `${result.name} 실제 런타임 비교`;
        frame.src = result.previewUrl;
        frame.onload = () => {
          let count = 0;
          const timer = setInterval(() => {
            const runtime = (frame.contentWindow as any)?.gametool;
            if (runtime) {
              runtime.pause();
              runtime.seek(time);
              clearInterval(timer);
            } else if (++count > 1200) clearInterval(timer);
          }, 50);
        };
        card.append(caption, frame);
        root.append(card);
      }
      ctx.status(
        `${job.comparisons?.length ?? 0}개 실제 런타임 비교가 준비되었습니다.`,
      );
    });
  const roots = async () => {
    const result = await ctx.api("integration_roots");
    const select = $<HTMLSelectElement>("integration-root");
    select.replaceChildren(
      ...result.roots.map((r: any) => new Option(r.name, r.id)),
    );
    if (!result.roots.length)
      select.add(new Option("등록된 게임 프로젝트 없음", ""));
    $("integration-root-info").textContent = result.roots.length
      ? "선택한 대상의 gametool-effects 하위에 생성 파일을 배치합니다."
      : "서비스를 --integration-root /게임/프로젝트/경로 옵션으로 시작하면 대상이 표시됩니다.";
    invalidatePlan();
  };
  $("integration-roots").onclick = () => ctx.run(roots);
  $("integration-plan").onclick = () =>
    ctx.run(async () => {
      invalidatePlan();
      if (!field("integration-root").value) {
        await roots();
        if (!field("integration-root").value)
          throw new Error(
            "먼저 서비스 시작 옵션 --integration-root 로 로컬 게임 프로젝트를 등록하세요.",
          );
      }
      const artifact = await ctx.artifact();
      const result = await ctx.api("integration_plan", {
        artifactId: artifact.id,
        rootId: field("integration-root").value,
        effectId: field("integration-effect").value,
      });
      plan = { planId: result.planId, expectedHash: result.expectedHash };
      show("integration-result", result);
      $<HTMLButtonElement>("integration-apply").disabled = false;
      ctx.status("파일 변경 계획을 확인한 뒤 계획 적용을 누르세요.");
    });
  $("integration-apply").onclick = () =>
    ctx.run(async () => {
      if (!plan) throw new Error("파일 변경 계획을 먼저 생성하세요.");
      const result = await ctx.api("integration_apply", plan);
      show("integration-result", result);
      invalidatePlan();
      ctx.status("검토한 생성 파일을 게임 프로젝트에 배치했습니다.");
    });
  $("profile-run").onclick = () =>
    ctx.run(async () => {
      const artifact = await ctx.artifact();
      const started = await ctx.api("performance_start", {
        artifactId: artifact.id,
        frames: Number(field("profile-frames").value),
      });
      const job = await ctx.wait(started.jobId);
      show("profile-result", job.profileReport);
      ctx.status("실제 런타임 성능 측정이 완료되었습니다.");
    });
  renderVariants();
}
/** Advanced patches have the same object-recursive, array-replacement semantics as the core. */
function merge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (["__proto__", "constructor", "prototype"].includes(key))
      throw new Error("예약된 패치 키는 사용할 수 없습니다.");
    result[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? merge(
            result[key] &&
              typeof result[key] === "object" &&
              !Array.isArray(result[key])
              ? (result[key] as Record<string, unknown>)
              : {},
            value as Record<string, unknown>,
          )
        : value;
  }
  return result;
}
