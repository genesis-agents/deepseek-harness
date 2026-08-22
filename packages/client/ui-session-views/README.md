# @deepseek-ai/dsh-client-ui-session-views

English | [中文](README.zh.md)

Session Views contributes the Files, Tasks and Waterfall tabs to the conversation's `'conversation.view'` slot ring. Files derives a folder tree from what each tool call declared it was doing — a diff card or a generic card whose kind is `edit` counts as a change, a read card counts as a read, a search card's results count as found — so nothing on that screen comes from model prose, and a create is never guessed apart from an overwrite. Tasks puts the current turn's to-do ladder first and the plan, goal and background-job facets beneath it; every figure there is whole-log or live, drawn from host-folded projections rather than the loaded window. Waterfall plots every turn, step and tool call in the loaded window against one shared time axis, positioning bars in percent so a resize costs no layout work, distinguishing a still-open span from one whose boundary event was paged out, and counting the calls it cannot place instead of inventing a start for them. The package declares no service and no Context merge: it registers three entries and one locale namespace, and reads the session snapshot through the standard view kit. Living in its own package rather than inside ui-conversation is what keeps that upstream package byte-identical to its release; `'conversation.view'` is a list slot, so registering from outside adds seats exactly the way ui-trajectory already does.

## Model Experience

None, as these views render session data already in the browser; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **The Files tree shows no `created` badge** — a create and a full overwrite both present `FileDiff.oldText === null` at call time, so the two are indistinguishable from the render intent alone and the view declines to guess which happened.
- **Files and Waterfall cover the loaded window only** — both read `snapshot.chat`, so paging older history in changes their counts; the "loaded window only" pill says so rather than the numbers claiming a completeness they do not have.
- **`isSettledTool` and the screen-reader-only rule are local copies** — the client bundle purity gate forbids a cross-package value import, and a CSS module has no public subpath, so both must be duplicated from ui-conversation and kept in step with it by review rather than by the compiler.
- **No behavior specs yet** — the three views moved without tests, which none of them had upstream either; the package sits in the GUI coverage-debt exemption until the client test lane covers them.
