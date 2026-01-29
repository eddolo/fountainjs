import { EditorState } from './state';
import { Transaction } from './transaction';
export interface PluginSpec { state?: { init: (config: any, state: EditorState) => any; apply: (tr: Transaction, value: any, oldState: EditorState) => any; }; }
export class Plugin { public readonly spec: PluginSpec; constructor(spec: PluginSpec) { this.spec = spec; } }