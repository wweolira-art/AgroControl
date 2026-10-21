import { randomUUID } from 'node:crypto';
import { createEmailAccessStore, DEFAULT_ACCESS_URL } from '../server/email-access.ts';

const store = createEmailAccessStore({ url: process.env.ORDS_ACESSO_ABA_URL || DEFAULT_ACCESS_URL, token: process.env.ORDS_ACESSO_ABA_TOKEN || '' });
const email = `codex-permission-probe-${randomUUID()}@example.invalid`;
try {
  const saved = await store.update(email, { abas: ['mapa', 'mao-de-obra'] });
  if (!['mapa', 'mao-de-obra', 'cadastros'].every(aba => saved.abas.includes(aba))) throw new Error('Inclusão não confirmada.');
  console.log('Inclusão e leitura de email/aba confirmadas.');
  const revoked = await store.update(email, { abas: ['mao-de-obra'] });
  if (revoked.abas.includes('mapa') || !revoked.abas.includes('mao-de-obra')) throw new Error('Revogação não confirmada.');
  console.log('Revogação individual confirmada.');
} finally {
  // Limpeza direta: o salvamento administrativo sempre mantém Cadastros obrigatório.
  const base = new URL(process.env.ORDS_ACESSO_ABA_URL || DEFAULT_ACCESS_URL);
  const url = new URL(base); url.searchParams.set('q', JSON.stringify({ email: { $eq: email } }));
  const headers = { Accept: 'application/json', ...(process.env.ORDS_ACESSO_ABA_TOKEN ? { Authorization: `Bearer ${process.env.ORDS_ACESSO_ABA_TOKEN}` } : {}) };
  const data = await (await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(20000) })).json();
  for (const row of data.items ?? []) {
    if (row.email !== email) continue;
    const href = row.links?.find(link => link.rel === 'self')?.href;
    const target = new URL(href);
    if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname) || target.pathname === base.pathname) throw new Error('Link de limpeza inválido.');
    const response = await fetch(target, { method: 'DELETE', headers, redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Remova o teste de ${email}.`);
  }
  console.log('Registros técnicos removidos. Nenhum usuário real foi alterado.');
}
