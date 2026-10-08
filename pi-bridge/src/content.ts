/**
 * Converts the `content` of the last user message into Pi SDK prompt input.
 *
 * The backend sends either a plain string, or a list of parts:
 *   [{ type: "text", text: "..." }, { type: "image", image: { media_type, data } }]
 * Pi expects images as { type: "image", data, mimeType } with bare base64 data.
 */

export type PiImage = { type: "image"; data: string; mimeType: string };

export type PromptInput = { text: string; images: PiImage[] };

const ALLOWED_MEDIA_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

type IncomingPart =
  | { type: "text"; text?: string }
  | { type: "image"; image?: { media_type?: string; data?: string } };

export function toPromptInput(content: unknown): PromptInput {
  if (typeof content === "string") return { text: content, images: [] };
  if (!Array.isArray(content)) return { text: "", images: [] };

  let text = "";
  const images: PiImage[] = [];
  for (const part of content as IncomingPart[]) {
    if (part.type === "text") {
      text += part.text ?? "";
    } else if (part.type === "image" && part.image?.data) {
      const mediaType = part.image.media_type ?? "";
      if (!ALLOWED_MEDIA_TYPES.has(mediaType)) {
        throw new Error(`Unsupported image type: ${mediaType}`);
      }
      images.push({ type: "image", data: part.image.data, mimeType: mediaType });
    }
  }
  return { text, images };
}
