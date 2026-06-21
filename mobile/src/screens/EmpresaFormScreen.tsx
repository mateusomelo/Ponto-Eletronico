import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { EmpresasAPI } from '../api/superadmin';
import { ApiError } from '../api/client';

export default function EmpresaFormScreen({ route, navigation }: any) {
  const empresaId: number | undefined = route.params?.id;
  const editando = !!empresaId;

  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);

  const [nome, setNome] = useState('');
  const [nomeFantasia, setNomeFantasia] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [tipoDocumento, setTipoDocumento] = useState<'cnpj' | 'cpf'>('cnpj');
  const [documento, setDocumento] = useState('');
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [plano, setPlano] = useState<'basico' | 'profissional' | 'enterprise'>('basico');
  const [toleranciaDias, setToleranciaDias] = useState('3');
  const [trialDias, setTrialDias] = useState('0');

  useEffect(() => {
    navigation.setOptions({ title: editando ? 'Editar Empresa' : 'Nova Empresa' });
    if (editando) {
      (async () => {
        try {
          const e = await EmpresasAPI.obter(empresaId!);
          setNome(e.nome || '');
          setNomeFantasia(e.nome_fantasia || '');
          setRazaoSocial(e.razao_social || '');
          setTipoDocumento(e.tipo_documento || 'cnpj');
          setDocumento(e.documento || '');
          setEmail(e.email || '');
          setTelefone(e.telefone || '');
          setPlano(e.plano || 'basico');
          setToleranciaDias(String(e.tolerancia_dias ?? 3));
        } catch {
          Alert.alert('Erro', 'Não foi possível carregar os dados da empresa.');
        } finally {
          setCarregando(false);
        }
      })();
    }
  }, []);

  async function salvar() {
    if (!nome) {
      Alert.alert('Atenção', 'Informe o nome da empresa.');
      return;
    }
    const body: any = {
      nome, nome_fantasia: nomeFantasia || null, razao_social: razaoSocial || null,
      tipo_documento: tipoDocumento, documento: documento || null,
      email: email || null, telefone: telefone || null, plano,
      tolerancia_dias: toleranciaDias ? parseInt(toleranciaDias) : 3,
    };
    if (!editando) body.trial_dias = trialDias ? parseInt(trialDias) : 0;

    setSalvando(true);
    try {
      if (editando) await EmpresasAPI.editar(empresaId!, body);
      else await EmpresasAPI.criar(body);
      Alert.alert('Sucesso', editando ? 'Empresa atualizada.' : 'Empresa criada.');
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
        <Text style={styles.label}>Nome da Empresa *</Text>
        <TextInput style={styles.input} placeholderTextColor="#94a3b8" placeholder="Ex: Acme Ltda" value={nome} onChangeText={setNome} />

        <Text style={styles.label}>Nome Fantasia</Text>
        <TextInput style={styles.input} placeholderTextColor="#94a3b8" value={nomeFantasia} onChangeText={setNomeFantasia} />

        <Text style={styles.label}>Razão Social</Text>
        <TextInput style={styles.input} placeholderTextColor="#94a3b8" value={razaoSocial} onChangeText={setRazaoSocial} />

        <Text style={styles.label}>Tipo de Documento</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={tipoDocumento} onValueChange={setTipoDocumento}>
            <Picker.Item label="CNPJ" value="cnpj" />
            <Picker.Item label="CPF" value="cpf" />
          </Picker>
        </View>

        <Text style={styles.label}>{tipoDocumento === 'cnpj' ? 'CNPJ' : 'CPF'}</Text>
        <TextInput style={styles.input} placeholderTextColor="#94a3b8" value={documento} onChangeText={setDocumento} />

        <Text style={styles.label}>E-mail de contato</Text>
        <TextInput style={styles.input} placeholderTextColor="#94a3b8" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

        <Text style={styles.label}>Telefone</Text>
        <TextInput style={styles.input} placeholderTextColor="#94a3b8" value={telefone} onChangeText={setTelefone} keyboardType="phone-pad" />

        <Text style={styles.label}>Plano</Text>
        <View style={styles.pickerWrap}>
          <Picker selectedValue={plano} onValueChange={setPlano}>
            <Picker.Item label="Básico" value="basico" />
            <Picker.Item label="Profissional" value="profissional" />
            <Picker.Item label="Enterprise" value="enterprise" />
          </Picker>
        </View>

        <Text style={styles.label}>Tolerância (dias atraso)</Text>
        <TextInput style={styles.input} placeholderTextColor="#94a3b8" value={toleranciaDias} onChangeText={setToleranciaDias} keyboardType="numeric" />

        {!editando && (
          <>
            <Text style={styles.label}>Período de teste (dias, 0 = sem trial)</Text>
            <TextInput style={styles.input} placeholderTextColor="#94a3b8" value={trialDias} onChangeText={setTrialDias} keyboardType="numeric" />
          </>
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
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 20, marginBottom: 20 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
