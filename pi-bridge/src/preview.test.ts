import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPreview,
  describeToolCall,
  extractSteps,
  isProjectEdit,
  isWriteTool,
  PreviewRegistry,
} from "./preview.js";

describe("preview classification", () => {
  it("treats read-only tools as non-write", () => {
    for (const tool of ["read", "grep", "find", "ls"]) {
      assert.equal(isWriteTool(tool), false, `${tool} should be read-only`);
    }
  });

  it("treats edit/write as write tools, and bash as write unless the command only reads", () => {
    for (const tool of ["edit", "write", "powershell"]) {
      assert.equal(isWriteTool(tool), true, `${tool} should be a write tool`);
    }
  });

  it("does not ask for a bash command that only reads, even when errors go to /dev/null", () => {
    const readOnly = [
      "pwd && ls -la && git status --short 2>/dev/null | head -30",
      "ls -la >/dev/null",
      "cat README.md 2>/dev/null",
      "ls -la /Users/me/web 2>&1 | head -50",
      "date +%Y-%m-%d && node -v 2>&1 && npm -v 2>&1",
      "python3 --version",
    ];
    for (const command of readOnly) {
      assert.equal(isWriteTool("bash", { command }), false, `${command} should be read-only`);
    }
  });

  it("does not ask for common read-only commands such as cd, sort, find and git log", () => {
    const readOnly = [
      "cd /Users/me/app && ls -la",
      "sort names.txt | uniq -c",
      "find . -name '*.ts' -not -path './node_modules/*'",
      "git log --oneline -5",
      "git ls-files",
    ];
    for (const command of readOnly) {
      assert.equal(isWriteTool("bash", { command }), false, `${command} should be read-only`);
    }
  });

  it("still asks for find with delete or exec, and for other writes", () => {
    const writes = [
      "find . -name '*.tmp' -delete",
      "find . -name '*.md' -exec rm {} \\;",
      "git commit -m x",
      "rm -rf build",
      "npm install",
      "node build.js",
    ];
    for (const command of writes) {
      assert.equal(isWriteTool("bash", { command }), true, `${command} should be a write`);
    }
  });

  it("still asks for a bash command that writes to a file", () => {
    const writes = ["echo hi > notes.txt", "ls 2>errors.log", "cat a.txt >> b.txt"];
    for (const command of writes) {
      assert.equal(isWriteTool("bash", { command }), true, `${command} should be a write`);
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
    assert.equal(describeToolCall("edit", { path: "main.py" }), "Edit main.py");
    assert.equal(describeToolCall("write", { file_path: "a.txt" }), "Write a.txt");
  });

  it("describes a bash command, truncating long ones", () => {
    assert.equal(describeToolCall("bash", { command: "pytest -q" }), "Run pytest -q");
    const long = "x".repeat(80);
    assert.equal(describeToolCall("bash", { command: long }), `Run ${"x".repeat(60)}…`);
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
    assert.deepEqual(steps, ["Write x.ts"]);
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

  it("lets read-only shell commands run without confirmation", () => {
    for (const command of ["ls -la", "pwd", "git status", "git log --oneline -5", "cat a.txt | wc -l"]) {
      assert.equal(isWriteTool("bash", { command }), false, `${command} should be read-only`);
    }
  });

  it("still asks for confirmation for writes, deletes and unknown commands", () => {
    for (const command of ["rm -rf build", "npm test", "echo hi > out.txt", "git commit -m x", "ls && rm x"]) {
      assert.equal(isWriteTool("bash", { command }), true, `${command} should need confirmation`);
    }
  });
});

describe("isProjectEdit (auto-approved edits)", () => {
  const cwd = "/Users/me/app";

  it("allows edits and new files inside the project", () => {
    assert.equal(isProjectEdit("edit", { path: "src/App.tsx" }, cwd), true);
    assert.equal(isProjectEdit("write", { file_path: "docs/plan.md" }, cwd), true);
    assert.equal(isProjectEdit("edit", { path: "/Users/me/app/src/a.ts" }, cwd), true);
  });

  it("does not allow paths outside the project", () => {
    assert.equal(isProjectEdit("edit", { path: "../other/a.ts" }, cwd), false);
    assert.equal(isProjectEdit("write", { path: "/etc/hosts" }, cwd), false);
    assert.equal(isProjectEdit("edit", { path: "/Users/me/app-old/a.ts" }, cwd), false);
  });

  it("never counts shell commands, reads, or calls without a path", () => {
    assert.equal(isProjectEdit("bash", { command: "echo hi > a.txt" }, cwd), false);
    assert.equal(isProjectEdit("read", { path: "src/App.tsx" }, cwd), false);
    assert.equal(isProjectEdit("edit", {}, cwd), false);
    assert.equal(isProjectEdit("edit", { path: "src/a.ts" }, ""), false);
  });
});
