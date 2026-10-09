/**
 * Execution preview.
 *
 * Before the first write tool call, the bridge pauses and asks the user to
 * confirm the agent's intended steps. This module holds the pieces that are
 * independent of Express / the Pi SDK:
 *
 * - `buildPreview()` derives a human-readable step list from the agent's own
 *   plan text, falling back to a description of the pending tool call.
 * - `PreviewRegistry` stores pending previews and resolves them on
 *   confirm / cancel / timeout.
 */

export const PREVIEW_TIMEOUT_MS = 60_000;

/** Tools that never modify state — they bypass the preview gate. */
export const READ_ONLY_TOOLS = new Set(["read", "grep", "find", "ls"]);

// Shell commands that only read. Anything else (or anything with redirects,
// substitutions or unknown commands) counts as a write and asks for confirmation.
const READ_ONLY_COMMANDS = new Set([
  "ls", "cat", "pwd", "head", "tail", "wc", "echo", "which", "grep", "rg", "file", "stat", "du", "df", "date", "whoami",
]);
const READ_ONLY_GIT = new Set(["status", "log", "diff", "show", "branch", "remote", "rev-parse"]);

function isReadOnlyShell(command: string): boolean {
  if (/[>`]|\$\(/.test(command)) return false; // redirects and substitutions can write
  const parts = command.split(/\s*(?:\|\||&&|;|\|)\s*/).filter(Boolean);
  return parts.length > 0 && parts.every((part) => {
    const [cmd, sub] = part.trim().split(/\s+/);
    if (cmd === "git") return READ_ONLY_GIT.has(sub ?? "");
    return READ_ONLY_COMMANDS.has(cmd);
  });
}

export function isWriteTool(toolName: string, args: ToolArgs = {}): boolean {
  if (toolName === "bash") {
    const command = str(args.command);
    return !(command && isReadOnlyShell(command));
  }
  return !READ_ONLY_TOOLS.has(toolName);
}

/** Instruction used to elicit a step-by-step plan from the agent. */
export const PREVIEW_PROMPT =
  "Before using any tool that writes, edits, or executes, first reply with a " +
  "short numbered list of the steps you intend to take. Keep each step to one line.";

type ToolArgs = Record<string, unknown>;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** One-line, human-readable description of a tool call. */
export function describeToolCall(toolName: string, args: ToolArgs = {}): string {
  const path = str(args.path) ?? str(args.file_path) ?? str(args.filePath);
  switch (toolName) {
    case "read":
      return path ? `Read ${path}` : "Read file";
    case "write":
      return path ? `Write ${path}` : "Write file";
    case "edit":
      return path ? `Edit ${path}` : "Edit file";
    case "bash":
    case "powershell": {
      const command = str(args.command) ?? "";
      const short = command.length > 60 ? `${command.slice(0, 60)}…` : command;
      return short ? `Run ${short}` : "Run command";
    }
    case "grep":
      return "Search code";
    case "find":
      return "Find files";
    case "ls":
      return path ? `List ${path}` : "List directory";
    default:
      return `Call ${toolName}`;
  }
}

/**
 * Pull a step list out of the agent's plan text. Understands numbered and
 * bulleted markdown lists; returns [] when the text contains no list.
 */
export function extractSteps(text: string): string[] {
  if (!text) return [];
  const steps: string[] = [];
  for (const raw of text.split("\n")) {
    const match = raw.match(/^\s*(?:\d+[.)]|[-*+])\s+(.+?)\s*$/);
    if (!match) continue;
    const step = match[1].replace(/\*\*/g, "").trim();
    if (step) steps.push(step);
  }
  return steps;
}

/**
 * Build the preview step list for a pending tool call. Prefers the plan the
 * agent already wrote; otherwise describes the tool call itself.
 */
export function buildPreview(input: {
  assistantText?: string;
  toolName: string;
  args?: ToolArgs;
  maxSteps?: number;
}): string[] {
  const maxSteps = input.maxSteps ?? 8;
  const steps = extractSteps(input.assistantText ?? "");
  const source =
    steps.length > 0 ? steps : [describeToolCall(input.toolName, input.args)];
  return source.slice(0, maxSteps);
}

// ── Pending preview registry ─────────────────────────────────────────────

export type PreviewDecision = "confirm" | "cancel" | "timeout";

export class PreviewRegistry {
  private resolvers = new Map<string, (decision: PreviewDecision) => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Register a preview and wait for its decision. Resolves with `"timeout"`
   * after `timeoutMs` (default 60s), invoking `onTimeout` first.
   */
  wait(
    previewId: string,
    options: { timeoutMs?: number; onTimeout?: (previewId: string) => void } = {},
  ): Promise<PreviewDecision> {
    const timeoutMs = options.timeoutMs ?? PREVIEW_TIMEOUT_MS;
    return new Promise<PreviewDecision>((resolve) => {
      const finish = (decision: PreviewDecision) => {
        const timer = this.timers.get(previewId);
        if (timer) clearTimeout(timer);
        this.timers.delete(previewId);
        this.resolvers.delete(previewId);
        resolve(decision);
      };
      this.resolvers.set(previewId, finish);
      this.timers.set(
        previewId,
        setTimeout(() => {
          finish("timeout");
          options.onTimeout?.(previewId);
        }, timeoutMs),
      );
    });
  }

  /** Confirm or cancel a pending preview. Returns false if unknown/expired. */
  resolve(
    previewId: string,
    decision: Exclude<PreviewDecision, "timeout">,
  ): boolean {
    const finish = this.resolvers.get(previewId);
    if (!finish) return false;
    finish(decision);
    return true;
  }

  has(previewId: string): boolean {
    return this.resolvers.has(previewId);
  }

  /** Clear all pending timers (shutdown / tests). */
  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.resolvers.clear();
    this.timers.clear();
  }
}
