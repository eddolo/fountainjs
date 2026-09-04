import { describe, expect, it } from 'vitest';
import { assertExtensionConformance } from '../../src/testing';
import { CalloutExampleExtension } from './callout-extension';

describe('framework-neutral callout extension example', () => {
  it('passes the public authoring contract', () => {
    const document = {
      type: 'doc',
      content: [{ type: 'example_callout', content: [{ type: 'text', text: 'Portable content' }] }],
    } as const;
    const report = assertExtensionConformance(CalloutExampleExtension, {
      documents: [{ name: 'callout', document }],
      commands: [{
        name: 'insertExampleCallout',
        args: ['Second callout'],
        document,
        expectAccepted: true,
        expectDocumentChange: true,
      }],
    });

    expect(report.passed).toBe(true);
    expect(report.inventory).toMatchObject({
      nodes: ['example_callout'],
      commands: ['insertExampleCallout'],
    });
  });
});
