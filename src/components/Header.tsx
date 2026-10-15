import { StyleSheet, Text, View } from 'react-native';
import type { ReactNode } from 'react';

import { colors } from '../theme/colors';

interface HeaderProps {
  subtitle?: string;
  right?: ReactNode;
}

export function Header({ subtitle = 'Mapas agrícolas · GPS · Talhões', right }: HeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <View style={styles.titles}>
          <Text style={styles.brand}>Elejotaagro</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.forest,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  brand: {
    color: colors.cream,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  subtitle: {
    color: colors.accent,
    fontSize: 12,
    marginTop: 2,
    letterSpacing: 0.4,
    flexShrink: 1,
  },
});
