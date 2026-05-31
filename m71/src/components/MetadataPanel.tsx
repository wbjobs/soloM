import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Info } from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { cn } from '@/lib/utils';

export default function MetadataPanel() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const metadata = useAppStore((s) => s.metadata);

  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  const metadataFields = [
    { key: 'patientName', label: 'Patient Name' },
    { key: 'patientId', label: 'Patient ID' },
    { key: 'studyDate', label: 'Study Date' },
    { key: 'studyDescription', label: 'Study Description' },
    { key: 'seriesDescription', label: 'Series Description' },
    { key: 'modality', label: 'Modality' },
    { key: 'sliceThickness', label: 'Slice Thickness' },
    { key: 'pixelSpacing', label: 'Pixel Spacing' },
    { key: 'rows', label: 'Rows' },
    { key: 'columns', label: 'Columns' },
    { key: 'bitsAllocated', label: 'Bits Allocated' },
    { key: 'bitsStored', label: 'Bits Stored' },
    { key: 'windowCenter', label: 'Window Center' },
    { key: 'windowWidth', label: 'Window Width' },
    { key: 'rescaleIntercept', label: 'Rescale Intercept' },
    { key: 'rescaleSlope', label: 'Rescale Slope' },
    { key: 'photometricInterpretation', label: 'Photometric Interpretation' },
    { key: 'pixelDataOffset', label: 'Pixel Data Offset' },
    { key: 'pixelDataLength', label: 'Pixel Data Length' },
  ];

  const formatValue = (key: string, value: string | number): string => {
    if (value === null || value === undefined || value === '') return 'N/A';
    if (typeof value === 'number') return value.toString();
    return value;
  };

  return (
    <div
      className={cn(
        'relative bg-slate-800/90 backdrop-blur border border-slate-700 rounded-lg transition-all duration-300',
        isCollapsed ? 'w-12' : 'w-80'
      )}
    >
      <button
        onClick={toggleCollapse}
        className="absolute -left-3 top-4 z-10 p-1 bg-slate-700 border border-slate-600 rounded-full text-slate-300 hover:text-white hover:bg-slate-600 transition-all"
      >
        {isCollapsed ? (
          <ChevronLeft className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>

      {isCollapsed ? (
        <div className="flex items-center justify-center h-full py-4">
          <Info className="w-6 h-6 text-slate-400" />
        </div>
      ) : (
        <div className="h-full flex flex-col">
          <div className="flex items-center gap-2 p-4 border-b border-slate-700">
            <Info className="w-5 h-5 text-cyan-400 flex-shrink-0" />
            <h3 className="text-white font-medium">DICOM Metadata</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {metadata ? (
              <table className="w-full text-sm">
                <tbody>
                  {metadataFields.map((field) => (
                    <tr key={field.key} className="border-b border-slate-700/50 last:border-0">
                      <td className="py-2 pr-3 text-slate-400 align-top">{field.label}</td>
                      <td className="py-2 text-slate-200 font-mono align-top">
                        {formatValue(field.key, metadata[field.key as keyof typeof metadata])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-8">
                <Info className="w-10 h-10 text-slate-600 mb-2" />
                <p className="text-slate-500 text-sm">No metadata loaded</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
