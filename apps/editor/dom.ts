export const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export const field = (id: string) => $<HTMLInputElement>(id);
