import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Usuario, UsuariosAPI } from '../api/admin';

export default function UsuariosScreen() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  async function carregar(termo?: string) {
    try {
      const data = await UsuariosAPI.listar({ busca: termo ?? busca, por_pagina: 50 });
      setUsuarios(data.usuarios || data.dados || data || []);
    } catch {
      setUsuarios([]);
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }

  useEffect(() => { carregar(); }, []);
  const onRefresh = useCallback(() => { setAtualizando(true); carregar(); }, [busca]);

  async function toggleBloqueio(u: Usuario) {
    try {
      await UsuariosAPI.bloquear(u.id);
      carregar();
    } catch (err: any) {
      Alert.alert('Erro', err?.data?.erro || 'Não foi possível alterar o usuário.');
    }
  }

  if (carregando) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Buscar por nome, e-mail ou CPF..."
        value={busca}
        onChangeText={setBusca}
        onSubmitEditing={() => carregar()}
        returnKeyType="search"
      />
      <FlatList
        data={usuarios}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum usuário encontrado.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nome}>{item.nome}</Text>
              <Text style={styles.email}>{item.email}</Text>
              <Text style={styles.cargo}>{item.cargo_nome}</Text>
            </View>
            <TouchableOpacity
              style={[styles.badge, item.bloqueado ? styles.badgeBloqueado : styles.badgeAtivo]}
              onPress={() => toggleBloqueio(item)}
            >
              <Text style={styles.badgeText}>{item.bloqueado ? 'Bloqueado' : 'Ativo'}</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  search: {
    margin: 16, marginBottom: 0, backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, borderWidth: 1, borderColor: '#e2e8f0',
  },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  nome: { fontWeight: '700', fontSize: 14, color: '#1e293b' },
  email: { fontSize: 12, color: '#64748b', marginTop: 2 },
  cargo: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  badge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16 },
  badgeAtivo: { backgroundColor: '#dcfce7' },
  badgeBloqueado: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 11, fontWeight: '600', color: '#1e293b' },
});
