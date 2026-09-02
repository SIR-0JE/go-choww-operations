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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Persistent Desktop / Drawer Mobile Sidebar */}
      <Sidebar
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Mobile Header Bar with Hamburger */}
        <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
          <button
            onClick={() => setIsMobileSidebarOpen(true)}
            className="p-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900"
            aria-label="Open Navigation Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="font-extrabold text-sm text-slate-900 flex items-center gap-1.5">
            <span>Go Choww</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-600 font-bold border border-brand-200">
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
