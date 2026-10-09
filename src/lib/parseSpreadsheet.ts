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

const DAY_MS = 86_400_000;
const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * Excel keeps a date as a count of days from Dec 30, 1899, or from Jan 1, 1904
 * in workbooks saved with the 1904 date system, and SheetJS hands over that
 * count. Anything outside 1950 to 2100 isn't taken for a purchase date.
 */
export function excelSerialDate(serial: number, date1904 = false): string | undefined {
  if (!Number.isFinite(serial)) return undefined;
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const iso = new Date(base + Math.floor(serial) * DAY_MS).toISOString().slice(0, 10);
  return iso >= '1950-01-01' && iso <= '2100-12-31' ? iso : undefined;
}

function toDate(v: unknown, date1904 = false): string | undefined {
  if (typeof v === 'number') return excelSerialDate(v, date1904);
  if (!v) return undefined;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  // A date written without a time reads as local midnight, so its local parts
  // are the day that was written, wherever the browser is.
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function firstString(...values: unknown[]): string | undefined {
  for (const v of values) if (typeof v === 'string' && v.trim()) return v.trim();
  return undefined;
}

// Weight (oz) is the header the earlier TroyStack web export wrote.
function rowToImport(obj: Record<string, unknown>, { date1904 = false } = {}): ImportRow {
  const n: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) n[normalizeHeader(k)] = v;
  return {
    description: firstString(n.product, n.description, n.name, n.item, n.type),
    metal: toMetal(n.metal),
    weight: toNumber(n.ozperpiece ?? n.weight ?? n.weightoz ?? n.weightozt ?? n.ozt ?? n.oz ?? n.troyoz),
    quantity: toNumber(n.quantity ?? n.qty) ?? 1,
    purchasePrice: toNumber(n.priceperpiece ?? n.purchaseprice ?? n.unitprice ?? n.price ?? n.cost),
    purchaseDate: toDate(n.purchasedate ?? n.date, date1904),
    dealer: firstString(n.dealer, n.source, n.seller),
    taxes: toNumber(n.taxes ?? n.tax),
    shipping: toNumber(n.shipping),
    note: firstString(n.note, n.notes, n.comment, n.comments, n.memo),
  };
}

/**
 * The cells of each record. A quoted cell can hold commas, doubled quotes and
 * line breaks, which is how the stack export writes a note with a new line.
 */
function csvRecords(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((v) => v !== '')) records.push(row);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') cell += c;
      else if (src[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = false;
    } else if (c === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (c === ',') {
      endCell();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      endRow();
    } else {
      cell += c;
    }
  }
  endRow();
  return records;
}

function parseCSV(text: string): ImportRow[] {
  const [headers, ...records] = csvRecords(text);
  if (!headers || records.length === 0) return [];
  return records.map((cells) => {
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
  const date1904 = Boolean(wb.Workbook?.WBProps?.date1904);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }).map((row) => rowToImport(row, { date1904 }));
}

export { parseCSV as parseCsvText };
