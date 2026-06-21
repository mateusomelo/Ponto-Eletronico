import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, RefreshControl, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { LogsAPI } from '../api/fechamento';

function formatarJson(valor: any): string | null {
  if (!valor) return null;
  try {
    if (typeof valor === 'object') return JSON.stringify(valor, null, 2);
    return JSON.stringify(JSON.parse(valor), null, 2);
  } catch {
    return String(valor);
  }
}

export default function LogsScreen() {
  const [logs, setLogs] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [detalhe, setDetalhe] = useState<any | null>(null);

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
    <>
      <FlatList
        style={styles.container}
        data={logs}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} />}
        contentContainerStyle={{ padding: 16 }}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum log encontrado.</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setDetalhe(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.acao}>{item.acao}</Text>
              <Text style={styles.detalhe}>{item.usuario_nome || 'Sistema'}</Text>
              {item.descricao ? <Text style={styles.descricao}>{item.descricao}</Text> : null}
              <Text style={styles.data}>{new Date(item.created_at).toLocaleString('pt-BR')}</Text>
            </View>
            <FontAwesome5 name="eye" size={16} color="#3b82f6" />
          </TouchableOpacity>
        )}
      />

      <Modal visible={!!detalhe} transparent animationType="fade" onRequestClose={() => setDetalhe(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView>
              <Text style={styles.modalTitle}>Detalhes do Log</Text>
              <Linha label="Ação" valor={detalhe?.acao} />
              <Linha label="Usuário" valor={detalhe?.usuario_nome || 'Sistema'} />
              <Linha label="Data/Hora" valor={detalhe ? new Date(detalhe.created_at).toLocaleString('pt-BR') : ''} />
              {detalhe?.descricao ? <Linha label="Descrição" valor={detalhe.descricao} /> : null}
              {detalhe?.user_agent ? <Linha label="Navegador" valor={detalhe.user_agent} /> : null}

              {formatarJson(detalhe?.dados_antes) && (
                <>
                  <Text style={styles.modalSection}>Dados Anteriores</Text>
                  <Text style={styles.modalJson}>{formatarJson(detalhe.dados_antes)}</Text>
                </>
              )}
              {formatarJson(detalhe?.dados_depois) && (
                <>
                  <Text style={styles.modalSection}>Dados Novos</Text>
                  <Text style={styles.modalJson}>{formatarJson(detalhe.dados_depois)}</Text>
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setDetalhe(null)}>
              <Text style={styles.modalBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Linha({ label, valor }: { label: string; valor?: string }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaLabel}>{label}</Text>
      <Text style={styles.linhaValor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  acao: { fontWeight: '700', fontSize: 13, color: '#1e293b' },
  detalhe: { fontSize: 11, color: '#64748b', marginTop: 2 },
  descricao: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  data: { fontSize: 10, color: '#cbd5e1', marginTop: 4 },
  olho: { fontSize: 18, marginLeft: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20, maxHeight: '80%' },
  modalTitle: { fontWeight: '700', fontSize: 16, marginBottom: 12 },
  modalSection: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginTop: 12, marginBottom: 6 },
  modalJson: {
    backgroundColor: '#f8faff', borderRadius: 6, padding: 10, fontSize: 11,
    fontFamily: 'monospace', color: '#1e293b',
  },
  linha: { marginBottom: 8 },
  linhaLabel: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  linhaValor: { fontSize: 13, color: '#1e293b' },
  modalBtn: { backgroundColor: '#3b82f6', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  modalBtnText: { color: '#fff', fontWeight: '700' },
});
