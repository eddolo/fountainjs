import { computed, defineComponent, h, inject, ref, resolveComponent } from 'vue';
import { isSafeURL } from '../../src/index';
import { saveImage } from './images';

export const ImageDrawer = defineComponent({
  name:'FountainDirectusImageDrawer',
  props:{ editor:Object, target:{type:Object,required:true}, folder:String },
  emits:['close'],
  setup(props,{emit}) {
    const drawer = resolveComponent('v-drawer'), button = resolveComponent('v-button'), upload = resolveComponent('v-upload');
    const api = inject('api');
    const settings = inject('stores').useSettingsStore();
    const policy = computed(() => settings.settings?.storage_asset_transform ?? 'none');
    const presets = computed(() => settings.settings?.storage_asset_presets ?? []);
    const root = new URL(api.defaults.baseURL,window.location.origin);
    const absolute = src => new URL(src,root);
    const message = ref('');
    const model = ref(null);
    function properties(src,alt,caption,lazy) {
      const url = absolute(src);
      return {src,alt,caption,lazy,width:url.searchParams.get('width') ?? '',height:url.searchParams.get('height') ?? '',
        preset:url.searchParams.get('key') ?? '', transformChanged:false};
    }
    if (props.target.image) {
      const attrs = props.target.image.attrs;
      model.value = properties(attrs.src,attrs.alt,props.target.caption,attrs.loading === 'lazy');
    }
    function select(file) {
      if (!file?.type?.startsWith('image/')) { message.value = 'Choose an image file.'; return; }
      const extension = /\.([a-z0-9]+)$/i.exec(file.filename_disk)?.[1];
      const name = encodeURIComponent(file.id) + (extension ? '.' + extension : '');
      const src = absolute(root.pathname.replace(/\/?$/,'/') + 'assets/' + name).href;
      model.value = properties(src,file.title ?? '', '',false);
      model.value.width = file.width ?? '';
      model.value.height = file.height ?? '';
      model.value.transformChanged = true;
      message.value = '';
    }
    const close = () => emit('close');
    function apply() {
      const form = model.value;
      if (!form || !isSafeURL(form.src)) { message.value = 'Choose a valid image URL.'; return; }
      let src = form.src;
      if (form.transformChanged) {
        const url = absolute(src);
        for (const key of ['key','width','height']) url.searchParams.delete(key);
        if (policy.value !== 'none' && form.preset) url.searchParams.set('key',form.preset);
        else if (policy.value === 'all') {
          for (const key of ['width','height']) {
            if (form[key] === '') continue;
            if (!/^[1-9]\d*$/.test(String(form[key]))) { message.value = 'Image dimensions must be positive whole numbers.'; return; }
            url.searchParams.set(key,form[key]);
          }
        }
        src = url.href;
      }
      if (saveImage(props.editor,props.target,{src,alt:form.alt,loading:form.lazy ? 'lazy' : null},form.caption)) close();
      else message.value = 'The image could not be applied at this position. Close the drawer and select the image or a paragraph.';
    }
    const input = (label,key,dimension=false) => h('label',[label,h('input',{
      type:dimension ? 'number' : 'text',min:dimension ? 1 : undefined,value:model.value[key],
      disabled:dimension && !!model.value.preset,
      onInput:event => { model.value[key] = event.target.value; if (dimension) model.value.transformChanged = true; },
    })]);
    return () => h(drawer,{title:props.target.image ? 'Edit image' : 'Add image',icon:'image',modelValue:true,
      onCancel:close,onApply:apply,'onUpdate:modelValue':open => { if (!open) close(); },
    },{
      default:() => h('div',{class:'fountain-directus-image-form'},[
        ...(model.value ? [
          isSafeURL(model.value.src) && h('img',{class:'fountain-directus-image-preview',src:model.value.src,alt:model.value.alt}),
          input('Image URL','src'),input('Alternative Text','alt'),input('Caption','caption'),
          policy.value === 'all' && input('Width','width',true),policy.value === 'all' && input('Height','height',true),
          policy.value !== 'none' && presets.value.length > 0 && h('label',['Transformation preset',h('select',{
            value:model.value.preset,onChange:event => { model.value.preset = event.target.value; model.value.transformChanged = true; },
          },[h('option',{value:''},'None'),...presets.value.map(preset => h('option',{value:preset.key},preset.key))])]),
          h('label',[h('input',{type:'checkbox',checked:model.value.lazy,onChange:event => { model.value.lazy = event.target.checked; }}),'Enable Lazy Loading']),
        ] : [h(upload,{multiple:false,fromLibrary:true,fromUrl:false,folder:props.folder,accept:'image/*',onInput:select})]),
        message.value && h('p',{role:'alert'},message.value),
      ]),
      'actions:primary':() => h(button,{small:true,disabled:!model.value,onClick:apply},() => 'Apply image'),
    });
  },
});
