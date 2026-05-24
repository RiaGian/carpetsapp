import React from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export const edgePaddingForWidth = (w: number) => (w >= 1200 ? 56 : w >= 768 ? 40 : 20);

export default function Page({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const EDGE = edgePaddingForWidth(width);


  const TOP_PAD = (insets.top || 0) + (Platform.OS === 'ios' ? 6 : Platform.OS === 'android' ? 8 : 12);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flex: 1, paddingTop: TOP_PAD, paddingHorizontal: EDGE, backgroundColor: '#fff' }}>
        {children}
      </View>
    </SafeAreaView>
  );
}
