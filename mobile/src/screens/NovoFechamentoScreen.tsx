import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { FechamentoAPI } from '../api/fechamento';
import { ApiError } from '../api/client';

function competenciaAtual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function NovoFechamentoScreen({ navigation }: any) {
  const [competencia, setCompetencia] = useState(competenciaAtual());
  const [observacao, setObservacao] = useState('');
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  async function carregarUsuarios(comp: string) {
    setCarregando(true);
    try {
      const data = await FechamentoAPI.usuariosDisponiveis(comp);
      setUsuarios(data.usuarios || []);
    } catch {
      setUsuarios([]);
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarUsuarios(competencia); }, []);

  function alternar(id: number) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function salvar() {
    if (!selecionados.size) {
      Alert.alert('Atenção', 'Selecione pelo menos um funcionário.');
      return;
    }
    setSalvando(true);
    try {
      await FechamentoAPI.criar({ competencia, observacao, usuario_ids: [...selecionados] });
      Alert.alert('Sucesso', 'Fechamento(s) criado(s).');
      navigation.goBack();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.data?.erro || 'Erro ao criar.') : 'Erro de conexão.';
      Alert.alert('Erro', msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.label}>Competência (AAAA-MM)</Text>
        <TextInput
          style={styles.input}
          value={competencia}
          onChangeText={setCompetencia}
          onEndEditing={() => carregarUsuarios(competencia)}
          placeholder="2026-06"
        />
        <Text style={styles.label}>Observação (opcional)</Text>
        <TextInput style={styles.input} value={observacao} onChangeText={setObservacao} />
      </View>

      <Text style={styles.sectionTitle}>Funcionários ({selecionados.size} selecionado(s))</Text>

      {carregando ? (
        <ActivityIndicator color="#3b82f6" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={usuarios}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.empty}>Nenhum funcionário disponível.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.nome}>{item.nome}</Text>
                <Text style={styles.cargo}>{item.cargo_nome}</Text>
                {item.ja_tem_fechamento > 0 && <Text style={styles.jaTem}>Já tem fechamento nesta competência</Text>}
              </View>
              <Switch
                value={selecionados.has(item.id)}
                onValueChange={() => alternar(item.id)}
                disabled={item.ja_tem_fechamento > 0}
              />
            </View>
          )}
        />
      )}

      <TouchableOpacity style={styles.btn} onPress={salvar} disabled={salvando}>
        {salvando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Criar Fechamento</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, margin: 16, marginBottom: 0 },
  label: { fontSize: 12, color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#1e293b', margin: 16, marginBottom: 8 },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  nome: { fontWeight: '600', fontSize: 13, color: '#1e293b' },
  cargo: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  jaTem: { fontSize: 10, color: '#f59e0b', marginTop: 2 },
  btn: {
    backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center',
    margin: 16, position: 'absolute', bottom: 0, left: 0, right: 0,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
