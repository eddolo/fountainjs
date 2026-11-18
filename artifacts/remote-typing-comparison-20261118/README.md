# Collaborative typing in FountainJS and Tiptap

Two independent Chromium contexts edit the same 100-, 1,000- or 5,000-paragraph document. A loopback WebSocket server exchanges actual Yjs updates and retains a Y.Doc per room until that case ends. Both implementations use Yjs 13.6.32, disable separate editor snapshot history and render their respective starter kits. There is no awareness traffic or external host product. Tiptap core, PM and collaboration packages are pinned to 2.27.3.

The writer types eleven keys, one at a time. The harness waits for both pages, checks the displayed edit and records the writer's next-frame task, the peer's first DOM change showing that text and the peer's next-frame task. The timestamps use the pages' time origins on the same Windows host. Frame tasks are scheduling measurements. The two contexts both reported visible. The reader also types back. Both models, the freshly reopened third editor and all three Yjs state vectors are checked. Each size uses Fountain, Tiptap, Tiptap, Fountain order in separate rooms.

| 5,000 paragraphs | Writer frame median | Peer DOM median | Peer frame median | Peer frame p95 |
| --- | ---: | ---: | ---: | ---: |
| FountainJS beta, b1161fd5 | 39.2 ms | 59.1 ms | 60.9 ms | 82.3 ms |
| Tiptap paired with beta | 12.7 ms | 8.6 ms | 13.9 ms | 25.1 ms |
| FountainJS renderer repair, 1ffb67e6 | 34.4 ms | 53.8 ms | 55.8 ms | 72.6 ms |
| Tiptap paired with repair | 12.6 ms | 8.9 ms | 14.2 ms | 28.1 ms |

Each row covers 22 measured edits. Across both complete runs the harness verified 264 measured keystrokes plus reader-authored return edits and fresh reopens. The data is in `measured/report.json`, `matched-repair/report.json` and `comparison.json`. The room is memory-backed and the network is local. Production network, persistence, long-session storage growth and physical mobile remain unmeasured.

## Source of the remaining cost

A separate 52-character burst on each stack captured CPU in the actual writer and reader. Every document converged. On the repaired Fountain build, the native writer spent about 884 ms of sampled inclusive time in `RetainedDocumentStore.normalizeFrame` over the burst, and the reader about 1,059 ms. The reader's full path-binding traversal accounted for 245 ms of sampled self time. These CPU samples overlap their callers and cannot be added together. The original raw profiles are under `cpu/`. Repeat profiles for the parent and repair are under `cpu-control/` and `cpu-candidate/`. The browser-bundle and installed-package source maps resolve the frames to the TypeScript sources. Inspect the remote binding traversal and rendered selection separately from the local path-write fix.

## Reproduce

Pack the release b1161fd5 as `candidate.tgz`, the renderer repair 1ffb67e6 as `repair.tgz`, and this remote index revision as `fountainjs-editor-0.5.0-beta.1.tgz` with npm 12.0.2. These are development comparison inputs. The SHA-256 values are in `comparison.json`. In this fixture, verify `pnpm root -w` points to its local node_modules, then install the pinned dependencies and Playwright Chromium. Run `node run.mjs baseline 100 1000 5000` for the release. Set `FOUNTAIN_BENCH_VARIANT=repair` and use a fresh output directory for the repair. For the separate 5,000-paragraph CPU profile, also set `FOUNTAIN_BENCH_CPU=1` and run `node run.mjs cpu 5000` in a fresh copy. The two reports retain the transmitted update sizes and every timing sample. The local server and all browser processes close at the end of each run.


## Retained receiver index repair

A validated incremental remote text update now reuses existing lookup maps when every node identity and text binding still occupies the same coordinate. The visited count must cover every old node and text path. A single changed length can update its binding after the complete model and schema checks. Reentrant index replacement, multiple binding changes, ambiguous coordinates and removed leaves use the existing rebuild.

| 5,000 paragraphs, 22 edits per cell | Parent A | Candidate A | Candidate B | Parent B |
| --- | ---: | ---: | ---: | ---: |
| Receiver apply median | 32.4 ms | 30.1 ms | 31.7 ms | 32.7 ms |
| Receiver apply p95 | 41.6 ms | 40.6 ms | 38.8 ms | 43.5 ms |
| Writer keydown to peer frame task median | 52.3 ms | 50.7 ms | 54.0 ms | 55.7 ms |

The apply interval starts on WebSocket message delivery and ends when synchronous Yjs application returns. The receiver sequence number identifies exactly one corresponding wire message per key. The matched Tiptap receiver median is 1.5 ms in all four runs. The repair reduces part of the lookup cost. Complete normalization, schema work and view updates remain material. The small-document results overlap, and the improvement in this fixture is modest.

The nine complete timing runs retain 836 native edits and corresponding Yjs updates across both stacks. Set `FOUNTAIN_BENCH_VARIANT=remote` for this repair and `repair` for its parent. Use `node analyze-cpu.mjs <profile-directory>` immediately after a new CPU run to resolve the actual bundled and package source maps. The bulky generated third-party maps stay with the local capture. The committed profiles and resolved frame summaries support inspection.
