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
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 bg-gray-100 dark:bg-dark-card rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">Perfil do Aluno</h1>
      </div>

      <div className="bg-white dark:bg-dark-card p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col items-center text-center">
        <AvatarWithBelt
          avatar={student.avatar}
          name={student.name}
          belt={student.belt}
          stripes={student.stripes}
          size="lg"
        />
        <h2 className="text-2xl font-bold mt-4">{student.name}</h2>
        <p className="text-gray-500 dark:text-gray-400">{student.type} • {age} anos</p>

        <div className="flex items-center gap-2 mt-4 px-4 py-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl w-full justify-center">
          <Mail size={16} className="text-gray-400" />
          <span className="text-sm text-gray-600 dark:text-gray-300">{student.email}</span>
        </div>
      </div>

      <div className="bg-white dark:bg-dark-card p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <TrendingUp size={20} className="text-gold" />
          Progresso
        </h3>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600 dark:text-gray-400">Próximo Grau</span>
              <span className="font-medium">{student.currentStripeProgress} / {student.classesToNextStripe} aulas</span>
            </div>
            <ProgressBar current={student.currentStripeProgress} total={student.classesToNextStripe} />
            <p className="text-xs text-gray-500 mt-2 text-right">
              Faltam {Math.max(student.classesToNextStripe - student.currentStripeProgress, 0)} aulas
            </p>
          </div>

          <div>
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-600 dark:text-gray-400">Próxima Faixa</span>
              <span className="font-medium">{student.currentBeltProgress} / {student.totalClassesToNextBelt} aulas</span>
            </div>
            <ProgressBar current={student.currentBeltProgress} total={student.totalClassesToNextBelt} color="bg-gold" />
            <p className="text-xs text-gray-500 mt-2 text-right">
              Faltam {Math.max(student.totalClassesToNextBelt - student.currentBeltProgress, 0)} aulas
            </p>
          </div>
        </div>
      </div>

      {student.videos && student.videos.length > 0 ? (
        <div className="bg-white dark:bg-dark-card p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Video size={20} className="text-gold" />
            Vídeos de Lutas
          </h3>
          <div className="grid grid-cols-1 gap-4">
            {student.videos.map((video) => (
              <div key={video.id} className="space-y-2">
                <div className="aspect-video bg-black rounded-2xl overflow-hidden relative group">
                  <iframe
                    src={getYouTubeEmbedUrl(video.url)}
                    className="w-full h-full"
                    allowFullScreen
                    title={video.title}
                  />
                </div>
                <div>
                  <p className="text-sm font-bold">{video.title}</p>
                  <p className="text-xs text-gray-500">{video.date}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="bg-white dark:bg-dark-card p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Clock size={20} className="text-gold" />
          Histórico
        </h3>

        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <Calendar size={18} className="text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Início dos Treinos</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(student.startDate)}</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0">
              <Award size={18} className="text-gold-dark" />
            </div>
            <div>
              <p className="text-sm font-medium">Última Graduação</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(student.lastGraduation)}</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={18} className="text-gray-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Último Grau Recebido</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(student.lastStripeDate)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentDetailView;
