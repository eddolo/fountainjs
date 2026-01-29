import React, { useState } from 'react';
import { Node, useFountain, FountainEditor, Navigator, CoreSchemaSpec, historyPlugin } from 'fountainjs';

const Toolbar = ({ editor }) => {
  if (!editor) return null;

  const [blockType, setBlockType] = useState('paragraph');

  const addBlock = (type: string) => {
    const { state } = editor;
    const schema = state.schema;
    
    let newNode;
    const text = new Node(schema.nodes.text, {}, [], 'New content');

    switch (type) {
      case 'h1':
        newNode = new Node(schema.nodes.heading, { level: 1 }, [text]);
        break;
      case 'h2':
        newNode = new Node(schema.nodes.heading, { level: 2 }, [text]);
        break;
      case 'h3':
        newNode = new Node(schema.nodes.heading, { level: 3 }, [text]);
        break;
      case 'image':
        const figcaption = new Node(schema.nodes.figcaption, {}, [text]);
        newNode = new Node(schema.nodes.image_super, 
          { src: 'https://source.unsplash.com/random/600x300?nature' }, 
          [figcaption]);
        break;
      case 'table':
        const createCell = () => new Node(schema.nodes.table_cell, {}, [new Node(schema.nodes.paragraph, {}, [new Node(schema.nodes.text, {}, [], '')])]);
        const createRow = () => new Node(schema.nodes.table_row, {}, [createCell(), createCell(), createCell()]);
        newNode = new Node(schema.nodes.table, {}, [createRow(), createRow()]);
        break;
      case 'bullet-list':
        const listItem = new Node(schema.nodes.list_item, {}, [new Node(schema.nodes.paragraph, {}, [text])]);
        newNode = new Node(schema.nodes.bullet_list, {}, [listItem, new Node(schema.nodes.list_item, {}, [new Node(schema.nodes.paragraph, {}, [new Node(schema.nodes.text, {}, [], 'Item 2')])])]);
        break;
      default:
        newNode = new Node(schema.nodes.paragraph, {}, [text]);
    }

    const tr = editor.createTransaction().replace(state.doc.content.length, state.doc.content.length, [newNode]);
    editor.dispatch(tr);
    setBlockType('paragraph');
  };

  const buttonStyle = {
    padding: '8px 12px',
    marginRight: '4px',
    marginBottom: '8px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: '#f5f5f5',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.2s',
  };

  const buttonHoverStyle = {
    ...buttonStyle,
    backgroundColor: '#e0e0e0',
  };

  const [hoveredBtn, setHoveredBtn] = useState<string | null>(null);

  return (
    <div style={{ marginBottom: '1rem', padding: '12px', backgroundColor: '#fafafa', borderRadius: '4px', border: '1px solid #eee' }}>
      <div style={{ marginBottom: '8px', fontSize: '12px', fontWeight: 'bold', color: '#666', textTransform: 'uppercase' }}>Insert Blocks</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
        {[
          { label: 'H1', value: 'h1' },
          { label: 'H2', value: 'h2' },
          { label: 'H3', value: 'h3' },
          { label: 'Image', value: 'image' },
          { label: 'Table', value: 'table' },
          { label: 'List', value: 'bullet-list' },
        ].map(({ label, value }) => (
          <button
            key={value}
            onClick={() => addBlock(value)}
            onMouseEnter={() => setHoveredBtn(value)}
            onMouseLeave={() => setHoveredBtn(null)}
            style={hoveredBtn === value ? buttonHoverStyle : buttonStyle}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ marginTop: '12px', fontSize: '12px', color: '#999' }}>
        💡 Use <kbd>Ctrl+B</kbd> for bold, <kbd>Ctrl+I</kbd> for italic
      </div>
    </div>
  );
};

function App() {
  const editor = useFountain({
    schema: CoreSchemaSpec,
    plugins: [historyPlugin],
  });

  return (
    <div style={{ padding: '0', margin: '0', minHeight: '100vh', backgroundColor: '#fafafa' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <header style={{ marginBottom: '2rem', paddingBottom: '1rem', borderBottom: '2px solid #eee' }}>
          <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '32px', fontWeight: 'bold' }}>
            ✍️ FountainJS Editor
          </h1>
          <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
            A modern, extensible rich text editor built with TypeScript and React
          </p>
        </header>

        <div style={{ display: 'flex', gap: '2rem' }}>
          <div style={{ flex: 1 }}>
            <Toolbar editor={editor} />
            <div style={{
              border: '1px solid #ddd',
              borderRadius: '8px',
              minHeight: '400px',
              backgroundColor: 'white',
              boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
              overflow: 'hidden',
            }}>
              <FountainEditor editor={editor} />
            </div>
          </div>
          <div style={{
            width: '280px',
            backgroundColor: 'white',
            border: '1px solid #ddd',
            borderRadius: '8px',
            padding: '1rem',
            height: 'fit-content',
            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '14px', fontWeight: 'bold', textTransform: 'uppercase', color: '#666' }}>
              Document
            </h3>
            <Navigator editor={editor} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;