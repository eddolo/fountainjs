<script setup>
import { ref, shallowRef } from 'vue';
import { Schema, createHistoryPlugin, doc, paragraph, text, strong, toggleMark, isMarkActive } from 'fountainjs-editor';
import { FountainDocumentField, useFountainState } from 'fountainjs-editor/vue';

const schema = { nodes: { doc, paragraph, text }, marks: { strong } };
const config = { schema, plugins: [createHistoryPlugin()] };
const options = { ariaLabel: 'Review notes', placeholder: 'Add your findings…' };
const storageKey = 'fountainjs-vue-review-v1';
const title = ref('');
const notes = shallowRef(null);
const field = ref(null);
const state = useFountainState(() => field.value?.editor);
const status = ref('');

function loadReview() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) return;
    const saved = JSON.parse(raw);
    if (typeof saved.title !== 'string' || saved.notes?.type !== 'doc') throw Error('Invalid review');
    const document = new Schema(schema).nodeFromJSON(saved.notes);
    title.value = saved.title;
    notes.value = document.toJSON();
    status.value = 'Opened your saved review.';
  } catch {
    status.value = 'Could not open the saved review in this browser.';
  }
}

function saveReview() {
  try {
    const document = notes.value ?? field.value.editor.getJSON();
    localStorage.setItem(storageKey, JSON.stringify({ title: title.value, notes: document }));
    status.value = 'Review saved in this browser.';
  } catch {
    status.value = 'Could not save in this browser. Your edits are still open.';
  }
}

function bold() {
  const editor = field.value?.editor;
  if (editor) {
    toggleMark(editor, 'strong');
    field.value.focus();
  }
}

loadReview();
</script>

<template>
  <main>
    <h1>Release review</h1>
    <form @submit.prevent="saveReview" @input="status = ''">
      <label>Release <input v-model="title" required></label>
      <section aria-labelledby="notes-label">
        <h2 id="notes-label">Review notes</h2>
        <button type="button" :aria-pressed="state ? isMarkActive(field.editor, 'strong') : false" @mousedown.prevent @click="bold">Bold</button>
        <FountainDocumentField ref="field" v-model="notes" @update:model-value="status = ''" :config="config" :options="options" />
      </section>
      <button type="submit">Save review</button>
    </form>
    <p role="status">{{ status }}</p>
    <details>
      <summary>Document JSON</summary>
      <pre>{{ JSON.stringify(notes, null, 2) }}</pre>
    </details>
  </main>
</template>

<style>
body { margin: 0; color: #202921; background: #f6f7f3; font: 1rem/1.5 system-ui, sans-serif; }
main { max-width: 42rem; margin: 3rem auto; padding: 0 1rem; }
h1 { margin: 0 0 1.5rem; }
h2 { font-size: 1rem; margin: 0 0 .5rem; }
label, input { display: block; }
input, button { font: inherit; }
input { box-sizing: border-box; width: 100%; padding: .5rem; }
section { margin: 1rem 0; padding: 1rem; background: white; border: 1px solid #aab6ab; border-radius: .5rem; }
section [contenteditable] { min-height: 7rem; padding: .65rem; }
button { padding: .35rem .8rem; cursor: pointer; }
button[type=submit] { color: white; background: #245643; border: 1px solid #245643; border-radius: .3rem; }
pre { overflow: auto; max-height: 18rem; }
</style>
