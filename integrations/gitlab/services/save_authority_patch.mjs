/** Keep the pinned host draft until the description mutation retains update authority. */
export function prepareGitLabSaveAuthority(source) {
  const start = '    async updateWorkItem({ clearDraft } = {}) {\n      this.updateInProgress = true;';
  const clear = '        if (clearDraft) {\n          clearDraft();\n        }';
  if (source.split(start).length !== 2 || source.split(clear).length !== 2 || source.includes('const hasDescriptionUpdate ='))
    throw new Error('Inspect the pinned description Save acknowledgement boundary.');
  return source.replace(start, `${start}\n      this.updateError = null;\n      const hasDescriptionUpdate = typeof this.draftData.description === 'string';`)
    .replace(clear, `        if (hasDescriptionUpdate && workItemUpdate.workItem?.userPermissions?.updateWorkItem === false) {
          this.updateError = s__('WorkItem|You no longer have permission to edit this description. Your draft has been kept.');
          return;
        }

${clear}`);
}

/** A submission can fail; the next editing session establishes its saved baseline. */
export function prepareGitLabSaveBaseline(source) {
  const before = "      this.$emit('update-work-item', { clearDraft: () => this.clearDraftWorkItem() });\n\n      this.conflictedDescription = '';\n      this.initialDescriptionText = this.descriptionText;";
  if (source.split(before).length !== 2)
    throw new Error('Inspect the prepared description submission baseline.');
  return source.replace(before, "      this.$emit('update-work-item', { clearDraft: () => this.clearDraftWorkItem() });\n\n      this.conflictedDescription = '';");
}
