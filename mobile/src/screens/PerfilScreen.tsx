import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useAuth } from '../contexts/AuthContext';
import { PerfilAPI } from '../api/perfil';
import { ApiError, API_BASE } from '../api/client';
import * as LocalAuthentication from 'expo-local-authentication';
import { autenticarComBiometria } from '../api/biometria';
import CampoSenha from '../components/CampoSenha';

const BACKEND_ORIGIN = API_BASE.replace(/\/api$/, '');

type BioStatus = 'verificando' | 'sem_hardware' | 'sem_cadastro' | 'ok' | 'erro';

export default function PerfilScreen() {
  const { usuario, biometriaAtiva, alternarBiometria, refreshUsuario } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [bioStatus, setBioStatus] = useState<BioStatus>('verificando');
  const [bioErro, setBioErro] = useState('');

  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [modoCamera, setModoCamera] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const cameraRef = React.useRef<CameraView>(null);

  useEffect(() => {
    (async () => {
      try {
        const temHardware = await LocalAuthentication.hasHardwareAsync();
        if (!temHardware) { setBioStatus('sem_hardware'); return; }
        const temCadastro = await LocalAuthentication.isEnrolledAsync();
        setBioStatus(temCadastro ? 'ok' : 'sem_cadastro');
      } catch (err: any) {
        setBioStatus('erro');
        setBioErro(err?.message || String(err));
      }
    })();
  }, []);

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

  async function tocarAvatar() {
    if (!camPerm?.granted) {
      const r = await requestCamPerm();
      if (!r.granted) { Alert.alert('Permissão necessária', 'Autorize a câmera para alterar sua foto.'); return; }
    }
    setModoCamera(true);
  }

  async function capturarFoto() {
    if (!cameraRef.current) return;
    setEnviandoFoto(true);
    try {
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.6 });
      setModoCamera(false);
      if (foto?.uri) {
        await PerfilAPI.uploadFoto(foto.uri);
        await refreshUsuario();
        Alert.alert('Sucesso', 'Foto de perfil atualizada.');
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.message || 'Não foi possível atualizar a foto.');
    } finally {
      setEnviandoFoto(false);
    }
  }

  if (modoCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front" />
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.btnCapturar} onPress={capturarFoto} disabled={enviandoFoto}>
            {enviandoFoto ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnCapturarText}>Tirar Foto</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setModoCamera(false)}>
            <Text style={styles.cancelar}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <TouchableOpacity onPress={tocarAvatar} style={styles.avatar}>
        {usuario?.foto ? (
          <Image source={{ uri: `${BACKEND_ORIGIN}${usuario.foto}?t=${Date.now()}` }} style={styles.avatarImg} />
        ) : (
          <Text style={styles.avatarLetra}>{usuario?.nome?.charAt(0).toUpperCase()}</Text>
        )}
        <View style={styles.avatarOverlay}><Text style={styles.avatarOverlayText}>📷</Text></View>
      </TouchableOpacity>
      <Text style={styles.nome}>{usuario?.nome}</Text>
      <Text style={styles.email}>{usuario?.email}</Text>
      <Text style={styles.cargo}>{usuario?.cargo_nome} · {usuario?.company_nome || 'Plataforma'}</Text>

      <View style={styles.card}>
        <View style={styles.bioRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bioLabel}>Login com biometria</Text>
            {bioStatus === 'ok' && <Text style={styles.bioDesc}>Use Face ID ou digital para entrar mais rápido</Text>}
            {bioStatus === 'verificando' && <Text style={styles.bioDesc}>Verificando disponibilidade…</Text>}
            {bioStatus === 'sem_hardware' && <Text style={styles.bioDescErro}>Este dispositivo não tem sensor biométrico.</Text>}
            {bioStatus === 'sem_cadastro' && (
              <Text style={styles.bioDescErro}>Nenhuma digital/Face ID cadastrado no celular. Cadastre nas configurações do Android primeiro.</Text>
            )}
            {bioStatus === 'erro' && <Text style={styles.bioDescErro}>Erro ao verificar biometria: {bioErro}</Text>}
          </View>
          <Switch value={biometriaAtiva} onValueChange={alternarBiometriaToggle} disabled={bioStatus !== 'ok'} />
        </View>
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Alterar senha</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Senha atual</Text>
        <CampoSenha value={senhaAtual} onChangeText={setSenhaAtual} />
        <Text style={styles.label}>Nova senha</Text>
        <CampoSenha value={novaSenha} onChangeText={setNovaSenha} />
        <Text style={styles.label}>Confirmar nova senha</Text>
        <CampoSenha value={confirmar} onChangeText={setConfirmar} />

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
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 8, overflow: 'hidden',
  },
  avatarImg: { width: 72, height: 72, borderRadius: 36 },
  avatarLetra: { color: '#fff', fontSize: 28, fontWeight: '700' },
  avatarOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 22,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center',
  },
  avatarOverlayText: { fontSize: 11 },
  nome: { fontSize: 17, fontWeight: '700', color: '#1e293b', textAlign: 'center', marginTop: 10 },
  email: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  cargo: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  bioRow: { flexDirection: 'row', alignItems: 'center' },
  bioLabel: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
  bioDesc: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  bioDescErro: { fontSize: 11, color: '#dc2626', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  label: { fontSize: 12, color: '#475569', marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b' },
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraControls: { padding: 24, backgroundColor: '#000', alignItems: 'center' },
  btnCapturar: { backgroundColor: '#3b82f6', borderRadius: 30, paddingVertical: 14, paddingHorizontal: 40 },
  btnCapturarText: { color: '#fff', fontWeight: '700' },
  cancelar: { color: '#fff', marginTop: 16, fontSize: 13 },
});
