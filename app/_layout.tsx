import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { DeviceAccessProvider, useDeviceAccess } from '../src/auth/DeviceAccessProvider';

export default function RootLayout() {
  return (
    <AuthProvider>
      <DeviceAccessProvider><AppStack /></DeviceAccessProvider>
    </AuthProvider>
  );
}

function AppStack() {
  const { usuario, isAdmin } = useAuth();
  const { pode, pronto } = useDeviceAccess();
  return <>
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
        <Stack.Protected guard={!!usuario && pronto && pode('mapa')}><Stack.Screen name="mapa" /></Stack.Protected>
        <Stack.Protected guard={!!usuario && pronto && pode('insumos')}><Stack.Screen name="apontamento" /></Stack.Protected>
        <Stack.Protected guard={!!usuario && pronto && pode('mao-de-obra')}><Stack.Screen name="mao-de-obra" /></Stack.Protected>
        <Stack.Protected guard={!!usuario}><Stack.Screen name="apontamentos-locais" /></Stack.Protected>
        <Stack.Protected guard={!!usuario}><Stack.Screen name="importar-cadastro-apontamento" /></Stack.Protected>
        <Stack.Protected guard={!!usuario && pronto && pode('perdas')}><Stack.Screen name="perdas-colheita" /></Stack.Protected>
        <Stack.Protected guard={!!usuario && pronto && pode('biometria')}><Stack.Screen name="analise-biometrica" /></Stack.Protected>
        <Stack.Protected guard={isAdmin}>
          <Stack.Screen name="acesso-dispositivos" />
          <Stack.Protected guard={pronto && pode('usuarios')}><Stack.Screen name="usuarios" /></Stack.Protected>
          <Stack.Protected guard={pronto && pode('conexao')}><Stack.Screen name="conexao-oracle" /></Stack.Protected>
          <Stack.Protected guard={pronto && pode('talhoes-admin')}>
            <Stack.Screen name="mapa-admin" /><Stack.Screen name="desenhar-talhao" />
          </Stack.Protected>
        </Stack.Protected>
      </Stack>
    </>;
}
