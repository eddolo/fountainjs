/** Guard the exact pinned host boundary; the original packaged editor stays untouched. */
export function prepareGitLabTaskConversion(source) {
  const replace = (before, after) => {
    if (source.split(before).length !== 2) throw new Error('Inspect the pinned GitLab task conversion boundary.');
    source = source.replace(before, after);
  };
  replace("import { sortableEnd, sortableStart } from '~/sortable/utils';",
    "import { sortableEnd, sortableStart } from '~/sortable/utils';\nimport { createGitLabTaskBodyExtractor } from './fountain_task_body_extractor';");
  replace('const bulletTaskListItemRegex = /^\\s*[-*]\\s+\\[.]\\s+/;',
    'const bulletTaskListItemRegex = /^[ \\t]*[-*+][ \\t]+\\[[ xX~]\\](?:[ \\t]+|$)/;');
  replace('const numericalTaskListItemRegex = /^\\s*[0-9]\\.\\s+\\[.]\\s+/;',
    'const numericalTaskListItemRegex = /^[ \\t]*[0-9]{1,9}[.)][ \\t]+\\[[ xX~]\\](?:[ \\t]+|$)/;');
  replace('  const taskTitle = firstLine\n', "  const taskTitle = firstLine.replace(/\\r$/u, '')\n");
  replace('  const firstLineIndentation = firstLine.length - firstLine.trimStart().length;',
    '  const body = createGitLabTaskBodyExtractor(firstLine);\n  const firstLineIndentation = body.indent;');
  const slice = 'descriptionLines[i] = descriptionLines[i].slice(indentation);';
  if (source.split(slice).length !== 3) throw new Error('Inspect the pinned nested-task promotion boundary.');
  source = source.replaceAll(slice, 'descriptionLines[i] = body.strip(descriptionLines[i], indentation);');
  replace('} else if (containsTaskListItem(descriptionLines[i])) {',
    '} else if (body.isNestedTask(descriptionLines[i], containsTaskListItem)) {');
  replace('      const currentLineIndentation = currentLine.length - currentLine.trimStart().length;',
    '      const currentLineIndentation = body.indentation(currentLine);');
  replace('taskDescription.push(descriptionLines[i].trimStart());',
    'taskDescription.push(body.strip(descriptionLines[i]));');
  return source;
}
