import React from 'react';
import { BookOpen, CirclePlay, ClipboardCheck, TimerReset } from 'lucide-react';
import { UserRole } from '../types';

interface LearningHubViewProps {
  academyName: string;
  userName: string;
  userRole?: UserRole;
}

const lessonTracks = [
  {
    id: 'fundamentos-kids',
    title: 'Didatica para aula Kids',
    category: 'Metodologia',
    duration: '18 min',
    level: 'Obrigatorio',
    status: 'Concluido',
    progress: '100%',
  },
  {
    id: 'sequencia-faixa-preta',
    title: 'Sequencias tecnicas para a turma avancada',
    category: 'Tecnica',
    duration: '24 min',
    level: 'Em andamento',
    status: 'Em andamento',
    progress: '62%',
  },
  {
    id: 'protocolo-aula',
    title: 'Protocolo de abertura, chamada e encerramento',
    category: 'Operacao',
    duration: '12 min',
    level: 'Novo',
    status: 'Nao iniciado',
    progress: '0%',
  },
];

const quizCards = [
  {
    id: 'quiz-kids',
    title: 'Quiz: conduzir a aula Kids',
    questions: 6,
    passingScore: '80%',
    due: 'Disponivel agora',
  },
  {
    id: 'quiz-operacao',
    title: 'Quiz: fluxo operacional do tatame',
    questions: 5,
    passingScore: '80%',
    due: 'Disponivel agora',
  },
];

const LearningHubView: React.FC<LearningHubViewProps> = ({
  academyName,
  userName,
  userRole,
}) => {
  const roleLabel = userRole === UserRole.ADMIN ? 'Head Coach' : 'Instrutor';

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="app-section-label">Learning hub</p>
            <h1 className="app-section-title">Capacitacao continua da equipe</h1>
            <p className="app-section-copy">
              Videos, trilhas e quizzes para apoiar {academyName} com uma rotina de desenvolvimento mais consistente.
            </p>
          </div>

          <div className="app-orb">
            <BookOpen size={16} />
            {roleLabel}
          </div>
        </div>

        <div className="app-stat-grid mt-6">
          <article className="app-stat-card">
            <p className="app-stat-card__label">Trilhas ativas</p>
            <p className="app-stat-card__value">{lessonTracks.length}</p>
            <p className="app-stat-card__note">Conteudos publicados para a equipe</p>
          </article>
          <article className="app-stat-card">
            <p className="app-stat-card__label">Quizzes</p>
            <p className="app-stat-card__value">{quizCards.length}</p>
            <p className="app-stat-card__note">Validacoes de aprendizado disponiveis</p>
          </article>
          <article className="app-stat-card">
            <p className="app-stat-card__label">Seu foco</p>
            <p className="app-stat-card__value">62%</p>
            <p className="app-stat-card__note">Progresso na trilha principal</p>
          </article>
        </div>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <CirclePlay size={18} />
          </div>
          <div>
            <p className="app-section-label">Destaque</p>
            <h2 className="text-2xl font-bold">Videoaula em andamento</h2>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-[1.8rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(232,175,72,0.22),transparent_35%),linear-gradient(160deg,rgba(255,255,255,0.1),rgba(255,255,255,0.03))] p-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[color:var(--text-soft)]">Agora assistindo</p>
          <h3 className="mt-3 text-2xl font-bold">{lessonTracks[1].title}</h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)]">
            Um espaco para o professor assistir a aula gravada, revisar pontos-chave e seguir direto para o quiz da mesma trilha.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <span className="app-badge app-badge--gold">{lessonTracks[1].duration}</span>
            <span className="app-badge app-badge--muted">{lessonTracks[1].category}</span>
            <span className="app-badge app-badge--muted">{lessonTracks[1].progress} concluido</span>
          </div>
        </div>
      </section>

      <section className="app-grid-2">
        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <BookOpen size={18} />
            </div>
            <div>
              <p className="app-section-label">Trilhas</p>
              <h2 className="text-xl font-bold">Biblioteca de videoaulas</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            {lessonTracks.map((track) => (
              <div key={track.id} className="app-list-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{track.title}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                      {track.category} • {track.duration} • {track.level}
                    </p>
                  </div>
                  <span className={track.status === 'Concluido' ? 'app-badge app-badge--success' : 'app-badge app-badge--gold'}>
                    {track.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <ClipboardCheck size={18} />
            </div>
            <div>
              <p className="app-section-label">Quiz</p>
              <h2 className="text-xl font-bold">Validacao da videoaula</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            {quizCards.map((quiz) => (
              <div key={quiz.id} className="app-list-card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{quiz.title}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                      {quiz.questions} perguntas • aproveitamento minimo {quiz.passingScore}
                    </p>
                  </div>
                  <span className="app-badge app-badge--muted">{quiz.due}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]">Proxima acao</p>
            <p className="mt-2 text-lg font-bold">{userName.split(' ')[0]}, finalize a trilha principal e abra o quiz.</p>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              A tela ja suporta a logica de video + quiz e pode ser conectada depois a uma colecao real de conteudos.
            </p>
          </div>
        </article>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <TimerReset size={18} />
          </div>
          <div>
            <p className="app-section-label">Progresso</p>
            <h2 className="text-xl font-bold">Status de acompanhamento</h2>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="app-list-card">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Nao iniciado</p>
            <p className="mt-2 text-2xl font-bold">1</p>
          </div>
          <div className="app-list-card">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Em andamento</p>
            <p className="mt-2 text-2xl font-bold">1</p>
          </div>
          <div className="app-list-card">
            <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Concluido</p>
            <p className="mt-2 text-2xl font-bold">1</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LearningHubView;
