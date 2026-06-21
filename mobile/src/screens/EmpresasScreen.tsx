import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { Empresa, EmpresasAPI, MetricasAPI } from '../api/superadmin';
import { useAuth } from '../contexts/AuthContext';

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa', trial: 'Em teste', past_due: 'Inadimplente', suspended: 'Suspensa',
};
const STATUS_COLOR: Record<string, string> = {
  active: '#10b981', trial: '#1d4ed8', past_due: '#d97706', suspended: '#ef4444',
};

export default function EmpresasScreen({ navigation }: any) {
  const { logout } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [metricas, setMetricas] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  async function carregar() {
    try {
      const [lista, m] = await Promise.all([EmpresasAPI.listar(), MetricasAPI.resumo()]);
      setEmpresas(lista || []);
      setMetricas(m);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar as empresas.');
    } finally {
      setCarregando(false); setAtualizando(false);
    }
  }

  useEffect(() => { carregar(); }, []);
  useEffect(() => {
    const unsub = navigation.addListener('focus', carregar);
    return unsub;
  }, [navigation]);

  const onRefresh = useCallback(() => { setAtualizando(true); carregar(); }, []);

  function mudarStatus(empresa: Empresa, status: Empresa['status']) {
    Alert.alert(
      'Confirmar', `Alterar "${empresa.nome}" para ${STATUS_LABEL[status]}?`,
      [{ text: 'Cancelar', style: 'cancel' }, {
        text: 'Confirmar',
        onPress: async () => {
          try { await EmpresasAPI.alterarStatus(empresa.id, status); carregar(); }
          catch { Alert.alert('Erro', 'Não foi possível alterar o status.'); }
        },
      }]
    );
  }

  function excluir(empresa: Empresa) {
    Alert.alert(
      'Excluir empresa', `Tem certeza que deseja excluir "${empresa.nome}"? Esta ação não pode ser desfeita.`,
      [{ text: 'Cancelar', style: 'cancel' }, {
        text: 'Excluir', style: 'destructive',
        onPress: async () => {
          try { await EmpresasAPI.excluir(empresa.id); carregar(); }
          catch { Alert.alert('Erro', 'Não foi possível excluir a empresa.'); }
        },
      }]
    );
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
      data={empresas}
      keyExtractor={(item) => String(item.id)}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} />}
      contentContainerStyle={{ padding: 16 }}
      ListHeaderComponent={() => (
        <View>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Super Admin — Plataforma</Text>
              <Text style={styles.subtitle}>{empresas.length} empresa(s) cadastrada(s)</Text>
            </View>
            <TouchableOpacity onPress={logout}>
              <FontAwesome5 name="sign-out-alt" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>

          {metricas && (
            <View style={styles.statsGrid}>
              <StatCard icone="building" cor="#3b82f6" valor={metricas.empresas?.total} label="Empresas" />
              <StatCard icone="check-circle" cor="#10b981" valor={metricas.empresas?.ativas} label="Ativas" />
              <StatCard icone="flask" cor="#1d4ed8" valor={metricas.empresas?.em_teste} label="Em teste" />
              <StatCard icone="clock" cor="#d97706" valor={metricas.empresas?.inadimplentes} label="Inadimplentes" />
              <StatCard icone="ban" cor="#ef4444" valor={metricas.empresas?.suspensas} label="Suspensas" />
              <StatCard icone="users" cor="#9333ea" valor={metricas.usuarios?.total} label="Usuários" />
            </View>
          )}

          <TouchableOpacity style={styles.btnNovo} onPress={() => navigation.navigate('EmpresaForm')}>
            <FontAwesome5 name="plus" size={13} color="#fff" />
            <Text style={styles.btnNovoText}>Nova Empresa</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnSecundario} onPress={() => navigation.navigate('SuperAdmins')}>
            <FontAwesome5 name="user-shield" size={13} color="#7c3aed" />
            <Text style={styles.btnSecundarioText}>Super Admins da Plataforma</Text>
          </TouchableOpacity>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.empty}>Nenhuma empresa cadastrada.</Text>}
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.empNome}>{item.nome}</Text>
            <View style={[styles.badge, { backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
              <Text style={[styles.badgeText, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
            </View>
          </View>
          <Text style={styles.empMeta}>{item.plano} · {item.total_usuarios || 0} usuário(s)</Text>

          <View style={styles.acoes}>
            <AcaoBtn icone="edit" label="Editar" onPress={() => navigation.navigate('EmpresaForm', { id: item.id })} />
            <AcaoBtn icone="users" label="Usuários" onPress={() => navigation.navigate('EmpresaUsuarios', { id: item.id, nome: item.nome })} />
            <AcaoBtn icone="dollar-sign" label="Pagamento" cor="#7c3aed" onPress={() => navigation.navigate('Assinatura', { id: item.id, nome: item.nome })} />
          </View>
          <View style={styles.acoes}>
            {item.status !== 'active' && <AcaoBtn icone="check" label="Ativar" cor="#10b981" onPress={() => mudarStatus(item, 'active')} />}
            {item.status !== 'suspended' && <AcaoBtn icone="ban" label="Suspender" cor="#d97706" onPress={() => mudarStatus(item, 'suspended')} />}
            <AcaoBtn icone="trash" label="Excluir" cor="#ef4444" onPress={() => excluir(item)} />
          </View>
        </View>
      )}
    />
  );
}

function StatCard({ icone, cor, valor, label }: { icone: string; cor: string; valor: any; label: string }) {
  return (
    <View style={styles.statCard}>
      <FontAwesome5 name={icone} size={16} color={cor} />
      <Text style={styles.statValue}>{valor ?? 0}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AcaoBtn({ icone, label, onPress, cor = '#475569' }: { icone: string; label: string; onPress: () => void; cor?: string }) {
  return (
    <TouchableOpacity style={styles.acaoBtn} onPress={onPress}>
      <FontAwesome5 name={icone} size={12} color={cor} />
      <Text style={[styles.acaoBtnText, { color: cor }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  title: { fontSize: 17, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 12, color: '#64748b', marginTop: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: { width: '31%', backgroundColor: '#fff', borderRadius: 10, padding: 10, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '800', color: '#1e293b', marginTop: 4 },
  statLabel: { fontSize: 10, color: '#64748b', marginTop: 2, textAlign: 'center' },
  btnNovo: {
    flexDirection: 'row', gap: 8, backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  btnNovoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSecundario: {
    flexDirection: 'row', gap: 8, borderWidth: 1, borderColor: '#ddd6fe', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  btnSecundarioText: { color: '#7c3aed', fontWeight: '700', fontSize: 13 },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  empNome: { fontSize: 14, fontWeight: '700', color: '#1e293b', flex: 1 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  empMeta: { fontSize: 11, color: '#94a3b8', marginTop: 2, marginBottom: 10 },
  acoes: { flexDirection: 'row', gap: 14, marginTop: 4 },
  acaoBtn: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  acaoBtnText: { fontSize: 11, fontWeight: '600' },
});
