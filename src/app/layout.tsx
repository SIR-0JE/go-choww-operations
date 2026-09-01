import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Go Choww Operations & Debt Recovery SaaS",
  description: "Centralized logistics dashboard, real-time revenue tracking, rider payout calculation, and ₦3,500,000 debt recovery sprint monitoring.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090e17] text-slate-100 antialiased selection:bg-brand-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
