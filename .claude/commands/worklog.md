---
description: Update WORKLOG.md with an entry for the work done in this session
---

Append a new entry to `WORKLOG.md` at the repo root describing the work done in this conversation.

Steps:

1. Run `git status` and `git diff HEAD --stat` to see what changed.
2. Identify the most recent meaningful unit of work (bug fix, feature, infra change).
3. Append a new entry at the TOP of `WORKLOG.md` (after the intro paragraph and the first `---`), preserving reverse-chronological order.

Format each entry like this:

```markdown
## YYYY-MM-DD — Short title (under 60 chars)

**Gap.** What problem the user hit, in plain English. Why this mattered. Written so a non-technical client can follow.

**Why this happened.** (Optional) Root cause — only if it's interesting or non-obvious.

**Fix.** What was changed. Reference the files with markdown links. Describe what the change does in plain English, not just file names.

**Files changed.** Count + a one-line list.

**Verified.** How you confirmed it works — dev server screenshots, logs, manual test, automated test, etc.

**Commit.** Linked SHA or "pending".
```

Don't ask the user — just analyze the repo state and write the entry. If there's nothing meaningful to log (only Q&A, no code changes), respond with a one-line note and don't modify the file.
