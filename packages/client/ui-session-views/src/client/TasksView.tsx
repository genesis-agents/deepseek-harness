/**
 * Tasks view: the current turn's todo ladder as the primary surface, with the
 * plan / goal / background-job facets beneath it.
 *
 * Every number on this screen is whole-log or live — `todos`, `plan` and
 * `goal` are host-folded projections over the complete durable log, and
 * running/pending/jobs are live session state. Nothing is derived from
 * `snapshot.nodes` or the timeline, which is why no count here needs the
 * "in the loaded window" caveat the Files and Waterfall views owe.
 */

import { useId } from 'react'
import type { CSSProperties, ReactNode } from 'react'
// Type-only domain outlets: each domain owns its own `SessionProjectionMap`
// merge, so naming the client namespace here is what makes this file
// self-sufficient — the previous stub compiled only because a sibling
// (InputBar) happened to pull the same two edges into the program.
import type { PlanProjection } from '@deepseek-ai/dsh-plan-mode/client'
import type { GoalPhase, GoalProjection } from '@deepseek-ai/dsh-goal/client'
import type { TodoItem } from '@deepseek-ai/dsh-tool-todo/client'
import type { JobView } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  IconChecklistOutline14, IconGoalOutline16, IconListPenOutline16, IconQueueOutline14,
  IconWarningOutline16, Pill, StateDot, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConvViewProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import css from './TasksView.module.css'

/** Full props of the tasks view entry: the framework standard kit plus the locale seat. */
export type TasksViewProps = ConvViewProps & PropsLocale<'sessionViews'>

/** The entry's bound translate, threaded down instead of re-deriving it per leaf. */
type Translate = TasksViewProps['t']

/** Stacked-meter track, stated as counts so CSS never has to re-divide them. */
type ProgressStyle = CSSProperties & {
  '--tasks-progress-done': string
  '--tasks-progress-active': string
  '--tasks-progress-pending': string
}

type GoalRoundsStyle = CSSProperties & { '--tasks-goal-rounds': string }

/**
 * Shared identity for "no jobs for this session". The host omits the key
 * entirely rather than sending an empty list, and a selector that minted a
 * fresh `[]` on every read would never let useSyncExternalStore settle.
 */
const NO_JOBS: readonly JobView[] = []

/**
 * Buckets in reading order: what is being worked now, then what is next, then
 * what is behind us. The projection's array order is whatever the model last
 * wrote and carries no status semantics, so grouping adds meaning rather than
 * destroying it; order *within* a bucket stays as written.
 */
const TODO_ORDER: readonly TodoItem['status'][] = ['in_progress', 'pending', 'completed']

const TODO_GROUP_KEY = {
  in_progress: 'tasks.group.active',
  pending: 'tasks.group.pending',
  completed: 'tasks.group.completed',
} as const satisfies Record<TodoItem['status'], string>

const GOAL_PHASE_KEY = {
  active: 'tasks.goal.phase.active',
  paused: 'tasks.goal.phase.paused',
  blocked: 'tasks.goal.phase.blocked',
  complete: 'tasks.goal.phase.complete',
} as const satisfies Record<GoalPhase, string>

/** `stopping` is still in flight, so it keeps the running dot; `killed` is a deliberate stop, not a failure. */
const JOB_DOT = {
  running: 'ongoing',
  stopping: 'ongoing',
  completed: 'done',
  killed: 'warning',
  failed: 'error',
} as const satisfies Record<JobView['status'], StateDotState>

/**
 * Hover-only dwell before the job bubble opens: Tooltip applies `delayMs` to
 * the pointer alone and calls `show()` straight from the injected `onFocus`,
 * so raising it never slows the keyboard path down.
 */
const JOB_TOOLTIP_DELAY_MS = 400

/** Bubble cap in pixels; a full command line would otherwise render a slab wider than the card it hangs off. */
const JOB_TOOLTIP_MAX_WIDTH = 420

const JOB_STATUS_KEY = {
  running: 'row.running',
  stopping: 'tasks.job.stopping',
  completed: 'tasks.group.completed',
  killed: 'row.stopped',
  failed: 'row.failed',
} as const satisfies Record<JobView['status'], string>

// Empty while the job is still live: this view owns no ticker, so a rendered
// span would freeze at its mount value and read as a settled duration.
function elapsedText(job: JobView, t: Translate): string {
  if (job.finishedAt === undefined) return ''
  const ms = Math.max(0, job.finishedAt - job.startedAt)
  if (ms < 1000) return t('tasks.job.elapsed.ms', { value: Math.round(ms) })
  if (ms < 60_000) return t('tasks.job.elapsed.s', { value: (ms / 1000).toFixed(1) })
  return t('tasks.job.elapsed.m', { minutes: Math.floor(ms / 60_000), seconds: Math.floor(ms % 60_000 / 1000) })
}

function TodoMarker({ status }: { status: TodoItem['status'] }) {
  if (status === 'completed') return <StateDot state="done" />
  if (status === 'in_progress') return <StateDot state="ongoing" />
  // StateDot has no unstarted member — see .pendingRing for why not `warning`.
  return <span className={css.pendingRing} aria-hidden />
}

// `primary` promotes exactly one surface per view to the dashed card; giving
// every facet that treatment would put four placeholders in equal competition
// with the todo ladder they sit under.
function EmptyState({ icon, text, primary = false }: {
  icon: ReactNode
  text: string
  primary?: boolean | undefined
}) {
  const className = [css.empty, primary ? css.emptyPrimary : undefined]
    .filter((c): c is string => c !== undefined).join(' ')
  return (
    <div className={className}>
      <span className={css.emptyGlyph} aria-hidden>{icon}</span>
      <p className={css.emptyText}>{text}</p>
    </div>
  )
}

// The body is taken whole rather than wrapped in a padded slot, so a list body
// can flush its own padding and let its row rules meet the card edge.
function FacetCard({ icon, title, badge, wide = false, children }: {
  icon: ReactNode
  title: string
  badge?: ReactNode
  wide?: boolean | undefined
  children: ReactNode
}) {
  const titleId = useId()
  const className = [css.card, wide ? css.cardWide : undefined]
    .filter((c): c is string => c !== undefined).join(' ')
  return (
    <section className={className} aria-labelledby={titleId}>
      <header className={css.cardHeader}>
        <span className={css.cardIcon} aria-hidden>{icon}</span>
        <h3 id={titleId} className={css.cardTitle}>{title}</h3>
        {badge}
      </header>
      {children}
    </section>
  )
}

// An empty bucket renders nothing rather than an empty heading: the progress
// meter above already states every zero, so a "Pending 0" rule would repeat it
// while pushing the buckets that do have rows further down.
function TodoGroup({ status, items, t }: {
  status: TodoItem['status']
  items: readonly TodoItem[]
  t: Translate
}) {
  if (items.length === 0) return null
  const label = t(TODO_GROUP_KEY[status])
  return (
    <div className={css.group}>
      <div className={css.groupHeader}>
        <span className={css.groupLabel}>{label}</span>
        <span className={css.groupCount}>{items.length}</span>
        <span className={css.groupRule} aria-hidden />
      </div>
      {/* No tabIndex on the rows: a todo row carries no action and hides no
          datum behind a pointer — marker, bucket and content are all in the
          list's own text — so a tab stop here would cost every keyboard user
          one press per todo and return a focus ring for it. */}
      <ul className={css.todoList} aria-label={label}>
        {items.map(item => (
          // `content` is invariant-guaranteed non-empty, trimmed and unique
          // within one todo/write list, so it is a stable key that survives a
          // reorder — the stub's `content + index` did not.
          <li key={item.content} className={css.todoRow} data-status={item.status}>
            <span className={css.todoMarker}><TodoMarker status={item.status} /></span>
            <span className={css.visuallyHidden}>{label}</span>
            <span className={css.todoText}>{item.content}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// `undefined` is the plan capability being absent from the session, not plan
// mode being off, so it takes the empty state rather than the "Off" chip.
function PlanCard({ plan, t }: { plan: PlanProjection | undefined; t: Translate }) {
  const badge = plan?.pending === true
    ? <Pill className={css.cardBadge}>{t('tasks.plan.pending')}</Pill>
    : undefined
  return (
    <FacetCard icon={<IconListPenOutline16 />} title={t('tasks.plan.title')} badge={badge}>
      {plan === undefined
        ? <EmptyState icon={<IconListPenOutline16 />} text={t('tasks.plan.unavailable')} />
        : (
          <div className={css.cardBody}>
            <div className={css.planState}>
              <span className={css.statusChip} data-tone={plan.active ? 'active' : undefined}>
                {plan.active ? t('tasks.plan.on') : t('tasks.plan.off')}
              </span>
            </div>
            <p className={css.planDesc}>{plan.active ? t('tasks.plan.on.desc') : t('tasks.plan.off.desc')}</p>
          </div>
        )}
    </FacetCard>
  )
}

// `null` (cleared) and `undefined` (capability absent) both mean there is no
// objective to show, so they share one empty state instead of splitting copy
// over a distinction the reader cannot act on.
function GoalCard({ goal, t }: { goal: GoalProjection | null | undefined; t: Translate }) {
  if (goal === null || goal === undefined) {
    return (
      <FacetCard icon={<IconGoalOutline16 />} title={t('tasks.goal.title')}>
        <EmptyState icon={<IconGoalOutline16 />} text={t('tasks.goal.empty')} />
      </FacetCard>
    )
  }
  const { objective, phase, blockedReason, maxGoalRounds } = goal.goal
  // A non-positive cap means no budget was recorded; the bar is dropped rather
  // than drawn against a denominator this seat would have to invent.
  const rounds = maxGoalRounds > 0 ? Math.min(1, goal.roundsStarted / maxGoalRounds) : null
  const badge = (
    <span className={`${css.statusChip} ${css.cardBadge}`} data-tone={phase}>{t(GOAL_PHASE_KEY[phase])}</span>
  )
  return (
    <FacetCard icon={<IconGoalOutline16 />} title={t('tasks.goal.title')} badge={badge}>
      <div className={css.cardBody}>
        <p className={css.goalObjective}>{objective}</p>
        {rounds !== null && (
          <div className={css.goalRounds}>
            <span className={css.goalRoundsLabel}>
              {t('tasks.goal.rounds', { started: goal.roundsStarted, max: maxGoalRounds })}
            </span>
            <div
              className={css.goalRoundsTrack}
              role="progressbar"
              aria-label={t('tasks.goal.roundsAria')}
              aria-valuemin={0}
              aria-valuemax={maxGoalRounds}
              aria-valuenow={goal.roundsStarted}
            >
              <div className={css.goalRoundsFill} style={{ '--tasks-goal-rounds': `${rounds * 100}%` } as GoalRoundsStyle} />
            </div>
          </div>
        )}
        {blockedReason !== undefined && (
          <div className={css.goalBlocked}>
            <span className={css.goalBlockedIcon} aria-hidden><IconWarningOutline16 /></span>
            <p className={css.goalBlockedText}>
              {t('tasks.goal.blocked', { code: blockedReason.code, message: blockedReason.message })}
            </p>
          </div>
        )}
      </div>
    </FacetCard>
  )
}

function JobRow({ job, t }: { job: JobView; t: Translate }) {
  const status = t(JOB_STATUS_KEY[job.status])
  const elapsed = elapsedText(job, t)
  // `label` is the producer's command line, clipped to the lane width; `detail`
  // is its kind-specific settle note ("exit code: 3") and has no column at all.
  // The reveal carries both, so reading it never costs the reader the command.
  const reveal = job.detail === undefined ? job.label : t('tasks.job.tooltip', { label: job.label, detail: job.detail })
  const baseLabel = t('tasks.job.aria', { job: reveal, kind: job.kind, status })
  const rowLabel = elapsed === '' ? baseLabel : baseLabel + t('tasks.job.aria.elapsed', { elapsed })
  return (
    // The reveal is composed into the row's accessible name, so the bubble is a
    // pointer-only restatement rather than the only home of anything. That is
    // also why the row takes no tabIndex: nothing here can be activated, and a
    // tab stop whose only effect is to open a bubble the reader has already
    // heard is a dead end — one per background job, ahead of whatever the
    // reader was actually tabbing towards.
    <Tooltip label={reveal} side="top" delayMs={JOB_TOOLTIP_DELAY_MS} maxWidth={JOB_TOOLTIP_MAX_WIDTH}>
      <li className={css.jobRow} data-status={job.status} aria-label={rowLabel}>
        <span className={css.jobMarker}><StateDot state={JOB_DOT[job.status]} /></span>
        <span className={css.visuallyHidden}>{status}</span>
        <span className={css.jobLabel}>{job.label}</span>
        <Pill className={css.jobKind}>{job.kind}</Pill>
        <span className={css.jobStatus} aria-hidden>{status}</span>
        <span className={css.jobElapsed}>{elapsed}</span>
      </li>
    </Tooltip>
  )
}

// The badge counts only running/stopping jobs, not the list length: a card
// showing eight settled jobs and nothing live would otherwise read as eight
// jobs in flight.
function JobsCard({ jobs, t }: { jobs: readonly JobView[]; t: Translate }) {
  const live = jobs.filter(job => job.status === 'running' || job.status === 'stopping').length
  const badge = live > 0 ? <Pill className={css.cardBadge}>{t('tasks.jobs.live', { count: live })}</Pill> : undefined
  return (
    <FacetCard wide icon={<IconQueueOutline14 />} title={t('tasks.jobs.title')} badge={badge}>
      {jobs.length === 0
        ? <EmptyState icon={<IconQueueOutline14 />} text={t('tasks.jobs.empty')} />
        : (
          <div className={`${css.cardBody} ${css.cardBodyFlush}`}>
            <ul className={css.jobList}>
              {jobs.map(job => <JobRow key={job.id} job={job} t={t} />)}
            </ul>
          </div>
        )}
    </FacetCard>
  )
}

/**
 * Todos, plan, goal and background jobs for the session, on one pane: the
 * projections are selected individually so unrelated store frames stay quiet.
 */
export function TasksView({ useProjection, useSession, useSessions, sessionId, t }: TasksViewProps) {
  const titleId = useId()
  const todos = useProjection('todos')
  const plan = useProjection('plan')
  const goal = useProjection('goal')
  // Narrow selections: the snapshot object is swapped on every publication, so
  // selecting the whole value (as the stub did) re-renders on unrelated frames.
  const jobs = useSessions(state => state.jobsBySession[sessionId] ?? NO_JOBS)
  const running = useSession(state => state.running)
  const blocked = useSession(state => state.pending.length)
  const queued = useSession(state => state.queue.length)

  const list = todos ?? []
  const done = list.filter(item => item.status === 'completed').length
  const active = list.filter(item => item.status === 'in_progress').length
  // Counted by its own predicate rather than as `length - done - active`: a
  // status the projection gains later would make that subtraction negative, and
  // `-1fr` is not a valid track size, so the whole grid-template-columns
  // declaration would be dropped and the meter would render as bare track.
  const pending = list.filter(item => item.status === 'pending').length
  const progressStyle: ProgressStyle = {
    '--tasks-progress-done': `${done}fr`,
    '--tasks-progress-active': `${active}fr`,
    '--tasks-progress-pending': `${pending}fr`,
  }
  // Zero-count segments are dropped as noise (a non-empty list always keeps
  // one), and the separator is the composer todo strip's en-space triad — HTML
  // collapses runs of ASCII spaces, so widening it needs the literal wide space.
  const breakdown = [
    ...active > 0 ? [t('todo.progress.active', { active })] : [],
    ...pending > 0 ? [t('todo.progress.pending', { pending })] : [],
    ...done > 0 ? [t('todo.progress.done', { done })] : [],
  ].join('\u2002·\u2002')

  return (
    <section className={css.root} aria-labelledby={titleId} data-conversation-composer-overlay="">
      <header className={css.header}>
        <span className={css.headerIcon} aria-hidden><IconChecklistOutline14 /></span>
        <h2 id={titleId} className={css.headerTitle}>{t('tasks.title')}</h2>
        <span className={css.headerScope}>{t('tasks.turnScope')}</span>
        <span className={css.headerState}>
          {queued > 0 ? <span>{t('queue.count', { n: queued })}</span> : null}
          {running ? <StateDot state="ongoing" /> : null}
          <span>{running ? t('row.running') : t('tasks.state.idle')}</span>
        </span>
      </header>
      <div className={css.pane}>
        <div className={css.lane}>
          {blocked > 0 && (
            <div className={css.banner} role="status">
              <span className={css.bannerIcon} aria-hidden><IconWarningOutline16 /></span>
              <span className={css.bannerText}>{t('tasks.attention.blocked', { count: blocked })}</span>
            </div>
          )}
          {list.length === 0
            ? <EmptyState primary icon={<IconChecklistOutline14 />} text={t('tasks.todos.empty')} />
            : (
              <>
                <div className={css.progress}>
                  <div className={css.progressHead}>
                    <span className={css.progressCount}>{t('todo.completed', { done, total: list.length })}</span>
                    <span className={css.progressBreakdown}>{breakdown}</span>
                  </div>
                  <div
                    className={css.progressTrack}
                    style={progressStyle}
                    role="progressbar"
                    aria-label={t('tasks.progress.aria')}
                    aria-valuemin={0}
                    aria-valuemax={list.length}
                    aria-valuenow={done}
                  >
                    <span className={css.progressDone} />
                    <span className={css.progressActive} />
                    <span className={css.progressPending} />
                  </div>
                </div>
                <div className={css.groups}>
                  {TODO_ORDER.map(status => (
                    <TodoGroup
                      key={status}
                      status={status}
                      items={list.filter(item => item.status === status)}
                      t={t}
                    />
                  ))}
                </div>
              </>
            )}
          <div className={css.facets}>
            <PlanCard plan={plan} t={t} />
            <GoalCard goal={goal} t={t} />
            <JobsCard jobs={jobs} t={t} />
          </div>
        </div>
      </div>
    </section>
  )
}
