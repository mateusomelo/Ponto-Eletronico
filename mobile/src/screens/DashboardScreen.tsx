import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DashboardAPI } from '../api/ponto';
import { useAuth } from '../contexts/AuthContext';

function Card({ label, value }: { label: string; value: number | string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen() {
  const { usuario } = useAuth();
  const [dados, setDados] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  async function carregar() {
    try { setDados(await DashboardAPI.resumo()); } catch { /* mantém anterior */ }
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

  const isAdmin = dados?.tipo === 'admin';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={atualizando} onRefresh={onRefresh} />}
    >
      <Text style={styles.greeting}>Olá, {usuario?.nome?.split(' ')[0]}</Text>
      <Text style={styles.subtitle}>{usuario?.cargo_nome} · {usuario?.company_nome || 'Plataforma'}</Text>

      <View style={styles.statsRow}>
        {isAdmin ? (
          <>
            <Card label="Usuários ativos" value={dados.usuarios_ativos} />
            <Card label="Presentes agora" value={dados.presentes_agora} />
          </>
        ) : (
          <>
            <Card label="Hoje" value={dados?.registros_hoje ?? 0} />
            <Card label="Dias no mês" value={dados?.dias_mes ?? 0} />
          </>
        )}
      </View>
      <View style={styles.statsRow}>
        <Card label="Esta semana" value={dados?.registros_semana ?? 0} />
        <Card label="Este mês" value={dados?.registros_mes ?? 0} />
      </View>

      <Text style={styles.sectionTitle}>{isAdmin ? 'Últimos registros (equipe)' : 'Seus últimos registros'}</Text>
      {(dados?.ultimos_pontos || []).slice(0, 8).map((p: any) => (
        <View key={p.id} style={styles.row}>
          <View style={[styles.dot, p.tipo === 'entrada' ? styles.dotEntrada : styles.dotSaida]} />
          <Text style={styles.rowText}>
            {isAdmin ? `${p.usuario_nome} · ` : ''}{p.tipo === 'entrada' ? 'Entrada' : 'Saída'} —{' '}
            {new Date(p.data_hora).toLocaleString('pt-BR')}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  greeting: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1e3a5f' },
  statLabel: { fontSize: 11, color: '#64748b', marginTop: 4, textAlign: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginTop: 16, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  dotEntrada: { backgroundColor: '#10b981' },
  dotSaida: { backgroundColor: '#ef4444' },
  rowText: { fontSize: 12, color: '#475569', flex: 1 },
});
