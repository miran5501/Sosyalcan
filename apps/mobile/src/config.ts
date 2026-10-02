import { Platform } from "react-native";

/**
 * Backend adresi. Öncelik: EXPO_PUBLIC_API_URL (gerçek telefonda bilgisayarın
 * yerel ağ IP'si, örn. http://192.168.1.20:3000). Verilmezse Android
 * emülatöründe host makineye giden özel adres (10.0.2.2) kullanılır.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? (Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000");
