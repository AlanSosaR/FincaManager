export default function handler(req, res) {
  const cfg = {
    apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyA0u2DcfghFR1-gEzJcRpSb778jBFHjcEE',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'finca-manager-d5e3e.firebaseapp.com',
    projectId: process.env.FIREBASE_PROJECT_ID || 'finca-manager-d5e3e',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'finca-manager-d5e3e.firebasestorage.app',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '1096670243449',
    appId: process.env.FIREBASE_APP_ID || '1:1096670243449:web:a0a7c5c7b84f18dcde02a8',
  };
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).send(`self.__FIREBASE_CONFIG__ = ${JSON.stringify(cfg)};`);
}
