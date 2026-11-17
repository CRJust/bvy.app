import React from 'react';
import { StyleSheet, View, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function HomeScreen() {
  if (Platform.OS === 'web') {
    // Only the module load is guarded; render errors are not catchable with try/catch anyway
    let AppWeb: React.ComponentType | null = null;
    try {
      AppWeb = require('../src/App').default;
    } catch {
      // Fallback to the WebView below
    }
    if (AppWeb) return <AppWeb />;
  }

  const { WebView } = require('react-native-webview');
  const Constants = require('expo-constants').default;
  // Prefer explicit env; otherwise reuse the Metro host IP (dev) with the Express port.
  const hostIp = String(Constants.expoConfig?.hostUri ?? '').split(':')[0];
  const DEV_SERVER_URL =
    process.env.EXPO_PUBLIC_WEB_APP_URL ||
    (hostIp ? `http://${hostIp}:3000` : 'http://192.168.1.128:3000');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <WebView
        source={{ uri: DEV_SERVER_URL }}
        style={styles.webview}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#F78D79" />
          </View>
        )}
        javaScriptEnabled
        showsVerticalScrollIndicator={false}
        domStorageEnabled
        allowsInlineMediaPlayback
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF6EE',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFF6EE',
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF6EE',
  },
});
