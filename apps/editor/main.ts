import { $, field } from "./dom.js";
import { buildControls } from "./controls.js";
import { setupInspector } from "./inspector.js";
import { readRecipe, fill, timeline } from "./recipe-form.js";
import { particleStyles } from "../../runtimes/shared/particle-options.js";
import { timelineFor, precise } from "../../runtimes/shared/sequence.js";
import {
  stylePresets,
  gradientPresets,
} from "../../packages/core/reference-presets.js";
import { defaultLayout } from "../../runtimes/shared/options.js";
import "./style.css";
import {
  duration,
  defaultTypography,
  defaultParticles,
  type Recipe,
} from "../../runtimes/shared/motion.js";
import type {
  Project,
  ProjectSnapshot,
  Target,
} from "../../packages/core/model.js";
import type { Artifact } from "../../packages/core/application.js";
buildControls();
setupInspector();
let token = "",
  project: Project,
  target: Target = "phaser",
  artifact: Artifact | undefined,
  jobId = "",
  busy = false,
  dirty = false,
  playing = false;
let previewSnapshot:
  | { projectId: string; revision: number; target: Target }
  | undefined;
function updateEditorState() {
  $("save-state").textContent = dirty
    ? "미저장 변경"
    : project
      ? `저장됨 · REV ${project.revision}`
      : "연결 중";
  $("save-state").classList.toggle("unsaved", dirty);
  const fresh =
    !!project &&
    !dirty &&
    previewSnapshot?.projectId === project.id &&
    previewSnapshot.revision === project.revision &&
    previewSnapshot.target === target;
  $("preview-state").textContent = busy
    ? "준비 중…"
    : fresh
      ? "최신 미리보기"
      : "적용 필요";
  $("preview-state").classList.toggle("stale", !fresh);
  $("preview-revision").textContent = previewSnapshot
    ? `· REV ${previewSnapshot.revision}${fresh ? "" : " · 이전 설정"}`
    : "";
}
function setDirty(value: boolean) {
  dirty = value;
  updateEditorState();
}
interface EditorPreset {
  id: string;
  name: string;
  description: string;
  group?: string;
  recipe: Recipe;
}
let presets: EditorPreset[] = [];
const iframe = $<HTMLIFrameElement>("preview");
const message = (value: unknown) =>
  iframe.contentWindow?.postMessage(value, location.origin);
function status(text: string, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}
async function api(command: string, input: unknown = {}) {
  const response = await fetch("/api/command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ command, input }),
  });
  const data = await response.json();
  if (data.error) throw new Error(`${data.error.code}: ${data.error.message}`);
  return data.result;
}
function guard(work: () => Promise<void>) {
  void work().catch((e) => status(e.message, true));
}
function setBusy(value: boolean) {
  busy = value;
  updateEditorState();
  $("properties").setAttribute("aria-busy", String(value));
  for (const el of document.querySelectorAll<
    | HTMLInputElement
    | HTMLButtonElement
    | HTMLSelectElement
    | HTMLTextAreaElement
  >(
    "#properties button,#properties input,#properties select,#properties textarea,#projects,#project-name,#new-project,#project-tools button,#project-tools input,#project-tools select,#preset-keep-text,.target-tabs button,.preset,#apply,#generate,#settings-reset",
  ))
    el.disabled = value;
  $("cancel").hidden = !value;
  field("restore-project").disabled = value || !field("project-history").value;
  field("delete-preset").disabled = value || !field("user-presets").value;
  field("validate").disabled = value || !artifact;
  field("download").disabled = value || !artifact;
}
async function refreshProjects() {
  const items: Project[] = await api("projects_list");
  const select = $<HTMLSelectElement>("projects");
  select.replaceChildren(...items.map((p) => new Option(p.name, p.id)));
  if (project) {
    select.value = project.id;
    await refreshHistory();
  }
}
function load(p: Project) {
  project = p;
  fill(p.recipe);
  field("project-name").value = p.name;
  setDirty(false);
  localStorage.setItem("gametool-project", p.id);
}
async function save() {
  if (dirty) {
    project = await api("project_update", {
      projectId: project.id,
      expectedRevision: project.revision,
      recipe: readRecipe(),
      name: field("project-name").value,
    });
    setDirty(false);
    await refreshProjects();
  }
}
async function waitJob(id: string) {
  jobId = id;
  for (;;) {
    const j = await api("job_get", { jobId: id });
    status(j.progress);
    if (j.status === "succeeded") return j;
    if (["failed", "cancelled", "interrupted"].includes(j.status))
      throw new Error(j.error?.message ?? j.progress);
    await new Promise((r) => setTimeout(r, 500));
  }
}
async function showArtifact(id: string) {
  artifact = await api("artifact_get", { artifactId: id });
  const a = artifact!;
  const select = $<HTMLSelectElement>("files");
  select.replaceChildren(
    ...a.files
      .filter((f) => !/\.(ttf|png|jpg|jpeg|webp)$/.test(f))
      .map((f) => new Option(f, f)),
  );
  select.value = target === "flutter" ? "lib/effect.dart" : "src/effect.ts";
  select.disabled = false;
  await source();
  $("validation").textContent =
    (a.validation as any).status === "passed"
      ? "실행 검증 통과"
      : "생성 완료 · 실행 미검증";
  $("artifact-info").textContent =
    `${a.target} · revision ${a.revision} · ${a.files.length} files`;
}
async function source() {
  if (!artifact) return;
  const result = await api("artifact_get", {
    artifactId: artifact.id,
    file: field("files").value,
  });
  $("code").textContent = result.source;
}
async function mountPreview(url: string, time: number) {
  await new Promise<void>((resolve, reject) => {
    let loaded = false;
    const cleanup = () => {
      clearInterval(poll);
      clearTimeout(timeout);
      iframe.removeEventListener("load", onLoad);
    };
    const onLoad = () => {
      loaded = true;
    };
    iframe.addEventListener("load", onLoad);
    const timeout = setTimeout(() => {
      cleanup();
      reject(
        new Error("미리보기 런타임을 준비하지 못했습니다. 다시 적용하세요."),
      );
    }, 60000);
    const poll = setInterval(() => {
      if (!loaded) return;
      const api = (iframe.contentWindow as any)?.gametool;
      if (!api) return;
      cleanup();
      api.pause();
      api.seek(time);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }, 50);
    iframe.src = url;
  });
}
async function produce(preview: boolean) {
  if (busy) return;
  setBusy(true);
  try {
    await save();
    await refreshHistory();
    const previewTime = precise(project.recipe)
      ? project.recipe.sequence?.reveal === "scroll"
        ? duration(project.recipe) / 2
        : timelineFor(project.recipe).pages[0].inEnd +
          Math.min(0.1, project.recipe.hold)
      : project.recipe.enter;
    status(
      preview ? "생성 코드로 미리보기 준비 중…" : "코드를 생성하고 있습니다…",
    );
    if (preview) {
      iframe.style.visibility = "hidden";
      $("placeholder").hidden = false;
      $("placeholder").querySelector("p")!.textContent =
        target === "flutter"
          ? "Flutter 앱을 빌드하고 있어요. 잠시 기다려 주세요."
          : "생성 코드를 실행하고 있어요";
    }
    const { jobId } = await api(preview ? "preview_start" : "code_generate", {
      projectId: project.id,
      expectedRevision: project.revision,
      target,
      ...(preview ? { timeSeconds: previewTime } : {}),
    });
    const job = await waitJob(jobId);
    await showArtifact(job.artifactId);
    if (preview) {
      status("미리보기 화면을 준비하고 있습니다…");
      await mountPreview(job.previewUrl, previewTime);
      iframe.style.visibility = "visible";
      $("placeholder").hidden = true;
      previewSnapshot = {
        projectId: project.id,
        revision: project.revision,
        target,
      };
      updateEditorState();
      playing = false;
      $("play").textContent = "▶";
      $("play").setAttribute("aria-label", "재생");
    }
    status(
      preview
        ? "생성한 코드를 실제 런타임에서 실행 중입니다."
        : "코드 패키지가 준비되었습니다.",
    );
  } finally {
    jobId = "";
    setBusy(false);
  }
}
$("properties").addEventListener("submit", (e) => e.preventDefault());
$("properties").addEventListener("input", () => {
  setDirty(true);
  timeline(readRecipe());
  status("변경 사항이 있습니다. 적용하면 저장 후 미리보기를 갱신합니다.");
});
$("project-name").addEventListener("input", () => {
  setDirty(true);
});
$("apply").onclick = () => guard(() => produce(true));
$("generate").onclick = () => {
  $<HTMLDetailsElement>("code-panel").open = true;
  guard(() => produce(false));
};
$("cancel").onclick = () =>
  guard(async () => {
    if (jobId) await api("job_cancel", { jobId });
  });
$("files").onchange = () => guard(source);
$("projects").onchange = () =>
  guard(async () => {
    const selected = field("projects").value;
    await save();
    load(await api("project_get", { projectId: selected }));
    field("projects").value = selected;
    await produce(true);
  });
$("new-project").onclick = () =>
  guard(async () => {
    await save();
    load(
      await api("project_create", {
        name: `모션 ${new Date().toLocaleTimeString("ko-KR")}`,
        presetId: "battle",
      }),
    );
    await refreshProjects();
    await produce(true);
  });
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-target]",
))
  button.onclick = () =>
    guard(async () => {
      target = button.dataset.target as Target;
      document
        .querySelectorAll("[data-target]")
        .forEach((el) => el.classList.toggle("active", el === button));
      $("runtime-badge").textContent =
        target === "flutter"
          ? "FLUTTER · DART"
          : target === "phaser"
            ? "PHASER · 3.90"
            : "THREE.JS · WEBGL";
      await produce(true);
    });
$("play").onclick = () => {
  playing = !playing;
  message({ type: playing ? "play" : "pause" });
  $("play").textContent = playing ? "Ⅱ" : "▶";
  $("play").setAttribute("aria-label", playing ? "일시 정지" : "재생");
};
$("restart").onclick = () => {
  message({ type: "seek", time: 0 });
};
field("scrub").oninput = () => {
  playing = false;
  $("play").textContent = "▶";
  $("play").setAttribute("aria-label", "재생");
  message({ type: "pause" });
  message({ type: "seek", time: +field("scrub").value });
};
window.addEventListener("message", (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== iframe.contentWindow ||
    event.data?.type !== "gametool-state"
  )
    return;
  const time = Number(event.data.state.time);
  if (!Number.isFinite(time)) return;
  field("scrub").value = String(time);
  $("time").textContent =
    `${time.toFixed(2)} / ${duration(project.recipe).toFixed(2)}s`;
});
$("validate").onclick = () =>
  guard(async () => {
    if (!artifact || busy) return;
    setBusy(true);
    try {
      const { jobId } = await api("code_validate", { artifactId: artifact.id });
      await waitJob(jobId);
      await showArtifact(artifact.id);
      status("정적 분석 · 빌드 · 실제 실행 · 타임라인 검증을 통과했습니다.");
    } finally {
      jobId = "";
      setBusy(false);
    }
  });
$("download").onclick = () =>
  guard(async () => {
    if (!artifact) return;
    const response = await fetch(`/api/download/${artifact.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error("다운로드 실패");
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = `gametool-${artifact.target}-${artifact.id.slice(0, 8)}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
guard(async () => {
  token = (await (await fetch("/api/session")).json()).token;
  await refreshAssets();
  await refreshPresets();
  const projects: Project[] = await api("projects_list");
  load(
    projects.find((p) => p.id === localStorage.getItem("gametool-project")) ??
      projects[0] ??
      (await api("project_create", {
        name: "전투 시작 타이틀",
        presetId: "battle",
      })),
  );
  await refreshProjects();
  await produce(true);
});

async function refreshAssets() {
  const allAssets = await api("assets_list"),
    assets = allAssets.filter((a: any) => a.kind !== "font");
  const caps = await api("capabilities_get");
  for (const key of ["font", "subFont"]) {
    const el = $<HTMLSelectElement>(`layout-${key}`),
      selected = el.value;
    el.replaceChildren(
      ...(key === "subFont" ? [new Option("메인과 같음", "same")] : []),
      new Option("기존 스타일", "auto"),
      new Option("명조", "serif"),
      new Option("고딕", "sans"),
      ...(caps.fonts ?? []).map(
        (f: any) => new Option(`${f.family} · ${f.category}`, f.id),
      ),
      ...allAssets
        .filter((a: any) => a.kind === "font")
        .map((a: any) => new Option(`${a.name} · 내 폰트`, a.id)),
    );
    if (selected.startsWith("local:"))
      el.add(new Option(selected.slice(6) + " · 설치 폰트", selected));
    el.value = selected;
  }
  for (const group of ["background", "image", "sequence"]) {
    const el = $<HTMLSelectElement>(
        group === "sequence" ? "background-assetIds" : `${group}-assetId`,
      ),
      selected = Array.from(el.selectedOptions).map((o) => o.value);
    el.replaceChildren(
      ...(group === "sequence"
        ? []
        : [
            new Option(
              group === "background" ? "선택 없음 · 색상 배경" : "선택 없음",
              "",
            ),
          ]),
      ...assets.map(
        (a: any) => new Option(`${a.name} · ${a.width}×${a.height}`, a.id),
      ),
    );
    const options = Array.from(el.options);
    if (group === "sequence")
      el.replaceChildren(
        ...selected
          .map((v) => options.find((o) => o.value === v)!)
          .filter(Boolean),
        ...options.filter((o) => !selected.includes(o.value)),
      );
    for (const o of el.options) o.selected = selected.includes(o.value);
  }
  $("asset-status").textContent = `보관된 이미지 ${assets.length}개`;
}
async function importFiles(files: File[]) {
  if (!files.length || busy) return;
  if (files.length > 8 || files.some((file) => file.size > 8 * 1024 * 1024))
    throw new Error("최대 8장, 각 8 MiB 이하 이미지를 선택하세요.");
  setBusy(true);
  const imported: string[] = [];
  try {
    for (const file of files) {
      status(
        `이미지를 검사하고 보관 중… ${imported.length + 1}/${files.length}`,
      );
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.readAsDataURL(file);
      });
      const asset = await api("asset_import", {
        name: file.name,
        dataBase64: base64,
      });
      imported.push(asset.id);
    }
  } finally {
    await refreshAssets();
    if (imported.length) {
      const group = field("import-target").value;
      field(`${group}-assetId`).value = imported[0];
      field(`${group}-enabled`).checked = true;
      if (group === "background") {
        const sequence = $<HTMLSelectElement>("background-assetIds"),
          options = Array.from(sequence.options);
        sequence.replaceChildren(
          ...imported.map((id) => options.find((o) => o.value === id)!),
          ...options.filter((o) => !imported.includes(o.value)),
        );
        for (const option of $<HTMLSelectElement>("background-assetIds")
          .options)
          option.selected =
            imported.length > 1 && imported.includes(option.value);
        if (imported.length > 1) field("background-motion").value = "crossfade";
      }
      setDirty(true);
    }
    field("image-file").value = "";
    setBusy(false);
  }
  status(
    `${imported.length}개 이미지를 가져왔습니다. 적용 · 미리보기를 누르세요.`,
  );
}
field("image-file").onchange = () =>
  guard(() => importFiles(Array.from(field("image-file").files ?? [])));
$("image-panel").ondragover = (e) => {
  e.preventDefault();
};
$("image-panel").ondrop = (e) => {
  e.preventDefault();
  guard(() => importFiles(Array.from(e.dataTransfer?.files ?? [])));
};
for (const [button, direction] of [
  ["sequence-up", -1],
  ["sequence-down", 1],
] as const)
  $(button).onclick = () => {
    const select = $<HTMLSelectElement>("background-assetIds"),
      options = Array.from(select.options);
    for (const o of direction < 0 ? options : options.reverse())
      if (o.selected) {
        const sibling =
          direction < 0 ? o.previousElementSibling : o.nextElementSibling;
        if (sibling && !(sibling as HTMLOptionElement).selected) {
          if (direction < 0) select.insertBefore(o, sibling);
          else select.insertBefore(sibling, o);
        }
      }
    setDirty(true);
    status("전환 순서를 변경했습니다. 적용하면 저장됩니다.");
  };

let previewImage = "";
const updateBackdrop = () => {
  $("preview-image-field").hidden = field("backdrop").value !== "image";
  message({
    type: "backdrop",
    value: field("backdrop").value,
    image: previewImage,
  });
};
updateBackdrop();
field("backdrop").onchange = updateBackdrop;
iframe.addEventListener("load", updateBackdrop);
field("preview-image").onchange = () =>
  guard(async () => {
    const file = field("preview-image").files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024)
      throw new Error("미리보기 이미지는 최대 8 MiB입니다.");
    previewImage = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    field("backdrop").value = "image";
    updateBackdrop();
  });
$("local-font-add").onclick = () => {
  const name = field("local-font-name").value.trim();
  if (!/^[\p{L}\p{N} _-]{1,80}$/u.test(name)) {
    status("폰트 패밀리 이름을 입력하세요.", true);
    return;
  }
  const el = $<HTMLSelectElement>("layout-font"),
    id = "local:" + name;
  if (!Array.from(el.options).some((o) => o.value === id))
    el.add(new Option(name + " · 설치 폰트", id));
  el.value = id;
  setDirty(true);
  status("설치 폰트를 선택했습니다. 적용해 확인하세요.");
};
$("settings-reset").onclick = () => {
  if (!project || busy) return;
  fill(project.recipe);
  field("project-name").value = project.name;
  setDirty(false);
  status("마지막으로 저장한 설정을 불러왔습니다.");
};
window.addEventListener("keydown", (event) => {
  const editing =
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement;
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    if (!busy) guard(() => produce(true));
    return;
  }
  if (
    editing ||
    busy ||
    event.defaultPrevented ||
    (event.target instanceof HTMLElement &&
      (event.target.isContentEditable ||
        event.target.closest("button, summary, a")))
  )
    return;
  if (event.code === "Space") {
    event.preventDefault();
    $("play").click();
  }
  if (event.key.toLowerCase() === "r") $("restart").click();
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    field("scrub").value = String(
      Math.max(
        0,
        Math.min(
          Number(field("scrub").max),
          Number(field("scrub").value) +
            (event.key === "ArrowRight" ? 0.1 : -0.1),
        ),
      ),
    );
    field("scrub").dispatchEvent(new Event("input"));
  }
});

field("font-file").onchange = () =>
  guard(async () => {
    const file = field("font-file").files?.[0];
    if (!file) return;
    if (file.size > 32 * 1024 * 1024)
      throw new Error("폰트는 최대 32 MiB입니다.");
    setBusy(true);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const asset = await api("asset_import", { name: file.name, dataBase64 });
      await refreshAssets();
      field("layout-font").value = asset.id;
      setDirty(true);
      status("폰트를 보관했습니다. 적용 · 미리보기를 누르세요.");
    } finally {
      field("font-file").value = "";
      setBusy(false);
    }
  });

const styleSelect = $<HTMLSelectElement>("style-presets");
styleSelect.replaceChildren(
  new Option("스타일 선택", ""),
  ...stylePresets.map((s) => new Option(s.name, s.id)),
);
styleSelect.onchange = () => {
  const s = stylePresets.find((s) => s.id === styleSelect.value);
  if (!s) return;
  const r = readRecipe();
  r.color = s.color;
  r.typography = {
    ...defaultTypography,
    ...r.typography,
    enabled: true,
    gradient: s.color !== s.secondary,
    gradientColor: s.secondary,
    strokeWidth: s.width,
    strokeColor: s.stroke,
    glow: s.glow,
    glowColor: s.secondary,
    fillOpacity: s.alpha,
  };
  r.layout = {
    ...defaultLayout,
    ...r.layout,
    gradientThird: true,
    gradientColor3: s.third,
    stroke2Width: s.outer,
  };
  fill(r);
  setDirty(true);
  status("스타일을 적용했습니다. 미리보기를 갱신하세요.");
};
const palette = $<HTMLSelectElement>("gradient-presets");
palette.replaceChildren(
  new Option("그라데이션 선택", ""),
  ...gradientPresets.map((s) => new Option(s[0], s[0])),
);
palette.onchange = () => {
  const colors = gradientPresets.find((s) => s[0] === palette.value);
  if (!colors) return;
  field("color").value = colors[1];
  field("typography-gradient").checked = true;
  field("typography-gradientColor").value = colors[2];
  field("layout-gradientThird").checked = true;
  field("layout-gradientColor3").value = colors[3];
  setDirty(true);
};
const filterPresets = () => {
  const term = field("preset-search").value.trim().toLowerCase(),
    group = field("preset-group").value;
  for (const button of document.querySelectorAll<HTMLButtonElement>(
    ".preset",
  )) {
    const p = presets.find((p) => p.id === button.dataset.id);
    button.hidden = !(
      button.textContent?.toLowerCase().includes(term) &&
      (group === "all" ||
        p?.group === group ||
        (group === "basic" && !p?.group))
    );
  }
  const count = document.querySelectorAll(".preset:not([hidden])").length;
  $("preset-count").textContent = `${count}개 프리셋`;
  $("preset-empty").hidden = count !== 0;
};
$("preset-clear").onclick = () => {
  field("preset-search").value = "";
  field("preset-group").value = "all";
  filterPresets();
  field("preset-search").focus();
};
field("preset-search").oninput = filterPresets;
field("preset-group").onchange = filterPresets;
field("size-preset").onchange = () => {
  const [w, h] = field("size-preset").value.split("x").map(Number);
  if (!w || !h) return;
  field("width").value = String(w);
  field("height").value = String(h);
  setDirty(true);
  timeline(readRecipe());
};

$("properties").addEventListener("change", (event) => {
  const el = event.target as HTMLInputElement;
  if (el.id === "width" || el.id === "height") field("size-preset").value = "";
  if (["layout", "sequence", "motion"].includes(el.dataset.group ?? ""))
    field("typography-enabled").checked = true;
  if (el.id === "background-motion")
    field("background-profile").value = "reference";
  if (
    el.dataset.group === "sequence" ||
    (el.dataset.group === "motion" && el.dataset.key !== "enabled")
  )
    field("motion-enabled").checked = true;
});

// Reuse and recovery stay on the same revision-checked command boundary as MCP.
let historyEntries: ProjectSnapshot[] = [];
async function refreshHistory() {
  const result = await api("project_history", { projectId: project.id });
  historyEntries = result.entries;
  const select = $<HTMLSelectElement>("project-history"),
    selected = select.value;
  select.replaceChildren(
    ...historyEntries.map(
      (h) =>
        new Option(
          `REV ${h.revision} · ${new Date(h.updatedAt).toLocaleString("ko-KR")} · ${h.name}`,
          String(h.revision),
        ),
    ),
  );
  if (historyEntries.some((h) => String(h.revision) === selected))
    select.value = selected;
  $("history-info").textContent =
    `현재 REV ${result.currentRevision} · 이전 저장본 ${historyEntries.length}/30`;
  showHistory();
  field("restore-project").disabled = busy || !select.value;
}
function showHistory() {
  const h = historyEntries.find(
    (h) => String(h.revision) === field("project-history").value,
  );
  $("history-detail").textContent = h
    ? `${h.recipe.text}
${h.recipe.width} × ${h.recipe.height} · ${duration(h.recipe).toFixed(2)}초`
    : "다음 저장부터 이전 설정이 이곳에 남습니다.";
}
$("project-history").onchange = showHistory;
async function refreshPresets() {
  presets = await api("presets_list");
  $("presets").replaceChildren();
  for (const p of presets) {
    const button = document.createElement("button");
    button.className = "preset";
    button.dataset.id = p.id;
    const art = document.createElement("div");
    art.className = "preset-art";
    art.textContent = p.recipe.text.split("\n")[0];
    const copy = document.createElement("div");
    copy.className = "preset-copy";
    const strong = document.createElement("strong");
    strong.textContent = p.name;
    const small = document.createElement("small");
    small.textContent = p.description;
    copy.append(strong, small);
    button.append(art, copy);
    button.onclick = () => {
      const recipe = structuredClone(p.recipe) as Recipe;
      if (field("preset-keep-text").checked) {
        const current = readRecipe();
        recipe.text = current.text;
        recipe.typography = {
          ...defaultTypography,
          ...recipe.typography,
          subText: current.typography?.subText ?? "",
        };
      }
      fill(recipe);
      setDirty(true);
      document
        .querySelectorAll(".preset")
        .forEach((el) => el.classList.toggle("active", el === button));
      status("프리셋을 선택했습니다. 적용 · 미리보기를 누르세요.");
    };
    $("presets").append(button);
  }

  const select = $<HTMLSelectElement>("user-presets"),
    selected = select.value;
  select.replaceChildren(
    ...presets
      .filter((p) => p.group === "user")
      .map((p) => new Option(p.name, p.id)),
  );
  if (presets.some((p) => p.id === selected)) select.value = selected;
  field("delete-preset").disabled = busy || !select.value;
  filterPresets();
}
function libraryAction(work: () => Promise<void>, preview = false) {
  if (busy) return;
  guard(async () => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
    if (preview) await produce(true);
  });
}
$("save-project").onclick = () =>
  libraryAction(async () => {
    await save();
    status(
      `저장했습니다. REV ${project.revision} · 미리보기는 적용 버튼으로 갱신하세요.`,
    );
  });
$("duplicate-project").onclick = () =>
  libraryAction(async () => {
    await save();
    load(
      await api("project_duplicate", {
        projectId: project.id,
        expectedRevision: project.revision,
        name: `${project.name.slice(0, 76)} 사본`,
      }),
    );
    await refreshProjects();
  }, true);
$("restore-project").onclick = () =>
  libraryAction(async () => {
    if (dirty)
      throw new Error(
        "편집 중인 내용이 있습니다. 먼저 저장하거나 저장된 설정으로 되돌린 뒤 복원하세요.",
      );
    load(
      await api("project_restore", {
        projectId: project.id,
        expectedRevision: project.revision,
        revision: Number(field("project-history").value),
      }),
    );
    await refreshProjects();
  }, true);
$("save-preset").onclick = () =>
  libraryAction(async () => {
    const name = field("user-preset-name").value.trim();
    if (!name) throw new Error("프리셋 이름을 입력하세요.");
    await save();
    const preset = await api("preset_save", {
      projectId: project.id,
      expectedRevision: project.revision,
      name,
    });
    field("preset-group").value = "user";
    field("preset-search").value = "";
    await refreshPresets();
    field("user-presets").value = preset.id;
    status(`내 프리셋에 ‘${name}’을 저장했습니다.`);
  });
$("delete-preset").onclick = () =>
  libraryAction(async () => {
    const presetId = field("user-presets").value;
    if (!presetId) return;
    await api("preset_delete", { presetId });
    await refreshPresets();
    status("프리셋을 삭제했습니다. 프로젝트와 원본 소재는 그대로 보관됩니다.");
  });
window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (!busy) $("save-project").click();
  }
});

const particleStyleSelect = $<HTMLSelectElement>("particle-style");
particleStyleSelect.replaceChildren(
  new Option("효과 선택", ""),
  ...particleStyles.map((p) => new Option(p.name, p.id)),
);
particleStyleSelect.onchange = () => {
  const style = particleStyles.find((p) => p.id === particleStyleSelect.value);
  if (!style) return;
  const r = readRecipe();
  r.particles = {
    ...defaultParticles,
    ...style.settings,
    enabled: true,
    advanced: true,
  };
  fill(r);
  setDirty(true);
  $("particle-description").textContent = style.description;
  status(`${style.name} 파티클을 선택했습니다. 적용 · 미리보기로 확인하세요.`);
};
field("particles-preset").onchange = () => {
  field("particles-advanced").checked = false;
  particleStyleSelect.value = "";
  setDirty(true);
  status("기본 파티클 모양으로 전환했습니다. 적용해 확인하세요.");
};
