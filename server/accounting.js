// Shared double-entry postings created by operational folio workflows.
import { db, tx, uid } from './db.js';

export const toMoney = (value) => Math.round(value * 100) / 100;

const revenueAccountFor = (category) => {
  if (category === 'Room Charge') return 'gl-4000';
  if (category === 'Tax') return 'gl-2100';
  if (category === 'F&B Restaurant' || category === 'Minibar') return 'gl-4100';
  return 'gl-4200';
};

export function postFolioJournal({ folioItemId, date, description, source, category, amount }) {
  const normalizedAmount = toMoney(amount);
  if (!Number.isFinite(normalizedAmount) || Math.abs(normalizedAmount) < 0.005) return null;
  if (folioItemId && db.prepare('SELECT 1 FROM folio_journal_postings WHERE folio_item_id = ?').get(folioItemId)) {
    return null;
  }

  let debitAccount;
  let creditAccount;
  if (category === 'Payment') {
    // A negative folio line is money received; a positive line is a refund.
    [debitAccount, creditAccount] = normalizedAmount < 0
      ? ['gl-1000', 'gl-1100']
      : ['gl-1100', 'gl-1000'];
  } else {
    const revenueAccount = revenueAccountFor(category);
    [debitAccount, creditAccount] = normalizedAmount > 0
      ? ['gl-1100', revenueAccount]
      : [revenueAccount, 'gl-1100'];
  }

  const absoluteAmount = Math.abs(normalizedAmount);
  const entryId = uid('je');
  db.prepare('INSERT INTO journal_entries (id, date, description, source) VALUES (?, ?, ?, ?)')
    .run(entryId, date, description, source);
  db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
    .run(uid('jl'), entryId, debitAccount, absoluteAmount, 0);
  db.prepare('INSERT INTO journal_lines (id, entry_id, account_id, debit, credit) VALUES (?, ?, ?, ?, ?)')
    .run(uid('jl'), entryId, creditAccount, 0, absoluteAmount);
  if (folioItemId) {
    db.prepare('INSERT INTO folio_journal_postings (folio_item_id, journal_entry_id, created_at) VALUES (?, ?, ?)')
      .run(folioItemId, entryId, new Date().toISOString());
  }
  return entryId;
}

export function backfillOperationalFolioJournals() {
  const rows = db.prepare(`
    SELECT f.*, res.guestName, res.roomNumber
    FROM folio_items f JOIN reservations res ON res.id = f.reservation_id
    WHERE f.postedBy != 'Night Audit'
      AND NOT EXISTS (
        SELECT 1 FROM folio_journal_postings p WHERE p.folio_item_id = f.id
      )
    ORDER BY f.date, f.id
  `).all();
  if (rows.length === 0) return 0;
  tx(() => {
    for (const item of rows) {
      postFolioJournal({
        folioItemId: item.id,
        date: item.date,
        description: `${item.description} (${item.guestName}, room ${item.roomNumber})`,
        source: 'Guest Folio',
        category: item.category,
        amount: item.amount,
      });
    }
  });
  return rows.length;
}
