// Firebase initialization for the extension.
//
// NOTE: The values below (including apiKey) are NOT secrets — Firebase web
// config is meant to be shipped in client apps. Access is protected by Firebase
// Authentication plus Firestore/Storage security rules, not by hiding this file.
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: 'AIzaSyCpABmEZ0YVPzqP6VFjifWA1ni5113Q1Mg',
  authDomain: 'codelab-77107.firebaseapp.com',
  projectId: 'codelab-77107',
  storageBucket: 'codelab-77107.firebasestorage.app',
  messagingSenderId: '847091943581',
  appId: '1:847091943581:web:f0ccd4902f50a46d846c74',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
