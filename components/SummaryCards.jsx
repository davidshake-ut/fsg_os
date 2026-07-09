'use client';

import { Wifi, Camera, DollarSign, TrendingUp, Network, HardDrive, Wrench, Boxes } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { currency, percent, marginBg } from '@/lib/format';

const EMPTY_LABOR = { totalHours: 0, totalPrice: 0, grandTotalCost: 0, grandTotalPrice: 0 };

function marginOf(cost, price) {
  return price > 0 ? ((price - cost) / price) * 100 : 0;
}

// Tab-dependent dashboard strip:
//   view 'wifi'    → Wi-Fi metrics
//   view 'cameras' → camera metrics
//   view 'both'    → combined hardware + camera + labor (Services / Summary / etc.)
// canViewMargin gates cost/margin/profit — a plain 'user' role sees sell
// price only, no "Cost:" sub-label and no Gross Margin card.
export default function SummaryCards({ view = 'wifi', bom, cameraBom, labor = EMPTY_LABOR, term, canViewMargin = true }) {
  const cards = buildCards(view, { bom, cameraBom, labor, term }).filter(
    (c) => canViewMargin || !c.marginOnly
  ).map((c) => (canViewMargin ? c : { ...c, sub: c.subNoMargin ?? c.sub }));

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => {
        const Icon = c.icon;
        return (
          <Card key={c.label} className={`p-4 ${c.tone || 'bg-white border-slate-200/70'}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${c.iconClass}`}>
                <Icon size={15} />
              </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-slate-900">
              {c.value}
            </p>
            {c.sub && <p className="mt-0.5 text-xs text-slate-500">{c.sub}</p>}
          </Card>
        );
      })}
    </div>
  );
}

function buildCards(view, { bom, cameraBom, labor, term }) {
  if (view === 'cameras') {
    const retention =
      cameraBom.retention === 'week' ? '~1 week retention' : '~1 month retention';
    return [
      {
        label: 'Total Cameras',
        value: cameraBom.totalCameras,
        sub: `${cameraBom.nvrCount} NVR${cameraBom.nvrCount === 1 ? '' : 's'}`,
        icon: Camera,
        iconClass: 'bg-blue-50 text-blue-600',
      },
      {
        label: 'Camera Sell Price',
        value: currency(cameraBom.grandTotalPrice),
        sub: `Cost: ${currency(cameraBom.grandTotalCost)}`,
        subNoMargin: '',
        icon: DollarSign,
        iconClass: 'bg-emerald-50 text-emerald-600',
      },
      {
        label: 'Gross Margin',
        value: percent(cameraBom.overallMargin),
        sub: `Profit: ${currency(cameraBom.grandTotalPrice - cameraBom.grandTotalCost)}`,
        icon: TrendingUp,
        iconClass: 'bg-violet-50 text-violet-600',
        tone: marginBg(cameraBom.overallMargin),
        marginOnly: true,
      },
      {
        label: 'Recorders',
        value: cameraBom.nvrCount,
        sub: retention,
        icon: HardDrive,
        iconClass: 'bg-amber-50 text-amber-600',
      },
    ];
  }

  if (view === 'both') {
    const cost = bom.grandTotalCost + cameraBom.grandTotalCost + labor.grandTotalCost;
    const price = bom.grandTotalPrice + cameraBom.grandTotalPrice + labor.grandTotalPrice;
    const totalDevices = bom.totalAPs + cameraBom.totalCameras;
    return [
      {
        label: 'Total Devices',
        value: totalDevices,
        sub: `${bom.totalAPs} APs · ${cameraBom.totalCameras} cameras`,
        icon: Boxes,
        iconClass: 'bg-blue-50 text-blue-600',
      },
      {
        label: 'Total Sell Price',
        value: currency(price),
        sub: `Cost: ${currency(cost)}`,
        subNoMargin: '',
        icon: DollarSign,
        iconClass: 'bg-emerald-50 text-emerald-600',
      },
      {
        label: 'Gross Margin',
        value: percent(marginOf(cost, price)),
        sub: `Profit: ${currency(price - cost)}`,
        icon: TrendingUp,
        iconClass: 'bg-violet-50 text-violet-600',
        tone: marginBg(marginOf(cost, price)),
        marginOnly: true,
      },
      {
        label: 'Professional Labor',
        value: `${labor.totalHours} hr${labor.totalHours === 1 ? '' : 's'}`,
        sub: `Sell: ${currency(labor.grandTotalPrice)}`,
        icon: Wrench,
        iconClass: 'bg-amber-50 text-amber-600',
      },
    ];
  }

  // view === 'wifi'
  const switchCount = bom.totalIdfSwitches + (bom.needsAggSwitch ? 1 : 0);
  const switchSub = bom.needsAggSwitch ? '+ 1 Aggregate switch' : 'Single-switch deployment';
  return [
    {
      label: 'Total Access Points',
      value: bom.totalAPs,
      sub: `${bom.guestRoomAPs} ${term.summaryUnit} APs`,
      icon: Wifi,
      iconClass: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Wi-Fi Sell Price',
      value: currency(bom.grandTotalPrice),
      sub: `Cost: ${currency(bom.grandTotalCost)}`,
      subNoMargin: '',
      icon: DollarSign,
      iconClass: 'bg-emerald-50 text-emerald-600',
    },
    {
      label: 'Gross Margin',
      value: percent(bom.overallMargin),
      sub: `Profit: ${currency(bom.grandTotalPrice - bom.grandTotalCost)}`,
      icon: TrendingUp,
      iconClass: 'bg-violet-50 text-violet-600',
      tone: marginBg(bom.overallMargin),
      marginOnly: true,
    },
    {
      label: 'IDF Switches',
      value: switchCount,
      sub: switchSub,
      icon: Network,
      iconClass: 'bg-amber-50 text-amber-600',
    },
  ];
}
