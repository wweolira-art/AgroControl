import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createEmailAccessStore, createEmailAccessGuard } from '../server/email-access.ts';
import { createAuthGuard, AuthError } from '../server/auth.ts';

const base = 'https://ords.example.test/ords/admin/app_acesso_aba/';
function fixture({ failPost = false, pageSize = 500 } = {}) {
  let counter = 0;
  const rows = new Map(); const calls = [];
  const fetcher = async (href, options) => {
    const url = new URL(href); calls.push({ href, ...options });
    if (options.method === 'POST') {
      if (failPost) return new Response('', { status: 500 });
      const body = JSON.parse(options.body);
      const id = String(++counter); rows.set(id, { ...body, links: [{ rel: 'self', href: base + id }] });
      return Response.json(body, { status: 201 });
    }
    if (options.method === 'DELETE') {
      assert.equal(options.headers['Content-Type'], undefined, 'ORDS rejeita Content-Type JSON com corpo vazio no DELETE');
      rows.delete(url.pathname.split('/').at(-1)); return new Response(null, { status: 204 });
    }
    const email = url.searchParams.has('q') ? JSON.parse(url.searchParams.get('q')).email.$eq : undefined;
    const all = [...rows.values()].filter(row => !email || row.email === email);
    const offset = Number(url.searchParams.get('offset'));
    const items = all.slice(offset, offset + pageSize);
    return Response.json({ items, hasMore: offset + items.length < all.length });
  };
  const store = createEmailAccessStore({ url: base, fetch: fetcher });
  const guard = createAuthGuard({ authenticate: async header => {
    if (!header) throw new AuthError(401, 'Sessão expirada.');
    return { email: header === 'admin' ? 'admin@example.com' : 'operador@example.com', perfil: header === 'admin' ? 'admin' : 'operador' };
  } }, createEmailAccessGuard(store));
  return { store, guard, rows, calls, fetcher };
}
async function route(guard, pathname, { user = 'operador', method = 'GET', body } = {}) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  req.method = method; req.headers = { authorization: user };
  let status; let data;
  const res = { writeHead(code) { status = code; }, end(text) { data = JSON.parse(text); } };
  return { handled: await guard(req, res, pathname), status, data };
}

test('permissões são salvas em linhas email/aba e compartilhadas entre instâncias', async () => {
  const f = fixture();
  assert.deepEqual((await f.store.current('novo@example.com')).abas, ['cadastros', 'salvos']);
  await f.store.update(' OPERADOR@EXAMPLE.COM ', { abas: ['mapa', 'mao-de-obra', 'mapa'] });
  assert.equal(f.rows.size, 4);
  const another = createEmailAccessStore({ url: base, fetch: f.fetcher });
  assert.deepEqual((await another.current('operador@example.com')).abas, ['cadastros', 'salvos', 'mapa', 'mao-de-obra']);
  assert.deepEqual((await another.current('outro@example.com')).abas, ['cadastros', 'salvos']);
});

test('revogar preserva outros e-mails e usa apenas links individuais da mesma coleção', async () => {
  const f = fixture();
  await f.store.update('operador@example.com', { abas: ['mapa', 'mao-de-obra'] });
  await f.store.update('outro@example.com', { abas: ['mapa'] });
  await f.store.update('operador@example.com', { abas: ['mao-de-obra'] });
  assert.deepEqual((await f.store.current('outro@example.com')).abas, ['cadastros', 'salvos', 'mapa']);
  assert.deepEqual((await f.store.current('operador@example.com')).abas, ['cadastros', 'salvos', 'mao-de-obra']);
  const row = [...f.rows.values()].find(item => item.email === 'operador@example.com' && item.aba === 'mao-de-obra');
  row.links[0].href = 'https://malicioso.example/roubo';
  await assert.rejects(f.store.update('operador@example.com', { abas: [] }), { status: 502 });
  assert.equal(f.calls.some(call => call.href.includes('malicioso')), false);
});

test('somente admin pode listar/alterar; permissões usam o e-mail autenticado', async () => {
  const f = fixture();
  assert.equal((await route(f.guard, '/api/acessos/abas')).status, 403);
  assert.equal((await route(f.guard, '/api/acessos/abas/operador%40example.com', { method: 'PUT', body: { abas: ['mapa'], perfil: 'admin' } })).status, 403);
  assert.equal((await route(f.guard, '/api/acessos/abas/operador%40example.com', { user: 'admin', method: 'PUT', body: { abas: ['mao-de-obra'] } })).status, 200);
  assert.deepEqual((await route(f.guard, '/api/acesso/abas')).data, { email: 'operador@example.com', abas: ['cadastros', 'salvos', 'mao-de-obra'] });
  assert.equal((await route(f.guard, '/api/apontamento/mao-de-obra/servicos')).handled, false);
  assert.equal((await route(f.guard, '/api/talhao/custos')).status, 403);
  assert.equal((await route(f.guard, '/api/acesso/abas', { user: '' })).status, 401);
  assert.equal((await route(f.guard, '/api/acessos/abas', { user: 'admin' })).status, 200);
});

test('pagina os dados e rejeita módulos/e-mails inválidos antes de gravar', async () => {
  const f = fixture({ pageSize: 1 });
  await f.store.update('operador@example.com', { abas: ['mapa', 'cadastros', 'perdas'] });
  assert.equal((await f.store.current('operador@example.com')).abas.length, 4);
  assert.equal((await f.store.list()).length, 1);
  const count = f.calls.length;
  await assert.rejects(f.store.update('inválido', { abas: [] }), { status: 400 });
  await assert.rejects(f.store.update('operador@example.com', { abas: ['inventada'] }), { status: 400 });
  assert.equal(f.calls.length, count);
});

test('erro da ORDS não libera acesso nem anuncia salvamento concluído', async () => {
  const f = fixture({ failPost: true });
  await assert.rejects(f.store.update('operador@example.com', { abas: ['mapa'] }), { status: 502 });
  assert.deepEqual((await f.store.current('operador@example.com')).abas, ['cadastros', 'salvos']);
  const broken = createEmailAccessStore({ url: base, fetch: async () => new Response('', { status: 503 }) });
  await assert.rejects(broken.current('operador@example.com'), { status: 502 });
});

test('Cadastros e Salvos são obrigatórios mesmo sem liberação e suas operações não dependem da tabela de permissões', async () => {
  const f = fixture();
  await f.store.update('operador@example.com', { abas: [] });
  assert.deepEqual((await f.store.current('operador@example.com')).abas, ['cadastros', 'salvos']);
  assert.equal([...f.rows.values()].some(row => row.aba === 'cadastros'), true);
  assert.equal([...f.rows.values()].some(row => row.aba === 'salvos'), true);
  const broken = createEmailAccessStore({ url: base, fetch: async () => { throw new Error('offline'); } });
  const guard = createEmailAccessGuard(broken);
  assert.equal(await guard({ method: 'GET', headers: {} }, {}, '/api/apontamento/cadastros', { email: 'operador@example.com', perfil: 'operador' }), false);
  assert.equal(await guard({ method: 'POST', headers: {} }, {}, '/api/apontamento', { email: 'operador@example.com', perfil: 'operador' }), false);
  assert.equal(await guard({ method: 'POST', headers: {} }, {}, '/api/perdas', { email: 'operador@example.com', perfil: 'operador' }), false);
  assert.equal((await route(f.guard, '/api/apontamento/cadastros', { user: '' })).status, 401);
});
