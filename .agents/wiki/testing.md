# Testing

Back to [AGENTS.md](../../AGENTS.md).

## Unit tests

`npm test` runs `node --test tests/`. The userscript exports its pure parts (playlist parser,
download planner, config) through `module.exports` when it is loaded by Node, so the tests
`require('../douyu-accelerator.user.js')` directly. Nothing in the tests touches the network.

## Live check in Chrome

Use the owner's Chrome (Claude in Chrome), where they are logged in to Douyu: 60 fps and 2K
qualities need a login. A long live replay that few people watched gives cold segments, e.g.
`https://v.douyu.com/show/a4Jj7lxQLxq7Dk01` (2 h, 1080p60).

1. Open the video and seek to a position nobody has watched yet: pick a fresh one each run,
   because each run warms the segments it touches for everybody for 30 days.
2. Without the script: play muted for 20–30 s and count `waiting` events and seconds played
   (`video.getVideoPlaybackQuality()` for dropped frames). Baseline on 2026-11-19: 3 stalls
   in 20 s, 15 s played, 0 dropped frames.
3. With the script: either install it (below) and reload, or paste the file into the page
   with `javascript_tool` (it runs fine late: it scans existing performance entries). Seek to
   another fresh position, wait ~10 s for the first window, then measure the same way.
   `window.__douyuAccelerator.status()` shows the window, downloads in flight and done.

The `<video>` element is inside shadow DOM; find it by walking `shadowRoot`s.

## Installing into Tampermonkey

The script's `@downloadURL` / `@updateURL` point at `main`'s raw file, so install from there:
open `https://raw.githubusercontent.com/whisperers26/DouyuAccelerator/main/douyu-accelerator.user.js`
in Chrome; Tampermonkey shows its install page; press **Install**. Chrome needs
**Allow User Scripts** turned on for Tampermonkey (`chrome://extensions` → Tampermonkey →
Details) or no userscript runs at all.
