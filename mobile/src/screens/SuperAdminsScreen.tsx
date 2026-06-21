import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { SuperAdminsAPI } from '../api/superadmin';
import { ApiError } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import CampoSenha from '../components/CampoSenha';

export default function SuperAdminsScreen() {
  const { usuario } = useAuth();
  const [lista, setLista] = useState<any[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modalAberto, setModalAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    try { setLista(await SuperAdminsAPI.listar()); }
    catch { Alert.alert('Erro', 'Não foi possível carregar os super admins.'); }
    finally { setCarregando(false); }
  }

  async function criar() {
    if (!nome || !email || !senha) {
      Alert.alert('Atenção', 'Preencha nome, e-mail e senha.');
      return;
    }
    setSalvando(true);
    try {
      await SuperAdminsAPI.criar({ nome, email, senha });
      setModalAberto(false);
      setNome(''); setEmail(''); setSenha('');
      carregar();
    } catch (err) {
      const msg = err instanceof ApiError ? (err.data?.erro || 'Erro ao criar.') : 'Erro de conexão.';
      Alert.alert('Erro', msg);
    } finally {
      setSalvando(false);
    }
  }

  function excluir(item: any) {
    if (item.id === usuario?.id) {
      Alert.alert('Atenção', 'Você não pode excluir sua própria conta.');
      return;
    }
    Alert.alert(
      'Excluir super admin', `Remover "${item.nome}"?`,
      [{ text: 'Cancelar', style: 'cancel' }, {
        text: 'Excluir', style: 'destructive',
        onPress: async () => {
          try { await SuperAdminsAPI.excluir(item.id); carregar(); }
          catch { Alert.alert('Erro', 'Não foi possível excluir.'); }
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
    <>
      <FlatList
        style={styles.container}
        data={lista}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        ListEmptyComponent={<Text style={styles.empty}>Nenhum super admin cadastrado.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <FontAwesome5 name="user-shield" size={16} color="#7c3aed" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.nome}>{item.nome}</Text>
              <Text style={styles.meta}>{item.email}</Text>
            </View>
            <TouchableOpacity onPress={() => excluir(item)}>
              <FontAwesome5 name="trash" size={14} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      />

      <TouchableOpacity style={styles.btnNovo} onPress={() => setModalAberto(true)}>
        <FontAwesome5 name="user-plus" size={14} color="#fff" />
        <Text style={styles.btnNovoText}>Novo Super Admin</Text>
      </TouchableOpacity>

      <Modal visible={modalAberto} transparent animationType="fade" onRequestClose={() => setModalAberto(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <ScrollView>
              <Text style={styles.modalTitle}>Novo Super Admin</Text>
              <Text style={styles.label}>Nome</Text>
              <TextInput style={styles.input} placeholderTextColor="#94a3b8" value={nome} onChangeText={setNome} />
              <Text style={styles.label}>E-mail</Text>
              <TextInput style={styles.input} placeholderTextColor="#94a3b8" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
              <Text style={styles.label}>Senha</Text>
              <CampoSenha value={senha} onChangeText={setSenha} />

              <View style={styles.modalAcoes}>
                <TouchableOpacity style={styles.btnCancelar} onPress={() => setModalAberto(false)}>
                  <Text style={styles.btnCancelarText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnCriar} onPress={criar} disabled={salvando}>
                  {salvando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnCriarText}>Criar</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  empty: { color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 20 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8 },
  nome: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  meta: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  btnNovo: {
    position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: '#7c3aed', borderRadius: 10,
    paddingVertical: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center',
  },
  btnNovoText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 14, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  label: { fontSize: 12, color: '#475569', marginBottom: 4, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b' },
  modalAcoes: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnCancelar: { flex: 1, borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnCancelarText: { color: '#475569', fontWeight: '600' },
  btnCriar: { flex: 1, backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  btnCriarText: { color: '#fff', fontWeight: '700' },
});
