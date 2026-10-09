import type { ImportRow } from '../ui/ImportSheet';
import type { Metal } from '../types/holding';

const METAL_ALIASES: Record<string, Metal> = {
  gold: 'gold',
  au: 'gold',
  silver: 'silver',
  ag: 'silver',
  platinum: 'platinum',
  pt: 'platinum',
  palladium: 'palladium',
  pd: 'palladium',
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function toMetal(v: unknown): Metal | undefined {
  if (typeof v !== 'string') return undefined;
  return METAL_ALIASES[v.trim().toLowerCase()];
}

function toNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function toDate(v: unknown): string | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

function rowToImport(obj: Record<string, unknown>): ImportRow {
  const n: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) n[normalizeHeader(k)] = v;
  return {
    description: firstString(n.product, n.description, n.name, n.item, n.type),
    metal: toMetal(n.metal),
    weight: toNumber(n.ozperpiece ?? n.weight ?? n.ozt ?? n.oz ?? n.troyoz),
    quantity: toNumber(n.quantity ?? n.qty) ?? 1,
    purchasePrice: toNumber(n.priceperpiece ?? n.purchaseprice ?? n.unitprice ?? n.price ?? n.cost),
    purchaseDate: toDate(n.purchasedate ?? n.date),
    dealer: firstString(n.dealer, n.source, n.seller),
    taxes: toNumber(n.taxes ?? n.tax),
    shipping: toNumber(n.shipping),
  };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCSV(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i];
    });
    return rowToImport(obj);
  });
}

/** Rows from a CSV or Excel file. Excel support loads only when needed. */
export async function parseSpreadsheet(file: File): Promise<ImportRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') return parseCSV(await file.text());
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }).map(rowToImport);
}

export { parseCSV as parseCsvText };
