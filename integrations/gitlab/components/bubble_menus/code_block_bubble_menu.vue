<script>
import { normalizeRender } from '~/lib/utils/vue3compat/normalize_render';
import FountainCodeMenu from '../fountain_code_menu.vue';

/** Preserve GitLab's component entry point with the real native controls. */
export default normalizeRender({ name: 'CodeBlockBubbleMenu', extends: FountainCodeMenu,
  render(...args) { return FountainCodeMenu.render.call(this, ...args); },
  staticRenderFns: FountainCodeMenu.staticRenderFns });
</script>
