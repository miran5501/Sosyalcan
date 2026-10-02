import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth";
import { colors } from "../theme";

/**
 * Admin'in verdiği geçici şifreyle giren kişi, kendi şifresini belirlemeden uygulamayı kullanamaz.
 * Şifre değişince sunucu tüm oturumları kapatır; kişi yeni şifresiyle tekrar giriş yapar.
 */
export function ChangePasswordScreen() {
  const { user, changePassword, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setError(null);
    if (next !== confirm) {
      setError("Yeni şifre ile tekrarı eşleşmiyor");
      return;
    }
    if (next.length < 8 || !/\p{L}/u.test(next) || !/\d/.test(next)) {
      setError("Yeni şifre en az 8 karakter olmalı, en az bir harf ve bir rakam içermeli");
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(current, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Şifre değiştirilemedi");
      setSubmitting(false);
    }
  }

  const field = (label: string, value: string, onChange: (v: string) => void, last = false) => (
    <>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        secureTextEntry
        autoCapitalize="none"
        onSubmitEditing={last ? submit : undefined}
        placeholderTextColor={colors.textFaint}
      />
    </>
  );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text style={styles.title}>Şifreni belirle</Text>
          <Text style={styles.subtitle}>
            Merhaba {user?.name ?? ""}. Şu anki şifren yönetici tarafından verildi. Devam etmek için kendi şifreni belirlemelisin.
          </Text>

          {field("Mevcut (geçici) şifre", current, setCurrent)}
          {field("Yeni şifre", next, setNext)}
          {field("Yeni şifre (tekrar)", confirm, setConfirm, true)}
          <Text style={styles.hint}>En az 8 karakter; en az bir harf ve bir rakam.</Text>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [styles.button, (pressed || submitting) && styles.buttonPressed]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.buttonText}>Şifreyi Değiştir</Text>}
          </Pressable>
          <Pressable onPress={() => void logout()} style={styles.secondary}>
            <Text style={styles.secondaryText}>Çıkış Yap</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 22 },
  title: { fontSize: 20, fontWeight: "600", color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 6, marginBottom: 12, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: "500", color: colors.text, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  error: { marginTop: 14, padding: 10, borderRadius: 8, backgroundColor: colors.redBg, color: colors.red, fontSize: 13 },
  button: { marginTop: 20, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 13, alignItems: "center" },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: colors.onPrimary, fontSize: 15, fontWeight: "600" },
  secondary: { marginTop: 12, alignItems: "center", paddingVertical: 8 },
  secondaryText: { color: colors.textMuted, fontSize: 14 },
});
