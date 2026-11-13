// Avdragsberäkning för förbättringsutgifter vid försäljning av privatbostad.
// Reglerna är dokumenterade i README.md. Detta är en uppskattning, inte skatterådgivning.

export const CLASSES = {
  grund: {
    label: 'Grundförbättring',
    short: 'Grundförbättring',
    help: 'Ny-, till- eller ombyggnad, eller byte till bättre material. Avdrag utan tidsgräns.',
  },
  reparation: {
    label: 'Reparation & underhåll',
    short: 'Rep. & underhåll',
    help: 'Målning, tapetsering, byte till likvärdigt. Avdrag bara de senaste fem åren före försäljning.',
  },
  drift: {
    label: 'Driftskostnad',
    short: 'Drift',
    help: 'El, försäkring, sotning, sophämtning m.m. Ger inget avdrag.',
  },
};

export const THRESHOLD = 5000; // kr per kalenderår, sammanlagda förbättringsutgifter
export const REPAIR_YEARS_BACK = 5; // försäljningsåret + fem föregående kalenderår

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Summerar kvitton per kalenderår och uppskattar avdragsgillt belopp
 * om fastigheten säljs under `saleYear`.
 *
 * - Grundförbättringar räknas oavsett år (men inte efter försäljningsåret).
 * - Reparation & underhåll räknas bara inom [saleYear - 5, saleYear].
 * - Ett år är bara avdragsgillt om det som räknas uppgår till minst 5 000 kr.
 *   (Försiktigt: reparationer utanför femårsfönstret räknas inte in i gränsen.)
 * - Driftskostnader ger aldrig avdrag.
 */
export function summarize(receipts, saleYear) {
  const byYear = new Map();
  for (const r of receipts) {
    const year = Number(String(r.date).slice(0, 4));
    if (!Number.isFinite(year)) continue;
    if (!byYear.has(year)) byYear.set(year, { year, grund: 0, reparation: 0, drift: 0, count: 0 });
    const row = byYear.get(year);
    if (r.classification in CLASSES) row[r.classification] += Number(r.amount) || 0;
    row.count += 1;
  }

  const rows = [...byYear.values()]
    .sort((a, b) => b.year - a.year)
    .map((row) => {
      const afterSale = row.year > saleYear;
      const repairInWindow = !afterSale && row.year >= saleYear - REPAIR_YEARS_BACK;
      const countedGrund = afterSale ? 0 : row.grund;
      const countedRepair = repairInWindow ? row.reparation : 0;
      const basis = round2(countedGrund + countedRepair);
      const meetsThreshold = basis >= THRESHOLD;
      return {
        year: row.year,
        count: row.count,
        grund: round2(row.grund),
        reparation: round2(row.reparation),
        drift: round2(row.drift),
        afterSale,
        repairInWindow,
        basis,
        meetsThreshold,
        deductible: meetsThreshold ? basis : 0,
      };
    });

  const totals = rows.reduce(
    (t, r) => ({
      grund: t.grund + r.grund,
      reparation: t.reparation + r.reparation,
      drift: t.drift + r.drift,
      deductible: t.deductible + r.deductible,
    }),
    { grund: 0, reparation: 0, drift: 0, deductible: 0 },
  );
  for (const k of Object.keys(totals)) totals[k] = round2(totals[k]);

  return { rows, totals };
}
