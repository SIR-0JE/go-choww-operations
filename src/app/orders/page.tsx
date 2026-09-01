'use client';

import React from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { OrdersTable } from '@/components/orders/OrdersTable';
import { Package, ShieldCheck } from 'lucide-react';

export default function AllOrdersPage() {
  return (
    <AppLayout>
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-2.5">
            <Package className="w-7 h-7 text-brand-500" />
            All Delivery Orders Ledger
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            Complete operational ledger of all campus delivery runs, customer destinations, cafeterias, and rider payouts
          </p>
        </div>

        {/* Orders Table */}
        <section aria-label="All Orders Table">
          <OrdersTable />
        </section>
      </main>
    </AppLayout>
  );
}
