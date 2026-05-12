/**
 * Parse a Kortex-exported `.csv.md` (or plain `.csv`) into an array of records.
 *
 * Kortex export format is:
 *   ---
 *   sourceFile: "foo.csv"
 *   ---
 *
 *   # foo.csv
 *
 *   <uuid>
 *
 *   foo\_filename.csv     (with backslash-escaped underscores)
 *
 *   <uuid>
 *
 *   col\_a,col\_b,col\_c
 *   row1a,row1b,row1c
 *   ...
 *
 * We strip everything before the CSV header row (the first non-noise line that
 * looks like a CSV header), then parse the remainder as RFC 4180 CSV, and
 * finally un-escape `\_` -> `_` in every cell.
 */

import fs from 'fs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FRONTMATTER_DELIM = '---';

function unescapeCell(value: string): string {
  // Kortex escapes underscores as \_. Some exports also escape brackets and
  // braces. Reverse those without touching other content.
  return value
    .replace(/\\_/g, '_')
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\#/g, '#');
}

function isLikelyHeaderLine(line: string): boolean {
  // A header row in our exports is a comma-separated list of identifiers
  // (lowercase letters, digits, escaped underscores, dots, hyphens).
  // It must contain at least 2 commas and no spaces in any token.
  if (!/,/.test(line)) return false;
  // Skip any line that is plainly markdown / a UUID / a filename hint.
  if (line.startsWith('#')) return false;
  if (UUID_RE.test(line.trim())) return false;
  if (/\.csv\s*$/.test(line.trim())) return false;
  // Header row test: every comma-separated token should be a slug-ish word,
  // with no double quotes or sentence-like content.
  const tokens = line.split(',');
  if (tokens.length < 2) return false;
  return tokens.every((t) => /^[A-Za-z0-9_\\.\-#/ ]+$/.test(t.trim()));
}

function stripFrontmatter(raw: string): string {
  // Remove a leading YAML frontmatter block bounded by --- on its own line.
  if (!raw.startsWith(FRONTMATTER_DELIM)) return raw;
  const lines = raw.split(/\r?\n/);
  let i = 1;
  while (i < lines.length && lines[i].trim() !== FRONTMATTER_DELIM) i++;
  if (i < lines.length) {
    return lines.slice(i + 1).join('\n');
  }
  return raw;
}

/**
 * Robust RFC 4180-ish CSV parser.
 *
 * Handles:
 *  - Quoted fields containing commas, newlines, and escaped quotes ("")
 *  - Trailing CRLF / LF
 *  - Empty trailing lines
 *  - Mismatched columns (pads / truncates to header length and warns once)
 */
function parseCsv(text: string): { header: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (c === '\n' || c === '\r') {
      // Handle CRLF: skip the LF after a CR.
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      // Drop fully empty rows (no cell content).
      if (row.length > 1 || (row.length === 1 && row[0].length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }
    cell += c;
  }
  // Flush trailing cell/row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.length > 1 || (row.length === 1 && row[0].length > 0)) {
      rows.push(row);
    }
  }

  if (rows.length === 0) return { header: [], rows: [] };
  const header = rows[0].map((h) => unescapeCell(h.trim()));
  const body = rows
    .slice(1)
    .filter((r) => r.length > 0 && !(r.length === 1 && r[0].trim() === ''))
    .map((r) => r.map((v) => unescapeCell(v)));
  return { header, rows: body };
}

export interface ParsedCsv<T = Record<string, string>> {
  header: string[];
  rows: T[];
}

export interface ParsedCsvRaw {
  header: string[];
  rows: string[][];
}

export interface ParseOptions {
  /**
   * Index (in the header array) of a column where any overflow cells (when a
   * row has *more* cells than the header) should be merged. We join the
   * overflow with `, ` and tack it onto the named column. This lets us recover
   * gracefully when source CSVs have un-quoted commas inside a long-text
   * column without losing data.
   *
   * If null/undefined, overflow cells are silently truncated (preserves the
   * historic behavior).
   */
  overflowMergeColumn?: string;
}

function findHeaderIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (isLikelyHeaderLine(lines[i])) return i;
  }
  // Fallback: first comma-bearing line that isn't a header/UUID.
  for (let i = 0; i < lines.length; i++) {
    if (
      lines[i].includes(',') &&
      !lines[i].startsWith('#') &&
      !UUID_RE.test(lines[i].trim())
    ) {
      return i;
    }
  }
  return -1;
}

export function parseCsvMdRaw(filepath: string): ParsedCsvRaw {
  const raw = fs.readFileSync(filepath, 'utf8');
  const stripped = stripFrontmatter(raw);
  const lines = stripped.split(/\r?\n/);
  const headerIdx = findHeaderIndex(lines);
  if (headerIdx === -1) return { header: [], rows: [] };
  const csvText = lines.slice(headerIdx).join('\n');
  return parseCsv(csvText);
}

export function parseCsvMd(filepath: string, options: ParseOptions = {}): ParsedCsv {
  const { header, rows } = parseCsvMdRaw(filepath);
  if (header.length === 0) return { header: [], rows: [] };
  const overflowIdx =
    options.overflowMergeColumn != null ? header.indexOf(options.overflowMergeColumn) : -1;

  const records: Record<string, string>[] = rows.map((row) => {
    const rec: Record<string, string> = {};
    if (row.length > header.length && overflowIdx >= 0) {
      // Salvage overflow cells by merging them into the configured column.
      // Layout assumption: cells [0..overflowIdx-1] are correct, cells
      // [overflowIdx..(overflowIdx+overflowCount)] all belong to the overflow
      // column, and cells [(overflowIdx+overflowCount+1)..] tail-align to the
      // remaining header columns.
      const overflowCount = row.length - header.length;
      header.forEach((col, i) => {
        if (i < overflowIdx) {
          rec[col] = (row[i] ?? '').trim();
        } else if (i === overflowIdx) {
          const merged = row
            .slice(overflowIdx, overflowIdx + overflowCount + 1)
            .map((v) => v.trim())
            .filter(Boolean)
            .join(', ');
          rec[col] = merged;
        } else {
          rec[col] = (row[i + overflowCount] ?? '').trim();
        }
      });
    } else {
      header.forEach((col, i) => {
        rec[col] = (row[i] ?? '').trim();
      });
    }
    return rec;
  });
  return { header, rows: records };
}

/** Tiny helper to split `;`- or `|`-delimited list cells. */
export function splitList(value: string | undefined, sep: RegExp = /[|;]/): string[] {
  if (!value) return [];
  return value
    .split(sep)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Coerce a string to int with a fallback. */
export function toInt(value: string | undefined, fallback = 0): number {
  const n = parseInt((value ?? '').trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Coerce a string like "true"/"yes"/"1" to boolean. */
export function toBool(value: string | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'true' || v === 'yes' || v === '1';
}
