/**
 * PUT /hour-entries/:id — fora de uso. A edição de lançamento é pelo PATCH,
 * que confere dono, status e mês fechado.
 */
async function handler(ctx) {
  return ctx.reply.status(405).send({ error: 'metodo_nao_permitido', use: 'PATCH /hour-entries/:id' });
}
module.exports = { handler };
