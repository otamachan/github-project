# GitHub Project

A mobile-friendly GitHub Projects (V2) viewer and light editor, built as a PWA.

Sibling to [github-review](https://github.com/otamachan/github-review): reuses
the same architecture (Vite + React + Tailwind + PAT in localStorage + PWA on
GitHub Pages) but targets the **Projects V2** side of GitHub instead of the
pull-request review side.

## Motivation

GitHub's Projects V2 web UI is awkward on a phone — board columns scroll
horizontally, tap targets are small, and moving an item between statuses takes
too many taps. This app is a focused alternative for that one step:
**triaging and status-updating project items from a phone**.

## Features

- **Project list** — every Projects V2 project you own or collaborate on, via
  `viewer.projectsV2`.
- **Status-grouped item view** — items grouped by a single-select or iteration
  field (defaults to "Status"), rendered as collapsible sections rather than
  horizontal columns.
- **Item detail** — all fields for an item, tap a field to edit it.
- **Light editing** — changes that stay inside the project and don't mutate the
  underlying Issue/PR:
  - Single-select fields (Status, Priority, ...)
  - Iteration fields
  - Text / number / date fields
  - Draft issue title & body
  - Add new draft items
  - Clear a field value
- **Read-only for now** — labels, assignees, milestone, repository, linked
  pull requests, reviewers, sub-issues progress. Editing those would write
  back to the underlying Issue/PR; out of scope for v1.
- **PWA** — installable to home screen, standalone launch, remembers your PAT.

## Authentication

Paste a **Personal Access Token** on first load. Stored in `localStorage`;
sent only to `api.github.com`.

Scopes:

- Classic PAT: `project` (add `repo` if you want Issue/PR details rendered).
- Fine-grained: **Projects** read &amp; write (repo-level Issues/PRs read is
  fine to add).

## Development

```sh
npm install
npm run dev
```

Build:

```sh
npm run build
npm run preview
```

## Deployment

Static site built with `base: "/github-project/"`; hosted on GitHub Pages.
`404.html` is generated from `index.html` at build time so direct URL access
works for client-side routing. See `.github/workflows/deploy.yml`.
