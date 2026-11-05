Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const require_rolldown_runtime = require("./rolldown-runtime-VH7oDXx4.cjs");
let yjs = require("yjs");
yjs = require_rolldown_runtime.__toESM(yjs, 1);
//#region src/yjs/retained-nodes.ts
var VERSION = "fountain-retained-nodes/1";
var ROOT = "root";
var SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/;
var SAFE_KEY = /^[A-Za-z_][\w.-]{0,127}$/;
var UNSAFE = /* @__PURE__ */ new Set([
	"__proto__",
	"constructor",
	"prototype"
]);
var MAX_NODES = 1e5;
var MAX_REFERENCES = 1e6;
function id(value) {
	return typeof value === "string" && SAFE_ID.test(value) && !UNSAFE.has(value);
}
function key(value) {
	return typeof value === "string" && SAFE_KEY.test(value) && !UNSAFE.has(value);
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
		} else for (const [name, entry] of Object.entries(item)) {
			if (UNSAFE.has(name)) throw new TypeError("Unsafe retained metadata key.");
			validate(entry, depth + 1);
		}
		ancestors.delete(item);
	};
	validate(value);
	const result = JSON.stringify(value);
	if (result.length > 1e6) throw new RangeError("Retained node value is too large.");
	return result;
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
		if (!(document instanceof yjs.Doc) || !id(name) || typeof createId !== "function") throw new TypeError("Invalid retained node namespace.");
		this.metadata = document.getMap(`${name}:metadata`);
		if (!this.metadata.size) document.transact(() => this.metadata.set("version", VERSION), origin);
		if (this.metadata.get("version") !== VERSION) throw new Error("Unsupported retained node representation.");
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
		if (this.metadata.get("version") !== VERSION) throw new Error("Unsupported retained node representation.");
		if (this.nodes.size > MAX_NODES || this.identities.size > MAX_REFERENCES) throw new RangeError("Retained node pool is too large.");
	}
	record(nodeId) {
		this.valid();
		if (nodeId === ROOT) return this.root;
		const value = this.nodes.get(nodeId);
		if (!id(nodeId) || !(value instanceof yjs.Map)) throw new Error("Unknown retained node.");
		return value;
	}
	children(nodeId) {
		if (nodeId === ROOT) {
			this.valid();
			return this.rootChildren;
		}
		const value = this.record(nodeId).get("children");
		if (!(value instanceof yjs.Array)) throw new Error("Invalid retained children.");
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
		if (!key(value.type)) throw new TypeError("Invalid retained node type.");
		encode(value.attrs ?? {});
		const attrs = Object.entries(value.attrs ?? {}).map(([name, entry]) => {
			if (!key(name)) throw new TypeError("Invalid retained attribute name.");
			return [`attr:${name}`, encode(entry)];
		});
		if (attrs.length > 1e3 || value.marks !== void 0 && !Array.isArray(value.marks)) throw new TypeError("Invalid retained node metadata.");
		const marks = value.marks === void 0 ? void 0 : encode(value.marks);
		const target = this.placementTarget(nodeId, parent, index);
		this.document.transact(() => {
			const record = new yjs.Map();
			record.set("type", value.type);
			record.set("children", new yjs.Array());
			attrs.forEach(([name, entry]) => record.set(name, entry));
			if (marks !== void 0) record.set("marks", marks);
			this.nodes.set(nodeId, record);
			this.identities.set(nodeId, true);
			this.place(nodeId, parent, token, target);
		}, this.origin);
		return nodeId;
	}
	setAttribute(nodeId, name, value) {
		const record = this.record(nodeId);
		if (!key(name)) throw new TypeError("Invalid retained attribute name.");
		if (value !== void 0 && !record.has(`attr:${name}`) && [...record.keys()].filter((entry) => entry.startsWith("attr:")).length >= 1e3) throw new RangeError("Too many retained node attributes.");
		const encoded = value === void 0 ? void 0 : encode(value);
		this.document.transact(() => {
			if (encoded === void 0) record.delete(`attr:${name}`);
			else record.set(`attr:${name}`, encoded);
		}, this.origin);
	}
	setType(nodeId, type) {
		const record = this.record(nodeId);
		if (!key(type)) throw new TypeError("Invalid retained node type.");
		this.document.transact(() => record.set("type", type), this.origin);
	}
	setMarks(nodeId, marks) {
		const record = this.record(nodeId);
		if (marks !== void 0 && !Array.isArray(marks)) throw new TypeError("Invalid retained node marks.");
		const value = marks === void 0 ? void 0 : encode(marks);
		this.document.transact(() => {
			if (value === void 0) record.delete("marks");
			else record.set("marks", value);
		}, this.origin);
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
		const record = this.record(nodeId), type = record.get("type"), attrs = {};
		if (typeof type !== "string" || !key(type) || record.size > 1004 || record.has("deleted") && typeof record.get("deleted") !== "boolean") throw new Error("Invalid retained node metadata.");
		for (const [name, entry] of [...record].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
			if (name === "type" || name === "children" || name === "deleted" || name === "marks") continue;
			if (!name.startsWith("attr:") || !key(name.slice(5))) throw new Error("Unknown retained node metadata.");
			attrs[name.slice(5)] = decode(entry);
		}
		const marks = record.get("marks");
		const decodedMarks = marks === void 0 ? void 0 : decode(marks);
		if (decodedMarks !== void 0 && !Array.isArray(decodedMarks)) throw new Error("Invalid retained node marks.");
		return {
			type,
			...Object.keys(attrs).length ? { attrs } : {},
			...decodedMarks === void 0 ? {} : { marks: decodedMarks }
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
exports.RetainedNodeStore = RetainedNodeStore;

//# sourceMappingURL=retained-nodes.cjs.map