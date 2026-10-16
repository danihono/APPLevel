import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { t } from '../../i18n';
import './superadmin-shell.css';

// Paleta de busca do superadmin (Ctrl/⌘ K): academias, pessoas, areas e acoes num lugar so.
export interface PaletteItem {
  id: string;
  /** Titulo do grupo ja traduzido (Acoes, Ir para, Academias, Pessoas). */
  group: string;
  /** So aparece quando a pessoa digita (listas longas, como alunos). */
  onlyOnSearch?: boolean;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface SuperadminPaletteProps {
  open: boolean;
  items: PaletteItem[];
  onClose: () => void;
}

const SuperadminPalette: React.FC<SuperadminPaletteProps> = ({ open, items, onClose }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const results = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return items.filter((item) => !item.onlyOnSearch).slice(0, 20);
    }
    return items
      .filter((item) => {
        const haystack = normalize(`${item.label} ${item.hint ?? ''} ${item.group}`);
        return tokens.every((token) => haystack.includes(token));
      })
      .slice(0, 24);
  }, [items, query]);

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected, results]);

  if (!open) return null;

  const runItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((current) => Math.min(results.length - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runItem(results[selected]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  let lastGroup = '';
  return (
    <div className="sa-palette__scrim" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="sa-palette" role="dialog" aria-modal="true" aria-label={t('Buscar')} onKeyDown={onKeyDown}>
        <div className="sa-palette__input">
          <Search size={19} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
            placeholder={t('Buscar academia, aluno, professor ou ação…')}
            aria-label={t('Buscar')}
            autoComplete="off"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="sa-palette__list" ref={listRef} role="listbox">
          {results.length === 0 ? (
            <div className="sa-palette__empty"><strong>{t('Nada encontrado')}</strong><span>{t('Tente outro nome.')}</span></div>
          ) : results.map((item, index) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <React.Fragment key={item.id}>
                {showGroup ? <p className="sa-palette__group">{item.group}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  className="sa-palette__item"
                  onMouseMove={() => setSelected(index)}
                  onClick={() => runItem(item)}
                >
                  <span className="sa-palette__icon">{item.icon}</span>
                  <span className="sa-palette__copy">
                    <strong>{item.label}</strong>
                    {item.hint ? <small>{item.hint}</small> : null}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="sa-palette__foot">
          <span>↑ ↓ {t('navegar')}</span>
          <span>↵ {t('abrir')}</span>
          <span>Esc {t('fechar')}</span>
        </div>
      </div>
    </div>
  );
};

export default SuperadminPalette;
