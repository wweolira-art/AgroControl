import test from 'node:test';
import assert from 'node:assert/strict';
import { urlHttpsDaApi } from '../server/ngrok-tunnel.mjs';

test('ngrok seleciona a porta da API mesmo quando outro HTTPS aparece primeiro', () => {
  const tunnel = (public_url, addr) => ({ public_url, config: { addr } });
  assert.equal(urlHttpsDaApi([
    tunnel('https://outro.example', 'http://localhost:8081'),
    tunnel('tcp://oracle.example:1234', 'localhost:1521'),
    tunnel('https://api.example/', 'http://127.0.0.1:3001'),
  ], 3001), 'https://api.example');
});

test('ngrok não reutiliza serviço remoto, túnel incompleto ou porta diferente', () => {
  assert.equal(urlHttpsDaApi([
    { public_url: 'https://outro.example', config: { addr: 'localhost:3002' } },
    { public_url: 'https://remoto.example', config: { addr: 'outro-pc:3001' } },
    { public_url: 'https://incompleto.example' },
  ], 3001), null);
  assert.equal(urlHttpsDaApi([
    { public_url: 'https://api.example', config: { addr: 'localhost:3001' } },
  ], 3001), 'https://api.example');
});
