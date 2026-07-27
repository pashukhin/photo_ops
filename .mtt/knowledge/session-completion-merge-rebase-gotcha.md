---
title: Session-completion merge/rebase gotcha
tags:
    - git
    - process
priority: medium
created: "2026-07-26T16:53:00Z"
updated: "2026-07-26T16:53:00Z"
---
A `git pull --rebase` after a local `--no-ff` merge into main DROPS the merge commit and
flattens history (rebase doesn't preserve merges without --rebase-merges), orphaning any tag
placed on the merge commit (bit s011: orphaned tag exp/exec-spec-011). For a --no-ff session
merge to main: skip `pull --rebase` when origin/main hasn't moved (push the merge directly),
or use `git pull --rebase=merges`. Don't force-push main to restore topology after it's
pushed. (Under mtt End-state 1 — per-task branches + PR squash — this applies to the
session-branch→main merge.)
