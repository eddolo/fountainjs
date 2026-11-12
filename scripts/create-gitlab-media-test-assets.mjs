import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const directory = new URL('../artifacts/gitlab-media-test-assets/', import.meta.url);
await mkdir(directory, { recursive: true });
const samples = 44100, wav = Buffer.alloc(44 + samples * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(44100, 24); wav.writeUInt32LE(88200, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples * 2, 40);
for (let sample = 0; sample < samples; sample++) wav.writeInt16LE(Math.round(Math.sin(sample / 44100 * Math.PI * 880) * 1200), 44 + sample * 2);
await writeFile(new URL('fountain-recording.wav', directory), wav);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const result = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
    document.body.append(canvas); const drawing = canvas.getContext('2d');
    const paint = frame => {
      drawing.fillStyle = frame % 2 ? '#4433aa' : '#176657'; drawing.fillRect(0, 0, 320, 180);
      drawing.fillStyle = 'white'; drawing.font = '20px sans-serif'; drawing.fillText('Fountain media audit', 30, 70);
      drawing.fillRect(30, 110, 20 + frame % 20 * 10, 10);
    };
    paint(0); const image = canvas.toDataURL('image/png').split(',')[1];
    paint(1); const replacement = canvas.toDataURL('image/png').split(',')[1];
    const stream = canvas.captureStream(15), chunks = [];
    const type = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(type)) throw new Error('The audit browser does not support VP8 recording.');
    const recorder = new MediaRecorder(stream, { mimeType: type });
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.start(); const start = performance.now(); let frame = 0;
    await new Promise(resolve => {
      const tick = () => { paint(frame++); if (performance.now() - start >= 1200) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
    return { image, replacement, video: Array.from(new Uint8Array(await new Blob(chunks, { type }).arrayBuffer())) };
  });
  await writeFile(new URL('fountain-figure.png', directory), Buffer.from(result.image, 'base64'));
  await writeFile(new URL('fountain-figure-replacement.png', directory), Buffer.from(result.replacement, 'base64'));
  await writeFile(new URL('fountain-recording.webm', directory), Buffer.from(result.video));
  console.log(JSON.stringify({ directory: fileURLToPath(directory), files: ['fountain-figure.png', 'fountain-figure-replacement.png', 'fountain-recording.wav', 'fountain-recording.webm'],
    scope: 'Generated real PNG, PCM WAV and VP8 WebM files for upload/playback tests; no service responses are fabricated' }));
} finally { await browser.close(); }
