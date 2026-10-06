// Caminho de um arquivo de `public/` respeitando o `base` do Vite.
// No app normal o base e '/', entao o resultado e o mesmo caminho absoluto de sempre.
// No build de demonstracao (base './') o endereco e montado a partir do proprio modulo JS
// (que fica em assets/): o host do link de demonstracao nao serve a pagina na mesma pasta dos
// arquivos, entao um caminho relativo ao documento apontaria para o lugar errado.
export function publicAsset(path: string): string {
  const relativePath = path.replace(/^\/+/, '');
  if (import.meta.env.BASE_URL === './') {
    // A URL do modulo fica numa variavel de proposito: `new URL(<template>, import.meta.url)`
    // escrito direto e reescrito pelo Vite como import de asset e quebra.
    const moduleUrl = import.meta.url;
    return new URL('../' + relativePath, moduleUrl).href;
  }
  return `${import.meta.env.BASE_URL}${relativePath}`;
}
