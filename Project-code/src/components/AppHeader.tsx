// src/components/AppHeader.tsx
import * as Device from 'expo-device';
import { router, useLocalSearchParams } from 'expo-router';
import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { logLogout } from '../services/activitylog';
import { useAuth } from '../state/AuthProvider';
import { colors } from '../theme/colors';

type Props = {
  showBack?: boolean;
  onLogout?: () => void;
  onBack?: () => void; // Custom back handler
};

export default function AppHeader({ showBack = false, onLogout, onBack }: Props) {
  const params = useLocalSearchParams<Record<string, string>>();
  const { user, signOut } = useAuth();

  const paramName =
    (params?.name as string) ||
    (params?.displayName as string) ||
    (params?.username as string) ||
    (params?.user as string) ||
    '';

  const displayName = user?.name || user?.email || paramName || 'Χρήστης';

  const goBack = () => {
    // If custom back handler is provided, use it
    if (onBack) {
      onBack();
      return;
    }
    // Otherwise, use default behavior
    try {
      if ((router as any).canGoBack?.()) router.back();
      else router.push('/dashboard');
    } catch {
      router.push('/dashboard');
    }
  };

  const doLogout = async () => {
  if (onLogout) return onLogout();
  try {
    if (user?.id) {
      await logLogout(
        String(user.id),
        Device.modelName || 'Unknown Device',
        Platform.OS
      );
      console.log(' logLogout OK');
    }

    await signOut();
    router.replace('/');
  } catch (err) {
    console.warn('Logout error:', err);
    router.replace('/');
  }
};


  return (
    <View style={[styles.wrapper, Platform.OS !== 'web' && styles.wrapperMobile]}>
      <View style={[styles.header, Platform.OS !== 'web' && styles.headerMobile]}>
        {/* Αριστερά */}
        <View style={styles.leftRow}>
          {showBack && (
            <Pressable onPress={goBack} style={({ pressed }) => [styles.textBtn, pressed && styles.pressed, Platform.OS !== 'web' && { marginTop: -40, marginLeft: -15 }]}>
              <Text style={[styles.textBtnLabel, { color: '#666' }]}>← Πίσω</Text>
            </Pressable>
          )}

          {Platform.OS === 'web' && (
            <View style={[styles.logoRow, showBack && { marginLeft: 8 }]}>
              <Image
                source={require('../../assets/images/logo.png')}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={[styles.logoText, { marginLeft: 8 }]}>
                Carpets App
              </Text>
            </View>
          )}

        </View>

         {Platform.OS !== 'web' && (
            <View pointerEvents="none" style={[styles.logoRow, styles.logoRowCenterMobile]}>
              <Image
                source={require('../../assets/images/logo.png')}
                style={[styles.logo, styles.logoMobile]}
                resizeMode="contain"
              />
              <Text style={[styles.logoText, { marginLeft: 8 }, styles.logoTextMobile]}>
                Carpets App
              </Text>
            </View>
          )}


        {/* Δεξιά */}
        <View style={[styles.rightRow, Platform.OS !== 'web' && styles.rightRowMobile]}>
          <Text
            style={[styles.connectedText, Platform.OS !== 'web' && styles.connectedTextMobile]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {Platform.OS === 'web' ? 'Συνδεδεμένος: ' : ''}
            <Text
              style={[styles.userName, Platform.OS !== 'web' && styles.userNameMobile]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {displayName}
            </Text>
          </Text>

          <Pressable onPress={doLogout} style={({ pressed }) => [styles.textBtn, pressed && styles.pressed]}>
            <Text style={[styles.textBtnLabel, { color: '#666' }, Platform.OS !== 'web' && styles.textBtnLabelMobile]}>
              Αποσύνδεση
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.divider, Platform.OS !== 'web' && styles.dividerMobile]} />
    </View>

  );
}

const styles = StyleSheet.create({

  wrapperMobile: {
    paddingTop: 0,
    marginTop: 0,
  },
  wrapper: {
    backgroundColor: '#fff',
  },

  header: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',

  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: { width: 46, height: 36, borderRadius: 8 },
  logoText: { fontSize: 22, fontWeight: '800', color: colors.primary },

  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  connectedText: { fontSize: 15, color: '#666', fontWeight: '400' },
  userName: { color: colors.primary, fontWeight: '400', fontSize: 15 },

  textBtn: {
  paddingHorizontal: 6,
  paddingVertical: 4,

},
  textBtnLabel: { fontSize: 15, fontWeight: '400' },
  pressed: { opacity: 0.7 },

  divider: { height: 1, backgroundColor: '#E0E0E0', marginTop: 4, marginBottom: 12 },
  dividerMobile: { marginTop: 2, marginBottom: 8 },
headerMobile: {
  flexWrap: 'wrap',
  paddingHorizontal: 8,
  marginTop: 0,      
  marginBottom: 4,
  paddingBottom: 4, 
  position: 'relative', 
},

rightRowMobile: {
  flexBasis: '100%',         
  justifyContent: 'space-between',
  marginTop: 6,
  gap: 10,
},

logoMobile: { width: 52, height: 40, borderRadius: 10 },
logoTextMobile: { fontSize: 23, fontWeight: '800' },

connectedTextMobile: { fontSize: 17, color: '#666', maxWidth: '65%' },
userNameMobile: { fontSize: 15, color: colors.primary },

textBtnLabelMobile: { fontSize: 15 },


logoRowCenterMobile: {
  position: 'absolute',
  left: 0,
  right: 30,
  height: '100%',
  justifyContent: 'center',
  alignItems: 'center',
  top: -40,
},
});
