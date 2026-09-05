import type { Node } from './schema';
import type { MapAssociation, MapResult } from './transaction';
import type { GlobalConstructorInstance } from './platform';

export type DecorationType = 'inline' | 'node' | 'widget';
export type DecorationAttributes = Readonly<Record<string, string | number | boolean | null | undefined>>;
/** Renderer-owned widget payload; the DOM adapter narrows it to a DOM Node. */
export type WidgetFactory<Widget = GlobalConstructorInstance<'Node', unknown>> = () => Widget;

export interface DecorationSpec {
  /** Stable identity used when comparing decorations across state updates. */
  key?: string;
  /** Whether content inserted exactly at the start becomes decorated. */
  inclusiveStart?: boolean;
  /** Whether content inserted exactly at the end becomes decorated. */
  inclusiveEnd?: boolean;
  /** Controls which side of inserted content retains a widget. */
  side?: MapAssociation;
}

export interface PositionMapping {
  map(position: number, association?: MapAssociation): number;
  mapResult(position: number, association?: MapAssociation): MapResult;
}

function assertPosition(position: number, name: string): void {
  if (!Number.isInteger(position) || position < 0) throw new RangeError(`Invalid decoration ${name}: ${position}.`);
}

function sameAttributes(left: DecorationAttributes, right: DecorationAttributes): boolean {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([name, value]) => right[name] === value);
}

/** A view-only range or widget that never becomes part of document JSON. */
export class Decoration {
  private constructor(
    public readonly type: DecorationType,
    public readonly from: number,
    public readonly to: number,
    public readonly attrs: DecorationAttributes,
    public readonly spec: Readonly<DecorationSpec>,
    public readonly toDOM?: WidgetFactory,
  ) {
    assertPosition(from, 'start');
    assertPosition(to, 'end');
    if (type === 'widget' && from !== to) throw new RangeError('Widget decorations must use one position.');
    if (type !== 'widget' && from >= to) throw new RangeError(`${type} decorations require a non-empty range.`);
    this.attrs = Object.freeze({ ...attrs });
    this.spec = Object.freeze({ ...spec });
  }

  static inline(from: number, to: number, attrs: DecorationAttributes = {}, spec: DecorationSpec = {}): Decoration {
    return new Decoration('inline', from, to, attrs, spec);
  }

  static node(from: number, to: number, attrs: DecorationAttributes = {}, spec: DecorationSpec = {}): Decoration {
    return new Decoration('node', from, to, attrs, spec);
  }

  static widget(position: number, toDOM: WidgetFactory, spec: DecorationSpec = {}): Decoration {
    if (typeof toDOM !== 'function') throw new TypeError('Widget decorations require a renderer factory.');
    return new Decoration('widget', position, position, {}, spec, toDOM);
  }

  map(mapping: PositionMapping): Decoration | null {
    if (this.type === 'widget') {
      const association = this.spec.side ?? 1;
      const result = mapping.mapResult(this.from, association);
      if (result.deletedAcross) return null;
      return Decoration.widget(result.position, this.toDOM as WidgetFactory, this.spec);
    }

    const startAssociation: MapAssociation = this.spec.inclusiveStart ? -1 : 1;
    const endAssociation: MapAssociation = this.spec.inclusiveEnd ? 1 : -1;
    const from = mapping.map(this.from, startAssociation);
    const to = mapping.map(this.to, endAssociation);
    if (from >= to) return null;
    return this.type === 'inline'
      ? Decoration.inline(from, to, this.attrs, this.spec)
      : Decoration.node(from, to, this.attrs, this.spec);
  }

  eq(other: Decoration): boolean {
    return this.type === other.type
      && this.from === other.from
      && this.to === other.to
      && this.toDOM === other.toDOM
      && this.spec.key === other.spec.key
      && this.spec.side === other.spec.side
      && this.spec.inclusiveStart === other.spec.inclusiveStart
      && this.spec.inclusiveEnd === other.spec.inclusiveEnd
      && sameAttributes(this.attrs, other.attrs);
  }
}

function sortDecorations(left: Decoration, right: Decoration): number {
  return left.from - right.from
    || left.to - right.to
    || left.type.localeCompare(right.type)
    || (left.spec.side ?? 1) - (right.spec.side ?? 1)
    || (left.spec.key ?? '').localeCompare(right.spec.key ?? '');
}

/** Immutable, sorted collection of decorations for one document version. */
export class DecorationSet {
  static readonly empty = new DecorationSet([]);
  readonly decorations: readonly Decoration[];

  private constructor(decorations: readonly Decoration[]) {
    this.decorations = Object.freeze([...decorations].sort(sortDecorations));
  }

  static create(doc: Node, decorations: readonly Decoration[]): DecorationSet {
    const maximum = Math.max(0, doc.nodeSize - 2);
    decorations.forEach((decoration) => {
      if (decoration.from > maximum || decoration.to > maximum) {
        throw new RangeError(`Decoration ${decoration.from}..${decoration.to} exceeds document size ${maximum}.`);
      }
    });
    return decorations.length ? new DecorationSet(decorations) : DecorationSet.empty;
  }

  find(
    from = 0,
    to = Number.MAX_SAFE_INTEGER,
    predicate?: (decoration: Decoration) => boolean,
  ): readonly Decoration[] {
    return this.decorations.filter((decoration) => {
      const intersects = decoration.type === 'widget'
        ? decoration.from >= from && decoration.from <= to
        : decoration.from < to && decoration.to > from;
      return intersects && (!predicate || predicate(decoration));
    });
  }

  map(mapping: PositionMapping, doc: Node): DecorationSet {
    return DecorationSet.create(doc, this.decorations.flatMap((decoration) => {
      const mapped = decoration.map(mapping);
      return mapped ? [mapped] : [];
    }));
  }

  add(doc: Node, decorations: readonly Decoration[]): DecorationSet {
    return DecorationSet.create(doc, [...this.decorations, ...decorations]);
  }

  remove(decorations: readonly Decoration[]): DecorationSet {
    const remaining = this.decorations.filter((candidate) => !decorations.some((decoration) => candidate === decoration || candidate.eq(decoration)));
    return remaining.length ? new DecorationSet(remaining) : DecorationSet.empty;
  }

  eq(other: DecorationSet): boolean {
    return this === other || (this.decorations.length === other.decorations.length
      && this.decorations.every((decoration, index) => decoration.eq(other.decorations[index] as Decoration)));
  }
}
