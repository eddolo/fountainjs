# Remote edits across unchanged plain paragraphs

On Windows with headless Chromium 151.0.7922.34, two editors opened the same document and exchanged keyboard edits over a local WebSocket. A third editor then opened the room. Each session matched the full paragraph list and Yjs state vector after both participants wrote. The last paragraph in the [reopened editor](reopened.png) shows both contributions.

| Document | Stack | Median receiver apply | Median keydown to peer frame task |
| --- | --- | ---: | ---: |
| 100 paragraphs | Fountain parent | 2.00 ms | 13.5 ms |
| 100 paragraphs | Fountain candidate | 2.05 ms | 12.9 ms |
| 5,000 paragraphs | Fountain parent | 30.65 ms | 52.65 ms |
| 5,000 paragraphs | Fountain candidate | 26.05 ms | 47.95 ms |
| 5,000 paragraphs | Tiptap 2.27.3 in the candidate run | 1.70 ms | 14.3 ms |

Each cell above has 22 timed keystrokes across two fresh rooms. The receiver interval begins at WebSocket delivery and ends upon return from synchronous Yjs application. The frame task is a callback scheduled after the peer's animation frame. Network latency, browser scheduling and document shape can change the user experience.

## Isolating the receiver

Four serial runs used parent, candidate, candidate, parent order. Each engine replayed the same seed and updates for each paragraph position. The runner checked complete document JSON, state vectors, every mounted edit and page errors. The 80 fresh receiver contexts applied 1,920 recorded updates. Each median below pools 42 measured applications per mode, after excluding three warmups in each of two trials. These are repeated measurements of 24 captured characters per position and engine.

| Edit and receiver | Parent A | Candidate A | Candidate B | Parent B |
| --- | ---: | ---: | ---: | ---: |
| First paragraph, Fountain model | 13.1 ms | 11.7 ms | 10.7 ms | 12.9 ms |
| Last paragraph, Fountain model | 12.8 ms | 10.8 ms | 11.4 ms | 13.7 ms |
| First paragraph, Fountain with view | 21.95 ms | 19.9 ms | 18.5 ms | 19.9 ms |
| Last paragraph, Fountain with view | 20.5 ms | 19.1 ms | 18.6 ms | 20.75 ms |

The receiver can reuse the binding of an unchanged, unformatted single-run stream. It checks the prior partition identity, run length, coordinates, wire format, schema and model leaf. The ordinary node factory checks, parent rules and final schema and index certification still apply. Structured edits, formatted and split text, empty streams and custom text validators use the general projection path. Full-tree traversal and view notification still account for substantial time.

## Reproduction

Use the parent at `8b5b43aa` and the runtime in this branch. Build each with `pnpm build` and stage its package manifest and dist directory under separate package names in the isolated comparison workspace. The parent alias in these receipts is `fountain-remote-candidate`, and the final candidate alias is `fountain-plain-partitions-v2`. Both resolve the same Yjs dependency.

1. Use the pinned replay runner and its archived native captures. Set `FOUNTAIN_REPLAY_INPUT` to the extracted captures directory and `FOUNTAIN_REPLAY_PACKAGE` to the package under test. Run `node run.mjs <new-output-directory> 5000` in the four-run order above. [Replay runner and native inputs](https://github.com/eddolo/fountainjs/tree/e6fd7683de24f125758678fbb0613077f74374c5/artifacts/remote-typing-comparison-20261118/replay)
2. Run the two-browser harness with `node run.mjs <new-output-directory> 100 5000`. Select the parent and candidate packages in turn using the runner's package alias map. Each run uses fresh rooms in Fountain, Tiptap, Tiptap, Fountain order. [Live harness](../run.mjs)
3. The six full reports are in [samples.zip](samples.zip). Extract them beside the replay runner, with the reference captures in `parent-a/captures`. Run `python verify-plain.py` from the extracted directory for the replay hashes, trial counts and medians. [Verification script](verify-plain.py)

These runs exercise plain paragraphs in desktop Chromium. Large rich documents and physical mobile input require separate measurements.


## Combined widget and collaboration build

The first combined build with the widget edit repair exceeded the CommonJS budget by 0.2 KiB. Sharing mark serialization and style comparison, sharing the nonempty text-group boundary check, and using the existing group map key brought the combined build 36 bytes under the existing 1,440 KiB ceiling.

The combined tree passed 7,044 unit tests, type checks, the headless and API checks, and the widget rejection, draft retention and focus journey in Chromium, Firefox and WebKit. A fresh 5,000-paragraph replay passed in 20 receiver contexts. The two-way WebSocket and third-session reopen journey passed at both sizes. In this repeat, median Fountain receiver apply was 2.0 ms at 100 paragraphs and 29.3 ms at 5,000. Tiptap measured 0.6 ms and 1.65 ms respectively. The variation across runs matters when interpreting the initial 26.05 ms result. [Combined run samples](integrated-samples.zip)
