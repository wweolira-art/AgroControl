import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function fixture(falhar) {
  const posts = [];
  const exports = {};
  const source = fs.readFileSync(new URL('../src/services/mao-de-obra.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } });
  new Function('require', 'exports', outputText)(name => {
    if (name === 'axios') return { __esModule: true, default: { async post(url, body) { posts.push(body); if (body.codFuncionario === falhar) throw new Error('Sem resposta'); return { data: { mensagem: 'OK' } }; } } };
    if (name === './api-url') return { cabecalhosApiPublica: async () => ({}), mensagemErroApi: error => error };
    if (name === './oracle-conexao') return { obterUrlApiCustos: async () => 'https://api.example.com' };
    throw new Error(name);
  }, exports);
  return { ...exports, posts };
}
const dados = { codAgenciador: 1, codGrupoempresaTurma: 1, codFazenda: 72000, codTalhao: 12, codOperacao: 1, quantidade: 1, dataApontamento: '2026-10-21', observacao: 'Teste simulado' };
test('envia um lançamento por funcionário distinto com quantidade fixa', async () => {
  const f = fixture(); const confirmados = [];
  assert.equal(await f.gravarMaoDeObraParaFuncionarios(dados, [10, 20, 10], codigo => confirmados.push(codigo)), 2);
  assert.deepEqual(confirmados, [10, 20]);
  assert.deepEqual(f.posts, [{ ...dados, codFuncionario: 10 }, { ...dados, codFuncionario: 20 }]);
});
test('falha parcial interrompe o lote e só confirma os funcionários com resposta de sucesso', async () => {
  const f = fixture(20); const confirmados = [];
  await assert.rejects(f.gravarMaoDeObraParaFuncionarios(dados, [10, 20, 30], codigo => confirmados.push(codigo)), /1 lançamento.*funcionário 20/);
  assert.deepEqual(confirmados, [10]);
  assert.deepEqual(f.posts.map(item => item.codFuncionario), [10, 20]);
  await assert.rejects(f.gravarMaoDeObraParaFuncionarios(dados, [0], () => {}), /válidos/);
  assert.equal(f.posts.length, 2);
});
