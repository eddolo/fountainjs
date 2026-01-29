import type { MarkType, Schema } from './schema';
export class Mark {
  public readonly type: MarkType;
  public readonly attrs: { [name: string]: any };
  constructor(type: MarkType, attrs: { [name: string]: any }) { this.type = type; this.attrs = attrs; }
  static fromJSON(schema: Schema, json: any): Mark { const type = schema.marks[json.type]; if (!type) throw new Error(`Unknown mark type: ${json.type}`); return new Mark(type, { ...json.attrs }); }
}