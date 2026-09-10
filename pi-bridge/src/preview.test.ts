import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPreview,
  describeToolCall,
  extractSteps,
  isWriteTool,
  PreviewRegistry,
} from "./preview.js";

describe("preview classification", () => {
  it("treats read-only tools as non-write", () => {
    for (const tool of ["read", "grep", "find", "ls"]) {
      assert.equal(isWriteTool(tool), false, `${tool} should be read-only`);
    }
  });

  it("treats edit/write/bash as write tools", () => {
    for (const tool of ["edit", "write", "bash", "powershell"]) {
      assert.equal(isWriteTool(tool), true, `${tool} should be a write tool`);
    }
  });
});

describe("extractSteps", () => {
  it("extracts numbered steps", () => {
    const text = "I'll do this:\n1. Read main.py\n2. Edit foo()\n3. Run pytest";
    assert.deepEqual(extractSteps(text), ["Read main.py", "Edit foo()", "Run pytest"]);
  });

  it("extracts bulleted steps and strips bold markers", () => {
    const text = "- **Read** the file\n* Edit `foo`\n+ Run tests";
    assert.deepEqual(extractSteps(text), ["Read the file", "Edit `foo`", "Run tests"]);
  });

  it("returns [] when there is no list", () => {
    assert.deepEqual(extractSteps("Just some prose without steps."), []);
    assert.deepEqual(extractSteps(""), []);
  });
});

describe("describeToolCall", () => {
  it("describes a write tool call with a path", () => {
    assert.equal(describeToolCall("edit", { path: "main.py" }), "修改 main.py");
    assert.equal(describeToolCall("write", { file_path: "a.txt" }), "写入 a.txt");
  });

  it("describes a bash command, truncating long ones", () => {
    assert.equal(describeToolCall("bash", { command: "pytest -q" }), "运行 pytest -q");
    const long = "x".repeat(80);
    assert.equal(describeToolCall("bash", { command: long }), `运行 ${"x".repeat(60)}…`);
  });
});

describe("buildPreview", () => {
  it("prefers the agent's plan steps", () => {
    const steps = buildPreview({
      assistantText: "Plan:\n1. Read main.py\n2. Edit foo()",
      toolName: "edit",
      args: { path: "main.py" },
    });
    assert.deepEqual(steps, ["Read main.py", "Edit foo()"]);
  });

  it("falls back to describing the pending tool call", () => {
    const steps = buildPreview({ assistantText: "no list here", toolName: "write", args: { path: "x.ts" } });
    assert.deepEqual(steps, ["写入 x.ts"]);
  });

  it("caps the number of steps", () => {
    const text = Array.from({ length: 20 }, (_, i) => `${i + 1}. step ${i + 1}`).join("\n");
    const steps = buildPreview({ assistantText: text, toolName: "edit", maxSteps: 3 });
    assert.deepEqual(steps, ["step 1", "step 2", "step 3"]);
  });
});

describe("PreviewRegistry", () => {
  it("resolves a pending preview on confirm", async () => {
    const registry = new PreviewRegistry();
    const pending = registry.wait("pv-1", { timeoutMs: 1000 });
    assert.equal(registry.has("pv-1"), true);
    assert.equal(registry.resolve("pv-1", "confirm"), true);
    assert.equal(await pending, "confirm");
    assert.equal(registry.has("pv-1"), false);
  });

  it("resolves a pending preview on cancel", async () => {
    const registry = new PreviewRegistry();
    const pending = registry.wait("pv-2", { timeoutMs: 1000 });
    assert.equal(registry.resolve("pv-2", "cancel"), true);
    assert.equal(await pending, "cancel");
  });

  it("returns false when resolving an unknown preview", () => {
    const registry = new PreviewRegistry();
    assert.equal(registry.resolve("missing", "confirm"), false);
  });

  it("times out and invokes onTimeout", async () => {
    const registry = new PreviewRegistry();
    let timedOut: string | undefined;
    const decision = await registry.wait("pv-3", {
      timeoutMs: 15,
      onTimeout: (id) => {
        timedOut = id;
      },
    });
    assert.equal(decision, "timeout");
    assert.equal(timedOut, "pv-3");
    assert.equal(registry.has("pv-3"), false);
  });

  it("clears pending timers on dispose", async () => {
    const registry = new PreviewRegistry();
    registry.wait("pv-4", { timeoutMs: 1000 });
    registry.dispose();
    assert.equal(registry.has("pv-4"), false);
  });
});
