'use client';

import React, { useState, createContext, useContext } from 'react';
import { Sidebar } from './Sidebar';

interface SidebarContextType {
  openSidebar: () => void;
  closeSidebar: () => void;
  isMobileOpen: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  openSidebar: () => {},
  closeSidebar: () => {},
  isMobileOpen: false,
});

export const useSidebar = () => useContext(SidebarContext);

interface AppLayoutProps {
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children }) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <SidebarContext.Provider
      value={{
        openSidebar: () => setIsMobileOpen(true),
        closeSidebar: () => setIsMobileOpen(false),
        isMobileOpen,
      }}
    >
      <div className="min-h-screen bg-slate-50/70 text-slate-900 flex">
        {/* Desktop & Mobile Drawer Sidebar */}
        <Sidebar
          isMobileOpen={isMobileOpen}
          onCloseMobile={() => setIsMobileOpen(false)}
        />

        {/* Main Content Area */}
        <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
          {children}
        </div>
      </div>
    </SidebarContext.Provider>
  );
};
