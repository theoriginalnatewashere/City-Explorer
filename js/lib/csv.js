/* RFC 4180 CSV parser. Handles quoted fields, embedded commas/newlines,
 * escaped quotes, and CRLF. Returns array of objects keyed by header row. */

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // strip UTF-8 BOM
  let i = 0;
  const n = src.length;

  const endField = () => { row.push(field); field = ""; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  while (i < n) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ",") { endField(); i++; continue; }
    if (ch === "\r") { if (src[i + 1] === "\n") i++; endRow(); i++; continue; }
    if (ch === "\n") { endRow(); i++; continue; }
    field += ch; i++;
  }
  if (field.length > 0 || row.length > 0) endRow();

  // drop trailing fully-empty rows
  while (rows.length && rows[rows.length - 1].every((f) => f === "")) rows.pop();

  if (!rows.length) return [];
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const o = {};
    header.forEach((h, j) => { o[h] = r[j] !== undefined ? r[j] : ""; });
    return o;
  });
}
