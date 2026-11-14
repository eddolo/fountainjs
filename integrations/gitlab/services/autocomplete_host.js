import fuzzaldrinPlus from 'fuzzaldrin-plus';
import axios from '~/lib/utils/axios_utils';
import { currentAssignees, appliedLabels, linkedItems, availableStatuses, supportedConversionTypes } from '~/graphql_shared/issuable_client_state';
import { isCurrentViewWorkItem } from '~/work_items/utils';
import { prioritizeMentionedMembers } from '~/lib/utils/autocomplete_mentions';
import { newDate } from '~/lib/utils/datetime_utility';
import { COMMANDS, MEMBER_COMMANDS } from '../constants';
import { defaultSorter } from './autocomplete_helper';
import { gitLabAutocompleteSources, parseGitLabAutocompleteItems } from './fountain_runtime';

const fields = {
  user: ['username', 'name'], issue: ['iid', 'title'], issue_alternative: ['iid', 'title'], work_item: ['iid', 'title'],
  merge_request: ['iid', 'title'], label: ['title'], milestone: ['title', 'iid'], snippet: ['id', 'title'],
  epic: ['iid', 'title'], epic_alternative: ['iid', 'title'], iteration: ['id', 'title'],
  vulnerability: ['id', 'title'], status: ['name'], type: ['name'], wiki: ['title'],
};
const backendSearch = new Set(['user', 'issue', 'issue_alternative', 'work_item', 'vulnerability']);
const memberCommands = new Set(MEMBER_COMMANDS);

/** Actual host transport/cache/state; no emulated Tiptap editor or DOM in the engine. */
export function createGitLabAutocompleteProvider({ getSources, getRoot, getSidebar = () => undefined }) {
  const cache = new Map();
  return async ({ kind, query, command, prioritizeUsernames, signal }) => {
    const cancelled = () => { if (signal.aborted) throw new DOMException('GITLAB_AUTOCOMPLETE_CANCELLED', 'AbortError'); };
    cancelled();
    if (!Object.hasOwn(fields, kind)) throw new Error('GITLAB_AUTOCOMPLETE_KIND_UNAVAILABLE');
    const canonicalCommand = ({ labels: COMMANDS.LABEL, remove_label: COMMANDS.UNLABEL })[command.slice(1)] || command;
    const workItems = isCurrentViewWorkItem();
    const { workItemId, workItemFullPath, workItemIid, workItemTypeId } = getRoot()?.closest('.js-gfm-wrapper')?.dataset || {};
    if (workItems && (kind === 'user' && canonicalCommand === COMMANDS.UNASSIGN && !workItemId
      || kind === 'label' && canonicalCommand === COMMANDS.UNLABEL && !workItemId
      || ['issue', 'issue_alternative', 'work_item'].includes(kind) && canonicalCommand === COMMANDS.UNLINK && (!workItemFullPath || !workItemIid)))
      throw new Error('GITLAB_AUTOCOMPLETE_CONTEXT_UNAVAILABLE');
    let records;
    if (workItems && kind === 'user' && canonicalCommand === COMMANDS.UNASSIGN && workItemId)
      records = currentAssignees()[workItemId] || [];
    else if (workItems && kind === 'label' && canonicalCommand === COMMANDS.UNLABEL && workItemId)
      records = appliedLabels()[workItemId] || [];
    else if (workItems && ['issue', 'issue_alternative', 'work_item'].includes(kind) && canonicalCommand === COMMANDS.UNLINK && workItemFullPath && workItemIid)
      records = (linkedItems()[`${workItemFullPath}:${workItemIid}`] || []).map(item => ({ ...item, iid: item.iid }));
    else if (['status', 'type'].includes(kind)) {
      if (!workItems || !workItemFullPath || !workItemTypeId || canonicalCommand !== `/${kind}`)
        throw new Error('GITLAB_AUTOCOMPLETE_CONTEXT_UNAVAILABLE');
      records = (kind === 'status' ? availableStatuses() : supportedConversionTypes())[workItemFullPath]?.[workItemTypeId] || [];
    } else {
      const configured = getSources() || {};
      const sources = Object.keys(configured).length ? configured : gl.GfmAutoComplete?.dataSources || {};
      const source = sources[gitLabAutocompleteSources[kind]];
      if (typeof source !== 'string' || !source) throw new Error('GITLAB_AUTOCOMPLETE_ENDPOINT_UNAVAILABLE');
      const url = new URL(source, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin !== window.location.origin || url.username || url.password || url.hash)
        throw new Error('GITLAB_AUTOCOMPLETE_ENDPOINT_REFUSED');
      const stored = !backendSearch.has(kind) && cache.get(url.href);
      if (stored && Date.now() - stored.time < 10000) records = stored.data;
      else {
        const params = {};
        if (backendSearch.has(kind)) params.search = query;
        if (kind === 'user' && memberCommands.has(canonicalCommand) && prioritizeUsernames.length) params.mentioned = prioritizeUsernames;
        const { data } = await axios.get(url.href, { signal, params });
        cancelled();
        if (!Array.isArray(data) || data.length > 10000 || JSON.stringify(data).length > 1024 * 1024)
          throw new Error('GITLAB_AUTOCOMPLETE_RESPONSE_INVALID');
        records = data;
        // Validate before admitting data to the shared URL cache.
        parseGitLabAutocompleteItems(kind, records);
        if (!backendSearch.has(kind)) {
          if (cache.size >= 32) cache.delete(cache.keys().next().value);
          cache.set(url.href, { data, time: Date.now() });
        }
      }
    }
    cancelled();
    parseGitLabAutocompleteItems(kind, records);
    let selected = [...records];
    if (kind === 'label' && (!workItems || canonicalCommand !== COMMANDS.UNLABEL || !workItemId))
      selected = selected.filter(item => {
        if (canonicalCommand === COMMANDS.UNLABEL) return item.set;
        return canonicalCommand !== COMMANDS.LABEL || !item.set;
      });
    if (kind === 'user') {
      const sidebar = getSidebar()?.store;
      const assignees = workItems && workItemId ? currentAssignees()[workItemId] || [] : sidebar?.assignees || [];
      const reviewers = sidebar?.reviewers || [];
      selected = selected.filter(item => {
        const assigned = assignees.some(user => user.username === item.username);
        const reviewer = reviewers.some(user => user.username === item.username);
        if (canonicalCommand === COMMANDS.ASSIGN) return !assigned;
        if (canonicalCommand === COMMANDS.UNASSIGN) return assigned;
        if (canonicalCommand === COMMANDS.ASSIGN_REVIEWER) return !reviewer;
        if (canonicalCommand === COMMANDS.UNASSIGN_REVIEWER) return reviewer;
        return true;
      });
    }
    if (query) selected = kind === 'label' ? fuzzaldrinPlus.filter(selected, query, { key: 'title' })
      : selected.filter(item => fields[kind].some(field => String(item[field] ?? '').toLocaleLowerCase().includes(query.toLocaleLowerCase())));
    if (kind === 'milestone') {
      const rank = item => {
        const date = item.due_date ? newDate(item.due_date).getTime() : NaN;
        if (!Number.isFinite(date)) return [1, 0];
        return date < Date.now() ? [2, date] : [0, date];
      };
      selected.sort((left, right) => rank(left)[0] - rank(right)[0] || rank(left)[1] - rank(right)[1]);
    } else if (kind === 'user' && !query) selected.sort((left, right) => left.username.localeCompare(right.username));
    else selected = defaultSorter(fields[kind])(selected, query);
    if (kind === 'user' && memberCommands.has(canonicalCommand)) selected = prioritizeMentionedMembers(selected, prioritizeUsernames);
    const limit = { label: 100, status: 100, type: 100, user: 10 }[kind] || 5;
    return parseGitLabAutocompleteItems(kind, selected.slice(0, limit));
  };
}
