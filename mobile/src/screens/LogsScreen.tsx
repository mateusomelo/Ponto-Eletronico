import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { LogsAPI } from '../api/fechamento';

export default function LogsScreen() {
  const [logs, setLogs] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  async function carregar() {
    try {
      const data = await LogsAPI.listar({ por_pagina: 50 });
      setLogs(data.registros || []);
    } catch { setLogs([]); }
    finally { setCarregando(false); setAtualizando(false); }
  }

  useEffect(() => { carregar(); }, []);
  const onRefresh = useCallback(() => { setAtualizando(true); carregar(); }, []);

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.container}
      data={logs}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 16 }}
      ListEmptyComponent={<Text style={styles.empty}>Nenhum log encontrado.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <Text style={styles.acao}>{item.acao}</Text>
          <Text style={styles.detalhe}>{item.usuario_nome || 'Sistema'} · {item.ip || '-'}</Text>
          {item.descricao ? <Text style={styles.descricao}>{item.descricao}</Text> : null}
          <Text style={styles.data}>{new Date(item.created_at).toLocaleString('pt-BR')}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  acao: { fontWeight: '700', fontSize: 13, color: '#1e293b' },
  detalhe: { fontSize: 11, color: '#64748b', marginTop: 2 },
  descricao: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  data: { fontSize: 10, color: '#cbd5e1', marginTop: 4 },
});
