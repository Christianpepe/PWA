/* ========================================
   sync.js - CORREGIDO PARA MODO OFFLINE
   Sincronización Híbrida que funciona offline
   ======================================== */

let syncInProgress = false;

function generateQRCode() {
    return 'SP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function getCurrentUserId() {
    try {
        const userData = localStorage.getItem('user');
        if (userData) {
            const user = JSON.parse(userData);
            return user.email || user.firestoreId || 'unknown';
        }
    } catch (error) {
        console.error('Error obteniendo usuario:', error);
    }
    return 'unknown';
}

/* ========================================
   Inicialización - SIN DEPENDER DE FIREBASE
   ======================================== */
async function initSync() {
    console.log('🔄 Inicializando sistema de sincronización...');
    
    try {
        // CRÍTICO: Inicializar SOLO IndexedDB
        await window.DB.init();
        console.log('✅ IndexedDB inicializado');
        
        // NO intentar sincronizar si estamos offline
        if (navigator.onLine && window.FirebaseDB) {
            console.log('🌐 Online - Sincronización disponible');
        } else {
            console.log('📴 Offline - Trabajando solo con IndexedDB');
        }
        
    } catch (error) {
        console.error('❌ Error inicializando:', error);
    }
    
    // Monitorear conexión
    window.addEventListener('online', handleOnlineSync);
    
    console.log('✅ Sistema de sincronización listo');
}

/* ========================================
   SINCRONIZACIÓN SOLO CUANDO HAY CONEXIÓN
   ======================================== */
async function syncFromFirestoreToIndexedDB() {
    // CRÍTICO: No sincronizar si estamos offline
    if (!navigator.onLine || !window.FirebaseDB) {
        console.log('📴 Offline - Sincronización omitida');
        return;
    }
    
    if (syncInProgress) {
        console.log('⏳ Sincronización ya en progreso...');
        return;
    }
    
    syncInProgress = true;
    console.log('📥 Sincronizando Firestore → IndexedDB...');
    
    try {
        const firestoreProducts = await window.FirebaseDB.getAllProducts();
        
        if (firestoreProducts.length === 0) {
            console.log('ℹ️ No hay productos en Firestore');
            syncInProgress = false;
            return;
        }
        
        const localProducts = await window.DB.getAllProducts();
        const localByFirestoreId = new Map();
        
        localProducts.forEach(p => {
            if (p.firestoreId) {
                localByFirestoreId.set(p.firestoreId, p);
            }
        });
        
        let updated = 0;
        let created = 0;
        
        for (const fsProduct of firestoreProducts) {
            const docId = fsProduct.firestoreId;
            let localProduct = localByFirestoreId.get(docId);
            
            if (localProduct) {
                // Actualizar si Firestore es más reciente
                const fsTime = fsProduct.updatedAt?.toDate?.() || new Date(0);
                const localTime = new Date(localProduct.updatedAt);
                
                if (fsTime > localTime) {
                    await window.DB.updateProduct(localProduct.id, {
                        name: fsProduct.name,
                        description: fsProduct.description,
                        price: fsProduct.price,
                        quantity: fsProduct.quantity,
                        category: fsProduct.category,
                        qrCode: fsProduct.qrCode || localProduct.qrCode,
                        firestoreId: docId,
                        updatedAt: fsProduct.updatedAt?.toDate?.().toISOString() || new Date().toISOString()
                    });
                    updated++;
                }
            } else {
                // Crear nuevo
                await window.DB.addProduct({
                    name: fsProduct.name,
                    description: fsProduct.description,
                    price: fsProduct.price,
                    quantity: fsProduct.quantity,
                    category: fsProduct.category,
                    qrCode: fsProduct.qrCode || generateQRCode(),
                    firestoreId: docId,
                    createdAt: fsProduct.createdAt?.toDate?.().toISOString() || new Date().toISOString(),
                    updatedAt: fsProduct.updatedAt?.toDate?.().toISOString() || new Date().toISOString()
                });
                created++;
            }
        }
        
        console.log(`✅ Sync: ${created} creados, ${updated} actualizados`);
        
    } catch (error) {
        console.error('❌ Error en sincronización:', error);
    } finally {
        syncInProgress = false;
    }
}

async function syncFromIndexedDBToFirestore() {
    // CRÍTICO: No sincronizar si estamos offline
    if (!navigator.onLine || !window.FirebaseDB) {
        console.log('📴 Offline - Sincronización omitida');
        return;
    }
    
    console.log('📤 Sincronizando IndexedDB → Firestore...');
    
    try {
        const localProducts = await window.DB.getAllProducts();
        let uploaded = 0;
        
        for (const product of localProducts) {
            if (!product.firestoreId) {
                try {
                    const docId = await window.FirebaseDB.addProduct({
                        name: product.name,
                        description: product.description,
                        price: product.price,
                        quantity: product.quantity,
                        category: product.category,
                        qrCode: product.qrCode
                    });
                    
                    await window.DB.updateProduct(product.id, {
                        firestoreId: docId
                    });
                    
                    uploaded++;
                    console.log(`📤 Producto subido: ${product.name}`);
                    
                } catch (error) {
                    console.error(`❌ Error subiendo ${product.name}:`, error);
                }
            }
        }
        
        if (uploaded > 0) {
            console.log(`✅ ${uploaded} productos subidos`);
        }
        
    } catch (error) {
        console.error('❌ Error al subir productos:', error);
    }
}

/* ========================================
   OPERACIONES HÍBRIDAS - OFFLINE FIRST
   ======================================== */
async function addProductHybrid(productData) {
    try {
        if (!productData.qrCode) {
            productData.qrCode = generateQRCode();
        }
        
        // 1. SIEMPRE guardar localmente PRIMERO
        const localId = await window.DB.addProduct(productData);
        console.log('✅ Producto guardado localmente:', localId);
        
        // 2. Intentar subir SOLO si hay conexión
        if (navigator.onLine && window.FirebaseDB) {
            try {
                const docId = await window.FirebaseDB.addProduct(productData);
                await window.DB.updateProduct(localId, { firestoreId: docId });
                console.log('✅ Producto sincronizado con Firestore:', docId);
            } catch (error) {
                console.warn('⚠️ No se pudo subir, se sincronizará después');
            }
        } else {
            console.log('📴 Offline - Producto guardado solo localmente');
        }
        
        return localId;
        
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

async function updateProductHybrid(localId, updates) {
    try {
        const product = await window.DB.getProductById(localId);
        
        if (!product) {
            throw new Error('Producto no encontrado');
        }
        
        // 1. SIEMPRE actualizar localmente PRIMERO
        await window.DB.updateProduct(localId, updates);
        console.log('✅ Producto actualizado localmente');
        
        // 2. Intentar actualizar en Firestore SOLO si hay conexión
        if (product.firestoreId && navigator.onLine && window.FirebaseDB) {
            try {
                await window.FirebaseDB.updateProduct(product.firestoreId, updates);
                console.log('✅ Producto actualizado en Firestore');
            } catch (error) {
                console.warn('⚠️ No se pudo actualizar en Firestore');
            }
        } else if (!navigator.onLine) {
            console.log('📴 Offline - Actualización guardada solo localmente');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

async function deleteProductHybrid(localId) {
    try {
        const product = await window.DB.getProductById(localId);
        
        if (!product) {
            throw new Error('Producto no encontrado');
        }
        
        // 1. SIEMPRE eliminar localmente PRIMERO
        await window.DB.deleteProduct(localId);
        console.log('✅ Producto eliminado localmente');
        
        // 2. Intentar eliminar de Firestore SOLO si hay conexión
        if (product.firestoreId && navigator.onLine && window.FirebaseDB) {
            try {
                await window.FirebaseDB.deleteProduct(product.firestoreId);
                console.log('✅ Producto eliminado de Firestore');
            } catch (error) {
                console.warn('⚠️ No se pudo eliminar de Firestore');
            }
        } else if (!navigator.onLine) {
            console.log('📴 Offline - Eliminación guardada solo localmente');
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

// CRÍTICO: Estas operaciones son SIEMPRE locales
async function getAllProductsHybrid() {
    try {
        return await window.DB.getAllProducts();
    } catch (error) {
        console.error('❌ Error:', error);
        return [];
    }
}

async function getStatsHybrid() {
    try {
        return await window.DB.getStats();
    } catch (error) {
        return {
            totalProducts: 0,
            totalStock: 0,
            lowStock: 0,
            todayMovements: 0
        };
    }
}

/* ========================================
   MOVIMIENTOS - OFFLINE FIRST
   ======================================== */
async function addMovementHybrid(movementData) {
    try {
        const product = await window.DB.getProductById(movementData.productId);
        
        if (!product) {
            throw new Error('Producto no encontrado');
        }
        
        if (movementData.type === 'salida') {
            if (product.quantity < movementData.quantity) {
                throw new Error(`Stock insuficiente. Disponible: ${product.quantity}`);
            }
        }
        
        // 1. SIEMPRE guardar localmente PRIMERO
        const localMovementId = await window.DB.addMovement(movementData);
        console.log('✅ Movimiento guardado localmente:', localMovementId);
        
        // 2. Intentar subir SOLO si hay conexión
        if (navigator.onLine && window.FirebaseDB) {
            try {
                const firestoreMovementData = {
                    productId: product.firestoreId || product.id,
                    productName: product.name,
                    type: movementData.type,
                    quantity: movementData.quantity,
                    note: movementData.note || '',
                    userId: getCurrentUserId(),
                    createdAt: new Date().toISOString()
                };
                
                await window.FirebaseDB.addMovement(firestoreMovementData);
                
                if (product.firestoreId) {
                    const updatedProduct = await window.DB.getProductById(product.id);
                    await window.FirebaseDB.updateProduct(product.firestoreId, {
                        quantity: updatedProduct.quantity
                    });
                }
                
                console.log('✅ Movimiento sincronizado con Firestore');
                
            } catch (error) {
                console.warn('⚠️ No se pudo sincronizar movimiento');
            }
        } else {
            console.log('📴 Offline - Movimiento guardado solo localmente');
        }
        
        return localMovementId;
        
    } catch (error) {
        console.error('❌ Error al agregar movimiento:', error);
        throw error;
    }
}

async function getAllMovementsHybrid() {
    try {
        return await window.DB.getAllMovements();
    } catch (error) {
        console.error('❌ Error:', error);
        return [];
    }
}

async function getMovementsByProductHybrid(productId) {
    try {
        return await window.DB.getMovementsByProduct(productId);
    } catch (error) {
        console.error('❌ Error:', error);
        return [];
    }
}

/* ========================================
   Handler para reconexión
   ======================================== */
async function handleOnlineSync() {
    console.log('🌐 Conexión restaurada - Iniciando sincronización...');
    
    // Esperar un poco para que la conexión se estabilice
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
        await syncFromIndexedDBToFirestore();
        await syncFromFirestoreToIndexedDB();
        console.log('✅ Sincronización completa finalizada');
        
        if ('vibrate' in navigator) {
            navigator.vibrate(200);
        }
        
    } catch (error) {
        console.error('❌ Error en sincronización:', error);
    }
}

/* ========================================
   API Exportada - OFFLINE FIRST
   ======================================== */
window.SyncDB = {
    init: initSync,
    syncDown: syncFromFirestoreToIndexedDB,
    syncUp: syncFromIndexedDBToFirestore,
    
    // Productos - Funcionan offline
    addProduct: addProductHybrid,
    updateProduct: updateProductHybrid,
    deleteProduct: deleteProductHybrid,
    getAllProducts: getAllProductsHybrid,
    getStats: getStatsHybrid,
    searchProducts: window.DB?.searchProducts || (() => []),
    filterByCategory: window.DB?.filterByCategory || (() => []),
    getProductById: window.DB?.getProductById || (() => null),
    getProductByQR: window.DB?.getProductByQR || (() => null),
    
    // Movimientos - Funcionan offline
    addMovement: addMovementHybrid,
    getAllMovements: getAllMovementsHybrid,
    getMovementsByProduct: getMovementsByProductHybrid,
    
    // Categorías - Siempre local
    getAllCategories: window.DB?.getAllCategories || (() => [])
};

console.log('✅ sync.js cargado - MODO OFFLINE FIRST');