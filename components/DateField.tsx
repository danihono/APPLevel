import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { brToIso, clampIso, expandShortYear, isoToBr, maskDateDigits } from '../dateMaskUtils';

// Campo de data digitavel: o usuario escreve dd/mm/aaaa (teclado numerico no mobile)
// ou toca no icone para abrir o seletor nativo do sistema.
// Entra e sai sempre em 'yyyy-mm-dd' (ou '' quando vazio), igual ao <input type="date">.
export interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
}

// Completa o ano de 2 digitos digitado pelo usuario ('07/03/90' -> '07/03/1990').
function expandDraftYear(draft: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(draft);
  if (!match) return draft;
  return `${match[1]}/${match[2]}/${expandShortYear(Number(match[3]))}`;
}

const DateField: React.FC<DateFieldProps> = ({
  value,
  onChange,
  min,
  max,
  required,
  disabled,
  className = 'app-input',
  style,
  id,
  name,
  placeholder = 'dd/mm/aaaa',
  ariaLabel,
}) => {
  const [draft, setDraft] = useState(() => isoToBr(value));
  const textRef = useRef<HTMLInputElement>(null);
  const nativeRef = useRef<HTMLInputElement>(null);

  // Ressincroniza quando o pai muda o valor (ex.: clamp externo), sem atrapalhar
  // a digitacao parcial - por isso so troca se o rascunho nao representar o valor atual.
  useEffect(() => {
    setDraft((current) => (brToIso(current) === value ? current : isoToBr(value)));
  }, [value]);

  // Bloqueia o submit nativo do formulario quando ha texto que nao vira data valida.
  useEffect(() => {
    const field = textRef.current;
    if (!field) return;
    field.setCustomValidity(draft && !brToIso(expandDraftYear(draft)) ? 'Data invalida' : '');
  }, [draft]);

  const emit = (next: string) => {
    if (next !== value) onChange(next);
  };

  const handleTextChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const masked = maskDateDigits(event.target.value);
    setDraft(masked);

    const iso = brToIso(masked);
    if (iso) {
      emit(clampIso(iso, min, max));
      return;
    }
    if (!masked) emit('');
  };

  const handleBlur = () => {
    const expanded = expandDraftYear(draft);
    const iso = clampIso(brToIso(expanded), min, max);
    // Rascunho incompleto ou impossivel (31/02) some no blur em vez de virar dado ruim.
    setDraft(isoToBr(iso));
    emit(iso);
  };

  const handleNativeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const iso = clampIso(event.target.value, min, max);
    setDraft(isoToBr(iso));
    emit(iso);
  };

  // Chrome/Edge nao abrem o seletor ao tocar no input; showPicker resolve.
  // No iOS o proprio toque no input nativo (sobreposto ao icone) ja abre.
  const openNativePicker = () => {
    const native = nativeRef.current;
    if (!native || disabled) return;
    try {
      native.showPicker?.();
    } catch {
      // showPicker pode falhar sem gesto do usuario ou em browsers antigos - o
      // proprio input nativo sobreposto continua funcionando como fallback.
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
        maxLength={10}
        className={className}
        value={draft}
        onChange={handleTextChange}
        onBlur={handleBlur}
        required={required}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      <span className="date-field__trigger" aria-hidden={disabled ? 'true' : undefined}>
        <CalendarDays size={18} strokeWidth={1.8} />
        <input
          ref={nativeRef}
          type="date"
          className="date-field__native"
          tabIndex={-1}
          aria-label="Abrir calendario"
          value={value}
          min={min}
          max={max}
          disabled={disabled}
          onClick={openNativePicker}
          onFocus={openNativePicker}
          onChange={handleNativeChange}
        />
      </span>
    </span>
  );
};

export default DateField;
