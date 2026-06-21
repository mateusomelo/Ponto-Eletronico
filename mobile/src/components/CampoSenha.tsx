import React, { forwardRef, useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, TouchableOpacity, View } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';

interface Props extends Omit<TextInputProps, 'secureTextEntry' | 'style'> {
  style?: any;
}

// Campo de senha padrão do app: texto sempre legível (modo claro/escuro) e
// ícone de mostrar/ocultar — mesmo padrão usado na tela de Login.
const CampoSenha = forwardRef<TextInput, Props>(({ style, ...rest }, ref) => {
  const [mostrar, setMostrar] = useState(false);

  return (
    <View style={[styles.wrap, style]}>
      <TextInput
        ref={ref}
        style={styles.input}
        placeholderTextColor="#94a3b8"
        secureTextEntry={!mostrar}
        {...rest}
      />
      <TouchableOpacity onPress={() => setMostrar((v) => !v)} style={styles.olhoBtn}>
        <FontAwesome5 name={mostrar ? 'eye-slash' : 'eye'} size={16} color="#94a3b8" />
      </TouchableOpacity>
    </View>
  );
});

export default CampoSenha;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0',
    borderRadius: 8, paddingRight: 4,
  },
  input: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1e293b' },
  olhoBtn: { padding: 6 },
});
