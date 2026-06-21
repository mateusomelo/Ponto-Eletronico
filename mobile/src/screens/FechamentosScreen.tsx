import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { FechamentoAPI } from '../api/fechamento';
import { useAuth } from '../contexts/AuthContext';

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', enviado: 'Enviado', assinado: 'Assinado',
  rejeitado: 'Rejeitado', fechado: 'Fechado',
};
const STATUS_COLOR: Record<string, string> = {
  rascunho: '#94a3b8', enviado: '#f59e0b', assinado: '#16a34a',
  rejeitado: '#dc2626', fechado: '#1e3a5f',
};

export default function FechamentosScreen({ navigation }: any) {
  const { usuario, hasPermission } = useAuth();
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [modalRejeitar, setModalRejeitar] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');

  async function carregar() {
    try {
      const data = await FechamentoAPI.listar({ por_pagina: 30 });
      setLista(data.fechamentos || []);
    } catch { setLista([]); }
    finally { setCarregando(false); setAtualizando(false); }
  }

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => carregar());
    return unsub;
  }, [navigation]);
  const onRefresh = useCallback(() => { setAtualizando(true); carregar(); }, []);

  async function assinar(id: number) {
    try {
      await FechamentoAPI.assinar(id);
      carregar();
    } catch (err: any) {
      Alert.alert('Erro', err?.data?.erro || 'Não foi possível assinar.');
    }
  }

  async function confirmarRejeitar() {
    if (!motivo.trim() || !modalRejeitar) return;
    try {
      await FechamentoAPI.rejeitar(modalRejeitar, motivo);
      setModalRejeitar(null);
      setMotivo('');
      carregar();
    } catch (err: any) {
      Alert.alert('Erro', err?.data?.erro || 'Não foi possível rejeitar.');
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
    <>
      {hasPermission('fechamento.criar') && (
        <TouchableOpacity style={styles.btnNovo} onPress={() => navigation.navigate('NovoFechamento')}>
          <Text style={styles.btnNovoText}>+ Novo Fechamento</Text>
        </TouchableOpacity>
      )}
      <FlatList
        style={styles.container}
        data={lista}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum fechamento encontrado.</Text>}
        renderItem={({ item }) => {
          const podeAssinar = item.status === 'enviado' && (usuario?.cargo_nivel ?? 99) >= 3
            ? item.usuario_id === usuario?.id : item.status === 'enviado';
          return (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.competencia}>{item.competencia}</Text>
                <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] || '#94a3b8' }]}>
                  <Text style={styles.badgeText}>{STATUS_LABEL[item.status] || item.status}</Text>
                </View>
              </View>
              <Text style={styles.nome}>{item.usuario_nome}</Text>
              {podeAssinar && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.btnAssinar} onPress={() => assinar(item.id)}>
                    <Text style={styles.btnText}>Assinar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnRejeitar} onPress={() => setModalRejeitar(item.id)}>
                    <Text style={styles.btnText}>Rejeitar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        }}
      />

      <Modal visible={!!modalRejeitar} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Motivo da rejeição</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Descreva o motivo..."
              value={motivo}
              onChangeText={setMotivo}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setModalRejeitar(null); setMotivo(''); }}>
                <Text style={styles.modalCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarRejeitar}>
                <Text style={styles.modalConfirm}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  btnNovo: { backgroundColor: '#3b82f6', margin: 16, marginBottom: 0, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnNovoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  competencia: { fontWeight: '700', fontSize: 15, color: '#1e293b' },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  nome: { fontSize: 12, color: '#64748b', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnAssinar: { flex: 1, backgroundColor: '#16a34a', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnRejeitar: { flex: 1, backgroundColor: '#dc2626', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontWeight: '700', fontSize: 15, marginBottom: 10 },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 14 },
  modalCancel: { color: '#64748b', fontWeight: '600' },
  modalConfirm: { color: '#dc2626', fontWeight: '700' },
});
