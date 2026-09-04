import { freezeAttributes, type Attributes } from './node-spec';
import type { MarkType, Schema } from './schema';

export interface MarkJSON {
  type: string;
  attrs?: Attributes;
}

export class Mark {
  readonly attrs: Readonly<Attributes>;

  constructor(public readonly type: MarkType, attrs: Attributes = {}) {
    this.attrs = freezeAttributes(attrs);
  }

  eq(other: Mark): boolean {
    return this.type === other.type && JSON.stringify(this.attrs) === JSON.stringify(other.attrs);
  }

  toJSON(): MarkJSON {
    return Object.keys(this.attrs).length ? { type: this.type.name, attrs: { ...this.attrs } } : { type: this.type.name };
  }

  static fromJSON(schema: Schema, json: MarkJSON): Mark {
    if (!json || typeof json.type !== 'string') throw new TypeError('Invalid mark JSON.');
    return schema.mark(json.type, json.attrs ?? {});
  }
}
