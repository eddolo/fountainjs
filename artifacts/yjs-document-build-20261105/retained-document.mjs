import * as Y from "yjs";
//#region src/core/transaction/mapping.ts
function validatePosition(position) {
	if (!Number.isInteger(position) || position < 0) throw new RangeError(`Invalid document position: ${position}.`);
}
(class StepMap {
	static empty = new StepMap([]);
	ranges;
	constructor(ranges) {
		if (ranges.length % 3 !== 0) throw new RangeError("StepMap ranges must contain start, oldSize, and newSize triples.");
		let previousEnd = -1;
		for (let index = 0; index < ranges.length; index += 3) {
			const start = ranges[index];
			const oldSize = ranges[index + 1];
			if (![
				start,
				oldSize,
				ranges[index + 2]
			].every((value) => Number.isInteger(value) && value >= 0)) throw new RangeError("StepMap ranges must contain non-negative integers.");
			if (start < previousEnd) throw new RangeError("StepMap ranges must be ordered and non-overlapping.");
			previousEnd = start + oldSize;
		}
		this.ranges = Object.freeze([...ranges]);
	}
	map(position, association = 1) {
		return this.mapResult(position, association).position;
	}
	mapResult(position, association = 1) {
		validatePosition(position);
		let offset = 0;
		for (let index = 0; index < this.ranges.length; index += 3) {
			const start = this.ranges[index];
			const oldSize = this.ranges[index + 1];
			const newSize = this.ranges[index + 2];
			const end = start + oldSize;
			if (position < start) break;
			if (position <= end) {
				const side = oldSize === 0 ? association : position === start ? -1 : position === end ? 1 : association;
				return {
					position: start + offset + (side < 0 ? 0 : newSize),
					deleted: position > start && position < end,
					deletedBefore: position > start,
					deletedAfter: position < end,
					deletedAcross: position > start && position < end
				};
			}
			offset += newSize - oldSize;
		}
		return {
			position: position + offset,
			deleted: false,
			deletedBefore: false,
			deletedAfter: false,
			deletedAcross: false
		};
	}
	invert() {
		const inverse = [];
		let offset = 0;
		for (let index = 0; index < this.ranges.length; index += 3) {
			const start = this.ranges[index];
			const oldSize = this.ranges[index + 1];
			const newSize = this.ranges[index + 2];
			inverse.push(start + offset, newSize, oldSize);
			offset += newSize - oldSize;
		}
		return new StepMap(inverse);
	}
});
/** Maps positions through a sequence of document-changing steps. */
var Mapping = class {
	mutableMaps = [];
	constructor(maps = []) {
		this.mutableMaps.push(...maps);
	}
	get maps() {
		return this.mutableMaps;
	}
	appendMap(map) {
		this.mutableMaps.push(map);
		return this;
	}
	map(position, association = 1) {
		return this.mutableMaps.reduce((mapped, stepMap) => stepMap.map(mapped, association), position);
	}
	mapResult(position, association = 1) {
		let mapped = position;
		let deletedBefore = false;
		let deletedAfter = false;
		let deletedAcross = false;
		for (const stepMap of this.mutableMaps) {
			const result = stepMap.mapResult(mapped, association);
			mapped = result.position;
			deletedBefore ||= result.deletedBefore;
			deletedAfter ||= result.deletedAfter;
			deletedAcross ||= result.deletedAcross;
		}
		return {
			position: mapped,
			deleted: deletedAcross || deletedBefore && deletedAfter,
			deletedBefore,
			deletedAfter,
			deletedAcross
		};
	}
};
//#endregion
//#region src/yjs/retained-nodes.ts
var VERSION$2 = "fountain-retained-nodes/2";
var ROOT = "root";
var SAFE_ID$1 = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
var UNSAFE$1 = /* @__PURE__ */ new Set([
	"__proto__",
	"constructor",
	"prototype"
]);
var MAX_NODES = 1e5;
var MAX_REFERENCES = 1e6;
function id(value) {
	return typeof value === "string" && SAFE_ID$1.test(value) && !UNSAFE$1.has(value);
}
function key(value) {
	return typeof value === "string" && value.length <= 200;
}
var retainedNameKey = (name) => Array.from({ length: name.length }, (_, index) => name.charCodeAt(index).toString(16).padStart(4, "0")).join("");
function retainedKeyName(value) {
	if (!/^(?:[a-f0-9]{4}){0,200}$/.test(value)) throw new Error("Invalid retained attribute encoding.");
	return (value.match(/..../g) ?? []).map((entry) => String.fromCharCode(Number.parseInt(entry, 16))).join("");
}
function encode(value) {
	let entries = 0;
	const ancestors = /* @__PURE__ */ new Set();
	const validate = (item, depth = 0) => {
		if (++entries > 1e5 || depth > 100) throw new RangeError("Retained node value is too large.");
		if (item === null || typeof item === "string" || typeof item === "boolean" || typeof item === "number" && Number.isFinite(item)) return;
		if (!item || typeof item !== "object" || ancestors.has(item) || !Array.isArray(item) && ![null, Object.prototype].includes(Object.getPrototypeOf(item))) throw new TypeError("Retained metadata must be portable JSON.");
		ancestors.add(item);
		if (Object.getOwnPropertySymbols(item).length) throw new TypeError("Retained metadata cannot contain symbol keys.");
		if (Array.isArray(item)) {
			if (Object.keys(item).length !== item.length) throw new TypeError("Retained metadata cannot contain sparse or extended arrays.");
			for (let index = 0; index < item.length; index++) {
				if (!Object.hasOwn(item, index)) throw new TypeError("Retained metadata cannot contain sparse arrays.");
				validate(item[index], depth + 1);
			}
		} else for (const entry of Object.values(item)) validate(entry, depth + 1);
		ancestors.delete(item);
	};
	validate(value);
	const result = JSON.stringify(value);
	if (result.length > 1e6) throw new RangeError("Retained node value is too large.");
	return result;
}
function validateRetainedMetadata(value) {
	encode(value);
}
function decode(value) {
	if (typeof value !== "string" || value.length > 1e6) throw new Error("Invalid retained metadata encoding.");
	const result = JSON.parse(value);
	encode(result);
	return result;
}
/** Internal candidate node pool. Tree placements are references; moving a node
* never deletes its metadata or descendants. A single placement register picks
* one owner during concurrent moves. The existing adapter does not use this yet. */
var RetainedNodeStore = class {
	document;
	createId;
	origin;
	metadata;
	scope;
	nodes;
	placements;
	identities;
	root;
	rootChildren;
	constructor(document, name, createId, origin) {
		this.document = document;
		this.createId = createId;
		this.origin = origin;
		if (!(document instanceof Y.Doc) || !id(name) || typeof createId !== "function") throw new TypeError("Invalid retained node namespace.");
		this.metadata = document.getMap(`${name}:metadata`);
		if (!this.metadata.size) document.transact(() => this.metadata.set("version", VERSION$2), origin);
		if (this.metadata.get("version") !== VERSION$2) throw new Error("Unsupported retained node representation.");
		this.nodes = document.getMap(`${name}:nodes`);
		this.placements = document.getMap(`${name}:placements`);
		this.identities = document.getMap(`${name}:identities`);
		this.root = document.getMap(`${name}:root`);
		this.rootChildren = document.getArray(`${name}:root-children`);
		if (!this.root.has("type")) document.transact(() => this.root.set("type", "doc"), origin);
		this.scope = Object.freeze([
			this.nodes,
			this.placements,
			this.identities,
			this.root,
			this.rootChildren
		]);
	}
	valid() {
		if (this.metadata.get("version") !== VERSION$2) throw new Error("Unsupported retained node representation.");
		if (this.nodes.size > MAX_NODES || this.identities.size > MAX_REFERENCES) throw new RangeError("Retained node pool is too large.");
	}
	record(nodeId) {
		this.valid();
		if (nodeId === ROOT) return this.root;
		const value = this.nodes.get(nodeId);
		if (!id(nodeId) || !(value instanceof Y.Map)) throw new Error("Unknown retained node.");
		return value;
	}
	children(nodeId) {
		if (nodeId === ROOT) {
			this.valid();
			return this.rootChildren;
		}
		const value = this.record(nodeId).get("children");
		if (!(value instanceof Y.Array)) throw new Error("Invalid retained children.");
		return value;
	}
	fresh() {
		this.valid();
		if (this.identities.size >= MAX_REFERENCES) throw new RangeError("Too many retained identities.");
		const next = this.createId();
		if (!id(next) || next === ROOT || this.identities.has(next)) throw new Error("ID factory must supply a fresh retained identity.");
		return next;
	}
	placement(nodeId) {
		const value = this.placements.get(nodeId);
		if (value === void 0) return void 0;
		if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid retained placement.");
		const candidate = value;
		if (Object.keys(candidate).length !== 2 || !id(candidate.parent) || !id(candidate.token)) throw new Error("Invalid retained placement.");
		return {
			parent: candidate.parent,
			token: candidate.token
		};
	}
	references(parent) {
		const array = this.children(parent);
		if (array.length > MAX_REFERENCES) throw new RangeError("Too many retained child references.");
		return array.toArray().map((value) => {
			if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid retained child reference.");
			const candidate = value;
			if (Object.keys(candidate).length !== 2 || !id(candidate.id) || !id(candidate.token)) throw new Error("Invalid retained child reference.");
			return {
				id: candidate.id,
				token: candidate.token
			};
		});
	}
	liveChildren(parent) {
		return this.references(parent).filter((reference) => {
			const placement = this.placement(reference.id);
			return placement?.parent === parent && placement.token === reference.token && this.record(reference.id).get("deleted") !== true;
		}).map((reference) => reference.id);
	}
	childrenOf(parent) {
		return this.liveChildren(parent);
	}
	placementIdentity(nodeId) {
		this.valid();
		return this.placement(nodeId)?.token;
	}
	placementTarget(nodeId, parent, index) {
		if (this.record(parent).get("deleted") === true) throw new Error("Cannot place a retained node inside a deleted parent.");
		const array = this.children(parent), live = this.liveChildren(parent).filter((child) => child !== nodeId);
		if (!Number.isSafeInteger(index) || index < 0 || index > live.length) throw new RangeError("Invalid retained child position.");
		const next = live[index];
		return {
			array,
			index: next ? this.references(parent).findIndex((reference) => reference.id === next && this.placement(next)?.token === reference.token) : array.length
		};
	}
	place(nodeId, parent, token, target) {
		this.identities.set(token, true);
		target.array.insert(target.index, [{
			id: nodeId,
			token
		}]);
		this.placements.set(nodeId, {
			parent,
			token
		});
	}
	create(value, parent = ROOT, index = this.liveChildren(parent).length) {
		const nodeId = this.fresh(), token = this.fresh();
		if (nodeId === token) throw new Error("ID factory must supply distinct retained identities.");
		if (this.nodes.size >= MAX_NODES || this.identities.size + 2 > MAX_REFERENCES) throw new RangeError("Retained node pool is too large.");
		if (!key(value.type) || !value.type.length) throw new TypeError("Invalid retained node type.");
		encode(value.attrs ?? {});
		const attrs = Object.entries(value.attrs ?? {}).map(([name, entry]) => {
			if (!key(name)) throw new TypeError("Invalid retained attribute name.");
			return [`attr:${retainedNameKey(name)}`, encode(entry)];
		});
		if (attrs.length > 1e3 || value.marks !== void 0 && !Array.isArray(value.marks)) throw new TypeError("Invalid retained node metadata.");
		const marks = value.marks === void 0 ? void 0 : encode(value.marks);
		const layout = value.textLayout === void 0 ? void 0 : this.layout(value.type, value.textLayout);
		const target = this.placementTarget(nodeId, parent, index);
		this.document.transact(() => {
			const record = new Y.Map();
			record.set("type", value.type);
			record.set("children", new Y.Array());
			attrs.forEach(([name, entry]) => record.set(name, entry));
			if (marks !== void 0) record.set("marks", marks);
			if (layout !== void 0) record.set("textLayout", layout);
			this.nodes.set(nodeId, record);
			this.identities.set(nodeId, true);
			this.place(nodeId, parent, token, target);
		}, this.origin);
		return nodeId;
	}
	setAttribute(nodeId, name, value) {
		const record = this.record(nodeId);
		if (!key(name)) throw new TypeError("Invalid retained attribute name.");
		const field = `attr:${retainedNameKey(name)}`;
		if (value !== void 0 && !record.has(field) && [...record.keys()].filter((entry) => entry.startsWith("attr:")).length >= 1e3) throw new RangeError("Too many retained node attributes.");
		const encoded = value === void 0 ? void 0 : encode(value);
		if (record.get(field) === encoded) return;
		this.document.transact(() => {
			if (encoded === void 0) record.delete(field);
			else record.set(field, encoded);
		}, this.origin);
	}
	setType(nodeId, type) {
		const record = this.record(nodeId);
		if (!key(type) || !type.length) throw new TypeError("Invalid retained node type.");
		if (record.get("type") === type) return;
		this.document.transact(() => record.set("type", type), this.origin);
	}
	setMarks(nodeId, marks) {
		const record = this.record(nodeId);
		if (marks !== void 0 && !Array.isArray(marks)) throw new TypeError("Invalid retained node marks.");
		const value = marks === void 0 ? void 0 : encode(marks);
		if (record.get("marks") === value) return;
		this.document.transact(() => {
			if (value === void 0) record.delete("marks");
			else record.set("marks", value);
		}, this.origin);
	}
	layout(type, value) {
		if (type !== "text" || !value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid retained text layout.");
		const candidate = value;
		if (Object.keys(candidate).length !== 2 || !id(candidate.field) || typeof candidate.empty !== "boolean") throw new TypeError("Invalid retained text layout.");
		return {
			field: candidate.field,
			empty: candidate.empty
		};
	}
	setTextLayout(nodeId, value) {
		const record = this.record(nodeId), layout = this.layout(record.get("type"), value);
		const previous = record.get("textLayout");
		if (previous?.field === layout.field && previous.empty === layout.empty) return;
		this.document.transact(() => record.set("textLayout", layout), this.origin);
	}
	move(nodeId, parent, index) {
		if (nodeId === ROOT || this.record(nodeId).get("deleted") === true) throw new Error("Cannot move the root or a deleted retained node.");
		let current = parent;
		const seen = /* @__PURE__ */ new Set();
		while (current && current !== ROOT) {
			if (current === nodeId || seen.has(current)) throw new Error("Retained move would create a cycle.");
			seen.add(current);
			current = this.placement(current)?.parent;
		}
		const target = this.placementTarget(nodeId, parent, index), token = this.fresh();
		this.document.transact(() => this.place(nodeId, parent, token, target), this.origin);
	}
	remove(nodeId) {
		if (nodeId === ROOT) throw new Error("Cannot delete the retained root.");
		const record = this.record(nodeId);
		this.document.transact(() => record.set("deleted", true), this.origin);
	}
	value(nodeId) {
		const record = this.record(nodeId), type = record.get("type"), attrs = Object.create(null);
		if (typeof type !== "string" || !type.length || !key(type) || record.size > 1005 || record.has("deleted") && typeof record.get("deleted") !== "boolean") throw new Error("Invalid retained node metadata.");
		for (const [name, entry] of [...record].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
			if (name === "type" || name === "children" || name === "deleted" || name === "marks" || name === "textLayout") continue;
			if (!name.startsWith("attr:")) throw new Error("Unknown retained node metadata.");
			attrs[retainedKeyName(name.slice(5))] = decode(entry);
		}
		const marks = record.get("marks");
		const decodedMarks = marks === void 0 ? void 0 : decode(marks);
		if (decodedMarks !== void 0 && !Array.isArray(decodedMarks)) throw new Error("Invalid retained node marks.");
		return {
			type,
			...Object.keys(attrs).length ? { attrs } : {},
			...decodedMarks === void 0 ? {} : { marks: decodedMarks },
			...record.has("textLayout") ? { textLayout: this.layout(type, record.get("textLayout")) } : {}
		};
	}
	project() {
		this.valid();
		const issues = [], parents = /* @__PURE__ */ new Map(), lifted = /* @__PURE__ */ new Set();
		const alive = [...this.nodes.keys()].filter((nodeId) => {
			if (!id(nodeId) || nodeId === ROOT) throw new Error("Invalid retained node identity.");
			return this.record(nodeId).get("deleted") !== true;
		}).sort();
		for (const nodeId of alive) {
			const placement = this.placement(nodeId);
			if (placement) parents.set(nodeId, placement.parent);
		}
		const completed = /* @__PURE__ */ new Set();
		for (const nodeId of alive) {
			const path = [], local = /* @__PURE__ */ new Map();
			let current = nodeId;
			while (current && current !== ROOT && !completed.has(current)) {
				const repeated = local.get(current);
				if (repeated !== void 0) {
					const chosen = path.slice(repeated).sort().at(-1);
					parents.set(chosen, ROOT);
					lifted.add(chosen);
					issues.push({
						kind: "cycle-lifted",
						id: chosen
					});
					break;
				}
				local.set(current, path.length);
				path.push(current);
				current = parents.get(current);
			}
			path.forEach((entry) => completed.add(entry));
		}
		const visited = /* @__PURE__ */ new Set();
		const visit = (nodeId, depth = 0) => {
			if (depth > 100 || visited.has(nodeId)) throw new Error("Invalid retained node depth or duplicate ownership.");
			visited.add(nodeId);
			const children = [], seen = /* @__PURE__ */ new Set();
			for (const child of this.liveChildren(nodeId)) if (parents.get(child) === nodeId) {
				if (seen.has(child)) issues.push({
					kind: "duplicate-reference",
					id: child
				});
				else {
					children.push(child);
					seen.add(child);
				}
			}
			if (nodeId === ROOT) {
				for (const child of [...lifted].sort()) if (!seen.has(child)) children.push(child);
			}
			return {
				id: nodeId,
				...this.value(nodeId),
				content: children.map((child) => visit(child, depth + 1))
			};
		};
		const root = visit(ROOT);
		for (const nodeId of alive) if (!visited.has(nodeId)) issues.push({
			kind: "unattached",
			id: nodeId
		});
		return {
			root,
			issues
		};
	}
};
//#endregion
//#region src/yjs/retained-text.ts
var VERSION$1 = "fountain-retained-text/1";
var MARKER = "$fountain:partition";
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
var SAFE_ATTRIBUTE = /^[A-Za-z_][\w.:-]{0,2047}$/;
var UNSAFE = /* @__PURE__ */ new Set([
	"__proto__",
	"constructor",
	"prototype"
]);
var MAX_TEXT = 1e7;
var MAX_PARTITIONS = 1e5;
var MAX_ATTRIBUTES = 1e3;
var MAX_ATTRIBUTE_LENGTH = 1e6;
function validId(value) {
	return typeof value === "string" && SAFE_ID.test(value) && !UNSAFE.has(value);
}
function attributes(value, remove = false) {
	if (value === void 0) return {};
	if (!value || typeof value !== "object" || Array.isArray(value) || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) throw new TypeError("Invalid retained text attributes.");
	const entries = Object.entries(value);
	if (entries.length > MAX_ATTRIBUTES) throw new RangeError("Too many retained text attributes.");
	for (const [key, entry] of entries) if (!SAFE_ATTRIBUTE.test(key) || UNSAFE.has(key) || !(typeof entry === "string" && entry.length <= MAX_ATTRIBUTE_LENGTH || remove && entry === null)) throw new TypeError("Invalid retained text attribute.");
	return Object.fromEntries(entries);
}
function validateRetainedTextFormat(value) {
	attributes(value);
}
/** Internal candidate storage for the next collaboration representation.
* Character sequences live outside the document tree. Private boundary embeds
* partition them without copying characters or exposing embeds as document text.
* This is deliberately not wired into, or exported by, the existing adapter. */
var RetainedTextStore = class {
	document;
	origin;
	metadata;
	scope;
	texts;
	owners;
	epoch = 0;
	destroyed = false;
	cache = /* @__PURE__ */ new WeakMap();
	invalidate = () => {
		this.epoch++;
	};
	constructor(document, name, origin) {
		this.document = document;
		this.origin = origin;
		if (!(document instanceof Y.Doc) || !validId(name)) throw new TypeError("Invalid retained text namespace.");
		this.metadata = document.getMap(`${name}:metadata`);
		if (this.metadata.size === 0) document.transact(() => this.metadata.set("version", VERSION$1), origin);
		if (this.metadata.get("version") !== VERSION$1) throw new Error("Unsupported retained text representation.");
		this.texts = document.getMap(`${name}:texts`);
		this.owners = document.getMap(`${name}:owners`);
		this.scope = Object.freeze([this.texts, this.owners]);
		this.metadata.observeDeep(this.invalidate);
		this.scope.forEach((type) => type.observeDeep(this.invalidate));
	}
	assertLive() {
		if (this.destroyed) throw new Error("Retained text store is destroyed.");
		if (this.metadata.get("version") !== VERSION$1) throw new Error("Unsupported retained text representation.");
		if (this.owners.size > MAX_PARTITIONS || this.texts.size > MAX_PARTITIONS) throw new RangeError("Retained text pool is too large.");
	}
	stream(id) {
		this.assertLive();
		const text = this.texts.get(id);
		if (!validId(id) || !(text instanceof Y.Text)) throw new Error("Unknown retained text stream.");
		if (text.length > 101e5) throw new RangeError("Retained text stream is too large.");
		return text;
	}
	index(streamId) {
		const text = this.stream(streamId), cached = this.cache.get(text);
		if (cached?.epoch === this.epoch) return cached.entries;
		const entries = [], ids = /* @__PURE__ */ new Set();
		let current;
		let position = 0, characters = 0;
		for (const operation of text.toDelta()) {
			if (typeof operation.insert === "string") {
				if (!current) throw new Error("Retained characters need a partition boundary.");
				const format = attributes(operation.attributes);
				current.runs.push(Object.freeze({
					text: operation.insert,
					...Object.keys(format).length ? { attributes: Object.freeze(format) } : {}
				}));
				position += operation.insert.length;
				characters += operation.insert.length;
			} else {
				const marker = operation.insert;
				if (!marker || typeof marker !== "object" || Array.isArray(marker) || Object.keys(marker).length !== 1 || !validId(marker[MARKER]) || Object.keys(attributes(operation.attributes)).length) throw new Error("Unknown retained text embed.");
				const id = marker[MARKER];
				if (ids.has(id) || this.owners.get(id) !== streamId) throw new Error("Invalid retained text partition owner.");
				ids.add(id);
				if (current) {
					current.to = position;
					Object.freeze(current.runs);
					Object.freeze(current);
				}
				current = {
					id,
					streamId,
					from: position + 1,
					to: position + 1,
					runs: []
				};
				entries.push(current);
				position++;
			}
			if (characters > MAX_TEXT || entries.length > MAX_PARTITIONS) throw new RangeError("Retained text stream is too large.");
		}
		if (current) {
			current.to = position;
			Object.freeze(current.runs);
			Object.freeze(current);
		}
		const result = Object.freeze(entries);
		this.cache.set(text, {
			epoch: this.epoch,
			entries: result
		});
		return result;
	}
	freshId(id) {
		this.assertLive();
		if (!validId(id) || this.owners.has(id)) throw new Error("Invalid or duplicate retained text partition ID.");
		if (this.owners.size >= MAX_PARTITIONS) throw new RangeError("Too many retained text partitions.");
	}
	create(streamId, id, runs) {
		this.freshId(id);
		if (!validId(streamId) || this.texts.has(streamId)) throw new Error("Invalid or duplicate retained text stream ID.");
		let length = 0;
		const safeRuns = runs.map((run) => {
			if (typeof run.text !== "string" || (length += run.text.length) > MAX_TEXT) throw new RangeError("Invalid retained text length.");
			return {
				text: run.text,
				attributes: attributes(run.attributes)
			};
		});
		this.document.transact(() => {
			const text = new Y.Text();
			this.texts.set(streamId, text);
			this.owners.set(id, streamId);
			text.insertEmbed(0, { [MARKER]: id }, {});
			for (const run of safeRuns) if (run.text) text.insert(text.length, run.text, run.attributes);
			this.invalidate();
		}, this.origin);
	}
	project(id) {
		this.assertLive();
		const streamId = this.owners.get(id);
		if (!validId(id) || !validId(streamId)) throw new Error("Unknown retained text partition.");
		const entry = this.index(streamId).find((partition) => partition.id === id);
		if (!entry) throw new Error("Retained text partition boundary is missing.");
		return entry;
	}
	has(id) {
		this.assertLive();
		return validId(id) && this.owners.has(id);
	}
	partitions(streamId) {
		return this.index(streamId);
	}
	point(id, offset) {
		const partition = this.project(id);
		if (!Number.isSafeInteger(offset) || offset < 0 || offset > partition.to - partition.from) throw new RangeError("Invalid retained text offset.");
		return {
			partition,
			text: this.stream(partition.streamId),
			position: partition.from + offset
		};
	}
	split(id, newId, offset) {
		this.freshId(newId);
		const { partition, text, position } = this.point(id, offset);
		this.document.transact(() => {
			this.owners.set(newId, partition.streamId);
			text.insertEmbed(position, { [MARKER]: newId }, {});
			this.invalidate();
		}, this.origin);
	}
	insert(id, offset, value, format) {
		const { partition, text, position } = this.point(id, offset), safeFormat = attributes(format);
		if (typeof value !== "string" || text.length - this.index(partition.streamId).length + value.length > MAX_TEXT) throw new RangeError("Invalid retained text insertion.");
		this.document.transact(() => {
			if (value) text.insert(position, value, safeFormat);
			this.invalidate();
		}, this.origin);
	}
	delete(id, from, to) {
		const start = this.point(id, from), end = this.point(id, to);
		if (to < from) throw new RangeError("Retained text deletion must be ordered.");
		this.document.transact(() => {
			start.text.delete(start.position, end.position - start.position);
			this.invalidate();
		}, this.origin);
	}
	format(id, from, to, value) {
		const start = this.point(id, from), end = this.point(id, to), safeFormat = attributes(value, true);
		if (to < from) throw new RangeError("Retained text formatting must be ordered.");
		this.document.transact(() => {
			start.text.format(start.position, end.position - start.position, safeFormat);
			this.invalidate();
		}, this.origin);
	}
	/** Merge adjacent partitions in one stream without deleting any characters. */
	join(leftId, rightId) {
		const left = this.project(leftId), right = this.project(rightId), entries = this.index(left.streamId);
		if (left.streamId !== right.streamId || entries[entries.indexOf(left) + 1]?.id !== rightId) throw new Error("Only adjacent retained partitions can join.");
		this.document.transact(() => {
			this.stream(left.streamId).delete(right.from - 1, 1);
			this.owners.delete(rightId);
			this.invalidate();
		}, this.origin);
	}
	relative(id, offset, association = 1) {
		if (association !== -1 && association !== 1) throw new RangeError("Invalid retained text association.");
		const { text, position } = this.point(id, offset);
		return Y.relativePositionToJSON(Y.createRelativePositionFromTypeIndex(text, position, association));
	}
	resolve(value) {
		this.assertLive();
		try {
			if (!value || typeof value !== "object") return void 0;
			const point = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(value), this.document);
			if (!point || !(point.type instanceof Y.Text)) return void 0;
			for (const [streamId, text] of this.texts) if (text === point.type) {
				const entry = this.index(streamId).find((partition) => point.index >= partition.from && point.index <= partition.to);
				return entry ? {
					id: entry.id,
					offset: point.index - entry.from,
					association: point.assoc < 0 ? -1 : 1
				} : void 0;
			}
		} catch {
			return;
		}
	}
	destroy() {
		if (this.destroyed) return;
		this.metadata.unobserveDeep(this.invalidate);
		this.scope.forEach((type) => type.unobserveDeep(this.invalidate));
		this.cache = /* @__PURE__ */ new WeakMap();
		this.destroyed = true;
	}
};
//#endregion
//#region src/yjs/retained-mapping.ts
function leaves(document) {
	const result = [];
	const visit = (node, path, position, root = false) => {
		if (node.isText) {
			if (node.nodeSize) result.push({
				node,
				path: Object.freeze([...path]),
				position
			});
			return;
		}
		let next = root ? position : position + 1;
		node.content.forEach((child, index) => {
			visit(child, [...path, index], next);
			next += child.nodeSize;
		});
	};
	visit(document, [], 0, true);
	return result;
}
function retainedUnits(size, maps) {
	let spans = size ? [{
		before: 0,
		after: 0,
		length: size
	}] : [];
	for (const map of maps) {
		const unchanged = [];
		let old = 0, next = 0;
		for (let index = 0; index < map.ranges.length; index += 3) {
			const start = map.ranges[index], removed = map.ranges[index + 1], inserted = map.ranges[index + 2];
			if (start + removed > size) throw new RangeError("Retained mapping exceeds its source document.");
			if (start > old) unchanged.push({
				before: old,
				after: next,
				length: start - old
			});
			next += start - old + inserted;
			old = start + removed;
		}
		if (old < size) unchanged.push({
			before: old,
			after: next,
			length: size - old
		});
		const updated = [];
		let index = 0;
		for (const span of spans) {
			while (index < unchanged.length && unchanged[index].before + unchanged[index].length <= span.after) index++;
			for (let at = index; at < unchanged.length && unchanged[at].before < span.after + span.length; at++) {
				const segment = unchanged[at], from = Math.max(span.after, segment.before), to = Math.min(span.after + span.length, segment.before + segment.length);
				if (from < to) updated.push({
					before: span.before + from - span.after,
					after: segment.after + from - segment.before,
					length: to - from
				});
			}
		}
		spans = updated;
		size = next + size - old;
	}
	return {
		spans,
		size
	};
}
function gaps(all, retained) {
	const byPath = /* @__PURE__ */ new Map();
	for (const slice of retained) {
		const key = slice.path.join("."), slices = byPath.get(key) ?? [];
		slices.push(slice);
		byPath.set(key, slices);
	}
	const result = [];
	for (const leaf of all) {
		let position = 0;
		for (const slice of byPath.get(leaf.path.join(".")) ?? []) {
			if (slice.from < position) throw new Error("Retained text slices overlap.");
			if (slice.from > position) result.push({
				path: leaf.path,
				from: position,
				to: slice.from
			});
			position = slice.to;
		}
		if (position < leaf.node.nodeSize) result.push({
			path: leaf.path,
			from: position,
			to: leaf.node.nodeSize
		});
	}
	return result;
}
/** Retain container identity only where its opening unit is actually retained. */
function planRetainedNodeStarts(before, after, mapping) {
	const collect = (document) => {
		const result = [];
		const visit = (node, path, position, root = false) => {
			if (node.isText) return;
			if (!root) result.push({
				path,
				position
			});
			let next = root ? 0 : position + 1;
			node.content.forEach((child, index) => {
				visit(child, [...path, index], next);
				next += child.nodeSize;
			});
		};
		visit(document, [], 0, true);
		return result;
	};
	const next = new Map(collect(after).map((entry) => [entry.position, entry.path]));
	const { spans, size } = retainedUnits(before.nodeSize - 2, mapping.maps), result = [];
	if (size !== after.nodeSize - 2) throw new Error("Transaction maps do not describe the target document size.");
	let index = 0;
	for (const entry of collect(before)) {
		while (index < spans.length && spans[index].before + spans[index].length <= entry.position) index++;
		const span = spans[index];
		if (!span || entry.position < span.before) continue;
		const path = next.get(span.after + entry.position - span.before);
		if (path) result.push({
			before: entry.path,
			after: path
		});
	}
	return result;
}
/** Derive character provenance from exact transaction maps, never text matching.
* The adapter can use these slices to retain shared text through new model
* paths, mark-leaf splits and structural boundaries. No document roots are cached. */
function planRetainedText(before, after, mapping) {
	const oldLeaves = leaves(before), newLeaves = leaves(after), retained = [];
	const { spans, size } = retainedUnits(before.nodeSize - 2, mapping.maps);
	if (size !== after.nodeSize - 2) throw new Error("Transaction maps do not describe the target document size.");
	let oldIndex = 0, newIndex = 0;
	for (const span of spans) {
		while (oldIndex < oldLeaves.length && oldLeaves[oldIndex].position + oldLeaves[oldIndex].node.nodeSize <= span.before) oldIndex++;
		for (let index = oldIndex; index < oldLeaves.length && oldLeaves[index].position < span.before + span.length; index++) {
			const source = oldLeaves[index], from = Math.max(span.before, source.position), to = Math.min(span.before + span.length, source.position + source.node.nodeSize);
			const start = span.after + from - span.before, end = start + to - from;
			let covered = 0;
			while (newIndex < newLeaves.length && newLeaves[newIndex].position + newLeaves[newIndex].node.nodeSize <= start) newIndex++;
			for (let targetIndex = newIndex; targetIndex < newLeaves.length && newLeaves[targetIndex].position < end; targetIndex++) {
				const target = newLeaves[targetIndex], left = Math.max(start, target.position), right = Math.min(end, target.position + target.node.nodeSize);
				if (left >= right) continue;
				const oldFrom = from + left - start - source.position, newFrom = left - target.position, length = right - left;
				if (source.node.text.slice(oldFrom, oldFrom + length) !== target.node.text.slice(newFrom, newFrom + length)) throw new Error("Transaction maps claim changed text was retained.");
				retained.push({
					before: {
						path: source.path,
						from: oldFrom,
						to: oldFrom + length
					},
					after: {
						path: target.path,
						from: newFrom,
						to: newFrom + length
					}
				});
				covered += length;
			}
			if (covered !== to - from) throw new Error("Transaction maps move retained text into a structural token.");
		}
	}
	return {
		retained,
		removed: gaps(oldLeaves, retained.map((slice) => slice.before)),
		inserted: gaps(newLeaves, retained.map((slice) => slice.after))
	};
}
//#endregion
//#region src/yjs/retained-document.ts
var VERSION = "fountain-retained-document/1";
var LEAF = "fountain_leaf";
var ORDER = "fountain_marks";
var pathKey = (path) => path.join(".");
var same = (left, right) => {
	const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, canonical(entry)])) : value;
	return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
};
function format(node, leaf) {
	const result = { [LEAF]: leaf }, order = [], counts = /* @__PURE__ */ new Map();
	for (const [name, value] of Object.entries(node.attrs)) result[`a_${retainedNameKey(name)}`] = JSON.stringify(value);
	for (const mark of node.marks) {
		const ordinal = counts.get(mark.type.name) ?? 0;
		counts.set(mark.type.name, ordinal + 1);
		const key = `m_${retainedNameKey(mark.type.name)}_${ordinal}`;
		result[key] = JSON.stringify(mark.attrs);
		order.push(key);
	}
	result[ORDER] = JSON.stringify(order);
	return result;
}
/** Candidate model/CRDT bridge. Not registered with the public Yjs adapter yet. */
var RetainedDocumentStore = class {
	document;
	schema;
	createId;
	origin;
	nodes;
	text;
	scope;
	metadata;
	splits;
	model;
	nodePaths = /* @__PURE__ */ new Map();
	textPaths = /* @__PURE__ */ new Map();
	leafPaths = /* @__PURE__ */ new Map();
	groups = /* @__PURE__ */ new Map();
	graph;
	constructor(document, name, schema, createId, origin) {
		this.document = document;
		this.schema = schema;
		this.createId = createId;
		this.origin = origin;
		this.metadata = document.getMap(`${name}:document`);
		if (!this.metadata.size) document.transact(() => this.metadata.set("version", VERSION), origin);
		if (this.metadata.get("version") !== VERSION) throw new Error("Unsupported retained document version.");
		this.nodes = new RetainedNodeStore(document, `${name}-nodes`, createId, origin);
		this.text = new RetainedTextStore(document, `${name}-text`, origin);
		this.splits = document.getMap(`${name}:splits`);
		this.scope = [
			...this.nodes.scope,
			...this.text.scope,
			this.splits
		];
	}
	splitPlacement(id) {
		if (this.splits.size > 1e5) throw new RangeError("Too many retained split placements.");
		const raw = this.splits.get(id);
		if (raw === void 0) return void 0;
		if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length !== 4) throw new Error("Invalid retained split placement.");
		const value = raw;
		if (![
			value.root,
			value.rootToken,
			value.token,
			value.partition
		].every((entry) => typeof entry === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(entry))) throw new Error("Invalid retained split identity.");
		return value.token === this.nodes.placementIdentity(id) && value.rootToken === this.nodes.placementIdentity(value.root) ? value : void 0;
	}
	orderedChildren(raw) {
		const result = [...raw.content], families = /* @__PURE__ */ new Map();
		for (let index = 0; index < result.length; index++) {
			const node = result[index], placement = this.splitPlacement(node.id);
			if (!placement || !result.some((child) => child.id === placement.root)) continue;
			const partition = this.text.project(placement.partition), entries = families.get(placement.root) ?? [];
			entries.push({
				index,
				node,
				rank: partition.from,
				stream: partition.streamId
			});
			families.set(placement.root, entries);
		}
		for (const [root, entries] of families) {
			if (new Set(entries.map((entry) => entry.stream)).size !== 1) throw new Error("Retained split family crosses text streams.");
			const rootIndex = result.findIndex((child) => child.id === root), slots = [rootIndex, ...entries.map((entry) => entry.index)].sort((a, b) => a - b);
			const nodes = [result[rootIndex], ...entries.sort((a, b) => a.rank - b.rank || (a.node.id < b.node.id ? -1 : 1)).map((entry) => entry.node)];
			slots.forEach((slot, index) => {
				result[slot] = nodes[index];
			});
		}
		return result;
	}
	validate(document) {
		if (document.type.schema !== this.schema) throw new Error("Retained document belongs to another schema.");
		let nodes = 0, characters = 0;
		document.descendants((node, path) => {
			if (++nodes > 1e5 || path.length > 100 || (characters += node.text?.length ?? 0) > 1e7) throw new RangeError("Retained document is too large.");
			validateRetainedMetadata(node.attrs);
			validateRetainedMetadata(node.marks.map((mark) => mark.toJSON()));
			if (node.type.name.length > 200 || Object.keys(node.attrs).length > 1e3 || Object.keys(node.attrs).some((name) => name.length > 200)) throw new RangeError("Retained node metadata exceeds the candidate storage bounds.");
			if (node.isText) validateRetainedTextFormat(format(node, "preflight"));
		});
		this.schema.validate(document);
	}
	metadataFor(id, before, after) {
		if (!before || before.type !== after.type.name) this.nodes.setType(id, after.type.name);
		const previous = before?.attrs ?? {};
		for (const name of /* @__PURE__ */ new Set([...Object.keys(previous), ...Object.keys(after.attrs)])) if (!same(previous[name], after.attrs[name])) this.nodes.setAttribute(id, name, after.attrs[name]);
		const marks = after.marks.map((mark) => mark.toJSON());
		if (!same(before?.marks ?? [], marks)) this.nodes.setMarks(id, marks.length ? marks : void 0);
	}
	seed(source) {
		this.validate(source);
		if (this.metadata.get("seeded") === true || this.nodes.project().root.content.length) throw new Error("Retained document is already initialized.");
		this.document.transact(() => {
			this.metadataFor("root", this.nodes.project().root, source);
			const visit = (node, parent) => {
				for (let index = 0; index < node.childCount;) {
					const child = node.child(index);
					if (!child.isText) {
						const id = this.nodes.create({
							type: child.type.name,
							attrs: { ...child.attrs },
							marks: child.marks.map((mark) => mark.toJSON())
						}, parent);
						visit(child, id);
						index++;
						continue;
					}
					const content = [child];
					index++;
					if (child.nodeSize) while (index < node.childCount && node.child(index).isText && node.child(index).nodeSize) content.push(node.child(index++));
					const id = this.nodes.create({
						type: "text",
						attrs: { ...child.attrs },
						marks: child.marks.map((mark) => mark.toJSON())
					}, parent);
					this.nodes.setTextLayout(id, {
						field: id,
						empty: child.nodeSize === 0
					});
					this.text.create(this.createId(), id, content.filter((text) => text.nodeSize).map((text) => ({
						text: text.text,
						attributes: format(text, this.createId())
					})));
				}
			};
			visit(source, "root");
			this.metadata.set("seeded", true);
		}, this.origin);
		const projected = this.read();
		if (!same(projected.toJSON(), source.toJSON())) throw new Error("Retained seed changed source content.");
		this.model = source;
		return projected;
	}
	textNode(text, attrs, marks) {
		return this.schema.nodes.text.create(attrs, [], text, marks.map((mark) => this.schema.markFromJSON(mark)));
	}
	decode(run) {
		const fields = run.attributes ?? {}, attrs = Object.create(null), marks = /* @__PURE__ */ new Map();
		const leaf = fields[LEAF];
		if (typeof leaf !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(leaf)) throw new Error(`Retained characters need a leaf identity (${Object.keys(fields).join(",")}).`);
		const order = JSON.parse(fields[ORDER] ?? "[]");
		if (!Array.isArray(order) || order.some((key) => typeof key !== "string")) throw new Error("Invalid retained mark order.");
		for (const [key, value] of Object.entries(fields).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
			if (key === LEAF || key === ORDER) continue;
			const parsed = JSON.parse(value);
			validateRetainedMetadata(parsed);
			if (key.startsWith("a_")) attrs[retainedKeyName(key.slice(2))] = parsed;
			else if (/^m_[a-f0-9]*_\d+$/.test(key) && parsed && typeof parsed === "object" && !Array.isArray(parsed)) marks.set(key, {
				type: retainedKeyName(key.slice(2, key.lastIndexOf("_"))),
				attrs: parsed
			});
			else throw new Error("Unknown retained text format.");
		}
		return {
			leaf,
			attrs,
			marks: [.../* @__PURE__ */ new Set([...order, ...marks.keys()])].filter((key) => marks.has(key)).map((key) => marks.get(key))
		};
	}
	read(validate = true) {
		if (this.metadata.get("version") !== VERSION || this.metadata.get("seeded") !== true) throw new Error("Retained document is not initialized.");
		const projection = this.nodes.project();
		if (projection.issues.some((issue) => issue.kind === "unattached")) throw new Error("Retained document has unattached records.");
		const groupStates = /* @__PURE__ */ new Map();
		const visit = (raw) => {
			if (!Object.hasOwn(this.schema.nodes, raw.type)) throw new Error(`Unknown retained node type: ${raw.type}`);
			const activeFields = /* @__PURE__ */ new Set();
			const ordered = this.orderedChildren(raw);
			for (const child of ordered) if (child.type === "text") {
				if (!child.textLayout || !this.text.has(child.id)) throw new Error(`Missing retained text layout for ${child.id} (layout: ${!!child.textLayout}, stream: ${this.text.has(child.id)}).`);
				if (this.text.project(child.id).runs.some((run) => run.text.length)) activeFields.add(child.textLayout.field);
			}
			const emittedEmpty = /* @__PURE__ */ new Set(), children = [];
			const append = (next) => {
				const previous = children.at(-1);
				if (previous?.leaf && previous.leaf === next.leaf && previous.node.isText && next.node.isText && same(previous.node.attrs, next.node.attrs) && same(previous.node.marks.map((mark) => mark.toJSON()), next.node.marks.map((mark) => mark.toJSON()))) {
					const length = previous.node.nodeSize;
					previous.node = previous.node.withText(previous.node.text + next.node.text);
					previous.bindings.push(...next.bindings.map((binding) => ({
						...binding,
						modelFrom: binding.modelFrom + length
					})));
				} else children.push(next);
			};
			for (const child of ordered) {
				if (child.type !== "text") {
					append(visit(child));
					continue;
				}
				groupStates.set(child.id, {
					id: child.id,
					parent: raw.id,
					value: child
				});
				const partition = this.text.project(child.id);
				let offset = 0;
				for (const run of partition.runs) {
					const decoded = this.decode(run);
					append({
						node: this.textNode(run.text, decoded.attrs, decoded.marks),
						leaf: decoded.leaf,
						bindings: [{
							id: child.id,
							from: offset,
							length: run.text.length,
							modelFrom: 0,
							leaf: decoded.leaf
						}]
					});
					offset += run.text.length;
				}
				const layout = child.textLayout;
				if (!offset && layout.empty && !activeFields.has(layout.field) && !emittedEmpty.has(layout.field)) {
					emittedEmpty.add(layout.field);
					append({
						node: this.textNode("", child.attrs ?? {}, child.marks ?? []),
						leaf: child.id,
						bindings: [{
							id: child.id,
							from: 0,
							length: 0,
							modelFrom: 0,
							leaf: child.id
						}]
					});
				}
			}
			return {
				node: this.schema.nodes[raw.type].create(raw.attrs ?? {}, children.map((child) => child.node), void 0, (raw.marks ?? []).map((mark) => this.schema.markFromJSON(mark))),
				id: raw.id,
				children
			};
		};
		const result = visit(projection.root);
		if (validate) this.schema.validate(result.node);
		const nodePaths = /* @__PURE__ */ new Map(), textPaths = /* @__PURE__ */ new Map(), leafPaths = /* @__PURE__ */ new Map();
		const bind = (fragment, path) => {
			if (fragment.id) nodePaths.set(pathKey(path), fragment.id);
			if (fragment.bindings) {
				textPaths.set(pathKey(path), fragment.bindings);
				leafPaths.set(pathKey(path), fragment.leaf);
			}
			fragment.children?.forEach((child, index) => bind(child, [...path, index]));
		};
		bind(result, []);
		this.nodePaths = nodePaths;
		this.textPaths = textPaths;
		this.leafPaths = leafPaths;
		this.groups = groupStates;
		this.graph = projection.root;
		this.model = result.node;
		return result.node;
	}
	apply(transaction) {
		if (!this.model || !same(this.model.toJSON(), transaction.originalDoc.toJSON())) throw new Error("Retained transaction uses a stale source.");
		this.validate(transaction.doc);
		let before = transaction.originalDoc;
		const changes = transaction.steps.map((step) => {
			const after = step.apply(before), mapping = new Mapping(step.getMaps?.(before) ?? [step.getMap(before)]);
			planRetainedText(before, after, mapping);
			const change = {
				before,
				after,
				mapping,
				step
			};
			before = after;
			return change;
		});
		this.document.transact(() => {
			for (const change of changes) this.change(change.before, change.after, change.mapping, change.step);
		}, this.origin);
		return this.read();
	}
	change(before, after, mapping, step) {
		const plan = planRetainedText(before, after, mapping), oldNodes = this.nodePaths, oldBindings = this.textPaths;
		const nextNodes = /* @__PURE__ */ new Map([["", "root"]]), values = /* @__PURE__ */ new Map();
		const collect = (raw) => {
			values.set(raw.id, raw);
			raw.content.forEach(collect);
		};
		collect(this.graph);
		for (const retained of planRetainedNodeStarts(before, after, mapping)) {
			const id = oldNodes.get(pathKey(retained.before));
			if (id) nextNodes.set(pathKey(retained.after), id);
		}
		const objects = /* @__PURE__ */ new Map();
		const oldVisit = (node, path) => {
			const id = oldNodes.get(pathKey(path));
			if (id) objects.set(node, objects.has(node) ? null : id);
			node.content.forEach((child, index) => oldVisit(child, [...path, index]));
		};
		oldVisit(before, []);
		const usedNodes = new Set(nextNodes.values()), expected = /* @__PURE__ */ new Map(), groups = [];
		const leaves = /* @__PURE__ */ new Map(), usedLeaves = /* @__PURE__ */ new Set();
		const candidates = /* @__PURE__ */ new Map();
		for (const retained of plan.retained) {
			const key = pathKey(retained.after.path), ids = candidates.get(key) ?? [];
			for (const binding of oldBindings.get(pathKey(retained.before.path)) ?? []) if (binding.modelFrom < retained.before.to && binding.modelFrom + binding.length > retained.before.from) ids.push(binding.leaf);
			candidates.set(key, ids);
		}
		const visit = (node, path, parent) => {
			const key = pathKey(path);
			let id = nextNodes.get(key);
			const identity = objects.get(node);
			if (!id && identity && !usedNodes.has(identity)) {
				id = identity;
				nextNodes.set(key, id);
				usedNodes.add(id);
			}
			if (!id) {
				id = this.nodes.create({
					type: node.type.name,
					attrs: { ...node.attrs },
					marks: node.marks.map((mark) => mark.toJSON())
				}, parent);
				nextNodes.set(key, id);
				usedNodes.add(id);
			} else this.metadataFor(id, values.get(id), node);
			const children = [];
			expected.set(id, children);
			for (let index = 0; index < node.childCount;) {
				const child = node.child(index);
				if (!child.isText) {
					visit(child, [...path, index], id);
					children.push(nextNodes.get(pathKey([...path, index])));
					index++;
					continue;
				}
				const group = {
					parent: id,
					leaves: [],
					ids: [],
					field: "",
					pieces: [],
					empty: child.nodeSize === 0
				};
				let at = 0;
				do {
					const text = node.child(index), textPath = [...path, index], textKey = pathKey(textPath);
					const leaf = candidates.get(textKey)?.find((value) => !usedLeaves.has(value)) ?? this.createId();
					usedLeaves.add(leaf);
					const entry = {
						node: text,
						path: textPath,
						at,
						leaf
					};
					leaves.set(textKey, entry);
					group.leaves.push(entry);
					at += text.nodeSize;
					index++;
				} while (!group.empty && index < node.childCount && node.child(index).isText && node.child(index).nodeSize > 0);
				groups.push(group);
				children.push(group);
			}
		};
		visit(after, [], "root");
		const groupFor = /* @__PURE__ */ new Map();
		groups.forEach((group) => group.leaves.forEach((leaf) => groupFor.set(leaf, group)));
		for (const retained of plan.retained) {
			const leaf = leaves.get(pathKey(retained.after.path)), group = groupFor.get(leaf);
			for (const binding of oldBindings.get(pathKey(retained.before.path)) ?? []) {
				const from = Math.max(binding.modelFrom, retained.before.from), to = Math.min(binding.modelFrom + binding.length, retained.before.to);
				if (from < to) group.pieces.push({
					original: binding.id,
					from: binding.from + from - binding.modelFrom,
					to: binding.from + to - binding.modelFrom,
					at: leaf.at + retained.after.from + from - retained.before.from,
					group,
					leaf
				});
			}
		}
		const intent = step.getRetainedSplit?.();
		if (intent) {
			const binding = (oldBindings.get(pathKey(intent.textPath)) ?? []).find((entry) => entry.modelFrom <= intent.offset && entry.modelFrom + entry.length >= intent.offset);
			const left = leaves.get(pathKey(intent.textPath)), right = leaves.get(pathKey(intent.rightTextPath));
			if (!binding || !left || !right) throw new Error("Retained split has no source or target text boundary.");
			const offset = binding.from + intent.offset - binding.modelFrom;
			for (const leaf of [left, right]) {
				const group = groupFor.get(leaf);
				if (!group.pieces.some((piece) => piece.original === binding.id && (piece.from === offset || piece.to === offset))) group.pieces.push({
					original: binding.id,
					from: offset,
					to: offset,
					at: leaf.at + (leaf === left ? leaf.node.nodeSize : 0),
					group,
					leaf
				});
			}
		}
		const byOriginal = /* @__PURE__ */ new Map();
		for (const group of groups) for (const piece of group.pieces) {
			const entries = byOriginal.get(piece.original) ?? [];
			entries.push(piece);
			byOriginal.set(piece.original, entries);
		}
		const segments = /* @__PURE__ */ new Map();
		for (const [original, pieces] of byOriginal) {
			pieces.sort((a, b) => a.from - b.from || a.to - b.to || groups.indexOf(a.group) - groups.indexOf(b.group));
			const length = this.text.project(original).runs.reduce((sum, run) => sum + run.text.length, 0);
			const result = [];
			let current = {
				original,
				id: original,
				from: 0,
				to: length,
				group: pieces[0].group
			};
			for (const piece of pieces) {
				if (piece.group !== current.group) {
					const cut = piece.from, id = this.nodes.create({
						...values.get(original),
						textLayout: void 0
					}, piece.group.parent);
					this.text.split(current.id, id, cut - current.from);
					current.to = cut;
					result.push(current);
					current = {
						original,
						id,
						from: cut,
						to: length,
						group: piece.group
					};
				}
				piece.id = current.id;
				piece.start = this.text.relative(current.id, piece.from - current.from, 1);
				piece.end = this.text.relative(current.id, piece.to - current.from, -1);
			}
			result.push(current);
			segments.set(original, result);
			for (const segment of result) if (!segment.group.ids.includes(segment.id)) segment.group.ids.push(segment.id);
		}
		const assigned = new Set(groups.flatMap((group) => group.ids));
		for (const group of groups) if (!group.ids.length) {
			const binding = group.leaves.flatMap((leaf) => oldBindings.get(pathKey(leaf.path)) ?? []).find((entry) => !assigned.has(entry.id) && this.groups.get(entry.id)?.parent === group.parent);
			if (binding) {
				group.ids.push(binding.id);
				assigned.add(binding.id);
				segments.set(binding.id, [{
					original: binding.id,
					id: binding.id,
					from: 0,
					to: this.text.project(binding.id).runs.reduce((sum, run) => sum + run.text.length, 0),
					group
				}]);
			} else {
				const first = group.leaves[0].node;
				const id = this.nodes.create({
					type: "text",
					attrs: { ...first.attrs },
					marks: first.marks.map((mark) => mark.toJSON())
				}, group.parent);
				this.text.create(this.createId(), id, []);
				group.ids.push(id);
				assigned.add(id);
			}
		}
		const deletions = /* @__PURE__ */ new Map();
		for (const removed of plan.removed) for (const binding of oldBindings.get(pathKey(removed.path)) ?? []) {
			const from = Math.max(removed.from, binding.modelFrom), to = Math.min(removed.to, binding.modelFrom + binding.length);
			if (from >= to) continue;
			const start = binding.from + from - binding.modelFrom, end = binding.from + to - binding.modelFrom;
			for (const segment of segments.get(binding.id) ?? []) {
				const a = Math.max(start, segment.from), b = Math.min(end, segment.to);
				if (a < b) {
					const entries = deletions.get(segment.id) ?? [];
					entries.push({
						from: a - segment.from,
						to: b - segment.from
					});
					deletions.set(segment.id, entries);
				}
			}
		}
		for (const [id, ranges] of deletions) for (const range of ranges.sort((a, b) => b.from - a.from)) this.text.delete(id, range.from, range.to);
		for (const inserted of plan.inserted) {
			const leaf = leaves.get(pathKey(inserted.path)), group = groupFor.get(leaf), at = leaf.at + inserted.from;
			const right = group.pieces.filter((piece) => piece.at >= at).sort((a, b) => a.at - b.at)[0];
			const left = group.pieces.filter((piece) => piece.at + piece.to - piece.from <= at).sort((a, b) => b.at + b.to - b.from - a.at - a.to + a.from)[0];
			const anchor = right?.start ?? left?.end, resolved = anchor ? this.text.resolve(anchor) : void 0;
			const id = resolved?.id ?? group.ids[0], offset = resolved?.offset ?? 0, value = leaf.node.text.slice(inserted.from, inserted.to);
			this.text.insert(id, offset, value, format(leaf.node, leaf.leaf));
			group.pieces.push({
				original: id,
				id,
				from: 0,
				to: value.length,
				at,
				group,
				leaf,
				start: this.text.relative(id, offset, 1),
				end: this.text.relative(id, offset + value.length, -1)
			});
		}
		for (const group of groups) {
			group.field = this.groups.get(group.ids[0])?.value.textLayout?.field ?? group.ids[0];
			group.pieces.sort((a, b) => a.at - b.at);
			group.ids = [.../* @__PURE__ */ new Set([...group.pieces.map((piece) => piece.id), ...group.ids])];
			for (const id of group.ids) this.nodes.setTextLayout(id, {
				field: group.field,
				empty: group.empty
			});
			for (const piece of group.pieces) {
				if (piece.from === piece.to) continue;
				const start = this.text.resolve(piece.start), end = this.text.resolve(piece.end);
				if (!start || !end || start.id !== end.id) throw new Error("Retained formatting crossed a shared boundary.");
				const desired = format(piece.leaf.node, piece.leaf.leaf);
				let offset = 0;
				for (const run of this.text.project(start.id).runs) {
					const from = Math.max(offset, start.offset), to = Math.min(offset + run.text.length, end.offset);
					offset += run.text.length;
					if (from >= to) continue;
					const patch = {};
					for (const key of /* @__PURE__ */ new Set([...Object.keys(run.attributes ?? {}), ...Object.keys(desired)])) if (run.attributes?.[key] !== desired[key]) patch[key] = desired[key] ?? null;
					if (Object.keys(patch).length) this.text.format(start.id, from, to, patch);
				}
			}
		}
		for (const state of this.groups.values()) if (!assigned.has(state.id) && usedNodes.has(state.parent)) {
			const group = groups.find((entry) => entry.parent === state.parent);
			if (group) {
				group.ids.push(state.id);
				this.nodes.setTextLayout(state.id, {
					field: group.field,
					empty: false
				});
			} else {
				expected.get(state.parent).push(state.id);
				this.nodes.setTextLayout(state.id, {
					field: state.value.textLayout.field,
					empty: false
				});
			}
			assigned.add(state.id);
			const length = this.text.project(state.id).runs.reduce((sum, run) => sum + run.text.length, 0);
			if (length) this.text.delete(state.id, 0, length);
		}
		for (const [id] of values) if (id !== "root" && !usedNodes.has(id) && !assigned.has(id)) this.nodes.remove(id);
		for (const [parent, children] of expected) {
			const ids = children.flatMap((child) => typeof child === "string" ? [child] : child.ids);
			for (let index = 0; index < ids.length; index++) if (this.nodes.childrenOf(parent)[index] !== ids[index]) this.nodes.move(ids[index], parent, index);
		}
		if (intent) {
			let divergence = 0;
			while (intent.textPath[divergence] === intent.rightTextPath[divergence]) divergence++;
			const leftId = nextNodes.get(pathKey(intent.textPath.slice(0, divergence + 1)));
			const rightId = nextNodes.get(pathKey(intent.rightTextPath.slice(0, divergence + 1)));
			const leaf = leaves.get(pathKey(intent.rightTextPath)), group = groupFor.get(leaf);
			const root = this.splitPlacement(leftId)?.root ?? leftId;
			this.splits.set(rightId, {
				root,
				rootToken: this.nodes.placementIdentity(root),
				token: this.nodes.placementIdentity(rightId),
				partition: group.ids[0]
			});
		}
		if (!same(this.read(false).toJSON(), after.toJSON())) throw new Error("Retained transaction changed the native document shape.");
		this.model = after;
	}
	destroy() {
		this.text.destroy();
		this.model = void 0;
		this.graph = void 0;
		this.groups.clear();
		this.textPaths.clear();
		this.nodePaths.clear();
		this.leafPaths.clear();
	}
};
//#endregion
export { RetainedDocumentStore };

//# sourceMappingURL=retained-document.mjs.map