import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/api', () => ({
  fetchFileTree: vi.fn(),
  fetchFileContent: vi.fn(),
}))

import { fetchFileTree, fetchFileContent } from '@/services/api'
import { useFileBrowserStore, clampPreviewWidth, PREVIEW_MIN_WIDTH } from '../fileBrowserStore'

const treeOf = (children: unknown[]) => ({ name: 'root', type: 'dir', path: '', children })

beforeEach(() => {
  vi.clearAllMocks()
  useFileBrowserStore.setState({
    rootPath: null,
    childrenByDir: {},
    expanded: new Set(),
    loadingDirs: new Set(),
    error: null,
    pendingFile: null,
  })
})

describe('fileBrowserStore', () => {
  it('setRootPath loads the root listing one level deep', async () => {
    vi.mocked(fetchFileTree).mockResolvedValue(
      treeOf([{ name: 'src', type: 'dir', path: 'src', children: null }]) as never,
    )

    useFileBrowserStore.getState().setRootPath('/proj')
    await vi.waitFor(() => expect(useFileBrowserStore.getState().childrenByDir['']).toBeDefined())

    expect(fetchFileTree).toHaveBeenCalledWith('/proj', '', 1)
    expect(useFileBrowserStore.getState().childrenByDir[''][0].name).toBe('src')
  })

  it('expanding a directory lazy-loads its children once', async () => {
    useFileBrowserStore.setState({ rootPath: '/proj' })
    vi.mocked(fetchFileTree).mockResolvedValue(
      treeOf([{ name: 'App.tsx', type: 'file', path: 'src/App.tsx', size: 1 }]) as never,
    )

    useFileBrowserStore.getState().toggleDir('src')
    await vi.waitFor(() => expect(useFileBrowserStore.getState().childrenByDir['src']).toBeDefined())
    expect(fetchFileTree).toHaveBeenCalledWith('/proj', 'src', 1)
    expect(useFileBrowserStore.getState().expanded.has('src')).toBe(true)

    // Collapse then expand again: cached, no second request
    useFileBrowserStore.getState().toggleDir('src')
    useFileBrowserStore.getState().toggleDir('src')
    expect(fetchFileTree).toHaveBeenCalledTimes(1)
  })

  it('openFile stores the content as pendingFile', async () => {
    useFileBrowserStore.setState({ rootPath: '/proj' })
    vi.mocked(fetchFileContent).mockResolvedValue({ path: 'src/App.tsx', content: 'x', size: 1 })

    await useFileBrowserStore.getState().openFile('src/App.tsx')

    expect(fetchFileContent).toHaveBeenCalledWith('/proj', 'src/App.tsx')
    expect(useFileBrowserStore.getState().pendingFile).toEqual({ path: 'src/App.tsx', content: 'x' })
  })

  it('surfaces API errors in state', async () => {
    useFileBrowserStore.setState({ rootPath: '/proj' })
    vi.mocked(fetchFileContent).mockRejectedValue(new Error('Binary files are not supported'))

    await useFileBrowserStore.getState().openFile('image.bin')

    expect(useFileBrowserStore.getState().error).toBe('Binary files are not supported')
    expect(useFileBrowserStore.getState().pendingFile).toBeNull()
  })
})

describe('file preview pane', () => {
  beforeEach(() => {
    useFileBrowserStore.setState({ preview: null })
  })

  it('openFile fills both the preview and the pending attachment', async () => {
    useFileBrowserStore.setState({ rootPath: '/proj' })
    vi.mocked(fetchFileContent).mockResolvedValue({ path: 'src/App.tsx', content: 'line1\nline2', size: 11 })

    await useFileBrowserStore.getState().openFile('src/App.tsx')

    const state = useFileBrowserStore.getState()
    expect(state.preview).toEqual({ path: 'src/App.tsx', content: 'line1\nline2' })
    expect(state.pendingFile).toEqual({ path: 'src/App.tsx', content: 'line1\nline2' })
  })

  it('closePreview hides the pane but keeps the pending attachment', async () => {
    useFileBrowserStore.setState({ rootPath: '/proj' })
    vi.mocked(fetchFileContent).mockResolvedValue({ path: 'a.ts', content: 'x', size: 1 })
    await useFileBrowserStore.getState().openFile('a.ts')

    useFileBrowserStore.getState().closePreview()

    expect(useFileBrowserStore.getState().preview).toBeNull()
    expect(useFileBrowserStore.getState().pendingFile).not.toBeNull()
  })

  it('changing the root clears the preview', () => {
    useFileBrowserStore.setState({ rootPath: '/proj', preview: { path: 'a.ts', content: 'x' } })

    useFileBrowserStore.getState().setRootPath('/other')

    expect(useFileBrowserStore.getState().preview).toBeNull()
  })
})

describe('clampPreviewWidth', () => {
  it('keeps the preview at least the minimum width', () => {
    expect(clampPreviewWidth(50, 1400)).toBe(PREVIEW_MIN_WIDTH)
  })

  it('leaves room for the chat column on narrow windows', () => {
    // 1000px window: 1000 - 208 - 320 = 472 is the most the pane may take
    expect(clampPreviewWidth(900, 1000)).toBe(472)
  })

  it('caps very wide panes', () => {
    expect(clampPreviewWidth(2000, 4000)).toBe(900)
  })

  it('passes a reasonable width through unchanged', () => {
    expect(clampPreviewWidth(500, 1400)).toBe(500)
  })
})
