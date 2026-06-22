import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { verificarAtualizacao, VersaoInfo } from '../api/appVersao';

// Aviso persistente quando há uma versão mais nova do APK disponível —
// some sozinho se o usuário fechar, mas volta a aparecer em cada novo
// login/abertura do app enquanto a versão instalada continuar antiga.
export default function BannerAtualizacao() {
  const [info, setInfo] = useState<VersaoInfo | null>(null);
  const [fechado, setFechado] = useState(false);

  useEffect(() => {
    verificarAtualizacao().then((r) => {
      if (r.disponivel && r.info) setInfo(r.info);
    });
  }, []);

  if (!info || fechado) return null;

  return (
    <View style={styles.banner}>
      <FontAwesome5 name="arrow-circle-up" size={16} color="#fff" />
      <Text style={styles.texto}>
        Nova versão disponível (v{info.versao}) — atualize o aplicativo
      </Text>
      <TouchableOpacity style={styles.btn} onPress={() => Linking.openURL(info.apk_url)}>
        <Text style={styles.btnTexto}>Atualizar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.fechar} onPress={() => setFechado(true)}>
        <FontAwesome5 name="times" size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e3a5f',
    paddingVertical: 8, paddingHorizontal: 14, gap: 8,
  },
  texto: { flex: 1, color: '#fff', fontSize: 11.5, fontWeight: '600' },
  btn: { backgroundColor: '#3b82f6', borderRadius: 6, paddingVertical: 5, paddingHorizontal: 10 },
  btnTexto: { color: '#fff', fontSize: 11, fontWeight: '700' },
  fechar: { padding: 4 },
});
