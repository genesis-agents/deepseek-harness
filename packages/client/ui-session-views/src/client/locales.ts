/** `sessionViews` namespace dictionaries: the three view tab labels plus every string the Files, Tasks and Waterfall panels render. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'sessionViews'

// The Tasks tab and the heading of the panel it opens name one view; splitting
// them into two literals lets a rename land on the tab and leave the panel
// header contradicting it.
const TASKS_LABEL_ZH = '任务'
const TASKS_LABEL_EN = 'Tasks'

/** The session-views dictionary key set (the source of truth for both locales). */
export type SessionViewsKey =
  | 'view.files'
  | 'view.tasks'
  | 'view.waterfall'
  | 'files.aria'
  | 'files.title'
  | 'files.subtitle'
  | 'files.derivation'
  | 'files.derivation.aria'
  | 'files.note.window'
  | 'files.note.capped'
  | 'files.filter.aria'
  | 'files.filter.all'
  | 'files.touch.edited'
  | 'files.touch.deleted'
  | 'files.touch.read'
  | 'files.touch.found'
  | 'files.meta.lines'
  | 'files.meta.turn'
  | 'files.empty.title'
  | 'files.empty.body'
  | 'files.empty.hint'
  | 'files.filtered.title'
  | 'files.filtered.body'
  | 'files.filtered.hint'
  | 'tasks.title'
  | 'tasks.turnScope'
  | 'tasks.state.idle'
  | 'tasks.group.active'
  | 'tasks.group.pending'
  | 'tasks.group.completed'
  | 'tasks.todos.empty'
  | 'tasks.progress.aria'
  | 'tasks.attention.blocked'
  | 'tasks.plan.title'
  | 'tasks.plan.on'
  | 'tasks.plan.off'
  | 'tasks.plan.pending'
  | 'tasks.plan.on.desc'
  | 'tasks.plan.off.desc'
  | 'tasks.plan.unavailable'
  | 'tasks.goal.title'
  | 'tasks.goal.phase.active'
  | 'tasks.goal.phase.paused'
  | 'tasks.goal.phase.blocked'
  | 'tasks.goal.phase.complete'
  | 'tasks.goal.rounds'
  | 'tasks.goal.roundsAria'
  | 'tasks.goal.blocked'
  | 'tasks.goal.empty'
  | 'tasks.jobs.title'
  | 'tasks.jobs.live'
  | 'tasks.jobs.empty'
  | 'tasks.job.stopping'
  | 'tasks.job.elapsed.ms'
  | 'tasks.job.elapsed.s'
  | 'tasks.job.elapsed.m'
  | 'tasks.job.tooltip'
  | 'tasks.job.aria'
  | 'tasks.job.aria.elapsed'
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
  // Shared status copy the Tasks header and job rows render. These eight
  // literals are also in ui-conversation's `conversation` dictionary and are
  // duplicated rather than reached: a slot entry's `t` binds exactly one
  // namespace, so a second namespace is not addressable from this component.
  | 'queue.count'
  | 'row.failed'
  | 'row.running'
  | 'row.stopped'
  | 'todo.completed'
  | 'todo.progress.active'
  | 'todo.progress.done'
  | 'todo.progress.pending'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Files, Tasks and Waterfall view tab labels and panel copy. */
    'sessionViews': SessionViewsKey
  }
}

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh: Record<SessionViewsKey, string> = {
  'view.files': '文件',
  'view.tasks': TASKS_LABEL_ZH,
  'view.waterfall': '瀑布',
  'files.aria': '本会话涉及的文件',
  'files.title': '工作区文件',
  'files.subtitle': '来自每次工具调用自身声明的文件位置，而非模型叙述。',
  'files.derivation': '读取与改动由工具自身的呈现意图区分：diff 卡片或 kind 为 edit 的通用卡片计为改动，read 卡片计为读取；失败与进行中的调用不计入。新建与覆盖在调用时无法区分，因此不显示“新建”。',
  'files.derivation.aria': '关于这些文件的来源',
  'files.note.window': '仅已加载区间',
  'files.note.capped': '搜索结果已截断',
  'files.filter.aria': '按触及方式筛选',
  'files.filter.all': '全部',
  'files.touch.edited': '已改动',
  'files.touch.deleted': '已删除',
  'files.touch.read': '已读取',
  'files.touch.found': '搜索命中',
  'files.meta.lines': '{n} 行',
  'files.meta.turn': '第 {n} 轮',
  'files.empty.title': '尚未涉及任何文件',
  'files.empty.body': '当智能体读取、修改或搜索文件时，这里会按目录展示它们，并标注每个路径被如何触及。',
  'files.empty.hint': '只列出工具上报的路径；仅在正文中被提到的路径不会出现。',
  'files.filtered.title': '当前筛选没有匹配项',
  'files.filtered.body': '已加载区间内没有以这种方式被触及的文件。',
  'files.filtered.hint': '切换到“全部”查看本会话涉及的每个路径。',
  'tasks.title': TASKS_LABEL_ZH,
  'tasks.turnScope': '本回合的清单，下一回合开始时清空',
  'tasks.state.idle': '空闲',
  'tasks.group.active': '进行中',
  'tasks.group.pending': '待处理',
  'tasks.group.completed': '已完成',
  'tasks.todos.empty': '本回合还没有任务清单；智能体开始规划后会出现在这里。',
  'tasks.progress.aria': '任务清单进度',
  'tasks.attention.blocked': '{count} 项操作正在等待你的回应',
  'tasks.plan.title': '计划模式',
  'tasks.plan.on': '已开启',
  'tasks.plan.off': '已关闭',
  'tasks.plan.pending': '切换待生效',
  'tasks.plan.on.desc': '智能体会先给出计划，确认后再执行。',
  'tasks.plan.off.desc': '智能体会直接执行，不先出计划。',
  'tasks.plan.unavailable': '此会话未启用计划模式。',
  'tasks.goal.title': '目标',
  'tasks.goal.phase.active': '进行中',
  'tasks.goal.phase.paused': '已暂停',
  'tasks.goal.phase.blocked': '已阻塞',
  'tasks.goal.phase.complete': '已完成',
  'tasks.goal.rounds': '第 {started} / {max} 轮',
  'tasks.goal.roundsAria': '目标轮次进度',
  'tasks.goal.blocked': '阻塞原因（{code}）：{message}',
  'tasks.goal.empty': '此会话没有设定目标。',
  'tasks.jobs.title': '后台任务',
  'tasks.jobs.live': '{count} 运行中',
  'tasks.jobs.empty': '此会话没有后台任务。',
  'tasks.job.stopping': '停止中',
  'tasks.job.elapsed.ms': '{value} 毫秒',
  'tasks.job.elapsed.s': '{value} 秒',
  'tasks.job.elapsed.m': '{minutes} 分 {seconds} 秒',
  'tasks.job.tooltip': '{label}（{detail}）',
  'tasks.job.aria': '后台任务 {job}，类型 {kind}，{status}',
  'tasks.job.aria.elapsed': '，耗时 {elapsed}',
  'waterfall.aria': '会话时间瀑布图',
  'waterfall.caption': '按开始时间排列的回合、步骤与工具调用跨度',
  'waterfall.subtitle': '共享一条时间轴，零点为已加载窗口中最早的回合起点。',
  'waterfall.empty.title': '暂无计时数据',
  'waterfall.empty.body': '运行一个任务后，回合、步骤与工具调用的跨度会出现在这里。',
  'waterfall.empty.hint': '只绘制已加载窗口内的事件；加载更早的历史可以看到更多。',
  'waterfall.legend': '图例',
  'waterfall.column.span': '跨度',
  'waterfall.column.timeline': '时间轴',
  'waterfall.column.start': '起始',
  'waterfall.column.duration': '耗时',
  'waterfall.kind.turn': '回合',
  'waterfall.kind.step': '步骤',
  'waterfall.kind.tool': '工具调用',
  'waterfall.label.turn': '回合 {turn}',
  'waterfall.label.step': '步骤 {turn}.{step}',
  'waterfall.state.running': '进行中',
  'waterfall.state.failed': '失败',
  'waterfall.state.truncated': '边界在已加载窗口之外',
  'waterfall.summary.spans': '{count} 条跨度',
  'waterfall.summary.window': '窗口跨度 {duration}',
  'waterfall.summary.windowOnly': '仅已加载窗口',
  'waterfall.summary.session': '整会话：模型 {llm} · 工具 {tool}',
  'waterfall.summary.unplaceable': '{count} 次工具调用无法定位到时间轴',
  'waterfall.offset': '+{offset}',
  'waterfall.detail': '{label} · 起始 +{offset} · 耗时 {duration}',
  'waterfall.detail.running': '{label} · 起始 +{offset} · 已运行 {duration}',
  'waterfall.expandTurn': '展开回合 {turn}',
  'waterfall.collapseTurn': '折叠回合 {turn}',
  'queue.count': '{n} 条排队消息',
  'row.failed': '失败',
  'row.running': '运行中',
  'row.stopped': '已停止',
  'todo.completed': '{done}/{total} 已完成',
  'todo.progress.active': '{active} 进行中',
  'todo.progress.done': '{done} 已完成',
  'todo.progress.pending': '{pending} 待处理',
}

/** English dictionary. */
export const en: Record<SessionViewsKey, string> = {
  'view.files': 'Files',
  'view.tasks': TASKS_LABEL_EN,
  'view.waterfall': 'Waterfall',
  'files.aria': 'Files touched in this session',
  'files.title': 'Workspace files',
  'files.subtitle': 'Derived from the file locations each tool call declared, not from prose.',
  'files.derivation': 'Read and write are told apart by the tool’s own render intent: a diff card, or a generic card whose kind is edit, counts as a change; a read card counts as a read; failed and in-flight calls count for nothing. A create and an overwrite are indistinguishable at call time, so no created badge is shown.',
  'files.derivation.aria': 'How these files were derived',
  'files.note.window': 'Loaded window only',
  'files.note.capped': 'Search results capped',
  'files.filter.aria': 'Filter by how the path was touched',
  'files.filter.all': 'All',
  'files.touch.edited': 'Edited',
  'files.touch.deleted': 'Deleted',
  'files.touch.read': 'Read',
  'files.touch.found': 'Found',
  'files.meta.lines': '{n} lines',
  'files.meta.turn': 'turn {n}',
  'files.empty.title': 'No files touched yet',
  'files.empty.body': 'When the agent reads, edits or searches files, they appear here as a folder tree labelled with how each path was touched.',
  'files.empty.hint': 'Only tool-reported paths are listed; a path merely mentioned in prose is not.',
  'files.filtered.title': 'Nothing matches this filter',
  'files.filtered.body': 'No file in the loaded window was touched that way.',
  'files.filtered.hint': 'Switch back to All to see every path this session touched.',
  'tasks.title': TASKS_LABEL_EN,
  'tasks.turnScope': 'This turn’s list, cleared when the next turn starts',
  'tasks.state.idle': 'Idle',
  'tasks.group.active': 'In progress',
  'tasks.group.pending': 'Pending',
  'tasks.group.completed': 'Completed',
  'tasks.todos.empty': 'No plan for this turn yet. It appears here once the agent starts planning.',
  'tasks.progress.aria': 'To-do progress',
  'tasks.attention.blocked': '{count} action(s) awaiting your response',
  'tasks.plan.title': 'Plan mode',
  'tasks.plan.on': 'On',
  'tasks.plan.off': 'Off',
  'tasks.plan.pending': 'Change pending',
  'tasks.plan.on.desc': 'The agent drafts a plan and waits for approval before acting.',
  'tasks.plan.off.desc': 'The agent acts directly, without drafting a plan first.',
  'tasks.plan.unavailable': 'Plan mode is not available in this session.',
  'tasks.goal.title': 'Goal',
  'tasks.goal.phase.active': 'Active',
  'tasks.goal.phase.paused': 'Paused',
  'tasks.goal.phase.blocked': 'Blocked',
  'tasks.goal.phase.complete': 'Complete',
  'tasks.goal.rounds': 'Round {started} of {max}',
  'tasks.goal.roundsAria': 'Goal round progress',
  'tasks.goal.blocked': 'Blocked ({code}): {message}',
  'tasks.goal.empty': 'No goal is set for this session.',
  'tasks.jobs.title': 'Background jobs',
  'tasks.jobs.live': '{count} running',
  'tasks.jobs.empty': 'No background jobs are attached to this session.',
  'tasks.job.stopping': 'Stopping',
  'tasks.job.elapsed.ms': '{value} ms',
  'tasks.job.elapsed.s': '{value} s',
  'tasks.job.elapsed.m': '{minutes}m {seconds}s',
  'tasks.job.tooltip': '{label} — {detail}',
  'tasks.job.aria': 'Background job {job}, kind {kind}, {status}',
  'tasks.job.aria.elapsed': ', took {elapsed}',
  'waterfall.aria': 'Session timing waterfall',
  'waterfall.caption': 'Turn, step and tool-call spans ordered by start time',
  'waterfall.subtitle': 'One shared time axis, zeroed at the earliest turn start in the loaded window.',
  'waterfall.empty.title': 'No timing data yet',
  'waterfall.empty.body': 'Run a task and its turn, step and tool-call spans appear here.',
  'waterfall.empty.hint': 'Only events inside the loaded window are drawn; load earlier history to see more.',
  'waterfall.legend': 'Legend',
  'waterfall.column.span': 'Span',
  'waterfall.column.timeline': 'Timeline',
  'waterfall.column.start': 'Start',
  'waterfall.column.duration': 'Duration',
  'waterfall.kind.turn': 'Turn',
  'waterfall.kind.step': 'Step',
  'waterfall.kind.tool': 'Tool call',
  'waterfall.label.turn': 'Turn {turn}',
  'waterfall.label.step': 'Step {turn}.{step}',
  'waterfall.state.running': 'Running',
  'waterfall.state.failed': 'Failed',
  'waterfall.state.truncated': 'Boundary outside the loaded window',
  'waterfall.summary.spans': '{count} spans',
  'waterfall.summary.window': '{duration} of window',
  'waterfall.summary.windowOnly': 'Loaded window only',
  'waterfall.summary.session': 'Whole session: model {llm} · tools {tool}',
  'waterfall.summary.unplaceable': '{count} tool calls could not be placed on the axis',
  'waterfall.offset': '+{offset}',
  'waterfall.detail': '{label} · starts +{offset} · took {duration}',
  'waterfall.detail.running': '{label} · starts +{offset} · running for {duration}',
  'waterfall.expandTurn': 'Expand turn {turn}',
  'waterfall.collapseTurn': 'Collapse turn {turn}',
  'queue.count': '{n} queued messages',
  'row.failed': 'Failed',
  'row.running': 'Running',
  'row.stopped': 'Stopped',
  'todo.completed': '{done}/{total} completed',
  'todo.progress.active': '{active} in progress',
  'todo.progress.done': '{done} completed',
  'todo.progress.pending': '{pending} pending',
}
