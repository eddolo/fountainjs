<script>
import { normalizeRender } from '~/lib/utils/vue3compat/normalize_render';
import FountainMediaMenu from '../fountain_media_menu.vue';

/** Preserve GitLab's component entry point with the real native controls. */
export default normalizeRender({ name: 'MediaBubbleMenu', extends: FountainMediaMenu,
  render(...args) { return FountainMediaMenu.render.call(this, ...args); },
  staticRenderFns: FountainMediaMenu.staticRenderFns });
</script>
