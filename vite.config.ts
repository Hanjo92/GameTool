import { defineConfig } from "vite";
export default defineConfig({
  root: "apps/editor",
  build: { outDir: "../../dist/editor", emptyOutDir: true },
});
