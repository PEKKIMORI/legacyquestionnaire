import {initializeApp} from 'firebase/app';
import {getFirestore} from 'firebase/firestore';
import {getAuth, GoogleAuthProvider} from 'firebase/auth';
import 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyB-saN-elh1TmTOOxHOuQ5JDZtVos9oFHI",
  authDomain: "legacyquestionnaire-minerva.firebaseapp.com",
  projectId: "legacyquestionnaire-minerva",
  storageBucket: "legacyquestionnaire-minerva.firebasestorage.app",
  messagingSenderId: "419708047516",
  appId: "1:419708047516:web:05ab0de1c5a1c4ae5c5d59",
  measurementId: "G-WVD6VRW1RH"
};

//	Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Configure Google provider to only allow specific domains
googleProvider.setCustomParameters({
  hd: 'minerva.edu' // This restricts to minerva.edu domain
});

export {db, auth, googleProvider};

export default app;