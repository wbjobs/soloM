import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Cpu, Zap, Loader2, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import Header from '@/components/Header';
import ImageCanvas from '@/components/ImageCanvas';
import MetadataPanel from '@/components/MetadataPanel';
import WindowControl from '@/components/WindowControl';
import BrightnessContrastControl from '@/components/BrightnessContrastControl';
import { useAppStore } from '@/stores/appStore';
import { getDicomParserWorker } from '@/workers/workerClient';
import { DicomMetadata, DicomImage } from '@/types/dicom';
import { cn } from '@/lib/utils';
import { getWebSocketClient } from '@/lib/websocketClient';

type ParseStage = 'fetching' | 'parsing' | 'rendering' | 'complete' | 'error';

export default function Viewer() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();
  const setLoading = useAppStore((s) => s.setLoading);
  const setError = useAppStore((s) => s.setError);
  const setMetadata = useAppStore((s) => s.setMetadata);
  const setImage = useAppStore((s) => s.setImage);
  const setSelectedFile = useAppStore((s) => s.setSelectedFile);
  const setWasmAvailable = useAppStore((s) => s.setWasmAvailable);
  const resetViewer = useAppStore((s) => s.resetViewer);
  const setAdjustments = useAppStore((s) => s.setAdjustments);
  const metadata = useAppStore((s) => s.metadata);
  const loading = useAppStore((s) => s.loading);
  const useWasm = useAppStore((s) => s.useWasm);
  const wasmAvailable = useAppStore((s) => s.wasmAvailable);
  const files = useAppStore((s) => s.files);
  const brightness = useAppStore((s) => s.brightness);
  const contrast = useAppStore((s) => s.contrast);
  const windowCenter = useAppStore((s) => s.windowCenter);
  const windowWidth = useAppStore((s) => s.windowWidth);
  
  const [parserUsed, setParserUsed] = useState<'wasm' | 'js' | null>(null);
  const [parseStage, setParseStage] = useState<ParseStage>('fetching');
  const [parseProgress, setParseProgress] = useState(0);
  const [fileSize, setFileSize] = useState(0);
  const [wsConnected, setWsConnected] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);

  const handleBack = useCallback(() => {
    abortControllerRef.current?.abort();
    navigate('/');
  }, [navigate]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const syncAdjustments = useCallback(() => {
    if (!fileId || fileId === 'demo' || isSyncingRef.current) return;

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = window.setTimeout(() => {
      const wsClient = getWebSocketClient();
      wsClient.sendAdjustment(fileId, {
        brightness,
        contrast,
        windowCenter,
        windowWidth,
        zoom: 1,
        panX: 0,
        panY: 0,
      });
      isSyncingRef.current = false;
    }, 100);
    isSyncingRef.current = true;
  }, [fileId, brightness, contrast, windowCenter, windowWidth]);

  useEffect(() => {
    if (parseStage === 'complete') {
      syncAdjustments();
    }
  }, [brightness, contrast, windowCenter, windowWidth, parseStage, syncAdjustments]);

  useEffect(() => {
    const worker = getDicomParserWorker();
    let mounted = true;

    const loadFile = async () => {
      if (!fileId || fileId === 'demo') {
        setError('Please select a file from the management page');
        setParseStage('error');
        return;
      }

      setLoading(true);
      setError(null);
      setParserUsed(null);
      setParseStage('fetching');
      setParseProgress(0);

      try {
        const selectedFile = files.find((f) => f.id === fileId) || null;
        if (selectedFile) {
          setSelectedFile(selectedFile);
          setFileSize(selectedFile.size);
        }

        abortControllerRef.current = new AbortController();

        const response = await fetch(`/api/files/${fileId}`, {
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        const reader = response.body?.getReader();

        if (!reader) {
          const buffer = await response.arrayBuffer();
          setFileSize(buffer.byteLength);
          await processBuffer(buffer);
          return;
        }

        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            if (total > 0) {
              setParseProgress(Math.min(90, Math.round((received / total) * 90)));
            }
          }
        }

        const buffer = new ArrayBuffer(received);
        const view = new Uint8Array(buffer);
        let offset = 0;
        for (const chunk of chunks) {
          view.set(chunk, offset);
          offset += chunk.length;
        }

        setFileSize(received);
        setParseProgress(90);
        await processBuffer(buffer);

      } catch (err) {
        if (mounted && !(err instanceof Error && err.name === 'AbortError')) {
          setError(err instanceof Error ? err.message : 'Failed to load file');
          setParseStage('error');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    const processBuffer = async (buffer: ArrayBuffer) => {
      if (!mounted) return;
      
      setParseStage('parsing');
      setParseProgress(92);

      let parsedMetadata: DicomMetadata | null = null;
      let usedMode: 'wasm' | 'js' = 'js';

      try {
        if (useWasm) {
          const wasmReady = await worker.loadWasm();
          setWasmAvailable(wasmReady);
          
          if (wasmReady) {
            try {
              const wasmBuffer = buffer.slice(0);
              const result = await worker.parseMetadataWasm(wasmBuffer);
              parsedMetadata = result.metadata;
              usedMode = 'wasm';
            } catch {
              parsedMetadata = null;
            }
          }
        }

        if (!parsedMetadata) {
          const jsBuffer = buffer.slice(0);
          const result = await worker.parseMetadataJs(jsBuffer);
          parsedMetadata = result.metadata;
          usedMode = 'js';
        }

        if (mounted) {
          setParserUsed(usedMode);
          setMetadata(parsedMetadata);
          setParseProgress(95);
        }

        setParseStage('rendering');
        const imageBuffer = buffer.slice(0);
        const image = await worker.parseImage(imageBuffer) as DicomImage;
        
        if (mounted) {
          setImage(image);
          setParseProgress(100);
          setParseStage('complete');
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to parse DICOM file');
          setParseStage('error');
        }
      }
    };

    loadFile();

    return () => {
      mounted = false;
      abortControllerRef.current?.abort();
      resetViewer();
    };
  }, [fileId, useWasm, files, setLoading, setError, setMetadata, setImage, setSelectedFile, setWasmAvailable, resetViewer]);

  useEffect(() => {
    if (!fileId || fileId === 'demo') return;

    const wsClient = getWebSocketClient();

    const checkConnection = () => {
      setWsConnected(wsClient.isConnected());
    };

    const unsubParams = wsClient.onParamsLoaded((params) => {
      if (params.fileId === fileId) {
        setAdjustments(
          params.brightness ?? 0,
          params.contrast ?? 1,
          params.windowCenter ?? 0,
          params.windowWidth ?? 0
        );
      }
    });

    const unsubSync = wsClient.onAdjustmentSync((params) => {
      if (params.fileId === fileId) {
        setAdjustments(
          params.brightness,
          params.contrast,
          params.windowCenter,
          params.windowWidth
        );
      }
    });

    const unsubReset = wsClient.onParamsReset((resetFileId) => {
      if (resetFileId === fileId) {
        setAdjustments(0, 1, windowCenter, windowWidth);
      }
    });

    wsClient.subscribe(fileId);

    const interval = setInterval(checkConnection, 1000);

    return () => {
      clearInterval(interval);
      wsClient.unsubscribe(fileId);
      unsubParams();
      unsubSync();
      unsubReset();
    };
  }, [fileId, setAdjustments, windowCenter, windowWidth]);

  const handleResetParams = useCallback(() => {
    if (!fileId || fileId === 'demo') return;
    const wsClient = getWebSocketClient();
    wsClient.resetParams(fileId);
  }, [fileId]);

  const getStageText = (): string => {
    switch (parseStage) {
      case 'fetching': return '下载文件中...';
      case 'parsing': return '解析 DICOM 元数据...';
      case 'rendering': return '渲染影像数据...';
      case 'complete': return '完成';
      case 'error': return '错误';
      default: return '处理中...';
    }
  };

  const getStageColor = (): string => {
    switch (parseStage) {
      case 'error': return 'text-red-400';
      case 'complete': return 'text-green-400';
      default: return 'text-blue-400';
    }
  };

  const showLoadingOverlay = loading || (parseStage !== 'complete' && parseStage !== 'error');

  return (
    <div className="min-h-screen bg-[#0a1628] flex flex-col">
      <Header />

      <div className="flex items-center gap-4 px-4 sm:px-6 lg:px-8 py-4 border-b border-slate-700/50">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-all duration-200"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>返回</span>
        </button>

        <div className="flex-1">
          <h1 className="text-xl font-semibold text-white">影像查看器</h1>
        </div>

        <div className="flex items-center gap-2">
          {wsConnected ? (
            <div className="flex items-center gap-1 text-green-400">
              <Wifi className="w-4 h-4" />
              <span className="text-xs">已同步</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-slate-500">
              <WifiOff className="w-4 h-4" />
              <span className="text-xs">未连接</span>
            </div>
          )}
        </div>

        {fileSize > 0 && (
          <div className="text-sm text-slate-400 font-mono">
            {formatFileSize(fileSize)}
          </div>
        )}

        {parserUsed && (
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium',
            parserUsed === 'wasm'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
              : 'bg-slate-700 text-slate-300 border border-slate-600'
          )}>
            {parserUsed === 'wasm' ? (
              <>
                <Zap className="w-4 h-4" />
                <span>WASM</span>
              </>
            ) : (
              <>
                <Cpu className="w-4 h-4" />
                <span>JS</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="hidden lg:block m-4 space-y-4">
          <MetadataPanel />
          <BrightnessContrastControl onReset={handleResetParams} />
        </div>

        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden relative">
          {showLoadingOverlay && (
            <div className="absolute inset-0 z-20 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center rounded-lg">
              <div className="w-full max-w-md p-8">
                <div className="flex flex-col items-center gap-6">
                  <div className="relative">
                    <Loader2 className={cn('w-16 h-16 animate-spin', getStageColor())} />
                    {fileSize > 50 * 1024 * 1024 && (
                      <div className="absolute -top-2 -right-2 bg-amber-500/20 text-amber-400 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        <span>大文件</span>
                      </div>
                    )}
                  </div>

                  <div className="w-full space-y-3">
                    <div className="flex justify-between items-center">
                      <span className={cn('text-sm font-medium', getStageColor())}>
                        {getStageText()}
                      </span>
                      <span className="text-sm text-slate-400 font-mono">
                        {parseProgress}%
                      </span>
                    </div>

                    <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full transition-all duration-500 ease-out rounded-full',
                          parseStage === 'error'
                            ? 'bg-red-500'
                            : 'bg-gradient-to-r from-blue-500 to-cyan-400'
                        )}
                        style={{ width: `${parseProgress}%` }}
                      />
                    </div>

                    <div className="flex justify-between items-center text-xs text-slate-500">
                      <span>Worker 线程处理中</span>
                      <span className="font-mono">
                        {parseStage === 'fetching' ? '网络I/O' : 
                         parseStage === 'parsing' ? 'CPU 计算' :
                         parseStage === 'rendering' ? '像素处理' : ''}
                      </span>
                    </div>
                  </div>

                  {fileSize > 50 * 1024 * 1024 && (
                    <p className="text-xs text-slate-500 text-center max-w-xs">
                      大型 DICOM 文件正在后台线程解析，主线程保持响应。解析完成后将自动显示。
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 relative overflow-hidden">
            <ImageCanvas />

            {metadata && !showLoadingOverlay && (
              <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg px-4 py-2">
                <p className="text-sm text-slate-300">
                  <span className="text-slate-500">患者:</span>{' '}
                  <span className="text-white font-medium">{metadata.patientName || '未知'}</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  <span className="text-slate-500">日期:</span>{' '}
                  <span className="font-mono">{metadata.studyDate || 'N/A'}</span>
                </p>
              </div>
            )}

            {wasmAvailable && !showLoadingOverlay && (
              <div className="absolute top-4 right-4 text-xs text-slate-500">
                解析器: {useWasm ? 'WASM (快速)' : 'JavaScript'}
              </div>
            )}
          </div>

          <WindowControl />
        </div>
      </div>
    </div>
  );
}
