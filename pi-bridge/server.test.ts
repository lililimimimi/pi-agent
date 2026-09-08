import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type http from "node:http";
import { app } from "./server.js";

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
