# Git workflow

How every change reaches this repository. Back to [AGENTS.md](../../AGENTS.md). The owner can
override any of this for a single task by saying so.

## Repository

- `origin` is the public repo `whisperers26/DouyuAccelerator`. Every `gh pr` command names it
  with `--repo whisperers26/DouyuAccelerator`.
- `main` is the only long-lived branch. Never commit to it directly, never force-push it.
- Users install the script from `main`'s raw URL, and Tampermonkey updates from it, so whatever
  is merged ships to them. Merge only a script you have checked live (see
  [testing.md](testing.md)).

## Branches

Each feature or fix gets its own branch, cut from an up-to-date `main`, and is pushed as soon as
it exists. When one request holds several independent changes, each gets its own branch and PR.

```bash
git switch main && git pull --ff-only
git switch -c <type>/<description>
git push -u origin HEAD
```

`<type>` and `<description>` follow the owner's global rules: `feature/`, `bugfix/`, `hotfix/`,
`release/`, `chore/`; lowercase words joined by single hyphens, two to five words.

## Pull requests

1. If `main` moved on, rebase the branch onto it.
2. Run `npm test`.
3. Push and open the PR. The description says what changed, why, how it was verified (for script
   changes: the live numbers from Chrome), and lists any bug found but not fixed.

   ```bash
   gh pr create --repo whisperers26/DouyuAccelerator --base main --title "<what changed>" --body-file <file>
   ```

4. Wait for the CI check (`.github/workflows/ci.yml`: `npm test` on Node 22) to pass.
5. Merge with a merge commit. Never squash: squashing collapses the small commits into one.

   ```bash
   gh pr merge <number> --repo whisperers26/DouyuAccelerator --merge --delete-branch
   git switch main && git pull --ff-only && git branch -d <branch>
   ```

6. If the owner explicitly asks to review a PR, open it and stop. Do not merge.

## GitHub settings

Matched to the owner's other personal repos: issues on, wiki off, merge commits titled from the
PR with a blank body, squash and rebase also allowed, head branches deleted on merge, no auto-merge,
no rulesets, workflow token read-only.
