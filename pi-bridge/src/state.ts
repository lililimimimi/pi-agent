import type { AgentSession } from "@earendil-works/pi-coding-agent";
import { PreviewRegistry } from "./preview.js";

export const sessions = new Map<string, AgentSession>();

export const previewRegistry = new PreviewRegistry();
