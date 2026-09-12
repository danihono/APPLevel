import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.leveljiujitsu.app',
  appName: 'LEVEL JIUJITSU',
  webDir: 'dist',
  ios: {
    // As áreas seguras (notch / home indicator) são tratadas só pelo CSS, com
    // `viewport-fit=cover` no index.html e `env(safe-area-inset-*)` no
    // index.css. Usar 'always' aqui faria a WebView reservar a mesma margem uma
    // segunda vez, e o header mobile aparecia com ~120px de vão no topo — no
    // iPhone apenas, já que web e Android não passam por esse ajuste.
    contentInset: 'never',
    backgroundColor: '#0a0a0a',
  },
};

export default config;
