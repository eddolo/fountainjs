import { isDeepStrictEqual as equal } from 'node:util';
import { alignedCheckboxRollbackTree, buildIdentityError } from './build-identity.mjs';

// Recompute the rollback verdict from both writers' saved documents and the
// actual stock reader after each Save. A boolean supplied by the collector is insufficient.
export function alignedCheckboxRollbackPassed(candidate, stock) {
  const receipt = stock.rollback;
  if (candidate.side !== 'fountain' || !['original','prepared'].includes(stock.side) || !receipt || receipt.formatVersion !== 3
    || buildIdentityError(candidate) || buildIdentityError(stock) || !equal(receipt.candidateBuild,candidate.buildIdentity.expected)
    || candidate.runId !== stock.runId || candidate.attempt !== stock.attempt || candidate.fixtureHash !== stock.fixtureHash
    || candidate.suite !== 'table-checkbox-recovery' || stock.suite !== candidate.suite
    || candidate.fixture.workflow !== 'recover-aligned-standalone-checkboxes-after-a-table-merge'
    || !equal(stock.fixture,candidate.fixture) || !equal(candidate.browser,stock.browser)
    || !equal(candidate.harnessHashes,stock.harnessHashes) || !equal(candidate.backend,stock.backend)
    || !equal(candidate.deployment.backendMounts,stock.deployment.backendMounts)
    || candidate.deployment.imageId !== stock.deployment.imageId
    || candidate.deployment.backendEnvironmentHash !== stock.deployment.backendEnvironmentHash
    || ![stock,candidate].every(run => run.collectionComplete && !run.errors.length)
    || !Array.isArray(receipt.records) || receipt.records.length !== 2 * stock.fixture.cases.length
    || new Set(receipt.records.map(record => record.iid)).size !== receipt.records.length) return false;
  return stock.fixture.cases.every(input => [candidate,stock].every(writer => {
    const item = writer.observations.find(observation => observation.id === input.id);
    const record = receipt.records.find(r => r.writer === writer.side && r.case === input.id);
    if (!record || !item || item.status !== 'observed' || !Number.isSafeInteger(record.iid)
      || record.iid !== item.iid || record.failure || !item.savedMarkdown
      || record.before !== item.savedMarkdown || record.afterMarkdown !== item.savedMarkdown + ' Markdown follow-up.'
      || !record.afterRich?.endsWith('Status: waiting. Reviewed. Markdown follow-up. Rich follow-up.')
      || record.richEditor?.native !== false || !/\bProseMirror\b/u.test(record.richEditor.className)
      || !equal(record.richDraft,item.reader) || !equal(record.reopened,item.reader)
      || !equal(record.beforeReader?.table,item.reader) || !record.beforeReader?.cells?.length) return false;
    if (stock.buildIdentity.expected.sourceTree === alignedCheckboxRollbackTree &&
      ![record.beforePositions,record.afterPositions].every(positions => Array.isArray(positions) && positions.length === 3 &&
        positions.every(box => box.alignment === input.alignment && box.width > 0 && Number.isFinite(box.center)))) return false;
    return equal(record.beforeReader,record.markdownReader) && equal(record.beforeReader,record.richReader);
  }));
}
