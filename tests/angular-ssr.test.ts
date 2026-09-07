import '@angular/compiler';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { renderApplication } from '@angular/platform-server';
import { expect, it } from 'vitest';
import { createFountain, fountainState, FountainEditorDirective } from 'fountainjs-editor/angular';

it('keeps the Angular editor inert during real Angular server rendering', async () => {
  expect(typeof document).toBe('undefined');
  let called = false;
  class ServerEditor {
    readonly editor = createFountain(() => { called = true; throw new Error('Do not construct an editor on the server'); });
    readonly snapshot = fountainState(this.editor);
  }
  Component({ selector: 'fountain-ssr-test', standalone: true, imports: [FountainEditorDirective],
    template: '<div [fountainEditor]="editor()"></div><output>{{snapshot() === null ? "inert" : "unexpected"}}</output>',
  })(ServerEditor);
  const html = await renderApplication(context => bootstrapApplication(ServerEditor, {
    providers: [provideZonelessChangeDetection()],
  }, context), { document: '<html><body><fountain-ssr-test></fountain-ssr-test></body></html>', url: 'http://localhost/', allowedHosts: ['localhost'] });
  expect(html).toContain('inert'); expect(html).not.toContain('contenteditable');
  expect(called).toBe(false);
});
