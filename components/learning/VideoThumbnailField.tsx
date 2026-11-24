import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, RotateCcw } from 'lucide-react';
import type { EditorBlockDraft } from '../../views/learning/learningShared';
import { getYouTubeVideoId } from '../../utils';
import { t } from '../../i18n';

interface VideoThumbnailFieldProps {
  block: EditorBlockDraft;
  onChange: (patch: Partial<EditorBlockDraft>) => void;
}

function useObjectUrl(file: File | null): string {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ''), [file]);
  useEffect(() => () => {
    if (url) URL.revokeObjectURL(url);
  }, [url]);
  return url;
}

/**
 * Thumbnail de um bloco de video (capa do modulo e do curso no Learning).
 * - YouTube: capa padrao ou um dos 3 frames que o proprio YouTube gera (inicio, meio, fim).
 * - Video enviado: escolher um momento do video e "Usar este frame" (vira JPG e sobe ao salvar).
 * - Os dois: enviar uma imagem. Vazio = automatico.
 */
const VideoThumbnailField: React.FC<VideoThumbnailFieldProps> = ({ block, onChange }) => {
  const thumbnailFilePreview = useObjectUrl(block.thumbnailFile);
  const videoFilePreview = useObjectUrl(block.type === 'uploaded_video' ? block.file : null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [frameError, setFrameError] = useState('');

  const youTubeId = block.type === 'youtube' ? getYouTubeVideoId(block.sourceUrl) : '';
  const youTubeOptions = youTubeId
    ? [
      { url: `https://i.ytimg.com/vi/${youTubeId}/hq1.jpg`, label: t('Início') },
      { url: `https://i.ytimg.com/vi/${youTubeId}/hq2.jpg`, label: t('Meio') },
      { url: `https://i.ytimg.com/vi/${youTubeId}/hq3.jpg`, label: t('Fim') },
    ]
    : [];
  const autoUrl = youTubeId ? `https://i.ytimg.com/vi/${youTubeId}/hqdefault.jpg` : '';
  const videoSource = videoFilePreview || (block.type === 'uploaded_video' ? block.sourceUrl : '');
  const current = thumbnailFilePreview || block.thumbnailUrl || autoUrl;
  const isCustom = Boolean(block.thumbnailFile || block.thumbnailUrl);

  async function captureCurrentFrame() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setFrameError('');
    try {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1280 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
      if (!blob) throw new Error('blob');
      const file = new File([blob], `thumb-${Math.round(time)}s.jpg`, { type: 'image/jpeg' });
      onChange({ thumbnailFile: file, thumbnailUrl: '' });
    } catch {
      setFrameError(t('Não foi possível pegar este frame. Envie uma imagem no lugar.'));
    }
  }

  if (block.type !== 'youtube' && block.type !== 'uploaded_video') return null;

  return (
    <div className="rd-thumb-field">
      <span className="app-field__label">{t('Thumbnail do vídeo')}</span>
      <div className="rd-thumb-field__row">
        <span className="rd-thumb-field__preview">
          {current ? <img src={current} alt="" /> : <span>{t('Automática')}</span>}
        </span>
        <div className="rd-thumb-field__side">
          {youTubeOptions.length ? (
            <div className="rd-thumb-field__options" role="radiogroup" aria-label={t('Frames do YouTube')}>
              <button
                type="button"
                role="radio"
                aria-checked={!isCustom}
                className={`rd-thumb-field__option${!isCustom ? ' is-on' : ''}`}
                onClick={() => onChange({ thumbnailUrl: '', thumbnailFile: null })}
              >
                <img src={autoUrl} alt="" />
                <small>{t('Padrão')}</small>
              </button>
              {youTubeOptions.map((option) => (
                <button
                  type="button"
                  key={option.url}
                  role="radio"
                  aria-checked={block.thumbnailUrl === option.url}
                  className={`rd-thumb-field__option${block.thumbnailUrl === option.url ? ' is-on' : ''}`}
                  onClick={() => onChange({ thumbnailUrl: option.url, thumbnailFile: null })}
                >
                  <img src={option.url} alt="" />
                  <small>{option.label}</small>
                </button>
              ))}
            </div>
          ) : null}

          {block.type === 'uploaded_video' && videoSource ? (
            <div className="rd-thumb-field__frame">
              <video
                ref={videoRef}
                src={videoSource}
                crossOrigin="anonymous"
                preload="metadata"
                muted
                playsInline
                onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
              />
              <input
                type="range"
                min={0}
                max={Math.max(0, duration)}
                step={0.1}
                value={time}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setTime(next);
                  if (videoRef.current) videoRef.current.currentTime = next;
                }}
                aria-label={t('Momento do vídeo')}
                disabled={!duration}
              />
              <button type="button" className="lv-btn lv-btn--neutral lv-btn--sm" onClick={() => void captureCurrentFrame()} disabled={!duration}>
                <Camera size={15} />
                {t('Usar este frame')}
              </button>
            </div>
          ) : null}
          {block.type === 'uploaded_video' && !videoSource ? (
            <p className="rd-thumb-field__hint">{t('Escolha o arquivo do vídeo para pegar um frame dele.')}</p>
          ) : null}

          <div className="rd-thumb-field__buttons">
            <label className="lv-btn lv-btn--neutral lv-btn--sm rd-cover-field__upload">
              <ImagePlus size={15} />
              {t('Enviar imagem')}
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (file) onChange({ thumbnailFile: file, thumbnailUrl: '' });
                  event.target.value = '';
                }}
              />
            </label>
            {isCustom ? (
              <button type="button" className="lv-btn lv-btn--neutral lv-btn--sm" onClick={() => onChange({ thumbnailUrl: '', thumbnailFile: null })}>
                <RotateCcw size={15} />
                {t('Automática')}
              </button>
            ) : null}
          </div>
          {frameError ? <p className="app-field__error">{frameError}</p> : null}
        </div>
      </div>
    </div>
  );
};

export default VideoThumbnailField;
