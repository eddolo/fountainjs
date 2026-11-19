import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, realpath, lstat, unlink } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { babelParse, parse as parseSFC } from 'vue/compiler-sfc';
import { prepareGitLabDiagramSandbox } from '../integrations/gitlab/services/diagram_sandbox_patch.mjs';
import { prepareGitLabMermaidReader } from '../integrations/gitlab/services/diagram_reader_patch.mjs';
import { prepareGitLabTaskConversion } from '../integrations/gitlab/services/task_conversion_patch.mjs';
import { prepareGitLabSaveAuthority, prepareGitLabSaveBaseline } from '../integrations/gitlab/services/save_authority_patch.mjs';
import { prepareGitLabModeRetention } from '../integrations/gitlab/services/mode_retention_patch.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const restore = process.argv[3] === '--restore';
if (
  (process.argv.length !== 3 && !(process.argv.length === 4 && restore)) ||
  !isAbsolute(process.argv[2])
)
  throw new Error(
    'Usage: node scripts/install-gitlab-native-browser.mjs /absolute/gitlab-source [--restore]',
  );
const source = await realpath(process.argv[2]);
const pin = JSON.parse(await readFile(resolve(root, 'integrations/gitlab/runtime/upstream.json')));
const git = (...args) => execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim();
if (
  git('rev-parse', 'HEAD') !== pin.commit ||
  (await realpath(git('rev-parse', '--show-toplevel'))) !== source
)
  throw new Error('Use the exact matching GitLab source root.');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const output = resolve(root, 'artifacts/gitlab-native-browser-install');
await mkdir(output, { recursive: true });
const hostPath = 'app/assets/javascripts/content_editor/components/content_editor.vue';
const preparedHash = 'cdd3091a8a8cddccbd9b48c231edb38197f73a26fd8e35d9932b90d3579d6bad';
const rendererPath = 'app/assets/javascripts/vue_shared/components/markdown/markdown_editor.vue';
const rendererHash = '697704a24572acc75d9f4d5b6225f3ad9c32a3b32410fabc09a6743d8aa0fca9';
const babelPath = 'babel.config.js';
const babelHash = 'ff971fbc61f7c207b23f2834d135bc4741e651820ef289f87b6b61ac35350e54';
const sandboxPath = 'app/assets/javascripts/lib/mermaid_sandbox.js';
const sandboxHash = 'c174dee8be4203bea76c88778156ea5c00f976d758915c2627ec65a2f5872ab9';
const diagramReaderPath = 'app/assets/javascripts/behaviors/markdown/render_sandboxed_mermaid.js';
const diagramReaderHash = '3c349fe6816d139177ce6e9bc04eecbdb2a93fe72fbf345986ac483942f05786';
const gfmPath = 'app/assets/javascripts/behaviors/markdown/render_gfm.js';
const gfmHash = '9021fa0b9a83f7c1f41ab165ba1723fe63807cd384a9c8783c2a37f73d17670d';
const readerImagesPath = 'app/assets/javascripts/behaviors/markdown/fountain_reader_images.js';
const lazyLoaderPath = 'app/assets/javascripts/lazy_loader.js';
const lazyLoaderHash = '6af1a0bf97f573fa8fd6513a9b0ce29a66068bac2df8eedc799a4d5cf8bd9cf2';
const codeMenuPath = 'app/assets/javascripts/content_editor/components/bubble_menus/code_block_bubble_menu.vue';
const codeMenuHash = '8837b74f5b10af4c73fb207952a1e9fe97e371bc5622b6ae4ecd39ec3f1cf7c6';
const mediaMenuPath = 'app/assets/javascripts/content_editor/components/bubble_menus/media_bubble_menu.vue';
const taskUtilsPath = 'app/assets/javascripts/issues/show/utils.js';
const taskBodyPath = 'app/assets/javascripts/issues/show/fountain_task_body_extractor.js';
const taskUtilsHash = '548b3dbacbbe72bc77c75f3fcce77984364df7d9fc0422b00ca0f80d06f29575';
const noteComponentPath = 'app/assets/javascripts/notes/components/noteable_note.vue';
const noteComponentHash = '1d489cd1644b3544a7544a707ec194c8eb8a6623f651b9ea958c6fa607f978cf';
const reviewHeaderPath = 'app/assets/javascripts/vue_shared/components/markdown/suggestion_diff_header.vue';
const applyControlPath = 'app/assets/javascripts/vue_shared/components/markdown/apply_suggestion.vue';
const branchAccessPath = 'app/assets/javascripts/vue_shared/components/markdown/fountain_review_branch_access.js';
const reviewHeaderHash = '0f176b2ed251a36162e2642b1be7882c8b30f31efc528bb1882fb9691e92ca1a';
const reviewActionsPath = 'app/assets/javascripts/notes/store/legacy_notes/actions.js';
const reviewActionsHash = 'a28c9e56677a80683e9a0e9b67eff533e04f6711b9ab3f3422588f38342262a1';
const reviewHelperPath = 'app/assets/javascripts/notes/store/legacy_notes/fountain_applied_suggestion.js';
const detailPath = 'app/assets/javascripts/work_items/components/work_item_detail.vue';
const detailHash = 'de78e4fba269c61e90d2e077b32e6fffe2d0d03aad499e6432780fc60e9a216d';
const descriptionPath = 'app/assets/javascripts/work_items/components/work_item_description.vue';
const descriptionHash = '196782ab7ab05e76aa261a129f1ad8865e34ec240b1e2288539d6d36b093f114';
const mediaMenuHash = '5efe01e313cb65cb25fdffa9a028246c9a06e4ba6224cd00a47734a4d59a7171';
if ((await lstat(resolve(source, hostPath))).isSymbolicLink())
  throw new Error('Refusing a symlinked ContentEditor.');
const current = await readFile(resolve(source, hostPath), 'utf8');
let previous;
try {
  previous = JSON.parse(await readFile(resolve(output, 'install.json')));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (previous && previous.source !== source)
  throw new Error('The retained install belongs to a different checkout.');
if (previous) {
  const generation = previous.formatVersion;
  if (generation !== undefined && (!Number.isInteger(generation) || generation < 2 || generation > 20)) throw new Error('Unknown retained install format.');
  const allowed = new Set([
    hostPath,
    rendererPath,
    babelPath,
    'app/assets/javascripts/content_editor/components/fountain_editor_surface.vue',
    'app/assets/javascripts/content_editor/components/fountain_formatting_toolbar.vue',
    'app/assets/javascripts/content_editor/services/fountain_runtime.js',
    'app/assets/javascripts/content_editor/services/fountain_runtime.css',
  ]);
  if (generation >= 2) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_link_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_link_menu.stories.js');
  }
  if (generation >= 3) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_code_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_code_menu.stories.js');
  }
  if (generation >= 4) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_alert_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_alert_menu.stories.js');
  }
  if (generation >= 5) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_media_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_media_menu.stories.js');
  }
  if (generation >= 6) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_reference_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_reference_menu.stories.js');
  }
  if (generation >= 7) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_diagram_preview.vue');
    allowed.add(sandboxPath);
  }
  if (generation >= 8) allowed.add(diagramReaderPath);
  if (previous.formatVersion === 9) { allowed.add(gfmPath); allowed.add(readerImagesPath); }
  if (generation >= 10) { allowed.add(lazyLoaderPath); allowed.add(readerImagesPath); }
  if (generation >= 11) {
    allowed.add(codeMenuPath); allowed.add(mediaMenuPath);
    allowed.add('app/assets/javascripts/content_editor/components/fountain_context_surface.vue');
  }
  if (generation >= 12) {
    allowed.add('app/assets/javascripts/content_editor/components/fountain_quick_action_menu.vue');
    allowed.add('app/assets/javascripts/content_editor/components/fountain_quick_action_menu.stories.js');
  }
  if (generation >= 13) allowed.add('app/assets/javascripts/content_editor/services/fountain_autocomplete.js');
  if (generation >= 14) { allowed.add(taskUtilsPath); allowed.add(taskBodyPath); }
  if (generation >= 15) allowed.add(detailPath);
  if (generation >= 16) allowed.add(descriptionPath);
  if (generation >= 17) { allowed.add(reviewActionsPath); allowed.add(reviewHelperPath); }
  if (generation >= 18) allowed.add(noteComponentPath);
  if (generation >= 19) allowed.add(reviewHeaderPath);
  if (generation >= 20) { allowed.add(applyControlPath); allowed.add(branchAccessPath); }
  if (Object.keys(previous.files).length !== allowed.size) throw new Error('Incomplete retained install manifest.');
  if (Object.keys(previous.files).some(path => !allowed.has(path))) throw new Error('Unrecognized path in retained install.');
}
const originalApply = execFileSync('git',['-C',source,'show',pin.commit+':'+applyControlPath],{encoding:'utf8'});
const applyHash = '99dd11bbbe680358d961f9c7cb8181f419bf5f22d585ac0a8ded9c1755710a00';
if (hash(originalApply)!==applyHash) throw new Error('Unexpected pinned GitLab Apply control.');
const originalHeader = execFileSync('git',['-C',source,'show',pin.commit+':'+reviewHeaderPath],{encoding:'utf8'});
if (hash(originalHeader)!==reviewHeaderHash) throw new Error('Unexpected pinned GitLab suggestion header.');
if (restore) {
  if (!previous || previous.restored) throw new Error('No active retained install to restore.');
  for (const [path, digest] of Object.entries(previous.files)) {
    const target = resolve(source, path);
    if (
      (await realpath(target)) !== target ||
      (await lstat(target)).isSymbolicLink() ||
      hash(await readFile(target)) !== digest
    )
      throw new Error(`Refusing to restore over changed file ${path}.`);
  }
  const prepared = await readFile(resolve(output, 'prepared-content-editor.vue'));
  if (hash(prepared) !== preparedHash) throw new Error('Retained prepared component has changed.');
  const preparedRenderer = await readFile(resolve(output, 'prepared-markdown-editor.vue'));
  if (hash(preparedRenderer) !== rendererHash)
    throw new Error('Retained prepared renderer has changed.');
  const preparedBabel = await readFile(resolve(output, 'prepared-babel.config.js'));
  if (hash(preparedBabel) !== babelHash)
    throw new Error('Retained Babel configuration has changed.');
  let preparedSandbox;
  if (previous.files[sandboxPath]) {
    preparedSandbox = await readFile(resolve(output, 'prepared-mermaid-sandbox.js'));
    if (hash(preparedSandbox) !== sandboxHash) throw new Error('Retained Mermaid sandbox has changed.');
  }
  let preparedDiagramReader;
  if (previous.files[diagramReaderPath]) {
    preparedDiagramReader = await readFile(resolve(output, 'prepared-mermaid-reader.js'));
    if (hash(preparedDiagramReader) !== diagramReaderHash) throw new Error('Retained Mermaid reader has changed.');
  }
  let preparedGFM;
  if (previous.files[gfmPath]) {
    preparedGFM = await readFile(resolve(output, 'prepared-render-gfm.js'));
    if (hash(preparedGFM) !== gfmHash) throw new Error('Retained GFM reader has changed.');
  }
  let preparedLazyLoader;
  if (previous.files[lazyLoaderPath]) {
    preparedLazyLoader = await readFile(resolve(output, 'prepared-lazy-loader.js'));
    if (hash(preparedLazyLoader) !== lazyLoaderHash) throw new Error('Retained image loader has changed.');
  }
  const preparedMenus = new Map();
  for (const [path, name, digest] of [[codeMenuPath, 'code-block', codeMenuHash], [mediaMenuPath, 'media', mediaMenuHash]]) {
    if (!previous.files[path]) continue;
    const value = await readFile(resolve(output, `prepared-${name}-bubble-menu.vue`));
    if (hash(value) !== digest) throw new Error('Retained original bubble menu has changed.');
    preparedMenus.set(path, value);
  }
  const originalTaskUtils = await readFile(resolve(root, 'integrations/gitlab/fixtures/task-conversion-upstream.js'));
  if (hash(originalTaskUtils) !== taskUtilsHash) throw new Error('Retained task conversion fixture has changed.');
  let preparedDetail;
  if (previous.files[detailPath]) {
    preparedDetail = await readFile(resolve(output, 'prepared-work-item-detail.vue'));
    if (hash(preparedDetail) !== detailHash) throw new Error('Retained work-item Save source has changed.');
  }
  let preparedDescription;
  if (previous.files[descriptionPath]) {
    preparedDescription = await readFile(resolve(output, 'prepared-work-item-description.vue'));
    if (hash(preparedDescription) !== descriptionHash) throw new Error('Retained description baseline source has changed.');
  }
  if (previous.files[noteComponentPath]) {
    const originalNote = await readFile(resolve(output, 'prepared-noteable-note.vue'));
    if (hash(originalNote) !== noteComponentHash) throw new Error('Retained note component differs from the pinned source.');
    await writeFile(resolve(source, noteComponentPath), originalNote);
  }
  if (previous.files[applyControlPath]) await writeFile(resolve(source,applyControlPath),originalApply);
  if (previous.files[reviewHeaderPath]) await writeFile(resolve(source,reviewHeaderPath),originalHeader);
  if (previous.files[reviewActionsPath]) {
    const originalActions = await readFile(resolve(output,'prepared-review-actions.js'));
    if (hash(originalActions)!==reviewActionsHash) throw new Error('Retained review actions differ from the pinned source.');
    await writeFile(resolve(source,reviewActionsPath),originalActions);
  }
  if (previous.files[taskUtilsPath]) await writeFile(resolve(source, taskUtilsPath), originalTaskUtils);
  if (preparedDetail) await writeFile(resolve(source, detailPath), preparedDetail);
  if (preparedDescription) await writeFile(resolve(source, descriptionPath), preparedDescription);
  await writeFile(resolve(source, hostPath), prepared);
  await writeFile(resolve(source, rendererPath), preparedRenderer);
  await writeFile(resolve(source, babelPath), preparedBabel);
  if (preparedSandbox) await writeFile(resolve(source, sandboxPath), preparedSandbox);
  if (preparedDiagramReader) await writeFile(resolve(source, diagramReaderPath), preparedDiagramReader);
  if (preparedGFM) await writeFile(resolve(source, gfmPath), preparedGFM);
  if (preparedLazyLoader) await writeFile(resolve(source, lazyLoaderPath), preparedLazyLoader);
  for (const [path, value] of preparedMenus) await writeFile(resolve(source, path), value);
  for (const path of Object.keys(previous.files))
    if (![hostPath, rendererPath, babelPath, sandboxPath, diagramReaderPath, gfmPath, lazyLoaderPath, codeMenuPath, mediaMenuPath, taskUtilsPath, detailPath, descriptionPath, reviewActionsPath, reviewHeaderPath, applyControlPath, noteComponentPath].includes(path)) await unlink(resolve(source, path));
  await writeFile(
    resolve(output, 'install.json'),
    JSON.stringify({ ...previous, restored: true }, null, 2) + '\n',
  );
  console.log(
    'Restored the exact prepared GitLab component and removed only verified installer-owned files. Rebuild its frontend before deployment.',
  );
  process.exit(0);
}
let original = current;
if (hash(current) !== preparedHash) {
  if (!previous || previous.files[hostPath] !== hash(current))
    throw new Error('ContentEditor has unrecognized edits; refusing to overwrite it.');
  original = await readFile(resolve(output, 'prepared-content-editor.vue'), 'utf8');
  if (hash(original) !== preparedHash)
    throw new Error('The retained prepared component does not match its expected digest.');
}
const currentRenderer = await readFile(resolve(source, rendererPath), 'utf8');
let originalRenderer = currentRenderer;
if (hash(currentRenderer) !== rendererHash) {
  if (!previous || previous.files[rendererPath] !== hash(currentRenderer))
    throw new Error('MarkdownEditor has unrecognized edits.');
  originalRenderer = await readFile(resolve(output, 'prepared-markdown-editor.vue'), 'utf8');
  if (hash(originalRenderer) !== rendererHash)
    throw new Error('The retained renderer does not match its expected digest.');
}
const script = parseSFC(original).descriptor.script.content;
const currentBabel = await readFile(resolve(source, babelPath), 'utf8');
let originalBabel = currentBabel;
if (hash(currentBabel) !== babelHash) {
  if (!previous || previous.files[babelPath] !== hash(currentBabel))
    throw new Error('Babel configuration has unrecognized edits.');
  originalBabel = await readFile(resolve(output, 'prepared-babel.config.js'), 'utf8');
  if (hash(originalBabel) !== babelHash)
    throw new Error('Retained Babel configuration does not match.');
}
const ast = babelParse(script, { sourceType: 'module' });
const definition = ast.program.body.find(
  (node) => node.type === 'ExportDefaultDeclaration',
).declaration;
const props = definition.properties.find((node) => node.key.name === 'props').value;
const propsSource = script.slice(props.start, props.end);
const runtime = resolve(root, 'artifacts/gitlab-native-runtime');
const manifest = JSON.parse(await readFile(resolve(runtime, 'build.json')));
const bundle = await readFile(resolve(runtime, 'fountain-runtime.mjs'));
if (hash(bundle) !== manifest.sha256)
  throw new Error('Rebuild the native runtime; its digest differs.');
for (const [path, digest] of Object.entries(manifest.inputs)) {
  if (hash(await readFile(resolve(root, path))) !== digest)
    throw new Error(`Rebuild the native runtime after changing ${path}.`);
}
if ((await realpath(resolve(source, taskUtilsPath))) !== resolve(source, taskUtilsPath)) throw new Error('Refusing a symlinked task conversion input.');
const originalTaskUtils = await readFile(resolve(root, 'integrations/gitlab/fixtures/task-conversion-upstream.js'), 'utf8');
if (hash(originalTaskUtils) !== taskUtilsHash) throw new Error('Task conversion fixture differs from the pin.');
const currentTaskUtils = await readFile(resolve(source, taskUtilsPath));
if (hash(currentTaskUtils) !== taskUtilsHash && (!previous || previous.files[taskUtilsPath] !== hash(currentTaskUtils)))
  throw new Error('Task conversion has unrecognized edits; refusing to overwrite it.');
if ((await realpath(resolve(source, detailPath))) !== resolve(source, detailPath)) throw new Error('Refusing a symlinked work-item Save input.');
const originalDetail = await readFile(resolve(root, 'integrations/gitlab/fixtures/work-item-detail-upstream.vue'), 'utf8');
if (hash(originalDetail) !== detailHash) throw new Error('Work-item Save fixture differs from the pin.');
const currentDetail = await readFile(resolve(source, detailPath));
if (hash(currentDetail) !== detailHash && (!previous || previous.files[detailPath] !== hash(currentDetail)))
  throw new Error('Work-item Save input has unrecognized edits; refusing to overwrite it.');
if ((await realpath(resolve(source, descriptionPath))) !== resolve(source, descriptionPath)) throw new Error('Refusing a symlinked description baseline input.');
const originalDescription = await readFile(resolve(root, 'integrations/gitlab/fixtures/work-item-description-prepared.vue'), 'utf8');
if (hash(originalDescription) !== descriptionHash) throw new Error('Prepared description fixture differs from the verified host.');
const currentDescription = await readFile(resolve(source, descriptionPath));
if (hash(currentDescription) !== descriptionHash && (!previous || previous.files[descriptionPath] !== hash(currentDescription)))
  throw new Error('Description baseline input has unrecognized edits; refusing to overwrite it.');
const files = new Map();
const originalNote = execFileSync('git', ['-C', source, 'show', pin.commit + ':' + noteComponentPath], {encoding: 'utf8'});
const noteTarget = resolve(source, noteComponentPath);
if (await realpath(noteTarget) !== noteTarget || hash(originalNote) !== noteComponentHash)
  throw new Error('Unrecognized note component.');
const installedNote = hash(await readFile(noteTarget));
if (installedNote !== noteComponentHash && installedNote !== previous?.files[noteComponentPath])
  throw new Error('The note component has unrecognized local edits.');
const alertCall = "createAlert({\n        message: updateNoteErrorMessage(e),\n        parent: this.$el,\n      });";
if (originalNote.split(alertCall).length !== 2) throw new Error('Cannot locate the note update alert.');
files.set(noteComponentPath, originalNote.replace(alertCall, `const alert = ${alertCall}
      // A long draft can leave the validation message above the scrollport.
      this.$nextTick(() => {
        const element = alert?.$el;
        if (!element?.isConnected || !this.isEditing) return;
        const box = element.getBoundingClientRect();
        if (!element.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)))
          element.scrollIntoView({block: 'center', behavior: 'instant'});
      });`));
const headerTarget = resolve(source,reviewHeaderPath);
const currentHeaderHash = hash(await readFile(headerTarget));
if (await realpath(headerTarget)!==headerTarget || (currentHeaderHash!==reviewHeaderHash && currentHeaderHash!==previous?.files[reviewHeaderPath]))
  throw new Error('Refusing to replace an unrecognized GitLab suggestion header.');
const headerEnd = '    </div>\n  </div>\n</template>';
if (originalHeader.split(headerEnd).length!==2) throw new Error('Cannot locate the pinned review controls.');
const applyTarget = resolve(source,applyControlPath);
const currentApply = hash(await readFile(applyTarget));
if (await realpath(applyTarget)!==applyTarget || (currentApply!==applyHash && currentApply!==previous?.files[applyControlPath]))
  throw new Error('Refusing to replace an unrecognized Apply control.');
files.set(branchAccessPath,await readFile(resolve(root,'integrations/gitlab/services/review_branch_access.js'),'utf8'));
files.set(applyControlPath, originalApply
  .replace('  props: {', '  props: {\n    branchAccess: {type:Object,default:null},')
  .replace('  methods: {', '  beforeDestroy() { this.stopCheckingAccess(); },\n  methods: {\n    stopCheckingAccess() { this.stopAccessWatch?.(); this.stopAccessWatch = null; },')
  .replace("      this.$emit('apply', this.message);","      if (!this.disabled) this.$emit('apply', this.message);")
  .replace('      this.$refs.commitMessage.$el.focus();', '      this.$refs.commitMessage.$el.focus();\n      this.stopCheckingAccess();\n      this.stopAccessWatch = this.branchAccess?.watch(() => this.$el.isConnected);')
  .replace('@shown="focusCommitMessageInput"','@shown="focusCommitMessageInput"\n    @hidden="stopCheckingAccess"')
  .replace('data-testid="commit-with-custom-message-button"','data-testid="commit-with-custom-message-button"\n        :disabled="disabled"'));
const accessHeader = originalHeader
  .replace('<script>',"<script>\nimport Vue from 'vue';\nimport Api from '~/api';\nimport { readReviewAccess, reviewBranchAccess } from './fountain_review_branch_access';")
  .replace('      isApplyingSingle: false,',`      isApplyingSingle: false,
      branchAccess: reviewBranchAccess(window.gl?.mrWidgetData, Vue.observable,
        path => readReviewAccess(Api.buildUrl(path))),`)
  .replace('return this.isApplying || !this.canApply;', 'return this.isApplying || !this.canApply || this.branchAccess?.state.restricted;')
  .replace('if (this.batchSuggestionsCount > 1) {','if (this.isDisableButton) return;\n      if (this.batchSuggestionsCount > 1) {')
  .replace(':disabled="isDisableButton"\n        :default-commit-message', ':disabled="isDisableButton"\n        :branch-access="branchAccess"\n        :default-commit-message');
files.set(reviewHeaderPath, accessHeader.replace(headerEnd, `      <p
        v-if="showApplySuggestion && branchAccess && branchAccess.state.restricted"
        role="status"
        class="gl-mb-0 gl-basis-full gl-text-subtle"
      >
        {{ __('Write access to the source branch is unavailable.') }}
        <gl-button size="small" :loading="branchAccess.state.checking" @click="branchAccess.recheck()">
          {{ __('Check access again') }}
        </gl-button>
      </p>
      <p
        v-else-if="isBatched && !canApply && inapplicableReason"
        role="status"
        class="gl-mb-0 gl-basis-full gl-text-subtle"
      >
        {{ inapplicableReason }}
        {{ __('Remove this suggestion from the batch to continue the review.') }}
      </p>
` + headerEnd));
const originalReviewActions = execFileSync('git',['-C',source,'show',pin.commit+':'+reviewActionsPath],{encoding:'utf8'});
if (hash(originalReviewActions)!==reviewActionsHash || await realpath(resolve(source,reviewActionsPath))!==resolve(source,reviewActionsPath))
  throw new Error('Unrecognized review action source.');
const currentReviewHash = hash(await readFile(resolve(source,reviewActionsPath)));
if (currentReviewHash!==reviewActionsHash && currentReviewHash!==previous?.files[reviewActionsPath])
  throw new Error('The installed review actions have unrecognized edits.');
const reviewStart = originalReviewActions.indexOf('export function submitSuggestion(');
const reviewEnd = originalReviewActions.indexOf('export function submitSuggestionBatch(',reviewStart);
const reviewAction = originalReviewActions.slice(reviewStart,reviewEnd)
  .replace('discussionId, suggestionId, flashContainer','discussionId, noteId, suggestionId, flashContainer')
  .replace('.catch((err) => {',`.catch(async (err) => {
      try {
        const recovered = await reconcileAppliedSuggestion({
          status: err.response?.status,
          message: err.response?.data?.message,
          projectId: this.getNoteableData.project_id,
          iid: Number(this.getNoteableData.iid),
          noteId, discussionId, suggestionId,
          readNote: (path) => axios.get(Api.buildUrl(path)).then(({ data }) => data),
          currentNote: () => this.notesById[noteId],
          updateNote: (note) => this[types.UPDATE_NOTE](note),
        });
        if (recovered) return;
      } catch {
        // Keep GitLab's original feedback when the saved state cannot be verified.
      }`)
  .replace('err.response.data?.message','err.response?.data?.message');
files.set(reviewActionsPath,"import { reconcileAppliedSuggestion } from './fountain_applied_suggestion';\n"+
  originalReviewActions.slice(0,reviewStart)+reviewAction+originalReviewActions.slice(reviewEnd));
files.set(reviewHelperPath,await readFile(resolve(root,'integrations/gitlab/services/reconcile_applied_suggestion.js'),'utf8'));
files.set(descriptionPath, prepareGitLabSaveBaseline(originalDescription));
files.set(detailPath, prepareGitLabSaveAuthority(originalDetail));
files.set(taskUtilsPath, prepareGitLabTaskConversion(originalTaskUtils));
files.set(taskBodyPath, await readFile(resolve(root, 'integrations/gitlab/services/task_body_extractor.js'), 'utf8'));
const originalMenus = new Map();
for (const [path, name, digest] of [[codeMenuPath, 'code-block', codeMenuHash], [mediaMenuPath, 'media', mediaMenuHash]]) {
  if ((await realpath(resolve(source, path))) !== resolve(source, path)) throw new Error('Refusing a symlinked bubble menu.');
  const currentMenu = await readFile(resolve(source, path));
  const originalMenu = await readFile(resolve(root, `integrations/gitlab/fixtures/${name}-bubble-menu-upstream.vue`));
  if (hash(originalMenu) !== digest) throw new Error('The original bubble-menu fixture differs from the source pin.');
  if (hash(currentMenu) !== digest && (!previous || previous.files[path] !== hash(currentMenu)))
    throw new Error('Bubble menu has unrecognized edits; refusing to overwrite it.');
  originalMenus.set(path, { name, value: originalMenu });
  files.set(path, await readFile(resolve(root, `integrations/gitlab/components/bubble_menus/${path.split('/').at(-1)}`), 'utf8'));
}
const currentSandbox = await readFile(resolve(source, sandboxPath), 'utf8');
let originalSandbox = currentSandbox;
if (hash(currentSandbox) !== sandboxHash) {
  if (!previous || previous.files[sandboxPath] !== hash(currentSandbox)) throw new Error('Mermaid sandbox has unrecognized edits.');
  originalSandbox = await readFile(resolve(output, 'prepared-mermaid-sandbox.js'), 'utf8');
  if (hash(originalSandbox) !== sandboxHash) throw new Error('Retained Mermaid sandbox does not match the pin.');
}
files.set(sandboxPath, prepareGitLabDiagramSandbox(originalSandbox));
const currentDiagramReader = await readFile(resolve(source, diagramReaderPath), 'utf8');
let originalDiagramReader = currentDiagramReader;
if (hash(currentDiagramReader) !== diagramReaderHash) {
  if (!previous || previous.files[diagramReaderPath] !== hash(currentDiagramReader)) throw new Error('Mermaid reader has unrecognized edits.');
  originalDiagramReader = await readFile(resolve(output, 'prepared-mermaid-reader.js'), 'utf8');
  if (hash(originalDiagramReader) !== diagramReaderHash) throw new Error('Retained Mermaid reader does not match the pin.');
}
files.set(diagramReaderPath, prepareGitLabMermaidReader(originalDiagramReader));
const currentGFM = await readFile(resolve(source, gfmPath), 'utf8');
if ((await realpath(resolve(source, gfmPath))) !== resolve(source, gfmPath)) throw new Error('Refusing a symlinked GFM reader.');
let originalGFM = currentGFM;
if (hash(currentGFM) !== gfmHash) {
  if (!previous || previous.files[gfmPath] !== hash(currentGFM)) throw new Error('GFM reader has unrecognized edits.');
  originalGFM = await readFile(resolve(output, 'prepared-render-gfm.js'), 'utf8');
  if (hash(originalGFM) !== gfmHash) throw new Error('Retained GFM reader does not match the pin.');
}
const currentLazyLoader = await readFile(resolve(source, lazyLoaderPath), 'utf8');
let originalLazyLoader = currentLazyLoader;
if (hash(currentLazyLoader) !== lazyLoaderHash) {
  if (!previous || previous.files[lazyLoaderPath] !== hash(currentLazyLoader)) throw new Error('Image loader has unrecognized edits.');
  originalLazyLoader = await readFile(resolve(output, 'prepared-lazy-loader.js'), 'utf8');
  if (hash(originalLazyLoader) !== lazyLoaderHash) throw new Error('Retained image loader does not match the pin.');
}
const imageImport = "import { appendWidthToAvatarUrl } from '~/vue_shared/components/user_avatar/utils';";
const imageInitialization = "      img.setAttribute('src', imgUrl);";
if ([imageImport, imageInitialization].some(value => originalLazyLoader.split(value).length !== 2)) throw new Error('Inspect the pinned lazy image initialization.');
files.set(lazyLoaderPath, originalLazyLoader.replace(imageImport, imageImport + "\nimport { prepareFountainReaderImages } from '~/behaviors/markdown/fountain_reader_images';")
  .replace(imageInitialization, imageInitialization + "\n      if (img.closest('.md')) prepareFountainReaderImages([img]);"));
files.set(readerImagesPath, await readFile(resolve(root, 'integrations/gitlab/services/reader_images.js'), 'utf8'));
if (originalBabel.split('exclude: /node_modules/,').length !== 2)
  throw new Error('Inspect the pinned third-party Babel boundary.');
// The generated library is third-party code, even though installed under app/.
files.set(
  babelPath,
  originalBabel.replace(
    'exclude: /node_modules/,',
    String.raw`exclude: /node_modules|[/\\]content_editor[/\\]services[/\\]fountain_runtime\.js$/,`,
  ),
);
const rendererSignature = 'renderMarkdown(markdown) {';
const rendererFlag = 'no_header_anchors: !this.supportsTableOfContents,';
const rendererRequest = 'return axios\n        .post(url, { text: markdown })';
if (
  ![rendererSignature, rendererFlag, rendererRequest].every(
    (value) => originalRenderer.split(value).length === 2,
  )
)
  throw new Error('Inspect the pinned renderer adapter sites.');
files.set(
  rendererPath,
  prepareGitLabModeRetention(originalRenderer)
    .replace(
      rendererSignature,
      'renderMarkdown(markdown, { noHeaderAnchors = false, signal } = {}) {',
    )
    .replace(rendererFlag, 'no_header_anchors: noHeaderAnchors || !this.supportsTableOfContents,')
    .replace(
      rendererRequest,
      'const request = signal ? axios.post(url, { text: markdown }, { signal }) : axios.post(url, { text: markdown });\n      return request',
    ),
);
let component = await readFile(
  resolve(root, 'integrations/gitlab/components/fountain_content_editor.vue'),
  'utf8',
);
if (!component.includes('  props: {},'))
  throw new Error('Inspect the native component prop insertion point.');
component = component
  .replace('  props: {},', `  props: ${propsSource},`)
  .replace("from '../runtime/browser'", "from '../services/fountain_runtime'");
files.set(hostPath, component);
for (const name of ['fountain_editor_surface.vue', 'fountain_formatting_toolbar.vue', 'fountain_context_surface.vue', 'fountain_link_menu.vue', 'fountain_link_menu.stories.js', 'fountain_code_menu.vue', 'fountain_code_menu.stories.js', 'fountain_diagram_preview.vue', 'fountain_alert_menu.vue', 'fountain_alert_menu.stories.js', 'fountain_media_menu.vue', 'fountain_media_menu.stories.js', 'fountain_reference_menu.vue', 'fountain_reference_menu.stories.js', 'fountain_quick_action_menu.vue', 'fountain_quick_action_menu.stories.js']) {
  let value = await readFile(resolve(root, `integrations/gitlab/components/${name}`), 'utf8');
  value = value
    .replace("from 'fountainjs-editor'", "from '../services/fountain_runtime'")
    .replace("from '../runtime/browser'", "from '../services/fountain_runtime'");
  files.set(`app/assets/javascripts/content_editor/components/${name}`, value);
}
files.set('app/assets/javascripts/content_editor/services/fountain_runtime.js', bundle);
files.set('app/assets/javascripts/content_editor/services/fountain_autocomplete.js',
  await readFile(resolve(root, 'integrations/gitlab/services/autocomplete_host.js')));
// The native renderer's structural CSS is a local build input, never a CDN.
files.set(
  'app/assets/javascripts/content_editor/services/fountain_runtime.css',
  await readFile(resolve(root, 'dist/styles.css')),
);
files.set(
  hostPath,
  `\n${files.get(hostPath)}`.replace(
    '<script>',
    "<script>\nimport '../services/fountain_runtime.css';",
  ),
);
const requireUpstream = createRequire(resolve(source, 'package.json'));
const prettier = requireUpstream('prettier');
const formatOptions = await prettier.resolveConfig(resolve(source, hostPath));
for (const [path, bytes] of files) {
  if (!path.endsWith('.vue') && !path.endsWith('.stories.js') && ![taskUtilsPath, taskBodyPath, babelPath, diagramReaderPath, lazyLoaderPath, readerImagesPath, 'app/assets/javascripts/content_editor/services/fountain_autocomplete.js'].includes(path)) continue;
  files.set(
    path,
    await prettier.format(bytes.toString(), {
      ...formatOptions,
      filepath: resolve(source, path),
      plugins: (formatOptions.plugins ?? []).map((plugin) => requireUpstream.resolve(plugin)),
      tailwindConfig: resolve(source, formatOptions.tailwindConfig),
    }),
  );
}
// Identify the runtime and the GitLab host edits independently. Hash the prepared
// inputs before stamping them so the identifier never hashes its own bytes.
if (!manifest.packageVersion) throw new Error('Rebuild the runtime to record its package version.');
const runtimePath = 'app/assets/javascripts/content_editor/services/fountain_runtime.js';
const preparedFiles = [...files].map(([path, bytes]) => [path, hash(bytes)]).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const integrationSHA256 = hash(JSON.stringify([pin.commit, manifest.packageVersion, manifest.parentRevision, preparedFiles]));
const marker = 'data-fountain-integration="native"';
const host = files.get(hostPath);
if (host.split(marker).length !== 2) throw new Error('Cannot stamp the native editor mount.');
files.set(hostPath, host.replace(marker, marker + '\n    data-fountain-build="' + integrationSHA256 + '"'));
files.set(runtimePath, Buffer.concat([bundle, Buffer.from('\nglobalThis.__fountainGitLabRuntimeSHA256 = ' + JSON.stringify(manifest.sha256) + ';\n')]));
for (const [path] of files) {
  const target = resolve(source, path);
  const location = relative(source, target);
  if (isAbsolute(location) || location.startsWith('..'))
    throw new Error('Installation escaped the source root.');
  const parent = await realpath(resolve(target, '..'));
  if (parent !== resolve(target, '..'))
    throw new Error('Refusing a symlinked installation parent.');
  if ([hostPath, rendererPath, babelPath, sandboxPath, diagramReaderPath, lazyLoaderPath, codeMenuPath, mediaMenuPath, taskUtilsPath, detailPath, descriptionPath, reviewActionsPath, reviewHeaderPath, applyControlPath, noteComponentPath].includes(path)) {
    if ((await realpath(target)) !== target) throw new Error('Refusing a symlinked host input.');
    continue;
  }
  try {
    if ((await lstat(target)).isSymbolicLink()) throw new Error(`Refusing symlink ${path}.`);
    const existing = await readFile(target);
    if (!previous || previous.files[path] !== hash(existing))
      throw new Error(`Unrecognized file at ${path}; refusing to overwrite it.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await writeFile(resolve(output, 'prepared-content-editor.vue'), original);
await writeFile(resolve(output, 'prepared-markdown-editor.vue'), originalRenderer);
await writeFile(resolve(output, 'prepared-babel.config.js'), originalBabel);
await writeFile(resolve(output, 'prepared-mermaid-sandbox.js'), originalSandbox);
await writeFile(resolve(output, 'prepared-mermaid-reader.js'), originalDiagramReader);
await writeFile(resolve(output, 'prepared-render-gfm.js'), originalGFM);
await writeFile(resolve(output, 'prepared-lazy-loader.js'), originalLazyLoader);
await writeFile(resolve(output, 'prepared-noteable-note.vue'), originalNote);
await writeFile(resolve(output,'prepared-review-actions.js'),originalReviewActions);
await writeFile(resolve(output, 'prepared-work-item-detail.vue'), originalDetail);
await writeFile(resolve(output, 'prepared-work-item-description.vue'), originalDescription);
for (const { name, value } of originalMenus.values()) await writeFile(resolve(output, `prepared-${name}-bubble-menu.vue`), value);
// Migrate the superseded GFM hook back to its pinned source; the source switch
// happens later in LazyLoader and is the correct place to reserve image geometry.
if (previous?.files[gfmPath]) await writeFile(resolve(source, gfmPath), originalGFM);
for (const [path, bytes] of files) await writeFile(resolve(source, path), bytes);
await writeFile(
  resolve(output, 'install.json'),
  JSON.stringify(
    {
      formatVersion: 20,
      source,
      revision: pin.commit,
      scope:
        'Native browser integration in progress; full toolbar/providers/dialect acceptance remains open',
      nativeRuntime: manifest,
      integrationSHA256,
      preparedComponentSHA256: preparedHash,
      files: Object.fromEntries([...files].map(([path, bytes]) => [path, hash(bytes)])),
    },
    null,
    2,
  ) + '\n',
);
console.log(
  `Installed native browser integration into matching GitLab source (${files.size} files). Build and real-service browser verification are required.`,
);
