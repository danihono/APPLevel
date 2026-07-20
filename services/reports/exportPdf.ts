// Exportacao do relatorio financeiro em PDF com a identidade da Level: capa com
// logo, KPIs, graficos (barras) nas cores da marca e tabelas por bloco.
// jsPDF entra num chunk sob demanda: a view faz import('./exportPdf').

import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FinanceReport, ReportTable } from './reportData';
import { LEVEL_BRAND, hexToRgb, loadLogoDataUrl } from './brand';
import { formatBRL, formatDateTimeBR } from './format';

const MARGIN = 40;

const GOLD = hexToRgb(LEVEL_BRAND.gold);
const GOLD_DARK = hexToRgb(LEVEL_BRAND.goldDark);
const ON_GOLD = hexToRgb(LEVEL_BRAND.onGold);
const DARK = hexToRgb(LEVEL_BRAND.dark);
const LIGHT = hexToRgb(LEVEL_BRAND.light);
const SUCCESS = hexToRgb(LEVEL_BRAND.success);
const DANGER = hexToRgb(LEVEL_BRAND.danger);
const MUTED = hexToRgb(LEVEL_BRAND.muted);
const ZEBRA = hexToRgb(LEVEL_BRAND.zebra);

function drawFooter(doc: jsPDF): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const page = doc.getNumberOfPages();
  doc.setFontSize(8);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text('Level - Relatorio Financeiro', MARGIN, pageHeight - 18);
  doc.text(`Pagina ${page}`, pageWidth - MARGIN, pageHeight - 18, { align: 'right' });
}

async function drawHeader(doc: jsPDF, report: FinanceReport): Promise<number> {
  const pageWidth = doc.internal.pageSize.getWidth();
  // Faixa dourada no topo.
  doc.setFillColor(DARK[0], DARK[1], DARK[2]);
  doc.rect(0, 0, pageWidth, 96, 'F');
  doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.rect(0, 96, pageWidth, 4, 'F');

  const logo = await loadLogoDataUrl();
  if (logo) {
    try {
      doc.addImage(logo, 'PNG', MARGIN, 22, 120, 52);
    } catch {
      /* logo opcional */
    }
  }

  doc.setTextColor(LIGHT[0], LIGHT[1], LIGHT[2]);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Relatorio Financeiro', pageWidth - MARGIN, 40, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
  doc.text(report.meta.periodLabel, pageWidth - MARGIN, 58, { align: 'right' });
  doc.setTextColor(LIGHT[0], LIGHT[1], LIGHT[2]);
  doc.text(report.meta.academyLabel, pageWidth - MARGIN, 72, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
  doc.text(`Gerado em ${formatDateTimeBR(report.meta.generatedAt)}`, pageWidth - MARGIN, 86, {
    align: 'right',
  });

  return 120;
}

function drawKpiCards(doc: jsPDF, report: FinanceReport, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const usable = pageWidth - MARGIN * 2;
  const gap = 12;
  const cardW = (usable - gap * 2) / 3;
  const cardH = 60;
  const s = report.summary;
  const cards: Array<{ label: string; value: string; color: [number, number, number] }> = [
    { label: 'ENTRADAS', value: formatBRL(s.entradas), color: SUCCESS },
    { label: 'SAIDAS', value: formatBRL(s.saidas), color: DANGER },
    { label: 'SALDO', value: formatBRL(s.saldo), color: GOLD_DARK },
  ];
  cards.forEach((card, i) => {
    const x = MARGIN + i * (cardW + gap);
    doc.setFillColor(ZEBRA[0], ZEBRA[1], ZEBRA[2]);
    doc.roundedRect(x, startY, cardW, cardH, 6, 6, 'F');
    doc.setFillColor(card.color[0], card.color[1], card.color[2]);
    doc.rect(x, startY, 5, cardH, 'F');
    doc.setFontSize(9);
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(card.label, x + 14, startY + 22);
    doc.setFontSize(15);
    doc.setTextColor(card.color[0], card.color[1], card.color[2]);
    doc.text(card.value, x + 14, startY + 44);
  });

  // Metricas secundarias em uma linha.
  let y = startY + cardH + 18;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(20, 20, 26);
  const secondary = [
    `Vendas (bruto): ${formatBRL(s.vendasTotal)}`,
    `Pagamentos: ${formatBRL(s.pagamentosTotal)}`,
    `Pendencias: ${formatBRL(s.pendencias)}`,
    `Lucro bruto: ${formatBRL(s.lucroBruto)}`,
    `Ticket medio: ${formatBRL(s.ticketMedio)}`,
    `Qtd. vendas: ${s.qtdVendas}`,
  ];
  secondary.forEach((line) => {
    doc.text(line, MARGIN, y);
    y += 14;
  });
  return y + 4;
}

function drawBarChart(
  doc: jsPDF,
  title: string,
  data: Array<{ label: string; value: number; color: [number, number, number] }>,
  startY: number,
): number {
  if (data.length === 0) return startY;
  const pageWidth = doc.internal.pageSize.getWidth();
  const chartW = pageWidth - MARGIN * 2;
  const barMaxW = chartW - 130; // espaco para rotulos a esquerda
  const max = Math.max(...data.map((d) => d.value), 1);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(GOLD_DARK[0], GOLD_DARK[1], GOLD_DARK[2]);
  doc.text(title, MARGIN, startY);
  let y = startY + 14;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  data.forEach((d) => {
    const barW = Math.max((d.value / max) * barMaxW, 1);
    doc.setTextColor(40, 40, 46);
    doc.text(d.label.length > 22 ? `${d.label.slice(0, 21)}.` : d.label, MARGIN, y + 8, {
      maxWidth: 110,
    });
    doc.setFillColor(d.color[0], d.color[1], d.color[2]);
    doc.roundedRect(MARGIN + 118, y, barW, 11, 2, 2, 'F');
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    doc.text(formatBRL(d.value), MARGIN + 118 + barW + 4, y + 8);
    y += 18;
  });
  return y + 8;
}

function renderTableSection(doc: jsPDF, table: ReportTable, startY: number): number {
  const moneyCols = new Set<number>();
  table.columns.forEach((col, i) => {
    if (col.money) moneyCols.add(i);
  });

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(GOLD_DARK[0], GOLD_DARK[1], GOLD_DARK[2]);
  doc.text(table.title, MARGIN, startY);

  const body = table.rows.map((row) =>
    table.columns.map((col) => {
      const raw = row[col.key];
      return col.money && typeof raw === 'number' ? formatBRL(raw) : String(raw ?? '');
    }),
  );

  let foot: string[][] | undefined;
  if (table.rows.length > 0 && table.totalKey) {
    const totalIdx = table.columns.findIndex((c) => c.key === table.totalKey);
    if (totalIdx >= 0) {
      const total = table.rows.reduce((sum, row) => {
        const raw = row[table.totalKey as string];
        return sum + (typeof raw === 'number' ? raw : 0);
      }, 0);
      const footRow = table.columns.map(() => '');
      footRow[0] = 'TOTAL';
      footRow[totalIdx] = formatBRL(total);
      foot = [footRow];
    }
  }

  const columnStyles: Record<number, { halign: 'right' }> = {};
  moneyCols.forEach((i) => {
    columnStyles[i] = { halign: 'right' };
  });

  autoTable(doc, {
    startY: startY + 8,
    head: [table.columns.map((c) => c.label)],
    body: body.length > 0 ? body : [[{ content: 'Sem registros no periodo.', colSpan: table.columns.length } as unknown as string]],
    foot,
    styles: { fontSize: 8, cellPadding: 3, textColor: [30, 30, 36] },
    headStyles: { fillColor: GOLD, textColor: ON_GOLD, fontStyle: 'bold' },
    footStyles: { fillColor: [244, 241, 234], textColor: GOLD_DARK, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: ZEBRA },
    columnStyles,
    margin: { left: MARGIN, right: MARGIN },
    didDrawPage: () => drawFooter(doc),
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  return (finalY ?? startY + 40) + 24;
}

export async function exportFinanceReportPdf(report: FinanceReport): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageHeight = doc.internal.pageSize.getHeight();

  let y = await drawHeader(doc, report);
  y += 20;

  if (report.blocks.includes('resumo')) {
    y = drawKpiCards(doc, report, y);
    y = drawBarChart(
      doc,
      'Entradas x Saidas',
      [
        { label: 'Entradas', value: report.summary.entradas, color: SUCCESS },
        { label: 'Saidas', value: report.summary.saidas, color: DANGER },
      ],
      y + 6,
    );
    if (report.chart.topProdutos.length > 0) {
      y = drawBarChart(
        doc,
        'Top produtos (por valor)',
        report.chart.topProdutos.map((p) => ({ label: p.name, value: p.total, color: GOLD })),
        y + 4,
      );
    }
  }

  drawFooter(doc);

  for (const table of report.tables) {
    // Quebra de pagina se sobrou pouco espaco para o cabecalho da secao.
    if (y > pageHeight - 120) {
      doc.addPage();
      y = MARGIN + 10;
    }
    y = renderTableSection(doc, table, y);
  }

  doc.save(`${report.meta.fileBase}.pdf`);
}
