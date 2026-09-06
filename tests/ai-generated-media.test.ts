// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import {
  AIGeneratedMediaController,
  StarterKit,
  createAIGeneratedMediaAdapter,
  createAIGeneratedMediaCommitter,
  createEditor,
  insertText,
  undo,
  type AIGeneratedMediaCandidate,
} from '../src';

function imageCandidate(overrides: Partial<AIGeneratedMediaCandidate> = {}): AIGeneratedMediaCandidate {
  return {
    id: 'asset-1',
    kind: 'image',
    name: 'launch.png',
    mimeType: 'image/png',
    bytes: new Uint8Array([137, 80, 78, 71]),
    alt: 'Purple launch illustration',
    caption: 'Generated for the launch note.',
    ...overrides,
  };
}

describe('provider-neutral generated media workflow', () => {
  it('inspects a private-by-default request before calling the provider', () => {
    const generate = vi.fn(async () => ({ assets: [imageCandidate()] }));
    const controller = new AIGeneratedMediaController({
      adapter: createAIGeneratedMediaAdapter(generate),
      idFactory: () => 'request-1',
    });
    expect(controller.inspectRequest({ kind: 'image', prompt: 'A clear launch diagram', count: 1 })).toEqual({
      id: 'request-1',
      kind: 'image',
      prompt: 'A clear launch diagram',
      count: 1,
      privacy: { includesDocumentContent: false, includesReferenceAssets: false },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('keeps generation transient until review, copies bytes, and supports rejection', async () => {
    const source = imageCandidate();
    const progress: number[] = [];
    const controller = new AIGeneratedMediaController({
      adapter: createAIGeneratedMediaAdapter(async (_request, context) => {
        context.reportProgress(.4);
        return {
          assets: [source],
          model: 'host-image-model',
          provider: 'host-adapter',
          revisedPrompt: 'A concise purple launch diagram',
          metadata: { seed: 42 },
        };
      }),
      idFactory: () => 'request-2',
      now: () => 42,
    });
    controller.subscribe(() => progress.push(controller.getSnapshot().generationProgress));
    const assets = await controller.generate({ kind: 'image', prompt: 'Launch art' });
    expect(progress).toContain(.4);
    expect(controller.getSnapshot()).toMatchObject({ status: 'review', generationProgress: 1 });
    expect(assets[0]).toMatchObject({
      status: 'pending', requestId: 'request-2', model: 'host-image-model', provider: 'host-adapter',
      generationMetadata: { seed: 42 },
    });
    source.bytes[0] = 0;
    expect(controller.getSnapshot().assets[0]?.bytes[0]).toBe(137);
    assets[0]!.bytes[0] = 1;
    expect(controller.getSnapshot().assets[0]?.bytes[0]).toBe(137);
    expect(controller.reject('asset-1')).toEqual({ requestId: 'request-2', assetId: 'asset-1', decision: 'rejected', timestamp: 42 });
    expect(controller.getSnapshot().assets[0]?.status).toBe('rejected');
    expect(() => controller.reject('asset-1')).toThrow(/already rejected/);
  });

  it('accepts only through an explicit committer and exposes separate upload progress', async () => {
    const controller = new AIGeneratedMediaController({
      adapter: createAIGeneratedMediaAdapter(async () => ({ assets: [imageCandidate()] })),
      idFactory: () => 'request-3',
      now: () => 84,
    });
    await controller.generate({ kind: 'image', prompt: 'Launch art' });
    const commits: string[] = [];
    const event = await controller.accept('asset-1', async (asset, context) => {
      commits.push(asset.name);
      context.reportProgress(.65);
      expect(controller.getSnapshot()).toMatchObject({ status: 'accepting', activeAssetId: 'asset-1', uploadProgress: .65 });
      return true;
    });
    expect(commits).toEqual(['launch.png']);
    expect(event).toEqual({ requestId: 'request-3', assetId: 'asset-1', decision: 'accepted', timestamp: 84 });
    expect(controller.getSnapshot()).toMatchObject({ status: 'review', uploadProgress: 1 });
    expect(controller.getSnapshot().assets[0]?.status).toBe('accepted');
    await expect(controller.accept('asset-1', async () => true)).rejects.toThrow(/already accepted/);
  });

  it('routes accepted image bytes through the normal mapped host upload and one-step undo', async () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
    const controller = new AIGeneratedMediaController({
      adapter: createAIGeneratedMediaAdapter(async () => ({ assets: [imageCandidate()] })),
    });
    await controller.generate({ kind: 'image', prompt: 'Launch art' });
    let release!: (url: string) => void;
    const uploaded = new Promise<string>((resolve) => { release = resolve; });
    const commit = createAIGeneratedMediaCommitter(editor, {
      imageUpload: async (file, context) => {
        expect(file.name).toBe('launch.png');
        expect(file.type).toBe('image/png');
        expect(file.size).toBe(4);
        context.reportProgress(.5);
        return uploaded;
      },
    });
    const acceptance = controller.accept('asset-1', commit);
    expect(insertText(editor, 'Written while the generated asset uploads')).toBe(true);
    release('https://cdn.example.com/generated/launch.png');
    await acceptance;
    const image = editor.state.doc.content.find((node) => node.type.name === 'image_super');
    expect(image?.attrs).toMatchObject({
      src: 'https://cdn.example.com/generated/launch.png',
      alt: 'Purple launch illustration',
      caption: 'Generated for the launch note.',
    });
    expect(editor.state.doc.child(0).textContent).toBe('Written while the generated asset uploads');
    expect(undo(editor)).toBe(true);
    expect(editor.state.doc.content.some((node) => node.type.name === 'image_super')).toBe(false);
  });

  it('routes audio through the normal asset boundary without trusting provider URLs', async () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
    const controller = new AIGeneratedMediaController({
      adapter: createAIGeneratedMediaAdapter(async () => ({ assets: [{
        id: 'audio-1', kind: 'audio', name: 'voice.mp3', mimeType: 'audio/mpeg', bytes: new Uint8Array([1, 2, 3]),
        title: 'Generated narration', caption: 'Host-persisted narration',
      }] })),
    });
    await controller.generate({ kind: 'audio', prompt: 'Narrate the release note' });
    await controller.accept('audio-1', createAIGeneratedMediaCommitter(editor, {
      assetUpload: async (file, context) => {
        expect(context.kind).toBe('audio');
        expect(file.size).toBe(3);
        return 'https://cdn.example.com/generated/voice.mp3';
      },
    }));
    expect(editor.state.doc.content.find((node) => node.type.name === 'audio')?.attrs).toMatchObject({
      src: 'https://cdn.example.com/generated/voice.mp3', title: 'Generated narration', caption: 'Host-persisted narration',
    });
  });

  it('fails closed for invalid output, bounds, progress, and concurrent operations', async () => {
    const invalid = new AIGeneratedMediaController({
      adapter: createAIGeneratedMediaAdapter(async () => ({ assets: [imageCandidate({ mimeType: 'image/svg+xml' })] })),
    });
    await expect(invalid.generate({ kind: 'image', prompt: 'Unsafe preview' })).rejects.toThrow(/not permitted/);

    const oversized = new AIGeneratedMediaController({
      maxAssetBytes: 2,
      adapter: createAIGeneratedMediaAdapter(async () => ({ assets: [imageCandidate({ bytes: new Uint8Array([1, 2, 3]) })] })),
    });
    await expect(oversized.generate({ kind: 'image', prompt: 'Too large' })).rejects.toThrow(/1 through 2 bytes/);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const concurrent = new AIGeneratedMediaController({
      adapter: createAIGeneratedMediaAdapter(async (_request, context) => {
        context.reportProgress(.2);
        await gate;
        return { assets: [imageCandidate()] };
      }),
    });
    const first = concurrent.generate({ kind: 'image', prompt: 'One' });
    await expect(concurrent.generate({ kind: 'image', prompt: 'Two' })).rejects.toThrow(/already active/);
    expect(() => concurrent.clear()).toThrow(/operation is active/);
    release();
    await first;
    await expect(concurrent.accept('asset-1', async (_asset, context) => {
      context.reportProgress(2);
      return true;
    })).rejects.toThrow(/between 0 and 1/);
    expect(concurrent.getSnapshot().assets[0]?.status).toBe('pending');
  });

  it('cancels generation and upload without accepting partial work', async () => {
    const generation = new AIGeneratedMediaController({
      adapter: createAIGeneratedMediaAdapter((_request, context) => new Promise<never>((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true });
      })),
    });
    const pendingGeneration = generation.generate({ kind: 'image', prompt: 'Stop this' });
    generation.cancel();
    await expect(pendingGeneration).rejects.toMatchObject({ name: 'AbortError' });
    expect(generation.getSnapshot()).toMatchObject({ status: 'idle', assets: [] });

    const upload = new AIGeneratedMediaController({
      adapter: createAIGeneratedMediaAdapter(async () => ({ assets: [imageCandidate()] })),
    });
    await upload.generate({ kind: 'image', prompt: 'Review first' });
    const pendingUpload = upload.accept('asset-1', (_asset, context) => new Promise<boolean>((_resolve, reject) => {
      context.signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })), { once: true });
    }));
    upload.cancel();
    await expect(pendingUpload).rejects.toMatchObject({ name: 'AbortError' });
    expect(upload.getSnapshot()).toMatchObject({ status: 'review' });
    expect(upload.getSnapshot().assets[0]?.status).toBe('pending');
  });
});
