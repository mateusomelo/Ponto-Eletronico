import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { PerfilAPI } from '../api/perfil';
import { ApiError } from '../api/client';
import { autenticarComBiometria, biometriaDisponivel } from '../api/biometria';

export default function PerfilScreen() {
  const { usuario, biometriaAtiva, alternarBiometria } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [temBiometria, setTemBiometria] = useState(false);

  useEffect(() => { biometriaDisponivel().then(setTemBiometria); }, []);

  async function alternarBiometriaToggle(ativar: boolean) {
    if (ativar) {
      const ok = await autenticarComBiometria();
      if (!ok) {
        Alert.alert('Não confirmado', 'Não foi possível confirmar sua biometria.');
        return;
      }
    }
    await alternarBiometria(ativar);
  }

  async function alterarSenha() {
    if (!senhaAtual || !novaSenha) {
      Alert.alert('Atenção', 'Preencha a senha atual e a nova senha.');
      return;
    }
    if (novaSenha.length < 8) {
      Alert.alert('Atenção', 'A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (novaSenha !== confirmar) {
      Alert.alert('Atenção', 'As senhas não coincidem.');
      return;
    }
    setSalvando(true);
    try {
      await PerfilAPI.alterarSenha(senhaAtual, novaSenha);
      Alert.alert('Sucesso', 'Senha alterada com sucesso.');
      setSenhaAtual(''); setNovaSenha(''); setConfirmar('');
    } catch (err) {
      const msg = err instanceof ApiError ? (err.data?.erro || 'Erro ao alterar senha.') : 'Erro de conexão.';
      Alert.alert('Erro', msg);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.avatar}>
        <Text style={styles.avatarLetra}>{usuario?.nome?.charAt(0).toUpperCase()}</Text>
      </View>
      <Text style={styles.nome}>{usuario?.nome}</Text>
      <Text style={styles.email}>{usuario?.email}</Text>
      <Text style={styles.cargo}>{usuario?.cargo_nome} · {usuario?.company_nome || 'Plataforma'}</Text>

      {temBiometria && (
        <View style={styles.card}>
          <View style={styles.bioRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bioLabel}>Login com biometria</Text>
              <Text style={styles.bioDesc}>Use Face ID ou digital para entrar mais rápido</Text>
            </View>
            <Switch value={biometriaAtiva} onValueChange={alternarBiometriaToggle} />
          </View>
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Alterar senha</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Senha atual</Text>
        <TextInput style={styles.input} secureTextEntry value={senhaAtual} onChangeText={setSenhaAtual} />
        <Text style={styles.label}>Nova senha</Text>
        <TextInput style={styles.input} secureTextEntry value={novaSenha} onChangeText={setNovaSenha} />
        <Text style={styles.label}>Confirmar nova senha</Text>
        <TextInput style={styles.input} secureTextEntry value={confirmar} onChangeText={setConfirmar} />

        <TouchableOpacity style={styles.btn} onPress={alterarSenha} disabled={salvando}>
          {salvando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Salvar nova senha</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: '#3b82f6',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 8,
  },
  avatarLetra: { color: '#fff', fontSize: 28, fontWeight: '700' },
  nome: { fontSize: 17, fontWeight: '700', color: '#1e293b', textAlign: 'center', marginTop: 10 },
  email: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  cargo: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  bioRow: { flexDirection: 'row', alignItems: 'center' },
  bioLabel: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  bioDesc: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  label: { fontSize: 12, color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
