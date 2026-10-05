import { $, field } from "./dom.js";
import { fill, readRecipe } from "./recipe-form.js";
import type { Recipe } from "../../runtimes/shared/motion.js";

interface Snapshot {
  name: string;
  recipe: Recipe;
}
/** Local edit history deliberately stays separate from persisted revisions. */
export function createEditHistory(changed: () => void, isBusy: () => boolean) {
  let entries: Snapshot[] = [],
    cursor = -1,
    timer: ReturnType<typeof setTimeout> | undefined,
    restoring = false;
  const snapshot = (): Snapshot => ({
    name: field("project-name").value,
    recipe: readRecipe(),
  });
  const refresh = () => {
    $<HTMLButtonElement>("edit-undo").disabled = isBusy() || cursor < 1;
    $<HTMLButtonElement>("edit-redo").disabled =
      isBusy() || cursor >= entries.length - 1;
    $("edit-history-state").textContent =
      cursor < 0 ? "편집 기록" : `${cursor}회 되돌리기 가능`;
  };
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (restoring || cursor < 0) return;
    const next = snapshot();
    if (JSON.stringify(next) === JSON.stringify(entries[cursor])) return;
    entries = [...entries.slice(0, cursor + 1), structuredClone(next)].slice(
      -100,
    );
    cursor = entries.length - 1;
    refresh();
  };
  const move = (direction: number) => {
    if (isBusy()) return;
    flush();
    const next = cursor + direction;
    if (next < 0 || next >= entries.length) return;
    cursor = next;
    restoring = true;
    fill(structuredClone(entries[cursor].recipe));
    field("project-name").value = entries[cursor].name;
    changed();
    restoring = false;
    refresh();
  };
  $("edit-undo").onclick = () => move(-1);
  $("edit-redo").onclick = () => move(1);
  window.addEventListener(
    "keydown",
    (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isBusy()) return;
      if (event.key.toLowerCase() !== "z" && event.key.toLowerCase() !== "y")
        return;
      event.preventDefault();
      move(event.key.toLowerCase() === "y" || event.shiftKey ? 1 : -1);
    },
    { capture: true },
  );
  return {
    reset() {
      clearTimeout(timer);
      entries = [structuredClone(snapshot())];
      cursor = 0;
      refresh();
    },
    record() {
      if (restoring || cursor < 0) return;
      clearTimeout(timer);
      timer = setTimeout(flush, 350);
    },
    flush,
    refresh,
  };
}
