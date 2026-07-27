---
title: 'mtt flow: push the integration branch before branching a task'
tags:
    - git
    - mtt-flow
priority: high
created: "2026-07-27T00:34:36Z"
updated: "2026-07-27T00:34:36Z"
---
Under End-state 1 (task/<id> branches off main → squash-PR → deliver), the deliver edge greps
main's log for the squash commit "<id>: …". Two lessons from the session-026 pilot:
- **Push the integration branch (main) BEFORE `mtt start`ing a task.** If it has unpushed
  commits, the PR (based on origin) folds them into the squash and local main diverges from
  origin after the merge. Recovery: `git reset --hard origin/main` (the squash contains the
  work), then `mtt deliver`.
- **The live dqb smoke earns its keep.** In the pilot it caught an ordering bug a unit test
  could not: a new e2e step cleared a photo's map point before a downstream render test that
  asserted the marker — reorder the e2e so it doesn't mutate shared state a later step needs.
