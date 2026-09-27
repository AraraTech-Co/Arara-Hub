import { api } from '../api/client.js';

/**
 * Admins (role `admin`, ex.: Leonardo e André) não aparecem em relatórios do time.
 * Retorna o conjunto de `users.id` (string) que são admin, para exclusão nas telas de relatório.
 */
export async function fetchAdminIds() {
  try {
    const { data } = await api.get('/api/users');
    const list = Array.isArray(data) ? data : [];
    return new Set(list.filter((u) => u.role === 'admin').map((u) => String(u.id)));
  } catch {
    return new Set();
  }
}
