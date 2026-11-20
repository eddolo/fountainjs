import { expect } from '@playwright/test';

export async function observePage(actor, result) {
  actor.on('pageerror', error => result.pageErrors.push(error.message));
  const notice = actor.locator('#security-patch-upgrade-alert-modal[role="dialog"]');
  await actor.addLocatorHandler(notice, async () => {
    const title = await notice.getByTestId('alert-modal-title').innerText();
    await notice.getByRole('button', { name: 'Close', exact: true }).click();
    (result.dismissedPatchNotices ??= []).push(title);
  });
}

export async function openRich(form, side) {
  const editor = form.locator(side === 'fountain' ? '.fountain-editor[contenteditable=true]' : '.ProseMirror[contenteditable=true]');
  const toggle = form.getByRole('button', { name: 'Switch to rich text editing', exact: true });
  await expect(editor.or(toggle).first()).toBeVisible({ timeout: 30000 });
  if (!(await editor.isVisible())) await toggle.click();
  await expect(editor).toBeVisible({ timeout: 30000 });
  return editor;
}

export const editorProof = editor => editor.evaluate(el => ({ native: Boolean(el.closest('[data-fountain-integration="native"]')), className: el.className }));
