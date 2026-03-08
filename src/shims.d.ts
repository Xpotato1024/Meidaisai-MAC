declare const __initial_auth_token: string | undefined;

declare module "./env.js" {
    export const APP_ID: string;
    export const ADMIN_PASSWORD: string;
    export const firebaseConfig: Record<string, string>;
}

declare module "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js" {
    export function initializeApp(config: Record<string, string>): any;
}

declare module "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js" {
    export function getAuth(app: any): any;
    export function setPersistence(...args: any[]): Promise<void>;
    export const inMemoryPersistence: unknown;
    export function signInAnonymously(auth: any): Promise<any>;
    export function signInWithCustomToken(auth: any, token: string): Promise<any>;
    export function onAuthStateChanged(auth: any, callback: (user: any) => void): () => void;
}

declare module "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js" {
    export function getFirestore(app: any): any;
    export function doc(...args: any[]): any;
    export function getDoc(...args: any[]): Promise<any>;
    export function setDoc(...args: any[]): Promise<void>;
    export function updateDoc(...args: any[]): Promise<void>;
    export function deleteDoc(...args: any[]): Promise<void>;
    export function onSnapshot(...args: any[]): () => void;
    export function collection(...args: any[]): any;
    export function query(...args: any[]): any;
    export function getDocs(...args: any[]): Promise<any>;
    export function writeBatch(...args: any[]): any;
    export function serverTimestamp(): any;
}
