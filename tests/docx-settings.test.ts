// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { Schema, paragraphSpacingAt } from '../src/core';
import { StarterKit, composeExtensions } from '../src/extensions';
import { PagesExtension, inspectPageTemplates } from '../src/pages';
import { exportDOCX, importDOCX } from '../src/docx';
import { parseDOCXXML } from '../src/docx/xml-parser';
import { expandedXMLName } from '../src/docx/xml-names';
import type { XMLElement } from '../src/docx/xml-types';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const SETTINGS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings';
const C = 'http://schemas.openxmlformats.org/package/2006/content-types';
const schema = new Schema(StarterKit.schema);
const children = (element: XMLElement) => element.children.filter((node): node is XMLElement => typeof node !== 'string');
const xml = (bytes: Uint8Array) => parseDOCXXML(strFromU8(bytes), { maxXmlNodes: 10000, maxXmlDepth: 64 });

function assertSettingsPackage(bytes: Uint8Array) {
  const archive = unzipSync(bytes);
  expect(archive['word/settings.xml'], 'Generate settings even without page templates: receiving applications must initialize Word document defaults.').toBeDefined();
  const settings = children(xml(archive['word/settings.xml']!));
  expect(settings).toHaveLength(1);
  expect(expandedXMLName(settings[0]!)).toBe(`${W}|settings`);
  const relRoot = children(xml(archive['word/_rels/document.xml.rels']!))[0]!;
  const relationships = children(relRoot).filter(node => expandedXMLName(node) === `${R}|Relationship` && node.attrs.Type === SETTINGS);
  expect(relationships).toHaveLength(1);
  expect(relationships[0]!.attrs).toMatchObject({ Target: 'settings.xml' });
  expect(relationships[0]!.attrs.TargetMode).toBeUndefined();
  const typesRoot = children(xml(archive['[Content_Types].xml']!))[0]!;
  const types = children(typesRoot).filter(node => expandedXMLName(node) === `${C}|Override` && node.attrs.PartName === '/word/settings.xml');
  expect(types).toHaveLength(1);
  expect(types[0]!.attrs.ContentType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml');
  return settings[0]!;
}

describe('generated Word document settings', () => {
  it('owns an internal settings part for an ordinary document without changing its source model', () => {
    expect(typeof globalThis.document).toBe('undefined');
    const source = schema.node('doc', {}, [schema.node('paragraph', {}, [schema.text('Ordinary document')])]);
    const snapshot = source.toJSON();
    const exported = exportDOCX(source);
    const settings = assertSettingsPackage(exported.bytes);
    expect(children(settings)).toEqual([]);
    expect(source.toJSON()).toEqual(snapshot);
    expect(importDOCX(exported.bytes, schema).document.textContent).toBe('Ordinary document');
  });

  it.each(['default', 'first', 'even'] as const)('retains the %s header and only enables even-page selection when requested', variant => {
    const pageSchema = new Schema(composeExtensions([...StarterKit.extensions, PagesExtension]).schema);
    const p = (text: string) => pageSchema.node('paragraph', {}, [pageSchema.text(text)]);
    const source = pageSchema.node('doc', {}, [p('Body'), pageSchema.node('page_header', { variant }, [p('Requested header')])]);
    const exported = exportDOCX(source);
    const settings = assertSettingsPackage(exported.bytes);
    expect(children(settings).map(node => expandedXMLName(node))).toEqual(variant === 'even' ? [`${W}|evenAndOddHeaders`] : []);
    const reopened = importDOCX(exported.bytes, pageSchema).document;
    expect(inspectPageTemplates(reopened).valid).toBe(true);
    expect(reopened.content.find(node => node.type.name === 'page_header' && node.attrs.variant === variant)?.textContent).toBe('Requested header');
  });

  it('keeps original spacing declarations rather than subtracting the observed native layout offset', () => {
    const before = { unit: 'pt' as const, spacingGroup: 'Owned', spacingBefore: 0, spacingAfter: 10, contextualSpacing: true };
    const after = { ...before, spacingBefore: 12, spacingAfter: 0, contextualSpacing: false };
    const p = (text: string, layout: typeof before) => schema.node('paragraph', { layout }, [schema.text(text)]);
    const source = schema.node('doc', {}, [p('Before', before), p('After', after)]);
    const exported = exportDOCX(source);
    assertSettingsPackage(exported.bytes);
    const reopened = importDOCX(exported.bytes, schema).document;
    expect(reopened.child(0).attrs.layout).toMatchObject(before);
    expect(reopened.child(1).attrs.layout).toMatchObject(after);
    expect(paragraphSpacingAt(reopened, [1])?.spacingBefore).toBe(2);
  });
});
