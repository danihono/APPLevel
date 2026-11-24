import React, { useEffect, useId, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { getYouTubeVideoId } from '../utils';
import { t } from '../i18n';

type YouTubePlayerStateEvent = {
  data: number;
  target: {
    getCurrentTime(): number;
    getDuration(): number;
  };
};

type YouTubePlayer = {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
};

type YouTubeNamespace = {
  Player: new (
    element: HTMLElement,
    config: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: () => void;
        onStateChange?: (event: YouTubePlayerStateEvent) => void;
      };
    },
  ) => YouTubePlayer;
  PlayerState: {
    PLAYING: number;
  };
};

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: (() => void) | null;
  }
}

let youTubeApiLoader: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube API indisponivel no servidor.'));
  }

  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (youTubeApiLoader) {
    return youTubeApiLoader;
  }

  youTubeApiLoader = new Promise((resolve) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-youtube-api="true"]');
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve();
    };

    if (existingScript) {
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.dataset.youtubeApi = 'true';
    document.head.appendChild(script);
  });

  return youTubeApiLoader;
}

/*
 * No app de iPhone a pagina e capacitor://localhost (sem site), e o YouTube recusa o player embutido
 * (Erro 153). Ali o video toca pela pagina /player/ do site do app (public/player/index.html), que avisa
 * o progresso por postMessage. No navegador e no Android (site https) o player continua direto aqui.
 */
const HOSTED_PLAYER_ORIGIN =
  import.meta.env.VITE_CALLABLE_PROXY_ORIGIN
  || (import.meta.env.VITE_FIREBASE_PROJECT_ID ? `https://${import.meta.env.VITE_FIREBASE_PROJECT_ID}.web.app` : '');

function shouldUseHostedPlayer(): boolean {
  if (typeof window === 'undefined' || !HOSTED_PLAYER_ORIGIN) return false;
  const origin = window.location.origin;
  return Capacitor.isNativePlatform() || !(origin.startsWith('https://') || origin.startsWith('http://'));
}

interface LearningVideoPlayerProps {
  lessonKey: string;
  videoUrl: string;
  disabled?: boolean;
  onProgress: (payload: { currentSeconds: number; durationSeconds: number }) => void;
}

const LearningVideoPlayer: React.FC<LearningVideoPlayerProps> = ({
  lessonKey,
  videoUrl,
  disabled = false,
  onProgress,
}) => {
  const hostId = useId().replace(/:/g, '');
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const intervalRef = useRef<number | null>(null);
  const onProgressRef = useRef(onProgress);
  const videoId = getYouTubeVideoId(videoUrl);
  const useHostedPlayer = shouldUseHostedPlayer();
  const hostedKey = `${lessonKey}-${hostId}`;

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    const stopInterval = () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const emitProgress = () => {
      const player = playerRef.current;
      if (!player) {
        return;
      }

      const currentSeconds = Math.max(0, Math.floor(player.getCurrentTime()));
      const durationSeconds = Math.max(0, Math.floor(player.getDuration()));
      if (durationSeconds <= 0) {
        return;
      }

      onProgressRef.current({
        currentSeconds,
        durationSeconds,
      });
    };

    let cancelled = false;

    stopInterval();
    playerRef.current?.destroy();
    playerRef.current = null;

    if (useHostedPlayer || disabled || !videoId || !hostRef.current) {
      return () => {
        stopInterval();
      };
    }

    void loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current || !window.YT?.Player) {
        return;
      }

      playerRef.current = new window.YT.Player(hostRef.current, {
        videoId,
        playerVars: {
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            emitProgress();
          },
          onStateChange: (event) => {
            if (event.data === window.YT?.PlayerState.PLAYING) {
              if (!intervalRef.current) {
                intervalRef.current = window.setInterval(emitProgress, 4_000);
              }
              return;
            }

            emitProgress();
            stopInterval();
          },
        },
      });
    });

    return () => {
      cancelled = true;
      stopInterval();
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [disabled, hostId, lessonKey, useHostedPlayer, videoId]);

  // Progresso vindo da pagina /player/ (so dessa origem e com a chave deste bloco).
  useEffect(() => {
    if (!useHostedPlayer || disabled || !videoId) return undefined;
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== HOSTED_PLAYER_ORIGIN) return;
      const data = event.data as { type?: unknown; key?: unknown; currentSeconds?: unknown; durationSeconds?: unknown } | null;
      if (!data || data.type !== 'lv-yt' || data.key !== hostedKey) return;
      const currentSeconds = Number(data.currentSeconds);
      const durationSeconds = Number(data.durationSeconds);
      if (!Number.isFinite(currentSeconds) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
      onProgressRef.current({
        currentSeconds: Math.max(0, Math.floor(currentSeconds)),
        durationSeconds: Math.floor(durationSeconds),
      });
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [disabled, hostedKey, useHostedPlayer, videoId]);

  if (!videoId) {
    return (
      <div className="app-empty">
        {t('Informe uma URL valida do YouTube para reproduzir esta aula.')}
      </div>
    );
  }

  if (useHostedPlayer) {
    const src = `${HOSTED_PLAYER_ORIGIN}/player/?v=${encodeURIComponent(videoId)}&k=${encodeURIComponent(hostedKey)}`;
    return (
      <div className="app-video-frame aspect-video overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/30">
        <iframe
          key={src}
          src={src}
          title={t('Vídeo da aula')}
          className="h-full w-full"
          style={{ border: 0, display: 'block', ...(disabled ? { pointerEvents: 'none', opacity: 0.75 } : {}) }}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="app-video-frame aspect-video overflow-hidden rounded-[1.6rem] border border-white/10 bg-black/30">
      <div id={`learning-player-${hostId}`} ref={hostRef} className="h-full w-full" />
    </div>
  );
};

export default LearningVideoPlayer;
