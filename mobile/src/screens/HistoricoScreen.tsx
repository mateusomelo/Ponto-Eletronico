import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { PontoAPI, RegistroPonto } from '../api/ponto';
import { API_BASE } from '../api/client';

const BACKEND_ORIGIN = API_BASE.replace(/\/api$/, '');

export default function HistoricoScreen() {
  const [registros, setRegistros] = useState<RegistroPonto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  async function carregar() {
    try {
      const data = await PontoAPI.historico({ pagina: 1, por_pagina: 30 });
      setRegistros(data.registros || []);
    } catch {
      setRegistros([]);
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const onRefresh = useCallback(() => { setAtualizando(true); carregar(); }, []);

  function formatarData(iso: string) {
    return new Date(iso).toLocaleString('pt-BR');
  }

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
      data={registros}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} />}
      ListEmptyComponent={<Text style={styles.empty}>Nenhum registro encontrado.</Text>}
      contentContainerStyle={{ padding: 16 }}
      renderItem={({ item }) => (
        <View style={styles.item}>
          {item.foto_registro ? (
            <Image source={{ uri: `${BACKEND_ORIGIN}${item.foto_registro}` }} style={styles.foto} />
          ) : (
            <View style={[styles.dot, item.tipo === 'entrada' ? styles.dotEntrada : styles.dotSaida]} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTipo}>{item.tipo === 'entrada' ? 'Entrada' : 'Saída'}</Text>
            <Text style={styles.itemData}>{formatarData(item.data_hora)}</Text>
            {item.endereco_aprox ? <Text style={styles.itemEndereco}>{item.endereco_aprox}</Text> : null}
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  empty: { textAlign: 'center', color: '#94a3b8', marginTop: 40, fontSize: 13 },
  item: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12,
    padding: 14, marginBottom: 10, alignItems: 'flex-start',
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5, marginRight: 12 },
  foto: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#e2e8f0' },
  dotEntrada: { backgroundColor: '#16a34a' },
  dotSaida: { backgroundColor: '#dc2626' },
  itemTipo: { fontWeight: '700', fontSize: 14, color: '#1e293b' },
  itemData: { fontSize: 12, color: '#64748b', marginTop: 2 },
  itemEndereco: { fontSize: 11, color: '#94a3b8', marginTop: 4 },
});
