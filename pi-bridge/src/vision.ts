/**
 * Decides which model handles a message that contains images.
 *
 * Pi exposes each model's accepted input types as `input`, e.g. ["text"] or
 * ["text", "image"]. Only models that include "image" can receive images.
 */

type ModelLike = { id: string; name: string; provider: string; input?: readonly string[] };

export function supportsImages(model: ModelLike): boolean {
  return Array.isArray(model.input) && model.input.includes("image");
}

export type ImageRouting<T> =
  | { kind: "switch"; model: T }
  | { kind: "drop" };

/** Prefers a vision model from the same provider; otherwise the images will be dropped. */
export function pickModelForImages<T extends ModelLike>(current: T, available: readonly T[]): ImageRouting<T> {
  const sameProvider = available.find(
    (m) => m.provider === current.provider && m.id !== current.id && supportsImages(m),
  );
  return sameProvider ? { kind: "switch", model: sameProvider } : { kind: "drop" };
}
