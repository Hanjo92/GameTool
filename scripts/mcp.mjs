// Resolve the local TS loader from this file, independently of the client's cwd.
import { register } from "tsx/esm/api";
register();
await import("../apps/mcp/main.ts");
