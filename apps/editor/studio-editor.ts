import { $, field } from "./dom.js";
import {
  createStudioNode,
  defaultStudio,
  type Studio,
  type StudioNode,
  type StudioData,
  type StudioTrack,
  type StudioBinding,
  type StudioWidgetKind,
  type StudioWidgetState,
} from "../../runtimes/shared/studio-types.js";
import { defaultParticles } from "../../runtimes/shared/motion.js";
import {
  particleStyles,
  particleFields,
} from "../../runtimes/shared/particle-options.js";

type Input = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
let value: Studio | undefined;
let selected = new Set<string>();
let assets: { id: string; name: string }[] = [];
let send: (data: unknown) => void = () => {};
let ready = false;
let dragging = false;
const copy = <T>(v: T): T => structuredClone(v);
const get = () => (value ??= copy(defaultStudio));
const number = (id: string) => Number(field(id).value);
const node = () => value?.nodes.find((item) => selected.has(item.id));
const uid = () => crypto.randomUUID();
const sectionOpen = new Map<string, boolean>();
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function button(text: string, action: () => void, title?: string) {
  const b = el("button", text);
  b.type = "button";
  b.onclick = action;
  if (title) b.title = title;
  return b;
}
function inputField(
  label: string,
  key: string,
  current: unknown,
  change: (v: any) => void,
  options?: readonly string[],
  bounds?: [number, number, number],
) {
  const labelEl = el("label", label, "field");
  let input: Input;
  if (options) {
    const select = el("select");
    select.replaceChildren(
      ...options.map((option) => new Option(option, option)),
    );
    input = select;
  } else {
    const item = el("input");
    item.type =
      typeof current === "boolean"
        ? "checkbox"
        : typeof current === "number"
          ? "number"
          : /^#[0-9a-f]{6}$/i.test(String(current))
            ? "color"
            : "text";
    if (typeof current === "boolean") item.checked = current;
    if (bounds) {
      item.min = String(bounds[0]);
      item.max = String(bounds[1]);
      item.step = String(bounds[2]);
    } else if (typeof current === "number") item.step = "any";
    input = item;
  }
  input.id = `studio-${key}`;
  if (!(input instanceof HTMLInputElement && input.type === "checkbox"))
    input.value = String(current ?? "");
  input.onchange = () => {
    if (input instanceof HTMLInputElement && !input.checkValidity()) {
      input.reportValidity();
      return;
    }
    change(
      input instanceof HTMLInputElement && input.type === "checkbox"
        ? input.checked
        : typeof current === "number"
          ? Number(input.value)
          : input.value,
    );
    changed();
  };
  if (typeof current === "boolean") {
    labelEl.classList.add("studio-toggle");
    labelEl.prepend(input);
  } else labelEl.append(input);
  return labelEl;
}
function details(title: string, open = false) {
  const d = el("details", undefined, "studio-section");
  d.open = sectionOpen.get(title) ?? open;
  d.append(el("summary", title));
  d.addEventListener("toggle", () => {
    if (d.isConnected) sectionOpen.set(title, d.open);
  });
  return d;
}
function row(...items: HTMLElement[]) {
  const d = el("div", undefined, "studio-row");
  d.append(...items);
  return d;
}
function changed(render = false) {
  if (render) renderAll();
  else {
    renderOverlay();
    renderTimeline();
  }
  $("properties").dispatchEvent(new Event("input", { bubbles: true }));
}
export function readStudio(): Studio | undefined {
  return value && copy(value);
}
export function fillStudio(studio: Studio | undefined) {
  value = studio && copy(studio);
  selected = new Set(
    [...selected].filter((id) => value?.nodes.some((n) => n.id === id)),
  );
  if (ready) renderAll();
}
export function setStudioAssets(items: { id: string; name: string }[]) {
  assets = items;
  if (ready) renderInspector();
}

function assetField(n: StudioNode) {
  const result = inputField(
    "이미지 / 스프라이트 소재",
    "node-asset",
    n.assetId ?? "",
    (v) => {
      n.assetId = v || null;
      if (n.kind === "image") {
        n.enabled = !!n.assetId;
        renderList();
      }
    },
    ["", ...assets.map((a) => a.id)],
  );
  const select = result.querySelector("select")!;
  select.options[0].text = "소재 없음";
  assets.forEach((asset, i) => (select.options[i + 1].text = asset.name));
  result.append(
    el("small", "이미지 탭에서 파일을 가져오면 이 목록에 표시됩니다.", "hint"),
  );
  return result;
}
function addNode(
  kind: StudioNode["kind"],
  widgetKind: StudioWidgetKind = "button",
) {
  const s = get();
  if (s.nodes.length >= 64) return;
  const n = createStudioNode(kind, uid(), widgetKind);
  n.name =
    {
      group: "그룹",
      text: "텍스트",
      image: "이미지",
      particles: "파티클",
      ui: widgetKind,
    }[kind] + ` ${s.nodes.length + 1}`;
  n.x = number("width") / 2;
  n.y = number("height") / 2;
  n.duration = s.duration;
  n.zIndex = s.nodes.length;
  if (kind === "image") {
    n.assetId = assets[0]?.id ?? null;
    n.enabled = !!n.assetId;
  }
  if (kind === "particles")
    n.particles = {
      ...defaultParticles,
      enabled: true,
      advanced: true,
      x: 0.5,
      y: 0.5,
    };
  s.nodes.push(n);
  selected = new Set([n.id]);
  changed(true);
}
function descendants(ids: Set<string>) {
  let updated = true;
  while (updated) {
    updated = false;
    for (const n of value?.nodes ?? [])
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        updated = true;
      }
  }
  return ids;
}
function deleteSelection() {
  if (!value) return;
  const ids = descendants(
    new Set(
      [...selected].filter(
        (id) => !isLocked(value!.nodes.find((n) => n.id === id)!),
      ),
    ),
  );
  value.nodes = value.nodes.filter((n) => !ids.has(n.id));
  value.bindings = value.bindings.filter((b) => !ids.has(b.nodeId));
  selected.clear();
  changed(true);
}
function duplicateSelection() {
  if (!value) return;
  const ids = descendants(new Set(selected)),
    mapping = new Map([...ids].map((id) => [id, uid()]));
  if (value.nodes.length + ids.size > 64) return;
  const clones = value.nodes
    .filter((n) => ids.has(n.id))
    .map((n) => ({
      ...copy(n),
      id: mapping.get(n.id)!,
      name: `${n.name} 복제`,
      parentId: mapping.get(n.parentId ?? "") ?? n.parentId,
      x: n.x + (mapping.has(n.parentId ?? "") ? 0 : 16),
      y: n.y + (mapping.has(n.parentId ?? "") ? 0 : 16),
      zIndex: n.zIndex + 1,
    }));
  value.nodes.push(...clones);
  value.bindings.push(
    ...value.bindings
      .filter((b) => ids.has(b.nodeId))
      .map((b) => ({ ...copy(b), nodeId: mapping.get(b.nodeId)! })),
  );
  selected = new Set(clones.map((n) => n.id));
  changed(true);
}
function renderList() {
  const list = $("studio-nodes");
  list.replaceChildren();
  $("studio-node-count").textContent =
    `${value?.nodes.length ?? 0}개 레이어 · ${selected.size}개 선택`;
  for (const n of [...(value?.nodes ?? [])].sort(
    (a, b) => b.zIndex - a.zIndex,
  )) {
    const item = el("div", undefined, "studio-node-row");
    item.classList.toggle("selected", selected.has(n.id));
    const select = button(
      `${n.kind === "group" ? "▱" : n.kind === "particles" ? "✦" : n.kind === "image" ? "▧" : n.kind === "ui" ? "◫" : "Aa"} ${n.name}`,
      () => {},
      "클릭으로 선택 · Shift로 다중 선택",
    );
    select.dataset.nodeId = n.id;
    select.setAttribute("aria-pressed", String(selected.has(n.id)));
    select.onclick = (event) => {
      if (!event.shiftKey) selected.clear();
      if (selected.has(n.id)) selected.delete(n.id);
      else selected.add(n.id);
      renderAll();
    };
    if (n.parentId) select.classList.add("nested");
    const visible = button(
      n.enabled ? "◉" : "○",
      () => {
        n.enabled = !n.enabled;
        changed(true);
      },
      "레이어 표시 전환",
    );
    visible.setAttribute("aria-label", `${n.name} 표시 전환`);
    const lock = button(
      n.locked ? "잠금" : "열림",
      () => {
        n.locked = !n.locked;
        changed(true);
      },
      "변형 잠금 전환",
    );
    lock.setAttribute("aria-label", `${n.name} 잠금 전환`);
    item.append(select, visible, lock);
    list.append(item);
  }
  if (!value?.nodes.length)
    list.append(
      el(
        "p",
        "레이어를 추가해 여러 효과와 게임 UI를 합성하세요. 기존 효과 위에 표시됩니다.",
        "hint",
      ),
    );
  $<HTMLButtonElement>("studio-delete").disabled = selected.size === 0;
  $<HTMLButtonElement>("studio-duplicate").disabled = selected.size === 0;
}
function renderInspector() {
  const root = $("studio-node-inspector");
  root.replaceChildren();
  const n = node();
  if (!n) {
    root.append(
      el(
        "p",
        "레이어를 선택하면 변형, 키프레임, 게임 데이터 설정이 나타납니다.",
        "hint",
      ),
    );
    return;
  }
  root.append(
    el(
      "h3",
      selected.size > 1
        ? `${selected.size}개 선택 · 첫 레이어 속성`
        : `${n.name} 속성`,
    ),
  );
  const info = details("이름 · 계층 · 표시 순서", true);
  info.append(
    inputField("레이어 이름", "node-name", n.name, (v) => {
      n.name = v;
      renderList();
    }),
  );
  const parents = (value?.nodes ?? []).filter(
    (v) => v.kind === "group" && !descendants(new Set([n.id])).has(v.id),
  );
  const parent = inputField(
    "부모 그룹",
    "node-parent",
    n.parentId ?? "",
    (v) => {
      n.parentId = v || null;
      renderList();
    },
    ["", ...parents.map((p) => p.id)],
  );
  const opts = parent.querySelector("select")!.options;
  opts[0].text = "최상위";
  parents.forEach((p, i) => (opts[i + 1].text = p.name));
  info.append(
    parent,
    row(
      inputField(
        "표시 순서 Z",
        "node-z",
        n.zIndex,
        (v) => {
          n.zIndex = v;
          renderList();
        },
        undefined,
        [-1000, 1000, 1],
      ),
      inputField(
        "불투명도",
        "node-opacity",
        n.opacity,
        (v) => (n.opacity = v),
        undefined,
        [0, 1, 0.05],
      ),
    ),
  );
  root.append(info);
  const transform = details("위치 · 크기 · 시간", true);
  const fields: [string, keyof StudioNode, number, number, number][] = [
    ["X", "x", -10000, 10000, 1],
    ["Y", "y", -10000, 10000, 1],
    ["너비", "width", 1, 4096, 1],
    ["높이", "height", 1, 4096, 1],
    ["배율", "scale", 0.01, 20, 0.01],
    ["회전 °", "rotation", -3600, 3600, 1],
    ["시작 초", "start", 0, 120, 0.05],
    ["길이 초", "duration", 0.01, 120, 0.05],
  ];
  fields.forEach(([label, key, min, max, step], i) => {
    if (i % 2 === 0) transform.append(row());
    const f = inputField(
      label,
      `node-${key}`,
      n[key],
      (v) => ((n as any)[key] = v),
      undefined,
      [min, max, step],
    );
    if (isLocked(n)) f.querySelector("input")!.disabled = true;
    transform.lastElementChild!.append(f);
  });
  root.append(transform);
  if (n.kind === "text")
    root.append(
      inputField("문구", "node-text", n.text, (v) => (n.text = v)),
      row(
        inputField(
          "글자 크기",
          "node-font-size",
          n.fontSize,
          (v) => (n.fontSize = v),
          undefined,
          [8, 400, 1],
        ),
        inputField("색상", "node-color", n.color, (v) => (n.color = v)),
      ),
    );
  if (n.kind === "image" || n.kind === "particles") root.append(assetField(n));
  if (n.kind === "ui" && n.widget) root.append(widgetInspector(n));
  if (n.kind === "particles") root.append(particleInspector(n));
  root.append(trackInspector(n), bindingInspector(n));
}
function widgetInspector(n: StudioNode) {
  const w = n.widget!,
    d = details("게임 UI · 상태 전환", true);
  d.append(
    inputField("컴포넌트", "widget-kind", w.kind, (v) => (w.kind = v), [
      "button",
      "health-bar",
      "cooldown",
      "toast",
      "item-card",
    ]),
    inputField("표시 문구", "widget-label", w.label, (v) => (w.label = v)),
  );
  d.append(
    row(
      inputField(
        "현재 값",
        "widget-value",
        w.value,
        (v) => (w.value = v),
        undefined,
        [0, 1000000, 0.1],
      ),
      inputField(
        "최대 값",
        "widget-max",
        w.max,
        (v) => (w.max = v),
        undefined,
        [0.001, 1000000, 0.1],
      ),
    ),
  );
  d.append(
    row(
      inputField("채움 색", "widget-fill", w.fill, (v) => (w.fill = v)),
      inputField("테두리 색", "widget-border", w.border, (v) => (w.border = v)),
    ),
  );
  d.append(
    row(
      inputField(
        "모서리 반경",
        "widget-radius",
        w.radius,
        (v) => (w.radius = v),
        undefined,
        [0, 200, 1],
      ),
      inputField(
        "전환 초",
        "widget-transition",
        w.transition,
        (v) => (w.transition = v),
        undefined,
        [0, 5, 0.05],
      ),
    ),
  );
  d.append(
    inputField(
      "현재 상태",
      "widget-state",
      w.state,
      (v) => {
        w.state = v;
        send({ type: "set-node-state", nodeId: n.id, state: v });
      },
      ["normal", "pressed", "selected", "disabled"],
    ),
  );
  for (const state of ["normal", "pressed", "selected", "disabled"] as const) {
    const styles = details(`${state} 스타일`);
    const style = w.states[state];
    styles.append(
      row(
        inputField(
          "글자 색",
          `${state}-color`,
          style.color,
          (v) => (style.color = v),
        ),
        inputField(
          "배경 색",
          `${state}-background`,
          style.background,
          (v) => (style.background = v),
        ),
      ),
      row(
        inputField(
          "배율",
          `${state}-scale`,
          style.scale,
          (v) => (style.scale = v),
          undefined,
          [0.1, 4, 0.01],
        ),
        inputField(
          "불투명도",
          `${state}-opacity`,
          style.opacity,
          (v) => (style.opacity = v),
          undefined,
          [0, 1, 0.05],
        ),
      ),
    );
    d.append(styles);
  }
  return d;
}
function particleInspector(n: StudioNode) {
  n.particles ??= { ...defaultParticles, enabled: true };
  const p = n.particles,
    d = details("방출기 · 스프라이트 · 수명 곡선", true);
  const preset = inputField(
    "방출기 프리셋",
    "particle-style",
    "",
    (v) => {
      if (v) {
        n.particles = {
          ...defaultParticles,
          ...particleStyles.find((style) => style.id === v)!.settings,
          enabled: true,
          advanced: true,
        };
        changed(true);
      }
    },
    ["", ...particleStyles.map((style) => style.id)],
  );
  preset.querySelector("select")!.options[0].text = "직접 편집";
  particleStyles.forEach(
    (style, i) =>
      (preset.querySelector("select")!.options[i + 1].text = style.name),
  );
  d.append(preset);
  d.append(
    row(
      inputField(
        "입자 수",
        "particle-count",
        p.count,
        (v) => (p.count = v),
        undefined,
        [1, 500, 1],
      ),
      inputField(
        "크기",
        "particle-size",
        p.size,
        (v) => (p.size = v),
        undefined,
        [1, 80, 0.1],
      ),
    ),
    row(
      inputField(
        "속도",
        "particle-speed",
        p.speed,
        (v) => (p.speed = v),
        undefined,
        [0, 1000, 1],
      ),
      inputField(
        "수명 초",
        "particle-lifetime",
        p.lifetime,
        (v) => (p.lifetime = v),
        undefined,
        [0.1, 30, 0.1],
      ),
    ),
  );
  d.append(
    inputField(
      "방출",
      "particle-emission",
      p.emission,
      (v) => (p.emission = v),
      ["continuous", "burst"],
    ),
    row(
      inputField("색상", "particle-color", p.color, (v) => (p.color = v)),
      inputField(
        "시드",
        "particle-seed",
        p.seed,
        (v) => (p.seed = v),
        undefined,
        [0, 2147483645, 1],
      ),
    ),
  );
  const adv = details("방출 영역 · 힘 · 궤적");
  for (const f of particleFields.filter((f) => f.key !== "advanced"))
    adv.append(
      inputField(
        f.label,
        `particle-${f.key}`,
        (p as any)[f.key] ?? f.value,
        (v) => {
          p.advanced = true;
          (p as any)[f.key] = v;
        },
        f.options,
        f.type === "number"
          ? [f.min ?? -100000, f.max ?? 100000, f.step ?? 0.1]
          : undefined,
      ),
    );
  adv.append(
    row(
      inputField(
        "중력",
        "particle-gravity",
        p.gravity,
        (v) => (p.gravity = v),
        undefined,
        [-1000, 1000, 1],
      ),
      inputField(
        "퍼짐 °",
        "particle-spread",
        p.spread,
        (v) => (p.spread = v),
        undefined,
        [0, 360, 1],
      ),
    ),
  );
  d.append(adv);
  const sprite = details("스프라이트 시트");
  sprite.append(
    inputField("프레임 애니메이션 사용", "sprite-enabled", !!n.sprite, (v) => {
      n.sprite = v
        ? { columns: 4, rows: 1, frames: 4, fps: 12, loop: true }
        : undefined;
      changed(true);
    }),
  );
  if (n.sprite) {
    const s = n.sprite;
    for (const [key, label] of [
      ["columns", "가로 칸"],
      ["rows", "세로 칸"],
      ["frames", "프레임 수"],
      ["fps", "초당 프레임"],
    ] as const)
      sprite.append(
        inputField(
          label,
          `sprite-${key}`,
          s[key],
          (v) => (s[key] = v),
          undefined,
          [1, key === "fps" ? 120 : key === "frames" ? 4096 : 64, 1],
        ),
      );
    sprite.append(
      inputField("프레임 반복", "sprite-loop", s.loop, (v) => (s.loop = v)),
    );
  }
  d.append(sprite);
  const curve = details("수명별 크기 · 불투명도 · 속도");
  curve.append(
    inputField("수명 곡선 사용", "curves-enabled", !!n.curves, (v) => {
      n.curves = v
        ? {
            size: [
              { t: 0, value: 0.2 },
              { t: 0.3, value: 1 },
              { t: 1, value: 0 },
            ],
            opacity: [
              { t: 0, value: 1 },
              { t: 1, value: 0 },
            ],
            speed: [
              { t: 0, value: 1 },
              { t: 1, value: 0.2 },
            ],
          }
        : undefined;
      changed(true);
    }),
  );
  if (n.curves)
    for (const key of ["size", "opacity", "speed"] as const) {
      const points = n.curves[key];
      curve.append(
        el(
          "strong",
          { size: "크기 배율", opacity: "불투명도", speed: "속도 배율" }[key],
        ),
      );
      points.forEach((point, i) =>
        curve.append(
          row(
            inputField(
              "수명 비율",
              `curve-${key}-${i}-t`,
              point.t,
              (v) => {
                point.t = v;
                points.sort((a, b) => a.t - b.t);
              },
              undefined,
              [0, 1, 0.05],
            ),
            inputField(
              "값",
              `curve-${key}-${i}-value`,
              point.value,
              (v) => (point.value = v),
              undefined,
              [0, key === "opacity" ? 1 : 20, 0.05],
            ),
            button(
              "×",
              () => {
                if (i > 0 && i < points.length - 1) {
                  points.splice(i, 1);
                  changed(true);
                }
              },
              "곡선 점 삭제",
            ),
          ),
        ),
      );
      curve.append(
        button("＋ 곡선 점", () => {
          if (points.length >= 16) return;
          let slot = 0;
          for (let i = 1; i < points.length - 1; i++)
            if (
              points[i + 1].t - points[i].t >
              points[slot + 1].t - points[slot].t
            )
              slot = i;
          points.splice(slot + 1, 0, {
            t: (points[slot].t + points[slot + 1].t) / 2,
            value: 1,
          });
          changed(true);
        }),
      );
    }
  d.append(curve);
  const follow = details("게임 데이터 좌표 추적");
  follow.append(
    inputField("대상 추적 사용", "follow-enabled", !!n.follow, (v) => {
      n.follow = v
        ? { xKey: "playerX", yKey: "playerY", offsetX: 0, offsetY: 0 }
        : undefined;
      changed(true);
    }),
  );
  if (n.follow) {
    const f = n.follow;
    follow.append(
      inputField("X 데이터 키", "follow-xKey", f.xKey, (v) => (f.xKey = v)),
      inputField("Y 데이터 키", "follow-yKey", f.yKey, (v) => (f.yKey = v)),
      row(
        inputField(
          "X 오프셋",
          "follow-offsetX",
          f.offsetX,
          (v) => (f.offsetX = v),
        ),
        inputField(
          "Y 오프셋",
          "follow-offsetY",
          f.offsetY,
          (v) => (f.offsetY = v),
        ),
      ),
    );
  }
  d.append(follow);
  return d;
}
function trackInspector(n: StudioNode) {
  const d = details("속성 키프레임");
  d.append(
    el(
      "p",
      "시간은 레이어 시작부터 초 단위입니다. 같은 속성의 키는 시간순으로 재생됩니다.",
      "hint",
    ),
  );
  n.tracks.forEach((track, i) => {
    const section = el("div", undefined, "studio-item");
    section.append(
      row(
        inputField(
          "속성",
          `track-${i}-property`,
          track.property,
          (v) => (track.property = v),
          ["x", "y", "scale", "rotation", "opacity", "value"],
        ),
        button("트랙 삭제", () => {
          n.tracks.splice(i, 1);
          changed(true);
        }),
      ),
    );
    track.keys.forEach((key, j) =>
      section.append(
        row(
          inputField(
            "초",
            `track-${i}-${j}-time`,
            key.time,
            (v) => {
              key.time = v;
              track.keys.sort((a, b) => a.time - b.time);
            },
            undefined,
            [0, 120, 0.05],
          ),
          inputField(
            "값",
            `track-${i}-${j}-value`,
            key.value,
            (v) => (key.value = v),
          ),
          inputField(
            "보간",
            `track-${i}-${j}-easing`,
            key.easing,
            (v) => (key.easing = v),
            ["linear", "in", "out", "smooth"],
          ),
          button(
            "×",
            () => {
              if (track.keys.length > 1) {
                track.keys.splice(j, 1);
                changed(true);
              }
            },
            "키프레임 삭제",
          ),
        ),
      ),
    );
    section.append(
      button("＋ 현재 재생 위치에 키", () => {
        const time = Math.min(
          n.duration,
          Math.max(0, Number(field("scrub").value) - n.start),
        );
        const key = {
          time,
          value:
            track.property === "value"
              ? (n.widget?.value ?? 0)
              : Number(n[track.property]),
          easing: "smooth" as const,
        };
        const old = track.keys.findIndex((k) => Math.abs(k.time - time) < 1e-6);
        if (old >= 0) track.keys[old] = key;
        else if (track.keys.length < 32) track.keys.push(key);
        track.keys.sort((a, b) => a.time - b.time);
        changed(true);
      }),
    );
    d.append(section);
  });
  d.append(
    button("＋ 속성 트랙", () => {
      const property = (
        ["x", "y", "scale", "rotation", "opacity", "value"] as const
      ).find((p) => !n.tracks.some((t) => t.property === p));
      if (!property) return;
      n.tracks.push({
        property,
        keys: [
          {
            time: 0,
            value:
              property === "value"
                ? (n.widget?.value ?? 0)
                : Number(n[property]),
            easing: "linear",
          },
        ],
      });
      changed(true);
    }),
  );
  return d;
}
function bindingInspector(n: StudioNode) {
  const d = details("게임 데이터 바인딩");
  d.append(
    el(
      "p",
      "데이터 키와 속성을 연결합니다. 문구 서식은 {value}를 치환합니다.",
      "hint",
    ),
  );
  get().bindings.forEach((binding, i) => {
    if (binding.nodeId !== n.id) return;
    const b = el("div", undefined, "studio-item");
    b.append(
      row(
        inputField(
          "데이터 키",
          `binding-${i}-key`,
          binding.key,
          (v) => (binding.key = v),
        ),
        inputField(
          "대상 속성",
          `binding-${i}-property`,
          binding.property,
          (v) => (binding.property = v),
          ["text", "value", "x", "y", "opacity", "visible", "state", "color"],
        ),
      ),
    );
    b.append(
      row(
        inputField(
          "배율",
          `binding-${i}-scale`,
          binding.scale,
          (v) => (binding.scale = v),
        ),
        inputField(
          "오프셋",
          `binding-${i}-offset`,
          binding.offset,
          (v) => (binding.offset = v),
        ),
      ),
      row(
        inputField(
          "최솟값",
          `binding-${i}-min`,
          binding.min,
          (v) => (binding.min = v),
        ),
        inputField(
          "최댓값",
          `binding-${i}-max`,
          binding.max,
          (v) => (binding.max = v),
        ),
      ),
      inputField(
        "문구 서식",
        `binding-${i}-format`,
        binding.format,
        (v) => (binding.format = v),
      ),
      button("바인딩 삭제", () => {
        get().bindings.splice(i, 1);
        changed(true);
      }),
    );
    d.append(b);
  });
  d.append(
    button("＋ 데이터 연결", () => {
      const property = (
        [
          "value",
          "text",
          "x",
          "y",
          "opacity",
          "visible",
          "state",
          "color",
        ] as const
      ).find(
        (p) =>
          !get().bindings.some((b) => b.nodeId === n.id && b.property === p),
      );
      if (!property) return;
      get().bindings.push({
        nodeId: n.id,
        property,
        key: n.kind === "ui" ? "hp" : "damage",
        scale: 1,
        offset: 0,
        min: -1000000,
        max: 1000000,
        format: "{value}",
      });
      changed(true);
    }),
  );
  return d;
}
function scalarRows(root: HTMLElement, data: StudioData, prefix: string) {
  Object.entries(data).forEach(([key, current], i) => {
    const r = row();
    r.append(
      inputField("키", `${prefix}-${i}-key`, key, (next) => {
        if (
          /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(next) &&
          !["__proto__", "constructor", "prototype"].includes(next) &&
          next !== key &&
          !Object.hasOwn(data, next)
        ) {
          data[next] = data[key];
          delete data[key];
          changed(true);
        }
      }),
    );
    r.append(
      inputField("값", `${prefix}-${i}-value`, current, (v) => (data[key] = v)),
    );
    r.append(
      inputField(
        "형식",
        `${prefix}-${i}-type`,
        typeof current,
        (t) => {
          data[key] = t === "number" ? 0 : t === "boolean" ? true : "";
          changed(true);
        },
        ["number", "string", "boolean"],
      ),
    );
    r.append(
      button(
        "×",
        () => {
          delete data[key];
          changed(true);
        },
        "데이터 삭제",
      ),
    );
    root.append(r);
  });
  root.append(
    button("＋ 데이터 키", () => {
      if (Object.keys(data).length >= 64) return;
      let i = 1;
      while (Object.hasOwn(data, `value${i}`)) i++;
      data[`value${i}`] = 0;
      changed(true);
    }),
  );
}
function renderSettings() {
  const root = $("studio-scene-settings");
  root.replaceChildren();
  const s = value ?? copy(defaultStudio);
  root.append(
    inputField("합성 레이어 사용", "enabled", !!value && s.enabled, (v) => {
      get().enabled = v;
      renderAll();
    }),
  );
  if (!value) {
    root.append(
      el(
        "p",
        "레이어를 추가하거나 합성을 활성화하면 데이터·이벤트·품질을 편집할 수 있습니다.",
        "hint",
      ),
    );
    return;
  }
  root.append(
    inputField(
      "합성 재생 길이 (초)",
      "duration",
      s.duration,
      (v) => (get().duration = v),
      undefined,
      [0.1, 120, 0.1],
    ),
  );
  const data = details("게임 데이터 · 실시간 샘플", true);
  scalarRows(data, s.data, "data");
  data.append(
    button("현재 데이터로 미리보기 갱신", () =>
      send({ type: "set-data", data: copy(get().data) }),
    ),
    el(
      "p",
      "샘플은 레시피에 저장됩니다. 실제 게임에서는 setData()로 변경할 수 있습니다.",
      "hint",
    ),
  );
  root.append(data);
  const events = details("타임라인 이벤트");
  s.events.forEach((event, i) => {
    const d = details(`${event.time}s · ${event.name}`, true);
    d.append(
      row(
        inputField(
          "발생 초",
          `event-${i}-time`,
          event.time,
          (v) => (event.time = v),
          undefined,
          [0, 120, 0.05],
        ),
        inputField(
          "이벤트 이름",
          `event-${i}-name`,
          event.name,
          (v) => (event.name = v),
        ),
      ),
    );
    scalarRows(d, event.payload, `event-${i}-data`);
    d.append(
      button("이벤트 삭제", () => {
        get().events.splice(i, 1);
        changed(true);
      }),
    );
    events.append(d);
  });
  events.append(
    button("＋ 현재 위치에 이벤트", () => {
      if (get().events.length >= 128) return;
      get().events.push({
        id: uid(),
        time: Math.min(get().duration, Number(field("scrub").value)),
        name: "effect-cue",
        payload: {},
      });
      changed(true);
    }),
  );
  events.append(
    el(
      "p",
      "재생 중 시점을 통과하면 게임으로 이름·데이터를 전달합니다. 탐색은 이벤트를 발생시키지 않습니다.",
      "hint",
    ),
  );
  const log = el("output", undefined, "studio-event-log");
  log.id = "studio-event-log";
  log.textContent = "이벤트 수신 대기";
  events.append(log);
  root.append(events);
  const quality = details("품질 · 접근성 · Three 공간");
  quality.append(
    inputField(
      "품질",
      "quality-level",
      s.quality.level,
      (v) => (get().quality.level = v),
      ["low", "medium", "high"],
    ),
    inputField(
      "모션 감소",
      "quality-reduced",
      s.quality.reducedMotion,
      (v) => (get().quality.reducedMotion = v),
    ),
    row(
      inputField(
        "입자 예산",
        "quality-budget",
        s.quality.particleBudget,
        (v) => (get().quality.particleBudget = v),
        undefined,
        [0, 5000, 1],
      ),
      inputField(
        "동시 인스턴스",
        "quality-instances",
        s.quality.instances,
        (v) => (get().quality.instances = v),
        undefined,
        [1, 32, 1],
      ),
    ),
    inputField(
      "목표 FPS",
      "quality-fps",
      s.quality.fpsTarget,
      (v) => (get().quality.fpsTarget = Number(v)),
      ["30", "60", "120"],
    ),
  );
  quality.append(
    inputField("Three 공간", "space", s.space, (v) => (get().space = v), [
      "screen",
      "world",
    ]),
    inputField(
      "월드 단위 / px",
      "world-scale",
      s.worldScale,
      (v) => (get().worldScale = v),
      undefined,
      [0.0001, 10, 0.001],
    ),
    inputField(
      "카메라 바라보기",
      "billboard",
      s.billboard,
      (v) => (get().billboard = v),
    ),
  );
  root.append(quality);
}
function isLocked(n: StudioNode): boolean {
  let current: StudioNode | undefined = n;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    if (current.locked) return true;
    seen.add(current.id);
    current = value?.nodes.find((p) => p.id === current!.parentId);
  }
  return false;
}
function matrix(n: StudioNode, seen = new Set<string>()): DOMMatrix {
  if (seen.has(n.id)) return new DOMMatrix();
  seen.add(n.id);
  const parent = value?.nodes.find((p) => p.id === n.parentId);
  return (parent ? matrix(parent, seen) : new DOMMatrix())
    .translate(n.x, n.y)
    .rotate(n.rotation)
    .scale(n.scale);
}
function parentMatrix(n: StudioNode) {
  const p = value?.nodes.find((p) => p.id === n.parentId);
  return p ? matrix(p) : new DOMMatrix();
}
function selectionRoots() {
  return (value?.nodes ?? []).filter(
    (n) => selected.has(n.id) && !isLocked(n) && !hasSelectedParent(n),
  );
}
function hasSelectedParent(n: StudioNode) {
  let p = n.parentId;
  const seen = new Set<string>();
  while (p && !seen.has(p)) {
    if (selected.has(p)) return true;
    seen.add(p);
    p = value?.nodes.find((n) => n.id === p)?.parentId ?? null;
  }
  return false;
}
function align(mode: string) {
  const nodes = selectionRoots();
  if (!nodes.length) return;
  const w = number("width"),
    h = number("height");
  const positions = nodes.map((n) => ({
    n,
    p: matrix(n).transformPoint(new DOMPoint()),
  }));
  const xs = positions.map((x) => x.p.x),
    ys = positions.map((x) => x.p.y);
  for (const { n, p } of positions) {
    const x =
      mode === "left"
        ? Math.min(...xs)
        : mode === "right"
          ? Math.max(...xs)
          : mode === "center-x"
            ? w / 2
            : p.x;
    const y =
      mode === "top"
        ? Math.min(...ys)
        : mode === "bottom"
          ? Math.max(...ys)
          : mode === "center-y"
            ? h / 2
            : p.y;
    const local = parentMatrix(n).inverse().transformPoint(new DOMPoint(x, y));
    n.x = local.x;
    n.y = local.y;
  }
  changed(true);
}
function renderOverlay() {
  if (!ready) return;
  const svg = $("studio-overlay") as unknown as SVGSVGElement;
  svg.replaceChildren();
  const w = number("width") || 960,
    h = number("height") || 540;
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.classList.toggle("editing", field("studio-edit-canvas").checked);
  if (!field("studio-edit-canvas").checked) return;
  const ns = "http://www.w3.org/2000/svg";
  for (const n of [...(value?.nodes ?? [])]
    .filter((n) => n.enabled)
    .sort((a, b) => a.zIndex - b.zIndex)) {
    const g = document.createElementNS(ns, "g"),
      m = matrix(n);
    g.setAttribute(
      "transform",
      `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`,
    );
    const r = document.createElementNS(ns, "rect");
    r.setAttribute("x", String(-n.width / 2));
    r.setAttribute("y", String(-n.height / 2));
    r.setAttribute("width", String(n.width));
    r.setAttribute("height", String(n.height));
    r.setAttribute("vector-effect", "non-scaling-stroke");
    r.dataset.nodeId = n.id;
    r.dataset.handle = "move";
    r.classList.add("studio-outline");
    if (selected.has(n.id)) r.classList.add("selected");
    if (isLocked(n)) r.classList.add("locked");
    g.append(r);
    const text = document.createElementNS(ns, "text");
    text.setAttribute("x", String(-n.width / 2 + 4));
    text.setAttribute("y", String(-n.height / 2 - 8));
    text.setAttribute("font-size", "14");
    text.textContent = n.name;
    text.classList.add("studio-overlay-label");
    g.append(text);
    if (selected.has(n.id) && !isLocked(n))
      for (const [handle, x, y] of [
        ["scale", n.width / 2, n.height / 2],
        ["rotate", 0, -n.height / 2 - 28],
      ] as const) {
        const c = document.createElementNS(ns, "circle");
        c.setAttribute("cx", String(x));
        c.setAttribute("cy", String(y));
        c.setAttribute("r", "9");
        c.setAttribute("vector-effect", "non-scaling-stroke");
        c.dataset.nodeId = n.id;
        c.dataset.handle = handle;
        c.classList.add("studio-handle");
        const title = document.createElementNS(ns, "title");
        title.textContent = handle === "scale" ? "배율 조절" : "회전";
        c.append(title);
        g.append(c);
      }
    svg.append(g);
  }
}
function setupOverlay() {
  const svg = $("studio-overlay") as unknown as SVGSVGElement;
  const point = (e: PointerEvent) =>
    new DOMPoint(e.clientX, e.clientY).matrixTransform(
      svg.getScreenCTM()!.inverse(),
    );
  svg.addEventListener("pointerdown", (e) => {
    if (
      $("properties").getAttribute("aria-busy") === "true" ||
      !field("studio-edit-canvas").checked ||
      e.button !== 0
    )
      return;
    const target = e.target as SVGElement,
      id = target.dataset.nodeId,
      n = value?.nodes.find((n) => n.id === id);
    if (!n) {
      selected.clear();
      renderAll();
      return;
    }
    if (!selected.has(n.id)) {
      if (!e.shiftKey) selected.clear();
      selected.add(n.id);
    }
    renderList();
    renderInspector();
    renderOverlay();
    if (isLocked(n)) return;
    e.preventDefault();
    svg.focus();
    svg.setPointerCapture(e.pointerId);
    dragging = true;
    const start = point(e),
      original = selectionRoots().map((n) => ({
        n,
        x: n.x,
        y: n.y,
        scale: n.scale,
        rotation: n.rotation,
        parent: parentMatrix(n),
      }));
    const center = matrix(n).transformPoint(new DOMPoint()),
      handle = target.dataset.handle ?? "move";
    const startAngle = Math.atan2(start.y - center.y, start.x - center.x),
      startDistance = Math.hypot(start.x - center.x, start.y - center.y);
    const move = (event: PointerEvent) => {
      const p = point(event),
        snap = field("studio-snap").checked
          ? Math.max(1, number("studio-grid"))
          : 0;
      for (const o of original) {
        if (handle === "move") {
          const inv = o.parent.inverse();
          const a = inv.transformPoint(start),
            b = inv.transformPoint(p);
          o.n.x = o.x + b.x - a.x;
          o.n.y = o.y + b.y - a.y;
          if (snap) {
            o.n.x = Math.round(o.n.x / snap) * snap;
            o.n.y = Math.round(o.n.y / snap) * snap;
          }
        } else if (handle === "scale") {
          o.n.scale = Math.max(
            0.01,
            Math.min(
              20,
              (o.scale * Math.hypot(p.x - center.x, p.y - center.y)) /
                Math.max(1, startDistance),
            ),
          );
        } else {
          o.n.rotation =
            o.rotation +
            ((Math.atan2(p.y - center.y, p.x - center.x) - startAngle) * 180) /
              Math.PI;
          if (event.shiftKey) o.n.rotation = Math.round(o.n.rotation / 15) * 15;
        }
      }
      renderOverlay();
    };
    const end = () => {
      svg.removeEventListener("pointermove", move);
      svg.removeEventListener("pointerup", end);
      svg.removeEventListener("pointercancel", end);
      dragging = false;
      changed(true);
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
  });
}
function renderTimeline() {
  if (!ready) return;
  const container = $("studio-timeline");
  container.hidden = !value?.nodes.length;
  const lanes = $("studio-timeline-lanes");
  lanes.replaceChildren();
  if (!value) return;
  const total = Math.max(value.duration, Number(field("scrub").max) || 0);
  const seek = (time: number) => {
    field("scrub").value = String(time);
    field("scrub").dispatchEvent(new Event("input"));
  };
  for (const n of value.nodes) {
    const lane = el("div", undefined, "studio-lane");
    const name = button(n.name, () => {
      selected = new Set([n.id]);
      document
        .querySelector<HTMLButtonElement>("[data-panel=studio-panel]")!
        .click();
      renderAll();
    });
    name.className = "studio-lane-name";
    name.title = n.name;
    const track = el("div", undefined, "studio-lane-track");
    const bar = button(
      "",
      () => seek(n.start),
      `${n.name}: ${n.start}s – ${n.start + n.duration}s`,
    );
    bar.className = "studio-lane-bar";
    bar.classList.toggle("selected", selected.has(n.id));
    bar.style.left = `${(n.start / total) * 100}%`;
    bar.style.width = `${(Math.max(0, Math.min(n.duration, total - n.start)) / total) * 100}%`;
    bar.setAttribute("aria-label", `${n.name} 시작 위치로 이동`);
    track.append(bar);
    const times = [
      ...new Set(n.tracks.flatMap((t) => t.keys.map((k) => k.time))),
    ];
    for (const time of times) {
      if (n.start + time > total) continue;
      const key = button(
        "◆",
        () => seek(n.start + time),
        `${n.name} 키프레임 ${time}s`,
      );
      key.className = "studio-lane-key";
      key.style.left = `${((n.start + time) / total) * 100}%`;
      key.setAttribute("aria-label", `${n.name} 키프레임 ${time}초로 이동`);
      track.append(key);
    }
    lane.append(name, track);
    lanes.append(lane);
  }
  if (value.events.length) {
    const lane = el("div", undefined, "studio-lane");
    lane.append(el("span", "이벤트", "studio-lane-name"));
    const track = el("div", undefined, "studio-lane-track");
    for (const event of value.events) {
      const key = button(
        "⚑",
        () => seek(event.time),
        `${event.name} · ${event.time}s`,
      );
      key.className = "studio-lane-key event";
      key.style.left = `${(event.time / total) * 100}%`;
      track.append(key);
    }
    lane.append(track);
    lanes.append(lane);
  }
}
function renderAll() {
  if (!ready) return;
  renderList();
  renderInspector();
  renderSettings();
  renderOverlay();
  renderTimeline();
}
export function setupStudio(post: (data: unknown) => void) {
  send = post;
  const nav = document.querySelector(".tool-nav")!;
  const tab = button("▦ ", () => {});
  tab.dataset.panel = "studio-panel";
  tab.append(el("span", "합성 · 게임 UI"));
  nav.insertBefore(tab, nav.querySelector(".tool-note"));
  const panel = el("section", undefined, "inspector-panel");
  panel.id = "studio-panel";
  panel.innerHTML = `<h3>합성 · 게임 UI</h3><div class="studio-row"><label class="field">새 레이어<select id="studio-add-kind"><option value="text">텍스트</option><option value="image">이미지</option><option value="particles">파티클 방출기</option><option value="group">그룹</option><option value="button">버튼</option><option value="health-bar">체력바</option><option value="cooldown">쿨다운</option><option value="toast">알림</option><option value="item-card">아이템 카드</option></select></label><button type="button" id="studio-add">＋ 추가</button></div><p id="studio-node-count" class="hint"></p><div id="studio-nodes" role="group" aria-label="합성 레이어 목록"></div><div class="studio-row"><button type="button" id="studio-duplicate">선택 복제</button><button type="button" id="studio-delete">선택 삭제</button></div><p class="hint">Shift + 클릭으로 다중 선택. 잠금된 레이어는 캔버스에서 움직이지 않습니다.</p><details class="studio-section"><summary>선택 레이어 정렬</summary><div id="studio-align" class="studio-align"></div></details><div id="studio-node-inspector"></div><div id="studio-scene-settings"></div>`;
  $("properties").append(panel);
  const compositionTimeline = el("details", undefined, "studio-timeline");
  compositionTimeline.id = "studio-timeline";
  compositionTimeline.open = true;
  compositionTimeline.append(el("summary", "합성 트랙 · 키프레임"));
  const lanes = el("div");
  lanes.id = "studio-timeline-lanes";
  compositionTimeline.append(lanes);
  document.querySelector(".timeline")!.after(compositionTimeline);
  const stage = document.querySelector(".stage")!;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "studio-overlay";
  svg.setAttribute("aria-label", "합성 레이어 직접 편집");
  svg.setAttribute("tabindex", "0");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  stage.append(svg);
  const toolbar = el("div", undefined, "studio-canvas-toolbar");
  toolbar.innerHTML = `<label><input type="checkbox" id="studio-edit-canvas"/> 레이어 직접 편집</label><label><input type="checkbox" id="studio-snap" checked/> 스냅</label><label>격자 <input id="studio-grid" type="number" value="8" min="1" max="128" aria-label="스냅 격자 크기"/></label><span>드래그 이동 · ● 크기/회전</span>`;
  stage.before(toolbar);
  field("studio-edit-canvas").onchange = () => {
    if (field("studio-edit-canvas").checked) tab.click();
    renderOverlay();
  };
  $("studio-add").onclick = () => {
    const kind = field("studio-add-kind").value;
    if (["text", "image", "particles", "group"].includes(kind))
      addNode(kind as StudioNode["kind"]);
    else addNode("ui", kind as StudioWidgetKind);
    field("studio-edit-canvas").checked = true;
    renderOverlay();
  };
  $("studio-delete").onclick = deleteSelection;
  $("studio-duplicate").onclick = duplicateSelection;
  for (const [mode, label] of [
    ["left", "왼쪽 기준"],
    ["center-x", "화면 가로 중앙"],
    ["right", "오른쪽 기준"],
    ["top", "위쪽 기준"],
    ["center-y", "화면 세로 중앙"],
    ["bottom", "아래쪽 기준"],
  ])
    $("studio-align").append(button(label, () => align(mode)));
  $("properties").addEventListener("input", () => {
    if (!dragging) renderOverlay();
  });
  window.addEventListener("message", (e) => {
    if (
      e.origin !== location.origin ||
      e.source !== $<HTMLIFrameElement>("preview").contentWindow
    )
      return;
    if (e.data?.type === "gametool-event") {
      const out = $("studio-event-log");
      if (out) out.textContent = JSON.stringify(e.data.event ?? e.data);
    }
  });
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        $("properties").getAttribute("aria-busy") === "true" ||
        !field("studio-edit-canvas").checked ||
        !selected.size ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input,textarea,select,button,summary"))
      )
        return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      } else if (
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const step = e.shiftKey ? 10 : 1;
        for (const n of selectionRoots()) {
          n.x +=
            e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
          n.y += e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        }
        changed(true);
      }
    },
    { capture: true },
  );
  ready = true;
  setupOverlay();
  renderAll();
}
