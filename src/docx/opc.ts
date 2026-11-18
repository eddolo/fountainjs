export function xmlEscape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!);
}

export const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

export const OFFICE_REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export const OFFICE_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.';

export function relationshipXML(id: string, type: string, target: string, external = false): string {
  return `<Relationship Id="${id}" Type="${type}" Target="${xmlEscape(target)}"${external ? ' TargetMode="External"' : ''}/>`;
}

export function relationshipsXML(body: string): string {
  return `<Relationships xmlns="${REL_NS}">${body}</Relationships>`;
}
