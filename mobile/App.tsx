import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";

import { DEFAULT_SERVER_URL } from "./src/config";
import { clearServerUrl, loadServerUrl, saveServerUrl } from "./src/storage";
import { type AppColors, palette, spacing } from "./src/theme";
import { appPath, hostLabel, normalizeServerUrl } from "./src/url";

type BootState = "loading" | "needs-url" | "ready";

export default function App() {
  const scheme = useColorScheme();
  const colors = palette[scheme === "dark" ? "dark" : "light"];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [bootState, setBootState] = useState<BootState>("loading");
  const [serverUrl, setServerUrl] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    loadServerUrl(DEFAULT_SERVER_URL)
      .then((url) => {
        if (!mounted) return;
        const normalized = url ? normalizeServerUrl(url) : null;
        setServerUrl(normalized);
        setBootState(normalized ? "ready" : "needs-url");
      })
      .catch(() => {
        if (!mounted) return;
        setBootState("needs-url");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveServer = useCallback(async (nextUrl: string) => {
    const normalized = normalizeServerUrl(nextUrl);
    if (!normalized) {
      Alert.alert("Adres geçersiz", "https://soyagaci.example.com gibi tam bir adres gir.");
      return;
    }

    await saveServerUrl(normalized);
    setServerUrl(normalized);
    setBootState("ready");
  }, []);

  const handleChangeServer = useCallback(async () => {
    await clearServerUrl();
    setServerUrl(null);
    setBootState("needs-url");
  }, []);

  if (bootState === "loading") {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (bootState === "needs-url" || !serverUrl) {
    return <SetupScreen colors={colors} onSave={handleSaveServer} />;
  }

  return (
    <FamilyTreeShell
      colors={colors}
      serverUrl={serverUrl}
      onChangeServer={handleChangeServer}
    />
  );
}

function SetupScreen({
  colors,
  onSave,
}: {
  colors: AppColors;
  onSave: (url: string) => Promise<void>;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scheme = useColorScheme();
  const [draftUrl, setDraftUrl] = useState(DEFAULT_SERVER_URL);
  const [saving, setSaving] = useState(false);

  const submit = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(draftUrl);
    } finally {
      setSaving(false);
    }
  }, [draftUrl, onSave]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.setupWrap}
      >
        <View style={styles.setupPanel}>
          <Text style={styles.brand}>Soy Ağacı</Text>
          <Text style={styles.setupTitle}>Mobil bağlantı</Text>
          <Text style={styles.setupText}>
            Web uygulamasının adresini gir; oturum ve yetkiler aynı sunucudan
            yönetilir.
          </Text>

          <Text style={styles.label}>Sunucu adresi</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            inputMode="url"
            onChangeText={setDraftUrl}
            onSubmitEditing={submit}
            placeholder="https://soyagaci.example.com"
            placeholderTextColor={colors.textMuted}
            returnKeyType="go"
            style={styles.input}
            value={draftUrl}
          />
          <Text style={styles.hint}>
            Yerel denemede telefondan erişilebilen LAN IP adresini kullan.
          </Text>

          <Pressable
            accessibilityRole="button"
            disabled={saving}
            onPress={submit}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
              saving && styles.disabled,
            ]}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Bağlan</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FamilyTreeShell({
  colors,
  serverUrl,
  onChangeServer,
}: {
  colors: AppColors;
  serverUrl: string;
  onChangeServer: () => Promise<void>;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const scheme = useColorScheme();
  const webViewRef = useRef<WebView>(null);
  const [uri, setUri] = useState(() => appPath(serverUrl, "/login"));
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);

  const navigate = useCallback((path: string) => {
    setLastError(null);
    setUri(appPath(serverUrl, path));
  }, [serverUrl]);

  const onNavigationStateChange = useCallback((event: WebViewNavigation) => {
    setCanGoBack(event.canGoBack);
    setCanGoForward(event.canGoForward);
  }, []);

  const openExternal = useCallback(() => {
    Linking.openURL(uri).catch(() => {
      Alert.alert("Açılamadı", "Bağlantı harici tarayıcıda açılamadı.");
    });
  }, [uri]);

  const confirmServerChange = useCallback(() => {
    Alert.alert("Sunucuyu değiştir", "Kayıtlı adres silinsin mi?", [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Değiştir",
        style: "destructive",
        onPress: () => {
          void onChangeServer();
        },
      },
    ]);
  }, [onChangeServer]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle={scheme === "dark" ? "light-content" : "dark-content"} />
      <View style={styles.toolbar}>
        <View style={styles.toolbarTitle}>
          <Text style={styles.appTitle}>Soy Ağacı</Text>
          <Text numberOfLines={1} style={styles.host}>{hostLabel(serverUrl)}</Text>
        </View>
        <ToolbarButton
          colors={colors}
          disabled={!canGoBack}
          label="Geri"
          symbol="‹"
          onPress={() => webViewRef.current?.goBack()}
        />
        <ToolbarButton
          colors={colors}
          disabled={!canGoForward}
          label="İleri"
          symbol="›"
          onPress={() => webViewRef.current?.goForward()}
        />
        <ToolbarButton
          colors={colors}
          label="Yenile"
          symbol="↻"
          onPress={() => {
            setLastError(null);
            webViewRef.current?.reload();
          }}
        />
        <ToolbarButton
          colors={colors}
          label="Dış tarayıcı"
          symbol="↗"
          onPress={openExternal}
        />
        <ToolbarButton
          colors={colors}
          label="Sunucu"
          symbol="⋯"
          onPress={confirmServerChange}
        />
      </View>

      <View style={styles.quickBar}>
        <QuickButton colors={colors} label="Giriş" onPress={() => navigate("/login")} />
        <QuickButton colors={colors} label="Ağaç" onPress={() => navigate("/tree")} />
        <QuickButton colors={colors} label="Kaydol" onPress={() => navigate("/register")} />
      </View>

      <View style={styles.webFrame}>
        {loading ? (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        <WebView
          ref={webViewRef}
          source={{ uri }}
          style={styles.webView}
          containerStyle={styles.webViewContainer}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          applicationNameForUserAgent="SoyAgaciMobile/0.1.0"
          domStorageEnabled
          javaScriptEnabled
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => setLoading(false)}
          onLoadStart={() => {
            setLoading(true);
            setLastError(null);
          }}
          onNavigationStateChange={onNavigationStateChange}
          onError={({ nativeEvent }) => {
            setLoading(false);
            setLastError(nativeEvent.description || "Sunucuya ulaşılamadı.");
          }}
          onShouldStartLoadWithRequest={(request) => {
            if (/^https?:\/\//i.test(request.url)) return true;
            Linking.openURL(request.url).catch(() => undefined);
            return false;
          }}
        />

        {lastError ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>Bağlantı yok</Text>
            <Text style={styles.errorText}>{lastError}</Text>
            <View style={styles.errorActions}>
              <QuickButton
                colors={colors}
                label="Tekrar dene"
                onPress={() => {
                  setLastError(null);
                  webViewRef.current?.reload();
                }}
              />
              <QuickButton colors={colors} label="Sunucu" onPress={confirmServerChange} />
            </View>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function ToolbarButton({
  colors,
  disabled,
  label,
  onPress,
  symbol,
}: {
  colors: AppColors;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  symbol: string;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && !disabled && styles.iconButtonPressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={styles.iconButtonText}>{symbol}</Text>
    </Pressable>
  );
}

function QuickButton({
  colors,
  label,
  onPress,
}: {
  colors: AppColors;
  label: string;
  onPress: () => void;
}) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quickButton, pressed && styles.quickButtonPressed]}
    >
      <Text style={styles.quickButtonText}>{label}</Text>
    </Pressable>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    center: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
    },
    setupWrap: {
      flex: 1,
      justifyContent: "center",
      padding: spacing.lg,
    },
    setupPanel: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      padding: spacing.xl,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
    },
    brand: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0,
      marginBottom: spacing.sm,
      textTransform: "uppercase",
    },
    setupTitle: {
      color: colors.text,
      fontSize: 26,
      fontWeight: "800",
      letterSpacing: 0,
      marginBottom: spacing.sm,
    },
    setupText: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: spacing.xl,
    },
    label: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: spacing.xs,
    },
    input: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      color: colors.text,
      fontSize: 16,
      minHeight: 48,
      paddingHorizontal: spacing.md,
    },
    hint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      marginTop: spacing.sm,
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 8,
      justifyContent: "center",
      marginTop: spacing.xl,
      minHeight: 50,
      paddingHorizontal: spacing.lg,
    },
    primaryButtonPressed: {
      backgroundColor: colors.primaryPressed,
    },
    primaryButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "800",
    },
    toolbar: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    toolbarTitle: {
      flex: 1,
      minWidth: 0,
    },
    appTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: 0,
    },
    host: {
      color: colors.textMuted,
      fontSize: 12,
      marginTop: 2,
    },
    iconButton: {
      alignItems: "center",
      aspectRatio: 1,
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      justifyContent: "center",
      width: 36,
    },
    iconButtonPressed: {
      backgroundColor: colors.border,
    },
    iconButtonText: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "700",
      lineHeight: 24,
    },
    disabled: {
      opacity: 0.38,
    },
    quickBar: {
      backgroundColor: colors.surface,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: "row",
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    quickButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 38,
      paddingHorizontal: spacing.md,
    },
    quickButtonPressed: {
      backgroundColor: colors.border,
    },
    quickButtonText: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    webFrame: {
      flex: 1,
      position: "relative",
    },
    webView: {
      backgroundColor: colors.background,
      flex: 1,
    },
    webViewContainer: {
      backgroundColor: colors.background,
    },
    loadingOverlay: {
      alignItems: "center",
      backgroundColor: colors.background,
      bottom: 0,
      justifyContent: "center",
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
      zIndex: 2,
    },
    errorCard: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      left: spacing.lg,
      padding: spacing.lg,
      position: "absolute",
      right: spacing.lg,
      top: spacing.lg,
      zIndex: 3,
    },
    errorTitle: {
      color: colors.danger,
      fontSize: 16,
      fontWeight: "800",
      marginBottom: spacing.xs,
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    errorActions: {
      flexDirection: "row",
      gap: spacing.sm,
      marginTop: spacing.md,
    },
  });
}
