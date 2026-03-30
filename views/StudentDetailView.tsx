import React from 'react';
import { ArrowLeft, Award, Calendar, Clock, Mail, TrendingUp, Video } from 'lucide-react';
import AvatarWithBelt from '../components/AvatarWithBelt';
import ProgressBar from '../components/ProgressBar';
import type { User } from '../types';
import { getYouTubeEmbedUrl } from '../utils';

interface StudentDetailViewProps {
  student: User;
  onBack: () => void;
}

function formatDate(value?: string) {
  if (!value) {
    return 'Sem registro';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return parsed.toLocaleDateString('pt-BR');
}

const StudentDetailView: React.FC<StudentDetailViewProps> = ({ student, onBack }) => {
  const age = student.birthDate
    ? new Date().getFullYear() - new Date(student.birthDate).getFullYear()
    : 28;

  return (
    <div className="view-shell">
      <div className="flex items-center gap-4">
        <button type="button" onClick={onBack} className="app-button app-button--ghost app-button--icon">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="app-section-label">Perfil do aluno</p>
          <h1 className="text-2xl font-bold">{student.name}</h1>
        </div>
      </div>

      <section className="app-panel app-panel--hero app-panel-pad text-center">
        <div className="flex justify-center">
          <AvatarWithBelt
            avatar={student.avatar}
            name={student.name}
            belt={student.belt}
            stripes={student.stripes}
            size="lg"
          />
        </div>
        <h2 className="mt-4 text-3xl font-bold">{student.name}</h2>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">{student.type} - {age} anos</p>

        <div className="app-panel app-panel--soft mt-6 px-4 py-4">
          <div className="flex items-center justify-center gap-2 text-sm text-[color:var(--text-muted)]">
            <Mail size={16} />
            {student.email}
          </div>
        </div>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="app-section-label">Progresso</p>
            <h2 className="text-xl font-bold">Avanco atual</h2>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <ProgressBar current={student.currentStripeProgress} total={student.classesToNextStripe} />
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              Proximo grau: {student.currentStripeProgress}/{student.classesToNextStripe} aulas
            </p>
          </div>
          <div>
            <ProgressBar current={student.currentBeltProgress} total={student.totalClassesToNextBelt} color="bg-gold" />
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              Proxima faixa: {student.currentBeltProgress}/{student.totalClassesToNextBelt} aulas
            </p>
          </div>
        </div>
      </section>

      {student.videos && student.videos.length > 0 ? (
        <section className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Video size={18} />
            </div>
            <div>
              <p className="app-section-label">Videos</p>
              <h2 className="text-xl font-bold">Arquivo de lutas</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            {student.videos.map((video) => (
              <div key={video.id} className="app-list-card">
                <div className="app-video-frame aspect-video">
                  <iframe
                    src={getYouTubeEmbedUrl(video.url)}
                    className="h-full w-full"
                    allowFullScreen
                    title={video.title}
                  />
                </div>
                <div className="mt-4">
                  <p className="text-sm font-bold">{video.title}</p>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">{video.date}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <Clock size={18} />
          </div>
          <div>
            <p className="app-section-label">Historico</p>
            <h2 className="text-xl font-bold">Linha do tempo</h2>
          </div>
        </div>

        <div className="mt-6 app-list">
          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <Calendar size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Inicio dos treinos</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(student.startDate)}</p>
            </div>
          </div>

          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <Award size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Ultima graduacao</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(student.lastGraduation)}</p>
            </div>
          </div>

          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Ultimo grau recebido</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(student.lastStripeDate)}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default StudentDetailView;
