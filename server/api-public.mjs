/**
 * Sobe a API e publica no ngrok.
 * Pasta copiável: este diretório, sem o app Expo.
 *
 * No outro PC: npm install && npm run public
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(SERVER_DIR, '.env');
if (fs.existsSync(ENV_PATH)) {
  for (const linha of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const texto = linha.trim();
    if (!texto || texto.startsWith('#')) continue;
    const sep = texto.indexOf('=');
    if (sep <= 0) continue;
    const chave = texto.slice(0, sep).trim();
    if (!process.env[chave]) process.env[chave] = texto.slice(sep + 1).trim();
  }
}
const API_PORT = Number(process.env.API_PORT ?? 3001);
const NGROK_API = 'http://127.0.0.1:4040/api/tunnels';
const ORDS = 'https://g58645a2c384a96-bd1.adb.sa-saopaulo-1.oraclecloudapps.com/ords/admin/conexao_banco';

function cabecalhosOrds() {
  const token = (process.env.ORDS_TOKEN ?? process.env.ORDS_BEARER_TOKEN ?? '').trim();
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
    return headers;
  }
  const user = (process.env.ORDS_USER ?? '').trim();
  const password = process.env.ORDS_PASSWORD ?? '';
  if (user && password) {
    headers.Authorization = `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
  }
  return headers;
}

const filhos = [];

function encerrar(codigo = 0) {
  for (const filho of filhos) {
    if (!filho.killed) {
      filho.kill();
    }
  }
  process.exit(codigo);
}

process.on('SIGINT', () => encerrar(0));
process.on('SIGTERM', () => encerrar(0));
process.on('uncaughtException', (erro) => {
  console.error(erro);
  encerrar(1);
});

async function apiSaudavel() {
  try {
    const resposta = await fetch(`http://127.0.0.1:${API_PORT}/health`);
    return resposta.ok;
  } catch {
    return false;
  }
}

async function esperarSaude() {
  for (let i = 0; i < 50; i += 1) {
    if (await apiSaudavel()) {
      return;
    }
    await sleep(400);
  }
  throw new Error(`A API local não subiu em http://127.0.0.1:${API_PORT}`);
}

async function listarTunnels() {
  const resposta = await fetch(NGROK_API);
  const data = await resposta.json();
  return data.tunnels ?? [];
}

function urlHttps(tunnels) {
  const https = tunnels.find((item) => String(item.public_url ?? '').startsWith('https://'));
  return https?.public_url ? String(https.public_url).replace(/\/$/, '') : null;
}

async function criarTunelNoAgente() {
  const resposta = await fetch(NGROK_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'agrocontrol-api',
      addr: `localhost:${API_PORT}`,
      proto: 'http',
      pooling_enabled: true,
    }),
  });
  if (!resposta.ok) {
    const texto = await resposta.text();
    if (/ERR_NGROK_334|already online/i.test(texto)) {
      const atual = urlHttps(await listarTunnels());
      if (atual) {
        return atual;
      }
    }
    throw new Error(texto);
  }
  const criado = await resposta.json();
  return String(criado.public_url ?? '').replace(/\/$/, '') || urlHttps(await listarTunnels());
}

async function obterUrlNgrok() {
  try {
    const atual = urlHttps(await listarTunnels());
    if (atual) {
      console.log('Reusando o ngrok que já está neste PC.');
      return atual;
    }
    const criado = await criarTunelNoAgente();
    if (criado) {
      console.log('Túnel HTTP adicionado no ngrok que já estava no ar (mesmo agente do Oracle).');
      return criado;
    }
  } catch {
    /* não há agente local; sobe um ngrok só da API */
  }

  const ngrok = spawn(
    'ngrok',
    ['http', String(API_PORT), '--pooling-enabled', '--log=stdout'],
    { cwd: SERVER_DIR, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  filhos.push(ngrok);

  let falha = '';
  ngrok.stderr?.on('data', (buf) => {
    const texto = String(buf);
    falha += texto;
    if (/ERR_|error|failed/i.test(texto)) {
      process.stderr.write(texto);
    }
  });
  ngrok.stdout?.on('data', (buf) => {
    const texto = String(buf);
    falha += texto;
    if (/ERR_NGROK_|failed to start tunnel/i.test(texto)) {
      process.stderr.write(texto);
    }
  });

  for (let i = 0; i < 50; i += 1) {
    try {
      const url = urlHttps(await listarTunnels());
      if (url) {
        return url;
      }
    } catch {
      /* ainda subindo */
    }
    if (ngrok.exitCode) {
      break;
    }
    await sleep(400);
  }

  if (/ERR_NGROK_334|already online/i.test(falha)) {
    throw new Error(
      'O endereço HTTPS do ngrok já está em uso nesta conta. No servidor, abra o Gerenciador de Tarefas e finalize ngrok.exe extras (mantenha só o túnel TCP do Oracle, se houver). Depois rode de novo: npm run public',
    );
  }
  if (/ERR_NGROK_108|simultaneous ngrok agent/i.test(falha)) {
    throw new Error(
      'Já existe um ngrok neste PC (túnel TCP do Oracle). Não abra outro. Deixe o ngrok do Oracle no ar e rode npm run public de novo — o script reaproveita o mesmo agente.',
    );
  }
  throw new Error(
    'O ngrok não publicou a URL. Instale o ngrok neste PC, autentique, e deixe só um ngrok no ar.',
  );
}

function descricaoComApi(descricao, url) {
  const base = String(descricao ?? '')
    .replace(/\s*#API=\S+/gi, '')
    .trim() || 'Conexão de insumos';
  return `${base} #API=${url}`;
}

function gravarPublicApiUrlNoEnv(url) {
  const envPath = path.join(SERVER_DIR, '.env');
  const linhas = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8').split(/\r?\n/) : [];
  let achou = false;
  const novas = linhas.map((linha) => {
    if (/^\s*PUBLIC_API_URL=/.test(linha)) {
      achou = true;
      return `PUBLIC_API_URL=${url}`;
    }
    return linha;
  });
  if (!achou) {
    if (novas.length && novas[novas.length - 1] !== '') {
      novas.push('');
    }
    novas.push('# Gravado automaticamente por npm run api:public (ngrok HTTPS)');
    novas.push(`PUBLIC_API_URL=${url}`);
  }
  fs.writeFileSync(envPath, `${novas.join('\n').replace(/\n?$/, '\n')}`);
  console.log(`PUBLIC_API_URL gravado em server/.env`);
}

function corpoSemLinks(row) {
  const { links: _links, ...resto } = row;
  return resto;
}

async function publicarUrl(url) {
  const lista = await (await fetch(`${ORDS}/?limit=50`, { headers: cabecalhosOrds() })).json();
  const items = lista.items ?? [];
  if (items.length === 0) {
    console.log(`Nenhuma conexão em conexao_banco. URL pública: ${url}`);
    return;
  }
  for (const row of items) {
    if (row.id == null) {
      continue;
    }
    const resposta = await fetch(`${ORDS}/${row.id}`, {
      method: 'PUT',
      headers: cabecalhosOrds(),
      body: JSON.stringify({
        ...corpoSemLinks(row),
        descricao: descricaoComApi(row.descricao, url),
      }),
    });
    if (!resposta.ok) {
      throw new Error(await resposta.text());
    }
  }
  console.log(`API pública gravada em ${items.length} linha(s) da conexao_banco. O app usa: ${url}`);
}

process.chdir(SERVER_DIR);

if (await apiSaudavel()) {
  console.log(`Reusando a API que já está em http://127.0.0.1:${API_PORT}`);
} else {
  const api = spawn(process.execPath, ['index.ts'], {
    cwd: SERVER_DIR,
    stdio: 'inherit',
    env: { ...process.env, API_PORT: String(API_PORT) },
  });
  filhos.push(api);
  api.on('exit', (code) => {
    if (code && code !== 0) {
      encerrar(code);
    }
  });
}

await esperarSaude();
const url = await obterUrlNgrok();

const saudePublica = await fetch(`${url}/health`, {
  headers: { 'ngrok-skip-browser-warning': 'true' },
});
if (!saudePublica.ok) {
  throw new Error(`A URL pública respondeu ${saudePublica.status} em ${url}/health`);
}

gravarPublicApiUrlNoEnv(url);
await publicarUrl(url);
console.log(`\nURL pública: ${url}`);
console.log('Gravada em server/.env (PUBLIC_API_URL) e na ORDS conexao_banco (#API=).');
console.log('\nDeixe esta janela aberta. Ctrl+C para encerrar o túnel público.\n');

await new Promise(() => undefined);
