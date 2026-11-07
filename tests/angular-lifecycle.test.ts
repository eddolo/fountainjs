/** @vitest-environment jsdom */
import '@angular/compiler';
import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { By } from '@angular/platform-browser';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { StarterKit, CoreSchemaSpec, Plugin, canUndo, createEditor, insertText, undo, type Editor, type NodeJSON } from 'fountainjs-editor';
import { createFountain, fountainState, FountainEditorDirective } from 'fountainjs-editor/angular';
import { FountainDocumentField } from 'fountainjs-editor/angular/forms';

beforeAll(() => TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting()));
afterEach(() => TestBed.resetTestingModule());

it('owns one editor while its view can remount and retain document/history', async () => {
  const events: string[] = [];
  let owned!: Editor;
  class Owner {
    readonly visible = signal(true);
    readonly editor = createFountain(() => ({
      schema: { ...CoreSchemaSpec, nodes: { ...CoreSchemaSpec.nodes,
        paragraph: { ...CoreSchemaSpec.nodes.paragraph, nodeView: class {
          dom = document.createElement('p'); contentDOM = this.dom;
          update() { return true; }
          destroy() { events.push(`view:destroy:${owned.isDestroyed}`); }
        } },
      } },
      plugins: [...StarterKit.plugins, new Plugin({ props: {
        onCreate: editor => { owned = editor; events.push('create'); },
        onDestroy: () => events.push('destroy'),
      } })],
    }));
    readonly snapshot = fountainState(this.editor);
  }
  Component({ selector: 'angular-test-owner', standalone: true, imports: [FountainEditorDirective],
    template: '@if (visible()) { <div [fountainEditor]="editor()"></div> }<output>{{snapshot()?.doc.textContent}}</output>',
  })(Owner);
  TestBed.configureTestingModule({ imports: [Owner], providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Owner);
  await fixture.whenStable();
  expect(events).toEqual(['create']);
  expect(fixture.componentInstance.editor()).toBe(owned);
  insertText(owned, 'Angular edit'); await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('output').textContent).toBe('Angular edit');
  fixture.componentInstance.visible.set(false); await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('[role=textbox]')).toBeNull();
  expect(owned.isDestroyed).toBe(false);
  fixture.componentInstance.visible.set(true); await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('[role=textbox]').textContent).toBe('Angular edit');
  undo(owned); await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('[role=textbox]').textContent).toBe('');
  fixture.destroy();
  expect(owned.isDestroyed).toBe(true);
  expect(events).toEqual(['create', 'view:destroy:false', 'view:destroy:false', 'destroy']);
});

it('switches external editors/options, releases state subscriptions and never destroys external engines', async () => {
  const first = createEditor({ schema: StarterKit.schema });
  const second = createEditor({ schema: StarterKit.schema, editable: false });
  const firstDestroy = vi.spyOn(first, 'destroy'), secondDestroy = vi.spyOn(second, 'destroy');
  class External {
    readonly editor = signal<Editor | null>(first);
    readonly options = signal({ ariaLabel: 'External Angular editor' });
    readonly snapshot = fountainState(this.editor);
  }
  Component({ selector: 'angular-test-external', standalone: true, imports: [FountainEditorDirective],
    template: '<div [fountainEditor]="editor()" [fountainOptions]="options()"></div><output>{{snapshot()?.doc.textContent}}</output>',
  })(External);
  TestBed.configureTestingModule({ imports: [External], providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(External); await fixture.whenStable();
  insertText(first, 'First'); await fixture.whenStable();
  const initial = fixture.nativeElement.querySelector('[role=textbox]');
  expect(initial.textContent).toBe('First');
  fixture.componentInstance.options.set({ ariaLabel: 'New label' }); await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('[role=textbox]')).not.toBe(initial);
  expect(fixture.nativeElement.querySelector('[role=textbox]').getAttribute('aria-label')).toBe('New label');
  fixture.componentInstance.editor.set(second); await fixture.whenStable();
  insertText(first, ' detached'); await fixture.whenStable();
  expect(fixture.componentInstance.snapshot()).toBe(second.state);
  expect(fixture.nativeElement.querySelector('[role=textbox]').contentEditable).toBe('false');
  fixture.componentInstance.editor.set(null); await fixture.whenStable();
  expect(fixture.componentInstance.snapshot()).toBeNull();
  expect(fixture.nativeElement.querySelector('[role=textbox]')).toBeNull();
  fixture.destroy();
  expect(firstDestroy).not.toHaveBeenCalled(); expect(secondDestroy).not.toHaveBeenCalled();
  first.destroy(); second.destroy();
});

it('rejects calls outside an Angular injection context', () => {
  expect(() => createFountain({ schema: StarterKit.schema })).toThrow();
  expect(() => fountainState(signal(null))).toThrow();
});

const formDocument = (text: string): NodeJSON => ({
  type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

it('syncs an Angular FormControl, isolates writes from undo and disposes its editor', async () => {
  const saved = formDocument('Initial brief');
  class Host {
    readonly config = { schema: StarterKit.schema, plugins: StarterKit.plugins };
    readonly control = new FormControl<NodeJSON | null>(saved);
  }
  Component({ selector: 'angular-test-document-form', standalone: true, imports: [ReactiveFormsModule, FountainDocumentField],
    template: '<fountain-document-field [formControl]="control" [fountainConfig]="config" /><button>Outside</button>',
  })(Host);
  TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const field = fixture.debugElement.query(By.directive(FountainDocumentField)).componentInstance as FountainDocumentField;
  const editor = field.editor()!;
  const control = fixture.componentInstance.control;
  const editable = (): HTMLElement => fixture.nativeElement.querySelector('[role=textbox]');
  const changes = vi.fn();
  control.valueChanges.subscribe(changes);
  expect(editable().textContent).toBe('Initial brief');
  expect(control.pristine).toBe(true);

  insertText(editor, 'Updated ');
  expect(changes).toHaveBeenCalledOnce();
  expect(control.value).toEqual(editor.getJSON());
  expect(control.dirty).toBe(true);
  expect(canUndo(editor)).toBe(true);
  editable().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: editable().firstElementChild }));
  expect(control.untouched).toBe(true);
  editable().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: fixture.nativeElement.querySelector('button') }));
  expect(control.touched).toBe(true);

  control.disable({ emitEvent: false });
  await fixture.whenStable();
  expect(editable().getAttribute('contenteditable')).toBe('false');
  expect(editable().parentElement?.inert).toBe(true);
  insertText(editor, 'Blocked ');
  expect(editor.getText()).toBe('Updated Initial brief');
  control.setValue(formDocument('Loaded by host'));
  expect(changes).toHaveBeenCalledTimes(2);
  expect(editor.getText()).toBe('Loaded by host');
  expect(canUndo(editor)).toBe(false);
  control.enable({ emitEvent: false });
  await fixture.whenStable();
  expect(editable().contentEditable).toBe('true');
  insertText(editor, 'Draft ');
  expect(canUndo(editor)).toBe(true);
  control.reset();
  expect(control.value).toBeNull();
  expect(control.pristine && control.untouched).toBe(true);
  expect(editor.getText()).toBe('');
  expect(undo(editor)).toBe(false);
  fixture.destroy();
  expect(editor.isDestroyed).toBe(true);
});

it('commits an updateOn blur value only when focus leaves the whole field', async () => {
  class Host {
    readonly config = { schema: StarterKit.schema };
    readonly control = new FormControl<NodeJSON | null>(null, { updateOn: 'blur' });
  }
  Component({ selector: 'angular-test-blur-form', standalone: true, imports: [ReactiveFormsModule, FountainDocumentField],
    template: '<fountain-document-field [formControl]="control" [fountainConfig]="config" /><button>Outside</button>',
  })(Host);
  TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const field = fixture.debugElement.query(By.directive(FountainDocumentField)).componentInstance as FountainDocumentField;
  const editor = field.editor()!;
  const control = fixture.componentInstance.control;
  const editable: HTMLElement = fixture.nativeElement.querySelector('[role=textbox]');
  insertText(editor, 'Pending brief');
  expect(control.value).toBeNull();
  editable.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: editable.firstElementChild }));
  expect(control.value).toBeNull();
  editable.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: fixture.nativeElement.querySelector('button') }));
  expect(control.value).toEqual(editor.getJSON());
  expect(control.touched && control.dirty).toBe(true);
});
