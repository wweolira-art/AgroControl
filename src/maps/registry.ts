import type { FeatureCollection } from '../types/geo';

import { listarTalhoesMapa } from '../services/mapa-talhao';

const VAZIO: FeatureCollection = { type: 'FeatureCollection', features: [] };

let cachedCollection: FeatureCollection | null = null;
let carregando: Promise<FeatureCollection> | null = null;

export function getMapCollection(): FeatureCollection {
  return cachedCollection ?? VAZIO;
}

export function limparCacheMapa() {
  cachedCollection = null;
}

export async function carregarMapa(force = false): Promise<FeatureCollection> {
  if (!force && cachedCollection && cachedCollection.features.length > 0) {
    return cachedCollection;
  }
  if (!force && carregando) {
    return carregando;
  }

  carregando = listarTalhoesMapa()
    .then((collection) => {
      cachedCollection = collection;
      return collection;
    })
    .finally(() => {
      carregando = null;
    });

  return carregando;
}
