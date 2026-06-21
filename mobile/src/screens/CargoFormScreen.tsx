import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { CargosAPI, Permissao } from '../api/admin';
import { ApiError } from '../api/client';

export default function CargoFormScreen({ route, navigation }: any) {
  const cargoId: number | undefined = route.params?.id;
  const editando = !!cargoId;

  const [permissoesTodas, setPermissoesTodas] = useState<Permissao[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [nivel, setNivel] = useState(3);

  useEffect(() => {
    navigation.setOptions({ title: editando ? 'Editar Cargo' : 'Novo Cargo' });
    (async () => {
      try {
        const todas = await CargosAPI.listarPermissoes();
        setPermissoesTodas(todas);
        if (editando) {
          const c = await CargosAPI.obter(cargoId!);
          setNome(c.nome || '');
          setDescricao(c.descricao || '');
          setNivel(c.nivel || 3);
          setSelecionadas(new Set((c.permissoes || []).map((p) => p.id)));
        }
      } catch {
        Alert.alert('Erro', 'Não foi possível carregar os dados.');
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  function alternarPermissao(id: number) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function salvar() {
    if (!nome) {
      Alert.alert('Atenção', 'Informe o nome do cargo.');
      return;
    }
    const body = { nome, descricao, nivel, permissoes: [...selecionadas] };
    setSalvando(true);
    try {
      if (editando) await CargosAPI.editar(cargoId!, body);
      else await CargosAPI.criar(body);
      Alert.alert('Sucesso', editando ? 'Cargo atualizado.' : 'Cargo criado.');
      navigation.goBack();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.data?.erro || 'Erro ao salvar.') : 'Erro de conexão.';
      Alert.alert('Erro', msg);
    } finally {
      setSalvando(false);
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
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.label}>Nome do cargo</Text>
        <TextInput style={styles.input} value={nome} onChangeText={setNome} />

        <Text style={styles.label}>Descrição</Text>
        <TextInput style={styles.input} value={descricao} onChangeText={setDescricao} />

        <Text style={styles.label}>Nível (1 = mais alto)</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={nivel} onValueChange={setNivel}>
            <Picker.Item label="1 — Administrador" value={1} />
            <Picker.Item label="2 — Supervisor" value={2} />
            <Picker.Item label="3 — Funcionário" value={3} />
          </Picker>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Permissões</Text>
      <View style={styles.card}>
        {permissoesTodas.map((p) => (
          <View key={p.id} style={styles.permRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.permNome}>{p.nome}</Text>
              {p.descricao ? <Text style={styles.permDesc}>{p.descricao}</Text> : null}
            </View>
            <Switch value={selecionadas.has(p.id)} onValueChange={() => alternarPermissao(p.id)} />
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.btn} onPress={salvar} disabled={salvando}>
        {salvando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Salvar</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  label: { fontSize: 12, color: '#475569', marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b' },
  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginTop: 16, marginBottom: 8 },
  permRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  permNome: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  permDesc: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20, marginBottom: 30 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
