#!/usr/bin/env bash
# Install lefthook's git hooks — from the MAIN worktree only.
#
# `lefthook install` writes the ABSOLUTE path of the lefthook binary that
# generated them into the `.git/hooks/*` shims. Run from a linked worktree it
# writes THAT worktree's path; when the worktree is deleted the shim is left
# pointing at a path that no longer exists, and every hook stops running — in
# the main worktree too, since linked worktrees share `.git/hooks`.
#
# The guard: in the main worktree the git-dir and the common-dir are the same
# path; in a linked worktree the git-dir is `.git/worktrees/<name>` while the
# common-dir stays `.git`. Only the main worktree, which does not disappear,
# writes its path into the shims.
set -euo pipefail

if [ "$(git rev-parse --absolute-git-dir 2>/dev/null)" != \
     "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" ]; then
  exit 0
fi

lefthook install
