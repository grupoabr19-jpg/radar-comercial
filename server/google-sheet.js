const MAX_SPREADSHEET_BYTES = 30 * 1024 * 1024;

export function googleSpreadsheetId(value) {
  let url;
  try { url = new URL(String(value || '').trim()); } catch { throw new Error('Link do Google Sheets inválido.'); }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') throw new Error('Use um link HTTPS de docs.google.com.');
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (!match) throw new Error('Não foi possível identificar a planilha no link informado.');
  return match[1];
}

async function readLimited(response) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer());
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_SPREADSHEET_BYTES) {
      await reader.cancel();
      throw new Error('A planilha exportada ultrapassa 30 MB.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export async function downloadGoogleSpreadsheet(value) {
  const spreadsheetId = googleSpreadsheetId(value);
  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  const response = await fetch(exportUrl, { redirect: 'follow', signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`O Google Sheets não permitiu exportar a planilha (${response.status}).`);
  const buffer = await readLimited(response);
  if (!buffer.length) throw new Error('A exportação do Google Sheets retornou um arquivo vazio.');
  return { buffer, fileName: `google-sheet-${spreadsheetId}.xlsx` };
}
