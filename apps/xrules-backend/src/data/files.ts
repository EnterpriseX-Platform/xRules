// Read Excel/CSV files and check them against a FileTemplate (TOR 4.4.1.7).
import ExcelJS from 'exceljs';

export interface Finding {
  ruleCode: string; severity: 'ERROR' | 'WARNING' | 'SKIPPED' | 'INFO';
  message: string; lineId?: string; fileId?: string; field?: string; ref?: any;
}

export interface TemplateSpec {
  extensions?: string[]; maxBytes?: number;
  sheets: Array<{ name: string; headerRow?: number; columns: Array<{ name: string; type?: 'string' | 'number' | 'date'; required?: boolean }> }>;
}

export async function fetchFile(f: { url?: string; contentBase64?: string }): Promise<Buffer> {
  if (f.contentBase64) return Buffer.from(f.contentBase64, 'base64');
  if (!f.url || !/^https?:\/\//i.test(f.url)) throw new Error('file needs url (http/https) or contentBase64');
  const res = await fetch(f.url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function cellText(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t: any) => t.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return String(v.result);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

async function loadWorkbook(buf: Buffer, name: string) {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(name)) {
    const { Readable } = await import('node:stream');
    await wb.csv.read(Readable.from(buf));
  } else {
    await wb.xlsx.load(buf as any);
  }
  return wb;
}

/** Rows of one sheet as objects keyed by the header row. */
export async function readSheet(buf: Buffer, name: string, sheet?: string, headerRow = 1): Promise<Record<string, any>[]> {
  const wb = await loadWorkbook(buf, name);
  const ws = sheet ? wb.getWorksheet(sheet) : wb.worksheets[0];
  if (!ws) throw new Error(`sheet '${sheet}' not found`);
  const headers: string[] = [];
  ws.getRow(headerRow).eachCell({ includeEmpty: true }, (c, i) => { headers[i] = cellText(c.value); });
  const out: Record<string, any>[] = [];
  ws.eachRow((row, n) => {
    if (n <= headerRow) return;
    const o: Record<string, any> = {}; let any = false;
    row.eachCell({ includeEmpty: true }, (c, i) => {
      const h = headers[i]; if (!h) return;
      let v: any = c.value;
      if (v && typeof v === 'object' && !(v instanceof Date)) v = (v as any).result ?? cellText(v);
      if (v instanceof Date) v = v.toISOString();
      if (v !== null && v !== '' && v !== undefined) any = true;
      o[h] = v;
    });
    if (any) out.push(o);
  });
  return out;
}

const colLetter = (i: number) => { let s = ''; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

export async function checkFile(file: { fileId?: string; name?: string; url?: string; contentBase64?: string }, templateCode: string, spec: TemplateSpec, ruleCode = 'TOR-4.4.1.7'): Promise<Finding[]> {
  const findings: Finding[] = [];
  const name = file.name || file.url || 'file.xlsx';
  const base = { ruleCode, fileId: file.fileId };
  const ext = (name.match(/\.[A-Za-z0-9]+$/)?.[0] || '').toLowerCase();
  if (spec.extensions?.length && !spec.extensions.map(e => e.toLowerCase()).includes(ext)) {
    return [{ ...base, severity: 'ERROR', message: `ไฟล์ "${name}" ต้องเป็นนามสกุล ${spec.extensions.join(', ')} ตามแบบฟอร์ม ${templateCode}` }];
  }
  let buf: Buffer;
  try { buf = await fetchFile(file); } catch (e: any) {
    return [{ ...base, severity: 'SKIPPED', message: `เปิดไฟล์ "${name}" ไม่ได้ จึงยังไม่ได้ตรวจรูปแบบ (${e.message})` }];
  }
  if (spec.maxBytes && buf.length > spec.maxBytes) {
    findings.push({ ...base, severity: 'ERROR', message: `ไฟล์ "${name}" ใหญ่เกิน ${Math.round(spec.maxBytes / 1024 / 1024)} MB` });
  }
  let wb: ExcelJS.Workbook;
  try { wb = await loadWorkbook(buf, name); } catch {
    return [...findings, { ...base, severity: 'ERROR', message: `ไฟล์ "${name}" ไม่ใช่ไฟล์ Excel/CSV ที่อ่านได้` }];
  }
  for (const sh of spec.sheets) {
    const ws = /\.csv$/i.test(name) ? wb.worksheets[0] : wb.getWorksheet(sh.name);
    if (!ws) { findings.push({ ...base, severity: 'ERROR', field: `sheet:${sh.name}`, message: `ไม่พบชีต "${sh.name}" ตามแบบฟอร์ม ${templateCode}` }); continue; }
    const hr = sh.headerRow || 1;
    const headers = new Map<string, number>();
    ws.getRow(hr).eachCell({ includeEmpty: false }, (c, i) => headers.set(cellText(c.value), i));
    for (const col of sh.columns) {
      const idx = headers.get(col.name);
      if (!idx) { findings.push({ ...base, severity: 'ERROR', field: `sheet:${sh.name}`, message: `ไม่พบคอลัมน์ "${col.name}" ในชีต "${sh.name}" ตามแบบฟอร์ม ${templateCode}` }); continue; }
      let emptyRows: number[] = [], badRows: number[] = [];
      for (let r = hr + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        if (!row.hasValues) continue;
        const v = row.getCell(idx).value as any;
        const t = cellText(v);
        if (!t) { if (col.required) emptyRows.push(r); continue; }
        const raw = v && typeof v === 'object' && 'result' in v ? v.result : v;
        if (col.type === 'number' && !(typeof raw === 'number' || /^-?[\d,]+(\.\d+)?$/.test(t))) badRows.push(r);
        if (col.type === 'date' && !(raw instanceof Date || !isNaN(Date.parse(t)))) badRows.push(r);
      }
      const cell = `${sh.name}!${colLetter(idx)}`;
      if (emptyRows.length) findings.push({ ...base, severity: 'ERROR', field: `sheet:${cell}`, ref: { rows: emptyRows.slice(0, 20) },
        message: `คอลัมน์ "${col.name}" ว่าง ${emptyRows.length} แถว (แถว ${emptyRows.slice(0, 5).join(', ')}${emptyRows.length > 5 ? ' …' : ''})` });
      if (badRows.length) findings.push({ ...base, severity: 'ERROR', field: `sheet:${cell}`, ref: { rows: badRows.slice(0, 20) },
        message: `คอลัมน์ "${col.name}" ต้องเป็น${col.type === 'number' ? 'ตัวเลข' : 'วันที่'} พบ ${badRows.length} แถวที่ไม่ใช่ (แถว ${badRows.slice(0, 5).join(', ')}${badRows.length > 5 ? ' …' : ''})` });
    }
  }
  return findings;
}
