/** Opt-in lexical boundaries, not a TeX compiler or macro expander. */
export function texMathStart(line: string): string | null {
  return /^ {0,3}\\begin\{(equation\*?|align\*?|gather\*?|multline\*?|displaymath)\}/u.exec(line)?.[1] ?? null;
}

function uncomment(line: string): string {
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '\\') { index++; continue; }
    if (line[index] === '%') return line.slice(0, index);
  }
  return line;
}

export function texMathCloses(line: string, environment: string): boolean {
  const code = uncomment(line);
  const closing = `\\end{${environment}}`;
  const index = code.lastIndexOf(closing);
  if (index < 0 || code.slice(index + closing.length).trim()) return false;
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && code[cursor] === '\\'; cursor--) slashes++;
  return slashes % 2 === 0;
}

/** A complete standalone environment, with comments and original source retained. */
export function texMathBlock(lines: readonly string[], start: number): { source: string; end: number } | null {
  const environment = texMathStart(lines[start]);
  if (!environment) return null;
  return texEnvironmentBlock(lines, start);
}

export function texTableStart(line: string): string | null {
  return /^ {0,3}\\begin\{(table|tabular)\}/u.exec(line)?.[1] ?? null;
}

export function texTableBlock(lines: readonly string[], start: number): { source: string; end: number } | null {
  return texTableStart(lines[start]) ? texEnvironmentBlock(lines, start) : null;
}

function texEnvironmentBlock(lines: readonly string[], start: number): { source: string; end: number } | null {
  let length = 0;
  const stack: string[] = [];
  for (let index = start; index < lines.length; index++) {
    const line = lines[index];
    length += line.length + (index > start ? 1 : 0);
    if (length > 20_000 || line.includes('\0')) return null;
    const code = uncomment(line);
    for (let cursor = 0; cursor < code.length; cursor++) {
      if (code[cursor] !== '\\') continue;
      const token = /^\\(begin|end)\{([A-Za-z]+\*?)\}/u.exec(code.slice(cursor));
      if (!token) { cursor++; continue; }
      if (token[1] === 'begin') stack.push(token[2]);
      else if (stack.pop() !== token[2]) return null;
      cursor += token[0].length - 1;
      if (!stack.length) {
        if (code.slice(cursor + 1).trim()) return null;
        return { source: lines.slice(start, index + 1).join('\n'), end: index + 1 };
      }
    }
  }
  return null;
}
