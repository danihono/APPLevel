import React, { useMemo, useState } from 'react';
import { MessageCircle, Phone, Trophy, UserMinus } from 'lucide-react';
import { beltLabel, getUserProgressionSummary, type ProgressionRules } from '../beltCatalog';
import { CommitmentBadge } from './CommitmentBar';
import { resolveCommitment, summarizeMonthlyAttendanceByUser, type CommitmentResult } from '../commitmentScale';
import { stripDate } from '../calendarUtils';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, ClassRecord, UserRecord } from '../services/firebase/models';
import { createDateFormatter } from '../i18n';

export type AttendanceRankingPeriod = '30d' | '3m' | 'total';

interface AcademyAttendancePanelsProps {
  students: Array<FirestoreEntity<UserRecord>>;
  attendances?: Array<FirestoreEntity<AttendanceRecord>>;
  classes?: Array<FirestoreEntity<ClassRecord>>;
  academyId: string;
  attendancesError?: string | null;
  progressionRules?: ProgressionRules | null;
  timeZone?: string;
}

const RANKING_PERIOD_OPTIONS: Array<{ value: AttendanceRankingPeriod; label: string }> = [
  { value: '30d', label: '30 dias' },
  { value: '3m', label: '3 meses' },
  { value: 'total', label: 'Total' },
];

// Faixas de ausencia sem sobreposicao: cada aluno aparece em uma unica faixa, entao a soma
// dos contadores e o total de faltantes. "Mais de 60 dias" e a cauda — quem sumiu de vez.
const ABSENCE_BUCKETS: Array<{ id: string; label: string; caption: string; min: number; max: number | null }> = [
  { id: '7', label: '7 dias', caption: '7 a 14 dias', min: 7, max: 14 },
  { id: '15', label: '15 dias', caption: '15 a 29 dias', min: 15, max: 29 },
  { id: '30', label: '30 dias', caption: '30 a 44 dias', min: 30, max: 44 },
  { id: '45', label: '45 dias', caption: '45 a 59 dias', min: 45, max: 59 },
  { id: '60', label: '60 dias', caption: '60 a 89 dias', min: 60, max: 89 },
  { id: '60+', label: 'Mais de 60 dias', caption: '90 dias ou mais', min: 90, max: null },
];

const ABSENCE_MINIMUM_DAYS = 7;
const RANKING_PREVIEW_SIZE = 10;
const ABSENCE_PREVIEW_SIZE = 12;

const dateFormatter = createDateFormatter({ day: '2-digit', month: '2-digit', year: 'numeric' });

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || 'A';
}

function studentRankLabel(student: FirestoreEntity<UserRecord>) {
  const gradeValue = Number(student.grade ?? student.stripes ?? 0);
  return `${beltLabel(student.belt)} · ${gradeValue}º Grau`;
}

function onlyDigits(value?: string | null) {
  return (value ?? '').replace(/\D/g, '');
}

// Telefones sao digitados livremente ('(19) 99999-0000', '19999990000'). Para o link a gente
// so precisa dos digitos; numeros brasileiros (10 ou 11 digitos) ganham o DDI 55.
function toInternationalDigits(phone?: string | null): string {
  const digits = onlyDigits(phone);

  if (digits.length < 10) {
    return '';
  }

  return digits.length <= 11 ? `55${digits}` : digits;
}

function buildTelLink(phone?: string | null): string {
  const digits = toInternationalDigits(phone);
  return digits ? `tel:+${digits}` : '';
}

function buildWhatsAppLink(phone?: string | null): string {
  const digits = toInternationalDigits(phone);
  return digits ? `https://wa.me/${digits}` : '';
}

function getAttendanceMillis(attendance: FirestoreEntity<AttendanceRecord>): number {
  return attendance.checkedInAt?.toMillis() ?? attendance.createdAt?.toMillis() ?? 0;
}

// Dias inteiros de calendario entre a ultima presenca e hoje: quem treinou ontem a noite
// aparece com "1 dia", nao com "0" por causa do horario.
function daysSince(date: Date): number {
  const diff = stripDate(new Date()).getTime() - stripDate(date).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function formatDaysLabel(days: number): string {
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

const AcademyAttendancePanels: React.FC<AcademyAttendancePanelsProps> = ({
  students,
  attendances = [],
  classes = [],
  academyId,
  attendancesError = null,
  progressionRules = null,
  timeZone,
}) => {
  const [rankingPeriod, setRankingPeriod] = useState<AttendanceRankingPeriod>('30d');
  const [rankingExpanded, setRankingExpanded] = useState(false);
  const [absenceBucketId, setAbsenceBucketId] = useState<string>('all');
  const [absenceExpanded, setAbsenceExpanded] = useState(false);

  // Mesma regra do ranking de Alunos e da Central: aula "realizada" e a finalizada, a que
  // esta em andamento ou a que ja passou do horario — muitos professores nunca clicam em
  // "Finalizar" e exigir status 'finished' zerava o ranking dessas unidades.
  const realizedClassIds = useMemo(
    () => new Set(
      classes
        .filter((lesson) => {
          if (lesson.status === 'cancelled') {
            return false;
          }

          if (lesson.status === 'finished' || lesson.status === 'active') {
            return true;
          }

          const start = lesson.scheduledStart?.toDate();
          return !!start && start.getTime() < Date.now();
        })
        .map((lesson) => lesson.id),
    ),
    [classes],
  );
  const hasClassData = classes.length > 0;

  const periodStartMillis = useMemo(() => {
    if (rankingPeriod === 'total') {
      return null;
    }

    const start = new Date();
    if (rankingPeriod === '30d') {
      start.setDate(start.getDate() - 30);
    } else {
      start.setMonth(start.getMonth() - 3);
    }
    start.setHours(0, 0, 0, 0);

    return start.getTime();
  }, [rankingPeriod]);

  const periodAttendanceByUserId = useMemo(() => {
    const next = new Map<string, number>();

    if (periodStartMillis === null) {
      return next;
    }

    attendances.forEach((attendance) => {
      if (academyId && attendance.academyId !== academyId) {
        return;
      }

      if (attendance.countsAsAttendance === false) {
        return;
      }

      if (hasClassData && !realizedClassIds.has(attendance.classId)) {
        return;
      }

      if (getAttendanceMillis(attendance) < periodStartMillis) {
        return;
      }

      next.set(attendance.userId, (next.get(attendance.userId) ?? 0) + 1);
    });

    return next;
  }, [academyId, attendances, hasClassData, periodStartMillis, realizedClassIds]);

  // `lastAttendanceAt` no usuario cobre todo o historico; as presencas carregadas cobrem
  // so a janela assinada. Fica o mais recente entre os dois para nao marcar como faltante
  // quem treinou e ainda nao teve o contador do usuario atualizado.
  const lastAttendanceMillisByUserId = useMemo(() => {
    const next = new Map<string, number>();

    attendances.forEach((attendance) => {
      if (academyId && attendance.academyId !== academyId) {
        return;
      }

      const millis = getAttendanceMillis(attendance);
      if (!millis) {
        return;
      }

      const current = next.get(attendance.userId) ?? 0;
      if (millis > current) {
        next.set(attendance.userId, millis);
      }
    });

    return next;
  }, [academyId, attendances]);

  // Comprometimento do mes por aluno (vide commitmentScale.ts). Sem presenca carregada o selo
  // nao aparece: "nao treinou" e "ainda nao chegou" dariam o mesmo vermelho.
  const hasCommitmentData = attendances.length > 0 && !attendancesError;
  const scheduledStartByClassId = useMemo(
    () => new Map(classes.map((lesson) => [lesson.id, lesson.scheduledStart])),
    [classes],
  );

  const commitmentByUserId = useMemo(() => {
    const result = new Map<string, CommitmentResult>();
    if (!hasCommitmentData) {
      return result;
    }

    const summaries = summarizeMonthlyAttendanceByUser({
      attendances,
      academyId: academyId || undefined,
      classStartById: scheduledStartByClassId,
      timeZone,
    });

    students.forEach((student) => {
      if (student.role !== 'student') {
        return;
      }

      const summary = summaries.get(student.id);
      result.set(student.id, resolveCommitment({
        classes: summary?.classes ?? 0,
        countedClasses: summary?.countedClasses ?? 0,
        weeksWithClasses: summary?.weeksWithClasses ?? 0,
        track: getUserProgressionSummary(student, progressionRules).track,
        monthLabel: summary?.monthLabel,
      }));
    });

    return result;
  }, [academyId, attendances, hasCommitmentData, progressionRules, scheduledStartByClassId, students, timeZone]);

  const activeStudents = useMemo(
    () => students.filter((student) => student.role === 'student' && student.status !== 'suspended'),
    [students],
  );

  const rankingRows = useMemo(() => (
    activeStudents
      .map((student) => ({
        student,
        attendanceCount: periodStartMillis === null
          ? Math.max(0, Math.floor(student.attendanceCount ?? 0))
          : periodAttendanceByUserId.get(student.id) ?? 0,
      }))
      .filter((row) => row.attendanceCount > 0)
      .sort((left, right) => {
        const diff = right.attendanceCount - left.attendanceCount;
        if (diff !== 0) {
          return diff;
        }

        return left.student.displayName.localeCompare(right.student.displayName, 'pt-BR');
      })
  ), [activeStudents, periodAttendanceByUserId, periodStartMillis]);

  const visibleRankingRows = rankingExpanded ? rankingRows : rankingRows.slice(0, RANKING_PREVIEW_SIZE);
  const rankingPeriodLabel = RANKING_PERIOD_OPTIONS.find((option) => option.value === rankingPeriod)?.label ?? '';

  const absenceRows = useMemo(() => (
    activeStudents
      .map((student) => {
        const recordMillis = student.lastAttendanceAt?.toMillis() ?? 0;
        const loadedMillis = lastAttendanceMillisByUserId.get(student.id) ?? 0;
        const lastMillis = Math.max(recordMillis, loadedMillis);

        if (lastMillis > 0) {
          const lastDate = new Date(lastMillis);
          return {
            student,
            lastDate,
            days: daysSince(lastDate),
            neverTrained: false,
          };
        }

        // Nunca registrou presenca: o tempo conta desde o inicio dos treinos (ou do cadastro),
        // senao o aluno que entrou e sumiu nunca apareceria na lista.
        const referenceMillis = student.trainingStartDate?.toMillis() ?? student.createdAt?.toMillis() ?? 0;
        if (!referenceMillis) {
          return null;
        }

        const referenceDate = new Date(referenceMillis);
        return {
          student,
          lastDate: null,
          days: daysSince(referenceDate),
          neverTrained: true,
        };
      })
      .filter((row): row is { student: FirestoreEntity<UserRecord>; lastDate: Date | null; days: number; neverTrained: boolean } => (
        row !== null && row.days >= ABSENCE_MINIMUM_DAYS
      ))
      .sort((left, right) => {
        const diff = right.days - left.days;
        if (diff !== 0) {
          return diff;
        }

        return left.student.displayName.localeCompare(right.student.displayName, 'pt-BR');
      })
  ), [activeStudents, lastAttendanceMillisByUserId]);

  const absenceCountByBucketId = useMemo(() => {
    const next = new Map<string, number>();

    ABSENCE_BUCKETS.forEach((bucket) => next.set(bucket.id, 0));
    absenceRows.forEach((row) => {
      const bucket = ABSENCE_BUCKETS.find((entry) => (
        row.days >= entry.min && (entry.max === null || row.days <= entry.max)
      ));

      if (bucket) {
        next.set(bucket.id, (next.get(bucket.id) ?? 0) + 1);
      }
    });

    return next;
  }, [absenceRows]);

  const filteredAbsenceRows = useMemo(() => {
    if (absenceBucketId === 'all') {
      return absenceRows;
    }

    const bucket = ABSENCE_BUCKETS.find((entry) => entry.id === absenceBucketId);
    if (!bucket) {
      return absenceRows;
    }

    return absenceRows.filter((row) => (
      row.days >= bucket.min && (bucket.max === null || row.days <= bucket.max)
    ));
  }, [absenceBucketId, absenceRows]);

  const visibleAbsenceRows = absenceExpanded
    ? filteredAbsenceRows
    : filteredAbsenceRows.slice(0, ABSENCE_PREVIEW_SIZE);

  return (
    <>
      <section className="academy-mobile__section academy-insight">
        <div className="academy-insight__head">
          <div>
            <p className="academy-mobile__section-label">Ranking de presenças na unidade</p>
            <p className="academy-insight__hint">
              {rankingPeriod === 'total'
                ? 'Total oficial de presenças acumuladas por aluno nesta unidade.'
                : `Quem mais treinou nos últimos ${rankingPeriodLabel.toLocaleLowerCase('pt-BR')}.`}
            </p>
          </div>

          <div className="academy-insight__chips" role="group" aria-label="Período do ranking">
            {RANKING_PERIOD_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={rankingPeriod === option.value}
                onClick={() => {
                  setRankingPeriod(option.value);
                  setRankingExpanded(false);
                }}
                className={`academy-insight__chip ${rankingPeriod === option.value ? 'is-active' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {attendancesError && rankingPeriod !== 'total' ? (
          <div className="app-alert app-alert--error">
            Não foi possível carregar as presenças do período: {attendancesError}
          </div>
        ) : null}

        <div className="academy-insight__list">
          {visibleRankingRows.length > 0 ? (
            visibleRankingRows.map((row, index) => (
              <article key={row.student.id} className="academy-insight__row">
                <span className={`academy-insight__position${index < 3 ? ' is-podium' : ''}`}>
                  {index < 3 ? <Trophy size={14} aria-hidden="true" /> : null}
                  {index + 1}º
                </span>

                <div className="academy-insight__copy">
                  <p className="academy-insight__name">{row.student.displayName}</p>
                  <p className="academy-insight__meta">{studentRankLabel(row.student)}</p>
                  {commitmentByUserId.has(row.student.id) ? (
                    <CommitmentBadge commitment={commitmentByUserId.get(row.student.id)!} />
                  ) : null}
                </div>

                <span className="academy-insight__value">
                  {row.attendanceCount}
                  <small>{row.attendanceCount === 1 ? 'presença' : 'presenças'}</small>
                </span>
              </article>
            ))
          ) : (
            <div className="academy-mobile__empty">
              {rankingPeriod === 'total'
                ? 'Nenhum aluno com presença registrada nesta unidade ainda.'
                : 'Nenhuma presença registrada no período selecionado.'}
            </div>
          )}
        </div>

        {rankingRows.length > RANKING_PREVIEW_SIZE ? (
          <button
            type="button"
            onClick={() => setRankingExpanded((current) => !current)}
            className="academy-insight__more"
          >
            {rankingExpanded ? 'Mostrar só o top 10' : `Ver todos os ${rankingRows.length} alunos`}
          </button>
        ) : null}
      </section>

      <section className="academy-mobile__section academy-insight">
        <div className="academy-insight__head">
          <div>
            <p className="academy-mobile__section-label">Relação de faltantes</p>
            <p className="academy-insight__hint">
              Alunos ativos sem presença há 7 dias ou mais — com telefone à mão para chamar de volta.
            </p>
          </div>
        </div>

        <div className="academy-insight__chips academy-insight__chips--buckets" role="group" aria-label="Faixas de ausência">
          <button
            type="button"
            aria-pressed={absenceBucketId === 'all'}
            onClick={() => {
              setAbsenceBucketId('all');
              setAbsenceExpanded(false);
            }}
            className={`academy-insight__bucket ${absenceBucketId === 'all' ? 'is-active' : ''}`}
          >
            <span className="academy-insight__bucket-count">{absenceRows.length}</span>
            <span className="academy-insight__bucket-label">Todos</span>
            <span className="academy-insight__bucket-caption">7 dias ou mais</span>
          </button>

          {ABSENCE_BUCKETS.map((bucket) => (
            <button
              key={bucket.id}
              type="button"
              aria-pressed={absenceBucketId === bucket.id}
              onClick={() => {
                setAbsenceBucketId(bucket.id);
                setAbsenceExpanded(false);
              }}
              className={`academy-insight__bucket ${absenceBucketId === bucket.id ? 'is-active' : ''}`}
            >
              <span className="academy-insight__bucket-count">{absenceCountByBucketId.get(bucket.id) ?? 0}</span>
              <span className="academy-insight__bucket-label">{bucket.label}</span>
              <span className="academy-insight__bucket-caption">{bucket.caption}</span>
            </button>
          ))}
        </div>

        <div className="academy-insight__list">
          {visibleAbsenceRows.length > 0 ? (
            visibleAbsenceRows.map((row) => {
              const telLink = buildTelLink(row.student.phone);
              const whatsAppLink = buildWhatsAppLink(row.student.phone);

              return (
                <article key={row.student.id} className="academy-insight__row academy-insight__row--absence">
                  <div className="academy-mobile__avatar" aria-hidden="true">{getInitial(row.student.displayName)}</div>

                  <div className="academy-insight__copy">
                    <p className="academy-insight__name">{row.student.displayName}</p>
                    <p className="academy-insight__meta">{studentRankLabel(row.student)}</p>
                    <p className="academy-insight__meta">
                      {row.neverTrained
                        ? 'Sem presença registrada'
                        : `Última presença em ${dateFormatter.format(row.lastDate as Date)}`}
                    </p>
                    <p className="academy-insight__meta academy-insight__phone">
                      {row.student.phone || 'Sem telefone cadastrado'}
                    </p>
                    {commitmentByUserId.has(row.student.id) ? (
                      <CommitmentBadge commitment={commitmentByUserId.get(row.student.id)!} />
                    ) : null}
                  </div>

                  <span className={`academy-insight__days${row.days >= 30 ? ' is-critical' : ''}`}>
                    {formatDaysLabel(row.days)}
                  </span>

                  {telLink || whatsAppLink ? (
                    <div className="academy-insight__actions">
                      {telLink ? (
                        <a
                          href={telLink}
                          className="academy-insight__action"
                          aria-label={`Ligar para ${row.student.displayName}`}
                        >
                          <Phone size={14} aria-hidden="true" />
                          Ligar
                        </a>
                      ) : null}

                      {whatsAppLink ? (
                        <a
                          href={whatsAppLink}
                          target="_blank"
                          rel="noreferrer"
                          className="academy-insight__action"
                          aria-label={`Enviar WhatsApp para ${row.student.displayName}`}
                        >
                          <MessageCircle size={14} aria-hidden="true" />
                          WhatsApp
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })
          ) : (
            <div className="academy-mobile__empty">
              <UserMinus size={16} aria-hidden="true" className="academy-insight__empty-icon" />
              {absenceRows.length === 0
                ? 'Nenhum aluno ativo está sem treinar há 7 dias ou mais. Turma em dia!'
                : 'Nenhum aluno nesta faixa de ausência.'}
            </div>
          )}
        </div>

        {filteredAbsenceRows.length > ABSENCE_PREVIEW_SIZE ? (
          <button
            type="button"
            onClick={() => setAbsenceExpanded((current) => !current)}
            className="academy-insight__more"
          >
            {absenceExpanded
              ? `Mostrar só os primeiros ${ABSENCE_PREVIEW_SIZE}`
              : `Ver todos os ${filteredAbsenceRows.length} faltantes`}
          </button>
        ) : null}
      </section>
    </>
  );
};

export default AcademyAttendancePanels;
