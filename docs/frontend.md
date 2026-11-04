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
Package versions are pinned in package.json and package-lock.json for 0.3.1.
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

Version 0.3.1 uses dark graphite surfaces with cyan controls, green running
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
