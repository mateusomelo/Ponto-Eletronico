import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { API } from '../api/client';

export default function EsqueciSenhaScreen({ navigation }: any) {
  const [email, setEmail] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState('');

  async function handleSolicitar() {
    if (!email) return;
    setCarregando(true);
    setMensagem('');
    try {
      const data = await API.post('/auth/solicitar-reset', { email: email.trim() });
      setMensagem(data?.mensagem || 'Se o e-mail existir, você receberá as instruções.');
    } catch {
      setMensagem('Se o e-mail existir, você receberá as instruções.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.title}>Recuperar senha</Text>
        <Text style={styles.subtitle}>
          Informe seu e-mail cadastrado. Enviaremos um link para redefinir sua senha.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="seu@email.com"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        {mensagem ? <Text style={styles.msg}>{mensagem}</Text> : null}

        <TouchableOpacity style={styles.btn} onPress={handleSolicitar} disabled={carregando}>
          {carregando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Enviar instruções</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.link}>Voltar para o login</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', padding: 24 },
  form: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 19 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1e293b',
  },
  msg: { color: '#16a34a', marginTop: 14, fontSize: 13 },
  btn: {
    backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14,
    alignItems: 'center', marginTop: 20,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link: { color: '#3b82f6', textAlign: 'center', marginTop: 18, fontSize: 13 },
});
