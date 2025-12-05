/* ========================================
   auth.js - CORREGIDO PARA OFFLINE
   Autenticación que funciona sin conexión
   ======================================== */

/* ========================================
   Hash Simple (para proyecto escolar)
   ======================================== */
async function simpleHash(text) {
    const salt = 'SafeProducts2025';
    return btoa(text + salt);
}

async function verifyHash(text, hash) {
    const computed = await simpleHash(text);
    return computed === hash;
}

/* ========================================
   FIRESTORE - Solo si hay conexión
   ======================================== */
async function createUserInFirestore(userData) {
    // CRÍTICO: Solo intentar si hay conexión
    if (!navigator.onLine || !window.FirebaseDB) {
        console.log('📴 Offline - Usuario no se creará en Firestore ahora');
        return null;
    }

    try {
        const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const userDoc = {
            name: userData.name,
            email: userData.email.toLowerCase(),
            passwordHash: userData.passwordHash,
            createdAt: serverTimestamp(),
            lastLogin: null
        };
        
        const docRef = await addDoc(
            collection(window.FirebaseDB.db, 'users'), 
            userDoc
        );
        
        console.log('✅ Usuario creado en Firestore:', docRef.id);
        return docRef.id;
        
    } catch (error) {
        console.warn('⚠️ Error creando usuario en Firestore:', error);
        return null;
    }
}

async function findUserByEmailInFirestore(email) {
    if (!navigator.onLine || !window.FirebaseDB) {
        console.log('📴 Offline - No se puede buscar en Firestore');
        return null;
    }

    try {
        const { collection, query, where, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const q = query(
            collection(window.FirebaseDB.db, 'users'),
            where('email', '==', email.toLowerCase())
        );
        
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            return null;
        }
        
        const doc = querySnapshot.docs[0];
        return {
            firestoreId: doc.id,
            ...doc.data()
        };
        
    } catch (error) {
        console.warn('⚠️ Error buscando usuario en Firestore:', error);
        return null;
    }
}

async function updateLastLogin(firestoreId) {
    if (!navigator.onLine || !window.FirebaseDB) return;

    try {
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const userRef = doc(window.FirebaseDB.db, 'users', firestoreId);
        await updateDoc(userRef, {
            lastLogin: serverTimestamp()
        });
        
        console.log('✅ Último login actualizado');
        
    } catch (error) {
        console.warn('⚠️ Error al actualizar último login:', error);
    }
}

/* ========================================
   INDEXEDDB - OFFLINE FIRST
   ======================================== */
async function saveUserLocally(userData) {
    try {
        // CRÍTICO: Esperar a que IndexedDB esté listo
        if (!window.DB || typeof window.DB.init !== 'function') {
            console.warn('⚠️ IndexedDB no disponible para guardar usuario');
            return;
        }
        
        const db = await window.DB.init();
        
        if (!db.objectStoreNames.contains('users')) {
            console.warn('⚠️ Store "users" no existe');
            return;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['users'], 'readwrite');
            const store = transaction.objectStore('users');
            const index = store.index('email');
            
            const searchRequest = index.get(userData.email.toLowerCase());
            
            searchRequest.onsuccess = () => {
                const existing = searchRequest.result;
                
                if (existing) {
                    // Actualizar
                    const updatedUser = { ...existing, ...userData };
                    const updateRequest = store.put(updatedUser);
                    
                    updateRequest.onsuccess = () => {
                        console.log('✅ Usuario actualizado localmente');
                        resolve(updatedUser);
                    };
                    
                    updateRequest.onerror = () => {
                        console.error('❌ Error actualizando usuario:', updateRequest.error);
                        reject(updateRequest.error);
                    };
                } else {
                    // Crear nuevo
                    const addRequest = store.add(userData);
                    
                    addRequest.onsuccess = () => {
                        console.log('✅ Usuario guardado localmente');
                        resolve(userData);
                    };
                    
                    addRequest.onerror = () => {
                        console.error('❌ Error guardando usuario:', addRequest.error);
                        reject(addRequest.error);
                    };
                }
            };
            
            searchRequest.onerror = () => {
                console.error('❌ Error buscando usuario:', searchRequest.error);
                reject(searchRequest.error);
            };
        });
        
    } catch (error) {
        console.error('❌ Error en saveUserLocally:', error);
    }
}

async function findUserLocallyByEmail(email) {
    try {
        if (!window.DB || typeof window.DB.init !== 'function') {
            console.warn('⚠️ IndexedDB no disponible');
            return null;
        }
        
        const db = await window.DB.init();
        
        if (!db.objectStoreNames.contains('users')) {
            console.warn('⚠️ Store "users" no existe');
            return null;
        }
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['users'], 'readonly');
            const store = transaction.objectStore('users');
            const index = store.index('email');
            const request = index.get(email.toLowerCase());
            
            request.onsuccess = () => {
                resolve(request.result || null);
            };
            
            request.onerror = () => {
                console.error('❌ Error buscando usuario:', request.error);
                reject(request.error);
            };
        });
        
    } catch (error) {
        console.error('❌ Error en findUserLocallyByEmail:', error);
        return null;
    }
}

/* ========================================
   REGISTRO - OFFLINE FIRST
   ======================================== */
async function registerUser(name, email, password) {
    try {
        console.log('📝 Iniciando registro...');
        
        // Validaciones
        if (!name || name.length < 3) {
            throw new Error('El nombre debe tener al menos 3 caracteres');
        }
        
        if (!email || !email.includes('@')) {
            throw new Error('Correo electrónico inválido');
        }
        
        if (!password || password.length < 6) {
            throw new Error('La contraseña debe tener al menos 6 caracteres');
        }
        
        // CRÍTICO: Buscar PRIMERO localmente
        let existingUser = await findUserLocallyByEmail(email);
        
        // Si hay conexión, verificar también en Firestore
        if (!existingUser && navigator.onLine && window.FirebaseDB) {
            existingUser = await findUserByEmailInFirestore(email);
        }
        
        if (existingUser) {
            throw new Error('Ya existe una cuenta con este correo electrónico');
        }
        
        // Hash de contraseña
        const passwordHash = await simpleHash(password);
        
        const userData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            passwordHash: passwordHash,
            createdAt: new Date().toISOString()
        };
        
        // 1. SIEMPRE guardar localmente PRIMERO
        await saveUserLocally(userData);
        console.log('✅ Usuario guardado localmente');
        
        // 2. Intentar guardar en Firestore SOLO si hay conexión
        if (navigator.onLine && window.FirebaseDB) {
            try {
                const firestoreId = await createUserInFirestore(userData);
                if (firestoreId) {
                    userData.firestoreId = firestoreId;
                    // Actualizar el usuario local con el firestoreId
                    await saveUserLocally(userData);
                    console.log('✅ Usuario registrado en Firestore');
                }
            } catch (error) {
                console.warn('⚠️ Usuario guardado solo localmente (sin Firestore)');
            }
        } else {
            console.log('📴 Offline - Usuario guardado solo localmente');
        }
        
        console.log('✅ Registro exitoso');
        return userData;
        
    } catch (error) {
        console.error('❌ Error en registro:', error);
        throw error;
    }
}

/* ========================================
   LOGIN - OFFLINE FIRST
   ======================================== */
async function loginUser(email, password) {
    try {
        console.log('🔐 Iniciando login...');
        
        if (!email || !password) {
            throw new Error('Por favor completa todos los campos');
        }
        
        // 1. SIEMPRE buscar PRIMERO localmente
        let user = await findUserLocallyByEmail(email);
        
        // 2. Si hay conexión, también buscar en Firestore (y actualizar local)
        if (navigator.onLine && window.FirebaseDB) {
            try {
                const firestoreUser = await findUserByEmailInFirestore(email);
                
                if (firestoreUser) {
                    // Actualizar usuario local con datos de Firestore
                    await saveUserLocally(firestoreUser);
                    user = firestoreUser;
                }
            } catch (error) {
                console.warn('⚠️ Error buscando en Firestore, usando datos locales');
            }
        }
        
        if (!user) {
            throw new Error('Usuario no encontrado');
        }
        
        // Verificar contraseña
        const isValid = await verifyHash(password, user.passwordHash);
        
        if (!isValid) {
            throw new Error('Contraseña incorrecta');
        }
        
        // Actualizar último login en Firestore (si hay conexión)
        if (user.firestoreId && navigator.onLine && window.FirebaseDB) {
            await updateLastLogin(user.firestoreId);
        }
        
        // Guardar sesión
        const sessionData = {
            name: user.name,
            email: user.email,
            firestoreId: user.firestoreId,
            loginTime: new Date().toISOString()
        };
        
        localStorage.setItem('user', JSON.stringify(sessionData));
        
        console.log('✅ Login exitoso');
        return sessionData;
        
    } catch (error) {
        console.error('❌ Error en login:', error);
        throw error;
    }
}

/* ========================================
   SESIÓN
   ======================================== */
function logoutUser() {
    localStorage.removeItem('user');
    console.log('👋 Sesión cerrada');
}

function getCurrentUser() {
    const userData = localStorage.getItem('user');
    if (!userData) return null;
    
    try {
        return JSON.parse(userData);
    } catch (error) {
        console.error('Error al parsear usuario:', error);
        localStorage.removeItem('user');
        return null;
    }
}

function isAuthenticated() {
    return getCurrentUser() !== null;
}

/* ========================================
   UI - LOGIN
   ======================================== */
async function initLogin() {
    console.log('🔐 Inicializando login...');
    
    if (isAuthenticated()) {
        console.log('✅ Usuario autenticado, redirigiendo...');
        window.location.href = 'home.html';
        return;
    }
    
    // Esperar a que IndexedDB esté listo
    await waitForDependencies();
    
    const form = document.getElementById('loginForm');
    const btnLogin = document.getElementById('btnLogin');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        hideError();
        
        btnLogin.disabled = true;
        btnLogin.textContent = 'Iniciando sesión...';
        
        try {
            await loginUser(email, password);
            
            if ('vibrate' in navigator) {
                navigator.vibrate(200);
            }
            
            window.location.href = 'home.html';
            
        } catch (error) {
            showError(error.message);
            
            if ('vibrate' in navigator) {
                navigator.vibrate([100, 50, 100]);
            }
        } finally {
            btnLogin.disabled = false;
            btnLogin.textContent = 'Iniciar Sesión';
        }
    });
    
    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    
    console.log('✅ Login listo');
}

/* ========================================
   UI - REGISTRO
   ======================================== */
async function initRegister() {
    console.log('📝 Inicializando registro...');
    
    if (isAuthenticated()) {
        console.log('✅ Usuario autenticado, redirigiendo...');
        window.location.href = 'home.html';
        return;
    }
    
    await waitForDependencies();
    
    const form = document.getElementById('registerForm');
    const btnRegister = document.getElementById('btnRegister');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        hideError();
        
        if (password !== confirmPassword) {
            showError('Las contraseñas no coinciden');
            return;
        }
        
        btnRegister.disabled = true;
        btnRegister.textContent = 'Creando cuenta...';
        
        try {
            await registerUser(name, email, password);
            
            if ('vibrate' in navigator) {
                navigator.vibrate(200);
            }
            
            alert('✅ Cuenta creada exitosamente\n\nAhora inicia sesión');
            window.location.href = 'login.html';
            
        } catch (error) {
            showError(error.message);
            
            if ('vibrate' in navigator) {
                navigator.vibrate([100, 50, 100]);
            }
        } finally {
            btnRegister.disabled = false;
            btnRegister.textContent = 'Crear Cuenta';
        }
    });
    
    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    
    console.log('✅ Registro listo');
}

/* ========================================
   UI Helpers
   ======================================== */
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.classList.add('hidden');
    }
}

function updateConnectionStatus() {
    const statusText = document.getElementById('statusText');
    const statusDot = document.getElementById('statusDot');
    
    if (!statusText || !statusDot) return;
    
    if (navigator.onLine) {
        statusText.textContent = 'Conectado';
        statusDot.classList.remove('offline');
    } else {
        statusText.textContent = 'Sin conexión (puedes iniciar sesión con cuenta existente)';
        statusDot.classList.add('offline');
    }
}

async function waitForDependencies() {
    console.log('⏳ Esperando IndexedDB...');
    
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
        if (window.DB && typeof window.DB.init === 'function') {
            console.log('✅ IndexedDB disponible');
            
            // Inicializar
            await window.DB.init();
            return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
    }
    
    console.warn('⚠️ Timeout esperando IndexedDB');
}

/* ========================================
   Exportar
   ======================================== */
window.Auth = {
    login: loginUser,
    register: registerUser,
    logout: logoutUser,
    getCurrentUser: getCurrentUser,
    isAuthenticated: isAuthenticated
};

/* ========================================
   Auto-inicialización
   ======================================== */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('loginForm')) {
            initLogin();
        } else if (document.getElementById('registerForm')) {
            initRegister();
        }
    });
} else {
    if (document.getElementById('loginForm')) {
        initLogin();
    } else if (document.getElementById('registerForm')) {
        initRegister();
    }
}

console.log('✅ auth.js cargado (OFFLINE FIRST)');