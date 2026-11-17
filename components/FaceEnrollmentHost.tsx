import React, { useEffect, useState } from 'react';
import FaceEnrollmentModal from './FaceEnrollmentModal';

// O cadastro da biometria atualiza o perfil do usuario, e o App remonta as telas a cada
// atualizacao do perfil. Se o modal morasse dentro de uma tela (Home, Perfil), ele sumiria no
// instante em que o cadastro e salvo, antes de mostrar a confirmacao. Por isso ele e montado
// uma unica vez na raiz (index.tsx) e as telas so pedem para abri-lo.
let openHost: (() => void) | null = null;

export function openFaceEnrollment(): void {
  openHost?.();
}

const FaceEnrollmentHost: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    openHost = () => setOpen(true);
    return () => {
      openHost = null;
    };
  }, []);

  return open ? <FaceEnrollmentModal onClose={() => setOpen(false)} /> : null;
};

export default FaceEnrollmentHost;
