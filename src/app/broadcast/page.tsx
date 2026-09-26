'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Calendar,
  Phone,
  Mail,
  Send,
  MessageSquare,
  Sparkles,
  Download,
  Copy,
  CheckCircle2,
  Users,
  Store,
  FileSpreadsheet,
  ShoppingBag,
  RefreshCw,
  X,
  QrCode,
  Smartphone,
  Check,
  Pause,
  Play,
  Square,
  AlertCircle,
  Unlink,
  Wifi,
  WifiOff,
  Flame,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { Header } from '@/components/Header';
import { CustomerAudienceMember, BroadcastCustomersResponse } from '../api/broadcast/customers/route';

// Pre-configured marketing offer templates
const CAMPAIGN_PRESETS = [
  {
    id: 'lunch_rush',
    title: '🍔 Lunch Rush Free Delivery',
    tag: 'Lunch Promo',
    subject: 'Hungry? 🍔 Enjoy Free Delivery on GoChow Today!',
    whatsapp: `Hey {{name}}! 👋 Hungry for lunch? Order your favorite meal from {{cafeteria}} on GoChow right now and get *FREE delivery* on your order! 🍔🍟\n\n🛵 Tap here to order: https://gochoww.com\n_Offer valid today only!_`,
    email: `Hi {{name}},\n\nCraving something delicious for lunch?\n\nBeat the queue today! Order your favorite meal from {{cafeteria}} on GoChow and enjoy FREE fast delivery right to your doorstep.\n\n👉 Order now at https://gochoww.com\n\nBest regards,\nThe GoChow Campus Team`,
  },
  {
    id: 'comeback_30d',
    title: '🌟 30-Day Customer Special Offer',
    tag: 'Re-engagement',
    subject: 'Special ₦200 Voucher for You at GoChow! 🎁',
    whatsapp: `Hi {{name}}! 🌟 We loved serving you at GoChow! Here's a special *₦200 discount* on your next campus order from {{cafeteria}}.\n\nUse code: *CAMPUS200* at checkout on https://gochoww.com 🛵🍔\n\nTreat yourself today!`,
    email: `Hello {{name}},\n\nWe appreciate you being part of the GoChow family!\n\nAs a thank you for ordering with us, here is an exclusive ₦200 discount coupon for your next meal from {{cafeteria}}.\n\nPromo Code: CAMPUS200\nOrder link: https://gochoww.com\n\nEnjoy your meal,\nGoChow Operations`,
  },
  {
    id: 'vip_loyalty',
    title: '👑 VIP Loyalty Reward (Frequent Customers)',
    tag: 'Loyalty VIP',
    subject: 'You are a GoChow VIP! 👑 Here is your exclusive perk',
    whatsapp: `Hello {{name}}! 👑 You've placed {{orders}} orders with GoChow, making you one of our top VIP campus foodies!\n\nTo say thank you, your next delivery from {{cafeteria}} comes with priority dispatch & 15% off. Use code *VIPFOODIE*!\n\nOrder here: https://gochoww.com 🚀`,
    email: `Dear {{name}},\n\nThank you for trusting GoChow for your daily meals! With {{orders}} orders completed, you are officially in our VIP Circle.\n\nEnjoy 15% off and priority express delivery on your next order with coupon code: VIPFOODIE.\n\nVisit: https://gochoww.com\n\nCheers,\nGoChow Team`,
  },
  {
    id: 'weekend_treat',
    title: '🎉 Weekend Snack & Feast Special',
    tag: 'Weekend Special',
    subject: 'Relax this weekend! Delicious food delivered to you 🎉',
    whatsapp: `Happy Weekend {{name}}! 🎉 Don't stress about cooking or walking in the heat. Order tasty food from {{cafeteria}} and relax in your room while our riders deliver it hot & fresh! 🛵🍲\n\nOrder now: https://gochoww.com`,
    email: `Hi {{name}},\n\nIt's the weekend! Time to relax and recharge. Let GoChow handle your meals today from {{cafeteria}}.\n\nOrder easily at https://gochoww.com and we'll deliver it straight to you.\n\nHave a great weekend!`,
  },
];

export default function BroadcastMarketingPage() {
  // ── Audience State ──────────────────────────────────────────────────────────
  const [customers, setCustomers] = useState<CustomerAudienceMember[]>([]);
  const [metrics, setMetrics] = useState<BroadcastCustomersResponse['metrics']>({
    totalCustomers: 0,
    totalPhones: 0,
    totalEmails: 0,
    totalOrdersInPeriod: 0,
    totalSpentInPeriod: 0,
    activeTimeframeLabel: 'Last 30 Days',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Filter State ────────────────────────────────────────────────────────────
  const [timeframe, setTimeframe] = useState<'7' | '30' | '60' | 'all' | 'custom'>('30');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedCafeteria, setSelectedCafeteria] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Selected Customers for Broadcast ─────────────────────────────────────────
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());

  // ── Composer & Template State ───────────────────────────────────────────────
  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('lunch_rush');
  const [customWhatsappMsg, setCustomWhatsappMsg] = useState(CAMPAIGN_PRESETS[0].whatsapp);
  const [customEmailSubject, setCustomEmailSubject] = useState(CAMPAIGN_PRESETS[0].subject);
  const [customEmailBody, setCustomEmailBody] = useState(CAMPAIGN_PRESETS[0].email);

  // ── WhatsApp Device Linking State ───────────────────────────────────────────
  const [waConnection, setWaConnection] = useState<{
    status: 'disconnected' | 'connecting' | 'qr_ready' | 'connected' | 'error';
    qrCodeDataUrl: string | null;
    pairingCode: string | null;
    user: { id?: string; name?: string; phone?: string } | null;
    lastError: string | null;
  }>({
    status: 'disconnected',
    qrCodeDataUrl: null,
    pairingCode: null,
    user: null,
    lastError: null,
  });
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isConnectingWa, setIsConnectingWa] = useState(false);
  const [linkTab, setLinkTab] = useState<'qr' | 'pairing'>('qr');
  const [pairingPhoneInput, setPairingPhoneInput] = useState('');
  const [isRequestingPairing, setIsRequestingPairing] = useState(false);

  // ── Automated Background Broadcast Queue State ──────────────────────────────
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastQueue, setBroadcastQueue] = useState<{
    campaignId: string;
    status: 'idle' | 'running' | 'paused' | 'completed' | 'stopped' | 'error';
    total: number;
    sent: number;
    failed: number;
    currentIndex: number;
    currentContact: { name: string; phone: string } | null;
    logs: Array<{
      id: string;
      timestamp: string;
      name: string;
      phone: string;
      status: 'success' | 'failed';
      error?: string;
    }>;
  }>({
    campaignId: '',
    status: 'idle',
    total: 0,
    sent: 0,
    failed: 0,
    currentIndex: 0,
    currentContact: null,
    logs: [],
  });

  // ── Toast Notifications ─────────────────────────────────────────────────────
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // ── Manual Step-by-Step WhatsApp Queue Modal ────────────────────────────────
  const [queueModalOpen, setQueueModalOpen] = useState(false);
  const [queueIndex, setQueueIndex] = useState(0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ── Fetch Customers from API ────────────────────────────────────────────────
  const fetchAudience = useCallback(async (showLoadingSpinner = true) => {
    if (showLoadingSpinner) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const params = new URLSearchParams();
      if (timeframe === 'custom') {
        if (customStartDate) params.set('startDate', customStartDate);
        if (customEndDate) params.set('endDate', customEndDate);
      } else if (timeframe === 'all') {
        params.set('days', '0');
      } else {
        params.set('days', timeframe);
      }

      if (selectedCafeteria !== 'all') {
        params.set('cafeteria', selectedCafeteria);
      }

      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim());
      }

      const res = await fetch(`/api/broadcast/customers?${params.toString()}`);
      const data: BroadcastCustomersResponse = await res.json();

      if (data.success) {
        setCustomers(data.customers || []);
        setMetrics(
          data.metrics || {
            totalCustomers: data.customers.length,
            totalPhones: data.customers.filter((c) => Boolean(c.phone)).length,
            totalEmails: data.customers.filter((c) => Boolean(c.email)).length,
            totalOrdersInPeriod: 0,
            totalSpentInPeriod: 0,
            activeTimeframeLabel: 'Filtered View',
          }
        );
        setSelectedCustomerIds(new Set(data.customers.map((c) => c.id)));
      } else {
        showToast('Could not load audience data.');
      }
    } catch (err: any) {
      console.error('Failed to fetch broadcast audience:', err);
      showToast('Network error while loading audience.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [timeframe, customStartDate, customEndDate, selectedCafeteria, searchQuery]);

  useEffect(() => {
    fetchAudience(true);
  }, [fetchAudience]);

  // ── Fetch & Poll WhatsApp Connection Status ─────────────────────────────────
  const fetchWhatsAppStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/status');
      const data = await res.json();
      if (data.success) {
        setWaConnection({
          status: data.status,
          qrCodeDataUrl: data.qrCodeDataUrl,
          pairingCode: data.pairingCode,
          user: data.user,
          lastError: data.lastError,
        });

        // If newly connected and QR modal is open, close it
        if (data.status === 'connected' && isQrModalOpen) {
          setIsQrModalOpen(false);
          showToast(`✅ WhatsApp Linked: +${data.user?.phone || 'Connected'}`);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch WhatsApp status:', err);
    }
  }, [isQrModalOpen]);

  // Poll WhatsApp status regularly (every 1.5s if QR modal is open, otherwise every 10s)
  useEffect(() => {
    fetchWhatsAppStatus();
    const intervalTime = isQrModalOpen ? 1500 : 10000;
    const timer = setInterval(fetchWhatsAppStatus, intervalTime);
    return () => clearInterval(timer);
  }, [fetchWhatsAppStatus, isQrModalOpen]);

  // ── Poll Broadcast Queue Status ─────────────────────────────────────────────
  const fetchBroadcastProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/broadcast');
      const data = await res.json();
      if (data.success && data.queue) {
        setBroadcastQueue(data.queue);
        if (data.queue.status === 'running') {
          setIsBroadcastModalOpen(true);
        }
      }
    } catch (err) {
      console.warn('Failed to poll broadcast queue:', err);
    }
  }, []);

  useEffect(() => {
    fetchBroadcastProgress();
    const timer = setInterval(() => {
      if (isBroadcastModalOpen || broadcastQueue.status === 'running') {
        fetchBroadcastProgress();
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [fetchBroadcastProgress, isBroadcastModalOpen, broadcastQueue.status]);

  // ── Connect WhatsApp (Generate QR / Refresh) ────────────────────────────────
  const handleConnectWhatsApp = async (forceFresh = false) => {
    setIsConnectingWa(true);
    setIsQrModalOpen(true);
    try {
      const res = await fetch('/api/whatsapp/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forceFresh }),
      });
      const data = await res.json();
      if (data.success) {
        setWaConnection({
          status: data.status,
          qrCodeDataUrl: data.qrCodeDataUrl,
          pairingCode: data.pairingCode,
          user: data.user,
          lastError: data.lastError,
        });
      } else {
        showToast(data.error || 'Failed to generate QR code.');
      }
    } catch (err) {
      showToast('Failed to generate WhatsApp QR code.');
    } finally {
      setIsConnectingWa(false);
    }
  };

  // ── Request Phone Number Pairing Code ───────────────────────────────────────
  const handleRequestPairingCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairingPhoneInput.trim()) {
      showToast('Please enter your WhatsApp phone number.');
      return;
    }
    setIsRequestingPairing(true);
    try {
      const res = await fetch('/api/whatsapp/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: pairingPhoneInput.trim() }),
      });
      const data = await res.json();
      if (data.success && data.pairingCode) {
        setWaConnection((prev) => ({ ...prev, pairingCode: data.pairingCode }));
        showToast(`Pairing code generated: ${data.pairingCode}`);
      } else {
        showToast(data.error || 'Failed to generate pairing code.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error generating pairing code.');
    } finally {
      setIsRequestingPairing(false);
    }
  };

  // ── Logout / Unlink WhatsApp ────────────────────────────────────────────────
  const handleLogoutWhatsApp = async () => {
    if (!confirm('Are you sure you want to unlink your WhatsApp account?')) return;
    try {
      const res = await fetch('/api/whatsapp/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setWaConnection({
          status: 'disconnected',
          qrCodeDataUrl: null,
          pairingCode: null,
          user: null,
          lastError: null,
        });
        showToast('WhatsApp account unlinked.');
      }
    } catch (err) {
      showToast('Failed to unlink WhatsApp.');
    }
  };

  // ── Launch Automated 1-Click Broadcast ──────────────────────────────────────
  const handleLaunchAutomatedBroadcast = async () => {
    if (waConnection.status !== 'connected') {
      setIsQrModalOpen(true);
      handleConnectWhatsApp();
      return;
    }

    if (targetWhatsAppCustomers.length === 0) {
      showToast('No recipients with valid phone numbers in selection.');
      return;
    }

    if (
      !confirm(
        `🚀 Start automated background dispatch to all ${targetWhatsAppCustomers.length} selected customers?\n\nMessages will be sent automatically with safe pacing.`
      )
    ) {
      return;
    }

    try {
      setIsBroadcastModalOpen(true);
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          campaignId: `gochow_${selectedPresetId}_${Date.now()}`,
          recipients: targetWhatsAppCustomers,
          template: customWhatsappMsg,
        }),
      });

      const data = await res.json();
      if (data.success && data.queue) {
        setBroadcastQueue(data.queue);
        showToast(`🚀 Automated broadcast launched for ${data.queue.total} contacts!`);
      } else {
        showToast(data.error || 'Failed to start automated broadcast.');
      }
    } catch (err: any) {
      showToast(err?.message || 'Network error starting broadcast.');
    }
  };

  // ── Control Broadcast Queue (Pause / Resume / Stop) ─────────────────────────
  const handleControlBroadcast = async (action: 'pause' | 'resume' | 'stop') => {
    try {
      const res = await fetch('/api/whatsapp/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success && data.queue) {
        setBroadcastQueue(data.queue);
        showToast(`Campaign ${action}d.`);
      }
    } catch (err) {
      showToast(`Failed to ${action} broadcast.`);
    }
  };

  // ── Extract Unique Cafeterias for Filter ─────────────────────────────────────
  const availableCafeterias = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.favoriteCafeteria) set.add(c.favoriteCafeteria);
    });
    return Array.from(set).sort();
  }, [customers]);

  // ── Message Personalization Helper ──────────────────────────────────────────
  const formatMessageForCustomer = (
    template: string,
    customer: CustomerAudienceMember
  ) => {
    return template
      .replace(/\{\{name\}\}/gi, customer.name.split(' ')[0] || customer.name || 'Valued Customer')
      .replace(/\{\{fullname\}\}/gi, customer.name || 'Valued Customer')
      .replace(/\{\{cafeteria\}\}/gi, customer.favoriteCafeteria || 'Campus Cafeteria')
      .replace(/\{\{orders\}\}/gi, String(customer.orderCount || 1))
      .replace(/\{\{phone\}\}/gi, customer.phone || '')
      .replace(/\{\{address\}\}/gi, customer.lastAddress || 'Hostel');
  };

  // ── Target Customers based on selection ─────────────────────────────────────
  const targetCustomers = useMemo(() => {
    return customers.filter((c) => selectedCustomerIds.has(c.id));
  }, [customers, selectedCustomerIds]);

  const targetWhatsAppCustomers = useMemo(() => {
    return targetCustomers.filter((c) => Boolean(c.phone));
  }, [targetCustomers]);

  const targetEmailCustomers = useMemo(() => {
    return targetCustomers.filter((c) => Boolean(c.email));
  }, [targetCustomers]);

  // ── Preset Selection Handler ────────────────────────────────────────────────
  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = CAMPAIGN_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setCustomWhatsappMsg(preset.whatsapp);
      setCustomEmailSubject(preset.subject);
      setCustomEmailBody(preset.email);
    }
  };

  // ── Insert Dynamic Tag into Message Composer ────────────────────────────────
  const handleInsertTag = (tag: string) => {
    if (activeChannel === 'whatsapp') {
      setCustomWhatsappMsg((prev) => prev + ` {{${tag}}}`);
    } else {
      setCustomEmailBody((prev) => prev + ` {{${tag}}}`);
    }
  };

  // ── Direct WhatsApp URL Generator ───────────────────────────────────────────
  const getWhatsAppUrl = (customer: CustomerAudienceMember) => {
    if (!customer.phone) return null;
    let cleanPhone = customer.phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0') && cleanPhone.length === 11) {
      cleanPhone = '234' + cleanPhone.slice(1);
    } else if (!cleanPhone.startsWith('234') && cleanPhone.length === 10) {
      cleanPhone = '234' + cleanPhone;
    }
    const personalizedText = formatMessageForCustomer(customWhatsappMsg, customer);
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(personalizedText)}`;
  };

  // ── Bulk Actions: Copy Numbers ──────────────────────────────────────────────
  const handleCopyNumbers = (delimiter: ',' | ';' | '\n' = ',') => {
    const phones = targetWhatsAppCustomers
      .map((c) => {
        let p = (c.phone || '').replace(/\D/g, '');
        if (p.startsWith('0') && p.length === 11) p = '234' + p.slice(1);
        return p;
      })
      .filter(Boolean);

    if (phones.length === 0) {
      showToast('No valid phone numbers found in selection.');
      return;
    }

    navigator.clipboard.writeText(phones.join(delimiter === '\n' ? '\n' : `${delimiter} `));
    showToast(`Copied ${phones.length} WhatsApp numbers to clipboard!`);
  };

  // ── Bulk Actions: Export VCF Contacts ───────────────────────────────────────
  const handleExportVCF = () => {
    if (targetWhatsAppCustomers.length === 0) {
      showToast('No phone numbers to export.');
      return;
    }

    let vcfContent = '';
    targetWhatsAppCustomers.forEach((c) => {
      let p = (c.phone || '').replace(/\D/g, '');
      if (p.startsWith('0') && p.length === 11) p = '+234' + p.slice(1);
      else if (!p.startsWith('+')) p = '+' + p;

      vcfContent += `BEGIN:VCARD\nVERSION:3.0\nFN:GoChow - ${c.name}\nTEL;TYPE=CELL:${p}\n`;
      if (c.email) vcfContent += `EMAIL:${c.email}\n`;
      if (c.favoriteCafeteria) vcfContent += `NOTE:Favorite Cafeteria: ${c.favoriteCafeteria} | Orders: ${c.orderCount}\n`;
      vcfContent += `END:VCARD\n`;
    });

    const blob = new Blob([vcfContent], { type: 'text/vcard;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GoChow_Audience_${timeframe}_days_${targetWhatsAppCustomers.length}_contacts.vcf`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${targetWhatsAppCustomers.length} contacts for phone import!`);
  };

  // ── Bulk Actions: Export CSV ────────────────────────────────────────────────
  const handleExportCSV = () => {
    if (targetCustomers.length === 0) {
      showToast('No customer data to export.');
      return;
    }

    const headers = ['Name', 'Phone', 'Email', 'Orders in Period', 'Total Spent (NGN)', 'Favorite Cafeteria', 'Last Order Date', 'Last Address'];
    const rows = targetCustomers.map((c) => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.phone || ''}"`,
      `"${c.email || ''}"`,
      c.orderCount,
      c.totalSpent,
      `"${(c.favoriteCafeteria || '').replace(/"/g, '""')}"`,
      `"${new Date(c.lastOrderDate).toLocaleDateString()}"`,
      `"${(c.lastAddress || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `GoChow_Customer_Directory_${timeframe}_days.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${targetCustomers.length} customer records to CSV!`);
  };

  // ── Bulk Actions: 1-Click BCC Email ─────────────────────────────────────────
  const handleOpenBCCEmail = () => {
    const emails = targetEmailCustomers.map((c) => c.email?.trim()).filter(Boolean);
    if (emails.length === 0) {
      showToast('No customer email addresses available in selection.');
      return;
    }

    const bccList = emails.join(',');
    const sampleCustomer = targetEmailCustomers[0] || {
      name: 'Customer',
      favoriteCafeteria: 'Campus Cafeteria',
      orderCount: 1,
      totalSpent: 0,
      phone: '',
      email: '',
      allTimeOrderCount: 1,
      lastOrderDate: new Date().toISOString(),
      firstOrderDate: new Date().toISOString(),
      lastAddress: '',
      id: '1',
    };
    const bodyText = formatMessageForCustomer(customEmailBody, sampleCustomer);
    const mailtoUrl = `mailto:?bcc=${encodeURIComponent(bccList)}&subject=${encodeURIComponent(
      customEmailSubject
    )}&body=${encodeURIComponent(bodyText)}`;

    window.open(mailtoUrl, '_blank');
    showToast(`Opened email draft with ${emails.length} customer emails in BCC!`);
  };

  // ── Toggle Single / All Customer Selection ──────────────────────────────────
  const toggleSelectCustomer = (id: string) => {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCustomerIds.size === customers.length) {
      setSelectedCustomerIds(new Set());
    } else {
      setSelectedCustomerIds(new Set(customers.map((c) => c.id)));
    }
  };

  const progressPercent = broadcastQueue.total > 0 ? Math.round((broadcastQueue.currentIndex / broadcastQueue.total) * 100) : 0;

  return (
    <AppLayout>
      <Header onSyncComplete={() => fetchAudience(false)} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8">
    <div className="space-y-6 pb-20">
      {/* ── Toast Alert Banner ──────────────────────────────────────────────── */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-3 border border-slate-700 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-semibold">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white ml-2 text-xs font-semibold"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Page Header & WhatsApp Device Status Bar ───────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Broadcast</h1>
              <p className="text-sm text-slate-500 mt-1">Message your customers on WhatsApp or email.</p>
            </div>
          </div>
        </div>

        {/* WhatsApp Device Connection Pill */}
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          {waConnection.status === 'connected' ? (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2 text-emerald-950">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-xs">
                <span className="font-semibold text-emerald-900">WhatsApp Linked: </span>
                <span className="font-mono font-semibold text-emerald-800">
                  +{waConnection.user?.phone || 'Connected'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogoutWhatsApp}
                className="text-xs text-red-600 hover:text-red-800 font-semibold ml-1 p-1 hover:bg-red-100 rounded-md transition-all flex items-center gap-0.5"
                title="Unlink WhatsApp"
              >
                <Unlink className="w-3 h-3" />
                <span>Unlink</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleConnectWhatsApp(true)}
              disabled={isConnectingWa}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-all animate-pulse"
            >
              <QrCode className="w-4 h-4 text-emerald-200" />
              <span>📲 Link WhatsApp (1-Click Auto-Pilot)</span>
            </button>
          )}

          <button
            onClick={() => fetchAudience(false)}
            disabled={isRefreshing}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Top Metric KPI Cards ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Total Customers */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Total Audience</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {metrics.totalCustomers.toLocaleString()}
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Unique in {metrics.activeTimeframeLabel}
          </p>
        </div>

        {/* WhatsApp Reachable */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold text-emerald-700">WhatsApp Reach</span>
            <Phone className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-semibold text-emerald-700">
            {metrics.totalPhones.toLocaleString()}
          </div>
          <p className="text-xs text-emerald-600/80 font-medium">
            Verified phone numbers
          </p>
        </div>

        {/* Email Reachable */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold text-indigo-700">Email Reach</span>
            <Mail className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-semibold text-indigo-700">
            {metrics.totalEmails.toLocaleString()}
          </div>
          <p className="text-xs text-indigo-600/80 font-medium">
            Available email contacts
          </p>
        </div>

        {/* Total Orders */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold">Orders in Period</span>
            <ShoppingBag className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-semibold text-slate-900">
            {metrics.totalOrdersInPeriod.toLocaleString()}
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Completed delivery orders
          </p>
        </div>

        {/* Total Spend Volume */}
        <div className="col-span-2 lg:col-span-1 bg-slate-900 text-white p-4 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold text-amber-400">Spend Volume</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-semibold text-white">
            ₦{metrics.totalSpentInPeriod.toLocaleString()}
          </div>
          <p className="text-xs text-slate-400 font-medium">
            Revenue generated in window
          </p>
        </div>
      </div>

      {/* ── Date Range & Audience Filters Bar ───────────────────────────────── */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Timeframe selector pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1 shrink-0">
              <Calendar className="w-3.5 h-3.5" />
              Window:
            </span>

            {[
              { id: '7', label: 'Last 7 Days' },
              { id: '30', label: 'Past 30 Days' },
              { id: '60', label: 'Last 60 Days' },
              { id: 'all', label: 'All Time' },
              { id: 'custom', label: 'Custom Dates 📅' },
            ].map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setTimeframe(btn.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                  timeframe === btn.id
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Quick status summary */}
          <div className="text-xs text-slate-500 font-semibold shrink-0">
            Selected: <strong className="text-slate-900">{selectedCustomerIds.size}</strong> of {customers.length} customers
          </div>
        </div>

        {/* Custom date range pickers */}
        {timeframe === 'custom' && (
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 flex flex-wrap items-center gap-3 animate-in fade-in duration-150">
            <span className="text-xs font-semibold text-amber-900">Custom Date Boundaries:</span>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-amber-800">From:</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-amber-800">To:</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              type="button"
              onClick={() => fetchAudience(true)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs"
            >
              Apply Filter
            </button>
          </div>
        )}

        {/* Search & Cafeteria Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          {/* Search bar */}
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by customer name, phone number, email address, or hostel..."
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Cafeteria Filter Dropdown */}
          <div className="relative">
            <Store className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              value={selectedCafeteria}
              onChange={(e) => setSelectedCafeteria(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 appearance-none"
            >
              <option value="all">All Cafeterias (Any Vendor)</option>
              {availableCafeterias.map((caf) => (
                <option key={caf} value={caf}>
                  {caf}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Main Workspace: Left Composer & Right Smartphone Preview ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Side: Campaign Composer (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 space-y-4">
            {/* Channel Tabs */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveChannel('whatsapp')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeChannel === 'whatsapp'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>💬 WhatsApp Campaign</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveChannel('email')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                    activeChannel === 'email'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5" />
                  <span>✉️ Email Campaign</span>
                </button>
              </div>

              <span className="text-xs font-semibold text-slate-400">
                Targeting <strong className="text-slate-900">{targetCustomers.length}</strong> recipients
              </span>
            </div>

            {/* Campaign Preset Templates */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                Select Offer Preset:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {CAMPAIGN_PRESETS.map((p) => {
                  const isSelected = selectedPresetId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p.id)}
                      className={`p-2.5 rounded-xl text-left border transition-all text-xs font-semibold flex items-start justify-between gap-2 ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50/70 text-amber-950 ring-1 ring-amber-400'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <span className="truncate">{p.title}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/80 border border-slate-200 text-slate-500 shrink-0 font-medium">
                        {p.tag}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Placeholder Tag Insert Buttons */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500">
                Click to Insert Personalization Tag:
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { tag: 'name', label: 'First Name' },
                  { tag: 'cafeteria', label: 'Favorite Cafeteria' },
                  { tag: 'orders', label: 'Order Count' },
                  { tag: 'phone', label: 'Phone Number' },
                  { tag: 'address', label: 'Hostel Address' },
                ].map((t) => (
                  <button
                    key={t.tag}
                    type="button"
                    onClick={() => handleInsertTag(t.tag)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-amber-100 hover:text-amber-900 border border-slate-200 text-slate-700 text-xs font-mono font-semibold transition-all"
                  >
                    + {`{{${t.tag}}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Composer Input Area */}
            {activeChannel === 'whatsapp' ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">WhatsApp Message Content:</label>
                <textarea
                  rows={5}
                  value={customWhatsappMsg}
                  onChange={(e) => setCustomWhatsappMsg(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 leading-relaxed font-sans"
                  placeholder="Type your WhatsApp broadcast message here..."
                />
                <p className="text-xs text-slate-400">
                  Tip: Use WhatsApp markdown such as <code className="font-mono text-slate-600">*bold*</code>, <code className="font-mono text-slate-600">_italics_</code>, and emojis.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Email Subject Line:</label>
                  <input
                    type="text"
                    value={customEmailSubject}
                    onChange={(e) => setCustomEmailSubject(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    placeholder="Enter email subject..."
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">Email Body:</label>
                  <textarea
                    rows={6}
                    value={customEmailBody}
                    onChange={(e) => setCustomEmailBody(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 leading-relaxed font-sans"
                    placeholder="Type email body..."
                  />
                </div>
              </div>
            )}

            {/* Action Buttons Toolbar */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {activeChannel === 'whatsapp' ? (
                  <>
                    {/* Primary Automated 1-Click Dispatcher */}
                    <button
                      type="button"
                      onClick={handleLaunchAutomatedBroadcast}
                      disabled={targetWhatsAppCustomers.length === 0}
                      className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50 ring-2 ring-emerald-300"
                    >
                      <Send className="w-4 h-4" />
                      <span>🚀 Launch 1-Click Broadcast ({targetWhatsAppCustomers.length} People)</span>
                    </button>

                    {/* Step-by-step Queue Modal Fallback */}
                    <button
                      type="button"
                      onClick={() => {
                        setQueueIndex(0);
                        setQueueModalOpen(true);
                      }}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all"
                      title="Step through sending manually"
                    >
                      <span>Manual Step Queue</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyNumbers(',')}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Numbers</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportVCF}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Export VCF</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleOpenBCCEmail}
                      disabled={targetEmailCustomers.length === 0}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Open 1-Click BCC in Mail App ({targetEmailCustomers.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleExportCSV}
                      className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-all"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Export Email List (CSV)</span>
                    </button>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={handleExportCSV}
                className="text-xs font-semibold text-amber-700 hover:underline flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Full Directory CSV</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Live Interactive Phone Preview (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-slate-900 rounded-xl p-4 shadow-xl border-4 border-slate-800 text-white space-y-3">
            {/* Phone notch header */}
            <div className="flex items-center justify-between text-slate-400 text-xs px-2">
              <span className="font-mono font-semibold">GoChow Campaign Preview</span>
              <div className="w-16 h-3 bg-slate-800 rounded-full mx-auto" />
              <span className="text-emerald-400 font-semibold">Live</span>
            </div>

            {/* Target Sample Customer Header */}
            {customers.length > 0 && (
              <div className="bg-slate-800/80 rounded-xl p-2.5 border border-slate-700/80 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-xl bg-amber-500 text-white font-semibold flex items-center justify-center shrink-0 text-xs">
                    {(customers[0]?.name || 'C').charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-100 text-xs truncate">
                      Preview for: <span className="text-amber-400">{customers[0]?.name}</span>
                    </p>
                    <p className="text-xs text-slate-400 truncate">
                      {customers[0]?.phone || 'No phone'} • {customers[0]?.favoriteCafeteria}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Chat bubble screen */}
            {activeChannel === 'whatsapp' ? (
              <div className="bg-[#0b141a] rounded-xl p-4 min-h-[220px] flex flex-col justify-end border border-slate-800 relative overflow-hidden">
                <div className="bg-[#005c4b] text-slate-100 p-3.5 rounded-xl rounded-tr-none text-xs leading-relaxed space-y-2 shadow-sm border border-[#02735e]">
                  <p className="whitespace-pre-wrap font-sans">
                    {customers.length > 0
                      ? formatMessageForCustomer(customWhatsappMsg, customers[0])
                      : customWhatsappMsg}
                  </p>
                  <div className="flex items-center justify-end gap-1 text-[9px] text-emerald-200">
                    <span>12:00 PM</span>
                    <span>✓✓</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 rounded-xl p-4 min-h-[220px] border border-slate-800 space-y-3">
                <div className="border-b border-slate-800 pb-2 space-y-1">
                  <p className="text-xs text-slate-400">
                    Subject: <strong className="text-slate-200">{customEmailSubject}</strong>
                  </p>
                  <p className="text-xs text-slate-500">
                    To: <span className="text-slate-300">{customers[0]?.email || 'customer@gmail.com'}</span>
                  </p>
                </div>
                <div className="text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                  {customers.length > 0
                    ? formatMessageForCustomer(customEmailBody, customers[0])
                    : customEmailBody}
                </div>
              </div>
            )}

            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-medium">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Tags auto-replace for every single customer
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Customer Audience Directory Table ───────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden space-y-0">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedCustomerIds.size === customers.length && customers.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded-md text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
            />
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Audience Directory ({customers.length} Customers)
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Aggregated from synced orders in {metrics.activeTimeframeLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3 h-3" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <RefreshCw className="w-8 h-8 mx-auto text-amber-500 animate-spin" />
            <p className="text-xs font-semibold text-slate-500">Aggregating customer directory from orders...</p>
          </div>
        ) : customers.length === 0 ? (
          <div className="py-16 text-center space-y-2 p-6">
            <Users className="w-10 h-10 mx-auto text-slate-300 stroke-[1.5]" />
            <h3 className="text-sm font-semibold text-slate-700">No Customers Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No orders found matching the timeframe "{metrics.activeTimeframeLabel}". Try selecting "All Time" or widening the date range.
            </p>
            <button
              onClick={() => setTimeframe('all')}
              className="mt-2 px-3.5 py-1.5 rounded-xl bg-slate-900 text-white font-semibold text-xs"
            >
              View All-Time Customers
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs">
                <tr>
                  <th className="p-3.5 pl-4 w-10">Select</th>
                  <th className="p-3.5">Customer</th>
                  <th className="p-3.5">WhatsApp / Phone</th>
                  <th className="p-3.5">Email</th>
                  <th className="p-3.5">Orders</th>
                  <th className="p-3.5">Total Spent</th>
                  <th className="p-3.5">Top Cafeteria</th>
                  <th className="p-3.5">Last Active</th>
                  <th className="p-3.5 pr-4 text-right">1-Click Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {customers.map((cust) => {
                  const isSelected = selectedCustomerIds.has(cust.id);
                  const whatsappUrl = getWhatsAppUrl(cust);

                  return (
                    <tr
                      key={cust.id}
                      className={`hover:bg-amber-50/40 transition-colors ${
                        isSelected ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3.5 pl-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectCustomer(cust.id)}
                          className="w-4 h-4 rounded-md text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                        />
                      </td>

                      {/* Customer Name */}
                      <td className="p-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 border border-slate-200 font-semibold text-slate-700 flex items-center justify-center shrink-0 text-xs">
                            {cust.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{cust.name}</p>
                            <p className="text-xs text-slate-400 truncate max-w-[140px]">
                              {cust.lastAddress}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Phone */}
                      <td className="p-3.5">
                        {cust.phone ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-slate-700 font-semibold">{cust.phone}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(cust.phone!);
                                showToast(`Copied ${cust.phone}`);
                              }}
                              className="text-slate-400 hover:text-slate-700"
                              title="Copy number"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">None recorded</span>
                        )}
                      </td>

                      {/* Email */}
                      <td className="p-3.5">
                        {cust.email ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-slate-600 truncate max-w-[160px]">{cust.email}</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(cust.email!);
                                showToast(`Copied ${cust.email}`);
                              }}
                              className="text-slate-400 hover:text-slate-700"
                              title="Copy email"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">None</span>
                        )}
                      </td>

                      {/* Order Count */}
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 font-semibold text-xs">
                          {cust.orderCount} order{cust.orderCount > 1 ? 's' : ''}
                        </span>
                      </td>

                      {/* Total Spent */}
                      <td className="p-3.5 font-semibold text-slate-900">
                        ₦{cust.totalSpent.toLocaleString()}
                      </td>

                      {/* Favorite Cafeteria */}
                      <td className="p-3.5">
                        <span className="text-xs font-semibold text-amber-900 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                          {cust.favoriteCafeteria}
                        </span>
                      </td>

                      {/* Last Active */}
                      <td className="p-3.5 text-slate-500 text-xs">
                        {new Date(cust.lastOrderDate).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </td>

                      {/* 1-Click Actions */}
                      <td className="p-3.5 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {whatsappUrl ? (
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white border border-emerald-200 font-semibold text-xs flex items-center gap-1 transition-all"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </a>
                          ) : (
                            <span className="text-xs text-slate-300">No WhatsApp</span>
                          )}

                          {cust.email && (
                            <a
                              href={`mailto:${cust.email}?subject=${encodeURIComponent(
                                customEmailSubject
                              )}&body=${encodeURIComponent(
                                formatMessageForCustomer(customEmailBody, cust)
                              )}`}
                              className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white border border-indigo-200 transition-all"
                              title="Send single email"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── WhatsApp Linking Modal (QR Code & Phone Pairing Code) ─────────── */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-xl shadow-2xl border border-slate-100 overflow-hidden space-y-0 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-emerald-600 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-white text-emerald-600 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Link WhatsApp Account</h3>
                  <p className="text-xs text-emerald-100">For 1-click automated background dispatch</p>
                </div>
              </div>
              <button
                onClick={() => setIsQrModalOpen(false)}
                className="text-emerald-200 hover:text-white text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {/* Linking Method Tabs */}
            <div className="grid grid-cols-2 p-2 bg-slate-100 border-b border-slate-200 gap-1 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setLinkTab('qr');
                  if (!waConnection.qrCodeDataUrl) handleConnectWhatsApp(true);
                }}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  linkTab === 'qr'
                    ? 'bg-white text-emerald-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>Scan QR Code</span>
              </button>
              <button
                type="button"
                onClick={() => setLinkTab('pairing')}
                className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                  linkTab === 'pairing'
                    ? 'bg-white text-emerald-800'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Pairing Code (No Camera)</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 text-center space-y-4">
              {/* TAB 1: QR CODE */}
              {linkTab === 'qr' && (
                <div className="space-y-4">
                  {waConnection.qrCodeDataUrl ? (
                    <div className="space-y-3">
                      <div className="inline-block p-3 bg-white rounded-xl border-2 border-slate-200 shadow-sm">
                        <img
                          src={waConnection.qrCodeDataUrl}
                          alt="WhatsApp QR Code"
                          className="w-56 h-56 mx-auto rounded-lg"
                        />
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <p className="text-xs font-semibold text-slate-800 animate-pulse flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          Scan QR code with your phone
                        </p>
                        <button
                          type="button"
                          onClick={() => handleConnectWhatsApp(true)}
                          disabled={isConnectingWa}
                          className="text-xs text-emerald-700 hover:text-emerald-900 font-semibold underline flex items-center gap-1"
                          title="Generate a fresh QR code"
                        >
                          <RefreshCw className={`w-3 h-3 ${isConnectingWa ? 'animate-spin' : ''}`} />
                          <span>Reload QR</span>
                        </button>
                      </div>
                    </div>
                  ) : isConnectingWa || waConnection.status === 'connecting' ? (
                    <div className="py-12 space-y-3">
                      <RefreshCw className="w-10 h-10 mx-auto text-emerald-500 animate-spin" />
                      <p className="text-xs font-semibold text-slate-600">Generating secure WhatsApp QR code...</p>
                    </div>
                  ) : waConnection.status === 'connected' ? (
                    <div className="py-10 space-y-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                        <Check className="w-6 h-6 stroke-[3]" />
                      </div>
                      <h4 className="text-base font-semibold text-slate-900">WhatsApp is Connected!</h4>
                      <p className="text-xs text-slate-500">You can now launch 1-click broadcasts to all customers.</p>
                    </div>
                  ) : (
                    <div className="py-8 space-y-3">
                      <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
                      <p className="text-xs text-slate-600 font-medium">Click below to generate a new QR session code.</p>
                      <button
                        type="button"
                        onClick={() => handleConnectWhatsApp(true)}
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                      >
                        Generate QR Code
                      </button>
                    </div>
                  )}

                  {/* QR Step-by-Step Instructions */}
                  <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                    <p className="font-semibold text-slate-900">How to scan on your phone:</p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 text-xs leading-relaxed">
                      <li>Open <strong>WhatsApp</strong> or <strong>WhatsApp Business</strong>.</li>
                      <li>Tap <strong>Settings (⚙️)</strong> or <strong>Menu (⋮)</strong> → <strong>Linked Devices</strong>.</li>
                      <li>Tap <strong>Link a Device</strong> and scan this QR code.</li>
                    </ol>
                  </div>
                </div>
              )}

              {/* TAB 2: PHONE PAIRING CODE */}
              {linkTab === 'pairing' && (
                <div className="space-y-4">
                  <div className="text-left space-y-1">
                    <label className="text-xs font-semibold text-slate-700">Enter Your Phone Number:</label>
                    <form onSubmit={handleRequestPairingCode} className="flex gap-2">
                      <input
                        type="tel"
                        value={pairingPhoneInput}
                        onChange={(e) => setPairingPhoneInput(e.target.value)}
                        placeholder="e.g. 08012345678 or 2348012345678"
                        className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                      <button
                        type="submit"
                        disabled={isRequestingPairing}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shrink-0 disabled:opacity-50"
                      >
                        {isRequestingPairing ? 'Generating...' : 'Get Code'}
                      </button>
                    </form>
                  </div>

                  {waConnection.pairingCode ? (
                    <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 space-y-2">
                      <p className="text-xs font-semibold text-emerald-800">
                        Your 8-Character Pairing Code:
                      </p>
                      <div className="text-2xl font-mono font-semibold text-emerald-900 bg-white py-2 rounded-xl border border-emerald-200">
                        {waConnection.pairingCode}
                      </div>
                      <p className="text-xs text-emerald-700 font-medium">
                        Enter this code on your phone when prompted!
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">
                      Enter your WhatsApp phone number above to get an 8-character code.
                    </p>
                  )}

                  {/* Pairing Instructions */}
                  <div className="text-left bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                    <p className="font-semibold text-slate-900">How to link with code:</p>
                    <ol className="list-decimal list-inside space-y-1 text-slate-600 text-xs leading-relaxed">
                      <li>Open <strong>WhatsApp</strong> on your phone.</li>
                      <li>Go to <strong>Linked Devices → Link a Device</strong>.</li>
                      <li>Tap <strong>"Link with phone number instead"</strong> at the bottom.</li>
                      <li>Type in the 8-character code shown above.</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Automated Broadcast Live Monitor Modal ──────────────────────────── */}

      {/* ── Automated Broadcast Live Monitor Modal ──────────────────────────── */}
      {isBroadcastModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-xl shadow-2xl border border-slate-100 overflow-hidden space-y-0 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Live Automated Broadcast Monitor</h3>
                  <p className="text-xs text-slate-400">
                    Status: <strong className=" text-emerald-400">{broadcastQueue.status}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBroadcastModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm font-semibold p-1"
                title="Minimize (keeps running in background)"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-5">
              {/* Animated Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-700">
                  <span>Campaign Progress</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="w-full bg-slate-100 h-3.5 rounded-full overflow-hidden p-0.5 border border-slate-200">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      broadcastQueue.status === 'completed'
                        ? 'bg-emerald-500'
                        : broadcastQueue.status === 'paused'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Stats Counters */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-xs text-slate-500 font-semibold">Total Target</p>
                  <p className="text-lg font-semibold text-slate-900">{broadcastQueue.total}</p>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <p className="text-xs text-emerald-700 font-semibold">Delivered</p>
                  <p className="text-lg font-semibold text-emerald-700">{broadcastQueue.sent}</p>
                </div>
                <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
                  <p className="text-xs text-rose-700 font-semibold">Failed / Invalid</p>
                  <p className="text-lg font-semibold text-rose-700">{broadcastQueue.failed}</p>
                </div>
              </div>

              {/* Current Active Contact */}
              {broadcastQueue.status === 'running' && broadcastQueue.currentContact && (
                <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between text-xs animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-emerald-950">
                      Currently Sending: <strong className="underline">{broadcastQueue.currentContact.name}</strong> ({broadcastQueue.currentContact.phone})
                    </span>
                  </div>
                  <span className="text-xs text-emerald-800 font-mono font-semibold">Pacing...</span>
                </div>
              )}

              {/* Campaign Complete Banner */}
              {broadcastQueue.status === 'completed' && (
                <div className="p-4 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-950 text-center space-y-1">
                  <p className="text-sm font-semibold">🎉 Broadcast Complete!</p>
                  <p className="text-xs">
                    Successfully delivered to <strong>{broadcastQueue.sent}</strong> customers directly on WhatsApp.
                  </p>
                </div>
              )}

              {/* Live Activity Logs */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-400">
                  Live Dispatch Activity:
                </p>
                <div className="bg-slate-950 text-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto font-mono text-xs space-y-1.5 border border-slate-800 scrollbar-none">
                  {broadcastQueue.logs.length === 0 ? (
                    <p className="text-slate-500 italic">Initializing dispatch queue...</p>
                  ) : (
                    broadcastQueue.logs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">[{log.timestamp}]</span>
                        <span className="text-slate-300 truncate max-w-[200px]">{log.name} ({log.phone})</span>
                        <span
                          className={`font-semibold px-1.5 py-0.2 rounded text-[9px] ${
                            log.status === 'success' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-rose-900/60 text-rose-300'
                          }`}
                        >
                          {log.status === 'success' ? 'SENT ✓' : 'FAILED ✕'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Control Buttons */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  {broadcastQueue.status === 'running' ? (
                    <button
                      type="button"
                      onClick={() => handleControlBroadcast('pause')}
                      className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs flex items-center gap-1.5"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span>Pause</span>
                    </button>
                  ) : broadcastQueue.status === 'paused' ? (
                    <button
                      type="button"
                      onClick={() => handleControlBroadcast('resume')}
                      className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume</span>
                    </button>
                  ) : null}

                  {['running', 'paused'].includes(broadcastQueue.status) && (
                    <button
                      type="button"
                      onClick={() => handleControlBroadcast('stop')}
                      className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs flex items-center gap-1 border border-rose-200"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Stop Campaign</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setIsBroadcastModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs"
                >
                  Close Window (Keeps Running)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Manual Step-by-Step WhatsApp Queue Modal ────────────────────────── */}
      {queueModalOpen && targetWhatsAppCustomers.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl border border-slate-100 overflow-hidden space-y-0 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-500 text-white flex items-center justify-center">
                  <Send className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Manual WhatsApp Stepping Queue</h3>
                  <p className="text-xs text-slate-400">
                    Contact {queueIndex + 1} of {targetWhatsAppCustomers.length}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setQueueModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {/* Current Target Contact Details */}
            {targetWhatsAppCustomers[queueIndex] && (
              <div className="p-6 space-y-4">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-slate-500">
                    <span>Progress</span>
                    <span>{Math.round(((queueIndex + 1) / targetWhatsAppCustomers.length) * 100)}%</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{
                        width: `${((queueIndex + 1) / targetWhatsAppCustomers.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-slate-900">
                        {targetWhatsAppCustomers[queueIndex].name}
                      </h4>
                      <p className="text-xs font-mono font-semibold text-emerald-800">
                        {targetWhatsAppCustomers[queueIndex].phone}
                      </p>
                    </div>
                    <span className="text-xs font-semibold bg-white px-2.5 py-1 rounded-full border border-emerald-300 text-emerald-900">
                      {targetWhatsAppCustomers[queueIndex].favoriteCafeteria}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-emerald-200/60 text-xs text-slate-700">
                    <p className="text-xs font-semibold text-emerald-900 mb-1">
                      Personalized Message to Send:
                    </p>
                    <p className="p-3 bg-white rounded-xl border border-emerald-200/80 whitespace-pre-wrap font-sans text-xs text-slate-800 leading-relaxed">
                      {formatMessageForCustomer(
                        customWhatsappMsg,
                        targetWhatsAppCustomers[queueIndex]
                      )}
                    </p>
                  </div>
                </div>

                {/* Dispatch Controls */}
                <div className="flex items-center gap-3 pt-2">
                  {getWhatsAppUrl(targetWhatsAppCustomers[queueIndex]) && (
                    <a
                      href={getWhatsAppUrl(targetWhatsAppCustomers[queueIndex])!}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        if (queueIndex < targetWhatsAppCustomers.length - 1) {
                          setTimeout(() => setQueueIndex((i) => i + 1), 600);
                        }
                      }}
                      className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs text-center flex items-center justify-center gap-2 shadow-sm transition-all"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send WhatsApp & Next 🚀</span>
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (queueIndex < targetWhatsAppCustomers.length - 1) {
                        setQueueIndex((i) => i + 1);
                      } else {
                        setQueueModalOpen(false);
                        showToast('Reached end of manual queue!');
                      }
                    }}
                    className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs"
                  >
                    Skip ➔
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
      </main>
    </AppLayout>
  );
}
