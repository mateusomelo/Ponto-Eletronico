import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { StripeAPI } from '../api/superadmin';
import { ApiError } from '../api/client';

const STATUS_LABEL: Record<string, string> = {
  active: 'Ativa', trialing: 'Em teste', past_due: 'Pagamento atrasado',
  canceled: 'Cancelada', incomplete: 'Incompleta', suspended: 'Suspensa',
};

export default function AssinaturaScreen({ route, navigation }: any) {
  const empresaId: number = route.params.id;
  const empresaNome: string = route.params.nome;

  const [info, setInfo] = useState<any>(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);

  useEffect(() => {
    navigation.setOptions({ title: `Stripe — ${empresaNome}` });
    carregar();
  }, []);

  async function carregar() {
    try { setInfo(await StripeAPI.info(empresaId)); }
    catch { Alert.alert('Erro', 'Não foi possível carregar a assinatura.'); }
    finally { setCarregando(false); }
  }

  async function criarPagamento() {
    setProcessando(true);
    try {
      const { checkout_url } = await StripeAPI.assinar(empresaId);
      if (checkout_url) {
        await Linking.openURL(checkout_url);
        Alert.alert(
          'Checkout aberto',
          'Complete o pagamento no navegador. Quando o Stripe confirmar, a assinatura é ativada automaticamente.'
        );
      }
    } catch (err) {
      const msg = err instanceof ApiError ? (err.data?.erro || 'Erro ao criar pagamento.') : 'Erro de conexão.';
      Alert.alert('Erro', msg);
    } finally {
      setProcessando(false);
    }
  }

  function cancelarAssinatura() {
    Alert.alert(
      'Cancelar assinatura', `Tem certeza que deseja cancelar a assinatura de "${empresaNome}"? O acesso da empresa será suspenso.`,
      [{ text: 'Voltar', style: 'cancel' }, {
        text: 'Cancelar assinatura', style: 'destructive',
        onPress: async () => {
          setProcessando(true);
          try { await StripeAPI.cancelar(empresaId); await carregar(); Alert.alert('Sucesso', 'Assinatura cancelada.'); }
          catch (err) {
            const msg = err instanceof ApiError ? (err.data?.erro || 'Erro ao cancelar.') : 'Erro de conexão.';
            Alert.alert('Erro', msg);
          } finally { setProcessando(false); }
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

  const temAssinatura = !!info?.assinatura;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <View style={styles.row}>
          <FontAwesome5 name="building" size={14} color="#3b82f6" />
          <Text style={styles.rowLabel}>Plano</Text>
          <Text style={styles.rowValue}>{info?.plano || '—'}</Text>
        </View>
        <View style={styles.row}>
          <FontAwesome5 name="info-circle" size={14} color="#64748b" />
          <Text style={styles.rowLabel}>Status</Text>
          <Text style={styles.rowValue}>
            {info?.stripe_status ? (STATUS_LABEL[info.stripe_status] || info.stripe_status) : 'Sem assinatura Stripe'}
          </Text>
        </View>
      </View>

      {!temAssinatura ? (
        <TouchableOpacity style={styles.btnCriar} onPress={criarPagamento} disabled={processando}>
          {processando ? <ActivityIndicator color="#fff" /> : (
            <>
              <FontAwesome5 name="dollar-sign" size={14} color="#fff" />
              <Text style={styles.btnCriarText}>Criar Pagamento / Assinatura</Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.btnCancelar} onPress={cancelarAssinatura} disabled={processando}>
          {processando ? <ActivityIndicator color="#ef4444" /> : (
            <>
              <FontAwesome5 name="times-circle" size={14} color="#ef4444" />
              <Text style={styles.btnCancelarText}>Cancelar Assinatura</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <Text style={styles.hint}>
        Ao criar o pagamento, abrimos o checkout seguro do Stripe no navegador. Após a confirmação, a
        assinatura é ativada automaticamente neste app.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f4f8' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f0f4f8' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  rowLabel: { flex: 1, fontSize: 13, color: '#475569', fontWeight: '600' },
  rowValue: { fontSize: 13, color: '#1e293b' },
  btnCriar: {
    backgroundColor: '#7c3aed', borderRadius: 10, paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnCriarText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnCancelar: {
    borderWidth: 1, borderColor: '#fecaca', borderRadius: 10, paddingVertical: 14, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  btnCancelarText: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
  hint: { fontSize: 11, color: '#94a3b8', marginTop: 16, textAlign: 'center', lineHeight: 16 },
});
