import { useState, useEffect } from 'react';
import { Editor, Node as FountainNode } from '../core';

interface OutlineItem {
  id: string;
  level: number;
  text: string;
  path: number[];
}

function parseDocument(doc: FountainNode): OutlineItem[] {
  const headings: OutlineItem[] = [];
  function traverse(node: FountainNode, path: number[]) {
    if (node.type.name === 'heading') {
      headings.push({
        id: `${path.join('-')}-${node.attrs.level}`,
        level: node.attrs.level,
        text: node.content.map(c => c.text).join('') || 'Untitled Heading',
        path,
      });
    }
    node.content.forEach((child, i) => { traverse(child, [...path, i]); });
  }
  traverse(doc, []);
  return headings;
}

export function useNavigatorState(editor: Editor | null): OutlineItem[] {
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const newOutline = parseDocument(editor.state.doc);
      setOutline(newOutline);
    };
    update();
    const unsubscribe = editor.subscribe(update);
    return () => unsubscribe();
  }, [editor]);
  return outline;
}