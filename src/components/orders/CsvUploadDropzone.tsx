'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, X } from 'lucide-react';

interface CsvUploadDropzoneProps {
  onUploadSuccess: () => void;
}

export const CsvUploadDropzone: React.FC<CsvUploadDropzoneProps> = ({ onUploadSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.csv') && !file.type.includes('csv') && !file.type.includes('excel')) {
      setStatusMessage({ text: 'Please select a valid CSV file (.csv).', type: 'error' });
      return;
    }

    setFileName(file.name);
    setStatusMessage({ text: 'Parsing CSV spreadsheet...', type: 'info' });

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        if (!results.data || results.data.length === 0) {
          setStatusMessage({ text: 'The CSV file appears to be empty.', type: 'error' });
          return;
        }

        setParsedRows(results.data);
        setStatusMessage({
          text: `Parsed ${results.data.length} rows. Uploading to database...`,
          type: 'info',
        });

        // Ingest into /api/orders/upload
        setIsUploading(true);
        try {
          const res = await fetch('/api/orders/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orders: results.data }),
          });
          const data = await res.json();

          if (data.success) {
            setStatusMessage({
              text: data.message || `Successfully ingested ${data.totalProcessed} orders!`,
              type: 'success',
            });
            onUploadSuccess();
          } else {
            setStatusMessage({
              text: data.error || 'Failed to ingest CSV records',
              type: 'error',
            });
          }
        } catch (err: any) {
          setStatusMessage({
            text: err?.message || 'Network error while uploading CSV',
            type: 'error',
          });
        } finally {
          setIsUploading(false);
        }
      },
      error: (error) => {
        setStatusMessage({ text: `CSV Parse Error: ${error.message}`, type: 'error' });
        setIsUploading(false);
      },
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm space-y-3">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-brand-50 text-brand-600 border border-brand-200/60 shadow-sm">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <span>CSV Data Pipeline (Excel Ingestion)</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Deduplication Guard
              </span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Upload running Excel sheets with columns: <code className="text-slate-700 font-bold bg-slate-100 px-1 py-0.5 rounded">Date, Order Number, Customer Name, Cafeteria, Delivery Address, Food Total, Delivery Fee, Total Amount Paid, Delivery Type, Order Status</code>
            </p>
          </div>
        </div>
      </div>

      {/* Dropzone Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
          isDragging
            ? 'border-brand-500 bg-brand-50/50 scale-[0.99]'
            : 'border-slate-200 hover:border-brand-400 hover:bg-slate-50/70'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 group-hover:text-brand-600 transition-colors">
          <FileSpreadsheet className="w-5 h-5 text-brand-600" />
        </div>

        <div>
          <p className="text-xs font-bold text-slate-900">
            {isUploading ? (
              <span className="flex items-center justify-center gap-2 text-brand-600">
                <RefreshCw className="w-4 h-4 animate-spin" /> Ingesting &amp; Deduplicating Orders...
              </span>
            ) : (
              <span>
                <strong className="text-brand-600 underline">Click to upload</strong> or drag &amp; drop your CSV here
              </span>
            )}
          </p>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Auto-converts DD/MM/YYYY dates and skips duplicates based on Order Number
          </p>
        </div>
      </div>

      {/* Status Feedback Pill */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between transition-all ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-brand-600 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-700 px-1 py-0.5 text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
