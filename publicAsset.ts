// Caminho de um arquivo de `public/` respeitando o `base` do Vite.
// No app normal o base e '/', entao o resultado e o mesmo caminho absoluto de sempre;
// no build de demonstracao (base './') vira relativo, para funcionar em qualquer pasta.
export function publicAsset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
}
