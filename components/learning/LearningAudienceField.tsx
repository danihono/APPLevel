import React, { useMemo } from 'react';
import { AlertTriangle, GraduationCap, Layers, Users } from 'lucide-react';
import { ADULT_BELTS, KIDS_BELTS_BY_CATEGORY, beltLabel } from '../../beltCatalog';
import {
  AUDIENCE_ROLE_OPTIONS,
  describeAudience,
  intersectAudiences,
  isEmptyAudience,
  matchesEffectiveAudience,
} from '../../learningAudience';
import type { FirestoreEntity } from '../../services/firebase/data';
import type {
  LearningAudienceConfig,
  LearningAudienceRole,
  UserRecord,
} from '../../services/firebase/models';

const KIDS_BELTS = KIDS_BELTS_BY_CATEGORY.level_infantil;

type BeltPreset = {
  id: string;
  label: string;
  belts: string[];
};

const BELT_PRESETS: BeltPreset[] = [
  { id: 'all', label: 'Todas', belts: [] },
  { id: 'adult', label: 'Só adulto', belts: [...ADULT_BELTS] },
  { id: 'kids', label: 'Só kids', belts: [...KIDS_BELTS] },
  { id: 'black', label: 'Faixa preta', belts: ['black'] },
];

interface LearningAudienceFieldProps {
  /** Configuração deste nó. */
  value: LearningAudienceConfig;
  onChange: (audience: LearningAudienceConfig) => void;
  /**
   * Audiências dos níveis acima já resolvidas, da mais externa para a mais
   * interna. Vazio na trilha (que é a raiz e não pode herdar).
   */
  parentAudiences?: LearningAudienceConfig[];
  /** Nível de onde a herança vem. Define os artigos usados nos textos. */
  parent?: 'trilha' | 'curso';
  /** Base de usuários usada para estimar quantas pessoas veem o conteúdo. */
  audienceUsers?: Array<FirestoreEntity<UserRecord>>;
}

/**
 * Seletor de público-alvo: papéis, faixas e uma prévia de quem realmente vai
 * ver o conteúdo. O alcance real é sempre a interseção com os níveis acima —
 * um override nunca amplia o que o pai já restringiu.
 */
const LearningAudienceField: React.FC<LearningAudienceFieldProps> = ({
  value,
  onChange,
  parentAudiences = [],
  parent = 'trilha',
  audienceUsers = [],
}) => {
  const canInherit = parentAudiences.length > 0;
  const isCustom = value.mode === 'custom';
  // "a trilha" / "o curso" — evita concordância errada nos avisos.
  const parentArticle = parent === 'trilha' ? 'a' : 'o';
  const parentContraction = parent === 'trilha' ? 'da' : 'do';
  const parentRestrictive = parent === 'trilha' ? 'restrita' : 'restrito';

  const effective = useMemo(
    () => intersectAudiences(...parentAudiences, value),
    [parentAudiences, value],
  );

  const ownReach = useMemo(() => intersectAudiences(value), [value]);

  const narrowedByParent = useMemo(() => {
    if (!canInherit || !isCustom) {
      return false;
    }

    return ownReach.roles.length !== effective.roles.length
      || ownReach.belts.length !== effective.belts.length;
  }, [canInherit, effective, isCustom, ownReach]);

  const matchingUsers = useMemo(
    () => audienceUsers.filter((user) => matchesEffectiveAudience(effective, { role: user.role, belt: user.belt })).length,
    [audienceUsers, effective],
  );

  function toggleRole(role: LearningAudienceRole) {
    const roles = value.roles.includes(role)
      ? value.roles.filter((entry) => entry !== role)
      : [...value.roles, role];
    onChange({ ...value, mode: 'custom', roles });
  }

  function toggleBelt(belt: string) {
    const belts = value.belts.includes(belt)
      ? value.belts.filter((entry) => entry !== belt)
      : [...value.belts, belt];
    onChange({ ...value, mode: 'custom', belts });
  }

  function applyPreset(preset: BeltPreset) {
    onChange({ ...value, mode: 'custom', belts: [...preset.belts] });
  }

  function renderBeltGroup(title: string, belts: readonly string[]) {
    return (
      <div className="learning-audience__group">
        <p className="learning-audience__group-label">{title}</p>
        <div className="learning-audience__chips">
          {belts.map((belt) => {
            const selected = value.belts.includes(belt);
            return (
              <button
                type="button"
                key={belt}
                onClick={() => toggleBelt(belt)}
                aria-pressed={selected}
                className={`learning-chip ${selected ? 'is-selected' : ''}`}
              >
                {beltLabel(belt)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="learning-audience">
      <div className="learning-audience__head">
        <div className="flex items-center gap-2">
          <Users size={16} />
          <p className="app-field__label">Público-alvo</p>
        </div>
        {canInherit ? (
          <div className="learning-audience__mode" role="group" aria-label="Modo do público-alvo">
            <button
              type="button"
              onClick={() => onChange({ mode: 'inherit', roles: [], belts: [] })}
              className={`learning-chip ${!isCustom ? 'is-selected' : ''}`}
            >
              <Layers size={13} />
              Herdar {parentContraction} {parent}
            </button>
            <button
              type="button"
              onClick={() => onChange({ ...value, mode: 'custom' })}
              className={`learning-chip ${isCustom ? 'is-selected' : ''}`}
            >
              <GraduationCap size={13} />
              Definir aqui
            </button>
          </div>
        ) : null}
      </div>

      {isCustom ? (
        <div className="learning-audience__body">
          <div className="learning-audience__group">
            <p className="learning-audience__group-label">
              Perfis <span className="learning-audience__hint">nenhum marcado = alunos e professores</span>
            </p>
            <div className="learning-audience__chips">
              {AUDIENCE_ROLE_OPTIONS.map((option) => {
                const selected = value.roles.includes(option.value);
                return (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => toggleRole(option.value)}
                    aria-pressed={selected}
                    title={option.hint}
                    className={`learning-chip ${selected ? 'is-selected' : ''}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="learning-audience__group">
            <p className="learning-audience__group-label">
              Atalhos de faixa <span className="learning-audience__hint">nenhuma marcada = todas</span>
            </p>
            <div className="learning-audience__chips">
              {BELT_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className="learning-chip learning-chip--preset"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {renderBeltGroup('Faixas adulto', ADULT_BELTS)}
          {renderBeltGroup('Faixas kids', KIDS_BELTS)}
        </div>
      ) : (
        <p className="learning-audience__inherit-note">
          Este conteúdo usa exatamente o público-alvo definido n{parentArticle} {parent}.
        </p>
      )}

      <div className={`learning-audience__preview ${isEmptyAudience(effective) ? 'is-empty' : ''}`}>
        <p className="learning-audience__preview-label">Quem vai ver</p>
        <p className="learning-audience__preview-value">{describeAudience(effective)}</p>
        {!isEmptyAudience(effective) && audienceUsers.length > 0 ? (
          <p className="learning-audience__preview-count">
            {matchingUsers} de {audienceUsers.length} pessoas no recorte atual
          </p>
        ) : null}
        {isEmptyAudience(effective) ? (
          <p className="learning-audience__preview-warning">
            <AlertTriangle size={14} />
            A combinação com os níveis acima não deixa ninguém. Ajuste os perfis ou as faixas.
          </p>
        ) : null}
        {narrowedByParent ? (
          <p className="learning-audience__preview-warning">
            <AlertTriangle size={14} />
            {parentArticle === 'a' ? 'A' : 'O'} {parent} é mais {parentRestrictive}: vale a interseção mostrada acima, não a seleção completa.
          </p>
        ) : null}
      </div>
    </div>
  );
};

export default LearningAudienceField;
