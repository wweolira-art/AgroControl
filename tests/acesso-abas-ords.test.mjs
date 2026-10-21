import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function fixture(paginas) {
  const urls = [];
  const source = fs.readFileSync(new URL('../src/services/acesso-abas-ords.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } });
  const exports = {};
  new Function('require', 'exports', outputText)(name => {
    if (name === 'axios') return { __esModule: true, default: {
      isAxiosError: () => false,
      async get(url, options) { urls.push(url); assert.equal(options.headers, undefined); return { data: paginas.shift() }; },
    } };
    assert.equal(name, '../config/device-tabs');
    return { ABAS_DISPOSITIVO: [{ id: 'mao-de-obra' }, { id: 'mapa' }], ABAS_OBRIGATORIAS: ['cadastros', 'salvos'] };
  }, exports);
  return { ...exports, urls };
}

test('consulta Oracle diretamente com filtro, sem credencial do servidor, e percorre páginas', async () => {
  const f = fixture([
    { items: [{ email: 'operador@example.com', aba: 'mao-de-obra' }, { email: 'outro@example.com', aba: 'mapa' }], links: [{ rel: 'next', href: '?offset=500' }] },
    { items: [{ email: 'operador@example.com', aba: 'mao-de-obra' }, { email: 'operador@example.com', aba: 'inexistente' }], links: [] },
  ]);
  assert.deepEqual(await f.carregarAbasOrds(' OPERADOR@example.com '), { email: 'operador@example.com', abas: ['cadastros', 'salvos', 'mao-de-obra'] });
  assert.deepEqual(JSON.parse(new URL(f.urls[0]).searchParams.get('q')), { email: { $eq: 'operador@example.com' } });
  assert.equal(f.urls.length, 2);
  assert.ok(f.urls.every(url => url.startsWith(f.URL_ACESSO_ABAS)));
});

test('sem liberações retorna apenas abas obrigatórias e não segue paginação externa', async () => {
  const vazio = fixture([{ items: [] }]);
  assert.deepEqual((await vazio.carregarAbasOrds('operador@example.com')).abas, ['cadastros', 'salvos']);
  const externo = fixture([{ items: [], links: [{ rel: 'next', href: 'https://example.com/roubar' }] }]);
  await assert.rejects(externo.carregarAbasOrds('operador@example.com'), /Paginação inválida/);
  assert.equal(externo.urls.length, 1);
  const invalido = fixture([{}]);
  await assert.rejects(invalido.carregarAbasOrds('operador@example.com'), /Resposta inválida/);
});
