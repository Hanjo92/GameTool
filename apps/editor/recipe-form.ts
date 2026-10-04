import { $, field } from "./dom.js";
import {
  defaultLayout,
  defaultMotion,
  defaultSequence,
  defaultBackdrop,
} from "../../runtimes/shared/options.js";
import {
  duration,
  defaultBackground,
  defaultTypography,
  defaultFrame,
  defaultImage,
  defaultParticles,
  type Recipe,
} from "../../runtimes/shared/motion.js";
import { timelineFor, precise } from "../../runtimes/shared/sequence.js";

function readLayer(group: string) {
  const result: Record<string, unknown> = {};
  for (const el of document.querySelectorAll<HTMLInputElement>(
    `[data-group="${group}"]`,
  ))
    result[el.dataset.key!] =
      el instanceof HTMLSelectElement && el.multiple
        ? Array.from(el.selectedOptions).map((o) => o.value)
        : el.type === "checkbox"
          ? el.checked
          : el.type === "number"
            ? Number(el.value)
            : el.dataset.key === "assetId"
              ? el.value || null
              : el.value;
  return result;
}
export function readRecipe(): Recipe {
  return {
    schemaVersion: 1,
    layout: readLayer("layout") as unknown as Recipe["layout"],
    motion: readLayer("motion") as unknown as Recipe["motion"],
    sequence: readLayer("sequence") as unknown as Recipe["sequence"],
    backdrop: readLayer("backdrop") as unknown as Recipe["backdrop"],
    textVisible: field("textVisible").checked,
    frame: readLayer("frame") as unknown as Recipe["frame"],
    typography: readLayer("typography") as unknown as Recipe["typography"],
    background: readLayer("background") as unknown as Recipe["background"],
    image: readLayer("image") as unknown as Recipe["image"],
    particles: readLayer("particles") as unknown as Recipe["particles"],
    text: field("text").value,
    color: field("color").value,
    fontSize: +field("fontSize").value,
    width: +field("width").value,
    height: +field("height").value,
    enter: +field("enter").value,
    hold: +field("hold").value,
    exit: +field("exit").value,
    effect: field("effect").value as Recipe["effect"],
    distance: +field("distance").value,
    loop: field("loop").checked,
    loopCount: +field("loopCount").value,
  };
}
export function timeline(r: Recipe) {
  const d = duration(r);
  field("scrub").max = String(d);
  $("duration-label").textContent = `${d.toFixed(2)} SEC`;
  for (const part of ["enter", "hold", "exit"] as const)
    $(part + "-block").style.flex = String(
      precise(r)
        ? part === "enter"
          ? timelineFor(r).pages[0].inEnd
          : part === "hold"
            ? r.hold
            : timelineFor(r).pages[0].end - timelineFor(r).pages[0].outStart
        : r[part],
    );
  $("color-value").textContent = r.color.toUpperCase();
  document.querySelector(".stage-dimensions")!.innerHTML =
    `${r.width} × ${r.height} <span>LOGICAL PX</span>`;
}
export function fill(r: Recipe) {
  for (const [key, value] of Object.entries(r)) {
    // Nested recipe.backdrop must not overwrite the preview-only backdrop select.
    if (typeof value === "object") continue;
    const el = document.getElementById(key) as HTMLInputElement;
    if (!el) continue;
    if (typeof value === "boolean") el.checked = value;
    else
      el.value =
        typeof value === "number"
          ? String(Math.round(value * 1e6) / 1e6)
          : String(value);
  }
  field("textVisible").checked = r.textVisible !== false;
  field("loopCount").value = String(r.loopCount ?? 0);
  for (const [group, values] of Object.entries({
    layout: { ...defaultLayout, ...r.layout },
    motion: { ...defaultMotion, ...r.motion },
    sequence: { ...defaultSequence, ...r.sequence },
    backdrop: { ...defaultBackdrop, ...r.backdrop },
    typography: r.typography ?? defaultTypography,
    frame: { ...defaultFrame, ...r.frame },
    background: {
      assetIds: [],
      filter: "none",
      fadeDirection: "out",
      transitionSource: "images",
      profile: "legacy",
      ...defaultBackground,
      ...r.background,
    },
    image: r.image ?? defaultImage,
    particles: { ...defaultParticles, ...r.particles },
  })) {
    for (const [key, value] of Object.entries(values)) {
      const el = field(`${group}-${key}`);
      if (Array.isArray(value) && el instanceof HTMLSelectElement) {
        const options = Array.from(el.options);
        el.replaceChildren(
          ...value
            .map((v) => options.find((o) => o.value === v)!)
            .filter(Boolean),
          ...options.filter((o) => !value.includes(o.value)),
        );
        for (const o of el.options) o.selected = value.includes(o.value);
      } else if (typeof value === "boolean") el.checked = value;
      else {
        if (
          el instanceof HTMLSelectElement &&
          typeof value === "string" &&
          value.startsWith("local:") &&
          !Array.from(el.options).some((o) => o.value === value)
        )
          el.add(new Option(value.slice(6) + " · 설치 폰트", value));
        el.value =
          typeof value === "number"
            ? String(Math.round(value * 1e6) / 1e6)
            : String(value ?? "");
      }
    }
  }
  const size = `${r.width}x${r.height}`;
  const sizeSelect = $<HTMLSelectElement>("size-preset");
  sizeSelect.value = Array.from(sizeSelect.options).some(
    (o) => o.value === size,
  )
    ? size
    : "";
  timeline(r);
}
