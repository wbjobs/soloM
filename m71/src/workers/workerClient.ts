import { DicomMetadata, DicomImage } from '@/types/dicom';

type WorkerRequest =
  | { type: 'loadWasm' }
  | { type: 'parseMetadataWasm'; data: ArrayBuffer }
  | { type: 'parseMetadataJs'; data: ArrayBuffer }
  | { type: 'parseImage'; data: ArrayBuffer };

type WorkerResponse =
  | { type: 'wasmLoaded'; success: boolean }
  | { type: 'metadataParsed'; metadata: DicomMetadata; mode: 'wasm' | 'js' }
  | { type: 'imageParsed'; image: DicomImage }
  | { type: 'error'; error: string; operation: string };

type RequestCallback = {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
};

export class DicomParserWorker {
  private worker: Worker | null = null;
  private requestId = 0;
  private callbacks = new Map<number, RequestCallback>();
  private wasmLoaded = false;
  private wasmAvailable = false;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    this.worker = new Worker(
      new URL('./dicomParser.worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
      this.handleMessage(e.data);
    });

    this.worker.addEventListener('error', (err) => {
      console.error('DicomParserWorker error:', err);
    });
  }

  private handleMessage(msg: WorkerResponse): void {
    if (msg.type === 'wasmLoaded') {
      this.wasmLoaded = true;
      this.wasmAvailable = msg.success;
      this.resolvePending('wasmLoaded', msg);
      return;
    }

    if (msg.type === 'metadataParsed') {
      this.resolvePending('parseMetadata', msg);
      return;
    }

    if (msg.type === 'imageParsed') {
      this.resolvePending('parseImage', msg);
      return;
    }

    if (msg.type === 'error') {
      this.rejectPending(msg.operation, new Error(msg.error));
      return;
    }
  }

  private resolvePending(type: string, value: any): void {
    const id = this.findRequestId(type);
    if (id !== -1) {
      const cb = this.callbacks.get(id);
      this.callbacks.delete(id);
      cb?.resolve(value);
    }
  }

  private rejectPending(type: string, error: Error): void {
    const id = this.findRequestId(type);
    if (id !== -1) {
      const cb = this.callbacks.get(id);
      this.callbacks.delete(id);
      cb?.reject(error);
    }
  }

  private findRequestId(type: string): number {
    for (const [id] of this.callbacks) {
      if (String(id).startsWith(type)) {
        return id;
      }
    }
    return -1;
  }

  private postMessage<T>(msg: WorkerRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Worker not initialized'));
        return;
      }

      const id = ++this.requestId;
      this.callbacks.set(id, { resolve, reject });

      const { data, ...rest } = msg as any;
      if (data instanceof ArrayBuffer) {
        this.worker.postMessage(msg, [data]);
      } else {
        this.worker.postMessage(msg);
      }
    });
  }

  async loadWasm(): Promise<boolean> {
    if (this.wasmLoaded) {
      return this.wasmAvailable;
    }
    const result = await this.postMessage<{ type: 'wasmLoaded'; success: boolean }>({ type: 'loadWasm' });
    return result.success;
  }

  async parseMetadataWasm(data: ArrayBuffer): Promise<{ metadata: DicomMetadata; mode: 'wasm' }> {
    const result = await this.postMessage<{ type: 'metadataParsed'; metadata: DicomMetadata; mode: 'wasm' }>({
      type: 'parseMetadataWasm',
      data,
    });
    return { metadata: result.metadata, mode: 'wasm' };
  }

  async parseMetadataJs(data: ArrayBuffer): Promise<{ metadata: DicomMetadata; mode: 'js' }> {
    const result = await this.postMessage<{ type: 'metadataParsed'; metadata: DicomMetadata; mode: 'js' }>({
      type: 'parseMetadataJs',
      data,
    });
    return { metadata: result.metadata, mode: 'js' };
  }

  async parseImage(data: ArrayBuffer): Promise<DicomImage> {
    const result = await this.postMessage<{ type: 'imageParsed'; image: DicomImage }>({
      type: 'parseImage',
      data,
    });
    return result.image;
  }

  getWasmAvailable(): boolean {
    return this.wasmAvailable;
  }

  terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

let workerInstance: DicomParserWorker | null = null;

export function getDicomParserWorker(): DicomParserWorker {
  if (!workerInstance) {
    workerInstance = new DicomParserWorker();
  }
  return workerInstance;
}

export function terminateDicomParserWorker(): void {
  workerInstance?.terminate();
  workerInstance = null;
}
