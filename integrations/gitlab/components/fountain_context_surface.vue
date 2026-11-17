<script>
import { GlButton } from '@gitlab/ui';
import { uniqueId } from 'lodash-es';
import { markRaw } from 'vue';
import tippy from 'tippy.js/headless';
import { FountainMenuController, getEditorMenuAnchorRect } from '../runtime/browser';

export default {
  name: 'FountainContextSurface',
  components: { GlButton },
  props: {
    editor: { type: Object, required: true },
    active: { type: Boolean, required: true },
    anchorPath: { type: Array, required: false, default: null },
    getEditorRoot: { type: Function, required: false, default: null },
    label: { type: String, required: true },
    triggerText: { type: String, required: false, default: null },
    suspended: { type: Boolean, required: false, default: false },
    hideTrigger: { type: Boolean, required: false, default: false },
  },
  emits: ['reveal', 'dismiss', 'visibility-change'],
  data() {
    return { floating: false, expanded: false, menuId: uniqueId('fountain-context-') };
  },
  computed: {
    anchorIdentity() { return this.anchorPath?.join('.') ?? ''; },
  },
  watch: {
    active() { this.controller.refresh(); this.schedule(); },
    anchorIdentity() { this.controller.refresh(); this.schedule(); },
    suspended() { this.schedule(); },
    getEditorRoot() { this.refreshRoot(); },
    floating() { this.reportVisibility(); },
    expanded() { this.reportVisibility(); },
  },
  created() {
    this.disposed = false; this.inactive = false; this.root = null; this.popup = null; this.frame = null;
    this.pendingFocus = false; this.rootObserver = null; this.sizeObserver = null;
    this.controller = new FountainMenuController(this.editor, 'bubble', {
      showWhenReadOnly: true, shouldShow: () => this.active && Boolean(this.anchorPath?.length),
    });
    this.release = this.controller.subscribe(this.schedule);
  },
  mounted() { this.refreshRoot(); },
  activated() { this.inactive = false; this.refreshRoot(); },
  deactivated() { this.inactive = true; this.unbindRoot(); },
  beforeDestroy() {
    this.disposed = true; this.release(); this.controller.destroy(); this.unbindRoot();
  },
  methods: {
    reportVisibility() { this.$emit('visibility-change', { floating: this.floating, expanded: this.expanded }); },
    refreshRoot() {
      if (this.disposed || this.inactive) return;
      const root = this.getEditorRoot?.() || null;
      if (root !== this.root) {
        this.unbindRoot(); this.root = root ? markRaw(root) : null;
        if (root) {
          const document = root.ownerDocument;
          const window = document.defaultView;
          document.addEventListener('focusin', this.schedule);
          document.addEventListener('focusout', this.schedule);
          document.addEventListener('keydown', this.onDocumentKeydown, true);
          window.addEventListener('resize', this.schedule);
          window.addEventListener('scroll', this.schedule, true);
          window.visualViewport?.addEventListener('resize', this.schedule);
          if (window.MutationObserver) {
            this.rootObserver = new window.MutationObserver(this.schedule);
            this.rootObserver.observe(root, { childList: true, subtree: true });
          }
          if (window.ResizeObserver) {
            this.sizeObserver = new window.ResizeObserver(this.schedule);
            this.sizeObserver.observe(root); this.sizeObserver.observe(this.$refs.content);
          }
        }
      }
      this.controller.refresh(); this.schedule();
    },
    unbindRoot() {
      const document = this.root?.ownerDocument;
      const window = document?.defaultView || this.$refs.content?.ownerDocument.defaultView;
      if (this.frame !== null) window?.cancelAnimationFrame(this.frame);
      this.frame = null;
      document?.removeEventListener('focusin', this.schedule);
      document?.removeEventListener('focusout', this.schedule);
      document?.removeEventListener('keydown', this.onDocumentKeydown, true);
      window?.removeEventListener('resize', this.schedule);
      window?.removeEventListener('scroll', this.schedule, true);
      window?.visualViewport?.removeEventListener('resize', this.schedule);
      this.rootObserver?.disconnect(); this.rootObserver = null;
      this.sizeObserver?.disconnect(); this.sizeObserver = null;
      this.dock(); this.root = null;
    },
    schedule() {
      if (this.disposed || this.inactive || !this.$refs.content || this.frame !== null) return;
      const window = this.$refs.content.ownerDocument.defaultView;
      this.frame = window.requestAnimationFrame(() => { this.frame = null; this.updateSurface(); });
    },
    referenceRect() {
      if (!this.root?.isConnected || !this.anchorPath?.length) return null;
      return getEditorMenuAnchorRect(this.root, { kind: 'floating', anchorPath: this.anchorPath,
        selection: this.editor.state.selection });
    },
    containsFocus() {
      const focused = this.root?.ownerDocument.activeElement;
      return Boolean(focused && (this.root.contains(focused) || this.$refs.content.contains(focused)
        || this.$refs.trigger?.$el.contains(focused)));
    },
    dock() {
      const { content } = this.$refs;
      // Restore Vue's own node before removing the external positioning surface.
      if (content && this.$refs.home && content.parentNode !== this.$refs.home) this.$refs.home.appendChild(content);
      this.popup?.destroy(); this.popup = null; this.floating = false; this.expanded = false;
    },
    createPopup() {
      const document = this.root.ownerDocument;
      const { content } = this.$refs;
      const host = this.root.closest('.modal-content, .work-item-detail-panel, .work-item-detail')
        || this.root.closest('[role="dialog"]') || this.root.closest('main') || document.documentElement;
      const boundary = [host];
      // A scrolled document's own box can extend behind sticky application chrome.
      // Keep the portal inside every actual clipping ancestor as well as its host.
      for (let parent = this.root.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = document.defaultView.getComputedStyle(parent);
        if (/(auto|scroll|hidden|clip)/u.test(`${style.overflowX} ${style.overflowY}`) && !boundary.includes(parent)) boundary.push(parent);
      }
      this.popup = tippy(this.root, {
        trigger: 'manual', interactive: true, animation: false, hideOnClick: false,
        aria: { content: null, expanded: false }, placement: 'top', offset: [0, 8],
        appendTo: () => this.root.closest('[role="dialog"]') || document.body,
        getReferenceClientRect: () => this.referenceRect() || this.root.getBoundingClientRect(),
        popperOptions: { strategy: 'fixed', modifiers: [
          { name: 'flip', options: { boundary, padding: 8 } },
          { name: 'preventOverflow', options: { boundary, padding: 8, altAxis: true, tether: false } },
        ] },
        render: () => {
          const popper = document.createElement('div');
          popper.setAttribute('role', 'dialog'); popper.setAttribute('aria-label', this.label);
          popper.className = 'gl-border gl-rounded-lg gl-bg-overlap gl-text-default gl-shadow gl-p-3 gl-overflow-auto';
          popper.style.width = '400px'; popper.appendChild(content);
          return { popper };
        },
        onShow: () => { this.expanded = true; },
        onHidden: () => { this.expanded = false; },
        onMount: () => { if (this.pendingFocus) this.focusFirst(); },
      });
      // Tippy overwrites render's id; assign the owned, namespaced id afterward.
      this.popup.popper.id = this.menuId;
    },
    updateSurface() {
      if (this.disposed) return;
      const { root } = this;
      const window = this.$refs.content.ownerDocument.defaultView;
      const reference = this.referenceRect();
      if (!root?.isConnected || !reference || (window.visualViewport?.width || window.innerWidth) < 640) {
        this.dock();
        if (root?.isConnected && this.active && !this.suspended && this.pendingFocus && this.containsFocus()) this.focusFirst();
        return;
      }
      if (!this.popup) this.createPopup();
      this.floating = true;
      const width = window.visualViewport?.width || window.innerWidth;
      const height = window.visualViewport?.height || window.innerHeight;
      this.popup.popper.style.maxWidth = `${Math.max(0, width - 16)}px`;
      this.popup.popper.style.maxHeight = `${Math.max(0, height - 16)}px`;
      const inViewport = reference.bottom > 0 && reference.top < height && reference.right > 0 && reference.left < width;
      if (this.controller.getSnapshot().open && inViewport && !this.suspended && this.containsFocus()) {
        this.popup.show(); this.popup.popperInstance?.update();
        if (this.pendingFocus && this.popup.state.isMounted) this.focusFirst();
      } else this.popup.hide();
    },
    focusFirst() {
      const field = this.$refs.content.querySelector('[tabindex="0"], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([aria-disabled="true"]), a[href]');
      if (field) { field.focus(); this.pendingFocus = false; }
    },
    focusMenu() {
      this.pendingFocus = true; this.controller.refresh(); this.$emit('reveal'); this.schedule();
    },
    onDocumentKeydown(event) {
      // Give fields their local cancel behavior. Intercept editor Escape before
      // the containing GitLab form can treat it as a request to stop editing.
      if (!this.$refs.content.contains(event.target)) this.onKeydown(event);
    },
    onKeydown(event) {
      if (event.defaultPrevented || event.isComposing || this.suspended || !this.active) return;
      if (event.altKey && !event.ctrlKey && !event.metaKey && event.key === 'F10' && this.root?.contains(event.target)) {
        event.preventDefault(); event.stopPropagation(); this.focusMenu(); return;
      }
      if (event.key === 'Escape' && this.floating && this.containsFocus()) {
        event.preventDefault(); event.stopPropagation(); this.pendingFocus = false; this.controller.dismiss(); this.$emit('dismiss'); this.$emit('reveal');
      }
    },
  },
};
</script>
<template>
  <div data-testid="native-context-surface" :data-menu-mode="floating ? 'floating' : 'docked'" :class="floating ? 'gl-inline-flex gl-shrink-0 gl-items-center' : 'gl-w-full'">
    <gl-button v-if="floating && active && !hideTrigger" ref="trigger" category="tertiary" size="small" :aria-label="label" :title="label" :aria-expanded="expanded ? 'true' : 'false'" :aria-controls="expanded ? menuId : undefined" aria-keyshortcuts="Alt+F10" @click="focusMenu">{{ triggerText || label }}</gl-button>
    <div ref="home" :class="{ 'gl-hidden': floating }"><div ref="content" @keydown="onKeydown"><slot></slot></div></div>
  </div>
</template>
