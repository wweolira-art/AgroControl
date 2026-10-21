import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function fixture({ falhar = false } = {}) {
  let local = { fazendas: [{ codFazenda: 1 }], turmas: [{ codAgenciador: 8, codGrupoempresa: 1 }] };
  let consultas = 0;
  let gravacoes = 0;
  const source = fs.readFileSync(new URL('../src/services/apontamento.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } });
  const exports = {};
  new Function('require', 'exports', outputText)(name => {
    if (name === 'axios') return { __esModule: true, default: { async get() { return { data: { fazendas: [{ codFazenda: 1 }], materiais: [] } }; } } };
    if (name === './mao-de-obra') return { async listarTurmasMaoDeObra() { consultas++; if (falhar) throw new Error('Sem rede'); return [{ codAgenciador: 9, codGrupoempresa: 1 }]; } };
    if (name === '../types/apontamento') return { TIPOS_OPERACAO_ERP: [] };
    if (name === './apontamento-local') return { async carregarCadastrosLocal() { return local; }, async salvarCadastrosLocal(dados) { local = dados; gravacoes++; } };
    if (name === './api-url') return { cabecalhosApiPublica: async () => ({}), mensagemErroApi: error => error };
    if (name === './oracle-credenciais-local') return {};
    if (name === './oracle-conexao') return { obterUrlApiCustos: async () => 'https://api.example.com' };
    throw new Error(name);
  }, exports);
  return { ...exports, info: () => ({ local, consultas, gravacoes }) };
}

test('importação armazena turmas e leituras locais não fazem novas consultas', async () => {
  const f = fixture();
  await f.importarCadastrosOracle({ incluirTurmas: true });
  assert.deepEqual((await f.obterCadastrosApontamento()).turmas, [{ codAgenciador: 9, codGrupoempresa: 1 }]);
  await f.obterCadastrosApontamento();
  assert.equal(f.info().consultas, 1);
  assert.equal(f.info().gravacoes, 1);
});

test('falha ao importar turmas preserva os cadastros anteriores; outros usuários não consultam turmas', async () => {
  const falha = fixture({ falhar: true });
  await assert.rejects(falha.importarCadastrosOracle({ incluirTurmas: true }), /Sem rede/);
  assert.equal(falha.info().gravacoes, 0);
  assert.equal(falha.info().local.turmas[0].codAgenciador, 8);
  const outro = fixture();
  await outro.importarCadastrosOracle();
  assert.equal(outro.info().consultas, 0);
  assert.equal(outro.info().local.turmas[0].codAgenciador, 8);
});
