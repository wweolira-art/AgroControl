import { Image, StyleSheet, View } from 'react-native';

const LOGO = require('../../assets/images/logo-elejotaagro.png');

interface LogoProps {
  tamanho?: number;
}

export function Logo({ tamanho = 168 }: LogoProps) {
  return (
    <View style={[styles.wrap, { width: tamanho + 28, height: tamanho + 28 }]}>
      <Image source={LOGO} style={{ width: tamanho, height: tamanho }} resizeMode="contain" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#F4F1EA',
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
});
