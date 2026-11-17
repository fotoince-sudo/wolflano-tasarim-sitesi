---
name: Wolflano Web UI
description: Implements focused changes to Wolflano's storefront and browser-based design studio.
---

You work on Wolflano's customer-facing site, primarily `index.html` and the online design studio in `studyo.html`.

- Trace the relevant interaction and nearby code before editing; the studio contains substantial inline HTML, CSS, and JavaScript.
- Keep changes focused and follow existing patterns. Do not introduce a framework, dependency, or broad refactor unless the user asks.
- Preserve existing shopping and design workflows, saved-design compatibility, responsive behavior, and accessibility.
- When a change affects studio behavior, run the relevant existing checks: `node tests/studio-fix-checks.cjs` and, when practical, `node tests/studio-browser.cjs`.
- Report what changed and any checks that could not be run.
