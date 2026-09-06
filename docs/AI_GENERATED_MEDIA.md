# Generated media

FountainJS treats generated media as a review and upload workflow, not as a
privileged model feature. The generator, credentials, billing, safety policy,
moderation, storage, and final public URL belong to the host application.
Fountain supplies bounded requests, transient review candidates, explicit
accept/reject decisions, cancellation, progress, and a bridge into the ordinary
image/media upload path.

## Boundary

```text
inspectable request
       ↓
host generation adapter
       ↓
bounded byte-backed candidates (not document content)
       ↓ human accepts one candidate
normal host image/asset upload handler
       ↓
schema-valid portable media node
       ↓
history / collaboration / JSON / HTML / Markdown
```

The generation adapter cannot edit the document. A candidate remains outside
editor state until `accept` invokes an explicit committer. The supplied browser
committer creates a `File` from the reviewed bytes and calls the same
`ImageUploadHandler` or `AssetUploadHandler` used for paste, drop, file pickers,
and direct uploads. It therefore inherits mapped insertion targets, progress,
cancellation, replacement checks, schema validation, and one-step undo.

## DOM-free generation and review

Import the controller from its isolated entry. It has no DOM, React, model SDK,
or storage dependency and runs in Node.js.

```ts
import {
  AIGeneratedMediaController,
  createAIGeneratedMediaAdapter,
} from 'fountainjs-editor/ai/generated-media'

const controller = new AIGeneratedMediaController({
  adapter: createAIGeneratedMediaAdapter(async (request, context) => {
    context.reportProgress(0.5)
    const result = await myGenerator.generate(request.prompt, {
      kind: request.kind,
      count: request.count,
      signal: context.signal,
    })

    return {
      provider: 'my-host-adapter',
      model: result.model,
      revisedPrompt: result.revisedPrompt,
      assets: result.items.map((item) => ({
        id: item.id,
        kind: request.kind,
        name: item.name,
        mimeType: item.mimeType,
        bytes: item.bytes,
        alt: item.alt,
        caption: item.caption,
      })),
    }
  }),
})

const disclosure = controller.inspectRequest({
  kind: 'image',
  prompt: 'A labelled diagram of the release pipeline',
})

const candidates = await controller.generate({
  kind: 'image',
  prompt: 'A labelled diagram of the release pipeline',
})
```

`inspectRequest` does not call the adapter. Requests exclude document content
and reference assets by default and say so in their `privacy` object. An
application that wants document-aware or image-to-image generation must define
that disclosure and data transfer in its own adapter rather than having
Fountain silently collect context.

Generated assets carry copied `Uint8Array` bytes. Per-asset `metadata` and
result-wide `generationMetadata` remain distinct, while provider, model, and
revised-prompt provenance travels with every candidate. Assets are intentionally not
provider URLs: temporary URLs may expire, disclose bearer credentials, bypass
the application's storage policy, or stop being portable. Defaults allow eight
candidates, 20 MiB per asset, and 50 MiB total; all are configurable downward or
upward to the documented 1 GiB hard ceiling. For genuinely large video jobs,
use a host job/persistence service and return a bounded reviewed derivative;
do not retain gigabytes in browser memory.

SVG is not accepted as a generated image preview because active/external SVG
content needs a separate sanitization policy. Raster image, common audio/video,
and syntactically valid file MIME types are checked against the requested kind.
IDs, names, prompt fields, JSON metadata, counts, duration, progress, byte size,
and duplicate outputs fail closed.

## Accept through normal storage

In a browser, bind the reviewed controller to the existing upload handlers:

```ts
import {
  createAIGeneratedMediaCommitter,
  type ImageUploadHandler,
} from 'fountainjs-editor'

const imageUpload: ImageUploadHandler = async (file, { signal, reportProgress }) => {
  const stored = await myFiles.upload(file, { signal, onProgress: reportProgress })
  return { src: stored.url }
}

const commit = createAIGeneratedMediaCommitter(editor, { imageUpload })
await controller.accept(candidates[0], commit)
// or controller.reject(candidates[0])
```

Images require `imageUpload`; audio, video, and files require `assetUpload`.
Fountain never converts a generated candidate directly into a permanent remote
URL and never receives storage credentials. Generation progress and upload
progress are separate fields so the UI does not imply that a preview is already
stored.

If upload fails, the candidate remains pending and may be accepted again. A
successful asset becomes `accepted` and cannot be inserted twice. Cancellation
propagates through the active adapter or upload handler. `clear()` refuses while
work is active.

## React reference UI

`FountainAIGeneratedMedia` is available from `fountainjs-editor/react`:

```tsx
<FountainAIGeneratedMedia
  controller={controller}
  onAccept={commit}
  kinds={['image', 'audio']}
  title="Generated asset review"
/>
```

The component exposes the exact request, distinct generation/upload states,
local image/audio/video previews, metadata, explicit Upload and insert / Reject
actions, errors, stopping, and cleanup. It creates temporary object URLs only
for preview and revokes them on replacement or unmount. It is a reference UI;
other frameworks subscribe to `controller.subscribe` and
`controller.getSnapshot`.

## Security and production responsibilities

- Keep provider and storage credentials on a trusted server unless a provider
  deliberately supports short-lived browser credentials.
- Authenticate and authorize both generation and upload endpoints.
- Apply content policy, moderation, malware scanning, rate limits, quotas, and
  audit logging in the host.
- Do not trust extension, file-name, MIME, model, provider, prompt, or metadata
  strings merely because a model returned them.
- Revalidate uploaded bytes server-side and serve them with safe content types,
  disposition, and origin policy.
- Treat prompts and generation metadata as potentially sensitive. Persist them
  only under an explicit retention policy.
- Use provenance metadata for audit and UI explanation, not as authorization.

Generated media is optional. Applications that do not import its entry or
React surface do not load a provider SDK or pay for a Fountain service.
