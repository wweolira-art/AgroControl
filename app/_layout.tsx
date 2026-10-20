import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '../src/auth/AuthProvider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0F2E22' },
          animation: 'none',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="mapa" />
        <Stack.Screen name="usuarios" />
        <Stack.Screen name="mapa-admin" />
        <Stack.Screen name="desenhar-talhao" />
        <Stack.Screen name="conexao-oracle" />
        <Stack.Screen name="apontamento" />
        <Stack.Screen name="apontamentos-locais" />
        <Stack.Screen name="importar-cadastro-apontamento" />
        <Stack.Screen name="perdas-colheita" />
        <Stack.Screen name="analise-biometrica" />
      </Stack>
    </AuthProvider>
  );
}
