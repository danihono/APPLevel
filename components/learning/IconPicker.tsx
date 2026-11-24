import React, { useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import { DynamicIcon, iconNames, type IconName } from 'lucide-react/dynamic';
import TrackGlyph, { isKnownIconName } from './TrackGlyph';
import { isLightColor } from '../../views/learning/learningLook';
import { t } from '../../i18n';

/** Sugestoes de Jiu, estudo e video, mostradas antes de qualquer busca. */
const SUGGESTED: string[] = [
  'swords', 'hand-fist', 'shield', 'shield-check', 'trophy', 'medal', 'award', 'crown', 'target', 'flame', 'zap',
  'dumbbell', 'activity', 'heart-pulse', 'brain', 'lightbulb', 'book-open', 'graduation-cap', 'notebook-pen',
  'clipboard-check', 'list-checks', 'video', 'clapperboard', 'film', 'play', 'circle-play', 'camera', 'refresh-cw',
  'repeat', 'rotate-ccw', 'arrow-up-right', 'arrow-down-to-line', 'move', 'lock', 'link', 'hand', 'footprints',
  'person-standing', 'users', 'baby', 'sparkles', 'star', 'gem', 'compass', 'map', 'route', 'flag', 'timer',
  'calendar', 'layers', 'puzzle', 'mountain', 'waves', 'circle-dot', 'scale', 'trending-up', 'rocket', 'key-round',
].filter((name) => isKnownIconName(name));

/** Palavras em portugues para achar os icones (os nomes da biblioteca sao em ingles). */
const PT_SYNONYMS: Record<string, string[]> = {
  faixa: ['award', 'medal', 'ribbon'], luta: ['swords', 'hand-fist', 'sword'], soco: ['hand-fist'], mao: ['hand'],
  escudo: ['shield'], defesa: ['shield'], fogo: ['flame'], trofeu: ['trophy'], medalha: ['medal'], alvo: ['target'],
  estrela: ['star'], cerebro: ['brain'], ideia: ['lightbulb'], livro: ['book'], aula: ['graduation-cap', 'presentation'],
  video: ['video', 'film', 'clapperboard', 'play', 'youtube'], camera: ['camera'], crianca: ['baby'], kids: ['baby'],
  pessoa: ['user', 'person-standing'], grupo: ['users'], tempo: ['timer', 'clock', 'hourglass'], cadeado: ['lock'],
  chave: ['key', 'lock'], seta: ['arrow'], raspagem: ['refresh-cw', 'repeat', 'rotate'], queda: ['arrow-down'],
  passagem: ['arrow-up-right', 'move'], guarda: ['circle-dot', 'shield'], forca: ['dumbbell', 'biceps-flexed'],
  coracao: ['heart'], raio: ['zap'], coroa: ['crown'], mapa: ['map', 'route'], bandeira: ['flag'], pe: ['footprints'],
  calendario: ['calendar'], quiz: ['clipboard-check', 'list-checks', 'circle-help'], prova: ['clipboard-check'],
  exame: ['clipboard-check', 'award'], competicao: ['trophy', 'medal'], respiracao: ['wind'], agua: ['waves', 'droplet'],
};

const PALETTE = [
  '#f0b429', '#e8833a', '#d6453d', '#c2347a', '#6b2fa3', '#4b4fd6',
  '#1f4fd1', '#0e8fa3', '#1f9f6e', '#6b8e23', '#8a5a2b', '#16161e',
];

function normalize(text: string): string {
  return text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

interface IconPickerProps {
  /** Nome da trilha: usado na previa e no icone automatico. */
  title: string;
  icon: string;
  color: string;
  /** Cor automatica (pela ordem), mostrada quando nenhuma foi escolhida. */
  autoColor: string;
  onIconChange: (icon: string) => void;
  onColorChange: (color: string) => void;
}

/**
 * Escolha do icone (entre todos os ~1.600 icones do lucide, carregados sob demanda) e da cor da
 * trilha. Icone ou cor vazios = automatico.
 */
const IconPicker: React.FC<IconPickerProps> = ({ title, icon, color, autoColor, onIconChange, onColorChange }) => {
  const [query, setQuery] = useState('');
  const effectiveColor = color || autoColor;
  const light = isLightColor(effectiveColor);

  const results = useMemo(() => {
    const q = normalize(query);
    if (!q) return SUGGESTED as IconName[];
    const terms = new Set<string>([q.replace(/\s+/g, '-')]);
    Object.entries(PT_SYNONYMS).forEach(([word, names]) => {
      if (word.startsWith(q) || q.startsWith(word)) names.forEach((name) => terms.add(name));
    });
    const found = iconNames.filter((name) => [...terms].some((term) => name.includes(term)));
    return found.slice(0, 96);
  }, [query]);

  return (
    <div className="rd-iconpicker">
      <div className="rd-iconpicker__preview">
        <span
          className={`rd-iconpicker__tile${light ? ' is-light' : ''}`}
          style={{ '--tc': effectiveColor } as React.CSSProperties}
          aria-hidden="true"
        >
          <TrackGlyph title={title || ' '} icon={icon} size={30} />
        </span>
        <span className="rd-iconpicker__preview-text">
          <b>{title || t('Nova trilha')}</b>
          <small>{icon ? t('Ícone escolhido: {name}', { name: icon }) : t('Ícone automático (pelo nome da trilha)')}</small>
        </span>
        {icon || color ? (
          <button
            type="button"
            className="rd-iconpicker__reset"
            onClick={() => { onIconChange(''); onColorChange(''); }}
          >
            <RotateCcw size={14} />
            {t('Automático')}
          </button>
        ) : null}
      </div>

      <div className="rd-iconpicker__section">
        <span className="app-field__label">{t('Cor')}</span>
        <div className="rd-iconpicker__swatches" role="radiogroup" aria-label={t('Cor da trilha')}>
          {PALETTE.map((swatch) => (
            <button
              type="button"
              key={swatch}
              role="radio"
              aria-checked={effectiveColor.toLowerCase() === swatch}
              aria-label={swatch}
              className={`rd-iconpicker__swatch${effectiveColor.toLowerCase() === swatch ? ' is-on' : ''}`}
              style={{ '--c': swatch } as React.CSSProperties}
              onClick={() => onColorChange(swatch)}
            />
          ))}
          <label className="rd-iconpicker__custom" title={t('Outra cor')}>
            <input
              type="color"
              value={effectiveColor}
              onChange={(event) => onColorChange(event.target.value)}
              aria-label={t('Outra cor')}
            />
            <span>{t('Outra')}</span>
          </label>
        </div>
      </div>

      <div className="rd-iconpicker__section">
        <span className="app-field__label">{t('Ícone')}</span>
        <label className="rd-iconpicker__search">
          <Search size={15} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('Buscar ícone (ex.: luta, troféu, vídeo, escudo)')}
            aria-label={t('Buscar ícone')}
          />
        </label>
        <p className="rd-iconpicker__hint">
          {query
            ? (results.length ? t('{count} ícones encontrados', { count: results.length }) : t('Nenhum ícone com esse nome. Tente em inglês (ex.: shield, star).'))
            : t('Sugestões. Busque para ver mais de 1.500 ícones.')}
        </p>
        <div className="rd-iconpicker__grid">
          {results.map((name) => (
            <button
              type="button"
              key={name}
              className={`rd-iconpicker__icon${icon === name ? ' is-on' : ''}${icon === name && light ? ' is-light' : ''}`}
              style={{ '--tc': effectiveColor } as React.CSSProperties}
              onClick={() => onIconChange(name)}
              aria-label={name}
              aria-pressed={icon === name}
              title={name}
            >
              <DynamicIcon name={name} size={20} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default IconPicker;
