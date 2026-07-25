import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { InventoryItem, Vendor, PurchaseOrder } from '../types';
import {
  Package, AlertTriangle, Truck, Plus, RefreshCw, CheckCircle2, Boxes
} from 'lucide-react';

export const ProcurementBoard: React.FC = () => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New PO form
  const [poVendor, setPoVendor] = useState('');
  const [poItem, setPoItem] = useState('');
  const [poQty, setPoQty] = useState('');
  const [poError, setPoError] = useState('');
  const [poSaving, setPoSaving] = useState(false);

  // Inline onHand adjustment
  const [adjusting, setAdjusting] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    const [its, low, vens, pos] = await Promise.all([
      api.get<InventoryItem[]>('/inventory/items'),
      api.get<InventoryItem[]>('/inventory/low-stock'),
      api.get<Vendor[]>('/procurement/vendors'),
      api.get<PurchaseOrder[]>('/procurement/purchase-orders'),
    ]);
    setItems(its);
    setLowStock(low);
    setVendors(vens);
    setOrders(pos);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load procurement data');
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    setPoError('');
    const qty = parseInt(poQty, 10);
    if (!poVendor || !poItem || !qty || qty <= 0) {
      setPoError('Vendor, item and a positive quantity are required.');
      return;
    }
    setPoSaving(true);
    try {
      await api.post('/procurement/purchase-orders', { vendorId: poVendor, itemId: poItem, qty });
      setPoQty('');
      await refresh();
    } catch (err) {
      setPoError(err instanceof Error ? err.message : 'Failed to create purchase order');
    } finally {
      setPoSaving(false);
    }
  };

  const handleReceive = async (poId: string) => {
    setError('');
    try {
      await api.post(`/procurement/purchase-orders/${poId}/receive`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to receive purchase order');
    }
  };

  const handleAdjust = async (item: InventoryItem) => {
    const raw = adjusting[item.id];
    if (raw === undefined) return;
    const onHand = parseFloat(raw);
    if (Number.isNaN(onHand) || onHand < 0) return;
    setError('');
    try {
      await api.patch(`/inventory/items/${item.id}`, { onHand });
      setAdjusting(prev => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust stock');
    }
  };

  if (loading) {
    return (
      <div className="surface-panel bg-white border border-slate-200 p-10 flex items-center justify-center text-xs font-semibold text-slate-500 animate-slide-up shadow-xs">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin text-amber-600" /> Loading inventory & procurement…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 surface-panel bg-white p-5 border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Procurement & Stock Control</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-cyan-50 text-cyan-900 border border-cyan-200">
              Inventory • Vendors • POs
            </span>
          </div>
          <p className="text-xs text-slate-600 mt-1 font-medium">
            Par-level stock monitoring, vendor management, and purchase order receiving.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-700" /> {error}
        </div>
      )}

      {/* Low stock alert strip */}
      {lowStock.length > 0 && (
        <div className="surface-panel bg-white p-4 border border-rose-200 border-l-4 border-l-rose-500 space-y-2 shadow-xs">
          <div className="text-xs font-bold text-rose-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-700" /> {lowStock.length} item(s) at or below par level
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(i => (
              <span key={i.id} className="text-[11px] px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 text-rose-900 font-bold">
                {i.name}: {i.onHand} {i.unit} (par {i.parLevel})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Inventory table */}
      <div className="surface-panel bg-white p-5 space-y-3 border border-slate-200 shadow-xs">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Boxes className="w-4 h-4 text-cyan-700" /> Inventory On-Hand vs Par
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                <th className="pb-2 font-bold">Item</th>
                <th className="pb-2 font-bold">Category</th>
                <th className="pb-2 font-bold text-right">On Hand</th>
                <th className="pb-2 font-bold text-right">Par</th>
                <th className="pb-2 font-bold w-40">Stock vs Par</th>
                <th className="pb-2 font-bold text-right">Unit Cost</th>
                <th className="pb-2 font-bold text-right">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map(i => {
                const pct = i.parLevel > 0 ? Math.min(100, (i.onHand / (i.parLevel * 2)) * 100) : 100;
                const isLow = i.onHand <= i.parLevel;
                return (
                  <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 text-slate-900 font-bold">{i.name}</td>
                    <td className="py-2.5 text-slate-600 font-semibold">{i.category}</td>
                    <td className={`py-2.5 text-right font-mono font-extrabold ${isLow ? 'text-rose-700' : 'text-slate-900'}`}>
                      {i.onHand} <span className="text-slate-500 font-normal">{i.unit}</span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-500 font-bold">{i.parLevel}</td>
                    <td className="py-2.5">
                      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isLow ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 text-right font-mono text-slate-700 font-bold">${i.costPerUnit.toFixed(2)}</td>
                    <td className="py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="number" min="0" step="1"
                          value={adjusting[i.id] ?? ''}
                          placeholder={String(i.onHand)}
                          onChange={e => setAdjusting(prev => ({ ...prev, [i.id]: e.target.value }))}
                          className="w-16 p-1 rounded-md field-control text-xs font-mono text-right"
                        />
                        <button
                          onClick={() => handleAdjust(i)}
                          disabled={adjusting[i.id] === undefined || adjusting[i.id] === ''}
                          className="btn-secondary text-[10px] px-2 py-1 font-bold disabled:opacity-40"
                        >
                          Set
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Vendors */}
        <div className="lg:col-span-4 surface-panel bg-white p-5 space-y-3 border border-slate-200 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-4 h-4 text-cyan-700" /> Approved Vendors
          </h3>
          <div className="space-y-2">
            {vendors.map(v => (
              <div key={v.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div className="font-bold text-slate-900">{v.name}</div>
                <div className="text-[11px] font-semibold text-slate-500 mt-0.5">{v.category} • {v.contact}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Purchase orders + new PO form */}
        <div className="lg:col-span-8 space-y-6">
          <div className="surface-panel bg-white p-5 space-y-3 border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-700" /> New Purchase Order
            </h3>
            <form onSubmit={handleCreatePo} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 text-xs">
              <div className="flex-1">
                <label className="block text-slate-700 font-bold mb-1">Vendor</label>
                <select
                  value={poVendor}
                  onChange={e => setPoVendor(e.target.value)}
                  className="field-control text-xs"
                  required
                >
                  <option value="">Select vendor…</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-slate-700 font-bold mb-1">Item</label>
                <select
                  value={poItem}
                  onChange={e => setPoItem(e.target.value)}
                  className="field-control text-xs"
                  required
                >
                  <option value="">Select item…</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="block text-slate-700 font-bold mb-1">Qty</label>
                <input
                  type="number" min="1" step="1"
                  value={poQty}
                  onChange={e => setPoQty(e.target.value)}
                  className="field-control text-xs font-mono font-bold"
                  required
                />
              </div>
              <button type="submit" disabled={poSaving} className="btn-primary text-xs px-4 py-2 font-bold disabled:opacity-60">
                <Plus className="w-3.5 h-3.5" /> {poSaving ? 'Creating…' : 'Create PO'}
              </button>
            </form>
            {poError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-[11px] font-bold">
                {poError}
              </div>
            )}
          </div>

          <div className="surface-panel bg-white p-5 space-y-3 border border-slate-200 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-700" /> Purchase Orders
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    <th className="pb-2 font-bold">PO</th>
                    <th className="pb-2 font-bold">Vendor</th>
                    <th className="pb-2 font-bold">Item</th>
                    <th className="pb-2 font-bold text-right">Qty</th>
                    <th className="pb-2 font-bold text-right">Total</th>
                    <th className="pb-2 font-bold">Date</th>
                    <th className="pb-2 font-bold">Status</th>
                    <th className="pb-2 font-bold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map(po => (
                    <tr key={po.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 font-mono font-bold text-cyan-900">{po.id}</td>
                      <td className="py-2.5 text-slate-900 font-bold">{po.vendorName}</td>
                      <td className="py-2.5 text-slate-700 font-semibold">{po.itemName}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-slate-900">{po.qty}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-slate-900">${(po.qty * po.unitCost).toFixed(2)}</td>
                      <td className="py-2.5 text-slate-500 font-semibold">{po.orderDate}</td>
                      <td className="py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${
                          po.status === 'Received'
                            ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                            : 'bg-amber-100 text-amber-900 border-amber-300'
                        }`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        {po.status === 'Open' ? (
                          <button
                            onClick={() => handleReceive(po.id)}
                            className="btn-secondary text-[11px] px-2.5 py-1 text-emerald-900 border-emerald-300 hover:bg-emerald-50 font-bold"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" /> Receive
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-semibold">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr><td colSpan={8} className="py-4 text-center text-slate-500 font-semibold">No purchase orders yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
