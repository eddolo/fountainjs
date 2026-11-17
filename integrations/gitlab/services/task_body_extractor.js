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

function takeContainerIndent(value, columns) {
  let column = 0;
  let index = 0;
  let width = 0;
  while (column < columns && index < value.length) {
    if (value[index] === ' ') width = 1;
    else if (value[index] === '\t') width = 4 - (column % 4);
    else break;
    column += width;
    index += 1;
  }
  const over = Math.max(0, column - columns);
  return {
    prefix: over ? value.slice(0, index - 1) + ' '.repeat(width - over) : value.slice(0, index),
    content: ' '.repeat(over) + value.slice(index),
    complete: column >= columns,
  };
}

function createTaskContainerPrefix(firstLine, sourcepos) {
  const position = typeof sourcepos === 'string' && /^\d+:(\d+)-\d+:\d+$/u.exec(sourcepos);
  if (!position) return null;
  const offset = Number(position[1]) - 1;
  if (offset < 0 || offset >= firstLine.length) return null;
  const prefix = firstLine.slice(0, offset);
  if (!prefix || /^[ \t]*$/u.test(prefix) || prefix.includes('\t')) return null;
  const tokens = [];
  let index = 0;
  let retainsList = false;
  while (index < prefix.length) {
    const rest = prefix.slice(index);
    const spaces = /^ +/u.exec(rest);
    if (spaces) {
      tokens.push({kind:'indent',columns:spaces[0].length});index += spaces[0].length;
    } else if (rest[0] === '>') {
      tokens.push({kind:'quote'});index += rest[1] === ' ' ? 2 : 1;
    } else {
      const list = /^(?:[-+*]|[0-9]{1,9}[.)])( {1,4})(?=\S|$)/u.exec(rest);
      if (!list) return null;
      tokens.push({kind:'indent',columns:list[0].length});index += list[0].length;retainsList = true;
    }
  }
  return {
    firstLine:firstLine.slice(offset),
    retainedPrefix:retainsList ? prefix.replace(/ +$/u,'') + (firstLine.endsWith('\r')?'\r':'') : undefined,
    unwrap(line) {
      let content = line;
      let kept = '';
      let complete = true;
      for (const token of tokens) {
        if (token.kind === 'quote') {
          const quote = /^ {0,3}>[ \t]?/u.exec(content);
          if (quote) {kept += quote[0];content = content.slice(quote[0].length);}
          else complete = false;
        } else {
          const taken = takeContainerIndent(content, token.columns);
          kept += taken.prefix;content = taken.content;complete = complete && taken.complete;
        }
      }
      return {prefix:kept,content,complete};
    },
  };
}

/** Preserve relative code whitespace while removing only the Markdown list container. */
export function createGitLabTaskBodyExtractor(firstLine, sourcepos) {
  const markerPattern = /^([ \t]*)(?:([-*+])|([0-9]{1,9})([.)]))([ \t]+)(.*)$/u;
  const proposed = createTaskContainerPrefix(firstLine, sourcepos);
  const container = proposed && markerPattern.test(proposed.firstLine.replace(/\r$/u, '')) ? proposed : null;
  const activeLine = container?.firstLine ?? firstLine;
  const marker = markerPattern.exec(activeLine.replace(/\r$/u, ''));
  if (!marker) {
    // Keep unverified quoted/custom prefixes on the host's existing path.
    return {
      titleLine:firstLine.replace(/\r$/u, ''),
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
  const unwrap = line => container ? container.unwrap(line) : {prefix:'',content:line,complete:true};
  return {
    titleLine:activeLine.replace(/\r$/u, ''),
    retainedPrefix:container?.retainedPrefix,
    indent,
    indentation: line => indentationColumns(unwrap(line).content),
    strip(line, columns) {
      const value = unwrap(line);
      return columns === undefined ? stripColumns(value.content, contentIndent)
        : value.prefix + stripColumns(value.content, columns);
    },
    isNestedTask(line, containsTask) {
      const value = unwrap(line);
      const content = stripColumns(value.content, contentIndent);
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
      return value.complete && indentationColumns(content) < 4 && containsTask(value.content);
    },
  };
}
