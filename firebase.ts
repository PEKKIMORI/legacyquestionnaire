import {initializeApp} from 'firebase/app';
import {getFirestore} from 'firebase/firestore';
import {getAuth, GoogleAuthProvider} from 'firebase/auth';
import { firebaseConfig } from './src/utils/config';

// Initialize Firebase with validated configuration
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Configure Google provider with enhanced security
googleProvider.addScope('email');
googleProvider.addScope('profile');

// Set custom parameters for enhanced security
googleProvider.setCustomParameters({
  prompt: 'select_account', // Force account selection
  hd: 'minerva.edu' // This restricts to minerva.edu domain (hint)
});

export {db, auth, googleProvider};

export default app;