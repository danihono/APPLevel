import React, { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { coerceTimeDraft, maskTimeDigits, normalizeTime } from '../dateMaskUtils';

// Campo de hora digitavel: o usuario escreve hh:mm (teclado numerico no mobile)
// ou toca no icone para abrir o seletor nativo. Entra e sai em 'HH:mm' (ou '').
export interface TimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
}

const TimeField: React.FC<TimeFieldProps> = ({
  value,
  onChange,
  required,
  disabled,
  className = 'app-input',
  style,
  id,
  name,
  placeholder = 'hh:mm',
  ariaLabel,
}) => {
  const [draft, setDraft] = useState(() => normalizeTime(value));
  const textRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft((current) => (normalizeTime(current) === value ? current : normalizeTime(value)));
  }, [value]);

  useEffect(() => {
    const field = textRef.current;
    if (!field) return;
    field.setCustomValidity(draft && !coerceTimeDraft(draft) ? 'Horario invalido' : '');
  }, [draft]);

  const emit = (next: string) => {
    if (next !== value) onChange(next);
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskTimeDigits(event.target.value);
    setDraft(masked);

    const normalized = normalizeTime(masked);
    if (normalized) {
      emit(normalized);
      return;
    }
    if (!masked) emit('');
  };

  const handleBlur = () => {
    const normalized = coerceTimeDraft(draft);
    setDraft(normalized);
    emit(normalized);
  };

  const handleNativeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = normalizeTime(event.target.value);
    setDraft(normalized);
    emit(normalized);
  };

  const openNativePicker = () => {
    const native = nativeRef.current;
    if (!native || disabled) return;
    try {
      native.showPicker?.();
    } catch {
      // Sem showPicker o toque cai no input nativo sobreposto, que abre o seletor.
    }
  };

  return (
    <span className="date-field" style={style}>
      <input
        ref={textRef}
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        maxLength={5}
        className={className}
        value={draft}
        onChange={handleTextChange}
        onBlur={handleBlur}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <span className="date-field__trigger" aria-hidden={disabled ? 'true' : undefined}>
        <Clock size={18} strokeWidth={1.8} />
        <input
          ref={nativeRef}
          type="time"
          className="date-field__native"
          tabIndex={-1}
          aria-label="Abrir seletor de horario"
          value={value}
          disabled={disabled}
          onClick={openNativePicker}
          onFocus={openNativePicker}
          onChange={handleNativeChange}
        />
      </span>
    </span>
  );
};

export default TimeField;
