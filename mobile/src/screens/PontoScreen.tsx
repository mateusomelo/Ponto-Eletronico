import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { PontoAPI, StatusPonto } from '../api/ponto';
import { enviarComprovante } from '../api/comprovante';
import { ApiError } from '../api/client';
import { enfileirar, getFila, sincronizarFila } from '../api/offlineQueue';

type GpsState = { lat: number; lng: number; precisao: number } | null;
type Etapa = 'normal' | 'camera' | 'preview' | 'sucesso';

export default function PontoScreen() {
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [gps, setGps] = useState<GpsState>(null);
  const [gpsMsg, setGpsMsg] = useState('Obtendo localização…');
  const [gpsErro, setGpsErro] = useState(false);
  const [status, setStatus] = useState<StatusPonto | null>(null);
  const [etapa, setEtapa] = useState<Etapa>('normal');
  const [fotoUri, setFotoUri] = useState<string | null>(null);
  const [ultimoTipo, setUltimoTipo] = useState<'entrada' | 'saida' | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [pendentes, setPendentes] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    carregarStatus();
    iniciarGPS();
    if (!camPerm?.granted) requestCamPerm();
    sincronizarPendentes();
    return () => { watchRef.current?.remove(); };
  }, []);

  async function sincronizarPendentes() {
    const filaAntes = await getFila();
    setPendentes(filaAntes.length);
    if (!filaAntes.length) return;
    const { enviados, restantes } = await sincronizarFila();
    setPendentes(restantes);
    if (enviados > 0) {
      carregarStatus();
      Alert.alert('Sincronizado', `${enviados} registro(s) pendente(s) enviado(s) com sucesso.`);
    }
  }

  async function carregarStatus() {
    try { setStatus(await PontoAPI.status()); } catch { /* mantém status anterior */ }
  }

  async function iniciarGPS() {
    const { status: permStatus } = await Location.requestForegroundPermissionsAsync();
    if (permStatus !== 'granted') {
      setGpsErro(true);
      setGpsMsg('GPS negado — habilite a localização para registrar');
      return;
    }

    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (pos) => {
        const acc = Math.round(pos.coords.accuracy ?? 9999);
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: pos.coords.accuracy ?? 0 });
        setGpsErro(false);

        if (acc <= 50) {
          setGpsMsg(`GPS preciso (±${acc}m)`);
          watchRef.current?.remove();
        } else if (acc <= 200) {
          setGpsMsg(`GPS obtido (±${acc}m)`);
        } else if (acc <= 1000) {
          setGpsMsg(`GPS impreciso (±${acc}m) — aguardando melhor sinal...`);
        } else {
          setGpsMsg(`Sinal de localização fraco (±${(acc / 1000).toFixed(1)}km). Registrando assim mesmo.`);
        }
      }
    );
  }

  function podeRegistrar() {
    return !!gps && !!camPerm?.granted && !!status;
  }

  function abrirCamera() {
    if (!gps) { Alert.alert('Aguarde', 'Aguarde a obtenção do GPS.'); return; }
    if (!camPerm?.granted) { Alert.alert('Câmera necessária', 'Autorize a câmera para registrar o ponto.'); return; }
    setEtapa('camera');
  }

  async function capturar() {
    if (!cameraRef.current) return;
    try {
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false });
      if (foto?.uri) {
        setFotoUri(foto.uri);
        setEtapa('preview');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível capturar a foto. Tente novamente.');
    }
  }

  async function confirmarEEnviar() {
    if (!fotoUri) return;
    await enviarRegistro(fotoUri);
  }

  async function enviarRegistro(uri: string | null) {
    if (!gps || !status) return;
    const tipo = status.proximo_registro;
    setEnviando(true);
    try {
      const resp = await PontoAPI.registrar({
        tipo, latitude: gps.lat, longitude: gps.lng, precisao: gps.precisao, fotoUri: uri,
      });
      watchRef.current?.remove();
      enviarComprovante(tipo, resp.registro).catch(() => {});
      await carregarStatus();
      setUltimoTipo(tipo);
      setEtapa('sucesso');
    } catch (err: any) {
      // Erro de rede (sem conexão) — guarda localmente e sincroniza depois.
      const semConexao = !(err instanceof ApiError) || err.status === 0;
      if (semConexao) {
        await enfileirar({ tipo, latitude: gps.lat, longitude: gps.lng, precisao: gps.precisao, fotoUri: uri });
        const fila = await getFila();
        setPendentes(fila.length);
        watchRef.current?.remove();
        setStatus({ ...status, no_trabalho: tipo === 'entrada', proximo_registro: tipo === 'entrada' ? 'saida' : 'entrada' });
        setUltimoTipo(tipo);
        setEtapa('sucesso');
        Alert.alert('Sem conexão', 'Registro salvo no dispositivo. Será enviado automaticamente quando a internet voltar.');
        return;
      }
      const msg = err instanceof ApiError ? (err.data?.erro || 'Erro ao registrar ponto.') : 'Erro inesperado.';
      Alert.alert('Erro', msg);
      setEtapa('normal');
    } finally {
      setEnviando(false);
    }
  }

  function finalizar() {
    setFotoUri(null);
    setEtapa('normal');
  }

  // ── Etapa: câmera ──────────────────────────────────────────
  if (etapa === 'camera') {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front" />
        <View style={styles.cameraControls}>
          <Text style={styles.cameraHint}>Posicione seu rosto no centro</Text>
          <TouchableOpacity style={styles.btnCapturar} onPress={capturar}>
            <Text style={styles.btnCapturarText}>Tirar Foto</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEtapa('normal')}>
            <Text style={styles.cancelar}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Etapa: confirmar foto capturada ─────────────────────────
  if (etapa === 'preview' && fotoUri) {
    return (
      <View style={styles.cameraContainer}>
        <Image source={{ uri: fotoUri }} style={styles.camera} resizeMode="cover" />
        <View style={styles.cameraControls}>
          <Text style={styles.cameraHint}>Confirmar esta foto?</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={[styles.btnCapturar, { backgroundColor: '#475569' }]}
              onPress={() => setEtapa('camera')}
              disabled={enviando}
            >
              <Text style={styles.btnCapturarText}>Tirar de novo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCapturar} onPress={confirmarEEnviar} disabled={enviando}>
              {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnCapturarText}>Confirmar</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Etapa: sucesso (mostra a foto enviada) ──────────────────
  if (etapa === 'sucesso') {
    return (
      <View style={styles.container}>
        <View style={styles.card}>
          {fotoUri && <Image source={{ uri: fotoUri }} style={styles.fotoSucesso} />}
          <Text style={styles.tituloSucesso}>
            {ultimoTipo === 'entrada' ? 'Entrada registrada!' : 'Saída registrada!'}
          </Text>
          <TouchableOpacity style={styles.btn} onPress={finalizar}>
            <Text style={styles.btnText}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Etapa: normal ────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Registro de Ponto</Text>

        <View style={[styles.statusBadge, status?.no_trabalho ? styles.badgeOn : styles.badgeOff]}>
          <Text style={styles.statusText}>{status?.no_trabalho ? 'Trabalhando' : 'Fora do trabalho'}</Text>
        </View>

        {pendentes > 0 && (
          <TouchableOpacity style={styles.pendBox} onPress={sincronizarPendentes}>
            <Text style={styles.pendText}>
              {pendentes} registro(s) pendente(s) de envio — tocar para tentar agora
            </Text>
          </TouchableOpacity>
        )}

        <View style={[styles.permBox, gpsErro && styles.permBoxErr]}>
          <Text style={[styles.permText, gpsErro && styles.permTextErr]}>{gpsMsg}</Text>
        </View>

        {!camPerm?.granted && (
          <View style={[styles.permBox, styles.permBoxErr]}>
            <Text style={styles.permTextErr}>Câmera não autorizada — obrigatória para registrar</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btn, !podeRegistrar() && styles.btnDisabled]}
          disabled={!podeRegistrar() || enviando}
          onPress={abrirCamera}
        >
          {enviando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>
              {status?.proximo_registro === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b', textAlign: 'center', marginBottom: 16 },
  statusBadge: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20, marginBottom: 16 },
  badgeOn: { backgroundColor: '#dcfce7' },
  badgeOff: { backgroundColor: '#fee2e2' },
  statusText: { fontWeight: '600', fontSize: 13, color: '#1e293b' },
  permBox: { backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 10 },
  permBoxErr: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  pendBox: { backgroundColor: '#fef3c7', borderRadius: 8, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#fde68a' },
  pendText: { fontSize: 11, color: '#92400e', textAlign: 'center' },
  permText: { fontSize: 12, color: '#475569', textAlign: 'center' },
  permTextErr: { color: '#dc2626' },
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnDisabled: { backgroundColor: '#94a3b8' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraControls: { padding: 24, backgroundColor: '#000', alignItems: 'center' },
  cameraHint: { color: '#fff', marginBottom: 16, fontSize: 13 },
  btnCapturar: { backgroundColor: '#3b82f6', borderRadius: 30, paddingVertical: 14, paddingHorizontal: 32 },
  btnCapturarText: { color: '#fff', fontWeight: '700' },
  cancelar: { color: '#fff', marginTop: 16, fontSize: 13 },
  fotoSucesso: { width: 140, height: 140, borderRadius: 70, alignSelf: 'center', marginBottom: 16, borderWidth: 3, borderColor: '#16a34a' },
  tituloSucesso: { fontSize: 17, fontWeight: '700', color: '#166534', textAlign: 'center', marginBottom: 20 },
});
