# Design decisions history

This project starts with the requirements recorded here and in README.md.
There is no earlier implementation history to reconstruct. These entries
distinguish selected direction from implemented behavior. The initial commit's
ID will be recorded in the immediately following documentation commit.

## 2026-11-03 — Start an independent public-source project

The user requested the repository name command-center-ng and explicitly allowed
public visibility, with no secrets or tokens in the repository. Its source is
kept separate from the existing session dashboard. The initial source contains
generic product requirements, contributor instructions, and ignore rules;
the application and its agent integrations are not implemented.

Repository creation on GitHub and initial publication are pending. A local Git
repository has been initialized. No license has been selected.

## 2026-11-03 — Select a small interactive frontend foundation

The user explicitly delegated choosing a frontend framework for an intuitive,
beautiful, simple, dynamic interface. The selected stack is React, TypeScript,
and Vite, with plain CSS and shared design tokens. This supports reusable
interactive components and explicit state types while keeping styling
dependencies small. It requires deliberate component/state design and careful
accessible styling. The choice does not select a backend, database, agent
transport, hosting provider, or component suite.

This is a recorded frontend direction, not a running application. Dependencies
have not been installed and package versions have not yet been fixed.

## 2026-11-03 — Make Linux the first supported platform

The user explicitly selected Linux as the primary platform for installation
and operation. The complete interface must work in a Linux desktop browser;
the smartphone browser interface may be simpler while retaining core workflows.
Linux distribution support has not yet been implemented or validated.

## 2026-11-03 — Use a simple installer in an unprivileged user's home

The user explicitly selected a simple Linux shell script that installs into
an unprivileged user's home directory. The installer must not require root or
sudo. This avoids making administrator access a prerequisite for installation.
Runtime delivery, updates, and background startup remain undecided. No installer
or system changes have been implemented.

## 2026-11-03 — Keep branching simple and result return optional

The user clarified that Branch here should open a new conversation with the
same whole context, allow a follow-up question or subtask, and support easy
return to the main conversation and repeated branching. The user also requested
an option for bringing subtask results back to main. A formal branch-completion
or merge-review workflow was an assistant suggestion, not an accepted requirement.

Parent-child connections and retained conversations support navigation and
historical review. Branch navigation and result return are separate actions.
The precise result payload and automatic parent continuation remain undecided.
