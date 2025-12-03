/* ========================================
   firebase-config.js
   Configuración Firebase - SOLO FIRESTORE
   ======================================== */

// REEMPLAZA con los valores de TU proyecto Firebase
const firebaseConfig = {
    apiKey: "TU_API_KEY_AQUI",
    authDomain: "TU_PROJECT_ID.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROJECT_ID.appspot.com",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID"
};

/* ========================================
   Inicializar Firebase SDK
   ======================================== */

// Importar solo Firestore (Firebase v10)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    getDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy,
    serverTimestamp,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

console.log('🔥 Firebase inicializado');
console.log('📊 Project ID:', firebaseConfig.projectId);

/* ========================================
   Nombres de Colecciones
   ======================================== */
const COLLECTIONS = {
    PRODUCTS: 'products',
    MOVEMENTS: 'movements',
    CATEGORIES: 'categories'
};

/* ========================================
   CRUD - PRODUCTOS (Firestore)
   ======================================== */

// Crear Producto
async function addProductToFirestore(product) {
    try {
        const productData = {
            ...product,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        const docRef = await addDoc(collection(db, COLLECTIONS.PRODUCTS), productData);
        console.log('✅ Producto agregado a Firestore:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('❌ Error al agregar a Firestore:', error);
        throw error;
    }
}

// Obtener Todos los Productos
async function getAllProductsFromFirestore() {
    try {
        const querySnapshot = await getDocs(collection(db, COLLECTIONS.PRODUCTS));
        const products = [];
        
        querySnapshot.forEach((doc) => {
            products.push({
                firestoreId: doc.id, // ID de Firestore
                ...doc.data()
            });
        });
        
        console.log(`📦 ${products.length} productos obtenidos de Firestore`);
        return products;
    } catch (error) {
        console.error('❌ Error al obtener productos:', error);
        return [];
    }
}

// Obtener Producto por ID
async function getProductFromFirestore(firestoreId) {
    try {
        const docRef = doc(db, COLLECTIONS.PRODUCTS, firestoreId);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            return {
                firestoreId: docSnap.id,
                ...docSnap.data()
            };
        } else {
            console.warn('⚠️ Producto no encontrado:', firestoreId);
            return null;
        }
    } catch (error) {
        console.error('❌ Error al obtener producto:', error);
        throw error;
    }
}

// Actualizar Producto
async function updateProductInFirestore(firestoreId, updates) {
    try {
        const docRef = doc(db, COLLECTIONS.PRODUCTS, firestoreId);
        
        const updateData = {
            ...updates,
            updatedAt: serverTimestamp()
        };
        
        await updateDoc(docRef, updateData);
        console.log('✅ Producto actualizado en Firestore:', firestoreId);
        return true;
    } catch (error) {
        console.error('❌ Error al actualizar producto:', error);
        throw error;
    }
}

// Eliminar Producto
async function deleteProductFromFirestore(firestoreId) {
    try {
        const docRef = doc(db, COLLECTIONS.PRODUCTS, firestoreId);
        await deleteDoc(docRef);
        console.log('✅ Producto eliminado de Firestore:', firestoreId);
        return true;
    } catch (error) {
        console.error('❌ Error al eliminar producto:', error);
        throw error;
    }
}

// Buscar productos por nombre
async function searchProductsInFirestore(searchTerm) {
    try {
        // Firestore no tiene búsqueda de texto completo nativa
        // Por ahora obtenemos todos y filtramos en cliente
        const allProducts = await getAllProductsFromFirestore();
        const lowerSearch = searchTerm.toLowerCase();
        
        return allProducts.filter(p => 
            p.name.toLowerCase().includes(lowerSearch) ||
            p.description?.toLowerCase().includes(lowerSearch) ||
            p.qrCode?.includes(searchTerm)
        );
    } catch (error) {
        console.error('❌ Error en búsqueda:', error);
        return [];
    }
}

// Filtrar por categoría
async function filterProductsByCategory(category) {
    try {
        const q = query(
            collection(db, COLLECTIONS.PRODUCTS),
            where('category', '==', category)
        );
        
        const querySnapshot = await getDocs(q);
        const products = [];
        
        querySnapshot.forEach((doc) => {
            products.push({
                firestoreId: doc.id,
                ...doc.data()
            });
        });
        
        return products;
    } catch (error) {
        console.error('❌ Error al filtrar por categoría:', error);
        return [];
    }
}

/* ========================================
   CRUD - MOVIMIENTOS
   ======================================== */

async function addMovementToFirestore(movement) {
    try {
        const movementData = {
            ...movement,
            date: serverTimestamp()
        };
        
        const docRef = await addDoc(collection(db, COLLECTIONS.MOVEMENTS), movementData);
        console.log('✅ Movimiento registrado en Firestore:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('❌ Error al registrar movimiento:', error);
        throw error;
    }
}

async function getAllMovementsFromFirestore() {
    try {
        const q = query(
            collection(db, COLLECTIONS.MOVEMENTS),
            orderBy('date', 'desc')
        );
        
        const querySnapshot = await getDocs(q);
        const movements = [];
        
        querySnapshot.forEach((doc) => {
            movements.push({
                firestoreId: doc.id,
                ...doc.data()
            });
        });
        
        return movements;
    } catch (error) {
        console.error('❌ Error al obtener movimientos:', error);
        return [];
    }
}

/* ========================================
   ESTADÍSTICAS
   ======================================== */

async function getStatsFromFirestore() {
    try {
        const products = await getAllProductsFromFirestore();
        const movements = await getAllMovementsFromFirestore();
        
        // Total productos
        const totalProducts = products.length;
        
        // Stock total
        const totalStock = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
        
        // Stock bajo (menos de 10)
        const lowStock = products.filter(p => p.quantity < 10).length;
        
        // Movimientos de hoy
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayMovements = movements.filter(m => {
            if (!m.date) return false;
            const movDate = m.date.toDate ? m.date.toDate() : new Date(m.date);
            return movDate >= today;
        }).length;
        
        return {
            totalProducts,
            totalStock,
            lowStock,
            todayMovements
        };
    } catch (error) {
        console.error('❌ Error al calcular estadísticas:', error);
        return {
            totalProducts: 0,
            totalStock: 0,
            lowStock: 0,
            todayMovements: 0
        };
    }
}

/* ========================================
   Exportar API
   ======================================== */
window.FirebaseDB = {
    // Instancias
    app,
    db,
    
    // CRUD Productos
    addProduct: addProductToFirestore,
    getAllProducts: getAllProductsFromFirestore,
    getProduct: getProductFromFirestore,
    updateProduct: updateProductInFirestore,
    deleteProduct: deleteProductFromFirestore,
    searchProducts: searchProductsInFirestore,
    filterByCategory: filterProductsByCategory,
    
    // Movimientos
    addMovement: addMovementToFirestore,
    getAllMovements: getAllMovementsFromFirestore,
    
    // Estadísticas
    getStats: getStatsFromFirestore,
    
    // Colecciones
    COLLECTIONS
};

console.log('✅ Firebase API lista para usar');
console.log('💡 Usa: window.FirebaseDB.addProduct(...)');
console.log('💡 Usa: window.FirebaseDB.getAllProducts()');
console.log('💡 Usa: window.FirebaseDB.getStats()');