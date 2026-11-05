Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
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
exports.planRetainedText = planRetainedText;

//# sourceMappingURL=retained-mapping.cjs.map