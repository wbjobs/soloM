declare module 'y-protocols/sync' {
  import * as Y from 'yjs';
  import * as encoding from 'lib0/encoding';
  import * as decoding from 'lib0/decoding';

  export const writeSyncStep1: (encoder: encoding.Encoder, doc: Y.Doc) => void;
  export const writeSyncStep2: (encoder: encoding.Encoder, doc: Y.Doc, encodedStateVector: Uint8Array) => void;
  export const readSyncStep2: (decoder: decoding.Decoder, doc: Y.Doc, transactionOrigin: any) => void;
  export const readSyncStep1: (decoder: decoding.Decoder, encoder: encoding.Encoder, doc: Y.Doc) => void;
}

declare module 'y-protocols/awareness' {
  import * as Y from 'yjs';
  import * as encoding from 'lib0/encoding';
  import * as decoding from 'lib0/decoding';

  export interface Awareness {
    constructor(doc: Y.Doc): void;
    getLocalState(): any;
    setLocalState(state: any): void;
    getStates(): Map<number, any>;
    states: Map<number, any>;
    on(event: 'change', handler: (changes: { added: number[], updated: number[], removed: number[] }, origin: any) => void): void;
    off(event: 'change', handler: Function): void;
    destroy(): void;
  }

  export const Awareness: {
    new (doc: Y.Doc): Awareness;
  };

  export const encodeAwarenessUpdate: (awareness: Awareness, clients: Array<number>, states?: any) => Uint8Array;
  export const applyAwarenessUpdate: (awareness: Awareness, update: Uint8Array, origin: any) => void;
}

declare module 'y-protocols' {
  export * as sync from 'y-protocols/sync';
  export * as awareness from 'y-protocols/awareness';
}
