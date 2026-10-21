import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

function fixture({ historico = [], vinculos = [], indisponivel = false, concorrente = false, motivos = [{ cod_motivo: 5, descricao: 'Déficit hídrico' }] } = {}) {
  const posts = []; const gets = [];
  const api = {
    isAxiosError: erro => Boolean(erro?.response),
    async get(href) {
      gets.push(href);
      const url = new URL(href);
      if (indisponivel && url.pathname.includes('analisebiometrica_motivos')) throw { response: { status: 404 } };
      let items = url.pathname.includes('analisebiometrica_motivos') ? vinculos
        : url.pathname.includes('motivostch_') ? motivos
        : url.pathname.includes('lancamento_') ? historico
        : url.pathname.includes('itens_') ? [{ cod_item: 1, descricao: 'Cana por metro' }]
        : [{ cod_ponto: 1, descricao: 'Ponto 1' }];
      if (url.searchParams.has('q')) {
        const q = JSON.parse(url.searchParams.get('q'));
        items = items.filter(row => Object.entries(q).every(([key, value]) => row[key] === value));
      }
      return { data: { items, links: [] } };
    },
    async post(url, body) { posts.push(body); (url.includes('analisebiometrica_motivos') ? vinculos : historico).push(body); if (concorrente && url.includes('analisebiometrica_motivos')) throw { response: { status: 409 } }; return { data: body }; },
  };
  const source = fs.readFileSync(new URL('../src/services/analise-biometrica.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } });
  const exports = {};
  new Function('require', 'exports', outputText)(name => {
    assert.equal(name, 'axios'); return { __esModule: true, default: api };
  }, exports);
  return { ...exports, posts, gets };
}
const entrada = { data: '20/10/2026', codFazenda: 72000, codTalhao: 12, codPonto: 1, codItem: 1, variedade: 'Teste simulado', valor: 10, codigosMotivoTch: [5] };
const row = (patch = {}) => ({ data: entrada.data, cod_fazenda: entrada.codFazenda, cod_talhao: entrada.codTalhao, ...patch });

test('biometria carrega motivos exclusivamente da tabela separada', async () => {
  const f = fixture({ historico: [row()], vinculos: [{ ...row(), cod_motivo: 5 }] });
  const cadastros = await f.consultarCadastrosAnaliseBiometrica();
  assert.deepEqual(cadastros.motivosTch, [{ codMotivo: 5, descricao: 'Déficit hídrico' }]);
  assert.deepEqual((await f.consultarLancamentosAnaliseBiometrica())[0].codigosMotivoTch, [5]);
});

test('vários motivos únicos não duplicam valores e são reutilizados entre pontos', async () => {
  const f = fixture({ motivos: [{ cod_motivo: 5, descricao: 'Seca' }, { cod_motivo: 6, descricao: 'Brotação' }] });
  const multi = { ...entrada, codigosMotivoTch: [5, 6, 5] };
  await f.enviarLancamentosAnaliseBiometrica([multi, { ...multi, codItem: 2 }]);
  await f.enviarLancamentosAnaliseBiometrica([{ ...multi, codPonto: 2 }]);
  const motivos = f.posts.filter(body => 'cod_motivo' in body);
  const medicoes = f.posts.filter(body => 'valor' in body);
  assert.deepEqual(motivos.map(body => body.cod_motivo), [5, 6]);
  assert.equal(medicoes.length, 3);
  assert.ok(medicoes.every(body => !('cod_motivotch' in body)));
  const salvos = await f.consultarLancamentosAnaliseBiometrica();
  assert.deepEqual(f.codigosMotivoTchTalhao(salvos, entrada), [5, 6]);
});

test('motivo não passa para outra fazenda, talhão ou data', async () => {
  const f = fixture({ historico: [row()], vinculos: [{ ...row(), cod_motivo: 5 }] });
  for (const patch of [{ codFazenda: 73000 }, { codTalhao: 13 }, { data: '21/10/2026' }]) {
    await f.enviarLancamentosAnaliseBiometrica([{ ...entrada, ...patch, codigosMotivoTch: [] }]);
  }
  assert.ok(f.posts.every(body => !('cod_motivotch' in body)));
});

test('código inexistente ou inválido impede qualquer gravação', async () => {
  const empty = fixture({ motivos: [] });
  await assert.rejects(empty.enviarLancamentosAnaliseBiometrica([entrada]), /não existe mais/);
  assert.equal(empty.posts.length, 0);
  await assert.rejects(empty.enviarLancamentosAnaliseBiometrica([{ ...entrada, codigosMotivoTch: [5, -1] }]), /código válido/);
  assert.equal(empty.posts.length, 0);
});

test('cadastro vazio permite análise sem motivo quando não se aplica', async () => {
  const f = fixture({ motivos: [] });
  assert.deepEqual((await f.consultarCadastrosAnaliseBiometrica()).motivosTch, []);
  await f.enviarLancamentosAnaliseBiometrica([{ ...entrada, codigosMotivoTch: [] }]);
  assert.ok(!('cod_motivotch' in f.posts[0]));
});


test('tabela não ativada mantém histórico legável e bloqueia motivos antes das medições', async () => {
  const f = fixture({ indisponivel: true, historico: [row()] });
  assert.deepEqual((await f.consultarLancamentosAnaliseBiometrica())[0].codigosMotivoTch, []);
  await assert.rejects(f.enviarLancamentosAnaliseBiometrica([entrada]), /Ative a tabela/);
  assert.equal(f.posts.length, 0);
});

test('inclusão concorrente do mesmo código é confirmada por releitura', async () => {
  const f = fixture({ concorrente: true });
  await f.enviarLancamentosAnaliseBiometrica([entrada]);
  assert.equal(f.posts.filter(body => 'cod_motivo' in body).length, 1);
  assert.equal(f.posts.filter(body => 'valor' in body).length, 1);
});
