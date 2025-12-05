/* ========================================
   auth.js - Sistema de Autenticación
   Sin Firebase Auth - Solo Firestore
   ======================================== */

/* ========================================
   Utilidades de Hash (simple para proyecto escolar)
   ======================================== */
async function simpleHash(text) {
    // Para producción, usar una librería como bcrypt o crypto
    // Por simplicidad, usamos btoa (Base64) + salt
    const salt = 'SafeProducts2025';
    return btoa(text + salt);
}

async function verifyHash(text, hash) {
    const computed = await simpleHash(text);
    return computed === hash;
}

/* ========================================
   Funciones de Firestore para Usuarios
   ======================================== */

// Crear usuario en Firestore
async function createUserInFirestore(userData) {
    try {
        // Verificar que FirebaseDB esté disponible
        if (!window.FirebaseDB || !window.FirebaseDB.db) {
            throw new Error('Firebase no inicializado');
        }

        // Importar funciones dinámicamente desde firebase-config
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
        console.error('❌ Error al crear usuario en Firestore:', error);
        throw error;
    }
}

// Buscar usuario por email en Firestore
async function findUserByEmailInFirestore(email) {
    try {
        if (!window.FirebaseDB || !window.FirebaseDB.db) {
            throw new Error('Firebase no inicializado');
        }

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
        console.error('❌ Error al buscar usuario:', error);
        throw error;
    }
}

// Actualizar último login
async function updateLastLogin(firestoreId) {
    try {
        if (!window.FirebaseDB || !window.FirebaseDB.db) return;

        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
        
        const userRef = doc(window.FirebaseDB.db, 'users', firestoreId);
        await updateDoc(userRef, {
            lastLogin: serverTimestamp()
        });
        
        console.log('✅ Último login actualizado');
        
    } catch (error) {
        console.error('⚠️ Error al actualizar último login:', error);
    }
}

/* ========================================
   Funciones de IndexedDB para Usuarios
   ======================================== */

// Crear/actualizar usuario en IndexedDB local
async function saveUserLocally(userData) {
    try {
        // Asegurarse de que IndexedDB esté inicializado
        if (!window.DB) {
            console.error('❌ IndexedDB no disponible');
            return;
        }
        
        const db = await window.DB.init();
        
        // Verificar si el store existe
        if (!db.objectStoreNames.contains('users')) {
            console.error('❌ Store "users" no existe en IndexedDB');
            return;
        }
        
        const transaction = db.transaction(['users'], 'readwrite');
        const store = transaction.objectStore('users');
        
        // Buscar si ya existe
        const index = store.index('email');
        const existingRequest = index.get(userData.email.toLowerCase());
        
        existingRequest.onsuccess = () => {
            const existing = existingRequest.result;
            
            if (existing) {
                // Actualizar
                const updatedUser = { ...existing, ...userData };
                const updateRequest = store.put(updatedUser);
                
                updateRequest.onsuccess = () => {
                    console.log('✅ Usuario actualizado localmente');
                };
                
                updateRequest.onerror = () => {
                    console.error('❌ Error al actualizar usuario:', updateRequest.error);
                };
            } else {
                // Crear nuevo
                const addRequest = store.add(userData);
                
                addRequest.onsuccess = () => {
                    console.log('✅ Usuario guardado localmente');
                };
                
                addRequest.onerror = () => {
                    console.error('❌ Error al guardar usuario:', addRequest.error);
                };
            }
        };
        
        existingRequest.onerror = () => {
            console.error('❌ Error al buscar usuario existente:', existingRequest.error);
        };
        
    } catch (error) {
        console.error('❌ Error en saveUserLocally:', error);
    }
}

// Buscar usuario por email en IndexedDB
async function findUserLocallyByEmail(email) {
    try {
        if (!window.DB) {
            console.error('❌ IndexedDB no disponible');
            return null;
        }
        
        const db = await window.DB.init();
        
        // Verificar si el store existe
        if (!db.objectStoreNames.contains('users')) {
            console.warn('⚠️ Store "users" no existe en IndexedDB');
            return null;
        }
        
        const transaction = db.transaction(['users'], 'readonly');
        const store = transaction.objectStore('users');
        const index = store.index('email');
        
        return new Promise((resolve, reject) => {
            const request = index.get(email.toLowerCase());
            
            request.onsuccess = () => {
                resolve(request.result || null);
            };
            
            request.onerror = () => {
                console.error('❌ Error al buscar usuario:', request.error);
                reject(request.error);
            };
        });
        
    } catch (error) {
        console.error('❌ Error en findUserLocallyByEmail:', error);
        return null;
    }
}

/* ========================================
   REGISTRO DE USUARIO
   ======================================== */
async function registerUser(name, email, password) {
    try {
        console.log('📝 Iniciando registro de usuario...');
        
        // Validaciones básicas
        if (!name || name.length < 3) {
            throw new Error('El nombre debe tener al menos 3 caracteres');
        }
        
        if (!email || !email.includes('@')) {
            throw new Error('Correo electrónico inválido');
        }
        
        if (!password || password.length < 6) {
            throw new Error('La contraseña debe tener al menos 6 caracteres');
        }
        
        // Verificar si el usuario ya existe
        let existingUser = null;
        
        if (navigator.onLine && window.FirebaseDB) {
            existingUser = await findUserByEmailInFirestore(email);
        } else {
            existingUser = await findUserLocallyByEmail(email);
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
        
        // Guardar en Firestore si hay conexión
        if (navigator.onLine && window.FirebaseDB) {
            try {
                const firestoreId = await createUserInFirestore(userData);
                userData.firestoreId = firestoreId;
                console.log('✅ Usuario registrado en Firestore');
            } catch (error) {
                console.warn('⚠️ No se pudo registrar en Firestore, solo local:', error);
            }
        }
        
        // Guardar localmente
        await saveUserLocally(userData);
        
        console.log('✅ Usuario registrado exitosamente');
        return userData;
        
    } catch (error) {
        console.error('❌ Error en registro:', error);
        throw error;
    }
}

/* ========================================
   LOGIN DE USUARIO
   ======================================== */
async function loginUser(email, password) {
    try {
        console.log('🔐 Iniciando inicio de sesión...');
        
        // Validaciones
        if (!email || !password) {
            throw new Error('Por favor completa todos los campos');
        }
        
        let user = null;
        
        // Intentar buscar en Firestore primero si hay conexión
        if (navigator.onLine && window.FirebaseDB) {
            try {
                user = await findUserByEmailInFirestore(email);
                
                // Si lo encontramos, guardarlo localmente
                if (user) {
                    await saveUserLocally(user);
                }
            } catch (error) {
                console.warn('⚠️ No se pudo buscar en Firestore, intentando local');
            }
        }
        
        // Si no se encontró en Firestore, buscar localmente
        if (!user) {
            user = await findUserLocallyByEmail(email);
        }
        
        if (!user) {
            throw new Error('Usuario no encontrado');
        }
        
        // Verificar contraseña
        const isValid = await verifyHash(password, user.passwordHash);
        
        if (!isValid) {
            throw new Error('Contraseña incorrecta');
        }
        
        // Actualizar último login en Firestore
        if (user.firestoreId && navigator.onLine) {
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
   CERRAR SESIÓN
   ======================================== */
function logoutUser() {
    localStorage.removeItem('user');
    console.log('👋 Sesión cerrada');
}

/* ========================================
   VERIFICAR SESIÓN
   ======================================== */
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
    console.log('🔐 Inicializando página de login...');
    
    // Redirigir si ya está autenticado
    if (isAuthenticated()) {
        console.log('✅ Usuario ya autenticado, redirigiendo...');
        window.location.href = 'home.html';
        return;
    }
    
    // Esperar a que se inicialicen las dependencias
    await waitForDependencies();
    
    // Configurar formulario
    const form = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');
    const btnLogin = document.getElementById('btnLogin');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        // Limpiar error previo
        hideError();
        
        // Deshabilitar botón
        btnLogin.disabled = true;
        btnLogin.textContent = 'Iniciando sesión...';
        
        try {
            await loginUser(email, password);
            
            // Vibrar éxito
            if ('vibrate' in navigator) {
                navigator.vibrate(200);
            }
            
            // Redirigir
            window.location.href = 'home.html';
            
        } catch (error) {
            showError(error.message);
            
            // Vibrar error
            if ('vibrate' in navigator) {
                navigator.vibrate([100, 50, 100]);
            }
        } finally {
            btnLogin.disabled = false;
            btnLogin.textContent = 'Iniciar Sesión';
        }
    });
    
    // Monitor de conexión
    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    
    console.log('✅ Login listo');
}

/* ========================================
   UI - REGISTRO
   ======================================== */
async function initRegister() {
    console.log('📝 Inicializando página de registro...');
    
    // Redirigir si ya está autenticado
    if (isAuthenticated()) {
        console.log('✅ Usuario ya autenticado, redirigiendo...');
        window.location.href = 'home.html';
        return;
    }
    
    // Esperar a que se inicialicen las dependencias
    await waitForDependencies();
    
    // Configurar formulario
    const form = document.getElementById('registerForm');
    const errorMessage = document.getElementById('errorMessage');
    const btnRegister = document.getElementById('btnRegister');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Limpiar error previo
        hideError();
        
        // Validar contraseñas coincidan
        if (password !== confirmPassword) {
            showError('Las contraseñas no coinciden');
            return;
        }
        
        // Deshabilitar botón
        btnRegister.disabled = true;
        btnRegister.textContent = 'Creando cuenta...';
        
        try {
            await registerUser(name, email, password);
            
            // Vibrar éxito
            if ('vibrate' in navigator) {
                navigator.vibrate(200);
            }
            
            // Mostrar mensaje de éxito
            alert('✅ Cuenta creada exitosamente\n\nAhora inicia sesión con tus credenciales');
            
            // Redirigir a login
            window.location.href = 'login.html';
            
        } catch (error) {
            showError(error.message);
            
            // Vibrar error
            if ('vibrate' in navigator) {
                navigator.vibrate([100, 50, 100]);
            }
        } finally {
            btnRegister.disabled = false;
            btnRegister.textContent = 'Crear Cuenta';
        }
    });
    
    // Monitor de conexión
    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    
    console.log('✅ Registro listo');
}

/* ========================================
   Utilidades de UI
   ======================================== */
function showError(message) {
    if (window.UI && typeof window.UI.showError === 'function') {
        window.UI.showError(message);
        return;
    }

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
        statusText.textContent = 'Sin conexión';
        statusDot.classList.add('offline');
    }
}

async function waitForDependencies() {
    console.log('⏳ Esperando dependencias...');
    
    let attempts = 0;
    const maxAttempts = 30; // 6 segundos máximo
    
    while (attempts < maxAttempts) {
        // Verificar IndexedDB
        const hasDB = window.DB && typeof window.DB.init === 'function';
        
        // Verificar Firebase
        const hasFirebase = window.FirebaseDB && window.FirebaseDB.db;
        
        if (hasDB) {
            console.log('✅ IndexedDB disponible');
            
            if (!hasFirebase) {
                console.warn('⚠️ Firebase no disponible (trabajando en modo offline)');
            } else {
                console.log('✅ Firebase disponible');
            }
            
            return; // Al menos IndexedDB está listo
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));
        attempts++;
    }
    
    console.warn('⚠️ Timeout esperando dependencias');
}

/* ========================================
   Exportar funciones
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

console.log('✅ auth.js cargado');