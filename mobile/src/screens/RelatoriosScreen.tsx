import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RelatoriosAPI } from '../api/relatorios';

export default function RelatoriosScreen() {
  const [baixando, setBaixando] = useState<'pdf' | 'excel' | null>(null);
  const [resumo, setResumo] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);

  React.useEffect(() => {
    RelatoriosAPI.resumoUsuario()
      .then(setResumo)
      .catch(() => setResumo([]))
      .finally(() => setCarregando(false));
  }, []);

  async function baixar(tipo: 'pdf' | 'excel') {
    setBaixando(tipo);
    try {
      await RelatoriosAPI.baixarEAbrir(tipo);
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível baixar o relatório.');
    } finally {
      setBaixando(null);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Relatórios de Ponto</Text>

      <View style={styles.btnRow}>
        <TouchableOpacity style={[styles.btn, styles.btnPdf]} onPress={() => baixar('pdf')} disabled={!!baixando}>
          {baixando === 'pdf' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Baixar PDF</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnExcel]} onPress={() => baixar('excel')} disabled={!!baixando}>
          {baixando === 'excel' ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Baixar Excel</Text>}
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Resumo por funcionário</Text>
      {carregando ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 20 }} />
      ) : resumo.length === 0 ? (
        <Text style={styles.empty}>Nenhum dado disponível.</Text>
      ) : (
        resumo.map((u: any) => (
          <View key={u.id} style={styles.card}>
            <Text style={styles.cardNome}>{u.nome}</Text>
            <Text style={styles.cardCargo}>{u.cargo}</Text>
            <View style={styles.cardStats}>
              <Text style={styles.cardStat}>Entradas: {u.total_entradas}</Text>
              <Text style={styles.cardStat}>Saídas: {u.total_saidas}</Text>
              <Text style={styles.cardStat}>Dias: {u.dias_trabalhados}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 16 },
  btnRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnPdf: { backgroundColor: '#dc2626' },
  btnExcel: { backgroundColor: '#16a34a' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  cardNome: { fontWeight: '700', fontSize: 14, color: '#1e293b' },
  cardCargo: { fontSize: 12, color: '#64748b', marginBottom: 8 },
  cardStats: { flexDirection: 'row', gap: 14 },
  cardStat: { fontSize: 11, color: '#475569' },
});
