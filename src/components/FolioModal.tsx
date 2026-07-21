import React, { useState } from 'react';
import { Reservation, FolioItem } from '../types';
import { X, Receipt, Plus, DollarSign, CreditCard, Printer, CheckCircle2, ShieldAlert, FileText, Download } from 'lucide-react';

interface FolioModalProps {
  reservation: Reservation;
  onClose: () => void;
  onAddFolioItem: (resId: string, item: FolioItem) => void;
}

export const FolioModal: React.FC<FolioModalProps> = ({
  reservation,
  onClose,
  onAddFolioItem
}) => {
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<FolioItem['category']>('Minibar');
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

  const totalCharges = reservation.folioItems
    .filter(i => i.amount > 0)
    .reduce((acc, i) => acc + i.amount, 0);

  const totalPayments = Math.abs(reservation.folioItems
    .filter(i => i.amount < 0)
    .reduce((acc, i) => acc + i.amount, 0));

  const balance = totalCharges - totalPayments;

  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!desc || !amount) return;

    const newItem: FolioItem = {
      id: `f-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      description: desc,
      category,
      amount: parseFloat(amount),
      postedBy: 'Front Desk Admin'
    };

    onAddFolioItem(reservation.id, newItem);
    setDesc('');
    setAmount('');
  };

  const handleAddPayment = () => {
    if (balance <= 0) return;
    const paymentItem: FolioItem = {
      id: `f-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      description: 'Settle Balance - Credit Card',
      category: 'Payment',
      amount: -balance,
      postedBy: 'Front Desk Terminal'
    };
    onAddFolioItem(reservation.id, paymentItem);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-slide-up">
      <div className="glass-panel w-full max-w-2xl p-6 space-y-5 border border-white/20 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-gray-100">Guest Folio & Billing Ledger</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300">
                {reservation.code}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Guest: {reservation.guestName} • Room #{reservation.roomNumber} ({reservation.roomType})
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ledger Balance Summary Cards */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-900 border border-white/10">
            <div className="text-gray-400 font-semibold">Total Debits</div>
            <div className="text-sm font-bold text-gray-200 mt-1">${totalCharges}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-white/10">
            <div className="text-gray-400 font-semibold">Payments Received</div>
            <div className="text-sm font-bold text-emerald-400 mt-1">${totalPayments}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/30">
            <div className="text-gray-400 font-semibold">Outstanding Balance</div>
            <div className={`text-sm font-bold mt-1 font-mono ${balance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              ${balance}
            </div>
          </div>
        </div>

        {/* Itemized Folio Table */}
        <div className="border border-white/10 rounded-xl overflow-hidden text-xs">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-gray-400 border-b border-white/10">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Description</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 bg-slate-950/60">
              {reservation.folioItems.map((item) => (
                <tr key={item.id} className="hover:bg-white/[0.02]">
                  <td className="p-3 font-mono text-gray-400">{item.date}</td>
                  <td className="p-3 font-semibold text-gray-200">{item.description}</td>
                  <td className="p-3 text-gray-400">{item.category}</td>
                  <td className={`p-3 text-right font-mono font-bold ${item.amount < 0 ? 'text-emerald-400' : 'text-gray-200'}`}>
                    {item.amount < 0 ? `-$${Math.abs(item.amount)}` : `$${item.amount}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Manual Charge Form */}
        <form onSubmit={handleAddItem} className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 space-y-3 text-xs">
          <div className="font-bold text-gray-200">Post Custom Charge / Incidental</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              placeholder="Description (e.g. Laundry, Minibar...)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="p-2 rounded bg-slate-950 border border-white/10 text-gray-200"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as any)}
              className="p-2 rounded bg-slate-950 border border-white/10 text-gray-200"
            >
              <option value="Minibar">Minibar</option>
              <option value="F&B Restaurant">F&B Restaurant</option>
              <option value="Spa & Wellness">Spa & Wellness</option>
              <option value="Tax">Tax</option>
            </select>
            <input
              type="number"
              placeholder="Amount ($)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="p-2 rounded bg-slate-950 border border-white/10 text-amber-300 font-mono font-bold"
            />
          </div>
          <button type="submit" className="btn-secondary text-xs py-1.5 px-3">
            + Add Charge
          </button>
        </form>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => alert(`Simulating print invoice for Folio #${reservation.code}`)}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Print Statement
            </button>

            <button
              onClick={() => setShowEvidenceModal(true)}
              className="btn-secondary text-xs px-3 py-1.5 border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
              title="Compile evidence for credit card chargeback defense"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Chargeback Pack
            </button>
          </div>

          {balance > 0 ? (
            <button 
              onClick={handleAddPayment}
              className="btn-primary text-xs px-4 py-2"
            >
              <CreditCard className="w-4 h-4" /> Pay Balance (${balance})
            </button>
          ) : (
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Folio Fully Settled
            </span>
          )}
        </div>

        {/* Evidence Pack Modal */}
        {showEvidenceModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="glass-panel w-full max-w-lg p-5 space-y-4 border border-rose-500/40 text-xs">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div className="flex items-center gap-2 text-rose-400 font-bold">
                  <ShieldAlert className="w-4 h-4" /> Chargeback Dispute Evidence Pack
                </div>
                <button onClick={() => setShowEvidenceModal(false)} className="text-gray-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 space-y-2 border border-white/10">
                <div className="font-bold text-gray-200">Compiled Legal Defense Package</div>
                <div className="text-[11px] text-gray-400 space-y-1">
                  <div>✓ Guest Passport ID Verification: <strong>VERIFIED (AES-256)</strong></div>
                  <div>✓ Signed Terms & No-Show Policy: <strong>IP 192.168.1.4 (Timestamped)</strong></div>
                  <div>✓ Door Lock Bluetooth NFC Access Log: <strong>4 Unlocks Recorded on Room #{reservation.roomNumber}</strong></div>
                  <div>✓ Folio Charges Breakdown: <strong>${reservation.totalAmount} Total</strong></div>
                </div>
              </div>

              <button 
                onClick={() => {
                  alert(`Compiled dispute PDF for Reservation ${reservation.code}. Dispatched to Merchant Bank Processor.`);
                  setShowEvidenceModal(false);
                }}
                className="btn-primary text-xs w-full py-2 justify-center bg-rose-500 text-white shadow-rose-500/20"
              >
                <Download className="w-4 h-4" /> Download Chargeback Evidence PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
