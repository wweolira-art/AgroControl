import type { LocalizacaoResponse } from '../types/api';
import { getMapCollection } from '../maps/registry';
import { findTalhaoAtPoint } from '../maps/spatial';

/**
 * Identificação no aparelho com os polígonos já baixados da API mapa_talhao.
 */
export function identificarLocalmente(latitude: number, longitude: number): LocalizacaoResponse {
  const talhao = findTalhaoAtPoint(getMapCollection(), latitude, longitude);

  if (!talhao) {
    return {
      encontrado: false,
      mensagem: 'Localização fora dos talhões cadastrados',
      latitude,
      longitude,
      origem: 'offline',
    };
  }

  return {
    encontrado: true,
    fazenda: {
      codigo: talhao.codigoFazenda,
      nome: talhao.nomeFazenda,
    },
    talhao: {
      codigo: talhao.codigoTalhao,
    },
    latitude,
    longitude,
    extras: {
      campo: talhao.campo,
      produtor: talhao.produtor,
      secId: talhao.secId,
      propriedades: talhao.propriedades,
    },
    origem: 'offline',
  };
}
