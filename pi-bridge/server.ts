import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import express from "express";

// 加载后端 .env（bridge 和 backend 在同一项目根目录下）
const envPath = resolve(fileURLToPath(import.meta.url), "../../backend/.env");
dotenv.config({ path: envPath });

// Pi CLI does this at startup: forces HTTP/1.1 (allowH2: false).
// Without it, Node.js uses HTTP/2 which Anthropic rejects for OAuth tokens → 403.
import { configureHttpDispatcher } from
  "./node_modules/@earendil-works/pi-coding-agent/dist/core/http-dispatcher.js";
configureHttpDispatcher();
console.log("[bridge] HTTP dispatcher configured (HTTP/1.1 enforced, no H2)");

const PORT = parseInt(process.env.PI_BRIDGE_PORT || "3100", 10);

import chatRouter from "./src/routes/chat.js";
import authRouter from "./src/routes/auth.js";
import previewRouter from "./src/routes/preview.js";
import modelsRouter from "./src/routes/models.js";
import keysRouter from "./src/routes/keys.js";

export { previewRegistry } from "./src/state.js";

export const app = express();

app.use(express.json({ limit: "20mb" }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use(chatRouter);
app.use(authRouter);
app.use(previewRouter);
app.use(modelsRouter);
app.use(keysRouter);

// Only start listening / keep-alive when this file is run directly
// (not when imported by tests).
const isMain =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));

if (isMain) {
  app.listen(PORT, () => console.log(`pi-bridge listening on port ${PORT}`));

  // Keep process alive (Pi SDK imports may otherwise drain the event loop)
  setInterval(() => {}, 1 << 30);
}
