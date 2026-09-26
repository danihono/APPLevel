import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { messages } from './messages';

export type AppLanguage = 'pt-BR' | 'en' | 'es';

export const DEFAULT_LANGUAGE: AppLanguage = 'pt-BR';

export const SUPPORTED_LANGUAGES: Array<{ code: AppLanguage; label: string; short: string; flag: string; locale: string }> = [
  { code: 'pt-BR', label: 'Português (Brasil)', short: 'PT', flag: '🇧🇷', locale: 'pt-BR' },
  { code: 'en', label: 'English', short: 'EN', flag: '🇺🇸', locale: 'en-US' },
  { code: 'es', label: 'Español', short: 'ES', flag: '🇪🇸', locale: 'es-ES' },
];

const LANGUAGE_STORAGE_KEY = 'applevel:language';

export type TranslationVars = Record<string, string | number>;

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'pt-BR' || value === 'en' || value === 'es';
}

function readStoredLanguage(): AppLanguage {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isAppLanguage(stored) ? stored : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function storeLanguage(language: AppLanguage) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Sem storage (aba privada): o idioma vale so para esta sessao.
  }
}

// Idioma ativo em nivel de modulo: permite traduzir em funcoes utilitarias
// fora de componentes. O LanguageProvider mantem este valor sincronizado.
let currentLanguage: AppLanguage = typeof window === 'undefined' ? DEFAULT_LANGUAGE : readStoredLanguage();

function applyDocumentLanguage(language: AppLanguage) {
  if (typeof document !== 'undefined') {
    // Alem de acessibilidade, modulos sem acesso ao i18n (ex.: commitmentScale) leem daqui o locale.
    document.documentElement.lang = language;
  }
}

applyDocumentLanguage(currentLanguage);

export function getLanguage(): AppLanguage {
  return currentLanguage;
}

/** Locale BCP 47 para Intl / toLocaleString (datas, numeros, moedas). */
export function getLocale(language: AppLanguage = currentLanguage): string {
  return SUPPORTED_LANGUAGES.find((entry) => entry.code === language)?.locale ?? 'pt-BR';
}

/**
 * Intl.DateTimeFormat que acompanha o idioma ativo. Use no lugar de
 * `new Intl.DateTimeFormat('pt-BR', ...)` em constantes de modulo.
 */
export function createDateFormatter(options: Intl.DateTimeFormatOptions) {
  const cache = new Map<string, Intl.DateTimeFormat>();
  const current = () => {
    const locale = getLocale();
    let formatter = cache.get(locale);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat(locale, options);
      cache.set(locale, formatter);
    }
    return formatter;
  };

  return {
    format: (date?: Date | number) => current().format(date),
    formatToParts: (date?: Date | number) => current().formatToParts(date),
  };
}

function interpolate(text: string, vars?: TranslationVars) {
  if (!vars) {
    return text;
  }

  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/**
 * Traduz um texto escrito em portugues (a chave e o proprio texto pt-BR).
 * Sem traducao cadastrada, devolve o texto original — o portugues e o padrao.
 * Variaveis entram como `{nome}`: t('Olá, {name}', { name }).
 */
export function t(text: string, vars?: TranslationVars): string {
  if (currentLanguage === 'pt-BR') {
    return interpolate(text, vars);
  }

  const entry = messages[text];
  const translated = entry ? entry[currentLanguage] : undefined;
  return interpolate(translated ?? text, vars);
}

/**
 * Marca um texto pt-BR como chave de traducao sem traduzir agora — para
 * constantes de modulo. Traduza no render com t(valor).
 */
export function tKey<T extends string>(text: T): T {
  return text;
}

type I18nContextValue = {
  language: AppLanguage;
  locale: string;
  setLanguage: (language: AppLanguage) => void;
  t: typeof t;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<AppLanguage>(currentLanguage);

  const setLanguage = useCallback((next: AppLanguage) => {
    currentLanguage = next;
    applyDocumentLanguage(next);
    storeLanguage(next);
    setLanguageState(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    language,
    locale: getLocale(language),
    setLanguage,
    // Nova referencia a cada troca de idioma para que useMemo/useCallback que dependem de `t` recalculem.
    t: (text, vars) => t(text, vars),
  }), [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n precisa estar dentro de <LanguageProvider>.');
  }

  return context;
}
