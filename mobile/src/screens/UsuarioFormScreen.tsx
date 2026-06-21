import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { CargosAPI, Cargo, UsuariosAPI } from '../api/admin';
import { ApiError } from '../api/client';
import CampoSenha from '../components/CampoSenha';

export default function UsuarioFormScreen({ route, navigation }: any) {
  const usuarioId: number | undefined = route.params?.id;
  const editando = !!usuarioId;

  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [cargoId, setCargoId] = useState<number | null>(null);
  const [senha, setSenha] = useState('');
  const [salario, setSalario] = useState('');
  const [cargaHoraria, setCargaHoraria] = useState('40');
  const [ativo, setAtivo] = useState(true);

  useEffect(() => {
    navigation.setOptions({ title: editando ? 'Editar Usuário' : 'Novo Usuário' });
    (async () => {
      try {
        const listaCargos = await CargosAPI.listar();
        setCargos(listaCargos);
        if (editando) {
          const u = await UsuariosAPI.obter(usuarioId!);
          setNome(u.nome || '');
          setEmail(u.email || '');
          setCpf(u.cpf || '');
          setTelefone(u.telefone || '');
          setCargoId(u.cargo_id);
          setSalario(u.salario_mensal != null ? String(u.salario_mensal) : '');
          setCargaHoraria(u.carga_horaria_semanal != null ? String(u.carga_horaria_semanal) : '40');
          setAtivo(!!u.ativo);
        } else if (listaCargos.length) {
          setCargoId(listaCargos[listaCargos.length - 1].id);
        }
      } catch {
        Alert.alert('Erro', 'Não foi possível carregar os dados.');
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  async function salvar() {
    if (!nome || !email || !cpf || !cargoId) {
      Alert.alert('Atenção', 'Preencha nome, e-mail, CPF e cargo.');
      return;
    }
    if (!editando && (!senha || senha.length < 8)) {
      Alert.alert('Atenção', 'Senha é obrigatória e deve ter no mínimo 8 caracteres.');
      return;
    }

    const body: any = {
      nome, email, cpf, telefone: telefone || null, cargo_id: cargoId,
      salario_mensal: salario ? parseFloat(salario) : null,
      carga_horaria_semanal: cargaHoraria ? parseFloat(cargaHoraria) : 40,
    };
    if (!editando) body.senha = senha;
    if (editando) body.ativo = ativo;

    setSalvando(true);
    try {
      if (editando) {
        await UsuariosAPI.editar(usuarioId!, body);
      } else {
        await UsuariosAPI.criar(body);
      }
      Alert.alert('Sucesso', editando ? 'Usuário atualizado.' : 'Usuário criado.');
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
        <Text style={styles.label}>Nome completo</Text>
        <TextInput style={styles.input} value={nome} onChangeText={setNome} />

        <Text style={styles.label}>E-mail</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

        <Text style={styles.label}>CPF</Text>
        <TextInput style={styles.input} value={cpf} onChangeText={setCpf} />

        <Text style={styles.label}>Telefone</Text>
        <TextInput style={styles.input} value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" />

        <Text style={styles.label}>Cargo</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={cargoId} onValueChange={setCargoId}>
            {cargos.map((c) => <Picker.Item key={c.id} label={c.nome} value={c.id} />)}
          </Picker>
        </View>

        {!editando && (
          <>
            <Text style={styles.label}>Senha (mín. 8 caracteres)</Text>
            <CampoSenha value={senha} onChangeText={setSenha} />
          </>
        )}

        <Text style={styles.label}>Salário mensal (opcional)</Text>
        <TextInput style={styles.input} value={salario} onChangeText={setSalario} keyboardType="numeric" />

        <Text style={styles.label}>Carga horária semanal</Text>
        <TextInput style={styles.input} value={cargaHoraria} onChangeText={setCargaHoraria} keyboardType="numeric" />

        {editando && (
          <View style={styles.row}>
            <Text style={styles.label}>Ativo</Text>
            <Switch value={ativo} onValueChange={setAtivo} />
          </View>
        )}

        <TouchableOpacity style={styles.btn} onPress={salvar} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Salvar</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  label: { fontSize: 12, color: '#475569', marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b' },
  pickerWrap: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
