/**
 * Baixa tudo que a API EKOS/Jacto devolver e armazena:
 *  1) data/ekos/latest.json (sempre, imediato)
 *  2) Oracle ADB via ORDS ekos_dados (se o SQL já foi rodado)
 *
 * Uso:
 *   JACTO_CONNECT_EMAIL=... JACTO_CONNECT_PASSWORD=... npm run sync:ekos
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'data', 'ekos');

function carregarEnv() {
  for (const arquivo of [path.join(ROOT, '.env'), path.join(ROOT, 'server', '.env')]) {
    if (!fs.existsSync(arquivo)) {
      continue;
    }
    for (const linha of fs.readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
      const texto = linha.trim();
      if (!texto || texto.startsWith('#')) {
        continue;
      }
      const sep = texto.indexOf('=');
      if (sep <= 0) {
        continue;
      }
      const chave = texto.slice(0, sep).trim();
      const valor = texto.slice(sep + 1).trim();
      if (!process.env[chave]) {
        process.env[chave] = valor;
      }
    }
  }
}

carregarEnv();

const CONNECT_AUTH = 'https://prd-api-connect-elb.jacto.com/users/api/v3/auth';
const CONNECT_EKOS = 'https://prd-api-connect-elb.jacto.com/users/api/v3/me/ekos/token';
const EKOS_V1 = 'https://prd-gestaodeoperacoes.jacto.com/api/v1';
const EKOS_V2 = 'https://prd-gestaodeoperacoes.jacto.com/api/v2';
const EKOS_GRAPHQL = 'https://prd-gestaodeoperacoes.jacto.com/api/serviceorders/graphql';
const ORDS_BASE = (
  process.env.EXPO_PUBLIC_ORDS_EKOS_URL ??
  process.env.ORDS_EKOS_URL ??
  'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/ekos_dados'
).replace(/\/$/, '');

const email = process.env.JACTO_CONNECT_EMAIL ?? '';
const senha = process.env.JACTO_CONNECT_PASSWORD ?? '';

if (!email || !senha) {
  console.error('Defina JACTO_CONNECT_EMAIL e JACTO_CONNECT_PASSWORD no .env');
  process.exit(1);
}

async function jsonFetch(url, options = {}) {
  const resp = await fetch(url, options);
  const texto = await resp.text();
  let body;
  try {
    body = texto ? JSON.parse(texto) : null;
  } catch {
    body = texto;
  }
  if (!resp.ok) {
    const resumo =
      typeof body === 'string'
        ? body.slice(0, 240)
        : JSON.stringify(body?.message ?? body?.code ?? body).slice(0, 240);
    throw new Error(`${resp.status} ${resp.statusText} — ${resumo}`);
  }
  return body;
}

async function obterTokenEkos() {
  const auth = await jsonFetch(CONNECT_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  });
  const raw = await jsonFetch(CONNECT_EKOS, {
    headers: { Authorization: `Bearer ${auth.access_token}` },
  });
  return typeof raw === 'string' ? raw.replace(/^"|"$/g, '') : String(raw);
}

async function getLista(headers, url) {
  const resp = await fetch(url, { headers });
  const texto = await resp.text();
  let body;
  try {
    body = texto ? JSON.parse(texto) : null;
  } catch {
    body = texto;
  }
  if (!resp.ok) {
    const resumo =
      typeof body === 'string'
        ? body.slice(0, 240)
        : JSON.stringify(body?.message ?? body?.code ?? body).slice(0, 240);
    throw new Error(`${resp.status} ${resp.statusText} — ${resumo}`);
  }
  if (Array.isArray(body)) {
    return body;
  }
  return body.content ?? [];
}

function idRegistro(item) {
  return (
    item.idBusinessUnit ??
    item.idMachine ??
    item.idAgriculturalOperation ??
    item.idField ??
    item.idServiceOrder ??
    item.idFarm ??
    item.idAgriculturalActivity ??
    item.idOperator ??
    item.idClient ??
    item.id
  );
}

async function listarUnificado(headers, urlBase, opcoes = {}) {
  const separador = urlBase.includes('?') ? '&' : '?';
  const urls = opcoes.apenasAtivos
    ? [`${urlBase}${separador}enable=true`, urlBase]
    : [`${urlBase}${separador}enable=true`, `${urlBase}${separador}enable=false`, urlBase];
  const mapa = new Map();

  for (const url of urls) {
    try {
      for (const item of await getLista(headers, url)) {
        const id = idRegistro(item);
        if (id == null) {
          continue;
        }
        mapa.set(id, { ...mapa.get(id), ...item });
      }
    } catch (erro) {
      if (opcoes.obrigatorio) {
        throw erro;
      }
    }
  }

  return [...mapa.values()];
}

async function getOpcional(headers, url) {
  try {
    return await getLista(headers, url);
  } catch (erro) {
    console.warn(`  (ignorado) ${url} — ${erro.message}`);
    return [];
  }
}

function epochDayParaIso(day) {
  const dt = new Date(Date.UTC(1970, 0, 1));
  dt.setUTCDate(dt.getUTCDate() + Number(day));
  return dt.toISOString().slice(0, 10);
}

function extrairVolume(prescricao) {
  if (!prescricao || typeof prescricao !== 'string') {
    return null;
  }
  try {
    const obj = JSON.parse(prescricao);
    for (const chave of ['serviceOrderTotalVolume', 'totalVolume', 'volumeTotal', 'volume', 'waterVolume']) {
      const n = Number(obj?.[chave]);
      if (Number.isFinite(n)) {
        return n;
      }
    }
  } catch {
    const match = prescricao.match(/"?(?:serviceOrderTotalVolume|volumeTotal|volume)"?\s*:\s*([0-9.]+)/i);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

function extrairArea(prescricao, campos = []) {
  for (const valor of campos) {
    const n = Number(valor);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  if (!prescricao || typeof prescricao !== 'string') {
    return null;
  }
  try {
    const obj = JSON.parse(prescricao);
    for (const chave of ['totalArea', 'serviceOrderTotalArea', 'areaHa', 'area']) {
      const n = Number(obj?.[chave]);
      if (Number.isFinite(n)) {
        return n;
      }
    }
  } catch {
    const match = prescricao.match(/"?(?:totalArea|areaHa|area)"?\s*:\s*([0-9.]+)/i);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

function normalizarOperacao(op) {
  const atividade = op.agriculturalActivity ?? op.activity ?? null;
  return {
    idAgriculturalOperation: op.idAgriculturalOperation ?? op.id,
    idAgriculturalActivity:
      op.idAgriculturalActivity ?? atividade?.idAgriculturalActivity ?? atividade?.id ?? null,
    agriculturalOperationNumber: op.agriculturalOperationNumber ?? op.number ?? op.numero ?? null,
    agriculturalOperationName: op.agriculturalOperationName ?? op.name ?? op.nome ?? '',
    agriculturalOperationType: op.agriculturalOperationType ?? op.type ?? op.tipo ?? '',
    enable: op.enable ?? op.agriculturalOperationEnable ?? true,
  };
}

function normalizarTalhao(talhao, fazendasPorId = {}) {
  const idFarm = talhao.idFarm ?? talhao.farm?.idFarm ?? null;
  const fazenda = fazendasPorId[idFarm] ?? talhao.farm ?? null;
  return {
    idField: talhao.idField ?? talhao.id,
    idFarm,
    fieldName: talhao.fieldName ?? talhao.name ?? talhao.nome ?? '',
    color: talhao.color ?? talhao.fieldColor ?? talhao.cor ?? '',
    fieldArea: talhao.fieldArea ?? talhao.areaHa ?? talhao.area ?? talhao.hectare ?? null,
    farmName: talhao.farmName ?? fazenda?.farmName ?? fazenda?.name ?? '',
    enable: talhao.enable ?? talhao.fieldEnable ?? true,
  };
}

function normalizarFazenda(fazenda) {
  return {
    idFarm: fazenda.idFarm ?? fazenda.id,
    farmName: fazenda.farmName ?? fazenda.name ?? fazenda.nome ?? '',
    enable: fazenda.enable ?? fazenda.farmEnable ?? true,
  };
}

function normalizarOrdemServico(os) {
  const operacao = os.agriculturalOperation ?? {
    idAgriculturalOperation: os.idAgriculturalOperation,
    name: os.agriculturalOperationName ?? os.operationName ?? os.nomeOperacao,
    number: os.agriculturalOperationNumber ?? os.operationNumber,
  };
  const equipe = os.team ?? os.equipe ?? null;
  const fields = os.fieldList ?? os.fields ?? os.talhoes ?? [];

  return {
    idServiceOrder: os.idServiceOrder ?? os.id,
    number: os.number ?? os.serviceOrderNumber ?? os.numero ?? null,
    date: os.date ?? os.serviceOrderDate ?? os.data ?? null,
    enable: os.enable ?? os.serviceOrderEnable ?? true,
    prescription: os.prescription ?? os.serviceOrderPrescription ?? null,
    agriculturalOperation: operacao,
    team: equipe,
    fieldList: Array.isArray(fields)
      ? fields.map((f) =>
          typeof f === 'string'
            ? { name: f }
            : {
                idField: f.idField ?? f.id,
                name: f.fieldName ?? f.name ?? f.nome ?? '',
                idFarm: f.idFarm ?? null,
              },
        )
      : [],
  };
}

async function listarOrdensServicoGraphql(token, idBusinessUnit) {
  const query = `
    query ($idBusinessUnit: BigInteger!) {
      serviceOrderListByBusinessUnit(idBusinessUnit: $idBusinessUnit) {
        edges {
          node {
            idServiceOrder
            number
            date
            enable
            prescription
            agriculturalOperation { idAgriculturalOperation name number }
            fieldList { idField name idFarm }
            team { idTeam name }
          }
        }
      }
    }
  `;
  const data = await jsonFetch(EKOS_GRAPHQL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { idBusinessUnit: Number(idBusinessUnit) } }),
  });
  if (data.errors?.length) {
    const semEquipe = `
      query ($idBusinessUnit: BigInteger!) {
        serviceOrderListByBusinessUnit(idBusinessUnit: $idBusinessUnit) {
          edges {
            node {
              idServiceOrder
              number
              date
              enable
              prescription
              agriculturalOperation { idAgriculturalOperation name number }
              fieldList { idField name idFarm }
            }
          }
        }
      }
    `;
    const retry = await jsonFetch(EKOS_GRAPHQL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: semEquipe, variables: { idBusinessUnit: Number(idBusinessUnit) } }),
    });
    if (retry.errors?.length) {
      throw new Error(retry.errors.map((e) => e.message).join('; '));
    }
    return retry.data?.serviceOrderListByBusinessUnit?.edges?.map((edge) => edge.node) ?? [];
  }
  return data.data?.serviceOrderListByBusinessUnit?.edges?.map((edge) => edge.node) ?? [];
}

async function listarOrdensServico(headers, token, idBusinessUnit) {
  const mapa = new Map();

  for (const os of await listarOrdensServicoGraphql(token, idBusinessUnit)) {
    const norm = normalizarOrdemServico(os);
    if (norm.idServiceOrder != null) {
      mapa.set(norm.idServiceOrder, norm);
    }
  }

  for (const os of await listarUnificado(
    headers,
    `${EKOS_V2}/serviceorders/businessunit/${idBusinessUnit}`,
  )) {
    const norm = normalizarOrdemServico(os);
    if (norm.idServiceOrder != null) {
      mapa.set(norm.idServiceOrder, { ...mapa.get(norm.idServiceOrder), ...norm });
    }
  }

  return [...mapa.values()];
}

function salvarLocal(snapshot) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const latest = path.join(DATA_DIR, 'latest.json');
  const historico = path.join(DATA_DIR, `snapshot-${stamp}.json`);
  const texto = `${JSON.stringify(snapshot, null, 2)}\n`;
  fs.writeFileSync(latest, texto, 'utf8');
  fs.writeFileSync(historico, texto, 'utf8');
  return { latest, historico };
}

async function syncPost(caminho, payload) {
  await jsonFetch(`${ORDS_BASE}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

function payloadOrdemServico(idBu, os) {
  const prescricao = os.prescription ?? null;
  const fieldList = os.fieldList ?? [];
  return {
    id_ordem: os.idServiceOrder,
    id_business_unit: idBu,
    numero_os: os.number ?? null,
    data_os: os.date ? epochDayParaIso(os.date) : null,
    id_operacao: os.agriculturalOperation?.idAgriculturalOperation ?? null,
    nome_operacao: os.agriculturalOperation?.name ?? '',
    id_equipe: os.team?.idTeam ?? null,
    nome_equipe: os.team?.name ?? '',
    prescricao,
    volume_total: extrairVolume(prescricao),
    area_ha: extrairArea(prescricao, [os.totalArea, os.areaHa]),
    talhoes: fieldList.map((f) => f.name).filter(Boolean).join(', '),
    talhao_ids: fieldList.map((f) => f.idField).filter(Boolean).join(', '),
    ativo: os.enable === false ? 0 : 1,
  };
}

async function enviarOracle(snapshot) {
  const contagens = {
    clientes: 0,
    unidades: 0,
    atividades: 0,
    operacoes: 0,
    maquinas: 0,
    fazendas: 0,
    talhoes: 0,
    ordens: 0,
    agua: 0,
    periodos: 0,
    monitoramento: 0,
    erros: 0,
  };
  let avisoOperacional = false;

  for (const cliente of snapshot.clientes) {
    try {
      await syncPost('/sync/cliente/', {
        id_client: cliente.idClient,
        nome: cliente.clientName ?? '',
      });
      contagens.clientes += 1;
    } catch {
      contagens.erros += 1;
      throw new Error('ORDS ekos_dados indisponível. Rode scripts/habilitar-ekos-dados.sql no Database Actions.');
    }
  }

  for (const unidade of snapshot.unidades) {
    const idBu = unidade.idBusinessUnit;
    const bloco = snapshot.porUnidade[String(idBu)] ?? {};

    await syncPost('/sync/unidade/', {
      id_business_unit: idBu,
      id_client: unidade.idClient ?? null,
      nome: unidade.businessUnitName ?? '',
      documento: unidade.businessUnitDocument ?? '',
      localizacao: unidade.businessUnitLocation ?? '',
      ativo: unidade.businessUnitEnable === false ? 0 : 1,
    });
    contagens.unidades += 1;

    for (const item of bloco.atividades ?? []) {
      await syncPost('/sync/atividade/', {
        id_atividade: item.idAgriculturalActivity,
        id_business_unit: idBu,
        numero: item.agriculturalActivityNumber ?? item.number ?? null,
        nome: item.agriculturalActivityName ?? item.name ?? '',
        ativo: item.enable === false ? 0 : 1,
      });
      contagens.atividades += 1;
    }

    for (const op of bloco.operacoes ?? []) {
      try {
        await syncPost('/sync/operacao/', {
          id_operacao: op.idAgriculturalOperation,
          id_business_unit: idBu,
          id_atividade: op.idAgriculturalActivity ?? null,
          numero: op.agriculturalOperationNumber ?? null,
          nome: op.agriculturalOperationName ?? '',
          tipo: op.agriculturalOperationType ?? '',
          ativo: op.enable === false ? 0 : 1,
        });
        contagens.operacoes += 1;
      } catch {
        await syncPost('/sync/operacao/', {
          id_operacao: op.idAgriculturalOperation,
          id_business_unit: idBu,
          id_atividade: op.idAgriculturalActivity ?? null,
          numero: op.agriculturalOperationNumber ?? null,
          nome: op.agriculturalOperationName ?? '',
          ativo: op.enable === false ? 0 : 1,
        });
        contagens.operacoes += 1;
      }
    }

    for (const fazenda of bloco.fazendas ?? []) {
      try {
        await syncPost('/sync/fazenda/', {
          id_farm: fazenda.idFarm,
          id_business_unit: idBu,
          nome: fazenda.farmName ?? '',
          ativo: fazenda.enable === false ? 0 : 1,
        });
        contagens.fazendas += 1;
      } catch {
        if (!avisoOperacional) {
          console.warn('  (operacional) rode scripts/atualizar-ekos-operacional.sql no Database Actions');
          avisoOperacional = true;
        }
        contagens.erros += 1;
      }
    }

    for (const mq of bloco.maquinas ?? []) {
      const gps = mq.machineGPSOffset ?? {};
      await syncPost('/sync/maquina/', {
        id_maquina: mq.idMachine,
        id_business_unit: idBu,
        nome: mq.machineName ?? '',
        serial: mq.machineSerialNumber ?? '',
        tipo: mq.machineType ?? '',
        modelo: mq.machineModel ?? '',
        gps_int_x: gps.internalGPSOffsetX ?? null,
        gps_int_y: gps.internalGPSOffsetY ?? null,
        gps_ext_x: gps.externalGPSOffsetX ?? null,
        gps_ext_y: gps.externalGPSOffsetY ?? null,
        ativo: mq.machineEnable === false ? 0 : 1,
      });
      contagens.maquinas += 1;
    }

    for (const talhao of bloco.talhoes ?? []) {
      try {
        await syncPost('/sync/talhao/', {
          id_field: talhao.idField,
          id_business_unit: idBu,
          id_farm: talhao.idFarm ?? null,
          nome: talhao.fieldName ?? '',
          cor: talhao.color ?? '',
          area_ha: talhao.fieldArea ?? null,
          nome_fazenda: talhao.farmName ?? '',
          ativo: talhao.enable === false ? 0 : 1,
        });
        contagens.talhoes += 1;
      } catch {
        await syncPost('/sync/talhao/', {
          id_field: talhao.idField,
          id_business_unit: idBu,
          id_farm: talhao.idFarm ?? null,
          nome: talhao.fieldName ?? '',
          cor: talhao.color ?? '',
          ativo: talhao.enable === false ? 0 : 1,
        });
        contagens.talhoes += 1;
      }
    }

    for (const os of bloco.ordensServico ?? []) {
      const payload = payloadOrdemServico(idBu, os);
      try {
        await syncPost('/sync/ordem/', payload);
        contagens.ordens += 1;
      } catch {
        if (!avisoOperacional) {
          console.warn('  (operacional) rode scripts/atualizar-ekos-operacional.sql no Database Actions');
          avisoOperacional = true;
        }
        contagens.erros += 1;
      }

      await syncPost('/sync/agua/', {
        id_ordem: payload.id_ordem,
        id_business_unit: payload.id_business_unit,
        numero_os: payload.numero_os,
        data_os: payload.data_os,
        id_operacao: payload.id_operacao,
        nome_operacao: payload.nome_operacao,
        prescricao: payload.prescricao,
        volume_total: payload.volume_total,
        talhoes: payload.talhoes,
        ativo: payload.ativo,
      });
      contagens.agua += 1;
    }

    for (const periodo of bloco.periodosTelemetria ?? []) {
      await syncPost('/sync/periodo/', {
        id_business_unit: idBu,
        init_date: periodo.initDate,
        end_date: periodo.endDate,
      });
      contagens.periodos += 1;
    }

    for (const item of bloco.monitoramento ?? []) {
      try {
        await syncPost('/sync/monitoramento/', {
          id_maquina: item.idMachine,
          id_business_unit: idBu,
          nome: item.label ?? '',
          latitude: item.latitude ?? null,
          longitude: item.longitude ?? null,
          status: item.status ?? item.machineStatus ?? '',
          modelo: item.machineModel ?? '',
          alarme: item.alarm ? 1 : 0,
          alerta_oper: item.alertOperational ? 1 : 0,
        });
        contagens.monitoramento += 1;
      } catch (erro) {
        if (contagens.monitoramento === 0 && contagens.erros === 0) {
          console.warn('  (monitoramento) rode scripts/atualizar-ekos-telemetria.sql no Database Actions');
        }
        contagens.erros += 1;
      }
    }
  }

  return contagens;
}

async function main() {
  console.log('Autenticando no Jacto Connect…');
  const token = await obterTokenEkos();
  const headers = { Authorization: `Bearer ${token}` };

  const clientes = await getLista(headers, `${EKOS_V2}/clients`);
  const unidades = await listarUnificado(headers, `${EKOS_V2}/businessunits/`);

  const porUnidade = {};
  const resumo = {
    clientes: clientes.length,
    unidades: unidades.length,
    atividades: 0,
    operacoes: 0,
    maquinas: 0,
    fazendas: 0,
    talhoes: 0,
    ordensServico: 0,
    periodosTelemetria: 0,
    monitoramento: 0,
  };

  for (const unidade of unidades) {
    const idBu = unidade.idBusinessUnit;
    console.log(`\n→ ${unidade.businessUnitName} (${idBu})`);

    const atividades = await listarUnificado(headers, `${EKOS_V2}/agriculturalactivities/businessunit/${idBu}`);
    const operacoes = (await listarUnificado(
      headers,
      `${EKOS_V2}/agriculturaloperations/businessunit/${idBu}`,
    )).map(normalizarOperacao);
    const maquinas = await listarUnificado(headers, `${EKOS_V2}/machines/businessunit/${idBu}`);
    const fazendas = (await listarUnificado(headers, `${EKOS_V2}/farms/businessunit/${idBu}`)).map(normalizarFazenda);
    const fazendasPorId = Object.fromEntries(fazendas.filter((f) => f.idFarm != null).map((f) => [f.idFarm, f]));
    const talhoes = (await listarUnificado(headers, `${EKOS_V2}/fields/businessunit/${idBu}`)).map((talhao) =>
      normalizarTalhao(talhao, fazendasPorId),
    );
    const equipes = await listarUnificado(headers, `${EKOS_V2}/teams/businessunit/${idBu}`);
    const operadores = await listarUnificado(headers, `${EKOS_V2}/operators/businessunit/${idBu}`);

    let ordensServico = [];
    try {
      ordensServico = await listarOrdensServico(headers, token, idBu);
    } catch (erro) {
      console.warn(`  (ignorado) ordens de serviço — ${erro.message}`);
    }

    const periodosTelemetria = await getOpcional(
      headers,
      `${EKOS_V1}/maps/filter/historical/period?idBusinessUnit=${idBu}`,
    );
    const monitoramento = await getOpcional(
      headers,
      `${EKOS_V1}/maps/monitoring?idBusinessUnit=${idBu}`,
    );

    porUnidade[String(idBu)] = {
      atividades,
      operacoes,
      maquinas,
      talhoes,
      fazendas,
      equipes,
      operadores,
      ordensServico,
      periodosTelemetria,
      monitoramento,
    };

    resumo.atividades += atividades.length;
    resumo.operacoes += operacoes.length;
    resumo.maquinas += maquinas.length;
    resumo.fazendas += fazendas.length;
    resumo.talhoes += talhoes.length;
    resumo.ordensServico += ordensServico.length;
    resumo.periodosTelemetria += periodosTelemetria.length;
    resumo.monitoramento += monitoramento.length;

    console.log(
      `  atividades=${atividades.length} operacoes=${operacoes.length} fazendas=${fazendas.length} talhoes=${talhoes.length} os=${ordensServico.length} maquinas=${maquinas.length} periodos=${periodosTelemetria.length}`,
    );
  }

  const snapshot = {
    sincronizadoEm: new Date().toISOString(),
    email,
    resumo,
    clientes,
    unidades,
    porUnidade,
  };

  const arquivos = salvarLocal(snapshot);
  console.log('\nArmazenado localmente:');
  console.log(`  ${arquivos.latest}`);
  console.log(`  ${arquivos.historico}`);

  try {
    const oracle = await enviarOracle(snapshot);
    console.log('\nArmazenado no Oracle ADB (ORDS):');
    console.log(`  clientes=${oracle.clientes} unidades=${oracle.unidades} atividades=${oracle.atividades}`);
    console.log(`  operacoes=${oracle.operacoes} fazendas=${oracle.fazendas} talhoes=${oracle.talhoes}`);
    console.log(`  ordens=${oracle.ordens} agua/os=${oracle.agua} periodos=${oracle.periodos} monitoramento=${oracle.monitoramento}`);
    console.log(`\nConsulte: ${ORDS_BASE}/ordens/  ${ORDS_BASE}/talhoes/  ${ORDS_BASE}/operacoes/`);
  } catch (erro) {
    console.warn(`\nOracle ADB: ${erro.message}`);
    console.warn('Os dados já estão em data/ekos/latest.json.');
    console.warn('Para gravar no banco, rode scripts/habilitar-ekos-dados.sql e execute npm run sync:ekos de novo.');
  }
}

main().catch((erro) => {
  console.error('Falha na sincronização:', erro.message ?? erro);
  process.exit(1);
});
