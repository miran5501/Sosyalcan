import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

/** Yükleme hatası kutusu; ağ kopması/sunucu hatasında kullanıcı tek dokunuşla yeniden deneyebilir. */
export function ErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.box}>
      <Text style={styles.text}>{message}</Text>
      <Pressable style={styles.retry} onPress={onRetry}>
        <Text style={styles.retryText}>Tekrar dene</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { margin: 16, padding: 12, borderRadius: 8, backgroundColor: colors.redBg, gap: 8 },
  text: { color: colors.red, fontSize: 13 },
  retry: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.red,
  },
  retryText: { color: colors.red, fontSize: 13, fontWeight: "500" },
});
