export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.status(200).json({
    apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyA0u2DcfghFR1-gEzJcRpSb778jBFHjcEE',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'finca-manager-d5e3e.firebaseapp.com',
    projectId: process.env.FIREBASE_PROJECT_ID || 'finca-manager-d5e3e',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'finca-manager-d5e3e.firebasestorage.app',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '1096670243449',
    appId: process.env.FIREBASE_APP_ID || '1:1096670243449:web:a0a7c5c7b84f18dcde02a8',
    vapidKey: process.env.FIREBASE_VAPID_KEY || 'BFxdWd3AwT0KdcWKstBN7YdCepa4hCGnwSfChePmAeqlLPKzNZGPRy6mlsjRzFRMeVFYyx3pdEMV7-T8AWhKmAs',
  });
}
