import React, { useEffect, useState } from 'react';
import { Reservation, FolioItem } from '../types';
import { api } from '../api';
import { PaymentModal } from './PaymentModal';
import { X, CreditCard, Printer, CheckCircle2, ShieldAlert, Download } from 'lucide-react';

interface FolioModalProps {
  reservation: Reservation;
  onClose: () => void;
  onAddFolioItem: (resId: string, item: FolioItem) => void | boolean | Promise<void | boolean>;
}

export const FolioModal: React.FC<FolioModalProps> = ({
  reservation: reservationProp,
  onClose,
  onAddFolioItem
}) => {
  const [reservation, setReservation] = useState<Reservation>(reservationProp);
  useEffect(() => setReservation(reservationProp), [reservationProp]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
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

  const handlePaymentPosted = async () => {
    setShowPaymentModal(false);
    try {
      const list = await api.get<Reservation[]>('/reservations');
      const updated = list.find((item) => item.id === reservation.id);
      if (updated) setReservation(updated);
    } catch {
      // Keep showing the pre-payment folio; the next parent refresh syncs it.
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-slide-up">
      <div
        className="surface-panel bg-white w-full max-w-2xl p-6 space-y-5 border border-slate-200 shadow-2xl relative max-h-[90vh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="folio-dialog-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 id="folio-dialog-title" className="text-lg font-bold text-slate-900">Guest Folio & Billing Ledger</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300">
                {reservation.code}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-0.5 font-medium">
              Guest: {reservation.guestName} • Room #{reservation.roomNumber} ({reservation.roomType})
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100"
            aria-label="Close guest folio"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
            {error}
          </div>
        )}

        {/* Ledger Balance Summary Cards */}
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-slate-500 font-bold uppercase text-[10px]">Net Charges</div>
            <div className="text-base font-extrabold text-slate-900 mt-1">${totalCharges.toFixed(2)}</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="text-slate-500 font-bold uppercase text-[10px]">Net Payments</div>
            <div className="text-base font-extrabold text-emerald-700 mt-1">${totalPayments.toFixed(2)}</div>
          </div>
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
            <div className="text-slate-600 font-bold uppercase text-[10px]">Outstanding Balance</div>
            <div className={`text-base font-extrabold mt-1 font-mono ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              ${balance.toFixed(2)}
            </div>
          </div>
        </div>

        {folioOpen && unpostedContractRoomRevenue > 0.005 && (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900 font-medium">
            ${unpostedContractRoomRevenue.toFixed(2)} of contracted room revenue is not posted yet. The projected balance after those charges is{' '}
            <strong>{projectedBalance > 0.005
              ? `$${projectedBalance.toFixed(2)} due`
              : projectedBalance < -0.005
                ? `$${Math.abs(projectedBalance).toFixed(2)} credit`
                : 'fully covered'}</strong>. Checkout posts the remaining contract before closing the folio.
          </div>
        )}

        {/* Itemized Folio Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
              <tr>
                <th className="p-3">Date</th>
                <th className="p-3">Description</th>
                <th className="p-3">Category</th>
                <th className="p-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {reservation.folioItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="p-3 font-mono text-slate-600">{item.date}</td>
                  <td className="p-3 font-bold text-slate-900">{item.description}</td>
                  <td className="p-3 text-slate-600">{item.category}</td>
                  <td className={`p-3 text-right font-mono font-bold ${item.amount < 0 ? 'text-emerald-700' : 'text-slate-900'}`}>
                    {item.amount < 0 ? `-$${Math.abs(item.amount).toFixed(2)}` : `$${item.amount.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Manual Charge Form */}
        {folioOpen ? (
        <form onSubmit={handleAddItem} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
          <div className="font-bold text-slate-900">Post Custom Charge / Incidental</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <label htmlFor="folio-charge-description" className="sr-only">Charge description</label>
            <input
              id="folio-charge-description"
              type="text"
              placeholder="Description (e.g. Laundry, Minibar...)"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              className="field-control text-xs"
            />
            <label htmlFor="folio-charge-category" className="sr-only">Charge category</label>
            <select
              id="folio-charge-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as FolioItem['category'])}
              className="field-control text-xs"
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
              className="field-control text-xs text-amber-800 font-mono font-bold"
            />
          </div>
          <button type="submit" disabled={posting} className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50">
            {posting ? 'Posting…' : '+ Add Charge'}
          </button>
        </form>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-600 font-medium">
            This {reservation.status.toLowerCase()} folio is read-only. Statement and evidence exports remain available.
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200">
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
              className="btn-secondary text-xs px-3 py-1.5 border-rose-200 text-rose-800 hover:bg-rose-50"
              title="Compile evidence for credit card chargeback defense"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" /> Chargeback Pack
            </button>

            {folioOpen && balance > 0.005 && (
              <button
                type="button"
                onClick={() => setShowPaymentModal(true)}
                className="btn-secondary text-xs px-3 py-1.5 border-emerald-200 text-emerald-800 hover:bg-emerald-50"
                title="Charge a card through the payments provider"
              >
                <CreditCard className="w-3.5 h-3.5 text-emerald-600" /> Take Payment
              </button>
            )}
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
              className="btn-secondary text-xs px-4 py-2 border-cyan-200 text-cyan-800 disabled:opacity-50"
            >
              <CreditCard className="w-4 h-4" /> Record Refund (${Math.abs(projectedBalance).toFixed(2)})
            </button>
          ) : folioOpen ? (
            <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> {unpostedContractRoomRevenue > 0.005 ? 'Contract Covered' : 'Folio Fully Settled'}
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-500">Closed folio</span>
          )}
        </div>

        {/* Stripe Payment Modal */}
        {showPaymentModal && (
          <PaymentModal
            reservation={reservation}
            onClose={() => setShowPaymentModal(false)}
            onPosted={() => { void handlePaymentPosted(); }}
          />
        )}

        {/* Evidence Pack Modal */}
        {showEvidenceModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-4">
            <div
              className="surface-panel bg-white w-full max-w-lg p-5 space-y-4 border border-rose-300 text-xs shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="chargeback-dialog-title"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div id="chargeback-dialog-title" className="flex items-center gap-2 text-rose-700 font-bold">
                  <ShieldAlert className="w-4 h-4 text-rose-600" /> Chargeback Dispute Evidence Pack
                </div>
                <button type="button" onClick={() => setShowEvidenceModal(false)} className="text-slate-400 hover:text-slate-900" aria-label="Close chargeback evidence dialog">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 space-y-2 border border-slate-200">
                <div className="font-bold text-slate-900">Available Evidence Summary</div>
                <div className="text-[11px] text-slate-700 space-y-1 font-medium">
                  <div>✓ Reservation record: <strong>{reservation.code}</strong></div>
                  <div>✓ Stay dates: <strong>{reservation.checkIn} to {reservation.checkOut}</strong></div>
                  <div>✓ Folio entries: <strong>{reservation.folioItems.length} records</strong></div>
                  <div>✓ Current folio balance: <strong>${balance.toFixed(2)}</strong></div>
                  <div className="pt-1 text-amber-800 font-semibold">Identity, signed terms, and door-lock logs are not stored by this prototype and are listed as unavailable in the export.</div>
                </div>
              </div>

              <button 
                type="button"
                onClick={handleDownloadEvidence}
                className="btn-primary text-xs w-full py-2 justify-center bg-rose-600 hover:bg-rose-700 text-white shadow-xs"
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
