import React, { useState } from 'react';
import { Reservation, FolioItem } from '../types';
import { X, CreditCard, Printer, CheckCircle2, ShieldAlert, Download } from 'lucide-react';

interface FolioModalProps {
  reservation: Reservation;
  onClose: () => void;
  onAddFolioItem: (resId: string, item: FolioItem) => void | boolean | Promise<void | boolean>;
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
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const folioOpen = ['Confirmed', 'Checked-In'].includes(reservation.status);

  const downloadFile = (filename: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadStatement = () => {
    const escapeCsv = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ['Date', 'Description', 'Category', 'Amount', 'Posted By'],
      ...reservation.folioItems.map((item) => [
        item.date,
        item.description,
        item.category,
        item.amount.toFixed(2),
        item.postedBy,
      ]),
    ];
    downloadFile(
      `folio-${reservation.code}.csv`,
      rows.map((row) => row.map(escapeCsv).join(',')).join('\n'),
      'text/csv;charset=utf-8',
    );
  };

  const handleDownloadEvidence = () => {
    downloadFile(
      `chargeback-evidence-${reservation.code}.json`,
      JSON.stringify({
        generatedAt: new Date().toISOString(),
        reservation: {
          code: reservation.code,
          guestName: reservation.guestName,
          guestEmail: reservation.guestEmail,
          roomNumber: reservation.roomNumber,
          checkIn: reservation.checkIn,
          checkOut: reservation.checkOut,
          channel: reservation.channel,
        },
        folioItems: reservation.folioItems,
        totals: { totalCharges, totalPayments, balance, unpostedContractRoomRevenue, projectedBalance },
        unavailableEvidence: ['Identity document', 'signed terms', 'door-lock access log'],
      }, null, 2),
      'application/json;charset=utf-8',
    );
    setShowEvidenceModal(false);
  };

  const totalCharges = reservation.folioItems
    .filter(i => i.category !== 'Payment')
    .reduce((acc, i) => acc + i.amount, 0);

  const totalPayments = -reservation.folioItems
    .filter(i => i.category === 'Payment')
    .reduce((acc, i) => acc + i.amount, 0);

  const balance = Math.round((totalCharges - totalPayments) * 100) / 100;
  const postedRoomRevenue = Math.round(
    reservation.folioItems
      .filter((item) => item.category === 'Room Charge')
      .reduce((sum, item) => sum + item.amount, 0) * 100,
  ) / 100;
  const unpostedContractRoomRevenue = folioOpen
    ? Math.max(0, Math.round((reservation.totalAmount - postedRoomRevenue) * 100) / 100)
    : 0;
  const projectedBalance = Math.round((balance + unpostedContractRoomRevenue) * 100) / 100;

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!desc.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Enter a description and a positive charge amount.');
      return;
    }

    const newItem: FolioItem = {
      id: `f-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      description: desc.trim(),
      category,
      amount: parsedAmount,
      postedBy: 'Front Desk Admin'
    };

    setPosting(true);
    setError('');
    try {
      const result = await onAddFolioItem(reservation.id, newItem);
      if (result !== false) {
        setDesc('');
        setAmount('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post the folio charge.');
    } finally {
      setPosting(false);
    }
  };

  const handleAddPayment = async () => {
    if (projectedBalance <= 0) return;
    const paymentItem: FolioItem = {
      id: `f-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      description: 'Contract / Folio Payment - Credit Card',
      category: 'Payment',
      amount: -projectedBalance,
      postedBy: 'Front Desk Terminal'
    };
    setPosting(true);
    setError('');
    try {
      await onAddFolioItem(reservation.id, paymentItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to post the payment.');
    } finally {
      setPosting(false);
    }
  };

  const handleRefundCredit = async () => {
    if (projectedBalance >= 0) return;
    const refundItem: FolioItem = {
      id: `f-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      description: 'Refund Credit Balance - Credit Card',
      category: 'Payment',
      amount: -projectedBalance,
      postedBy: 'Front Desk Terminal',
    };
    setPosting(true);
    setError('');
    try {
      await onAddFolioItem(reservation.id, refundItem);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record the refund.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-slide-up">
      <div
        className="glass-panel w-full max-w-2xl p-6 space-y-5 border border-white/20 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folio-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 id="folio-dialog-title" className="text-lg font-bold text-gray-100">Guest Folio & Billing Ledger</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300">
                {reservation.code}
              </span>
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              Guest: {reservation.guestName} • Room #{reservation.roomNumber} ({reservation.roomType})
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10"
            aria-label="Close guest folio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-200">
            {error}
          </div>
        )}

        {/* Ledger Balance Summary Cards */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-900 border border-white/10">
            <div className="text-gray-400 font-semibold">Net Charges</div>
            <div className="text-sm font-bold text-gray-200 mt-1">${totalCharges.toFixed(2)}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-white/10">
            <div className="text-gray-400 font-semibold">Net Payments</div>
            <div className="text-sm font-bold text-emerald-400 mt-1">${totalPayments.toFixed(2)}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-900 border border-amber-500/30">
            <div className="text-gray-400 font-semibold">Outstanding Balance</div>
            <div className={`text-sm font-bold mt-1 font-mono ${balance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              ${balance.toFixed(2)}
            </div>
          </div>
        </div>

        {folioOpen && unpostedContractRoomRevenue > 0.005 && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-cyan-100">
            ${unpostedContractRoomRevenue.toFixed(2)} of contracted room revenue is not posted yet. The projected balance after those charges is{' '}
            <strong>{projectedBalance > 0.005
              ? `$${projectedBalance.toFixed(2)} due`
              : projectedBalance < -0.005
                ? `$${Math.abs(projectedBalance).toFixed(2)} credit`
                : 'fully covered'}</strong>. Checkout posts the remaining contract before closing the folio.
          </div>
        )}

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
                    {item.amount < 0 ? `-$${Math.abs(item.amount).toFixed(2)}` : `$${item.amount.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Manual Charge Form */}
        {folioOpen ? (
        <form onSubmit={handleAddItem} className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 space-y-3 text-xs">
          <div className="font-bold text-gray-200">Post Custom Charge / Incidental</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label htmlFor="folio-charge-description" className="sr-only">Charge description</label>
            <input
              id="folio-charge-description"
              type="text"
              placeholder="Description (e.g. Laundry, Minibar...)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="p-2 rounded bg-slate-950 border border-white/10 text-gray-200"
            />
            <label htmlFor="folio-charge-category" className="sr-only">Charge category</label>
            <select
              id="folio-charge-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as FolioItem['category'])}
              className="p-2 rounded bg-slate-950 border border-white/10 text-gray-200"
            >
              <option value="Minibar">Minibar</option>
              <option value="F&B Restaurant">F&B Restaurant</option>
              <option value="Spa & Wellness">Spa & Wellness</option>
              <option value="Tax">Tax</option>
              <option value="Other Income">Other Income</option>
            </select>
            <label htmlFor="folio-charge-amount" className="sr-only">Charge amount</label>
            <input
              id="folio-charge-amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount ($)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="p-2 rounded bg-slate-950 border border-white/10 text-amber-300 font-mono font-bold"
            />
          </div>
          <button type="submit" disabled={posting} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50">
            {posting ? 'Posting…' : '+ Add Charge'}
          </button>
        </form>
        ) : (
          <div className="rounded-xl border border-white/10 bg-slate-900/80 p-3.5 text-xs text-gray-400">
            This {reservation.status.toLowerCase()} folio is read-only. Statement and evidence exports remain available.
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
          <div className="flex items-center gap-2">
            <button 
              type="button"
              onClick={handleDownloadStatement}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              <Printer className="w-3.5 h-3.5" /> Download Statement
            </button>

            <button
              onClick={() => setShowEvidenceModal(true)}
              className="btn-secondary text-xs px-3 py-1.5 border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
              title="Compile evidence for credit card chargeback defense"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> Chargeback Pack
            </button>
          </div>

          {folioOpen && projectedBalance > 0.005 ? (
            <button 
              onClick={handleAddPayment}
              disabled={posting}
              className="btn-primary text-xs px-4 py-2 disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" /> Record Payment (${projectedBalance.toFixed(2)})
            </button>
          ) : folioOpen && projectedBalance < -0.005 ? (
            <button
              onClick={handleRefundCredit}
              disabled={posting}
              className="btn-secondary text-xs px-4 py-2 border-cyan-500/30 text-cyan-300 disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" /> Record Refund (${Math.abs(projectedBalance).toFixed(2)})
            </button>
          ) : folioOpen ? (
            <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> {unpostedContractRoomRevenue > 0.005 ? 'Contract Covered' : 'Folio Fully Settled'}
            </span>
          ) : (
            <span className="text-xs font-semibold text-gray-500">Closed folio</span>
          )}
        </div>

        {/* Evidence Pack Modal */}
        {showEvidenceModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div
              className="glass-panel w-full max-w-lg p-5 space-y-4 border border-rose-500/40 text-xs"
              role="dialog"
              aria-modal="true"
              aria-labelledby="chargeback-dialog-title"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div id="chargeback-dialog-title" className="flex items-center gap-2 text-rose-400 font-bold">
                  <ShieldAlert className="w-4 h-4" /> Chargeback Dispute Evidence Pack
                </div>
                <button type="button" onClick={() => setShowEvidenceModal(false)} className="text-gray-400 hover:text-white" aria-label="Close chargeback evidence dialog">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-900 space-y-2 border border-white/10">
                <div className="font-bold text-gray-200">Available Evidence Summary</div>
                <div className="text-[11px] text-gray-400 space-y-1">
                  <div>✓ Reservation record: <strong>{reservation.code}</strong></div>
                  <div>✓ Stay dates: <strong>{reservation.checkIn} to {reservation.checkOut}</strong></div>
                  <div>✓ Folio entries: <strong>{reservation.folioItems.length} records</strong></div>
                  <div>✓ Current folio balance: <strong>${balance.toFixed(2)}</strong></div>
                  <div className="pt-1 text-amber-300">Identity, signed terms, and door-lock logs are not stored by this prototype and are listed as unavailable in the export.</div>
                </div>
              </div>

              <button 
                type="button"
                onClick={handleDownloadEvidence}
                className="btn-primary text-xs w-full py-2 justify-center bg-rose-500 text-white shadow-rose-500/20"
              >
                <Download className="w-4 h-4" /> Download Evidence JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
