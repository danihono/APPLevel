// Exportacao do relatorio financeiro em Excel (.xlsx) com identidade Level.
// ExcelJS entra num chunk sob demanda: a view faz import('./exportExcel').

import { Workbook } from 'exceljs';
import type { Worksheet } from 'exceljs';
import { saveAs } from 'file-saver';
import type { FinanceReport, ReportTable } from './reportData';
import { LEVEL_BRAND, argb, loadLogoDataUrl } from './brand';
import { formatDateTimeBR } from './format';

const MONEY_FMT = 'R$ #,##0.00';

// Nomes de aba do Excel: max 31 chars e sem os caracteres : \ / ? * [ ]
function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Aba';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${i}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function styleHeaderRow(sheet: Worksheet, rowIndex: number, columnCount: number): void {
  const row = sheet.getRow(rowIndex);
  row.height = 22;
  for (let c = 1; c <= columnCount; c += 1) {
    const cell = row.getCell(c);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(LEVEL_BRAND.gold) } };
    cell.font = { bold: true, color: { argb: argb(LEVEL_BRAND.onGold) }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = { bottom: { style: 'thin', color: { argb: argb(LEVEL_BRAND.goldDark) } } };
  }
}

function addTableSheet(workbook: Workbook, table: ReportTable, used: Set<string>): void {
  const sheet = workbook.addWorksheet(safeSheetName(table.title, used), {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = table.columns.map((col) => ({ key: col.key, header: col.label }));
  styleHeaderRow(sheet, 1, table.columns.length);

  table.rows.forEach((row, idx) => {
    const excelRow = sheet.addRow(row);
    // zebra striping
    if (idx % 2 === 1) {
      for (let c = 1; c <= table.columns.length; c += 1) {
        excelRow.getCell(c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: argb(LEVEL_BRAND.zebra) },
        };
      }
    }
    table.columns.forEach((col, c) => {
      const cell = excelRow.getCell(c + 1);
      if (col.money) cell.numFmt = MONEY_FMT;
    });
  });

  // Rodape de Total (formula SUM) para a coluna monetaria principal.
  if (table.rows.length > 0 && table.totalKey) {
    const totalColIndex = table.columns.findIndex((col) => col.key === table.totalKey);
    if (totalColIndex >= 0) {
      const firstDataRow = 2;
      const lastDataRow = 1 + table.rows.length;
      const totalRow = sheet.addRow({});
      const labelCell = totalRow.getCell(1);
      labelCell.value = 'TOTAL';
      labelCell.font = { bold: true, color: { argb: argb(LEVEL_BRAND.textStrong) } };
      const letter = sheet.getColumn(totalColIndex + 1).letter;
      const sumCell = totalRow.getCell(totalColIndex + 1);
      sumCell.value = { formula: `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` } as unknown as number;
      sumCell.numFmt = MONEY_FMT;
      sumCell.font = { bold: true, color: { argb: argb(LEVEL_BRAND.goldDark) } };
      for (let c = 1; c <= table.columns.length; c += 1) {
        totalRow.getCell(c).border = { top: { style: 'medium', color: { argb: argb(LEVEL_BRAND.gold) } } };
      }
    }
  }

  if (table.rows.length === 0) {
    const emptyRow = sheet.addRow({});
    emptyRow.getCell(1).value = 'Sem registros no periodo.';
    emptyRow.getCell(1).font = { italic: true, color: { argb: argb(LEVEL_BRAND.muted) } };
  }

  // Autofilter sobre o cabecalho.
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: table.columns.length },
  };

  // Larguras de coluna ajustadas ao conteudo.
  table.columns.forEach((col, c) => {
    let maxLen = col.label.length;
    for (const row of table.rows) {
      const raw = row[col.key];
      const text = col.money && typeof raw === 'number' ? `R$ ${raw.toFixed(2)}` : String(raw ?? '');
      maxLen = Math.max(maxLen, text.length);
    }
    sheet.getColumn(c + 1).width = Math.min(Math.max(maxLen + 2, 12), 42);
  });
}

async function addSummarySheet(workbook: Workbook, report: FinanceReport): Promise<void> {
  const sheet = workbook.addWorksheet('Resumo');
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 26;

  // Logo (se disponivel) no topo.
  const logo = await loadLogoDataUrl();
  if (logo) {
    const base64 = logo.split(',')[1] ?? logo;
    const imageId = workbook.addImage({ base64, extension: 'png' });
    sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 60 } });
  }
  sheet.getRow(1).height = 48;

  const title = sheet.getCell('B1');
  title.value = 'Relatorio Financeiro';
  title.font = { bold: true, size: 18, color: { argb: argb(LEVEL_BRAND.goldDark) } };

  const meta: Array<[string, string]> = [
    ['Periodo', report.meta.periodLabel],
    ['Filial', report.meta.academyLabel],
    ['Gerado em', formatDateTimeBR(report.meta.generatedAt)],
  ];
  let rowNum = 3;
  for (const [label, value] of meta) {
    sheet.getCell(`A${rowNum}`).value = label;
    sheet.getCell(`A${rowNum}`).font = { bold: true, color: { argb: argb(LEVEL_BRAND.muted) } };
    sheet.getCell(`B${rowNum}`).value = value;
    rowNum += 1;
  }

  rowNum += 1;
  const kpiHeaderRow = rowNum;
  sheet.getCell(`A${kpiHeaderRow}`).value = 'Indicador';
  sheet.getCell(`B${kpiHeaderRow}`).value = 'Valor';
  styleHeaderRow(sheet, kpiHeaderRow, 2);
  rowNum += 1;

  const s = report.summary;
  const kpis: Array<[string, number, boolean]> = [
    ['Entradas (receitas recebidas)', s.entradas, true],
    ['Saidas (despesas)', s.saidas, true],
    ['Saldo do periodo', s.saldo, true],
    ['Vendas (bruto)', s.vendasTotal, true],
    ['Pagamentos recebidos', s.pagamentosTotal, true],
    ['Pendencias (a receber)', s.pendencias, true],
    ['Lucro bruto', s.lucroBruto, true],
    ['Ticket medio', s.ticketMedio, true],
    ['Qtd. de vendas', s.qtdVendas, false],
  ];
  kpis.forEach(([label, value, money], idx) => {
    const r = sheet.getRow(rowNum);
    r.getCell(1).value = label;
    const valueCell = r.getCell(2);
    valueCell.value = value;
    if (money) valueCell.numFmt = MONEY_FMT;
    valueCell.font = { bold: true, color: { argb: argb(LEVEL_BRAND.textStrong) } };
    if (idx % 2 === 1) {
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(LEVEL_BRAND.zebra) } };
      r.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(LEVEL_BRAND.zebra) } };
    }
    rowNum += 1;
  });

  const note = sheet.getCell(`A${rowNum + 1}`);
  note.value = 'Entradas usam as receitas recebidas (razao de caixa). Vendas e pagamentos sao detalhe e nao somam nas entradas.';
  note.font = { italic: true, size: 9, color: { argb: argb(LEVEL_BRAND.muted) } };
}

export async function exportFinanceReportExcel(report: FinanceReport): Promise<void> {
  const workbook = new Workbook();
  workbook.creator = 'Level';
  workbook.created = report.meta.generatedAt;

  const used = new Set<string>();
  if (report.blocks.includes('resumo')) {
    await addSummarySheet(workbook, report);
    used.add('resumo');
  }
  for (const table of report.tables) {
    addTableSheet(workbook, table, used);
  }
  // Garante ao menos uma aba.
  if (workbook.worksheets.length === 0) {
    const sheet = workbook.addWorksheet('Relatorio');
    sheet.getCell('A1').value = 'Nenhum bloco selecionado.';
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, `${report.meta.fileBase}.xlsx`);
}
