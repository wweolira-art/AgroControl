import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';
import type { LocalizacaoResponse } from '../types/api';
import { formatCodigo, formatCoordinate } from '../utils/format';
import { ActionButton } from './ActionButton';

interface LocationPanelProps {
  resultado: LocalizacaoResponse | null;
  detecting: boolean;
  origemConsulta?: 'gps' | 'mapa';
  isAdmin?: boolean;
  onMinhaLocalizacao: () => void;
  onApontamento?: () => void;
  onDesenhar?: () => void;
}

export function LocationPanel({
  resultado,
  detecting,
  origemConsulta = 'gps',
  isAdmin = false,
  onMinhaLocalizacao,
  onApontamento,
  onDesenhar,
}: LocationPanelProps) {
  const encontrado = Boolean(resultado?.encontrado && resultado.fazenda && resultado.talhao);

  return (
    <View style={styles.card}>
      <View style={styles.handle} />
      <Text style={styles.title}>LOCALIZAÇÃO ATUAL</Text>
      {origemConsulta === 'mapa' ? (
        <Text style={styles.hint}>Consulta pelo ponto selecionado no mapa</Text>
      ) : null}

      {detecting && !resultado ? (
        <Text style={styles.muted}>Identificando fazenda e talhão…</Text>
      ) : null}

      {encontrado ? (
        <View style={styles.grid}>
          <InfoRow label="Fazenda" value={resultado?.fazenda?.nome ?? '—'} />
          <InfoRow label="Código" value={formatCodigo(resultado?.fazenda?.codigo)} />
          <InfoRow label="Talhão" value={formatCodigo(resultado?.talhao?.codigo)} />
          <InfoRow label="Latitude" value={resultado ? formatCoordinate(resultado.latitude) : '—'} />
          <InfoRow label="Longitude" value={resultado ? formatCoordinate(resultado.longitude) : '—'} />
        </View>
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Você não está dentro de nenhum talhão cadastrado.</Text>
          {resultado ? (
            <Text style={styles.coords}>
              {formatCoordinate(resultado.latitude)} , {formatCoordinate(resultado.longitude)}
            </Text>
          ) : null}
        </View>
      )}

      <View style={styles.actions}>
        <ActionButton label="Minha localização" onPress={onMinhaLocalizacao} />
        {onApontamento ? (
          <ActionButton
            label="Apontamento"
            variant="secondary"
            onPress={onApontamento}
            disabled={!encontrado}
          />
        ) : null}
      </View>
      {isAdmin && onDesenhar ? (
        <View style={styles.actions}>
          <ActionButton
            label={encontrado ? 'Desenhar mapa' : 'Novo talhão'}
            variant="ghost"
            onPress={onDesenhar}
          />
        </View>
      ) : null}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.cream,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 16,
    boxShadow: '0px -4px 12px rgba(0, 0, 0, 0.18)',
    elevation: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.creamDark,
    marginBottom: 10,
  },
  title: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: colors.forest,
    marginBottom: 8,
  },
  hint: {
    color: colors.gold,
    fontSize: 12,
    marginBottom: 8,
    fontWeight: '600',
  },
  grid: {
    gap: 6,
    marginBottom: 14,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  label: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  value: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    minWidth: 0,
    flexShrink: 1,
    textAlign: 'right',
  },
  empty: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  emptyText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  coords: {
    marginTop: 6,
    color: colors.muted,
    fontSize: 12,
  },
  muted: {
    color: colors.muted,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
});
