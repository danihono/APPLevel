import React from 'react';
import { ExternalLink } from 'lucide-react';
import type { VideoSourceKind } from '../types';
import { getYouTubeEmbedUrl } from '../utils';

interface AppVideoContentProps {
  title: string;
  sourceUrl: string;
  sourceKind: VideoSourceKind;
  externalLabel?: string;
}

const AppVideoContent: React.FC<AppVideoContentProps> = ({
  title,
  sourceUrl,
  sourceKind,
  externalLabel = 'Abrir video',
}) => {
  if (!sourceUrl) {
    return <div className="app-empty">Video indisponivel.</div>;
  }

  if (sourceKind === 'youtube') {
    return (
      <div className="app-video-frame aspect-video">
        <iframe
          src={getYouTubeEmbedUrl(sourceUrl)}
          className="h-full w-full"
          allowFullScreen
          title={title}
        />
      </div>
    );
  }

  if (sourceKind === 'upload') {
    return (
      <div className="app-video-frame aspect-video overflow-hidden bg-black/30">
        <video
          controls
          src={sourceUrl}
          className="h-full w-full"
          title={title}
        />
      </div>
    );
  }

  return (
    <div className="app-video-frame aspect-video flex items-center justify-center bg-white/5 p-6 text-center">
      <div className="space-y-3">
        <p className="text-sm text-[color:var(--text-muted)]">
          Este video usa um link externo e sera aberto fora do player interno.
        </p>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="app-button app-button--dark app-button--small"
        >
          <ExternalLink size={14} />
          {externalLabel}
        </a>
      </div>
    </div>
  );
};

export default AppVideoContent;
