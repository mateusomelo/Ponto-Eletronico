import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { FechamentoAPI } from '../api/fechamento';

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', enviado: 'Enviado', assinado: 'Assinado', rejeitado: 'Rejeitado', fechado: 'Fechado',
};
const STATUS_COLOR: Record<string, string> = {
  rascunho: '#94a3b8', enviado: '#f59e0b', assinado: '#10b981', rejeitado: '#ef4444', fechado: '#1e3a5f',
};
const PENDENCIA_LABEL: Record<string, string> = {
  colaborador: 'Aguardando colaborador', responsavel: 'Aguardando responsável',
};

function fmt(dt?: string) {
  return dt ? new Date(dt).toLocaleString('pt-BR') : '-';
}

export default function HistoricoAssinaturasScreen() {
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  async function carregar() {
    try {
      const data = await FechamentoAPI.historicoAssinaturas();
      setLista(data.historico || []);
    } catch { setLista([]); }
    finally { setCarregando(false); setAtualizando(false); }
  }

  useEffect(() => { carregar(); }, []);

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
      data={lista}
      keyExtractor={(item) => String(item.fechamento_id)}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
      contentContainerStyle={{ padding: 16 }}
      ListEmptyComponent={<Text style={styles.empty}>Nenhum fechamento encontrado.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.competencia}>{item.competencia}</Text>
            <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] || '#94a3b8' }]}>
              <Text style={styles.badgeText}>{STATUS_LABEL[item.status] || item.status}</Text>
            </View>
          </View>
          <Text style={styles.nome}>{item.usuario_nome}</Text>
          <View style={styles.linha}>
            <Text style={styles.label}>Colaborador:</Text>
            <Text style={styles.valor}>
              {item.colaborador_nome ? `${item.colaborador_nome} — ${fmt(item.colaborador_assinado_em)}` : '-'}
            </Text>
          </View>
          <View style={styles.linha}>
            <Text style={styles.label}>Responsável:</Text>
            <Text style={styles.valor}>
              {item.responsavel_nome ? `${item.responsavel_nome} — ${fmt(item.responsavel_assinado_em)}` : '-'}
            </Text>
          </View>
          {item.pendencia && (
            <View style={styles.pendBadge}>
              <Text style={styles.pendText}>{PENDENCIA_LABEL[item.pendencia]}</Text>
            </View>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  competencia: { fontWeight: '700', fontSize: 15, color: '#1e293b' },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 12 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  nome: { fontSize: 12, color: '#64748b', marginTop: 4, marginBottom: 8 },
  linha: { flexDirection: 'row', marginTop: 4 },
  label: { fontSize: 11, color: '#94a3b8', width: 90 },
  valor: { fontSize: 11, color: '#1e293b', flex: 1 },
  pendBadge: { marginTop: 8, alignSelf: 'flex-start', backgroundColor: '#fef3c7', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  pendText: { fontSize: 10, color: '#92400e', fontWeight: '600' },
});
