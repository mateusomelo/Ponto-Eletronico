import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PagamentosAPI } from '../api/fechamento';

export default function PagamentosScreen() {
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    PagamentosAPI.minhaAssinatura()
      .then(setDados)
      .catch((err) => setErro(err?.data?.erro || 'Não foi possível carregar a assinatura.'))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (erro) {
    return (
      <View style={styles.center}>
        <Text style={styles.erro}>{erro}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Assinatura</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Empresa</Text>
        <Text style={styles.value}>{dados?.empresa}</Text>
        <Text style={styles.label}>Plano</Text>
        <Text style={styles.value}>{dados?.plano}</Text>
        {dados?.assinatura ? (
          <>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{dados.assinatura.status}</Text>
          </>
        ) : (
          <Text style={styles.semAssinatura}>Sem assinatura ativa no Stripe.</Text>
        )}
        {dados?.plano_expires_at && (
          <>
            <Text style={styles.label}>Vencimento do plano</Text>
            <Text style={styles.value}>{new Date(dados.plano_expires_at).toLocaleDateString('pt-BR')}</Text>
          </>
        )}
      </View>

      {dados?.portal_url && (
        <TouchableOpacity style={styles.btn} onPress={() => Linking.openURL(dados.portal_url)}>
          <Text style={styles.btnText}>Gerenciar pagamento</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9', padding: 24 },
  erro: { color: '#dc2626', textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  label: { fontSize: 11, color: '#94a3b8', marginTop: 10 },
  value: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  semAssinatura: { fontSize: 12, color: '#64748b', marginTop: 10 },
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
