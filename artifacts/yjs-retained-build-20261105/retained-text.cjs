Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_rolldown_runtime = require("./rolldown-runtime-VH7oDXx4.cjs");
let yjs = require("yjs");
yjs = require_rolldown_runtime.__toESM(yjs, 1);
//#region src/yjs/retained-text.ts
var VERSION = "fountain-retained-text/1";
var MARKER = "$fountain:partition";
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
var SAFE_ATTRIBUTE = /^[A-Za-z_][\w.:-]{0,127}$/;
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
		if (!(document instanceof yjs.Doc) || !validId(name)) throw new TypeError("Invalid retained text namespace.");
		this.metadata = document.getMap(`${name}:metadata`);
		if (this.metadata.size === 0) document.transact(() => this.metadata.set("version", VERSION), origin);
		if (this.metadata.get("version") !== VERSION) throw new Error("Unsupported retained text representation.");
		this.texts = document.getMap(`${name}:texts`);
		this.owners = document.getMap(`${name}:owners`);
		this.scope = Object.freeze([this.texts, this.owners]);
		this.metadata.observeDeep(this.invalidate);
		this.scope.forEach((type) => type.observeDeep(this.invalidate));
	}
	assertLive() {
		if (this.destroyed) throw new Error("Retained text store is destroyed.");
		if (this.metadata.get("version") !== VERSION) throw new Error("Unsupported retained text representation.");
		if (this.owners.size > MAX_PARTITIONS || this.texts.size > MAX_PARTITIONS) throw new RangeError("Retained text pool is too large.");
	}
	stream(id) {
		this.assertLive();
		const text = this.texts.get(id);
		if (!validId(id) || !(text instanceof yjs.Text)) throw new Error("Unknown retained text stream.");
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
			const text = new yjs.Text();
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
		return yjs.relativePositionToJSON(yjs.createRelativePositionFromTypeIndex(text, position, association));
	}
	resolve(value) {
		this.assertLive();
		try {
			if (!value || typeof value !== "object") return void 0;
			const point = yjs.createAbsolutePositionFromRelativePosition(yjs.createRelativePositionFromJSON(value), this.document);
			if (!point || !(point.type instanceof yjs.Text)) return void 0;
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
exports.RetainedTextStore = RetainedTextStore;

//# sourceMappingURL=retained-text.cjs.map