import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { ConfiguracoesAPI } from '../api/admin';

type ConfigMap = Record<string, { valor: string; descricao: string }>;

const BOOL_KEYS = ['gps_obrigatorio', 'foto_obrigatoria_mobile'];

export default function ConfiguracoesScreen() {
  const [config, setConfig] = useState<ConfigMap>({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    ConfiguracoesAPI.obter().then(setConfig).catch(() => setConfig({})).finally(() => setCarregando(false));
  }, []);

  function setValor(chave: string, valor: string) {
    setConfig((prev) => ({ ...prev, [chave]: { ...prev[chave], valor } }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      const updates: Record<string, string> = {};
      Object.entries(config).forEach(([chave, v]) => { updates[chave] = v.valor; });
      await ConfiguracoesAPI.salvar(updates);
      Alert.alert('Sucesso', 'Configurações salvas.');
    } catch (err: any) {
      Alert.alert('Erro', err?.data?.erro || 'Não foi possível salvar.');
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

  const chaves = Object.keys(config).filter((k) => !k.startsWith('emailjs_') && !k.startsWith('comprovante_'));

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.title}>Configurações</Text>
      {chaves.map((chave) => {
        const item = config[chave];
        const isBool = BOOL_KEYS.includes(chave);
        return (
          <View key={chave} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>{chave}</Text>
              {item.descricao ? <Text style={styles.desc}>{item.descricao}</Text> : null}
            </View>
            {isBool ? (
              <Switch
                value={item.valor === 'true'}
                onValueChange={(v) => setValor(chave, v ? 'true' : 'false')}
              />
            ) : (
              <TextInput
                style={styles.input}
                value={item.valor}
                onChangeText={(v) => setValor(chave, v)}
              />
            )}
          </View>
        );
      })}

      <TouchableOpacity style={styles.btn} onPress={salvar} disabled={salvando}>
        {salvando ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Salvar alterações</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
  title: { fontSize: 18, fontWeight: '700', color: '#1e293b', marginBottom: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  desc: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  input: {
    borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, minWidth: 90, textAlign: 'right', fontSize: 13,
  },
  btn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
