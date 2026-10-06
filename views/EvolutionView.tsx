import React, { useState } from 'react';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, AttendanceRequestRecord, ClassRecord } from '../services/firebase/models';
import { t } from '../i18n';
import GraduationView, { type GraduationViewProps } from './GraduationView';
import CompetitionView, { type CompetitionViewProps } from './CompetitionView';

export type EvolutionSegment = 'graduation' | 'competition';

export interface EvolutionViewProps {
  initialSegment?: EvolutionSegment;
  graduation: GraduationViewProps;
  competition: CompetitionViewProps;
  /** Presencas do proprio aluno (calendario do mes). */
  attendances: Array<FirestoreEntity<AttendanceRecord>>;
  /** Solicitacoes de presenca do proprio aluno. */
  attendanceRequests: Array<FirestoreEntity<AttendanceRequestRecord>>;
  /** Aulas da academia. */
  classes: Array<FirestoreEntity<ClassRecord>>;
  academyTimeZone?: string;
}

/** Aba "Evolução" do aluno: Graduação | Competição. */
const EvolutionView: React.FC<EvolutionViewProps> = ({ initialSegment = 'graduation', graduation, competition }) => {
  const [segment, setSegment] = useState<EvolutionSegment>(initialSegment);

  return (
    <div className="lv-screen">
      <div className="lv-segmented" role="tablist">
        <button type="button" role="tab" aria-selected={segment === 'graduation'} className={segment === 'graduation' ? 'is-active' : ''} onClick={() => setSegment('graduation')}>
          {t('Graduação')}
        </button>
        <button type="button" role="tab" aria-selected={segment === 'competition'} className={segment === 'competition' ? 'is-active' : ''} onClick={() => setSegment('competition')}>
          {t('Competição')}
        </button>
      </div>
      {segment === 'graduation' ? <GraduationView {...graduation} /> : <CompetitionView {...competition} />}
    </div>
  );
};

export default EvolutionView;
