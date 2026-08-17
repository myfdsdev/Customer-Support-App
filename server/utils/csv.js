'use strict';

/**
 * Minimal RFC-4180-ish CSV parser.
 *
 * Handles quoted fields, escaped quotes ("") and embedded newlines. Written
 * in-house rather than pulled in as a dependency because the import path only
 * ever sees small, admin-uploaded purchase exports and adding a parser to the
 * dependency tree for that is not worth it.
 *
 * Returns { headers: string[], rows: Array<Record<string,string>> }.
 */
function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, ''); // strip BOM
  const records = [];
  let field = '';
  let record = [];
  let inQuotes = false;

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\r') {
      // handled by the \n branch; ignore
    } else if (ch === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  // Flush the final field/record if the file did not end with a newline.
  if (field.length || record.length) {
    record.push(field);
    records.push(record);
  }

  const nonEmpty = records.filter((r) => r.some((c) => String(c).trim() !== ''));
  if (!nonEmpty.length) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => String(h).trim());
  const rows = nonEmpty.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = cells[idx] !== undefined ? String(cells[idx]).trim() : '';
    });
    return obj;
  });

  return { headers, rows };
}

module.exports = { parseCsv };
