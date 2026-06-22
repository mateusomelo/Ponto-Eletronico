import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NotificacoesAPI, Notificacao } from '../api/notificacoes';
import { useAuth } from '../contexts/AuthContext';

const TIPO_ICON: Record<string, string> = {
  sistema: 'info-circle', fechamento: 'file-signature',
  alerta: 'exclamation-triangle', sucesso: 'check-circle', erro: 'times-circle',
};
const TIPO_COLOR: Record<string, string> = {
  sistema: '#1e40af', fechamento: '#1e40af',
  alerta: '#92400e', sucesso: '#166534', erro: '#991b1b',
};
const TIPO_BG: Record<string, string> = {
  sistema: '#dbeafe', fechamento: '#dbeafe',
  alerta: '#fef3c7', sucesso: '#dcfce7', erro: '#fee2e2',
};

function fmt(dt: string) {
  return new Date(dt).toLocaleString('pt-BR');
}

export default function NotificacoesScreen() {
  const navigation = useNavigation<any>();
  const { isSupervisor } = useAuth();
  const [lista, setLista] = useState<Notificacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  async function carregar() {
    try {
      const data = await NotificacoesAPI.listar();
      setLista(data.notificacoes || []);
    } catch { setLista([]); }
    finally { setCarregando(false); setAtualizando(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function abrirNotificacao(n: Notificacao) {
    try { await NotificacoesAPI.marcarLida(n.id); } catch {}
    if (n.fechamento_id) {
      navigation.navigate(isSupervisor() ? 'Fechamentos' : 'Relatorios');
    } else {
      carregar();
    }
  }

  async function marcarTodasLidas() {
    try { await NotificacoesAPI.marcarTodasLidas(); carregar(); } catch {}
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
      <TouchableOpacity style={styles.marcarTodas} onPress={marcarTodasLidas}>
        <FontAwesome5 name="check-double" size={12} color="#3b82f6" />
        <Text style={styles.marcarTodasText}>Marcar todas como lidas</Text>
      </TouchableOpacity>

      <FlatList
        data={lista}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => { setAtualizando(true); carregar(); }} />}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <FontAwesome5 name="bell-slash" size={28} color="#cbd5e1" />
            <Text style={styles.empty}>Nenhuma notificação por aqui.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={[styles.card, !item.lida && styles.cardUnread]} onPress={() => abrirNotificacao(item)}>
            <View style={[styles.icon, { backgroundColor: TIPO_BG[item.tipo] || '#dbeafe' }]}>
              <FontAwesome5 name={TIPO_ICON[item.tipo] || 'bell'} size={15} color={TIPO_COLOR[item.tipo] || '#1e40af'} />
            </View>
            <View style={styles.body}>
              <Text style={styles.titulo}>{item.titulo}</Text>
              {item.mensagem ? <Text style={styles.msg}>{item.mensagem}</Text> : null}
              <Text style={styles.data}>{fmt(item.created_at)}</Text>
            </View>
            {!item.lida && <View style={styles.dot} />}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  marcarTodas: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginRight: 16, marginTop: 12 },
  marcarTodasText: { color: '#3b82f6', fontSize: 12, fontWeight: '600' },
  emptyBox: { alignItems: 'center', marginTop: 60 },
  empty: { color: '#94a3b8', fontSize: 13, marginTop: 10 },
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
  },
  cardUnread: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  titulo: { fontSize: 13.5, fontWeight: '700', color: '#1e293b' },
  msg: { fontSize: 12.5, color: '#64748b', marginTop: 2 },
  data: { fontSize: 10.5, color: '#94a3b8', marginTop: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3b82f6', marginTop: 5 },
});
