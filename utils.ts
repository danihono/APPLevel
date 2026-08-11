/**
 * Converts a standard YouTube URL to an embed URL.
 * Supports formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 */
export const getYouTubeVideoId = (url: string): string => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      return parsed.pathname.replace(/^\/+/, '').split('/')[0];
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v') ?? '';
      }

      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.replace('/embed/', '').split('/')[0];
      }
    }
  } catch {
    return '';
  }

  return '';
};

export const getYouTubeEmbedUrl = (url: string): string => {
  const videoId = getYouTubeVideoId(url);
  return videoId ? `https://www.youtube.com/embed/${videoId}` : url;
};

export const isHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const getVideoSourceKindFromUrl = (url: string): 'youtube' | 'external' => (
  getYouTubeVideoId(url) ? 'youtube' : 'external'
);

// Nomes de pessoas chegam de origens diferentes (o `displayName` digitado no cadastro e a copia
// desnormalizada gravada na aula) e so sao comparaveis depois de normalizados. Alem de caixa e
// espaco duplicado, o mesmo "Antonio" acentuado pode vir pre-composto (o + U+0303 ja fundidos em
// U+00F4) ou decomposto (o + U+0302) conforme o teclado que digitou — e ai `===` jura que sao duas
// pessoas diferentes, com as duas grafias identicas na tela.
//
// Devolve '' quando nao ha nome, para o chamador tratar "sem nome" como "nao compara" em vez de
// casar dois vazios entre si.
//
// Uma chave normalizada (string -> string) em vez de `localeCompare({ sensitivity: 'base' })`
// porque a mesma regra precisa existir duas vezes: aqui e em
// functions/src/scripts/fixClassProfessorIds.ts, que roda noutro projeto TypeScript. Funcao pura e
// trivial de espelhar, de imprimir no --dryRun e de usar como chave de Map/Set; um comparador nao e.
export const normalizePersonName = (value?: string | null): string => (value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLocaleLowerCase('pt-BR');
