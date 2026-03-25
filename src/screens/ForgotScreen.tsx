import { Link } from 'expo-router';
import { useState } from 'react';
import { Image, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors } from '../theme/colors';

export default function ForgotScreen() {
  const [email, setEmail] = useState('');

  function onSendInstructions() {
    console.log('Send reset instructions to:', email);
  }

  return (
    <View style={styles.container}>
      <View style={styles.card}>

        {/* Logo */}
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
        />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Ξεχάσατε τον Κωδικό;</Text>
          <Text style={styles.subtitle}>
            Θα σας στείλουμε οδηγίες επαναφοράς στο email σας.
          </Text>
        </View>

        {/* Email Input */}
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="✉️  example@email.com"
          placeholderTextColor="#b0b0b0"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />

        {/* Button */}
        <TouchableOpacity onPress={onSendInstructions} style={styles.primaryBtn} activeOpacity={0.9}>
          <Text style={styles.primaryBtnText}>Αποστολή Οδηγιών</Text>
        </TouchableOpacity>

        {/* Πίσω στη Σύνδεση */}
        <View style={styles.rowCenter}>
          <Link href="/" asChild>
            <TouchableOpacity>
              <Text style={styles.linkText}>Πίσω στη Σύνδεση</Text>
            </TouchableOpacity>
          </Link>
        </View>

      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: colors.bg, 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 16 
  },


  card: {
    width: '100%',
    maxWidth: 660,
    minHeight: 740,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    paddingTop: 140, 
    ...(Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 3 },
      web: { boxShadow: '0 10px 35px rgba(0,0,0,0.08)' } as any,
    }) as object),
  },

  // logo όπως στο LoginScreen (μικρό/διακριτικό)
  logo: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
    alignSelf: 'center',
    marginBottom: 8,
    marginTop: -80, // το ανεβάζει λίγο για να έρθει πιο ψηλά
  },

  header: { 
    marginBottom: 28, 
    alignItems: 'center' 
  },

  title: { 
    fontSize: 27, 
    fontWeight: '700', 
    color: colors.primary, 
    marginBottom: 6, 
    textAlign: 'center',
  },

  subtitle: { 
    fontSize: 14, 
    color: colors.muted, 
    textAlign: 'center', 
    width: '90%',
    marginTop: 12,   // 🔹 ανεβάζει το spacing προς τα κάτω
  },

  label: { 
    fontSize: 12, 
    color: colors.muted, 
    alignSelf: 'flex-start', 
    marginBottom: 6 
  },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,    // λίγο πιο άνετο
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 18,       // ελαφρώς μεγαλύτερο κενό
    width: '100%',
  },

  // ίδιο feel με LoginScreen: ύψος/γραμματοσειρά
  primaryBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,    // ίδιο ύψος με login
    borderRadius: 14,
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },

  primaryBtnText: { 
    color: '#fff', 
    fontWeight: '700', 
    fontSize: 17       // ίδιο μέγεθος με τα κουμπιά στο LoginScreen
  },

  rowCenter: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    marginTop: 24      // λίγο πιο κάτω για ισορροπία
  },

  linkText: { 
    color: colors.primary, 
    fontWeight: '600', 
    fontSize: 17 
  },
});
