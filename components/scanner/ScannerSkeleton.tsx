"use client";

import React from "react";
import { Camera, FileText, Image as ImageIcon, Sliders } from "lucide-react";

export function ScannerSkeleton() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col font-sans">
      {/* Header bar */}
      <header className="h-16 px-4 md:px-6 bg-slate-900/80 backdrop-blur border-b border-slate-800 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Camera className="w-4.5 h-4.5 text-emerald-400 animate-pulse" />
          </div>
          <div>
            <div className="h-4 w-28 bg-slate-800 rounded animate-pulse" />
            <div className="h-2.5 w-20 bg-slate-800/60 rounded mt-1.5 animate-pulse" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Skeleton tabs */}
          <div className="h-9 w-24 bg-slate-800 rounded-lg animate-pulse" />
          <div className="h-9 w-20 bg-slate-800 rounded-lg animate-pulse" />
        </div>
      </header>

      {/* Main viewport */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        {/* Camera stream placeholder */}
        <div className="flex-1 bg-slate-950 flex flex-col items-center justify-center p-4 relative min-h-[300px]">
          {/* Cropping box placeholder */}
          <div className="absolute inset-8 sm:inset-16 md:inset-20 border-2 border-dashed border-emerald-500/30 rounded-2xl flex items-center justify-center">
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

            <div className="text-center p-4">
              <Camera className="w-10 h-10 text-slate-700 mx-auto animate-pulse" />
              <div className="h-3 w-40 bg-slate-900 rounded mx-auto mt-3 animate-pulse" />
            </div>
          </div>

          {/* Shutter button placeholder */}
          <div className="absolute bottom-6 flex items-center gap-6 z-10">
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center cursor-not-allowed">
              <Sliders className="w-4 h-4 text-slate-600" />
            </div>
            <div className="w-18 h-18 rounded-full border-4 border-emerald-500/20 bg-slate-900 flex items-center justify-center p-1 cursor-not-allowed">
              <div className="w-full h-full rounded-full bg-emerald-500/20 animate-pulse" />
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center cursor-not-allowed">
              <ImageIcon className="w-4 h-4 text-slate-600" />
            </div>
          </div>
        </div>

        {/* Sidebar scanned page queue placeholder */}
        <div className="w-full md:w-80 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col flex-shrink-0 h-[220px] md:h-auto overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="h-4 w-28 bg-slate-800 rounded animate-pulse" />
            <div className="h-6 w-12 bg-slate-800 rounded-full animate-pulse" />
          </div>
          <div className="flex-1 p-4 space-y-3 overflow-y-auto">
            {/* Scanned page list item skeletons */}
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2 bg-slate-950/40 border border-slate-800/60 rounded-xl">
                <div className="w-12 h-16 bg-slate-800 rounded-lg flex items-center justify-center shrink-0 animate-pulse">
                  <FileText className="w-5 h-5 text-slate-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="h-3.5 w-24 bg-slate-800 rounded animate-pulse" />
                  <div className="h-2.5 w-16 bg-slate-800/60 rounded mt-2 animate-pulse" />
                </div>
                <div className="w-7 h-7 bg-slate-800 rounded-lg animate-pulse" />
              </div>
            ))}
          </div>
          <div className="p-4 border-t border-slate-800 bg-slate-900/50">
            <div className="h-11 w-full bg-slate-800 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}
