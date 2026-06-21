import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Cargo, CargosAPI } from '../api/admin';

export default function CargosScreen({ navigation }: any) {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  async function carregar() {
    try { setCargos(await CargosAPI.listar()); } catch { setCargos([]); }
    finally { setCarregando(false); setAtualizando(false); }
  }

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => carregar());
    return unsub;
  }, [navigation]);

  const onRefresh = useCallback(() => { setAtualizando(true); carregar(); }, []);

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.btnNovo} onPress={() => navigation.navigate('CargoForm', {})}>
        <Text style={styles.btnNovoText}>+ Novo Cargo</Text>
      </TouchableOpacity>
      <FlatList
        data={cargos}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum cargo cadastrado.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('CargoForm', { id: item.id })}>
            <View style={styles.cardHeader}>
              <Text style={styles.nome}>{item.nome}</Text>
              <Text style={styles.totalUsuarios}>{item.total_usuarios} usuário(s)</Text>
            </View>
            {item.descricao ? <Text style={styles.descricao}>{item.descricao}</Text> : null}
            <View style={styles.permsWrap}>
              {(item.permissoes || []).slice(0, 6).map((p) => (
                <View key={p.id} style={styles.permChip}>
                  <Text style={styles.permChipText}>{p.nome}</Text>
                </View>
              ))}
              {(item.permissoes || []).length > 6 && (
                <View style={styles.permChip}><Text style={styles.permChipText}>+{item.permissoes.length - 6}</Text></View>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  btnNovo: { backgroundColor: '#3b82f6', margin: 16, marginBottom: 0, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnNovoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  nome: { fontWeight: '700', fontSize: 15, color: '#1e293b' },
  totalUsuarios: { fontSize: 11, color: '#64748b' },
  descricao: { fontSize: 12, color: '#64748b', marginTop: 4 },
  permsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  permChip: { backgroundColor: '#eef2ff', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 8 },
  permChipText: { fontSize: 10, color: '#1e3a5f' },
});
