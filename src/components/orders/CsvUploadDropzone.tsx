'use client';

import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  CopyCheck,
  CalendarCheck,
  ShieldCheck,
} from 'lucide-react';

interface UploadSummary {
  totalRows: number;
  insertedCount: number;
  skippedDuplicates: number;
  skippedOldDateCount: number;
  skippedStatusCount: number;
  latestDbDate: string | null;
}

interface CsvUploadDropzoneProps {
  onUploadSuccess: () => void;
}

export const CsvUploadDropzone: React.FC<CsvUploadDropzoneProps> = ({ onUploadSuccess }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
    summary?: UploadSummary;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processRows = async (rows: any[], sourceFileName: string) => {
    if (!rows || rows.length === 0) {
      setStatusMessage({ text: 'The uploaded file contains no data rows.', type: 'error' });
      setIsUploading(false);
      return;
    }

    setStatusMessage({
      text: `Processing ${rows.length} records from ${sourceFileName}...`,
      type: 'info',
    });
    setIsUploading(true);

    try {
      const res = await fetch('/api/orders/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: rows }),
      });
      const data = await res.json();

      if (data.success) {
        setStatusMessage({
          text: data.message || `Successfully synced ${data.insertedCount} new orders!`,
          type: 'success',
          summary: data.summary,
        });
        onUploadSuccess();
      } else {
        setStatusMessage({
          text: data.error || 'Failed to ingest records into database.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || 'Network error while uploading orders',
        type: 'error',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleFile = async (file: File) => {
    const lowerName = file.name.toLowerCase();
    setStatusMessage(null);

    // 1. If it's an Excel Workbook (.xlsx / .xls)
    if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      try {
        setIsUploading(true);
        setStatusMessage({ text: `Reading ${file.name}...`, type: 'info' });

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        await processRows(jsonData, file.name);
      } catch (err: any) {
        setStatusMessage({
          text: `Excel Parse Error: ${err?.message || 'Could not read Excel file'}`,
          type: 'error',
        });
        setIsUploading(false);
      }
      return;
    }

    // 2. If it's CSV or text-based sheet (.csv, .tsv, .txt, etc.)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: async (results) => {
        if (results.errors && results.errors.length > 0 && (!results.data || results.data.length === 0)) {
          setStatusMessage({ text: `CSV Parse Warning: ${results.errors[0]?.message}`, type: 'error' });
          setIsUploading(false);
          return;
        }
        await processRows(results.data, file.name);
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
    <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-sm space-y-3.5">
      {/* Clean Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-brand-50 text-brand-600 border border-brand-200/60 shadow-sm">
            <UploadCloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <span>Import Orders</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                .CSV / .XLSX
              </span>
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Upload your daily CSV or Excel sheet to sync live platform orders
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
          accept=".csv,.xlsx,.xls,.tsv,.txt,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
                <RefreshCw className="w-4 h-4 animate-spin" /> Ingesting &amp; Deduplicating...
              </span>
            ) : (
              <span>
                <strong className="text-brand-600 underline">Click to upload</strong> or drag &amp; drop your spreadsheet here
              </span>
            )}
          </p>
          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
            Supports .csv and .xlsx files • Automatic deduplication
          </p>
        </div>
      </div>

      {/* Detailed Ingestion Summary Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs transition-all space-y-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-extrabold text-xs text-slate-900">
                  {statusMessage.text}
                </p>
              </div>
            </div>

            <button
              onClick={() => setStatusMessage(null)}
              className="text-slate-400 hover:text-slate-700 px-1 py-0.5 text-xs font-bold rounded"
            >
              ✕
            </button>
          </div>

          {/* Breakdown Stat Pills */}
          {statusMessage.summary && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-200/60">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-100/80 text-emerald-900 font-extrabold text-[10px]">
                <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                {statusMessage.summary.insertedCount} Saved
              </span>

              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/90 border border-slate-200 text-slate-700 font-bold text-[10px]">
                <CopyCheck className="w-3 h-3 text-slate-500" />
                {statusMessage.summary.skippedDuplicates} Duplicates Skipped
              </span>

              {statusMessage.summary.skippedOldDateCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-white/90 border border-slate-200 text-slate-700 font-bold text-[10px]">
                  <CalendarCheck className="w-3 h-3 text-slate-500" />
                  {statusMessage.summary.skippedOldDateCount} Older Records Skipped
                </span>
              )}

              {statusMessage.summary.skippedStatusCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-amber-100/70 border border-amber-200 text-amber-900 font-bold text-[10px]">
                  <ShieldCheck className="w-3 h-3 text-amber-700" />
                  {statusMessage.summary.skippedStatusCount} Non-Completed Ignored
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
