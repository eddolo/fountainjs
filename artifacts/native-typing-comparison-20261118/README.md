# Native typing in fully mounted documents

The fixture compares FountainJS with Tiptap core, PM and StarterKit 2.27.3, the version pinned by GitLab CE 19.5.3. It mounts each editor's default starter kit directly. GitLab's application, the collaboration providers and their servers are outside this baseline.

Each editor receives the same paragraphs, viewport, font and CSS. Chromium clicks the final paragraph, moves to its end and types eleven individual keys. The probe checks the visible final paragraph after each key and the text of every model paragraph before and after the sequence. Each size runs twice per editor in Fountain, Tiptap, Tiptap, Fountain order using fresh browser contexts. The four runs contain 528 measured keypresses. Separate 78-character bursts run under the CPU profiler and do not contribute latency samples.

For every key the harness records the elapsed time between the trusted keydown timestamp and a task scheduled from the next animation frame. Frame scheduling contributes to that interval. It is a rendering opportunity observed in a headless browser. Browser-reported Event Timing durations, where emitted, appear separately in the raw records. The observer requests a 16 ms threshold and leaves unmatched events empty. Inter-key waits make this a settled typing diagnostic. Measure continuous typing and real peer updates separately.

| Build | 5,000-paragraph median (ms) | p95 (ms) | Matched Tiptap median (ms) |
| --- | ---: | ---: | ---: |
| Released source, first run | 20.2 | 28.9 | 11.8 |
| Repaired, first run | 17.8 | 26.1 | 11.3 |
| Released source, second run | 22.4 | 30.2 | 10.9 |
| Repaired, second run | 15.7 | 23.4 | 11.7 |

Each cell summarizes 22 keys using nearest-rank quantiles. The 100- and 1,000-paragraph observations vary with frame scheduling. The 5,000-paragraph repair improves both measured runs. Tiptap retains the lower median. The CPU profiles identify repeated selectors and path attribute writes on reused paragraphs. After the fix, native selection range replacement is prominent. The profiling and latency runs used separate browser sessions.

## Reproduce

1. Copy this directory to a fresh location. Build and pack Fountain at the released commit `b1161fd5` and the renderer repair using Node 24 and npm 12.0.2. Put the first tarball here as `candidate.tgz` and the second as `fountainjs-editor-0.5.0-beta.1.tgz`. No publication is needed.
2. Run `pnpm root -w` here and verify its output points to this directory's `node_modules`. The local workspace file makes dependency installation independent of the main repo.
3. Use `pnpm install --ignore-scripts --frozen-lockfile` for the original archives. For newly packed inputs, retain a separate lockfile and record their SHA-256 values. Run `pnpm exec playwright install chromium` if the matching browser is missing.
4. Run `node measure.mjs audit-release release` and `node measure.mjs audit-repair repair`, then repeat in reverse order using fresh output directories. Run `node profile.mjs audit-cpu repair` for a separate CPU recording. These commands bind the test server to loopback and launch one headless Chromium instance.
5. Inspect each raw report, the screenshots at the final paragraph and any browser errors. The retained summary includes both archive hashes, the dependency lock hash, browser build, host, sample counts and exact reported event durations.

This establishes one Windows Chromium comparison for ordinary, fully mounted paragraphs. It leaves collaborative typing, virtualized documents, other browser engines, accessibility and physical devices for separate qualification.

The separate command `node journey.mjs audit-editing` exercises typing, Enter, backward selection replacement and Backspace in Chromium, Firefox and WebKit. All three resulting screens show the replacement between paragraphs 49 and 51, and every final paragraph matches the expected model.
