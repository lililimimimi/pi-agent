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

export const SessionSummarySchema = z
  .object({
    id: z.string(),
    title: z.string(),
    project_id: z.string(),
    created_at: z.string(),
  })
  .passthrough()

export const ProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    created_at: z.string(),
  })
  .passthrough()

export const BrowseResultSchema = z
  .object({
    current: z.string(),
    parent: z.string().nullable(),
    dirs: z.array(z.object({ name: z.string(), path: z.string() }).passthrough()),
  })
  .passthrough()

export type FileNode = {
  name: string
  type: 'dir' | 'file'
  path: string // relative to the project root; '' for the root itself
  size?: number
  children?: FileNode[] | null // null = directory not expanded by the server
}

export const FileNodeSchema: z.ZodType<FileNode> = z.lazy(() =>
  z
    .object({
      name: z.string(),
      type: z.enum(['dir', 'file']),
      path: z.string(),
      size: z.number().optional(),
      children: z.array(FileNodeSchema).nullable().optional(),
    })
    .passthrough(),
)

export const SessionListSchema = z.array(SessionSummarySchema)
export const ProjectListSchema = z.array(ProjectSchema)

export type SessionSummary = z.infer<typeof SessionSummarySchema>
export type ProjectData = z.infer<typeof ProjectSchema>
export type BrowseResult = z.infer<typeof BrowseResultSchema>
export type FileContent = z.infer<typeof FileContentSchema>

export const FileContentSchema = z
  .object({ path: z.string(), content: z.string(), size: z.number() })
  .passthrough()

export const CreateChatResponseSchema = z
  .object({ session_id: z.string(), persist_id: z.string() })
  .passthrough()

/** Records of one saved session: the meta line, then messages (each has a `type`) */
/** One line of a saved session: the meta line, or a message (with role and content) */
export const SessionRecordSchema = z
  .object({
    type: z.string(),
    role: z.string().optional(),
    content: z.string().optional(),
  })
  .passthrough()

export const SessionRecordsSchema = z.array(SessionRecordSchema)

export type SessionRecord = z.infer<typeof SessionRecordSchema>

// One event of the chat stream. Unknown events are an error: the backend and the page ship together.
export const SSEEventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('text'), data: z.object({ content: z.string() }).passthrough() }),
  z.object({
    event: z.literal('tool_call'),
    data: z
      .object({
        tool_call_id: z.string(),
        tool_name: z.string(),
        arguments: z.record(z.unknown()),
      })
      .passthrough(),
  }),
  z.object({
    event: z.literal('tool_result'),
    data: z.object({ tool_call_id: z.string(), output: z.string(), is_error: z.boolean() }).passthrough(),
  }),
  z.object({
    event: z.literal('usage'),
    data: z.object({ input_tokens: z.number(), output_tokens: z.number() }).passthrough(),
  }),
  z.object({ event: z.literal('done'), data: z.object({}).passthrough() }),
  z.object({ event: z.literal('error'), data: z.object({ message: z.string() }).passthrough() }),
  z.object({
    event: z.literal('execution_preview'),
    data: z
      .object({
        preview_id: z.string(),
        steps: z.array(z.string()),
        has_write_ops: z.boolean(),
      })
      .passthrough(),
  }),
])

export type SSEEvent = z.infer<typeof SSEEventSchema>

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
