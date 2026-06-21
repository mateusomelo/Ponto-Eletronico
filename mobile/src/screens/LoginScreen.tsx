import React, { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { ApiError } from '../api/client';
import CampoSenha from '../components/CampoSenha';

export default function LoginScreen({ navigation }: any) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  async function handleLogin() {
    if (!email || !senha) {
      setErro('Preencha e-mail e senha.');
      return;
    }
    setErro('');
    setCarregando(true);
    try {
      await login(email.trim(), senha, true);
    } catch (err) {
      if (err instanceof ApiError) setErro(err.data?.erro || 'Erro ao entrar.');
      else setErro('Erro de conexão com o servidor.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.logoBox}>
        <View style={styles.logoIcon}>
          <Text style={styles.logoIconText}>⏱</Text>
        </View>
        <Text style={styles.title}>Ponto Eletrônico</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>E-mail</Text>
        <TextInput
          style={styles.input}
          placeholder="seu@email.com"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Senha</Text>
        <CampoSenha placeholder="••••••••" value={senha} onChangeText={setSenha} />

        {erro ? <Text style={styles.erro}>{erro}</Text> : null}

        <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={carregando}>
          {carregando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Entrar</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('EsqueciSenha')}>
          <Text style={styles.link}>Esqueci a senha</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', padding: 24 },
  logoBox: { alignItems: 'center', marginBottom: 32 },
  logoIcon: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: '#1e3a5f',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  logoIconText: { fontSize: 26, color: '#fff' },
  title: { fontSize: 20, fontWeight: '700', color: '#1e293b' },
  form: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  label: { fontSize: 13, color: '#475569', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1e293b',
  },
  erro: { color: '#dc2626', marginTop: 12, fontSize: 13 },
  btn: {
    backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link: { color: '#3b82f6', textAlign: 'center', marginTop: 18, fontSize: 13 },
});
