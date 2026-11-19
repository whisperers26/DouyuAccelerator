# DouyuAccelerator — agent guide

A Tampermonkey userscript for Douyu video replays (`v.douyu.com/show/...`). Douyu serves
each replay from one Huawei CDN line, and segments the edge has not cached arrive at about
5 Mbps, while 1080p60 and 2K need 9–20 Mbps. The player downloads one segment at a time,
so it stalls. The script watches where the video is playing and downloads the next
segments in parallel ahead of the player, so the CDN edge has them cached by the time
the player asks.

The script runs inside a third-party page we do not control. Every assumption about
Douyu's player must fail safe: if something does not match, the script does nothing and
the player keeps working as it would without it.

- Branches, PRs, CI and self-merging → [.agents/wiki/git-workflow.md](.agents/wiki/git-workflow.md)
- How Douyu's player and CDN behave, what the script relies on → [.agents/wiki/internals.md](.agents/wiki/internals.md)
- Unit tests, the live check in Chrome, installing into Tampermonkey → [.agents/wiki/testing.md](.agents/wiki/testing.md)

## Layout

```
douyu-accelerator.user.js   the userscript (one file, no build step, no dependencies)
tests/                      node:test unit tests for the pure parts of the script
package.json                `npm test` only; no dependencies
```

## Rules you must not break

1. **The owner has authorised working autonomously here:** create branches, commit, push,
   open pull requests and merge them without asking first.
2. **Never commit on `main`.** One branch per feature or fix, merged through a PR that you
   merge yourself with a merge commit once CI passes. → git-workflow.md
3. **Small commits, one topic each**, made as you go (the owner's global commit rules apply).
4. **`npm test` passes before every push.**
5. **Never change what the player does.** The script only observes (performance entries,
   the `<video>` element) and issues its own extra requests. No patching of `fetch`, XHR,
   or Douyu's code. A failure inside the script must never throw into the page.
6. **Never log a full segment or playlist URL.** The query string carries a signature and
   the viewer's device id; log the path only.
7. **Bump `@version`** in the userscript header in every PR that changes the script, so
   Tampermonkey picks up the update. Patch bumps only unless the owner asks otherwise.
8. **Update the README** in the same PR when what the user sees or configures changes.

## Commands

```
npm test                    # unit tests (node --test)
```
