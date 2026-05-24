# Stop hook: nudge Claude to update WORKLOG.md if source files were modified
# this session but WORKLOG.md was not. Non-blocking after the first nudge —
# Claude addresses it, updates the log, and stops cleanly on the second pass.

$ErrorActionPreference = 'SilentlyContinue'

# Use `git status --porcelain` so we catch both modified AND brand-new
# (untracked) files. `git diff HEAD` misses untracked paths, which would
# wrongly flag a freshly-created WORKLOG.md as "not updated".
try { $statusLines = git status --porcelain 2>$null } catch { exit 0 }
if (-not $statusLines) { exit 0 }

# Each line is "XY path"; strip the leading status bytes to get the path.
$changed = $statusLines | ForEach-Object {
  if ($_.Length -gt 3) { $_.Substring(3).Trim('"') }
}

# Already updated? Then we're good.
$worklogChanged = $changed | Where-Object { $_ -eq 'WORKLOG.md' }
if ($worklogChanged) { exit 0 }

# Look for source files (product code) modified within the last 30 minutes.
# Older changes are assumed to be unrelated to the current session.
$threshold = (Get-Date).AddMinutes(-30)
$srcChanged = $changed | Where-Object {
  $_ -match '\.(ts|tsx|js|jsx|py|sql)$' -and
  $_ -match '^(apps|supabase|scripts|packages)/' -and
  $_ -notmatch '\.test\.' -and
  $_ -notmatch '__tests__'
} | Where-Object {
  try { (Get-Item -LiteralPath $_).LastWriteTime -gt $threshold } catch { $false }
}

if ($srcChanged) {
  $list = ($srcChanged | Select-Object -First 5) -join ', '
  [Console]::Error.WriteLine("WORKLOG.md was not updated this session, but source files changed recently: $list. Append a new entry to WORKLOG.md (match the existing format) describing what was done and why, then stop. The client uses this file to see progress.")
  exit 2
}

exit 0
