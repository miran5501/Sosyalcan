import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth";
import { colors } from "../theme";
import { API_URL } from "../config";

export function LoginScreen() {
  const { login, notice, twoFactorPending, twoFactorMethod, verifyTwoFactor, resendTwoFactorCode, cancelTwoFactor } = useAuth();
  const [info, setInfo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (submitting) return;
    setError(null);
    setInfo(null);
    setSubmitting(true);
    try {
      if (twoFactorPending) {
        await verifyTwoFactor(code);
      } else if ((await login(email, password)) === "2fa") {
        setSubmitting(false); // kod adımı gösterilir
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Giriş yapılamadı");
      setSubmitting(false);
    }
  }

  async function resend() {
    setError(null);
    setInfo(null);
    try {
      await resendTwoFactorCode();
      setInfo("Yeni kod gönderildi. Önceki kod artık geçmez.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kod gönderilemedi");
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.title}>SosyalCan Komuta Merkezi</Text>
        <Text style={styles.subtitle}>Hesabınızla giriş yapın</Text>

        {twoFactorPending ? (
          <>
            <Text style={styles.label}>Doğrulama kodu</Text>
            <TextInput
              style={[styles.input, styles.code]}
              value={code}
              onChangeText={setCode}
              autoFocus
              autoCapitalize="characters"
              maxLength={12}
              onSubmitEditing={submit}
              placeholder="123456"
              placeholderTextColor={colors.textFaint}
            />
            <Text style={styles.hint}>
              {twoFactorMethod === "EMAIL"
                ? "E-postana gönderdiğimiz 6 haneli kodu (10 dakika geçerli) ya da bir kurtarma kodunu gir."
                : "Doğrulama uygulamandaki 6 haneli kodu ya da bir kurtarma kodunu gir."}
            </Text>
            {twoFactorMethod === "EMAIL" && (
              <Pressable onPress={() => void resend()} style={styles.link} disabled={submitting}>
                <Text style={styles.linkText}>Kodu yeniden gönder</Text>
              </Pressable>
            )}
          </>
        ) : (
          <>
        <Text style={styles.label}>E-posta</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          placeholder="ornek@sosyalcan.local"
          placeholderTextColor={colors.textFaint}
        />

        <Text style={styles.label}>Şifre</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          onSubmitEditing={submit}
          placeholder="••••••••"
          placeholderTextColor={colors.textFaint}
        />
          </>
        )}

        {(info ?? notice) && !error && <Text style={styles.notice}>{info ?? notice}</Text>}
        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [styles.button, (pressed || submitting) && styles.buttonPressed]}
          onPress={submit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Text style={styles.buttonText}>{twoFactorPending ? "Doğrula" : "Giriş Yap"}</Text>
          )}
        </Pressable>
        {twoFactorPending ? (
          <Pressable
            onPress={() => {
              cancelTwoFactor();
              setCode("");
              setError(null);
              setInfo(null);
            }}
            style={styles.link}
          >
            <Text style={styles.linkText}>← Girişe dön</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => void Linking.openURL(`${API_URL}/forgot-password`)} style={styles.link}>
            <Text style={styles.linkText}>Şifremi unuttum</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 22,
  },
  title: { fontSize: 20, fontWeight: "600", color: colors.text },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 4, marginBottom: 18 },
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
  error: {
    marginTop: 14,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.redBg,
    color: colors.red,
    fontSize: 13,
  },
  notice: {
    marginTop: 14,
    padding: 10,
    borderRadius: 8,
    backgroundColor: colors.greenBg,
    color: colors.green,
    fontSize: 13,
  },
  button: {
    marginTop: 20,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.7 },
  code: { fontSize: 20, letterSpacing: 6, textAlign: "center" },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 8 },
  link: { marginTop: 14, alignItems: "center", paddingVertical: 4 },
  linkText: { color: colors.primary, fontSize: 14 },
  buttonText: { color: colors.onPrimary, fontSize: 15, fontWeight: "600" },
});
