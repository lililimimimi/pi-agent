import { ChevronRight, File as FileIcon, Folder, FolderOpen } from 'lucide-react'
import { useFileBrowserStore } from '@/stores/fileBrowserStore'
import type { FileNode } from '@/services/api/files'

type FileTreeNodeProps = {
  node: FileNode
  depth: number
}

// Recursive tree row. Children come from the store cache, so expanding a
// directory loads it lazily (one level per request).
export function FileTreeNode({ node, depth }: FileTreeNodeProps) {
  const isDir = node.type === 'dir'
  const expanded = useFileBrowserStore((s) => s.expanded.has(node.path))
  const loading = useFileBrowserStore((s) => s.loadingDirs.has(node.path))
  const children = useFileBrowserStore((s) => s.childrenByDir[node.path])
  const toggleDir = useFileBrowserStore((s) => s.toggleDir)
  const openFile = useFileBrowserStore((s) => s.openFile)

  const handleClick = () => {
    if (isDir) toggleDir(node.path)
    else void openFile(node.path)
  }

  const Icon = isDir ? (expanded ? FolderOpen : Folder) : FileIcon

  return (
    <div>
      <button
        onClick={handleClick}
        title={node.path}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
        className="flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm text-foreground/70 hover:bg-black/[0.06] transition-colors"
      >
        {isDir ? (
          <ChevronRight
            className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
            strokeWidth={2}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.8} />
        <span className="truncate leading-snug">{node.name}</span>
        {loading && <span className="ml-auto text-xs text-muted-foreground">…</span>}
      </button>

      {isDir && children && (
        // grid-rows 0fr → 1fr gives a height transition without measuring
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-out ${
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            {children.map((child) => (
              <FileTreeNode key={child.path} node={child} depth={depth + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
