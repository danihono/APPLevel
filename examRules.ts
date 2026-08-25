import { BeltColor } from './types';

/**
 * Roteiros oficiais de exame de faixa da LEVEL Jiu-Jitsu.
 *
 * Cada exame tem duas versões do mesmo documento:
 * - `imageUrl`: página renderizada, usada para leitura dentro do app (funciona
 *   no WKWebView do app iOS, onde PDF em iframe não é confiável);
 * - `pdfUrl`: o PDF original, para abrir/baixar/imprimir.
 *
 * Os arquivos ficam em `public/exames/` e são servidos pelo hosting.
 */
export interface ExamRuleDoc {
  belt: BeltColor;
  label: string;
  title: string;
  imageUrl: string;
  pdfUrl: string;
  fileName: string;
}

export const EXAM_RULE_DOCS: ExamRuleDoc[] = [
  {
    belt: BeltColor.AZUL,
    label: 'Azul',
    title: 'Exame Faixa Azul',
    imageUrl: '/exames/exame-faixa-azul.webp',
    pdfUrl: '/exames/exame-faixa-azul.pdf',
    fileName: 'exame-faixa-azul.pdf',
  },
  {
    belt: BeltColor.ROXA,
    label: 'Roxa',
    title: 'Exame Faixa Roxa',
    imageUrl: '/exames/exame-faixa-roxa.webp',
    pdfUrl: '/exames/exame-faixa-roxa.pdf',
    fileName: 'exame-faixa-roxa.pdf',
  },
  {
    belt: BeltColor.MARROM,
    label: 'Marrom',
    title: 'Exame Faixa Marrom',
    imageUrl: '/exames/exame-faixa-marrom.webp',
    pdfUrl: '/exames/exame-faixa-marrom.pdf',
    fileName: 'exame-faixa-marrom.pdf',
  },
];

/**
 * Exame mais relevante para quem está com a faixa informada: normalmente o da
 * próxima faixa. Faixa marrom/preta (ou desconhecida) cai no exame de marrom.
 */
export function suggestedExamBelt(currentBelt?: string | null): BeltColor {
  switch (currentBelt) {
    case BeltColor.AZUL:
      return BeltColor.ROXA;
    case BeltColor.ROXA:
    case BeltColor.MARROM:
    case BeltColor.PRETA:
      return BeltColor.MARROM;
    default:
      return BeltColor.AZUL;
  }
}
