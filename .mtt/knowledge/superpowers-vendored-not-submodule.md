---
title: superpowers is vendored, not a submodule
tags:
    - repo
    - superpowers
priority: medium
created: "2026-07-26T16:53:00Z"
updated: "2026-07-26T16:53:00Z"
---
Project-local superpowers (.claude/skills/superpowers) is VENDORED as plain tracked files,
de-embedded from a former gitlink (commit 45e3ea1). Edit the skill files directly — they
diff/commit normally in the parent repo. Do NOT re-add a nested .git, do NOT treat it as a
submodule (there is no .gitmodules), do NOT `git submodule update`. Baseline is
obra/superpowers v6.0.3 (896224c); the skeleton-first edits to writing-plans +
subagent-driven-development are commit 866e197. Skills load at session start, so edits take
effect only in a later fresh session.
