import { $ } from "./dom.js";

/** Tabs only change visibility: hidden controls remain part of the saved recipe. */
export function setupInspector() {
  const tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>("[data-panel]"),
  );
  const nav = document.querySelector<HTMLElement>(".tool-nav")!;
  nav.setAttribute("role", "tablist");
  function select(tab: HTMLButtonElement, focus = false) {
    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.classList.toggle("selected", selected);
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
      $(candidate.dataset.panel!).hidden = !selected;
    }
    $("inspector-section").textContent = tab.querySelector("span")!.textContent;
    document.querySelector(".inspector")!.scrollTop = 0;
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.type = "button";
    tab.id = `tab-${tab.dataset.panel}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", tab.dataset.panel!);
    const panel = $(tab.dataset.panel!);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = 0;
    tab.onclick = () => {
      select(tab);
      if (matchMedia("(max-width: 720px)").matches)
        document
          .querySelector(".inspector")!
          .scrollIntoView({ block: "start" });
    };
    tab.onkeydown = (event) => {
      const next =
        event.key === "ArrowRight"
          ? (index + 1) % tabs.length
          : event.key === "ArrowLeft"
            ? (index + tabs.length - 1) % tabs.length
            : event.key === "Home"
              ? 0
              : event.key === "End"
                ? tabs.length - 1
                : -1;
      if (next < 0) return;
      event.preventDefault();
      select(tabs[next], true);
    };
  });
  select(tabs[0]);
}
