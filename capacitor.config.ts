import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.leveljiujitsu.app',
  appName: 'LEVEL JIUJITSU',
  webDir: 'dist',
  ios: {
    // Mantém o conteúdo respeitando as áreas seguras (notch / home indicator)
    contentInset: 'always',
    backgroundColor: '#0a0a0a',
  },
};

export default config;
