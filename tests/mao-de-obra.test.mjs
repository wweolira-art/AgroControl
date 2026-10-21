import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function fixture({ failInsert = false, price = true, turma = true } = {}) {
  const calls = []; let commits = 0; let rollbacks = 0;
  const connection = {
    async execute(sql, binds, options) {
      calls.push({ sql, binds, options });
      if (sql.includes('NEXTVAL')) return { rows: [{ ID_APONT: 123 }] };
      if (sql.includes('AS cod_atividade')) return { rows: price ? [{ COD_ATIVIDADE: 10, COD_TABELAPRECO: 15, VALOR_UNITARIO: 55.26231 }] : [] };
      if (sql.includes('FROM agricola.fazenda')) return { rows: [{ COD_GRUPOEMPRESA: 1, COD_EMPRESA: 2, COD_FILIAL: 3, ZONA: 4, COD_AGENCIADOR: 5 }] };
      if (sql.includes('FROM rh.agenciador')) return { rows: turma ? [{ COD_AGENCIADOR: 12 }] : [] };
      if (sql.includes('FROM rh.tabelapreco')) return { rows: price ? [{ COD_TABELAPRECO: 10, VALOR_UNITARIO: 2.5 }] : [] };
      if (failInsert) throw new Error('falha simulada no INSERT');
      return {};
    },
    async commit() { commits++; }, async rollback() { rollbacks++; },
  };
  const source = fs.readFileSync(new URL('../server/mao-de-obra.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } });
  const exports = {};
  new Function('require', 'exports', outputText)(name => {
    assert.equal(name, './oracle.ts');
    return { withOracleGravacao: fn => fn(connection, { OUT_FORMAT_OBJECT: 1 }), consultarSql: async () => [] };
  }, exports);
  return { ...exports, calls, counters: () => ({ commits, rollbacks }) };
}
const entrada = { codAgenciador: 12, codGrupoempresaTurma: 1, codFuncionario: 7, codFazenda: 8, codTalhao: 9, codOperacao: 10, dataApontamento: '2026-10-20', quantidade: 1, observacao: "teste ' vinculado" };

test('mão de obra grava na integração com binds e confirma apenas após o INSERT', async () => {
  const f = fixture(); await f.gravarMaoDeObra(entrada);
  const insert = f.calls.find(call => call.sql.includes('INSERT INTO csintegracao.APONTAMENTO_app'));
  assert.ok(insert);
  assert.equal(insert.binds.observacao, entrada.observacao);
  assert.equal(insert.binds.quantidade, 1);
  assert.equal(insert.binds.idApont, 123);
  assert.equal(insert.binds.codTabelaPreco, 15);
  assert.equal(insert.binds.valorUnitario, 55.26231);
  assert.equal(insert.binds.codAgenciador, 12);
  assert.equal(insert.options.autoCommit, false);
  assert.deepEqual(f.counters(), { commits: 1, rollbacks: 0 });
});

test('mão de obra rejeita entrada inválida sem acessar Oracle', async () => {
  const f = fixture();
  for (const patch of [{ codAgenciador: 0 }, { codAgenciador: undefined }, { codGrupoempresaTurma: 0 }, { quantidade: 0 }, { codFuncionario: 0 }, { dataApontamento: '2026-02-30' }, { dataApontamento: '' }]) {
    await assert.rejects(f.gravarMaoDeObra({ ...entrada, ...patch }));
  }
  assert.equal(f.calls.length, 0);
});

test('mão de obra desfaz transação se o INSERT falhar ou não houver preço vigente', async () => {
  for (const options of [{ failInsert: true }, { price: false }, { turma: false }]) {
    const f = fixture(options);
    await assert.rejects(f.gravarMaoDeObra(entrada));
    assert.deepEqual(f.counters(), { commits: 0, rollbacks: 1 });
  }
});

test('turma de outro grupo não gera INSERT', async () => {
  const f = fixture();
  await assert.rejects(f.gravarMaoDeObra({ ...entrada, codGrupoempresaTurma: 2 }), /grupo da fazenda/);
  assert.equal(f.calls.some(call => call.sql.includes('INSERT INTO')), false);
  assert.deepEqual(f.counters(), { commits: 0, rollbacks: 1 });
});

test('quantidade fixa rejeita alteração antes de acessar o Oracle', async () => {
  const f = fixture();
  for (const quantidade of [0, 2, 1.5, -1, NaN, undefined]) {
    await assert.rejects(f.gravarMaoDeObra({ ...entrada, quantidade }), /fixa em 1/);
  }
  assert.equal(f.calls.length, 0);
});
