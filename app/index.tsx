import { useFocusEffect, useRouter, Redirect, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../src/auth/AuthProvider';
import { useDeviceAccess } from '../src/auth/DeviceAccessProvider';
import type { AbaDispositivo } from '../src/config/device-tabs';
import { ABAS_OBRIGATORIAS } from '../src/config/device-tabs';
import { Header } from '../src/components/Header';
import { Logo } from '../src/components/Logo';
import { carregarPerdasLocal, carregarRascunhosLocal } from '../src/services/apontamento-local';
import { colors } from '../src/theme/colors';

interface MenuCardProps {
  aba?: AbaDispositivo;
  titulo: string;
  descricao: string;
  detalhe?: string;
  onPress: () => void;
}

function MenuCard({ aba, titulo, descricao, detalhe, onPress }: MenuCardProps) {
  const { pode } = useDeviceAccess();
  if (aba && !pode(aba)) return null;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
      <Text style={styles.cardTitulo}>{titulo}</Text>
      <Text style={styles.cardDescricao}>{descricao}</Text>
      {detalhe ? <Text style={styles.cardDetalhe}>{detalhe}</Text> : null}
    </Pressable>
  );
}

export default function Index() {
  const router = useRouter();
  const { usuario, pronto, isAdmin, sair } = useAuth();
  const { email, acesso, pronto: acessoPronto, erro: erroAcesso, atualizar } = useDeviceAccess();
  const [salvos, setSalvos] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([carregarRascunhosLocal(), carregarPerdasLocal()])
        .then(([lista, perdas]) =>
          setSalvos(
            lista.filter((item) => item.syncStatus !== 'enviado').length +
              perdas.filter((item) => item.syncStatus !== 'enviado').length,
          ),
        )
        .catch(() => setSalvos(0));
    }, []),
  );

  if (!pronto) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!usuario) {
    return <Redirect href="/login" />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <Header
        subtitle={isAdmin ? `Admin · ${usuario.nome}` : usuario.nome}
        right={
          <Pressable
            onPress={() => {
              void sair().then(() => router.replace('/login'));
            }}
          >
            <Text style={styles.sair}>Sair</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Logo tamanho={148} />
        <Text style={styles.intro}>Abra o mapa, os cadastros ou os apontamentos salvos neste aparelho.</Text>
        <Text selectable style={styles.intro}>Liberações de acesso: {email}</Text>
        {!acessoPronto && <ActivityIndicator color={colors.accent} />}
        {!!erroAcesso && <Pressable onPress={() => void atualizar()}><Text style={styles.intro}>{erroAcesso}{'\n'}Toque para tentar novamente.</Text></Pressable>}
        {acessoPronto && !erroAcesso && !acesso?.abas.some(aba => !ABAS_OBRIGATORIAS.includes(aba)) && <Text style={styles.intro}>Cadastros e Apontamentos salvos estão disponíveis. Para acessar outras abas, solicite a liberação ao administrador.</Text>}

        <MenuCard
          titulo="Mapa"
          aba="mapa"
          descricao="Talhões, GPS e lançamento no campo."
          onPress={() => router.push('/mapa')}
        />
        <MenuCard
          titulo="Cadastros"
          aba="cadastros"
          descricao="Importar fazendas, talhões, operações, materiais e funcionários."
          onPress={() => router.push('/importar-cadastro-apontamento')}
        />
        <MenuCard
          titulo="Insumos"
          aba="insumos"
          descricao="Preencher e gravar no celular. O envio ao Oracle é na lista de salvos."
          onPress={() => router.push('/apontamento')}
        />
        <MenuCard
          titulo="Mão de obra"
          aba="mao-de-obra"
          descricao="Lançar produção por funcionário, fazenda, talhão e serviço."
          onPress={() => router.push('/mao-de-obra' as Href)}
        />
        <MenuCard
          titulo="Apontamentos salvos"
          aba="salvos"
          descricao="Pendentes neste aparelho. Envie ao Oracle daqui."
          detalhe={salvos === 1 ? '1 pendente neste aparelho' : `${salvos} pendentes neste aparelho`}
          onPress={() => router.push('/apontamentos-locais')}
        />
        <MenuCard
          titulo="Perdas de colheita"
          aba="perdas"
          descricao="Lançar amostra manual ou mecanizada, com os tipos de perda de cada corte."
          onPress={() => router.push('/perdas-colheita')}
        />
        <MenuCard
          titulo="Análise biométrica"
          aba="biometria"
          descricao="Consultar lançamentos, itens e pontos da análise biométrica via ORDS."
          onPress={() => router.push('/analise-biometrica' as Href)}
        />

        {isAdmin ? (
          <>
            <Text style={styles.secao}>Administração</Text>
            <MenuCard titulo="Acesso por e-mail" descricao="Escolher quais abas cada usuário pode acessar." onPress={() => router.push('/acesso-dispositivos' as Href)} />
            <MenuCard
              titulo="Talhões"
              aba="talhoes-admin"
              descricao="Cadastrar, importar e desenhar polígonos."
              onPress={() => router.push('/mapa-admin')}
            />
            <MenuCard
              titulo="Usuários"
              aba="usuarios"
              descricao="Cadastrar operadores e administradores."
              onPress={() => router.push('/usuarios')}
            />
            <MenuCard
              titulo="Conexão Oracle"
              aba="conexao"
              descricao="CSCLIENTE no celular (INSERT). CONSULTA importa no PC."
              onPress={() => router.push('/conexao-oracle')}
            />
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.forest,
  },
  loading: {
    flex: 1,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sair: {
    color: colors.gold,
    fontWeight: '800',
    marginTop: 6,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 32,
  },
  intro: {
    color: colors.creamDark,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  cardPressed: {
    opacity: 0.85,
  },
  cardTitulo: {
    color: colors.forest,
    fontSize: 18,
    fontWeight: '800',
  },
  cardDescricao: {
    color: colors.muted,
    fontWeight: '600',
    lineHeight: 20,
    marginTop: 4,
  },
  cardDetalhe: {
    color: colors.leaf,
    fontWeight: '800',
    marginTop: 8,
  },
  secao: {
    color: colors.accent,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 12,
    marginBottom: 10,
  },
});
