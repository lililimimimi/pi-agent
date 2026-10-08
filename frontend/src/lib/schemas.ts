import { z } from 'zod'

// Responses from the backend, checked once at the API boundary.
// Extra fields are allowed, so adding a field on the backend never breaks the page.

export const ModelTestStatusSchema = z
  .object({
    ok: z.boolean(),
    checked_at: z.string().optional(),
    error: z.string().nullable().optional(),
    ms: z.number().nullable().optional(),
  })
  .passthrough()

export const ModelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    provider: z.string(),
    supports_tools: z.boolean(),
    supports_images: z.boolean(),
    status: ModelTestStatusSchema.nullable(),
  })
  .passthrough()

export const CatalogModelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    supports_images: z.boolean(),
    enabled: z.boolean(),
    status: ModelTestStatusSchema.nullable(),
  })
  .passthrough()

export const CatalogGroupSchema = z
  .object({
    provider: z.string(),
    label: z.string(),
    models: z.array(CatalogModelSchema),
  })
  .passthrough()

export const ProviderSchema = z
  .object({
    id: z.string(),
    label: z.string(),
    key_field: z.enum(['api_key', 'base_url', 'none']),
    placeholder: z.string(),
    api_key: z.string(),
    base_url: z.string(),
    enabled: z.boolean(),
    models: z.array(z.string()),
    connected: z.boolean(),
    configured: z.boolean(),
    note: z.string().optional(),
    readonly: z.boolean().optional(),
    custom: z.boolean().optional(),
  })
  .passthrough()

export const TestResultSchema = z
  .object({
    ok: z.boolean(),
    error: z.string().nullable().optional(),
    ms: z.number().nullable().optional(),
  })
  .passthrough()

/** Parses a response body; throws a readable error if the shape is not what the page expects. */
export function parseResponse<T extends z.ZodTypeAny>(schema: T, data: unknown, source: string): z.infer<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const first = result.error.issues[0]
    const where = first?.path.join('.') || '(root)'
    throw new Error(`Unexpected response from ${source}: ${where} ${first?.message ?? 'is invalid'}`)
  }
  return result.data
}
