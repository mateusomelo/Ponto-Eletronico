import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';

export default function BiometriaLockScreen() {
  const { usuario, desbloquearComBiometria, logout } = useAuth();
  const [erro, setErro] = useState(false);

  async function tentar() {
    setErro(false);
    const ok = await desbloquearComBiometria();
    if (!ok) setErro(true);
  }

  useEffect(() => { tentar(); }, []);

  return (
    <View style={styles.container}>
      <View style={styles.icon}>
        <Text style={styles.iconText}>🔒</Text>
      </View>
      <Text style={styles.title}>Olá, {usuario?.nome?.split(' ')[0] || ''}</Text>
      <Text style={styles.subtitle}>Confirme sua identidade para continuar</Text>

      {erro && <Text style={styles.erro}>Autenticação não confirmada.</Text>}

      <TouchableOpacity style={styles.btn} onPress={tentar}>
        <Text style={styles.btnText}>Tentar novamente</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={logout}>
        <Text style={styles.logout}>Sair e usar outra conta</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', padding: 24 },
  icon: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#1e3a5f',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  iconText: { fontSize: 30 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 6, marginBottom: 20 },
  erro: { color: '#dc2626', fontSize: 12, marginBottom: 12 },
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 40 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  logout: { color: '#94a3b8', fontSize: 12, marginTop: 20 },
});
