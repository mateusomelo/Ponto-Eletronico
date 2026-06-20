import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { useAuth } from '../contexts/AuthContext';
import { PontoAPI, StatusPonto } from '../api/ponto';
import { enviarComprovante } from '../api/comprovante';
import { ApiError } from '../api/client';

type GpsState = { lat: number; lng: number; precisao: number } | null;

export default function PontoScreen() {
  const { usuario } = useAuth();
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [gps, setGps] = useState<GpsState>(null);
  const [gpsMsg, setGpsMsg] = useState('Obtendo localização…');
  const [gpsErro, setGpsErro] = useState(false);
  const [status, setStatus] = useState<StatusPonto | null>(null);
  const [modoCamera, setModoCamera] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    carregarStatus();
    iniciarGPS();
    if (!camPerm?.granted) requestCamPerm();
    return () => { watchRef.current?.remove(); };
  }, []);

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
    setModoCamera(true);
  }

  async function capturarEEnviar() {
    if (!cameraRef.current || !status || !gps) return;
    try {
      const foto = await cameraRef.current.takePictureAsync({ quality: 0.6, base64: false });
      setModoCamera(false);
      await enviarRegistro(foto?.uri ?? null);
    } catch {
      Alert.alert('Erro', 'Não foi possível capturar a foto. Tente novamente.');
    }
  }

  async function enviarRegistro(fotoUri: string | null) {
    if (!gps || !status) return;
    const tipo = status.proximo_registro;
    setEnviando(true);
    try {
      const resp = await PontoAPI.registrar({
        tipo, latitude: gps.lat, longitude: gps.lng, precisao: gps.precisao, fotoUri,
      });
      watchRef.current?.remove();
      if (usuario) enviarComprovante(tipo, resp.registro, usuario).catch(() => {});
      await carregarStatus();
      Alert.alert('Sucesso', resp.mensagem || 'Ponto registrado com sucesso.');
    } catch (err: any) {
      const msg = err instanceof ApiError
        ? (err.data?.erro || 'Erro ao registrar ponto.')
        : `Erro inesperado: ${err?.message || String(err)}`;
      Alert.alert('Erro', msg);
    } finally {
      setEnviando(false);
    }
  }

  if (modoCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView ref={cameraRef} style={styles.camera} facing="front" />
        <View style={styles.cameraControls}>
          <Text style={styles.cameraHint}>Posicione seu rosto no centro</Text>
          <TouchableOpacity style={styles.btnCapturar} onPress={capturarEEnviar} disabled={enviando}>
            {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnCapturarText}>Tirar Foto</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setModoCamera(false)}>
            <Text style={styles.cancelar}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Registro de Ponto</Text>

        <View style={[styles.statusBadge, status?.no_trabalho ? styles.badgeOn : styles.badgeOff]}>
          <Text style={styles.statusText}>{status?.no_trabalho ? 'Trabalhando' : 'Fora do trabalho'}</Text>
        </View>

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
  permText: { fontSize: 12, color: '#475569', textAlign: 'center' },
  permTextErr: { color: '#dc2626' },
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  btnDisabled: { backgroundColor: '#94a3b8' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraControls: { padding: 24, backgroundColor: '#000', alignItems: 'center' },
  cameraHint: { color: '#fff', marginBottom: 16, fontSize: 13 },
  btnCapturar: { backgroundColor: '#3b82f6', borderRadius: 30, paddingVertical: 14, paddingHorizontal: 40 },
  btnCapturarText: { color: '#fff', fontWeight: '700' },
  cancelar: { color: '#fff', marginTop: 16, fontSize: 13 },
});
