# Cost of receiving a collaborative text edit

The 5,000-paragraph measurements on the merged runtime `829d8f22` put most of a receiving editor’s synchronous update time in the document model and collaboration adapter. The first and last paragraphs cost about the same. The measured control runs are below. Each cell is the median of 42 timed applications of a one-character edit, pooled from two fresh receivers with opposite run order. Pairs show the results of runs A and B.

| Receiver | Edit in first paragraph (ms) | Edit in last paragraph (ms) |
| --- | ---: | ---: |
| Yjs alone, Fountain room | 0.10 / 0.10 | 0.10 / 0.10 |
| Fountain model and collaboration adapter | 12.90 / 12.70 | 13.15 / 12.85 |
| Fountain model and mounted editor | 19.65 / 19.60 | 20.10 / 20.20 |
| Tiptap 2.27.3 and mounted editor | 1.20 / 1.30 | 0.95 / 0.90 |

The timer begins immediately before `Y.applyUpdate` and stops when it returns. The mounted Fountain receiver also records time between subscribers installed immediately before and after its EditorView. Those trial medians ranged from 6.0 to 6.6 ms in the controls. Browser paint, WebSocket delivery and the writer’s key handling fall outside this timer. The [two-peer live comparison](../README.md) measures the longer path.

At 100 paragraphs, the initial control recorded 0.7–0.8 ms for the Fountain model, 1.2–1.4 ms mounted and 0.3–0.4 ms for mounted Tiptap. The 5,000-paragraph results concern plain paragraphs under the pinned starter kits and their own collaboration formats. Richer documents, other browsers, mobile devices and deployed providers need their own measurements.

## Opening the room

Each 5,000-paragraph Fountain seed occupied about 7.93 MB as a Yjs update. Tiptap’s seed occupied 0.276 MB. Gzip on these specific updates yielded about 682 KB and 39 KB respectively. The median single-character update was 122 bytes in Fountain and 22 bytes in Tiptap. These are payload sizes before any application transport framing.

The Fountain seed decoded to 145,008 Yjs Item records, including 55,000 under the node registry, 45,000 under text streams and 20,000 under node identities. Tiptap’s document fragment held 15,000. Those counts identify where to investigate. Each item can encode a different number of bytes.

In four fresh mounted receivers per engine, applying the full seed to an empty Y.Doc took 167–214 ms for Fountain and 18–22 ms for Tiptap. Constructing the editor and attaching its view then took 154–193 ms for Fountain and 32–36 ms for Tiptap. The payload was already in memory, and browser layout or paint could continue afterward. [Fresh-open observations](fresh-open/report.json).

## Verification and experiment decision

A native Chromium writer typed 24 characters into the first or last paragraph. Each engine generated its own seed and incremental updates. Within an engine, every receiver in the four ordered comparisons consumed byte-identical inputs. The first three updates in each receiver warmed it up. The runner checks every mounted DOM edit, every live editor model edit, complete final JSON equality and exact Yjs state-vector equality. It attaches a full editor to the raw Yjs receiver after timing to verify that the resulting state can be opened.

The six runs contain 3,360 applications of captured updates across 140 fresh receiver contexts. Many observations replay the same keystrokes. The runtime experiment shared fragment-building functions across a normalization pass and skipped redundant work on known empty attribute bags. In its first trial the mounted result improved slightly. In the second trial the first/last-paragraph medians reached 21.4/21.3 ms, above both controls. The runtime change was discarded. [Raw-data summary](verified-results.json) · [Experimental diff](fragment-builders.patch).

The model work to test next is rebuilding only the affected text partition and its ancestors. Compare each incremental result with a fresh full projection, including custom validators, merged text runs and split-family placement. The independent seed results also warrant a storage-format study before changing any persisted data.

## Reproducing the measurements

Use the [comparison fixture’s pinned dependencies](../package.json) and its isolated workspace setup. The `fountain-remote-candidate` alias must resolve to the package built from commit `829d8f22`. Run the commands from the directory containing this README with an installed Playwright Chromium. The archive contains synthetic paragraph documents, their original Yjs seeds, captured keyboard updates and the expected documents.

```sh
python -m zipfile -e native-captures.zip .
node verify-results.mjs
```

The verifier checks the seed, update and document fingerprints in the four ordered comparisons and the fresh-open run. It counts Yjs items in the saved seeds and recomputes the timing summaries. To repeat a control on exactly those inputs in PowerShell:

```powershell
$env:FOUNTAIN_REPLAY_INPUT = 'parent-a/captures'
node run.mjs my-control 5000
python summarize.py my-control/report.json
```

Choose a fresh output directory for each run. With the input variable unset, the runner creates new captures through an actual writer. To repeat the discarded experiment, apply the supplied diff to its parent in a separate checkout, build the package and set `FOUNTAIN_REPLAY_PACKAGE` to its installed alias. Repeating the same bytes controls document content and Yjs identities. Timing still varies with the machine and browser.
