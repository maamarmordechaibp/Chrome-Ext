// Firebase client for the admin app. Same project as the extension; the web
// config values are not secrets (access is gated by Auth + the Worker's
// admin check). Admins sign in with email/password.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCpABmEZ0YVPzqP6VFjifWA1ni5113Q1Mg',
  authDomain: 'codelab-77107.firebaseapp.com',
  projectId: 'codelab-77107',
  storageBucket: 'codelab-77107.firebasestorage.app',
  messagingSenderId: '847091943581',
  appId: '1:847091943581:web:f0ccd4902f50a46d846c74',
};

export const auth = getAuth(initializeApp(firebaseConfig));
