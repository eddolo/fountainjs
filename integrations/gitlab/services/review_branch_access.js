// One permission observation serves every suggestion on the same merge request.
const reviews = new WeakMap();

export function reviewBranchAccess(mr, observable, read) {
  if (
    !mr ||
    !Number.isSafeInteger(mr.id) ||
    !Number.isSafeInteger(mr.iid) ||
    !mr.target_project_full_path
  )
    return null;
  if (reviews.has(mr)) return reviews.get(mr);
  const state = observable({ restricted: false, checking: false });
  let branch;
  let pending;
  let requested;

  async function check() {
    try {
      if (!branch) {
        const saved = await read(
          '/api/:version/projects/' +
            encodeURIComponent(mr.target_project_full_path) +
            '/merge_requests/' +
            mr.iid,
        );
        if (
          saved.id !== mr.id ||
          saved.iid !== mr.iid ||
          !Number.isSafeInteger(saved.source_project_id) ||
          !saved.source_branch
        )
          return false;
        branch = { project: saved.source_project_id, name: saved.source_branch };
      }
      // GitLab's BranchEntity#can_push and SuggestionPolicy both ask UserAccess about this source branch.
      const record = await read(
        '/api/:version/projects/' +
          branch.project +
          '/repository/branches/' +
          encodeURIComponent(branch.name),
      );
      if (record.name !== branch.name || typeof record.can_push !== 'boolean') return false;
      state.restricted = !record.can_push;
      return true;
    } catch (error) {
      if ([401, 403, 404].includes(error.response?.status)) state.restricted = true;
      return false;
    }
  }

  function refresh() {
    if (!pending) {
      pending = check().finally(() => {
        pending = undefined;
      });
    }
    return pending;
  }

  function recheck() {
    if (!requested) {
      // A response to an older background read can still describe the former role.
      // A reviewer asking to check again gets a read started after that gesture.
      state.checking = true;
      requested = (pending ? pending.then(refresh) : refresh()).finally(() => {
        requested = undefined;
        state.checking = false;
      });
    }
    return requested;
  }

  // Only an open, visible confirmation reads the server. GitLab can detach a
  // Markdown widget without destroying its Vue instance when a discussion updates.
  function watch(connected) {
    let stopped = false;
    let timer;
    async function tick() {
      if (stopped || !connected()) return;
      const ready = document.hidden || (await refresh());
      if (!stopped && connected()) timer = setTimeout(tick, ready ? 2000 : 10000);
    }
    tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }

  const access = Object.freeze({ state, refresh, recheck, watch });
  reviews.set(mr, access);
  return access;
}
