import type { LeanCompletion, LeanDiagnostic } from './types';
import type { LeanController } from './controller';
import { selectLeanDiagnostic } from './diagnostics';
import { insertText } from '../core';

export interface LeanInfoViewOptions {
  readonly ariaLabel?: string;
  /** Opens the host's trusted-provider picker; FountainJS never invents one. */
  readonly onConfigureProvider?: () => void;
  readonly onSelectDiagnostic?: (diagnostic: LeanDiagnostic) => void;
  readonly onCompletion?: (completion: LeanCompletion) => void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  document: Document,
  name: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const result = document.createElement(name);
  if (className) result.className = className;
  if (text !== undefined) result.textContent = text;
  return result;
}

/** Framework-neutral, safely rendered proof state and provider disclosure UI. */
export class LeanInfoView {
  readonly dom: HTMLElement;
  private readonly unsubscribe: () => void;

  constructor(
    mount: HTMLElement,
    public readonly controller: LeanController,
    private readonly options: LeanInfoViewOptions = {},
  ) {
    this.dom = element(mount.ownerDocument, 'section', 'fountain-lean-info');
    this.dom.setAttribute('aria-label', options.ariaLabel ?? 'Lean information');
    mount.appendChild(this.dom);
    this.unsubscribe = controller.subscribe(() => this.render());
    this.render();
  }

  destroy(): void {
    this.unsubscribe();
    this.dom.remove();
  }

  private render(): void {
    const document = this.dom.ownerDocument;
    const snapshot = this.controller.getSnapshot();
    this.dom.replaceChildren();

    const header = element(document, 'header', 'fountain-lean-info__header');
    header.appendChild(element(document, 'strong', '', 'Lean 4'));
    const status = element(document, 'span', `fountain-lean-info__status is-${snapshot.status}`, snapshot.status.replace('-', ' '));
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    header.appendChild(status);
    this.dom.appendChild(header);

    if (!snapshot.provider) {
      this.dom.appendChild(element(
        document,
        'p',
        'fountain-lean-info__empty',
        'Source-only mode. No checker is configured and no source leaves this editor.',
      ));
      if (this.options.onConfigureProvider) {
        const configure = element(document, 'button', 'fountain-lean-info__configure', 'Choose a Lean checker');
        configure.type = 'button';
        configure.addEventListener('click', this.options.onConfigureProvider);
        this.dom.appendChild(configure);
      }
      return;
    }

    const disclosure = element(document, 'div', 'fountain-lean-info__provider');
    disclosure.appendChild(element(document, 'b', '', snapshot.provider.label));
    disclosure.appendChild(element(
      document,
      'span',
      '',
      `${snapshot.provider.mode} · ${snapshot.provider.dataDestination}`,
    ));
    if (snapshot.provider.endpoint) disclosure.appendChild(element(document, 'code', '', snapshot.provider.endpoint));
    if (snapshot.provider.dataUseNotice) disclosure.appendChild(element(document, 'p', '', snapshot.provider.dataUseNotice));
    this.dom.appendChild(disclosure);

    const actions = element(document, 'div', 'fountain-lean-info__actions');
    if (snapshot.status === 'requesting') {
      const cancel = element(document, 'button', '', 'Cancel');
      cancel.type = 'button';
      cancel.addEventListener('click', () => this.controller.cancel());
      actions.appendChild(cancel);
    } else {
      if (this.controller.provider?.check) actions.appendChild(this.actionButton(document, 'Check proof', () => this.controller.check()));
      if (this.controller.provider?.goals) actions.appendChild(this.actionButton(document, 'Goals at cursor', () => this.controller.goals()));
      if (this.controller.provider?.hover) actions.appendChild(this.actionButton(document, 'Explain at cursor', () => this.controller.hover()));
      if (this.controller.provider?.expectedType) actions.appendChild(this.actionButton(document, 'Expected type', () => this.controller.expectedType()));
      if (this.controller.provider?.complete) actions.appendChild(this.actionButton(document, 'Completions', () => this.controller.complete()));
    }
    if (actions.childElementCount) this.dom.appendChild(actions);

    if (snapshot.error) {
      const error = element(document, 'p', 'fountain-lean-info__error', snapshot.error);
      error.setAttribute('role', 'alert');
      this.dom.appendChild(error);
    }

    if (snapshot.check) {
      const section = element(document, 'section', 'fountain-lean-info__section');
      section.appendChild(element(document, 'h3', '', snapshot.check.status === 'verified' ? 'Proof checked' : 'Diagnostics'));
      if (snapshot.check.message) section.appendChild(element(document, 'p', '', snapshot.check.message));
      const list = element(document, 'ul');
      snapshot.check.diagnostics.forEach((diagnostic) => {
        const item = element(document, 'li');
        const button = element(document, 'button', `is-${diagnostic.severity}`, `${diagnostic.severity}: ${diagnostic.message}`);
        button.type = 'button';
        button.addEventListener('click', () => {
          if (this.options.onSelectDiagnostic) this.options.onSelectDiagnostic(diagnostic);
          else if (snapshot.activeRequest) selectLeanDiagnostic(this.controller.editor, snapshot.activeRequest, diagnostic);
        });
        item.appendChild(button);
        list.appendChild(item);
      });
      if (list.childElementCount) section.appendChild(list);
      this.dom.appendChild(section);
    }

    if (snapshot.goals) {
      const section = element(document, 'section', 'fountain-lean-info__section');
      section.appendChild(element(document, 'h3', '', 'Goals'));
      snapshot.goals.forEach((goal) => {
        const article = element(document, 'article', 'fountain-lean-info__goal');
        goal.hypotheses?.forEach((hypothesis) => article.appendChild(element(document, 'code', '', hypothesis)));
        article.appendChild(element(document, 'b', '', `⊢ ${goal.target}`));
        section.appendChild(article);
      });
      if (!snapshot.goals.length) section.appendChild(element(document, 'p', '', 'No open goals.'));
      this.dom.appendChild(section);
    }

    if (snapshot.hover !== undefined) {
      const section = element(document, 'section', 'fountain-lean-info__section');
      section.appendChild(element(document, 'h3', '', 'At cursor'));
      section.appendChild(element(document, 'pre', '', snapshot.hover?.markdown ?? 'No information available.'));
      this.dom.appendChild(section);
    }

    if (snapshot.expectedType !== undefined) {
      const section = element(document, 'section', 'fountain-lean-info__section');
      section.appendChild(element(document, 'h3', '', 'Expected type'));
      section.appendChild(element(document, 'pre', '', snapshot.expectedType?.markdown ?? 'No expected type available.'));
      this.dom.appendChild(section);
    }

    if (snapshot.completions) {
      const section = element(document, 'section', 'fountain-lean-info__section');
      section.appendChild(element(document, 'h3', '', 'Completions'));
      const list = element(document, 'ul');
      snapshot.completions.forEach((completion) => {
        const item = element(document, 'li');
        const button = element(document, 'button', '', completion.detail ? `${completion.label} — ${completion.detail}` : completion.label);
        button.type = 'button';
        button.addEventListener('click', () => {
          if (this.options.onCompletion) this.options.onCompletion(completion);
          else insertText(this.controller.editor, completion.insertText ?? completion.label);
        });
        item.appendChild(button);
        list.appendChild(item);
      });
      section.appendChild(list);
      this.dom.appendChild(section);
    }
  }

  private actionButton(document: Document, label: string, action: () => Promise<unknown>): HTMLButtonElement {
    const button = element(document, 'button', '', label);
    button.type = 'button';
    button.addEventListener('click', () => { void action().catch(() => undefined); });
    return button;
  }
}
