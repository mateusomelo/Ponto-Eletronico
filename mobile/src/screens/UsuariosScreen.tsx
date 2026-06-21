import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Usuario, UsuariosAPI } from '../api/admin';

export default function UsuariosScreen({ navigation }: any) {
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

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => carregar());
    return unsub;
  }, [navigation]);

  const onRefresh = useCallback(() => { setAtualizando(true); carregar(); }, [busca]);

  async function toggleBloqueio(u: Usuario) {
    try {
      await UsuariosAPI.bloquear(u.id);
      carregar();
    } catch (err: any) {
      Alert.alert('Erro', err?.data?.erro || 'Não foi possível alterar o usuário.');
    }
  }

  function confirmarExcluir(u: Usuario) {
    Alert.alert('Excluir usuário', `Tem certeza que deseja excluir ${u.nome}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        try {
          await UsuariosAPI.excluir(u.id);
          carregar();
        } catch (err: any) {
          Alert.alert('Erro', err?.data?.erro || 'Não foi possível excluir.');
        }
      } },
    ]);
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
      <TouchableOpacity style={styles.btnNovo} onPress={() => navigation.navigate('UsuarioForm', {})}>
        <Text style={styles.btnNovoText}>+ Novo Usuário</Text>
      </TouchableOpacity>
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
          <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('UsuarioForm', { id: item.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nome}>{item.nome}</Text>
              <Text style={styles.email}>{item.email}</Text>
              <Text style={styles.cargo}>{item.cargo_nome}</Text>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <TouchableOpacity
                style={[styles.badge, item.bloqueado ? styles.badgeBloqueado : styles.badgeAtivo]}
                onPress={() => toggleBloqueio(item)}
              >
                <Text style={styles.badgeText}>{item.bloqueado ? 'Bloqueado' : 'Ativo'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmarExcluir(item)}>
                <Text style={styles.linkExcluir}>Excluir</Text>
              </TouchableOpacity>
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
  linkExcluir: { fontSize: 11, color: '#ef4444', fontWeight: '600' },
});
