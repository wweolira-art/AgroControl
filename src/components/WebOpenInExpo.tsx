import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme/colors';

const FALLBACK_LAN = '192.168.6.253';

function urlExpoGo(): string {
  const host =
    typeof window !== 'undefined' ? window.location.hostname : FALLBACK_LAN;
  const lan = host === 'localhost' || host === '127.0.0.1' ? FALLBACK_LAN : host;
  return `exp://${lan}:8081`;
}

export default function WebOpenInExpo() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Elejotaagro</Text>
      <Text style={styles.text}>
        Este endereço não abre o app no navegador. A tela azul girando é o Expo tentando carregar a versão web.
      </Text>
      <Text style={styles.text}>
        No celular, instale o Expo Go 57 (arquivo Expo-Go-57.0.9.apk, não o da Play Store) e abra:
      </Text>
      <Text style={styles.url}>{urlExpoGo()}</Text>
      <Text style={styles.hint}>Celular e computador na mesma Wi-Fi. Não use http:// nem o Chrome.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: colors.forest,
    gap: 16,
  },
  title: {
    color: colors.cream,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
  },
  text: {
    color: colors.accent,
    textAlign: 'center',
    fontSize: 16,
    lineHeight: 24,
    maxWidth: 420,
  },
  url: {
    color: colors.goldBright,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  hint: {
    color: colors.cream,
    textAlign: 'center',
    fontSize: 14,
    opacity: 0.85,
  },
});
