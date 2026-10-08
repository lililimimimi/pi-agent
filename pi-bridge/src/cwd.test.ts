import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSessionCwd } from "./cwd.js";

describe("resolveSessionCwd", () => {
  const fallback = "/bridge/dir";

  it("uses the requested project folder when it exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "proj-"));
    assert.equal(resolveSessionCwd(dir, fallback), dir);
  });

  it("falls back when no path is given", () => {
    assert.equal(resolveSessionCwd(undefined, fallback), fallback);
    assert.equal(resolveSessionCwd("", fallback), fallback);
  });

  it("falls back when the path does not exist", () => {
    assert.equal(resolveSessionCwd("/no/such/project/xyz", fallback), fallback);
  });
});
