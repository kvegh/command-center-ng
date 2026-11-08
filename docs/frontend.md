# Frontend direction

## Selected stack

Use **React, TypeScript, and Vite**, with plain CSS organized around shared
design tokens and small reusable components.

The user explicitly delegated the frontend choice and requested a framework
that is easy to work on and supports intuitive, beautiful, simple, dynamic
interfaces. Linux is the primary platform.

| Choice | Reason | Tradeoff |
| --- | --- | --- |
| React | Reusable components suit a dashboard with conversations, branches, agents, and changing task states. | State ownership and component boundaries need deliberate design. |
| TypeScript | Explicit types help keep project, conversation, agent, and task states understandable as the product grows. | Requires a type-checking step and some additional source declarations. |
| Vite | Focused development and build tooling without choosing an application server or hosting provider. | Backend capabilities must be designed separately when required. |
| Plain CSS | Shared tokens and responsive layouts allow a distinct appearance with few dependencies. | Accessible interactive behavior and visual consistency still require careful implementation. |

This selects the frontend foundation only. It does not select agent APIs, a
server framework, a database, a state-management library, or a component suite.
Package versions are pinned in package.json and package-lock.json for the current 0.7.0 development version.
The approved local Node.js service uses the existing Codex daemon.

## Visual principles

- Make the short goal, current work, attention requests, and next steps easy to find.
- Use consistent typography, spacing, surfaces, and a restrained accent color.
- Use labels and icons alongside color to communicate status.
- Keep keyboard navigation, focus visibility, contrast, and touch targets usable.
- Adapt information density to the screen size while preserving context.
- Keep parent and branch navigation clear and easy to revisit.
- Respect reduced-motion preferences and avoid animation that distracts from work.
- Use synthetic data for public demos and interface examples.

## Approved mobile layout

Use one naturally scrolling, full-width page on mobile. Worker tabs wrap, and
the overview sits above a bounded chat history showing about 30 text lines.
The composer textarea shows six lines; longer input, including pasted text,
scrolls inside it. Hide the worker's Coordinator recap on mobile while retaining
the actual coordinator dashboard.

Mobile exposes no resizing controls and ignores desktop sidebar widths, overview
section heights and composer heights without erasing those saved preferences.
Returning to desktop retains its existing layout and sizing controls. This
supersedes the historical mobile tab-scrolling and constrained-overview layout
descriptions below. Mobile notifications remain postponed. Version 0.35.0 implements this layout;
the existing 483-test suite, four mobile layout checks and build pass. Actual
phone keyboard, rotation and rendered verification remain pending. Finger
gestures scroll naturally; mouse/pen dragging and arrow controls still reorder
tabs. The compact layout includes wide landscape coarse-pointer devices.

The mobile overview reduces vertical padding and section gaps to eight pixels;
task labels, totals and Link tasks share a wrapping row. Worker and coordinator
views omit Open questions only when there are no requests and no attention
state. Pending requests and attention without loaded details remain visible.
Mobile starts with one Worker settings disclosure row showing the current
cadence and an always-visible Report now sibling button. One expansion reveals
both cadence radio choices and model/effort controls. Queued/pending state and
report errors stay outside the collapsed body. Controls remain mounted across
rotation and layout changes. Desktop keeps the body open, hides the disclosure
summary and retains Report now after Never in the original control row. Mobile
also hides coordinator guidance prose and tightens project-card spacing while
retaining the dashboard, input-needed titles and controls. This refinement does
not change fonts, desktop widths/preferences, the roughly 30-line chat history
or six-line input. All 498 tests and the production build pass; rendered phone behavior remains
unverified.

Version 0.6.0 uses dark graphite surfaces with cyan controls, green running
states, amber attention states, and violet branch navigation. Status labels and
icons accompany color. The goal and up to three task summaries remain above
the scrolling conversation on mobile; desktop uses a narrow right sidebar.
The workspace fills the window. Compact single-line agent tabs and Add agent
live in the top bar, with branding at its far-right edge. The bar spans the
window without a centered inset; status dots/tooltips replace repeated text. Completed
replies expose Branch here; each fork exposes parent navigation and a generated,
reviewable summary return that archives the child and closes its tab after
delivery. Selecting a tab moves focus and the caret to its chat input; streaming
updates do not steal focus. Task rows are sourced from linked Beads records.
A generated transparent airport control-tower PNG supplies branding and the
favicon; its prompt is recorded in brand.md. No animation or external font
dependency is required.

## Linux installation

The first supported runtime host is Linux. The project requires Node.js 22.12+
and npm, as recorded in package.json and the installation instructions.

The shell installer targets a user-supplied directory under an unprivileged
user's home. Without a directory parameter, it prompts before installing.
Version 0.1.0 includes a target-local launcher and automatic-fetch update mode;
fresh installation, updating, and failure preservation were validated.

## Primary references

- [React: build an app from scratch](https://react.dev/learn/build-a-react-app-from-scratch)
- [React: managing state](https://react.dev/learn/managing-state)
- [TypeScript documentation](https://www.typescriptlang.org/docs/)
- [Vite: getting started and supported templates](https://vite.dev/guide/)

The 0.4.0 coordinator has a separate labeled tab group with spacing and a divider,
without using a worker slot. Its sidebar shows worker recaps and recent decisions;
workers show concise coordinator recaps above their stored Beads tasks. Pause,
resume and manual-review controls stay visible. Worker tabs support desktop drag
reordering plus left/right buttons and Alt+Left/Right. Browser-local ordering
preserves conversation identity and the distinct coordinator group.

Version 0.4.1 replaces native HTML tab dragging with a small pointer controller
attached to the tab button. Capture keeps move/up events on that button while
viewport hit testing finds the destination worker. A six-pixel horizontal
threshold separates dragging from clicking; drop markers, cancellation and
post-drag click suppression preserve normal selection/focus. Touch vertical
panning remains available, and dragging near the strip edges scrolls it.
The pointer controller is exercised with mouse/touch/pen event sequences in
Node tests using the existing TypeScript compiler. These tests do not replace
interactive browser validation; no browser or new dependency was installed.

Version 0.4.2 places the coordinator outside the worker scrolling strip in its
own right-aligned header group. Workers and Add agent remain together on the
left, separated by flexible space and a divider from the coordinator. A violet
surface, rounded full border and overview icon distinguish its role; running
and attention indicators remain. The phone presentation uses a compact Coord
label. Branding remains the final item at the far right. Worker dragging still
targets only the left strip.

## Current hierarchy review: 0.5.0

The graphite surfaces and cyan/green/amber states remain coherent; violet marks
the coordinator's different role. The main source-level issue was competing
header controls. Worker tabs now stay left and a compact right-hand pair places
the more prominent cyan Add agent button immediately before the violet
coordinator. The divider/extra gap between that pair is removed. Branding stays
rightmost with the exact wordmark command center NG and a clearer architectural
tower mark.

An eight-pixel top inset separates vivid tab borders from the screen edge.
Worker tabs are about 34 pixels tall instead of 48, a roughly 30% reduction;
mobile retains horizontal scrolling and accessible movement controls. The
workspace still fills the available width and height. This preserves the user's
requested information density without adding decoration.

Selected tab, draft, worker order and reading position persist in browser-local
storage. Open IDs and coordinator pause state restore from the existing backend's
private file. Storage errors leave in-memory operation available and visible.
Production build and event/storage tests pass; no interactive browser is
available here. The user will provide a screenshot after updating for a rendered
review of spacing, legibility, touch usability and overall balance.


## Context and question visibility: 0.6.0

The user requested a roughly 40% wider summary/goal panel because missed
questions can silently block work. Above 900px, its width changes from
clamp(260px, 23vw, 320px) to clamp(364px, 32.2vw, 448px). The existing stacked,
scrollable mobile context remains. Goal, coordinator recap and up to three Beads
tasks are followed by an Open questions section. Amber cards/counts show pending
clarifications, approvals, coordinator decision requests and unconfirmed-answer
errors. Clicking a row scrolls its existing question card into view and focuses
an enabled answer control, without answering or resolving it. Numeric and string
request IDs retain distinct targets. Multiple questions in one request remain
separate rows. A native request owned elsewhere directs the user to that client.

The list comes directly from pending native state, so it clears through the
existing acknowledged-resolution behavior. Ordinary prose questions are not
inferred. There is no new storage, model call or approval authority. Branch chat
moves from the goal sidebar to the chat composer, alongside Interrupt and Send;
per-reply Branch here remains. Composer controls wrap on narrow screens.

## Coordinator tab revision: 0.8.1

The user requested that the coordinator match the worker tabs and swap places
with Add agent. The order is now worker tabs, coordinator, Add agent, then status
and rightmost branding. The coordinator remains outside the workers' scrolling
and reordering strip, with its own icon, identity and chat.

It inherits the same tab border shape, height, text and active/running/attention
states as workers. The separate violet full-border pill treatment is removed.
Startup/retry also uses the shared tab markup, and the existing compact mobile
label remains. This supersedes the 0.5.0 visual order/treatment while preserving
its tab top inset and the gap correction delivered in 0.7.1.

## Folder tabs attached to the pane: 0.9.1

The user requested small folder-like tabs seamlessly attached to their own chat
pane, without intervening lines, and a replacement for the bottom selection
marker. The selected tab now shares the pane's surface fill, uses a stronger
label and clearer side edges, and has no inset bottom stripe. The header's bottom
padding/border and the pane's top border/corners are removed at the join. The
context panel shares the surface fill so the connection also works for the
right-hand coordinator and stacked mobile layout.

The tab bar keeps its eight-pixel top inset and roughly 34-pixel tabs. Worker
status colors, focus controls, reordering and the coordinator-before-Add-agent
order remain. Horizontal scrolling still works; its visible scrollbar gutter is
hidden so it does not separate the tabs from the pane. Rendered browser review
remains pending; build/source checks alone do not establish the visual result.


Version0.33.0 attaches the chat title, colour selector and Codex receipt/activity/
connection indicators to the composer. The strip sits directly above the input
box and below the independently scrolling history, retaining small text and
responsive wrapping. Desktop uses two rows again: history and composer; the
overview divider spans both. The top-right Command Center branding is retained.

## Resizing the composer

On desktop, a horizontal divider between the scrolling chat history and the
whole composer resizes its area, including its header, input and footer. Dragging the
divider up enlarges the input area; dragging down shrinks it. The divider is
keyboard accessible: Up enlarges, Down shrinks, and Shift uses larger steps.
Home selects the minimum height and End the maximum. Double-click returns to
automatic sizing. Escape during a resize or a canceled pointer interaction
restores the size from before that resize.

One composer-height preference is stored in the existing browser workspace and
restored on desktop after refresh. It applies across chats and is clamped to the
available vertical space so the history remains usable. This changes browser layout only;
it does not change draft contents, agent settings, server configuration or
network behavior. The composer header stays attached directly above the input.

## Overview identity and typography

The overview starts with the selected project's chat name and status, ahead of
branch navigation. It omits the redundant GOAL label; the coordinator overview
also starts with its own name. Existing saved section heights remain compatible.

Overview text is one pixel larger throughout, including section labels, task
states and totals, notes, buttons and settings dropdowns. Each font keeps its
existing family and relative size hierarchy, including the smaller mobile
variants. This applies only to the overview, leaving chat, dialogs and top-bar
typography unchanged. Full recap details use the same size as the recap body.

## Concise input requests

Task input dialogs lead with Needed (the direct question or action) and Why (a
brief reason). New agent-authored requests use these concise sections by default.
Exact commands, steps and original context/notes stay in expandable Details.
Legacy records retain full information and use bounded previews without claiming
an automatic semantic summary; native permission controls remain unchanged.

The input header tab uses its selected chat colour as a persistent background
tint and border over the current theme surface. Input focus does not remove or
replace the tint. Only this header strip is coloured; the input frame and top
agent tabs keep their existing styling. Text sizes and wrapping remain unchanged.

User-message Markdown paragraphs and list items preserve soft line breaks and
spacing with pre-wrap. The renderer's retained newline text nodes no longer
collapse visually. This is display-only; normal Markdown still applies, while
fenced code remains the way to preserve literal syntax/monospaced columns.
Assistant Markdown, tables/code, copying, input and native message storage are
unchanged.
