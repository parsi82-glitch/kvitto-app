// Export till CSV i det format svensk Excel förväntar sig:
// semikolon som avgränsare, decimalkomma och UTF-8 med BOM (så att å, ä, ö blir rätt).

import { CLASSES } from './tax.js';

const cell = (value) => {
  const s = String(value ?? '');
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const amount = (n) => (Number(n) || 0).toFixed(2).replace('.', ',');

export function receiptsToCsv(receipts) {
  const header = ['Datum', 'Butik', 'Belopp (kr)', 'Kategori', 'Klassning', 'Kommentar', 'Foto'];
  const lines = receipts.map((r) =>
    [
      r.date,
      r.store,
      amount(r.amount),
      r.category,
      CLASSES[r.classification]?.label ?? r.classification,
      r.comment,
      r.hasPhoto ? 'Ja' : 'Nej',
    ]
      .map(cell)
      .join(';'),
  );
  return '﻿' + [header.join(';'), ...lines].join('\r\n');
}

/** Delar filen via telefonens delningsmeny om det går, annars laddas den ner. */
export async function exportCsv(receipts) {
  const date = new Date().toISOString().slice(0, 10);
  const filename = `kvitton-stavsnas-${date}.csv`;
  const file = new File([receiptsToCsv(receipts)], filename, { type: 'text/csv' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Kvitton Stavsnäs' });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return; // användaren avbröt
    }
  }
  const url = URL.createObjectURL(file);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
