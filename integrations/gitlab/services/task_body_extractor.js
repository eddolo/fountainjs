function indentationColumns(value, start = 0) {
  let column = start;
  for (const character of value) {
    if (character === ' ') column += 1;
    else if (character === '\t') column += 4 - (column % 4);
    else break;
  }
  return column - start;
}

function stripColumns(value, columns) {
  let column = 0;
  let index = 0;
  while (column < columns && index < value.length) {
    if (value[index] === ' ') column += 1;
    else if (value[index] === '\t') column += 4 - (column % 4);
    else break;
    index += 1;
  }
  return ' '.repeat(Math.max(0, column - columns)) + value.slice(index);
}

/** Preserve relative code whitespace while removing only the Markdown list container. */
export function createGitLabTaskBodyExtractor(firstLine) {
  const marker = /^([ \t]*)(?:([-*+])|([0-9]{1,9})([.)]))([ \t]+)(.*)$/u.exec(firstLine.replace(/\r$/u, ''));
  if (!marker) {
    // Keep unverified quoted/custom prefixes on the host's existing path.
    return {
      indent: firstLine.length - firstLine.trimStart().length,
      indentation: (line) => line.length - line.trimStart().length,
      strip: (line, columns) => columns === undefined ? line.trimStart() : line.slice(columns),
      isNestedTask: (line, containsTask) => containsTask(line),
    };
  }
  const indent = indentationColumns(marker[1]);
  const markerEnd = indent + (marker[2] ? 1 : marker[3].length + 1);
  const padding = indentationColumns(marker[5], markerEnd);
  const contentIndent = markerEnd + (marker[6] && padding <= 4 ? padding : 1);
  let fence = null;
  return {
    indent,
    indentation: indentationColumns,
    strip: (line, columns = contentIndent) => stripColumns(line, columns),
    isNestedTask(line, containsTask) {
      const content = stripColumns(line, contentIndent);
      const candidate = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(content.replace(/\r$/u, ''));
      if (fence) {
        if (candidate && candidate[1][0] === fence[0] && candidate[1].length >= fence.length
          && /^[ \t]*$/u.test(candidate[2])) fence = null;
        return false;
      }
      if (candidate && (candidate[1][0] !== '`' || !candidate[2].includes('`'))) {
        [, fence] = candidate;
        return false;
      }
      // An indented-code line is source, even when it resembles a checkbox.
      return indentationColumns(content) < 4 && containsTask(line);
    },
  };
}
