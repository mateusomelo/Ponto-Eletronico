import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function HomeScreen() {
  const { usuario, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Olá, {usuario?.nome}</Text>
      <Text style={styles.subtitle}>{usuario?.cargo_nome} · {usuario?.company_nome || 'Plataforma'}</Text>
      <Text style={styles.info}>
        Fase 1 concluída: login e sessão funcionando contra o backend de produção.{'\n'}
        Próximas fases trarão registro de ponto, histórico, relatórios e demais módulos.
      </Text>
      <TouchableOpacity style={styles.btn} onPress={logout}>
        <Text style={styles.btnText}>Sair</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: '#1e293b', textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', marginTop: 6, marginBottom: 24 },
  info: { fontSize: 13, color: '#475569', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btn: { backgroundColor: '#dc2626', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
