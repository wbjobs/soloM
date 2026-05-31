/// <reference types="vite/client" />

declare module '@/wasm/dicom_parser.js' {
  export default function DicomParserWasm(): Promise<any>;
}

declare module 'cornerstone-core' {
  const cornerstone: any;
  export default cornerstone;
  export = cornerstone;
}

declare module 'cornerstone-wado-image-loader' {
  const loader: any;
  export default loader;
}
