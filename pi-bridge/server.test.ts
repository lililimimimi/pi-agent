import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type http from "node:http";
import { app, previewRegistry } from "./server.js";

function startServer(port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = app.listen(port, () => resolve(server));
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe("pi-bridge", () => {
  const PORT = 3199;
  const BASE = `http://localhost:${PORT}`;

  it("health endpoint returns ok", async () => {
    const server = await startServer(PORT);
    try {
      const res = await fetch(`${BASE}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { status: "ok" });
    } finally {
      await closeServer(server);
    }
  });

  it("approve endpoint returns ok", async () => {
    const server = await startServer(PORT);
    try {
      const res = await fetch(`${BASE}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: "test",
          tool_call_id: "tc-1",
          approved: true,
        }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body, { status: "ok" });
    } finally {
      await closeServer(server);
    }
  });
});

describe("preview endpoints", () => {
  const PORT = 3198;
  const BASE = `http://localhost:${PORT}`;

  it("confirm endpoint resolves a pending preview", async () => {
    const server = await startServer(PORT);
    try {
      const pending = previewRegistry.wait("pv-confirm", { timeoutMs: 1000 });
      const res = await fetch(`${BASE}/preview/pv-confirm/confirm`, { method: "POST" });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: "ok" });
      assert.equal(await pending, "confirm");
    } finally {
      await closeServer(server);
    }
  });

  it("cancel endpoint resolves a pending preview", async () => {
    const server = await startServer(PORT);
    try {
      const pending = previewRegistry.wait("pv-cancel", { timeoutMs: 1000 });
      const res = await fetch(`${BASE}/preview/pv-cancel/cancel`, { method: "POST" });
      assert.equal(res.status, 200);
      assert.equal(await pending, "cancel");
    } finally {
      await closeServer(server);
    }
  });

  it("unknown preview returns 404", async () => {
    const server = await startServer(PORT);
    try {
      const res = await fetch(`${BASE}/preview/missing/confirm`, { method: "POST" });
      assert.equal(res.status, 404);
    } finally {
      await closeServer(server);
    }
  });
});
