import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, RotateCcw } from 'lucide-react';
import { t, tKey } from '../i18n';
import { captureFrame, FACE_ENROLLMENT_SAMPLES, readFace, type FaceReading } from '../services/faceEngine';

interface FaceVideoCaptureProps {
  // Recebe os quadros capturados (JPEG base64) quando a sequencia termina.
  onComplete: (frames: string[]) => void;
  // A camera nao abriu (sem permissao, sem camera, navegador sem suporte).
  onUnavailable: () => void;
}

// Cada passo pede uma posicao do rosto; o quadro e capturado sozinho quando a posicao fica estavel.
// Variar distancia e angulo deixa o reconhecimento firme na foto da turma, onde ninguem posa.
interface GuideStep {
  text: string;
  accepts: (reading: FaceReading, firstSide: number) => boolean;
}

const YAW_FRONT = 0.2;
const YAW_SIDE = 0.32;
const isCentered = (r: FaceReading) => Math.abs(r.centerX - 0.5) < 0.16 && Math.abs(r.centerY - 0.45) < 0.2;

const STEPS: GuideStep[] = [
  { text: tKey('Centralize o rosto no oval'), accepts: (r) => isCentered(r) && r.size >= 0.25 && Math.abs(r.yaw) < YAW_FRONT },
  { text: tKey('Aproxime um pouco o rosto'), accepts: (r) => isCentered(r) && r.size >= 0.38 && Math.abs(r.yaw) < YAW_FRONT },
  { text: tKey('Vire devagar o rosto para um lado'), accepts: (r) => Math.abs(r.yaw) >= YAW_SIDE },
  { text: tKey('Agora vire para o outro lado'), accepts: (r, firstSide) => Math.abs(r.yaw) >= YAW_SIDE && Math.sign(r.yaw) !== firstSide },
  { text: tKey('Olhe de novo para a câmera'), accepts: (r) => isCentered(r) && Math.abs(r.yaw) < YAW_FRONT * 0.75 },
];

// Leituras seguidas na posicao certa antes de capturar (evita quadro tremido no meio do movimento).
const STABLE_READINGS = 3;
const READ_INTERVAL_MS = 110;
// Travou num passo? Depois disso aparece "Capturar assim mesmo".
const STUCK_AFTER_MS = 12000;

function hintFor(reading: FaceReading | null): string {
  if (!reading || reading.faces === 0) return tKey('Não encontramos seu rosto. Olhe para a câmera, em um lugar iluminado.');
  if (reading.faces > 1) return tKey('Só você deve aparecer na câmera.');
  if (reading.quality < 0.5) return tKey('Melhore a luz no seu rosto.');
  if (reading.size < 0.2) return tKey('Aproxime o celular do rosto.');
  if (reading.size > 0.8) return tKey('Afaste um pouco o celular.');
  return '';
}

const FaceVideoCapture: React.FC<FaceVideoCaptureProps> = ({ onComplete, onUnavailable }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<string[]>([]);
  const firstSideRef = useRef(0);
  const stableRef = useRef(0);
  const stepStartedRef = useRef(Date.now());
  const [stepIndex, setStepIndex] = useState(0);
  const [hint, setHint] = useState('');
  const [ready, setReady] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [flash, setFlash] = useState(false);
  const stepRef = useRef(0);

  const takeFrame = useCallback((reading: FaceReading | null) => {
    const video = videoRef.current;
    if (!video) return;
    framesRef.current.push(captureFrame(video));
    if (stepRef.current === 2 && reading) {
      firstSideRef.current = Math.sign(reading.yaw) || 1;
    }
    setFlash(true);
    window.setTimeout(() => setFlash(false), 180);
    stableRef.current = 0;
    stepStartedRef.current = Date.now();
    setStuck(false);
    const next = stepRef.current + 1;
    stepRef.current = next;
    setStepIndex(next);
    if (next >= FACE_ENROLLMENT_SAMPLES) {
      onComplete(framesRef.current.slice());
    }
  }, [onComplete]);

  const lastReadingRef = useRef<FaceReading | null>(null);

  useEffect(() => {
    let active = true;
    let timer = 0;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sem suporte');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 960 } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setReady(true);
        stepStartedRef.current = Date.now();
        loop();
      } catch (error) {
        console.error('[face:camera]', error);
        if (active) onUnavailable();
      }
    }

    async function loop() {
      if (!active || stepRef.current >= FACE_ENROLLMENT_SAMPLES) return;
      const video = videoRef.current;
      let reading: FaceReading | null = null;
      try {
        reading = video ? await readFace(video) : null;
      } catch (error) {
        console.error('[face:guide]', error);
        if (active) onUnavailable();
        return;
      }
      if (!active) return;
      lastReadingRef.current = reading;
      const step = STEPS[stepRef.current];
      const basicHint = hintFor(reading);
      const ok = !basicHint && reading !== null && step.accepts(reading, firstSideRef.current);
      stableRef.current = ok ? stableRef.current + 1 : 0;
      setHint(basicHint);
      if (Date.now() - stepStartedRef.current > STUCK_AFTER_MS) setStuck(true);
      if (stableRef.current >= STABLE_READINGS) {
        takeFrame(reading);
      }
      timer = window.setTimeout(loop, READ_INTERVAL_MS);
    }

    void start();
    return () => {
      active = false;
      window.clearTimeout(timer);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [onUnavailable, takeFrame]);

  const restart = () => {
    framesRef.current = [];
    firstSideRef.current = 0;
    stableRef.current = 0;
    stepRef.current = 0;
    stepStartedRef.current = Date.now();
    setStuck(false);
    setStepIndex(0);
  };

  const done = stepIndex >= FACE_ENROLLMENT_SAMPLES;
  const instruction = done ? t('Pronto!') : t(STEPS[stepIndex].text);

  return (
    <div className="face-video">
      <div className={`face-video__stage ${flash ? 'is-flash' : ''}`}>
        <video ref={videoRef} className="face-video__video" playsInline muted autoPlay />
        <svg className="face-video__mask" viewBox="0 0 300 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <mask id="face-video-hole">
              <rect width="300" height="400" fill="#fff" />
              <ellipse cx="150" cy="180" rx="100" ry="135" fill="#000" />
            </mask>
          </defs>
          <rect width="300" height="400" fill="rgba(0,0,0,0.55)" mask="url(#face-video-hole)" />
          <ellipse cx="150" cy="180" rx="100" ry="135" fill="none" stroke={hint ? '#e8af48' : '#29a675'} strokeWidth="4" />
        </svg>
        {!ready ? <div className="face-video__loading">{t('Abrindo a câmera...')}</div> : null}
      </div>

      <div className="face-video__progress" aria-hidden="true">
        {STEPS.map((step, index) => (
          <span key={step.text} className={index < stepIndex ? 'is-done' : index === stepIndex ? 'is-current' : ''} />
        ))}
      </div>
      <p className="face-video__instruction" aria-live="polite">{instruction}</p>
      <p className="face-video__hint">{hint ? t(hint) : ' '}</p>

      <div className="face-modal__actions">
        <button type="button" className="app-button app-button--ghost" onClick={restart} disabled={!ready || stepIndex === 0}>
          <RotateCcw size={16} />
          {t('Recomeçar')}
        </button>
        {stuck && !done ? (
          <button type="button" className="app-button app-button--gold" onClick={() => takeFrame(lastReadingRef.current)}>
            <Camera size={16} />
            {t('Capturar assim mesmo')}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default FaceVideoCapture;
