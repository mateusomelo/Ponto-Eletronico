import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { FechamentoAPI } from '../api/fechamento';
import { useAuth } from '../contexts/AuthContext';
import PainelAssinatura, { PainelAssinaturaRef } from '../components/PainelAssinatura';

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', enviado: 'Enviado', assinado: 'Assinado',
  rejeitado: 'Rejeitado', fechado: 'Fechado',
};
const STATUS_COLOR: Record<string, string> = {
  rascunho: '#94a3b8', enviado: '#f59e0b', assinado: '#10b981',
  rejeitado: '#ef4444', fechado: '#1e3a5f',
};

export default function FechamentosScreen({ navigation }: any) {
  const { usuario, hasPermission } = useAuth();
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [modalRejeitar, setModalRejeitar] = useState<number | null>(null);
  const [motivo, setMotivo] = useState('');
  const [modalAssinar, setModalAssinar] = useState<{ id: number; acao: 'assinar' | 'fechar' } | null>(null);
  const [enviandoAssinatura, setEnviandoAssinatura] = useState(false);
  const painelRef = useRef<PainelAssinaturaRef>(null);

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

  async function confirmarAssinatura() {
    if (!modalAssinar) return;
    if (!painelRef.current?.temAssinatura()) {
      Alert.alert('Atenção', 'Desenhe sua assinatura antes de confirmar.');
      return;
    }
    setEnviandoAssinatura(true);
    try {
      const png = await painelRef.current.capturarPng();
      if (modalAssinar.acao === 'assinar') {
        await FechamentoAPI.assinar(modalAssinar.id, png);
      } else {
        await FechamentoAPI.fechar(modalAssinar.id, png);
      }
      setModalAssinar(null);
      carregar();
    } catch (err: any) {
      Alert.alert('Erro', err?.data?.erro || 'Não foi possível confirmar a assinatura.');
    } finally {
      setEnviandoAssinatura(false);
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
          const podeFechar = item.status === 'assinado' && hasPermission('fechamento.criar');
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
                  <TouchableOpacity style={styles.btnAssinar} onPress={() => setModalAssinar({ id: item.id, acao: 'assinar' })}>
                    <Text style={styles.btnText}>Assinar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnRejeitar} onPress={() => setModalRejeitar(item.id)}>
                    <Text style={styles.btnText}>Rejeitar</Text>
                  </TouchableOpacity>
                </View>
              )}
              {podeFechar && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.btnFechar} onPress={() => setModalAssinar({ id: item.id, acao: 'fechar' })}>
                    <Text style={styles.btnText}>Fechar Definitivamente</Text>
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

      <Modal visible={!!modalAssinar} transparent animationType="fade" onRequestClose={() => setModalAssinar(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>
              {modalAssinar?.acao === 'fechar' ? 'Assinatura do responsável' : 'Assine no campo abaixo'}
            </Text>
            {modalAssinar?.acao === 'fechar' && (
              <Text style={styles.modalHint}>
                Após confirmar, não será possível alterar registros neste período. O colaborador recebe uma cópia assinada por e-mail.
              </Text>
            )}
            <PainelAssinatura ref={painelRef} />
            <TouchableOpacity style={styles.btnLimpar} onPress={() => painelRef.current?.limpar()}>
              <Text style={styles.btnLimparText}>Limpar assinatura</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModalAssinar(null)}>
                <Text style={styles.modalCancel}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmarAssinatura} disabled={enviandoAssinatura}>
                {enviandoAssinatura
                  ? <ActivityIndicator color="#3b82f6" />
                  : <Text style={styles.modalConfirmAzul}>Confirmar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
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
  competencia: { fontWeight: '700', fontSize: 15, color: '#1e293b' },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  nome: { fontSize: 12, color: '#64748b', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  btnAssinar: { flex: 1, backgroundColor: '#10b981', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnRejeitar: { flex: 1, backgroundColor: '#ef4444', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnFechar: { flex: 1, backgroundColor: '#1e3a5f', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 12 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20 },
  modalTitle: { fontWeight: '700', fontSize: 15, marginBottom: 10 },
  modalHint: { fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 17 },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 10, minHeight: 80, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 20, marginTop: 14 },
  modalCancel: { color: '#64748b', fontWeight: '600' },
  modalConfirm: { color: '#ef4444', fontWeight: '700' },
  modalConfirmAzul: { color: '#3b82f6', fontWeight: '700' },
  btnLimpar: { alignSelf: 'flex-start', marginTop: 8 },
  btnLimparText: { color: '#94a3b8', fontSize: 12, fontWeight: '600' },
});
