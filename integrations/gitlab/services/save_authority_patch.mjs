/** Keep the pinned host draft until the description mutation retains update authority. */
export function prepareGitLabSaveAuthority(source) {
  const start = '    async updateWorkItem({ clearDraft } = {}) {\n      this.updateInProgress = true;';
  const clear = '        if (clearDraft) {\n          clearDraft();\n        }';
  const failed = '      } catch (error) {\n        Sentry.captureException(error);\n      } finally {\n        this.updateInProgress = false;\n      }\n    },\n    cancelEditing() {';
  if (source.split(start).length !== 2 || source.split(clear).length !== 2 || source.split(failed).length !== 2 || source.includes('const hasDescriptionUpdate ='))
    throw new Error('Inspect the pinned description Save acknowledgement boundary.');
  return source.replace(start, `${start}\n      this.updateError = null;\n      const hasDescriptionUpdate = typeof this.draftData.description === 'string';\n      let descriptionAcknowledged = false;`)
    .replace(clear, `        if (hasDescriptionUpdate && !workItemUpdate.workItem) {
          this.updateError = s__('WorkItem|The description could not be saved. Your draft has been kept. Check your access or connection and try again.');
          return;
        }
        if (hasDescriptionUpdate && workItemUpdate.workItem?.userPermissions?.updateWorkItem === false) {
          this.updateError = s__('WorkItem|You no longer have permission to edit this description. Your draft has been kept.');
          return;
        }

        descriptionAcknowledged = hasDescriptionUpdate;
${clear}`)
    .replace(failed, `      } catch (error) {
        if (hasDescriptionUpdate && !descriptionAcknowledged && !this.updateError) {
          this.updateError = s__('WorkItem|The description could not be saved. Your draft has been kept. Check your access or connection and try again.');
        }
        Sentry.captureException(error);
      } finally {
        this.updateInProgress = false;
      }
    },
    cancelEditing() {`);
}

/** A submission can fail; the next editing session establishes its saved baseline. */
export function prepareGitLabSaveBaseline(source) {
  const before = "      this.$emit('update-work-item', { clearDraft: () => this.clearDraftWorkItem() });\n\n      this.conflictedDescription = '';\n      this.initialDescriptionText = this.descriptionText;";
  const draft = `        const draftDescription = getDraft(this.workItemId) || '';
        if (draftDescription.trim() !== '') {
          this.descriptionText = draftDescription;
        } else {
          this.descriptionText = this.workItemDescription?.description;
        }`;
  if (source.split(before).length !== 2 || source.split(draft).length !== 2)
    throw new Error('Inspect the prepared description submission baseline.');
  return source.replace(before, "      this.$emit('update-work-item', { clearDraft: () => this.clearDraftWorkItem() });\n\n      this.conflictedDescription = '';")
    .replace(draft, `        const draftDescription = getDraft(this.workItemId);
        this.descriptionText = typeof draftDescription === 'string'
          ? draftDescription
          : this.workItemDescription?.description;`);
}
