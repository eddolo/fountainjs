// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  CoreExtension,
  EditorView,
  HTMLExporter,
  HTMLImporter,
  MarkdownExporter,
  MediaExtension,
  NodeSelection,
  StarterKit,
  composeExtensions,
  createEditor,
  createMediaExtension,
  deleteMedia,
  getActiveMedia,
  insertAudio,
  insertEmbed,
  insertFileAttachment,
  insertText,
  insertVideo,
  setMediaAttributes,
  startAssetUpload,
  undo,
} from '../src';

function mediaNode(editor: ReturnType<typeof createEditor>, kind: string) {
  return editor.state.doc.content.find((node) => node.type.name === kind);
}

function subscriberCount(editor: ReturnType<typeof createEditor>): number {
  return (editor as unknown as { subscribers: Set<unknown> }).subscribers.size;
}

describe('first-party production media extension', () => {
  it('ships independently and through StarterKit with typed public commands', () => {
    expect(StarterKit.getExtension('media')).toBe(MediaExtension);
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });

    expect(insertAudio(editor, {
      src: 'https://cdn.example.com/interview.mp3',
      title: 'Founder interview',
      caption: 'Recorded in London',
      controls: true,
      preload: 'metadata',
      tracks: [{ src: 'https://cdn.example.com/interview-en.vtt', kind: 'captions', srclang: 'en', label: 'English', default: true }],
    })).toBe(true);
    expect(insertVideo(editor, {
      src: 'https://cdn.example.com/launch.mp4',
      poster: 'https://cdn.example.com/launch.jpg',
      title: 'Launch film',
      caption: 'The product launch',
      width: '720px',
      height: '405px',
      align: 'right',
      controls: true,
      playsInline: true,
    })).toBe(true);
    expect(insertFileAttachment(editor, {
      src: 'https://cdn.example.com/brief.pdf',
      name: 'Project brief.pdf',
      mimeType: 'application/pdf',
      size: 125_000,
      description: 'Approved project brief',
      downloadName: 'project-brief.pdf',
    })).toBe(true);

    expect(mediaNode(editor, 'audio')?.textContent).toBe('[Audio: Founder interview]');
    expect(Object.isFrozen(mediaNode(editor, 'audio')?.attrs.tracks)).toBe(true);
    expect(Object.isFrozen((mediaNode(editor, 'audio')?.attrs.tracks as readonly object[])[0])).toBe(true);
    expect(mediaNode(editor, 'video')?.attrs).toMatchObject({ width: '720px', height: '405px', align: 'right' });
    expect(mediaNode(editor, 'file_attachment')?.textContent).toBe('[File: Project brief.pdf]');
    expect(editor.getText()).toContain('[Video: Launch film]');
  });

  it('canonicalizes approved embeds and rejects arbitrary or unsafe iframe sources', () => {
    const editor = createEditor({ schema: StarterKit.schema });
    expect(insertEmbed(editor, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42', {
      title: 'Product walkthrough', caption: 'Privacy-enhanced YouTube embed',
    })).toBe(true);
    const embed = mediaNode(editor, 'embed');
    expect(embed?.attrs).toMatchObject({
      src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=42',
      provider: 'youtube',
      title: 'Product walkthrough',
    });
    expect(insertEmbed(editor, 'https://untrusted.example/embed/123', { title: 'Unsafe' })).toBe(false);
    expect(insertEmbed(editor, 'javascript:alert(1)', { title: 'Unsafe' })).toBe(false);
    expect(() => editor.state.schema.node('embed', {
      src: 'https://untrusted.example/embed/123', title: 'Bypass attempt',
    })).toThrow('Invalid value for attribute: src');
    expect(() => editor.state.schema.node('embed', {
      src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', provider: 'vimeo', title: 'Mismatched metadata',
    })).toThrow('Invalid node invariant: embed');
    expect(() => editor.state.schema.node('embed', {
      src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', provider: 'youtube', title: 'Permission escalation',
      allow: 'clipboard-write', sandbox: 'allow-scripts allow-same-origin allow-presentation', allowFullscreen: true,
    })).toThrow('Invalid node invariant: embed');
    expect(() => editor.state.schema.node('embed', {
      src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', provider: 'youtube', title: 'Sandbox escalation',
      allow: '', sandbox: 'allow-scripts allow-same-origin allow-presentation allow-modals', allowFullscreen: true,
    })).toThrow('Invalid node invariant: embed');
  });

  it('allows a host to replace the embed allowlist without trusting arbitrary iframes', () => {
    const custom = createMediaExtension({
      embedProviders: [{
        name: 'acme-video',
        allow: 'fullscreen; picture-in-picture',
        sandbox: 'allow-scripts allow-same-origin',
        resolve: (url) => url.hostname === 'video.acme.test' && /^\/watch\/\d+$/.test(url.pathname)
          ? `https://video.acme.test/embed/${url.pathname.split('/').at(-1)}`
          : url.hostname === 'video.acme.test' && /^\/embed\/\d+$/.test(url.pathname) ? url.href : null,
      }],
    });
    const kit = composeExtensions([CoreExtension, custom]);
    const editor = createEditor({ schema: kit.schema });
    expect(kit.commands.insertEmbed?.(editor, 'https://video.acme.test/watch/42', { title: 'Private training' })).toBe(true);
    expect(mediaNode(editor, 'embed')?.attrs).toMatchObject({
      provider: 'acme-video', src: 'https://video.acme.test/embed/42', allowFullscreen: false,
    });
    expect(insertEmbed(editor, 'https://vimeo.com/12345678', { title: 'Not on this allowlist' })).toBe(false);
    expect(() => createMediaExtension({ embedProviders: [{
      name: 'bad', resolve: () => null, allow: 'camera',
    }] })).toThrow('unsafe allow permission');
  });

  it('round-trips native media, tracks, files, and embeds through safe HTML', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      content: {
        type: 'doc',
        content: [
          { type: 'audio', attrs: {
            src: 'https://cdn.example.com/story.ogg', title: 'Audio story', caption: 'Listen', controls: true,
            autoplay: false, loop: true, muted: false, preload: 'auto', controlsList: 'nodownload',
            crossOrigin: 'anonymous', disableRemotePlayback: true,
            tracks: [{ src: 'https://cdn.example.com/story.vtt', kind: 'captions', srclang: 'en', label: 'English', default: true }],
          } },
          { type: 'video', attrs: {
            src: 'https://cdn.example.com/story.mp4', poster: 'https://cdn.example.com/story.webp', title: 'Video story', caption: 'Watch',
            width: '80%', height: '360px', align: 'left', controls: true, autoplay: false, loop: false,
            muted: true, preload: 'metadata', controlsList: 'noremoteplayback', crossOrigin: '',
            disableRemotePlayback: true, tracks: [], playsInline: true,
          } },
          { type: 'file_attachment', attrs: {
            src: 'https://cdn.example.com/notes.txt', name: 'notes.txt', mimeType: 'text/plain', size: 42,
            description: 'Meeting notes', downloadName: 'meeting-notes.txt',
          } },
          { type: 'embed', attrs: {
            src: 'https://player.vimeo.com/video/12345678', provider: 'vimeo', title: 'Vimeo demo', caption: 'External demo',
            width: '640px', height: '360px', align: 'center', allow: 'autoplay; fullscreen; picture-in-picture',
            sandbox: 'allow-scripts allow-same-origin allow-presentation', allowFullscreen: true,
          } },
        ],
      },
    });
    const html = HTMLExporter.export(editor.state, { document: false });
    expect(html).toContain('data-fountain-media="audio"');
    expect(html).toContain('<track src="https://cdn.example.com/story.vtt" kind="captions"');
    expect(html).toContain('data-fountain-file="true"');
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-presentation"');
    expect(html).not.toContain('javascript:');

    const restored = HTMLImporter.parse(html, editor.state.schema);
    expect(restored.content.map((node) => node.type.name)).toEqual(['audio', 'video', 'file_attachment', 'embed']);
    expect(restored.child(0).attrs).toMatchObject({ title: 'Audio story', loop: true, controlsList: 'nodownload' });
    expect(restored.child(0).attrs.tracks).toEqual([{ src: 'https://cdn.example.com/story.vtt', kind: 'captions', srclang: 'en', label: 'English', default: true }]);
    expect(restored.child(1).attrs).toMatchObject({ poster: 'https://cdn.example.com/story.webp', width: '80%', height: '360px', muted: true });
    expect(restored.child(2).attrs).toMatchObject({ name: 'notes.txt', size: 42, downloadName: 'meeting-notes.txt' });
    expect(restored.child(3).attrs).toMatchObject({ provider: 'vimeo', allowFullscreen: true });
    expect(MarkdownExporter.export(editor.state)).toContain('[Audio: Audio story](https://cdn.example.com/story.ogg)');

    const escalated = HTMLImporter.parse('<figure data-fountain-media="embed" data-provider="vimeo"><iframe src="https://player.vimeo.com/video/12345678" title="Untrusted permissions" allow="clipboard-write" sandbox="allow-scripts allow-same-origin allow-presentation"></iframe></figure>', editor.state.schema);
    expect(escalated.content.some((node) => node.type.name === 'embed')).toBe(false);
  });

  it('updates and deletes selected media while preserving semantic selection', () => {
    const editor = createEditor({ schema: StarterKit.schema, plugins: StarterKit.plugins });
    expect(insertVideo(editor, { src: 'https://cdn.example.com/old.mp4', title: 'Old', controls: true })).toBe(true);
    const path = editor.state.doc.content.findIndex((node) => node.type.name === 'video');
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [path])));
    // Use the public query rather than relying on a toolbar-specific state model.
    expect(getActiveMedia(editor)?.kind).toBe('video');
    expect(setMediaAttributes(editor, { src: 'https://cdn.example.com/new.mp4', title: 'New', width: '640px' })).toBe(true);
    expect(getActiveMedia(editor)?.node.attrs).toMatchObject({ src: 'https://cdn.example.com/new.mp4', title: 'New', width: '640px' });
    expect(setMediaAttributes(editor, { src: 'javascript:alert(1)' })).toBe(false);
    expect(deleteMedia(editor)).toBe(true);
    expect(mediaNode(editor, 'video')).toBeUndefined();
    expect(undo(editor)).toBe(true);
    expect(mediaNode(editor, 'video')?.attrs.title).toBe('New');
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(undo(editor)).toBe(true);
    expect(mediaNode(editor, 'video')?.attrs).toMatchObject({ src: 'https://cdn.example.com/old.mp4', title: 'Old' });
  });

  it('mounts native accessible controls, file metadata, selection state, and load recovery', () => {
    const editor = createEditor({
      schema: StarterKit.schema,
      content: { type: 'doc', content: [
        { type: 'audio', attrs: { src: 'https://cdn.example.com/audio.mp3', title: 'Accessible audio', caption: 'Transcript available', controls: true } },
        { type: 'file_attachment', attrs: { src: 'https://cdn.example.com/report.pdf', name: 'Report.pdf', mimeType: 'application/pdf', size: 2048 } },
      ] },
    });
    const mount = document.createElement('div');
    document.body.append(mount);
    const view = new EditorView(mount, editor);
    const figure = view.dom.querySelector<HTMLElement>('.fountain-media--audio');
    const audio = figure?.querySelector('audio');
    expect(figure?.getAttribute('aria-label')).toBe('[Audio: Accessible audio]');
    expect(audio?.controls).toBe(true);
    expect(figure?.textContent).toContain('Transcript available');
    audio?.dispatchEvent(new Event('error'));
    expect(figure?.dataset.fountainMediaError).toBe('true');
    expect(figure?.querySelector('[role="status"]')?.hasAttribute('hidden')).toBe(false);
    expect(view.dom.querySelector('.fountain-file')?.textContent).toContain('application/pdf · 2.0 KB');

    const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
    figure?.querySelector<HTMLButtonElement>('button')?.click();
    expect(load).toHaveBeenCalledOnce();
    load.mockRestore();
    view.destroy();
  });

  it('maps asset uploads through concurrent edits and reports observable progress', async () => {
    let resolve!: (value: { src: string; caption: string }) => void;
    const uploaded = new Promise<{ src: string; caption: string }>((accept) => { resolve = accept; });
    const editor = createEditor({ schema: StarterKit.schema });
    const states: string[] = [];
    const task = startAssetUpload(editor, new File(['video'], 'launch.mp4', { type: 'video/mp4' }), {
      upload: async (_file, context) => {
        context.reportProgress(.4);
        expect(context.kind).toBe('video');
        return uploaded;
      },
      onStatusChange: (snapshot) => states.push(`${snapshot.status}:${snapshot.progress}`),
    });
    expect(task.snapshot).toMatchObject({ kind: 'video', status: 'uploading', progress: .4, attempt: 1 });
    expect(insertText(editor, 'Written during upload')).toBe(true);
    resolve({ src: 'https://cdn.example.com/launch.mp4', caption: 'Uploaded after the edit' });
    await expect(task.completion).resolves.toBe(true);
    expect(mediaNode(editor, 'video')?.attrs).toMatchObject({
      title: 'launch', caption: 'Uploaded after the edit', controls: true, playsInline: true,
    });
    expect(editor.state.doc.child(0).textContent).toBe('Written during upload');
    expect(states.at(-1)).toBe('succeeded:1');
  });

  it('cancels, retries, and fails closed when an asset replacement becomes stale', async () => {
    const editor = createEditor({ schema: StarterKit.schema });
    const cancelled = startAssetUpload(editor, new File(['audio'], 'cancel.mp3', { type: 'audio/mpeg' }), {
      upload: (_file, context) => new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true });
      }),
    });
    cancelled.cancel();
    await expect(cancelled.completion).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled.snapshot.status).toBe('cancelled');
    expect(mediaNode(editor, 'audio')).toBeUndefined();

    let attempt = 0;
    const retried = startAssetUpload(editor, new File(['notes'], 'notes.pdf', { type: 'application/pdf' }), {
      upload: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('Storage unavailable');
        return 'https://cdn.example.com/notes.pdf';
      },
    });
    await expect(retried.completion).rejects.toThrow('Storage unavailable');
    expect(retried.snapshot).toMatchObject({ status: 'failed', attempt: 1, kind: 'file' });
    await expect(retried.retry()).resolves.toBe(true);
    expect(mediaNode(editor, 'file_attachment')?.attrs).toMatchObject({ name: 'notes.pdf', size: 5 });

    const subscriptionsBeforeFailure = subscriberCount(editor);
    const invalidProgress = startAssetUpload(editor, new File(['audio'], 'invalid.mp3', { type: 'audio/mpeg' }), {
      upload: async (_file, context) => {
        context.reportProgress(2);
        return 'https://cdn.example.com/invalid.mp3';
      },
    });
    await expect(invalidProgress.completion).rejects.toThrow('between 0 and 1');
    expect(invalidProgress.snapshot.status).toBe('failed');
    expect(subscriberCount(editor)).toBe(subscriptionsBeforeFailure + 1);
    invalidProgress.cancel();
    expect(invalidProgress.snapshot.status).toBe('cancelled');
    expect(subscriberCount(editor)).toBe(subscriptionsBeforeFailure);

    const filePath = editor.state.doc.content.findIndex((node) => node.type.name === 'file_attachment');
    expect(() => startAssetUpload(editor, new File(['audio'], 'wrong.mp3', { type: 'audio/mpeg' }), {
      replacePath: [filePath],
      upload: async () => 'https://cdn.example.com/wrong.mp3',
    })).toThrow('cannot replace file_attachment');
    expect(() => startAssetUpload(editor, new File(['unknown'], 'unknown.bin'), {
      kind: 'image' as never,
      upload: async () => 'https://cdn.example.com/unknown.bin',
    })).toThrow('must be audio, video, or file');

    expect(insertAudio(editor, { src: 'https://cdn.example.com/old.mp3', title: 'Old' })).toBe(true);
    const path = editor.state.doc.content.findIndex((node) => node.type.name === 'audio');
    let finish!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { finish = resolve; });
    const stale = startAssetUpload(editor, new File(['new'], 'new.mp3', { type: 'audio/mpeg' }), {
      replacePath: [path],
      upload: async () => pending,
    });
    editor.dispatch(editor.createTransaction().setSelection(new NodeSelection(editor.state.doc, [path])));
    expect(deleteMedia(editor)).toBe(true);
    finish('https://cdn.example.com/new.mp3');
    await expect(stale.completion).rejects.toThrow('no longer exists');
    expect(editor.state.doc.content.some((node) => node.attrs.src === 'https://cdn.example.com/new.mp3')).toBe(false);
    stale.cancel();
    expect(subscriberCount(editor)).toBe(0);
  });

  it('routes pasted non-image files through a framework-neutral view adapter and event', async () => {
    const editor = createEditor({ schema: StarterKit.schema });
    const mount = document.createElement('div');
    document.body.append(mount);
    const snapshots: string[] = [];
    const view = new EditorView(mount, editor, {
      assetUpload: async (file, context) => {
        expect(file.name).toBe('voice.mp3');
        context.reportProgress(.5);
        return { src: 'https://cdn.example.com/voice.mp3', title: 'Voice note' };
      },
    });
    view.dom.addEventListener('fountain-asset-upload', (event) => {
      const snapshot = (event as CustomEvent<{ snapshot: { status: string; progress: number } }>).detail.snapshot;
      snapshots.push(`${snapshot.status}:${snapshot.progress}`);
    });
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(paste, 'clipboardData', { value: {
      files: [new File(['voice'], 'voice.mp3', { type: 'audio/mpeg' })],
      getData: () => '',
    } });
    view.dom.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mediaNode(editor, 'audio')?.attrs.title).toBe('Voice note');
    expect(snapshots).toContain('uploading:0.5');
    expect(snapshots.at(-1)).toBe('succeeded:1');
    view.destroy();
  });
});
