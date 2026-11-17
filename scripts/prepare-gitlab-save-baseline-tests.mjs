import {readFile,writeFile,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {isAbsolute,resolve} from 'node:path';
if(process.platform!=='linux'||!isAbsolute(process.argv[2]??''))throw new Error('Pass the pinned Linux GitLab checkout.');
const root=fileURLToPath(new URL('../',import.meta.url)),source=await realpath(process.argv[2]);
const pin=JSON.parse(await readFile(resolve(root,'integrations/gitlab/runtime/upstream.json')));
if(execFileSync('git',['-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim()!==pin.commit)throw new Error('Unexpected GitLab revision.');
const path='spec/frontend/work_items/components/work_item_description_spec.js',target=resolve(source,path);
if(await realpath(target)!==target)throw new Error('Refusing a symlinked test input.');
const baseline=await readFile(resolve(root,'integrations/gitlab/fixtures/work-item-description-spec-prepared.js'),'utf8');
if(createHash('sha256').update(baseline).digest('hex')!=='06977f290ef7a05c07f7f48f81a8054ad9894e1e12fa9cff70d71e14ad82ccb1')throw new Error('Prepared test fixture changed.');
const anchor="    describe('when description has conflicts', () => {";
if(baseline.split(anchor).length!==2)throw new Error('Inspect the prepared conflict tests.');
const regression=`    describe('a submitted draft awaiting acknowledgement', () => {
      beforeEach(async () => {
        const workItemResponseHandler = jest.fn()
          .mockResolvedValueOnce(workItemByIidResponseFactory())
          .mockResolvedValueOnce(workItemByIidResponseFactory({ canUpdate: false }));
        await createComponent({ isEditing: true, workItemResponseHandler });
        editDescription('Pending local draft.');
        findForm().vm.$emit('submit', new Event('submit'));
        await wrapper.vm.$apollo.queries.workItem.refetch();
        await waitForPromises();
      });

      it('keeps the draft without calling unchanged server content a remote edit', () => {
        expect(wrapper.emitted('update-work-item')).toHaveLength(1);
        expect(findMarkdownEditor().props('value')).toBe('Pending local draft.');
        expect(findConflictedDescription().exists()).toBe(false);
      });
    });

    describe('an explicitly stored existing-item draft', () => {
      beforeEach(async () => {
        await createComponent();
        await waitForPromises();
      });

      it.each(['', ' ', '\\t\\n', 'Retained draft.'])('restores source %j exactly on entering edit mode', async (draft) => {
        getDraft.mockReturnValue(draft);
        await wrapper.setProps({ editMode: true });
        await waitForPromises();

        expect(findMarkdownEditor().props('value')).toBe(draft);
      });
    });


`;
const require=createRequire(resolve(source,'package.json')),prettier=require('prettier'),options=await prettier.resolveConfig(target);
const value=await prettier.format(baseline.replace(anchor,regression+anchor),{...options,filepath:target,plugins:(options.plugins??[]).map(name=>require.resolve(name)),tailwindConfig:resolve(source,options.tailwindConfig)});
const current=await readFile(target,'utf8');if(current!==baseline&&current!==value&&createHash('sha256').update(current).digest('hex')!=='1f80ca7599087b29266a4d52f097a799f4047d401be3d22e7f18caeed86fde12')throw new Error('Refusing unrecognized conflict test edits.');
await writeFile(target,value);
console.log('Prepared submitted-draft baseline and exact stored-draft restoration regressions.');
