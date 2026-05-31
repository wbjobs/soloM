/// <reference types="vite/client" />

declare module 'y-monaco' {
  import * as Y from 'yjs';
  import * as monaco from 'monaco-editor';

  export class MonacoBinding {
    constructor(
      ytext: Y.Text,
      model: monaco.editor.ITextModel,
      editors: Set<monaco.editor.IStandaloneCodeEditor>,
      awareness?: any
    );
    destroy(): void;
  }
}
