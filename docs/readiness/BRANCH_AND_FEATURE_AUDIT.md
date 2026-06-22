# Branch and Feature Audit

Audit date: 2026-06-22  
Base branch for this release gate: `feat/prompt-9-local-compile-preview-hmi-preview` (green)  
Release branch: `release/final-readiness-soc-cleanup`

## Feature chain status

| Feature / branch | Local | Remote (`origin`) | Merged to `main` | Tests (this gate) |
|---|---|---|---|---|
| `cleanup/prompt-0-repo-deconfusion` | present | present | no | pass (inherited) |
| `feat/prompt-1-operational-map-kernel` | present | present | **yes** (`main` tip) | pass |
| `feat/prompt-2-2d-operational-viewport` | present | present | no | pass |
| `feat/prompt-3-progressive-detail-role-inspector` | present | present | no | pass |
| `feat/prompt-4-causal-path-evidence-explorer` | present | present | no | pass |
| `feat/prompt-5-operational-search-command-palette` | present | present | no | pass |
| `feat/prompt-6-3d-operational-viewport-layer-parity` | present | present | no | pass |
| `feat/prompt-7-engineer-source-inspector-studio-launchpad` | present | present | no | pass |
| `feat/prompt-8-studio-forms-authoring-drafts` | present | present | no | pass |
| `feat/prompt-9-local-compile-preview-hmi-preview` | present | present | no | pass |

## Prompt 9 status

**Present and green.** `origin/feat/prompt-9-local-compile-preview-hmi-preview` exists at commit `d84e595`.  
`CompilePreviewShell` on this branch renders `CompilePreviewWorkbench` with local read-only preview — not the disabled Prompt 8 shell.

## Readiness note

Feature branches 2–9 are **not merged to `main`**. `main` currently stops at Prompt 1 (`9e02e97`).  
Demo from `main` alone would miss Studio, compile preview, 3D parity, causal path, and search palette.

**Branch-chain readiness:** feature-complete on `release/final-readiness-soc-cleanup`.  
**Main-line readiness:** NOT READY until prompts 2–9 are merged.