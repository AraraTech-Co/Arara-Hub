// Comentário com HTML (colado de e-mail, editor rico) mostrava as tags cruas
// ("<p>…</p>"): o formato é texto, as tags saem. As quebras de linha ficam —
// fim de bloco (</p>, <br>…) também é quebra — e só espaço e tab se colapsam.
export function textoDoComentario(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
