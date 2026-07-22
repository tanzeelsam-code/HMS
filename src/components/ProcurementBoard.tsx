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
      <div className="glass-panel p-10 flex items-center justify-center text-sm text-gray-400 animate-slide-up">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin text-amber-400" /> Loading inventory & procurement…
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-100 tracking-tight">Procurement & Stock Control</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
              Inventory • Vendors • POs
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Par-level stock monitoring, vendor management, and purchase order receiving.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Low stock alert strip */}
      {lowStock.length > 0 && (
        <div className="glass-panel p-4 border-l-2 border-l-rose-500/60 space-y-2">
          <div className="text-xs font-bold text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> {lowStock.length} item(s) at or below par level
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(i => (
              <span key={i.id} className="text-[11px] px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-200 font-semibold">
                {i.name}: {i.onHand} {i.unit} (par {i.parLevel})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Inventory table */}
      <div className="glass-panel p-5 space-y-3">
        <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
          <Boxes className="w-4 h-4 text-cyan-400" /> Inventory On-Hand vs Par
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/10">
                <th className="pb-2 font-bold">Item</th>
                <th className="pb-2 font-bold">Category</th>
                <th className="pb-2 font-bold text-right">On Hand</th>
                <th className="pb-2 font-bold text-right">Par</th>
                <th className="pb-2 font-bold w-40">Stock vs Par</th>
                <th className="pb-2 font-bold text-right">Unit Cost</th>
                <th className="pb-2 font-bold text-right">Adjust</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => {
                const pct = i.parLevel > 0 ? Math.min(100, (i.onHand / (i.parLevel * 2)) * 100) : 100;
                const isLow = i.onHand <= i.parLevel;
                return (
                  <tr key={i.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2 text-gray-100 font-semibold">{i.name}</td>
                    <td className="py-2 text-gray-400">{i.category}</td>
                    <td className={`py-2 text-right font-mono font-bold ${isLow ? 'text-rose-300' : 'text-gray-100'}`}>
                      {i.onHand} <span className="text-gray-500 font-normal">{i.unit}</span>
                    </td>
                    <td className="py-2 text-right font-mono text-gray-400">{i.parLevel}</td>
                    <td className="py-2">
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isLow ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2 text-right font-mono text-gray-300">${i.costPerUnit.toFixed(2)}</td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <input
                          type="number" min="0" step="1"
                          value={adjusting[i.id] ?? ''}
                          placeholder={String(i.onHand)}
                          onChange={e => setAdjusting(prev => ({ ...prev, [i.id]: e.target.value }))}
                          className="w-16 p-1 rounded-md bg-slate-900 border border-white/10 text-gray-200 font-mono text-right"
                        />
                        <button
                          onClick={() => handleAdjust(i)}
                          disabled={adjusting[i.id] === undefined || adjusting[i.id] === ''}
                          className="btn-secondary text-[10px] px-2 py-1 disabled:opacity-40"
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
        <div className="lg:col-span-4 glass-panel p-5 space-y-3">
          <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
            <Truck className="w-4 h-4 text-cyan-400" /> Approved Vendors
          </h3>
          <div className="space-y-2">
            {vendors.map(v => (
              <div key={v.id} className="p-3 rounded-xl bg-slate-900/80 border border-white/10 text-xs">
                <div className="font-bold text-gray-100">{v.name}</div>
                <div className="text-[11px] text-gray-400 mt-0.5">{v.category} • {v.contact}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Purchase orders + new PO form */}
        <div className="lg:col-span-8 space-y-6">
          <div className="glass-panel p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
              <Plus className="w-4 h-4 text-cyan-400" /> New Purchase Order
            </h3>
            <form onSubmit={handleCreatePo} className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 text-xs">
              <div className="flex-1">
                <label className="block text-gray-400 font-semibold mb-1">Vendor</label>
                <select
                  value={poVendor}
                  onChange={e => setPoVendor(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                  required
                >
                  <option value="">Select vendor…</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-gray-400 font-semibold mb-1">Item</label>
                <select
                  value={poItem}
                  onChange={e => setPoItem(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200"
                  required
                >
                  <option value="">Select item…</option>
                  {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                </select>
              </div>
              <div className="w-28">
                <label className="block text-gray-400 font-semibold mb-1">Qty</label>
                <input
                  type="number" min="1" step="1"
                  value={poQty}
                  onChange={e => setPoQty(e.target.value)}
                  className="w-full p-2 rounded-lg bg-slate-900 border border-white/10 text-gray-200 font-mono"
                  required
                />
              </div>
              <button type="submit" disabled={poSaving} className="btn-primary text-xs px-4 py-2 disabled:opacity-60">
                <Plus className="w-3.5 h-3.5" /> {poSaving ? 'Creating…' : 'Create PO'}
              </button>
            </form>
            {poError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/40 text-rose-300 text-[11px] font-semibold">
                {poError}
              </div>
            )}
          </div>

          <div className="glass-panel p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-100 flex items-center gap-2">
              <Package className="w-4 h-4 text-cyan-400" /> Purchase Orders
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-gray-500 border-b border-white/10">
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
                <tbody>
                  {orders.map(po => (
                    <tr key={po.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2 font-mono text-cyan-300">{po.id}</td>
                      <td className="py-2 text-gray-200">{po.vendorName}</td>
                      <td className="py-2 text-gray-300">{po.itemName}</td>
                      <td className="py-2 text-right font-mono text-gray-100">{po.qty}</td>
                      <td className="py-2 text-right font-mono text-gray-100">${(po.qty * po.unitCost).toFixed(2)}</td>
                      <td className="py-2 text-gray-400">{po.orderDate}</td>
                      <td className="py-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${
                          po.status === 'Received'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                        }`}>
                          {po.status}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        {po.status === 'Open' ? (
                          <button
                            onClick={() => handleReceive(po.id)}
                            className="btn-secondary text-[11px] px-2.5 py-1 text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Receive
                          </button>
                        ) : (
                          <span className="text-[11px] text-gray-500">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr><td colSpan={8} className="py-4 text-center text-gray-500">No purchase orders yet.</td></tr>
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
