import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ChangePasswordScreen } from "./src/screens/ChangePasswordScreen";
import { NotificationsScreen } from "./src/screens/NotificationsScreen";
import { UnreadProvider, useUnread } from "./src/notifications";
import { installErrorReporting } from "./src/error-reporting";

// Yakalanmayan hatalar web'deki Sistem Durumu sayfasına bildirilir.
installErrorReporting();
import { LoginScreen } from "./src/screens/LoginScreen";
import { ScheduleScreen } from "./src/screens/ScheduleScreen";
import { TasksScreen } from "./src/screens/TasksScreen";
import { colors, isDark } from "./src/theme";

const Tab = createBottomTabNavigator();

const baseTheme = isDark ? DarkTheme : DefaultTheme;
const navTheme = {
  ...baseTheme,
  colors: { ...baseTheme.colors, text: colors.text, background: colors.bg, card: colors.card, border: colors.border, primary: colors.primary },
};

function Tabs() {
  const { unread } = useUnread();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarIconStyle: { display: "none" },
        tabBarLabelStyle: { fontSize: 14, fontWeight: "500" },
        tabBarLabelPosition: "beside-icon",
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Ana Sayfa" }} />
      <Tab.Screen name="Tasks" component={TasksScreen} options={{ title: "Görevler" }} />
      <Tab.Screen name="Schedule" component={ScheduleScreen} options={{ title: "Program" }} />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: "Bildirimler",
          // Sekmelerde ikon gösterilmediği için (rozet ikonun üstüne çizilir) sayı yazının yanında gösterilir.
          tabBarLabel: ({ color }) => (
            <View style={styles.tabLabel}>
              <Text style={[styles.tabLabelText, { color }]}>Bildirimler</Text>
              {unread > 0 && <Text style={styles.tabBadge}>{unread > 99 ? "99+" : unread}</Text>}
            </View>
          ),
          tabBarAccessibilityLabel: unread > 0 ? `Bildirimler, ${unread} okunmamış` : "Bildirimler",
        }}
      />
    </Tab.Navigator>
  );
}

function Root() {
  const { restoring, user } = useAuth();

  if (restoring) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }
  if (!user) return <LoginScreen />;
  if (user.mustChangePassword) return <ChangePasswordScreen />;
  return (
    <UnreadProvider>
      <NavigationContainer theme={navTheme}>
        <Tabs />
      </NavigationContainer>
    </UnreadProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Root />
        <StatusBar style={isDark ? "light" : "dark"} />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  tabLabel: { flexDirection: "row", alignItems: "center", gap: 5 },
  tabLabelText: { fontSize: 14, fontWeight: "500" },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    overflow: "hidden",
    backgroundColor: colors.red,
    color: colors.onPrimary,
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
});
