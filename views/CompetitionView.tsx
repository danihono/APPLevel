import React, { useState } from 'react';
import { Trophy, Calendar, CheckSquare, User, Medal, Weight, Video, ChevronRight, Bell, ExternalLink } from 'lucide-react';
import { getYouTubeEmbedUrl } from '../utils';

const CompetitionView: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'calendar' | 'profile'>('calendar');

  const cbjjEvents = [
    { id: 1, name: 'Curitiba Winter Open 2024', date: '15-16 Jun', location: 'Curitiba, PR', status: 'Inscrições Abertas', link: 'https://cbjj.com.br' },
    { id: 2, name: 'Brasileiro de Jiu-Jitsu 2024', date: '20-28 Abr', location: 'Barueri, SP', status: 'Inscrições Encerradas', link: 'https://cbjj.com.br' },
    { id: 3, name: 'Salvador Fall Open 2024', date: '11-12 Mai', location: 'Salvador, BA', status: 'Em breve', link: 'https://cbjj.com.br' },
  ];

  const checklistItems = [
    { id: 1, label: 'Kimono limpo e dentro das medidas', checked: true },
    { id: 2, label: 'Faixa reserva', checked: false },
    { id: 3, label: 'Documento de identidade', checked: true },
    { id: 4, label: 'Alimentação pré-treino/luta', checked: false },
    { id: 5, label: 'Protetor bucal', checked: true },
  ];

  const athleteHistory = [
    { id: 1, event: 'Curitiba Open 2023', result: '🥇 Ouro', category: 'Adulto / Azul / Médio' },
    { id: 2, event: 'Floripa Open 2023', result: '🥈 Prata', category: 'Adulto / Azul / Médio' },
    { id: 3, event: 'Brasileiro 2022', result: '🥉 Bronze', category: 'Adulto / Branca / Médio' },
  ];

  const myVideos = [
    { id: 'v1', title: 'Minha Final - Curitiba Open', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', date: '15/06/2023' },
  ];

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Competição & Performance</h1>
        <div className="flex bg-gray-100 dark:bg-dark-card p-1 rounded-xl">
          <button 
            onClick={() => setActiveSection('calendar')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeSection === 'calendar' ? 'bg-gold text-dark shadow-sm' : 'text-gray-500'}`}
          >
            Calendário
          </button>
          <button 
            onClick={() => setActiveSection('profile')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeSection === 'profile' ? 'bg-gold text-dark shadow-sm' : 'text-gray-500'}`}
          >
            Perfil Atleta
          </button>
        </div>
      </div>

      {activeSection === 'calendar' ? (
        <div className="space-y-6">
          {/* CBJJ Events */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="text-gold" size={20} />
              <h2 className="font-bold text-lg">Eventos CBJJ</h2>
            </div>
            <div className="space-y-3">
              {cbjjEvents.map(event => (
                <div key={event.id} className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex justify-between items-center">
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm">{event.name}</h3>
                    <p className="text-xs text-gray-500">{event.date} • {event.location}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                      event.status === 'Inscrições Abertas' ? 'bg-green-100 text-green-700' : 
                      event.status === 'Inscrições Encerradas' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {event.status}
                    </span>
                  </div>
                  <a href={event.link} target="_blank" rel="noopener noreferrer" className="p-2 text-gold hover:bg-gold/10 rounded-full transition-colors">
                    <ExternalLink size={18} />
                  </a>
                </div>
              ))}
            </div>
          </section>

          {/* Checklist */}
          <section className="bg-white dark:bg-dark-card p-6 rounded-3xl border border-gray-100 dark:border-white/5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="text-gold" size={20} />
              <h2 className="font-bold text-lg">Checklist Pré-Competição</h2>
            </div>
            <div className="space-y-3">
              {checklistItems.map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${item.checked ? 'bg-gold border-gold' : 'border-gray-300'}`}>
                    {item.checked && <CheckSquare size={14} className="text-dark" />}
                  </div>
                  <span className={`text-sm ${item.checked ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* Notifications */}
          <section className="bg-gold/10 p-4 rounded-2xl border border-gold/20 flex items-center gap-4">
            <div className="bg-gold p-2 rounded-full text-dark">
              <Bell size={20} />
            </div>
            <div>
              <h3 className="font-bold text-sm">Notificações Ativas</h3>
              <p className="text-xs text-gray-600">Você será avisado quando as inscrições para o Salvador Open abrirem.</p>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Athlete Stats */}
          <section className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex flex-col items-center text-center">
              <Weight className="text-gold mb-2" size={24} />
              <p className="text-[10px] font-bold text-gray-400 uppercase">Peso Atual</p>
              <p className="text-lg font-bold">82.5 kg</p>
              <p className="text-[10px] text-gold">Categoria: Médio</p>
            </div>
            <div className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex flex-col items-center text-center">
              <Medal className="text-gold mb-2" size={24} />
              <p className="text-[10px] font-bold text-gray-400 uppercase">Medalhas</p>
              <p className="text-lg font-bold">12</p>
              <p className="text-[10px] text-gold">3 Ouros • 5 Pratas</p>
            </div>
          </section>

          {/* Championship History */}
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Trophy className="text-gold" size={20} />
              <h2 className="font-bold text-lg">Histórico de Lutas</h2>
            </div>
            <div className="space-y-3">
              {athleteHistory.map(item => (
                <div key={item.id} className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-sm">{item.event}</h3>
                    <p className="text-xs text-gray-500">{item.category}</p>
                  </div>
                  <span className="font-bold text-sm">{item.result}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Video Upload Section */}
          <section className="bg-white dark:bg-dark-card p-6 rounded-3xl border border-gray-100 dark:border-white/5 space-y-4">
            <div className="flex items-center gap-2">
              <Video className="text-gold" size={20} />
              <h2 className="font-bold text-lg">Vídeos de Lutas</h2>
            </div>

            {/* List of uploaded videos */}
            <div className="space-y-4 mb-4">
              {myVideos.map(video => (
                <div key={video.id} className="space-y-2">
                  <div className="aspect-video bg-black rounded-2xl overflow-hidden relative group">
                    <iframe 
                      src={getYouTubeEmbedUrl(video.url)} 
                      className="w-full h-full"
                      allowFullScreen
                      title={video.title}
                    />
                  </div>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm font-bold">{video.title}</p>
                      <p className="text-xs text-gray-500">{video.date}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-2">
              <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-full text-gray-400">
                <Video size={32} />
              </div>
              <p className="text-sm font-bold">Adicionar Vídeo do YouTube</p>
              <p className="text-xs text-gray-500">Cole a URL do vídeo para salvar em seu perfil</p>
              <div className="w-full flex gap-2 mt-2">
                <input 
                  type="text" 
                  placeholder="https://youtube.com/watch?v=..." 
                  className="flex-1 px-3 py-2 bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl text-xs"
                />
                <button className="px-4 py-2 bg-gold text-dark rounded-xl text-xs font-bold">
                  Salvar
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default CompetitionView;
