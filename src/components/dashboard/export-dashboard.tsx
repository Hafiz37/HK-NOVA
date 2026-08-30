"use client";

import { useState, useRef, useEffect } from "react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Download, Image, FileText, X, Check } from "lucide-react";

interface ExportDashboardProps {
  triggerRef: React.RefObject<HTMLDivElement | null>;
  title?: string;
  filename?: string;
}

export default function ExportDashboard({ triggerRef, title = "HK-NOVA Dashboard", filename = "hk-nova-dashboard" }: ExportDashboardProps) {
  const [exporting, setExporting] = useState<'idle' | 'image' | 'pdf' | 'success'>('idle');
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const captureAndExport = async (format: 'image' | 'pdf') => {
    if (!triggerRef.current) return;

    setExporting(format);
    const element = triggerRef.current;

    try {
      // Capture the element
      const canvas = await html2canvas(element, {
        scale: 2, // High DPI
        useCORS: true,
        logging: false,
        backgroundColor: '#020617', // slate-950
        onclone: (clonedDoc) => {
          // Remove any UI elements that shouldn't be in export
          const exportOnly = clonedDoc.querySelectorAll('[data-export-hide]');
          exportOnly.forEach((el) => (el as HTMLElement).style.display = 'none');
        },
      });

      if (format === 'image') {
        // Download as PNG
        const link = document.createElement('a');
        link.download = `${filename}-${new Date().toISOString().split('T')[0]}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } else {
        // Download as PDF
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
          orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
          unit: 'px',
          format: [canvas.width, canvas.height],
        });

        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        pdf.save(`${filename}-${new Date().toISOString().split('T')[0]}.pdf`);
      }

      setExporting('success');
      setTimeout(() => setExporting('idle'), 2000);
    } catch (error) {
      console.error('Export failed:', error);
      setExporting('idle');
      alert('Export failed. Please try again.');
    } finally {
      setIsOpen(false);
    }
  };

  const toggleDropdown = () => setIsOpen(prev => !prev);

  return (
    <div className="relative inline-block">
      <div ref={triggerRef} className="inline-block">
        <button
          onClick={toggleDropdown}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full right-0 mb-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-2 z-50 animate-in fade-in-0 duration-150"
        >
        <div className="px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800">
          Export {title}
        </div>

        <button
          onClick={() => captureAndExport('image')}
          disabled={exporting !== 'idle'}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors ${exporting === 'image' ? 'bg-slate-800' : ''}`}
        >
          <Image className="w-4 h-4" />
          <span>PNG Image</span>
          {exporting === 'image' && <span className="ml-auto text-xs text-blue-400">Generating...</span>}
          {exporting === 'success' && <Check className="ml-auto w-4 h-4 text-emerald-400" />}
        </button>

        <button
          onClick={() => captureAndExport('pdf')}
          disabled={exporting !== 'idle'}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors ${exporting === 'pdf' ? 'bg-slate-800' : ''}`}
        >
          <FileText className="w-4 h-4" />
          <span>PDF Document</span>
          {exporting === 'pdf' && <span className="ml-auto text-xs text-blue-400">Generating...</span>}
          {exporting === 'success' && <Check className="ml-auto w-4 h-4 text-emerald-400" />}
        </button>

        <div className="border-t border-slate-800 pt-2">
          <button
            onClick={() => { setExporting('idle'); setIsOpen(false); }}
            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
        </div>
      </div>
      )}
    </div>
  );
}