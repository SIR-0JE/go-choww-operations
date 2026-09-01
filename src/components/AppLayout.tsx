'use client';

import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Menu } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#090e17] text-slate-100 flex">
      {/* Persistent Desktop / Drawer Mobile Sidebar */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area (offset on desktop by sidebar width 64/256px) */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Mobile Header Bar with Hamburger */}
        <div className="lg:hidden bg-[#0d1522] border-b border-[#1b273b] px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-2 rounded-lg bg-[#142033] border border-[#213049] text-slate-300 hover:text-white"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="font-extrabold text-sm text-white flex items-center gap-1.5">
            <span>Go Choww</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 font-bold">
              OPS
            </span>
          </div>
          <div className="w-8" />
        </div>

        {/* Child Pages */}
        <div className="flex-1 flex flex-col">{children}</div>
      </div>
    </div>
  );
};
