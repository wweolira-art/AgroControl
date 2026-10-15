import type { DocumentPickerAsset } from 'expo-document-picker';

function decodificarDataUri(uri: string): string {
  const separador = uri.indexOf(',');
  const payload = separador >= 0 ? uri.slice(separador + 1) : uri;
  const cabecalho = separador >= 0 ? uri.slice(0, separador) : '';
  if (cabecalho.includes(';base64')) {
    const binario = globalThis.atob(payload);
    const bytes = Uint8Array.from(binario, (ch) => ch.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }
  return decodeURIComponent(payload);
}

export async function lerTextoDocumento(asset: DocumentPickerAsset): Promise<string> {
  if (asset.file && typeof asset.file.text === 'function') {
    return asset.file.text();
  }
  if (asset.uri.startsWith('data:')) {
    return decodificarDataUri(asset.uri);
  }
  const resposta = await fetch(asset.uri);
  if (!resposta.ok) {
    throw new Error('Não foi possível ler o arquivo selecionado. Copie o JSON para o aparelho ou use Importar mapa do app.');
  }
  return resposta.text();
}
