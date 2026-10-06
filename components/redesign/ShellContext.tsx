import React, { createContext, useContext } from 'react';

// Dados do "casco" do app que as telas redesenhadas precisam no proprio cabecalho
// (sino de avisos, nome da unidade, voltar). Evita passar props por todas as views.
export type ShellRole = 'student' | 'staff' | 'superadmin';

export interface RedesignShellValue {
  role: ShellRole;
  /** Nome da unidade atual (ou "Toda a rede" etc.). */
  unitLabel: string;
  /** Troca de unidade (aluno com varias unidades). */
  onUnitClick?: () => void;
  unreadCount: number;
  openNotifications: () => void;
  /** Volta para a aba anterior (telas sem aba propria, como Avisos do aluno). */
  goBack: () => void;
  navigate: (tab: string) => void;
  /** Fuso IANA da academia (datas do cabecalho). */
  timeZone?: string;
  /** Primeiro nome de quem esta logado ("Boa noite, Murilo."). */
  firstName?: string;
}

const noop = () => undefined;

export const defaultShellValue: RedesignShellValue = {
  role: 'student',
  unitLabel: '',
  unreadCount: 0,
  openNotifications: noop,
  goBack: noop,
  navigate: noop,
};

const RedesignShellContext = createContext<RedesignShellValue>(defaultShellValue);

export const RedesignShellProvider: React.FC<{ value: RedesignShellValue; children: React.ReactNode }> = ({ value, children }) => (
  <RedesignShellContext.Provider value={value}>{children}</RedesignShellContext.Provider>
);

export function useRedesignShell(): RedesignShellValue {
  return useContext(RedesignShellContext);
}
