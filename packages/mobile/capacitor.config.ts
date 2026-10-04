import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.itsdommie.muster',
  appName: 'Muster',
  webDir: 'dist',
  backgroundColor: '#15130f', // the app is dark by default: no white flash behind it
  android: { allowMixedContent: false },
};

export default config;
