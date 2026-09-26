import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES, t, useI18n, type AppLanguage } from '../i18n';
import { updateUserLanguage } from '../services/firebase/mutations';

interface LanguagePickerProps {
  /** Com userId, a escolha tambem e salva no perfil (vale em qualquer dispositivo). */
  userId?: string;
  compact?: boolean;
}

const LanguagePicker: React.FC<LanguagePickerProps> = ({ userId, compact = false }) => {
  const { language, setLanguage } = useI18n();
  const [error, setError] = useState('');

  async function handleSelect(next: AppLanguage) {
    if (next === language) {
      return;
    }

    setError('');
    setLanguage(next);
    if (!userId) {
      return;
    }

    try {
      await updateUserLanguage(userId, next);
    } catch {
      setError(t('Não foi possível salvar o idioma no seu perfil. Ele vale apenas neste dispositivo.'));
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={compact ? 'flex flex-wrap gap-2' : 'grid gap-2 sm:grid-cols-3'}
        role="radiogroup"
        aria-label={t('Idioma')}
      >
        {SUPPORTED_LANGUAGES.map((entry) => {
          const selected = entry.code === language;
          return (
            <button
              key={entry.code}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => void handleSelect(entry.code)}
              className={`app-button app-button--small ${compact ? '' : 'app-button--block'} ${selected ? 'app-button--gold' : 'app-button--ghost'}`}
            >
              <span aria-hidden="true">{entry.flag}</span>
              {entry.label}
              {selected && !compact ? <Check size={14} /> : null}
            </button>
          );
        })}
      </div>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
    </div>
  );
};

export default LanguagePicker;
