import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLineGutter, highlightSpecialChars, drawSelection, dropCursor, rectangularSelection, crosshairCursor, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { oneDark } from '@codemirror/theme-one-dark';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { yCollab } from 'y-codemirror.next';
import * as Y from 'yjs';

interface CodeMirrorEditorProps {
  ydoc: Y.Doc;
  onChange?: (value: string) => void;
  className?: string;
}

export function CodeMirrorEditor({ ydoc, onChange, className }: CodeMirrorEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!editorRef.current) return;

    const ytext = ydoc.getText('content');
    ytextRef.current = ytext;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && onChangeRef.current) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        EditorState.readOnly.of(false),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        markdown({
          base: markdownLanguage,
          codeLanguages: languages,
          addKeymap: true,
        }),
        oneDark,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        yCollab(ytext, { undoManager: null }),
        updateListener,
        EditorView.theme({
          '&': {
            height: '100%',
            backgroundColor: '#0D1117',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '14px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: "'JetBrains Mono', monospace",
          },
          '.cm-content': {
            caretColor: '#00D68F',
            padding: '16px',
          },
          '.cm-line': {
            padding: '0 4px',
          },
          '.cm-cursor': {
            borderLeftColor: '#00D68F',
            borderLeftWidth: '2px',
          },
          '.cm-selectionBackground, ::selection': {
            backgroundColor: 'rgba(0, 214, 143, 0.2) !important',
          },
          '.cm-gutters': {
            backgroundColor: '#0D1117',
            color: '#484F58',
            borderRight: '1px solid #21262D',
          },
          '.cm-activeLineGutter': {
            backgroundColor: '#161B22',
          },
          '.cm-activeLine': {
            backgroundColor: '#161B22',
          },
          '.cm-ySelection': {
            caretColor: 'var(--collab-color)',
          },
          '.cm-ySelectionCaret': {
            borderLeftColor: 'var(--collab-color) !important',
          },
          '.cm-ySelectionInfo': {
            backgroundColor: 'var(--collab-color)',
            color: 'white',
            fontSize: '12px',
            padding: '2px 6px',
            borderRadius: '3px',
            whiteSpace: 'nowrap',
          },
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [ydoc]);

  return (
    <div ref={editorRef} className={className} style={{ height: '100%', width: '100%' }} />
  );
}
