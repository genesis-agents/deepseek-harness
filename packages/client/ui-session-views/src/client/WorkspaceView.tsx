/**
 * Files view: the session's file surface as a folder tree, derived from what
 * each tool call declared it was doing rather than from anything the model
 * wrote in prose.
 */
import { useCallback, useId, useMemo, useState } from 'react'
import type { ChatConversationViewNode, ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  DisclosureRow, IconCodeOutline16, IconDataOutline16, IconFolderClose16, IconFolderOpenOutline16,
  IconPaperclipOutline16, IconQuestionOutline14, IconSkillOutline16, Pill, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNode, ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { isSettledTool } from './chat-nodes.ts'
import css from './WorkspaceView.module.css'

/**
 * How a path was touched. Every value is something a tool reported about its
 * own call, never something inferred from text: `edited`/`deleted` come from
 * the call view's render intent, `read` from a read card, `found` from a
 * search card's result list.
 *
 * Deliberately absent: `created`. A create and a full overwrite both present
 * `FileDiff.oldText === null` — a call-time presenter cannot see prior
 * content — so the two are indistinguishable here and the view refuses to
 * guess which one happened.
 */
type FileTouch = 'edited' | 'deleted' | 'read' | 'found'

/** Badge order: what the agent did to the file outranks what it saw. */
const TOUCH_ORDER: readonly FileTouch[] = ['edited', 'deleted', 'read', 'found']

const TOUCH_LABEL = {
  edited: 'files.touch.edited',
  deleted: 'files.touch.deleted',
  read: 'files.touch.read',
  found: 'files.touch.found',
} as const satisfies Record<FileTouch, string>

const TOUCH_CLASS: Record<FileTouch, string | undefined> = {
  edited: css.badgeEdited,
  deleted: css.badgeDeleted,
  read: css.badgeRead,
  found: css.badgeFound,
}

/** Same ceiling the Tool node definition applies to nested Code Mode dispatch. */
const MAX_TOOL_DEPTH = 256

type WorkspaceFilter = 'all' | FileTouch

type SessionViewsTranslate = PropsLocale<'sessionViews'>['t']

interface WorkspaceFile {
  /** The model-facing path exactly as the tool reported it. */
  readonly path: string
  readonly touches: ReadonlySet<FileTouch>
  /** Latest turn that touched the path; absent when the Node has no Location. */
  readonly turn: number | undefined
  /** Only a read card knows this, and only for the file it actually opened. */
  readonly totalLines: number | undefined
}

interface WorkspaceScan {
  readonly files: readonly WorkspaceFile[]
  /** A search card capped its own result list, so the tree is missing paths. */
  readonly searchCapped: boolean
}

interface FileDraft {
  readonly path: string
  readonly touches: Set<FileTouch>
  turn: number | undefined
  totalLines: number | undefined
}

/**
 * Paths a pending call reports it is changing, by render intent rather than
 * tool name.
 *
 * A diff card's changed files are its `diffs`: that field is REQUIRED and one
 * entry per changed file is what the card means, while `locations` is optional
 * editor follow-along ("usually the diffs' paths"). Reading `locations` alone —
 * which is what ui-deliverables' `producedPaths` does — drops every conforming
 * card that omits the optional field, and the file then either vanishes from
 * the tree or wears a read/found badge that misstates what happened to it. The
 * two derivations diverge here on purpose: ui-deliverables answers "what can
 * this turn open", where a follow-along location IS the answer, and this view
 * answers "what changed". The union covers a tool that fills only one field.
 */
function editedPaths(view: ToolResultNode['callView']): readonly string[] {
  if (view === null) return []
  if (view.card === 'diff') {
    return [...view.diffs.map(diff => diff.path), ...(view.locations ?? []).map(location => location.path)]
  }
  if (view.card === 'generic' && view.kind === 'edit') return (view.locations ?? []).map(location => location.path)
  return []
}

/**
 * Paths a settled call reports it changed. `DiffResultView` carries no
 * `locations` at all, so a tool that presents its write only at result time is
 * invisible to the call-side derivation; its `diffs` are the applied change and
 * the strongest evidence the view can get.
 */
function resultEditedPaths(view: ToolResultNode['resultView']): readonly string[] {
  if (view === null || view.card !== 'diff') return []
  return view.diffs.map(diff => diff.path)
}

/** Paths a generic call view declares under one file-touching kind. */
function genericPaths(view: ToolResultNode['callView'], kind: 'read' | 'delete'): readonly string[] {
  if (view === null || view.card !== 'generic' || view.kind !== kind) return []
  return (view.locations ?? []).map(location => location.path)
}

/** Paths a completed search surfaced, across both of its result shapes. */
function foundPaths(view: ToolResultNode['resultView']): readonly string[] {
  if (view === null || view.card !== 'search') return []
  return view.shape === 'paths' ? view.paths : view.files.map(file => file.path)
}

/**
 * Record one touch against a path in the first-seen-order accumulator,
 * returning the draft so a caller that also has a line count can attach it.
 */
function mark(
  into: Map<string, FileDraft>,
  path: string,
  touch: FileTouch,
  turn: number | undefined,
): FileDraft {
  const existing = into.get(path)
  const draft = existing ?? { path, touches: new Set<FileTouch>(), turn, totalLines: undefined }
  if (existing === undefined) into.set(path, draft)
  draft.touches.add(touch)
  // Latest wins: a file read in turn 2 and edited in turn 7 is labelled 7,
  // because the question a reader asks of this column is "how recent is this".
  if (turn !== undefined && (draft.turn === undefined || turn > draft.turn)) draft.turn = turn
  return draft
}

/** Fold one tool lifecycle and its nested dispatches into the accumulator. */
function collect(
  block: ToolCallBlock,
  turn: number | undefined,
  into: Map<string, FileDraft>,
  capped: { value: boolean },
  depth: number,
): void {
  if (depth > MAX_TOOL_DEPTH) return
  // A running call has not succeeded yet and a failed one changed nothing:
  // either would put a file in the tree that may never exist on disk.
  if (isSettledTool(block) && !block.isError) {
    for (const path of editedPaths(block.callView)) mark(into, path, 'edited', turn)
    for (const path of genericPaths(block.callView, 'delete')) mark(into, path, 'deleted', turn)
    for (const path of genericPaths(block.callView, 'read')) mark(into, path, 'read', turn)
    const result = block.resultView
    for (const path of resultEditedPaths(result)) mark(into, path, 'edited', turn)
    if (result !== null && result.card === 'read') {
      mark(into, result.path, 'read', turn).totalLines = result.totalLines
    }
    if (result !== null && result.card === 'search') {
      if (result.truncated) capped.value = true
      for (const path of foundPaths(result)) mark(into, path, 'found', turn)
    }
  }
  for (const child of block.subCalls) collect(child, turn, into, capped, depth + 1)
}

/**
 * Turn a chat Node belongs to, undefined for a session-scoped or unresolved
 * one. The Conversation Location index owns turn membership, so this never
 * infers a boundary from neighbouring Nodes.
 */
function turnOf(node: ChatConversationViewNode): number | undefined {
  const location = node.location
  return location.kind === 'turn' || location.kind === 'step' ? location.turn.turn : undefined
}

/** Scan every in-window tool Node for the files it declared it touched. */
function scanWorkspace(nodes: readonly ChatConversationViewNode[]): WorkspaceScan {
  const drafts = new Map<string, FileDraft>()
  const capped = { value: false }
  for (const node of nodes) {
    if (node.kind !== 'tool-call') continue
    collect((node as ChatNode<'tool-call'>).data.root, turnOf(node), drafts, capped, 0)
  }
  const files = [...drafts.values()].map((draft): WorkspaceFile => ({
    path: draft.path,
    touches: draft.touches,
    turn: draft.turn,
    totalLines: draft.totalLines,
  }))
  return { files, searchCapped: capped.value }
}

/** Split a posix or windows path on either separator, dropping empty and `.` segments. */
function segmentsOf(path: string): readonly string[] {
  return path.split(/[\\/]+/u).filter(segment => segment !== '' && segment !== '.')
}

/**
 * Segments to show for one path: workspace-relative when it sits under the
 * session cwd, otherwise the absolute path, which then groups under its own
 * root folder instead of needing a synthetic "elsewhere" bucket.
 */
function displaySegments(path: string, cwd: readonly string[]): readonly string[] {
  const segments = segmentsOf(path)
  if (cwd.length === 0 || segments.length <= cwd.length) return segments
  for (const [index, part] of cwd.entries()) {
    const own = segments[index]
    // Case-insensitive: the same workspace arrives as `D:\proj` from the host
    // and `d:/proj` from a tool that normalized it, and a case mismatch must
    // not fork one workspace into two roots.
    if (own === undefined || own.toLowerCase() !== part.toLowerCase()) return segments
  }
  return segments.slice(cwd.length)
}

type FileFamily = 'code' | 'data' | 'doc' | 'other'

const CODE_EXTENSIONS = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts', 'py', 'go', 'rs', 'java', 'kt', 'rb', 'php',
  'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'swift', 'sh', 'bash', 'ps1', 'sql', 'css', 'scss', 'less',
  'vue', 'svelte', 'html',
])

const DATA_EXTENSIONS = new Set(['json', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv', 'ini', 'env', 'lock'])

const DOC_EXTENSIONS = new Set(['md', 'mdx', 'txt', 'rst', 'adoc', 'pdf'])

/** Extension family behind a file row's glyph and tint; `other` covers an unknown or absent extension. */
function familyOf(name: string): FileFamily {
  const dot = name.lastIndexOf('.')
  const extension = dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
  if (CODE_EXTENSIONS.has(extension)) return 'code'
  if (DATA_EXTENSIONS.has(extension)) return 'data'
  if (DOC_EXTENSIONS.has(extension)) return 'doc'
  return 'other'
}

function familyIcon(family: FileFamily) {
  switch (family) {
    case 'code': return <IconCodeOutline16 />
    case 'data': return <IconDataOutline16 />
    case 'doc': return <IconSkillOutline16 />
    case 'other': return <IconPaperclipOutline16 />
  }
}

interface TreeFile {
  readonly kind: 'file'
  readonly key: string
  readonly name: string
  readonly file: WorkspaceFile
}

interface TreeFolder {
  readonly kind: 'folder'
  readonly key: string
  readonly name: string
  readonly children: readonly TreeNode[]
  readonly fileCount: number
}

type TreeNode = TreeFile | TreeFolder

interface FolderDraft {
  readonly name: string
  readonly key: string
  readonly folders: Map<string, FolderDraft>
  readonly files: TreeFile[]
}

function byName(left: TreeNode, right: TreeNode): number {
  return left.name.localeCompare(right.name)
}

/**
 * File the tree groups by; a path with no segments (a bare separator) is
 * dropped rather than becoming a nameless row.
 */
function insert(root: FolderDraft, segments: readonly string[], file: WorkspaceFile): void {
  let folder = root
  for (const [index, segment] of segments.entries()) {
    if (index === segments.length - 1) {
      folder.files.push({ kind: 'file', key: file.path, name: segment, file })
      return
    }
    const existing = folder.folders.get(segment)
    const key = folder.key === '' ? segment : `${folder.key}/${segment}`
    const next = existing ?? { name: segment, key, folders: new Map(), files: [] }
    if (existing === undefined) folder.folders.set(segment, next)
    folder = next
  }
}

/**
 * Finalize one folder draft, folding single-child chains into one row: an
 * intermediate folder holding nothing but another folder is a rung, not a
 * location, and `src/client/views` costs three rows of indentation for one
 * fact.
 */
function finalize(draft: FolderDraft): TreeFolder {
  let node = draft
  let name = draft.name
  for (;;) {
    const nested = [...node.folders.values()]
    const only = nested[0]
    if (node.files.length > 0 || nested.length !== 1 || only === undefined) break
    name = `${name}/${only.name}`
    node = only
  }
  const children = childrenOf(node)
  const fileCount = children.reduce((total, child) => total + (child.kind === 'file' ? 1 : child.fileCount), 0)
  return { kind: 'folder', key: node.key, name, children, fileCount }
}

/** Ordered children of one folder: folders first, each side alphabetical. */
function childrenOf(draft: FolderDraft): readonly TreeNode[] {
  const folders = [...draft.folders.values()].map(finalize).sort(byName)
  const files = [...draft.files].sort(byName)
  return [...folders, ...files]
}

/** Build the render tree for the already-filtered files. */
function buildTree(files: readonly WorkspaceFile[], cwd: readonly string[]): readonly TreeNode[] {
  const root: FolderDraft = { name: '', key: '', folders: new Map(), files: [] }
  for (const file of files) {
    const segments = displaySegments(file.path, cwd)
    if (segments.length === 0) continue
    insert(root, segments, file)
  }
  return childrenOf(root)
}

interface TreeRowProps {
  node: TreeNode
  /**
   * Folder keys the user has closed; folders are open by default, so the set
   * stays empty in the common case. The key is the collapsed chain's DEEPEST
   * segment, which means a later file landing halfway up the chain splits it
   * and reopens that folder once — cheap, and the alternative (keying on the
   * chain's head) would silently close an unrelated folder instead.
   */
  closed: ReadonlySet<string>
  onToggle: (key: string) => void
  /**
   * Path of the picked-out file, or null. A path and not a row position: the
   * filter pills and the folder toggles both re-shape the tree under the
   * selection, and an index would then point at whichever file slid into that
   * slot.
   */
  selectedPath: string | null
  onSelect: (path: string) => void
  t: SessionViewsTranslate
}

/**
 * Render one tree node and, for a folder, its subtree.
 *
 * Nesting is the indentation mechanism: children are DOM children of the
 * folder's disclosure root, so the stylesheet indents `.node > *` once and the
 * depth never has to be threaded through props or an inline style.
 */
function TreeRow({ node, closed, onToggle, selectedPath, onSelect, t }: TreeRowProps) {
  if (node.kind === 'file') {
    return <FileRow file={node} selected={node.file.path === selectedPath} onSelect={onSelect} t={t} />
  }
  const open = !closed.has(node.key)
  return (
    <DisclosureRow
      className={css.node}
      rowClassName={css.row}
      leadingClassName={css.leading}
      chevronClassName={css.chevron}
      titleClassName={css.folderName}
      // DisclosureRow swaps in its own chevron when open and consumes `icon`
      // only for the collapsed leading, so this is the closed-folder glyph
      // rather than a pair — an open arm here would never be painted.
      icon={<IconFolderClose16 />}
      title={node.name}
      open={open}
      expandable
      expandOnRowClick
      keepContentWhenOpen
      onToggle={() => { onToggle(node.key) }}
      collapsedContent={<span className={css.folderCount}>{node.fileCount}</span>}
    >
      {node.children.map(child => (
        <TreeRow
          key={child.key}
          node={child}
          closed={closed}
          onToggle={onToggle}
          selectedPath={selectedPath}
          onSelect={onSelect}
          t={t}
        />
      ))}
    </DisclosureRow>
  )
}

function badgeClass(touch: FileTouch): string {
  return [css.badge, TOUCH_CLASS[touch]].filter((c): c is string => c !== undefined).join(' ')
}

interface FileRowProps {
  file: TreeFile
  selected: boolean
  onSelect: (path: string) => void
  t: SessionViewsTranslate
}

/**
 * Render one file row: glyph, leaf name, provenance badges and the read-only
 * metadata the tool happened to report.
 *
 * The row is a toggle button, not an inert div with a tooltip on it. It still
 * cannot open the file — that needs `workspaces.openPath`, which reaches this
 * view only through an inject face the view registration does not declare — but
 * it can pick itself out and put its full path on screen, and the full path is
 * the row's identity: two `index.ts` rows differ by nothing else. A real button
 * takes Tab, Enter and Space from the browser, so there is no key handler here
 * to swallow a key the page needs, and `:focus-visible` stays a keyboard-only
 * ring. A div with `tabIndex` would have had to reimplement all three.
 */
function FileRow({ file, selected, onSelect, t }: FileRowProps) {
  const family = familyOf(file.name)
  const touches = TOUCH_ORDER.filter(touch => file.file.touches.has(touch))
  const seenOnly = touches.length === 1 && touches[0] === 'found'
  return (
    <div
      className={css.file}
      data-family={family}
      data-seen-only={seenOnly || undefined}
      data-deleted={file.file.touches.has('deleted') || undefined}
      data-selected={selected || undefined}
    >
      {/* Suppressed while selected: the bubble would repeat the path line the
          row is already showing, over the row it belongs to. */}
      <Tooltip label={file.file.path} side="top" delayMs={400} maxWidth={420} disabled={selected}>
        <button type="button" className={css.fileInner} aria-pressed={selected} onClick={() => { onSelect(file.file.path) }}>
          {/* The path opens the button's accessible name because it is the
              row's identity; the leaf name the eye reads is a suffix of it,
              and two `index.ts` rows are told apart by nothing else. */}
          <span className={css.srOnly}>{file.file.path}</span>
          <span className={css.fileMain}>
            <span className={css.fileIcon} aria-hidden>{familyIcon(family)}</span>
            {/* Hidden from the accessible name, not from the eye: the path
                already spells this segment out, so leaving it in would make
                the name stutter on the leaf. */}
            <span className={css.fileName} aria-hidden>{file.name}</span>
            <span className={css.meta}>
              {file.file.totalLines !== undefined && (
                <span>{t('files.meta.lines', { n: file.file.totalLines })}</span>
              )}
              {file.file.turn !== undefined && (
                <span>{t('files.meta.turn', { n: file.file.turn })}</span>
              )}
            </span>
            <span className={css.badges}>
              {touches.map(touch => (
                <Pill key={touch} className={badgeClass(touch)}>{t(TOUCH_LABEL[touch])}</Pill>
              ))}
            </span>
          </span>
          {/* The eye's copy of what the name above already carries, painted
              once the row is picked out so the path survives losing hover.
              aria-hidden because a reader has heard it once already. */}
          {selected && <span className={css.filePath} aria-hidden>{file.file.path}</span>}
        </button>
      </Tooltip>
    </div>
  )
}

const FILTER_ORDER: readonly WorkspaceFilter[] = ['all', 'edited', 'read', 'found', 'deleted']

interface EmptyStateProps {
  title: string
  body: string
  hint: string
}

/**
 * Render the designed empty state shared by "nothing yet" and "filter matched
 * nothing"; only the copy differs, so the shell does not fork.
 */
function EmptyState({ title, body, hint }: EmptyStateProps) {
  return (
    <div className={css.empty}>
      <span className={css.emptyGlyph} aria-hidden><IconFolderOpenOutline16 size={20} /></span>
      <p className={css.emptyTitle}>{title}</p>
      <p className={css.emptyBody}>{body}</p>
      <p className={css.emptyHint}>{hint}</p>
    </div>
  )
}

/**
 * Every path the loaded window's tools declared they read, changed, removed or
 * found, grouped into a folder tree under the workspace root.
 */
export function WorkspaceView({ useSession, useSessions, sessionId, t }: ConvViewProps & PropsLocale<'sessionViews'>) {
  // The derivation note is the answer to the question this button's accessible
  // name asks, and a Tooltip is pointer-only chrome: it opens on hover, and its
  // bubble is not referenced by anything a screen reader follows. Printing the
  // same copy into a described-by target is what stops the only explanation of
  // where this tree comes from from living behind a mouse.
  const derivationId = useId()
  // `chat.nodes.values()` is reference-stable until a Node object is replaced,
  // so this re-renders on tool traffic and stays quiet otherwise — unlike
  // `useSession(v => v)`, which fires on every publication because the
  // contract swaps the snapshot object each time.
  const nodes = useSession(state => state.chat.nodes.values())
  const hasMore = useSession(state => state.hasMore)
  const cwd = useSessions(state => state.byId[sessionId]?.cwd)
  const [filter, setFilter] = useState<WorkspaceFilter>('all')
  const [closed, setClosed] = useState<ReadonlySet<string>>(() => new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  const scan = useMemo(() => scanWorkspace(nodes), [nodes])
  const cwdSegments = useMemo(() => cwd === undefined ? [] : segmentsOf(cwd), [cwd])
  const counts = useMemo(() => {
    const totals: Record<FileTouch, number> = { edited: 0, deleted: 0, read: 0, found: 0 }
    for (const file of scan.files) for (const touch of file.touches) totals[touch] += 1
    return totals
  }, [scan])
  const visible = useMemo(
    () => filter === 'all' ? scan.files : scan.files.filter(file => file.touches.has(filter)),
    [scan, filter],
  )
  const tree = useMemo(() => buildTree(visible, cwdSegments), [visible, cwdSegments])

  const toggle = useCallback((key: string) => {
    setClosed((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })
  }, [])

  // Activating the selected row clears it. The scroll pane's background is the
  // other exit, but it only exists for a pointer and only when the tree leaves
  // empty space to hit, so the row itself has to be able to let go.
  const selectFile = useCallback((path: string) => {
    setSelectedPath(current => current === path ? null : path)
  }, [])

  const countOf = (value: WorkspaceFilter): number => value === 'all' ? scan.files.length : counts[value]

  return (
    <section className={css.root} aria-label={t('files.aria')} data-conversation-composer-overlay="">
      <header className={css.header}>
        <div className={css.headerTop}>
          <h2 className={css.title}>{t('files.title')}</h2>
          <Tooltip label={t('files.derivation')} side="bottom" delayMs={200} maxWidth={380}>
            <button
              type="button"
              className={css.help}
              aria-label={t('files.derivation.aria')}
              aria-describedby={derivationId}
            >
              <IconQuestionOutline14 />
            </button>
          </Tooltip>
          <span id={derivationId} className={css.srOnly}>{t('files.derivation')}</span>
        </div>
        <p className={css.subtitle}>{t('files.subtitle')}</p>
        {(hasMore || scan.searchCapped) && (
          <div className={css.notes}>
            {/* Both notes say the same kind of thing: the tree below is a
                lower bound. They are chrome only in appearance. */}
            {hasMore && <span className={css.note}>{t('files.note.window')}</span>}
            {scan.searchCapped && <span className={css.note}>{t('files.note.capped')}</span>}
          </div>
        )}
        <div className={css.filters} role="group" aria-label={t('files.filter.aria')}>
          {FILTER_ORDER.map((value) => {
            const total = countOf(value)
            // A zero-count filter hides itself, except while it is the active
            // one: dropping the pressed pill mid-session would leave the empty
            // state with no visible control explaining which filter caused it.
            if (value !== 'all' && total === 0 && filter !== value) return null
            const label = value === 'all' ? t('files.filter.all') : t(TOUCH_LABEL[value])
            return (
              <Pill
                key={value}
                className={css.filter}
                active={filter === value}
                aria-pressed={filter === value}
                onClick={() => { setFilter(value) }}
              >
                {label}
                <span className={css.filterCount}>{total}</span>
              </Pill>
            )
          })}
        </div>
      </header>
      <div
        className={css.scroll}
        // The identity guard is the whole rule: a click that bubbled up from a
        // row would otherwise wipe the selection that same click just made.
        onClick={(event) => { if (event.target === event.currentTarget) setSelectedPath(null) }}
      >
        {tree.length > 0 && (
          <div className={css.tree}>
            {tree.map(node => (
              <TreeRow
                key={node.key}
                node={node}
                closed={closed}
                onToggle={toggle}
                selectedPath={selectedPath}
                onSelect={selectFile}
                t={t}
              />
            ))}
          </div>
        )}
        {tree.length === 0 && scan.files.length > 0 && (
          <EmptyState
            title={t('files.filtered.title')}
            body={t('files.filtered.body')}
            hint={t('files.filtered.hint')}
          />
        )}
        {scan.files.length === 0 && (
          <EmptyState
            title={t('files.empty.title')}
            body={t('files.empty.body')}
            hint={t('files.empty.hint')}
          />
        )}
      </div>
    </section>
  )
}
