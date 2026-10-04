/**
 * إعداد وتهيئة Firebase لنظام الكاشير
 * تم ربط مشروع princess-5f386 بنجاح
 */

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBbnS1YSGzisSx_NNBj_Y0G238IaEHPdXk",
  authDomain: "princess-5f386.firebaseapp.com",
  projectId: "princess-5f386",
  storageBucket: "princess-5f386.firebasestorage.app",
  messagingSenderId: "960520822602",
  appId: "1:960520822602:web:c79a2b7c79412fef356bb3",
  measurementId: "G-4WNF3Y8EJN"
};

class FirebaseService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.db = null;
    this.currentUser = null;
    this.isCloudConnected = false;
    this.init();
  }

  getConfig() {
    const saved = localStorage.getItem('cashier_firebase_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.apiKey && parsed.projectId) return parsed;
      } catch (e) {
        console.error('Error parsing firebase config', e);
      }
    }
    return DEFAULT_FIREBASE_CONFIG;
  }

  saveConfig(config) {
    localStorage.setItem('cashier_firebase_config', JSON.stringify(config));
    window.location.reload();
  }

  clearConfig() {
    localStorage.removeItem('cashier_firebase_config');
    window.location.reload();
  }

  init() {
    const config = this.getConfig();

    if (config && config.apiKey && config.projectId) {
      try {
        if (!firebase.apps.length) {
          this.app = firebase.initializeApp(config);
        } else {
          this.app = firebase.app();
        }

        this.auth = firebase.auth();
        this.db = firebase.firestore();

        // تفعيل استمرارية البيانات دون اتصال (Offline Persistence)
        this.db.enablePersistence({ synchronizeTabs: true }).catch(err => {
          if (err.code === 'failed-precondition') {
            console.warn('Persistence failed-precondition: multiple tabs open');
          } else if (err.code === 'unimplemented') {
            console.warn('Persistence unimplemented in this browser');
          }
        });

        this.isCloudConnected = true;
        console.log('Firebase connected to project:', config.projectId);
      } catch (error) {
        console.error('Firebase initialization error:', error);
        this.isCloudConnected = false;
      }
    } else {
      console.warn('Firebase config missing');
      this.isCloudConnected = false;
    }
  }

  isConnected() {
    return this.isCloudConnected && this.db !== null;
  }
}

window.firebaseService = new FirebaseService();
