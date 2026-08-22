/**
 * Waterfall view: every turn, step and tool call in the loaded window drawn
 * against ONE shared time axis.
 *
 * Source choice — `snapshot.chat.timeline`, not `snapshot.turnTimings`. The
 * map is a lossy derivative of that same timeline: it keeps two stamps per
 * turn, drops the steps entirely, and reports a still-open turn and a turn
 * whose `turn/end` fell outside the window identically, as a missing end. The
 * timeline carries `status`, so those two render differently here. Tool spans
 * come from the Chat Node index rather than `snapshot.nodes`, because a
 * `ToolResultNode` carries no turn/step of its own — only the Node's
 * `location` can place it in a lane.
 *
 * Geometry — bars are positioned in percent of the domain, so nothing is ever
 * measured and a resize costs no JS. The implementation this replaces mapped
 * milliseconds to percent directly (`ms / 20`), which pegged every span longer
 * than two seconds at full width and made every agent turn look identical.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { ChatConversationViewNode, ConversationTimelineSnapshot, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: merges the `sessionStats` key into SessionProjectionMap so the
// whole-log figures are reachable from this file alone rather than by accident
// of a sibling's import.
import type {} from '@deepseek-ai/dsh-session-stats/client'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconDataOutline16,
  IconWarningOutline16,
  Pill,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNode, ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import { isSettledTool } from './chat-nodes.ts'
import css from './WaterfallView.module.css'

/** The share of the `sessionViews` dictionary this view renders. */
type WaterfallKey =
  | 'view.waterfall'
  | 'waterfall.aria'
  | 'waterfall.caption'
  | 'waterfall.subtitle'
  | 'waterfall.empty.title'
  | 'waterfall.empty.body'
  | 'waterfall.empty.hint'
  | 'waterfall.legend'
  | 'waterfall.column.span'
  | 'waterfall.column.timeline'
  | 'waterfall.column.start'
  | 'waterfall.column.duration'
  | 'waterfall.kind.turn'
  | 'waterfall.kind.step'
  | 'waterfall.kind.tool'
  | 'waterfall.label.turn'
  | 'waterfall.label.step'
  | 'waterfall.state.running'
  | 'waterfall.state.failed'
  | 'waterfall.state.truncated'
  | 'waterfall.summary.spans'
  | 'waterfall.summary.window'
  | 'waterfall.summary.windowOnly'
  | 'waterfall.summary.session'
  | 'waterfall.summary.unplaceable'
  | 'waterfall.offset'
  | 'waterfall.detail'
  | 'waterfall.detail.running'
  | 'waterfall.expandTurn'
  | 'waterfall.collapseTurn'

type WaterfallCopy = Translate<WaterfallKey>

/**
 * The standard view kit plus a translate seat narrowed to the keys above rather
 * than the whole `PropsLocale<'sessionViews'>` namespace. The registration
 * still hands over the full namespace translate; typing the seat this way makes
 * a key this file uses but the dictionary has not merged yet a compile error at
 * that registration — the file that has to change — instead of a raw key
 * rendered at runtime.
 */
export type WaterfallViewProps = ConvViewProps & { t: WaterfallCopy }

/** Turn / step / tool lane, which is also the colour and indent ladder. */
type WaterfallKind = 'turn' | 'step' | 'tool'

/** One drawable span. `end === null` means no end event yet, never "unknown". */
interface WaterfallSpan {
  readonly id: string
  readonly kind: WaterfallKind
  /** Indent level; also drives the nested-tool tint past level 2. */
  readonly depth: number
  readonly turn: number
  readonly step: number | null
  /** Tool name (machine text); null for turn and step rows, whose label is localized. */
  readonly name: string | null
  readonly start: number
  readonly end: number | null
  /** A boundary event fell outside the loaded window — the bar disowns that edge. */
  readonly truncated: boolean
  readonly failed: boolean
}

/** The one axis every bar is measured against. `span` is never below 1ms. */
interface WaterfallDomain {
  readonly start: number
  readonly end: number
  readonly span: number
}

interface ToolIndex {
  /** turn -> step -> that step's tool spans, parents immediately before their children. */
  readonly byTurn: ReadonlyMap<number, ReadonlyMap<number, readonly WaterfallSpan[]>>
  /** Settled calls whose `tool/call` fell outside the window, so they have no start to draw from. */
  readonly unplaceable: number
}

type BarStyle = CSSProperties & {
  '--waterfall-bar-offset': string
  '--waterfall-bar-width': string
}

type DepthStyle = CSSProperties & { '--waterfall-depth': number }

type TickStyle = CSSProperties & { '--waterfall-tick-left': string }

const EMPTY_TURNS: ReadonlySet<number> = new Set()

/** Five ticks, four intervals — mirrored by `background-size: 25%` on `.track`. */
const WATERFALL_TICKS = 4

/** Row-depth ceiling for Code Dispatch recursion. Far below the Chat tool
 * Definition's own 256 cap on purpose: past this the 13px indent lane has eaten
 * the label column, so a deeper row could not be read even if it were drawn. */
const MAX_SPAN_DEPTH = 8

const LEGEND: readonly { readonly kind: WaterfallKind; readonly key: WaterfallKey }[] = [
  { kind: 'turn', key: 'waterfall.kind.turn' },
  { kind: 'step', key: 'waterfall.kind.step' },
  { kind: 'tool', key: 'waterfall.kind.tool' },
]

/**
 * Machine-text duration: milliseconds below a second, so an instant tool call
 * is not rounded away, then tenths, then minutes.
 */
function formatSpan(ms: number): string {
  const clamped = Math.max(0, ms)
  if (clamped < 1_000) return `${Math.round(clamped)}ms`
  if (clamped < 60_000) return `${Math.round(clamped / 100) / 10}s`
  const seconds = Math.round(clamped / 1_000)
  return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
}

function percent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 1_000) / 1_000
}

function barStyle(span: WaterfallSpan, domain: WaterfallDomain): BarStyle {
  const end = span.end ?? domain.end
  const offset = percent((span.start - domain.start) / domain.span * 100)
  const width = percent((end - span.start) / domain.span * 100)
  return {
    '--waterfall-bar-offset': `${offset}%`,
    '--waterfall-bar-width': `${percent(Math.min(width, 100 - offset))}%`,
  }
}

function earliest(spans: readonly WaterfallSpan[]): number | null {
  let found: number | null = null
  for (const span of spans) found = found === null ? span.start : Math.min(found, span.start)
  return found
}

/** Null when any child is still open: a parent cannot have finished before its work did. */
function latest(spans: readonly WaterfallSpan[]): number | null {
  let found: number | null = null
  for (const span of spans) {
    if (span.end === null) return null
    found = found === null ? span.end : Math.max(found, span.end)
  }
  return found
}

function toolRoot(node: ChatConversationViewNode): ToolCallBlock | undefined {
  return node.kind === 'tool-call' ? (node as ChatNode<'tool-call'>).data.root : undefined
}

interface ToolWalk {
  readonly spans: WaterfallSpan[]
  unplaceable: number
}

/** Flatten one tool lifecycle into spans, parents immediately before children. */
function walkTool(block: ToolCallBlock, turn: number, step: number, depth: number, walk: ToolWalk): void {
  if (isSettledTool(block)) {
    // callTime is null exactly when the paired tool/call is outside the loaded
    // window: there is no start, so the row is counted, not invented.
    if (block.callTime === null) walk.unplaceable += 1
    else {
      walk.spans.push({
        id: `tool:${block.callId}`,
        kind: 'tool',
        depth,
        turn,
        step,
        name: block.call?.name ?? block.callId,
        start: block.callTime,
        end: block.time,
        truncated: block.call === null,
        failed: block.isError,
      })
    }
  } else {
    walk.spans.push({
      id: `tool:${block.callId}`,
      kind: 'tool',
      depth,
      turn,
      step,
      name: block.name,
      start: block.time,
      end: null,
      truncated: false,
      failed: false,
    })
  }
  if (depth >= MAX_SPAN_DEPTH) {
    // Deeper Code Dispatch recursion stops being readable as rows long before
    // it stops being real, so the cap stays — but the header promises a count
    // of everything the plot could not draw, and returning here without
    // tallying made that promise false for exactly the deepest, least
    // inspectable calls.
    for (const child of block.subCalls) countTools(child, walk)
    return
  }
  for (const child of block.subCalls) walkTool(child, turn, step, depth + 1, walk)
}

/** Tally a subtree the plot will not draw, so the header's count stays honest. */
function countTools(block: ToolCallBlock, walk: ToolWalk): void {
  walk.unplaceable += 1
  for (const child of block.subCalls) countTools(child, walk)
}

/** Index every in-window tool span by the lane its Chat Node was placed in. */
function buildToolIndex(nodes: readonly ChatConversationViewNode[]): ToolIndex {
  const byTurn = new Map<number, Map<number, WaterfallSpan[]>>()
  const walk: ToolWalk = { spans: [], unplaceable: 0 }
  for (const node of nodes) {
    const root = toolRoot(node)
    if (root === undefined) continue
    // Only a step location places a call in a lane; anything else is a call the
    // Location index could not resolve, and guessing its turn would be a lie.
    // It is still tallied: the header renders this count as everything the plot
    // could not draw, so dropping the subtree in silence would make that number
    // claim a completeness it does not have. The placeholder turn/step below
    // never reach the plot — only the sizes of the walk do.
    if (node.location.kind !== 'step') {
      const orphan: ToolWalk = { spans: [], unplaceable: 0 }
      walkTool(root, -1, -1, 2, orphan)
      walk.unplaceable += orphan.spans.length + orphan.unplaceable
      continue
    }
    const turn = node.location.turn.turn
    const step = node.location.step.step
    walk.spans.length = 0
    walkTool(root, turn, step, 2, walk)
    if (walk.spans.length === 0) continue
    const steps = byTurn.get(turn) ?? new Map<number, WaterfallSpan[]>()
    byTurn.set(turn, steps)
    const lane = steps.get(step) ?? []
    steps.set(step, lane)
    lane.push(...walk.spans)
  }
  // Roots arrive in Node-store insertion order; sorting each lane by start
  // keeps the plot monotonic left-to-right without splitting a parent from the
  // subcalls that follow it (a subcall never starts before its parent).
  for (const steps of byTurn.values()) {
    for (const lane of steps.values()) lane.sort((left, right) => left.start - right.start)
  }
  return { byTurn, unplaceable: walk.unplaceable }
}

/**
 * Flatten the timeline into ordered spans: turn, then each of its steps with
 * that step's tool calls beneath it.
 */
function buildSpans(timeline: ConversationTimelineSnapshot, tools: ToolIndex): readonly WaterfallSpan[] {
  const out: WaterfallSpan[] = []
  for (const turn of timeline.turnOrder) {
    const location = timeline.turns.get(turn)
    if (location === undefined) continue
    const lanes = tools.byTurn.get(turn)
    const children: WaterfallSpan[] = []
    const covered = new Set<number>()
    for (const step of location.steps) {
      covered.add(step.step)
      const stepTools = lanes?.get(step.step) ?? []
      const start = step.start?.time ?? earliest(stepTools)
      if (start !== null) {
        children.push({
          id: `step:${turn}:${step.step}`,
          kind: 'step',
          depth: 1,
          turn,
          step: step.step,
          name: null,
          start,
          end: step.end?.time ?? (step.status === 'open' ? null : latest(stepTools)),
          truncated: step.status === 'unknown' || step.start === undefined,
          failed: false,
        })
      }
      children.push(...stepTools)
    }
    // A call can outlive the StepLocation that owned it when the step's own
    // boundary events were paged out; its tools still belong to this turn, so
    // they are appended rather than dropped.
    if (lanes !== undefined) {
      for (const step of [...lanes.keys()].sort((left, right) => left - right)) {
        if (covered.has(step)) continue
        children.push(...(lanes.get(step) ?? []))
      }
    }
    const start = location.start?.time ?? earliest(children)
    if (start === null) continue
    out.push({
      id: `turn:${turn}`,
      kind: 'turn',
      depth: 0,
      turn,
      step: null,
      name: null,
      start,
      end: location.end?.time ?? (location.status === 'open' ? null : latest(children)),
      truncated: location.status === 'unknown' || location.start === undefined,
      failed: false,
    })
    out.push(...children)
  }
  return out
}

/** Collapsing a turn must not rescale the axis, so this reads every span rather than the visible rows. */
function deriveDomain(spans: readonly WaterfallSpan[], now: number): WaterfallDomain {
  let start: number | null = null
  let end: number | null = null
  let open = false
  for (const span of spans) {
    start = start === null ? span.start : Math.min(start, span.start)
    if (span.end === null) open = true
    else end = end === null ? span.end : Math.max(end, span.end)
  }
  if (start === null) return { start: now, end: now, span: 1 }
  const resolved = Math.max(start, end ?? start, open ? now : start)
  // A single instantaneous turn would divide by zero; 1ms keeps every bar at
  // its minimum width instead of NaN.
  return { start, end: resolved, span: Math.max(1, resolved - start) }
}

function spanLabel(span: WaterfallSpan, t: WaterfallCopy): string {
  if (span.name !== null) return span.name
  if (span.step !== null) return t('waterfall.label.step', { turn: span.turn, step: span.step })
  return t('waterfall.label.turn', { turn: span.turn })
}

/** "Running" is already carried by the running sentence template, so only the qualifiers live here. */
function stateNotes(span: WaterfallSpan, t: WaterfallCopy): string[] {
  const notes: string[] = []
  if (span.failed) notes.push(t('waterfall.state.failed'))
  if (span.truncated) notes.push(t('waterfall.state.truncated'))
  return notes
}

/** The whole state phrase colour alone conveys, or null for a plain settled span. */
function stateText(span: WaterfallSpan, t: WaterfallCopy): string | null {
  const notes = stateNotes(span, t)
  if (span.end === null) notes.unshift(t('waterfall.state.running'))
  return notes.length === 0 ? null : notes.join(' · ')
}

/** Start offset against the shared zero, which the bar's left edge otherwise gives only to the eye. */
function offsetText(span: WaterfallSpan, domain: WaterfallDomain, t: WaterfallCopy): string {
  return t('waterfall.offset', { offset: formatSpan(span.start - domain.start) })
}

/**
 * The hover sentence. It restates figures the row already prints in its own
 * cells rather than carrying any of them alone: the tooltip anchor is a bare
 * div, so anything reachable only from here would be reachable only by mouse.
 */
function detailText(span: WaterfallSpan, domain: WaterfallDomain, t: WaterfallCopy): string {
  const params = {
    label: spanLabel(span, t),
    offset: formatSpan(span.start - domain.start),
    duration: formatSpan((span.end ?? domain.end) - span.start),
  }
  const base = span.end === null
    ? t('waterfall.detail.running', params)
    : t('waterfall.detail', params)
  const notes = stateNotes(span, t)
  return notes.length === 0 ? base : `${base} — ${notes.join(' · ')}`
}

/**
 * The plot's placeholder, in the four ranks the Files view uses rather than the
 * one caption line this view used to show: an empty waterfall is the whole
 * pane, and it has to say why it is empty (nothing timed yet), what fills it
 * and what it will still leave out (events outside the loaded window).
 */
function EmptyState({ t }: { t: WaterfallCopy }) {
  return (
    <div className={css.empty}>
      <span className={css.emptyGlyph} aria-hidden><IconDataOutline16 size={20} /></span>
      <p className={css.emptyTitle}>{t('waterfall.empty.title')}</p>
      <p className={css.emptyBody}>{t('waterfall.empty.body')}</p>
      <p className={css.emptyHint}>{t('waterfall.empty.hint')}</p>
    </div>
  )
}

/**
 * Session timing waterfall over the loaded conversation window; empty until a
 * turn has been timed.
 */
export function WaterfallView({
  useSession, useProjection, inspect, onInspectDone, t,
}: WaterfallViewProps) {
  const timeline = useSession(snapshot => snapshot.chat.timeline)
  // The Node store caches this array until a Node actually changes, so a
  // narrow selector here is stable across unrelated publications.
  const nodes = useSession(snapshot => snapshot.chat.nodes.values())
  const hasMore = useSession(snapshot => snapshot.hasMore)
  const stats = useProjection('sessionStats')
  const [collapsed, setCollapsed] = useState<ReadonlySet<number>>(EMPTY_TURNS)
  const [selected, setSelected] = useState<string | null>(null)
  const plotRef = useRef<HTMLDivElement | null>(null)

  // Re-activating the selected row clears it, which is the whole reason the row
  // itself is the control: a state another view can push in (the inspect
  // handoff below) but the reader cannot push back out is a dead end. Selection
  // keys off the span id rather than the row's position, so collapsing a turn
  // or a late tool event reordering `rows` cannot move it to another span.
  const toggleSelected = (id: string) => {
    setSelected(previous => previous === id ? null : id)
  }

  const tools = useMemo(() => buildToolIndex(nodes), [nodes])
  const spans = useMemo(() => buildSpans(timeline, tools), [timeline, tools])
  const live = spans.some(span => span.end === null)

  // A span with no end has to grow against a moving right edge or it would sit
  // frozen at the width it had when the last event landed. One second is the
  // coarsest tick that still reads as live; the interval exists only while
  // something is actually open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!live) return
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [live])

  const domain = useMemo(() => deriveDomain(spans, now), [spans, now])

  // The inspect handoff addresses a call, not a row: acknowledge it once, then
  // let the reveal below fall out of the selection rather than an effect.
  useEffect(() => {
    const callId = inspect?.callId
    if (callId === undefined) return
    const id = `tool:${callId}`
    setSelected(id)
    // Un-collapse for real instead of filtering around `collapsed`. A reveal
    // that merely outranked the chevron left the chevron inert on the revealed
    // turn — the glyph and aria-expanded both flipped while nothing folded —
    // and tied the row's existence to the selection, so clearing the selection
    // unmounted the focused row and dropped focus on document.body. The
    // handoff drops readers into that turn on purpose, so it is the one place
    // that must not be a trap.
    const turn = spans.find(span => span.id === id)?.turn
    if (turn !== undefined) {
      setCollapsed((previous) => {
        if (!previous.has(turn)) return previous
        const next = new Set(previous)
        next.delete(turn)
        return next
      })
    }
    onInspectDone?.()
  }, [inspect, onInspectDone, spans])

  const rows = useMemo(
    () => spans.filter(span => span.kind === 'turn' || !collapsed.has(span.turn)),
    [spans, collapsed],
  )

  // scrollIntoView is unimplemented in the test DOM and would also scroll the
  // conversation column; setting scrollTop keeps the effect inside this pane.
  useEffect(() => {
    const plot = plotRef.current
    if (selected === null || plot === null) return
    for (const row of plot.querySelectorAll<HTMLElement>('[data-span-id]')) {
      if (row.dataset.spanId !== selected) continue
      plot.scrollTop = Math.max(0, row.offsetTop - plot.clientHeight / 2)
      return
    }
  }, [selected, rows])

  const ticks: ReactNode[] = []
  for (let index = 0; index <= WATERFALL_TICKS; index += 1) {
    const style: TickStyle = { '--waterfall-tick-left': `${percent(index / WATERFALL_TICKS * 100)}%` }
    const edge = index === 0 ? 'start' : index === WATERFALL_TICKS ? 'end' : undefined
    ticks.push(
      <span key={index} className={css.tick} style={style} data-edge={edge}>
        {formatSpan(domain.span * index / WATERFALL_TICKS)}
      </span>,
    )
  }

  return (
    <section className={css.root} aria-label={t('waterfall.aria')} data-conversation-composer-overlay="">
      <header className={css.header}>
        <div className={css.headerTop}>
          <h2 className={css.title}>{t('view.waterfall')}</h2>
          {hasMore ? <Pill className={css.windowPill}>{t('waterfall.summary.windowOnly')}</Pill> : null}
        </div>
        <p className={css.subtitle}>{t('waterfall.subtitle')}</p>
        <p className={css.summary}>
          <span>{t('waterfall.summary.spans', { count: spans.length })}</span>
          <span className={css.sep} aria-hidden>·</span>
          <span>{t('waterfall.summary.window', { duration: formatSpan(domain.span) })}</span>
          {stats !== undefined && stats.steps > 0 ? (
            <>
              <span className={css.sep} aria-hidden>·</span>
              {/* Whole-log figures, deliberately in their own clause: they fold
                  the durable log while every figure left of them folds only the
                  loaded window, so the two must never be added together. */}
              <span>
                {t('waterfall.summary.session', {
                  llm: formatSpan(stats.llmMs),
                  tool: formatSpan(stats.toolMs),
                })}
              </span>
            </>
          ) : null}
          {tools.unplaceable > 0 ? (
            <>
              <span className={css.sep} aria-hidden>·</span>
              <span className={css.warn}>
                {t('waterfall.summary.unplaceable', { count: tools.unplaceable })}
              </span>
            </>
          ) : null}
        </p>
        <ul className={css.legend} aria-label={t('waterfall.legend')}>
          {LEGEND.map(entry => (
            <li key={entry.kind} className={css.legendItem}>
              <span className={css.legendSwatch} data-kind={entry.kind} aria-hidden />
              {t(entry.key)}
            </li>
          ))}
          <li className={css.legendItem}>
            <span className={css.legendSwatch} data-state="running" aria-hidden />
            {t('waterfall.state.running')}
          </li>
          <li className={css.legendItem}>
            <span className={css.legendSwatch} data-state="truncated" aria-hidden />
            {t('waterfall.state.truncated')}
          </li>
        </ul>
      </header>
      <div
        className={css.plot}
        ref={plotRef}
        onClick={(event) => {
          // Only the pane's own background clears. Without the target guard a
          // click that bubbled up from a row would wipe the selection that same
          // click had just made.
          if (event.target === event.currentTarget) setSelected(null)
        }}
      >
        {rows.length === 0 ? (
          <EmptyState t={t} />
        ) : (
          <table className={css.table}>
            <caption className={css.srOnly}>{t('waterfall.caption')}</caption>
            <colgroup>
              <col className={css.spanColumn} />
              <col />
              <col className={css.startColumn} />
              <col className={css.durationColumn} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">{t('waterfall.column.span')}</th>
                <th scope="col" className={css.axisHead}>
                  <span className={css.srOnly}>{t('waterfall.column.timeline')}</span>
                  <span className={css.axis} aria-hidden>{ticks}</span>
                </th>
                {/* The start offset is a column, not a tooltip line: it is the
                    one figure the axis renders only as a bar edge, and a
                    hover-only home would put it out of reach of a keyboard. */}
                <th scope="col" className={css.numericHead}>{t('waterfall.column.start')}</th>
                <th scope="col" className={css.numericHead}>{t('waterfall.column.duration')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((span) => {
                const shut = collapsed.has(span.turn)
                const state = stateText(span, t)
                const style: DepthStyle = { '--waterfall-depth': span.depth }
                return (
                  <tr
                    key={span.id}
                    // Plain tab order, no roving tabindex: the plot is a table a
                    // reader steps through, and an arrow-key cage would take the
                    // arrows away from the scroll they already do here.
                    tabIndex={0}
                    aria-selected={span.id === selected}
                    data-span-id={span.id}
                    data-kind={span.kind}
                    data-nested={span.depth > 2 || undefined}
                    data-open={span.end === null || undefined}
                    data-failed={span.failed || undefined}
                    data-truncated={span.truncated || undefined}
                    data-instant={(span.end !== null && span.end <= span.start) || undefined}
                    data-selected={span.id === selected || undefined}
                    onClick={() => { toggleSelected(span.id) }}
                    onKeyDown={(event) => {
                      // Keys pressed on the chevron belong to the chevron; only
                      // the row's own focus drives selection.
                      if (event.target !== event.currentTarget) return
                      if (event.key === 'Enter' || event.key === ' ') {
                        // Space scrolls the plot out from under the row otherwise.
                        event.preventDefault()
                        toggleSelected(span.id)
                        return
                      }
                      // Escape is only claimed while there is a selection to
                      // clear, so an empty plot leaves it to whatever encloses
                      // this view.
                      if (event.key !== 'Escape' || selected === null) return
                      event.preventDefault()
                      setSelected(null)
                    }}
                  >
                    <th scope="row" className={css.spanCell}>
                      <span className={css.spanInner} style={style}>
                        {span.kind === 'turn' ? (
                          <button
                            type="button"
                            className={css.toggle}
                            aria-expanded={!shut}
                            aria-label={shut
                              ? t('waterfall.expandTurn', { turn: span.turn })
                              : t('waterfall.collapseTurn', { turn: span.turn })}
                            onClick={(event) => {
                              // The chevron folds the turn; it does not also
                              // select the row it is drawn in.
                              event.stopPropagation()
                              setCollapsed((previous) => {
                                const next = new Set(previous)
                                if (!next.delete(span.turn)) next.add(span.turn)
                                return next
                              })
                            }}
                          >
                            {shut ? <IconChevronRightOutline14 /> : <IconChevronDownOutline14 />}
                          </button>
                        ) : <span className={css.togglePlaceholder} aria-hidden />}
                        <span className={css.spanLabel}>{spanLabel(span, t)}</span>
                        {span.end === null ? <StateDot state="ongoing" className={css.stateDot} /> : null}
                        {span.truncated ? <IconWarningOutline16 className={css.warnIcon} /> : null}
                        {state === null ? null : <span className={css.srOnly}>{state}</span>}
                      </span>
                    </th>
                    <td className={css.trackCell}>
                      <Tooltip label={() => detailText(span, domain, t)} side="top" delayMs={300} maxWidth={340}>
                        <div className={css.track}>
                          <span className={css.bar} style={barStyle(span, domain)} />
                        </div>
                      </Tooltip>
                    </td>
                    <td className={css.startCell}>{offsetText(span, domain, t)}</td>
                    <td className={css.durationCell}>
                      {formatSpan((span.end ?? domain.end) - span.start)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
