import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

export interface PainelAssinaturaRef {
  limpar: () => void;
  temAssinatura: () => boolean;
  capturarPng: () => Promise<string>; // data:image/png;base64,...
}

interface Props {
  style?: ViewStyle;
}

// Painel de assinatura digital: desenha com o dedo (PanResponder + SVG Path)
// e captura o resultado como PNG base64 via react-native-view-shot.
const PainelAssinatura = forwardRef<PainelAssinaturaRef, Props>(({ style }, ref) => {
  const [paths, setPaths] = useState<string[]>([]);
  const pathAtual = useRef('');
  const viewRef = useRef<View>(null);
  const [, forceRender] = useState(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        pathAtual.current = `M${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        forceRender((n) => n + 1);
      },
      onPanResponderMove: (e) => {
        const { locationX, locationY } = e.nativeEvent;
        pathAtual.current += ` L${locationX.toFixed(1)},${locationY.toFixed(1)}`;
        forceRender((n) => n + 1);
      },
      onPanResponderRelease: () => {
        if (pathAtual.current) {
          setPaths((prev) => [...prev, pathAtual.current]);
          pathAtual.current = '';
        }
      },
    })
  ).current;

  useImperativeHandle(ref, () => ({
    limpar: () => { setPaths([]); pathAtual.current = ''; },
    temAssinatura: () => paths.length > 0,
    capturarPng: async () => {
      const uri = await captureRef(viewRef, { format: 'png', quality: 1, result: 'base64' });
      return `data:image/png;base64,${uri}`;
    },
  }));

  return (
    <View ref={viewRef} style={[styles.canvas, style]} {...panResponder.panHandlers} collapsable={false}>
      <Svg style={StyleSheet.absoluteFill}>
        {paths.map((d, i) => (
          <Path key={i} d={d} stroke="#1e293b" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {pathAtual.current ? (
          <Path d={pathAtual.current} stroke="#1e293b" strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ) : null}
      </Svg>
    </View>
  );
});

export default PainelAssinatura;

const styles = StyleSheet.create({
  canvas: {
    height: 160, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed',
    borderRadius: 8, backgroundColor: '#fff',
  },
});
