/* ========================================
   sync.js - Sincronización Híbrida
   IndexedDB (local/offline) + Firestore (remoto)
   ======================================== */

let syncInProgress = false;

/* ========================================
   Inicialización
   ======================================== */
async function initSync() {
    console.log('🔄 Inicializando sistema de sincronización...');
    
    // Inicializar IndexedDB primero
    await window.DB.init();
    
    // Intentar sincronización inicial
    if (navigator.onLine) {
        await syncFromFirestoreToIndexedDB();
    }
    
    // Monitorear conexión para auto-sync
    window.addEventListener('online', handleOnlineSync);
    
    console.log('✅ Sistema de sincronización listo');
}

/* ========================================
   SINCRONIZACIÓN: Firestore → IndexedDB
   Descargar datos remotos al cache local
   ======================================== */
async function syncFromFirestoreToIndexedDB() {
    if (syncInProgress) {
        console.log('⏳ Sincronización ya en progreso...');
        return;
    }
    
    syncInProgress = true;
    console.log('📥 Sincronizando Firestore → IndexedDB...');
    
    try {
        // Obtener productos de Firestore
        const firestoreProducts = await window.FirebaseDB.getAllProducts();
        
        if (firestoreProducts.length === 0) {
            console.log('ℹ️ No hay productos en Firestore para sincronizar');
            syncInProgress = false;
            return;
        }
        
        // Obtener productos locales
        const localProducts = await window.DB.getAllProducts();
        
        // Crear mapa de productos locales por QR
        const localMap = new Map();
        localProducts.forEach(p => {
            localMap.set(p.qrCode, p);
        });
        
        let updated = 0;
        let created = 0;
        
        // Sincronizar cada producto
        for (const firestoreProduct of firestoreProducts) {
            const localProduct = localMap.get(firestoreProduct.qrCode);
            
            if (localProduct) {
                // Actualizar si el de Firestore es más reciente
                const firestoreTime = firestoreProduct.updatedAt?.toDate?.() || new Date(0);
                const localTime = new Date(localProduct.updatedAt);
                
                if (firestoreTime > localTime) {
                    await window.DB.updateProduct(localProduct.id, {
                        name: firestoreProduct.name,
                        description: firestoreProduct.description,
                        price: firestoreProduct.price,
                        quantity: firestoreProduct.quantity,
                        category: firestoreProduct.category,
                        firestoreId: firestoreProduct.firestoreId,
                        updatedAt: firestoreProduct.updatedAt?.toDate?.().toISOString() || new Date().toISOString()
                    });
                    updated++;
                }
            } else {
                // Crear nuevo producto local
                await window.DB.addProduct({
                    name: firestoreProduct.name,
                    description: firestoreProduct.description,
                    price: firestoreProduct.price,
                    quantity: firestoreProduct.quantity,
                    category: firestoreProduct.category,
                    qrCode: firestoreProduct.qrCode,
                    firestoreId: firestoreProduct.firestoreId
                });
                created++;
            }
        }
        
        console.log(`✅ Sincronización completa: ${created} creados, ${updated} actualizados`);
        
    } catch (error) {
        console.error('❌ Error en sincronización:', error);
    } finally {
        syncInProgress = false;
    }
}

/* ========================================
   SINCRONIZACIÓN: IndexedDB → Firestore
   Subir cambios locales a la nube
   ======================================== */
async function syncFromIndexedDBToFirestore() {
    if (!navigator.onLine) {
        console.log('📴 Sin conexión, guardando cambios localmente');
        return;
    }
    
    console.log('📤 Sincronizando IndexedDB → Firestore...');
    
    try {
        const localProducts = await window.DB.getAllProducts();
        
        let uploaded = 0;
        
        for (const localProduct of localProducts) {
            // Si no tiene firestoreId, es nuevo
            if (!localProduct.firestoreId) {
                const firestoreId = await window.FirebaseDB.addProduct({
                    name: localProduct.name,
                    description: localProduct.description,
                    price: localProduct.price,
                    quantity: localProduct.quantity,
                    category: localProduct.category,
                    qrCode: localProduct.qrCode
                });
                
                // Guardar el firestoreId en IndexedDB
                await window.DB.updateProduct(localProduct.id, {
                    firestoreId: firestoreId
                });
                
                uploaded++;
            }
        }
        
        if (uploaded > 0) {
            console.log(`✅ ${uploaded} productos subidos a Firestore`);
        }
        
    } catch (error) {
        console.error('❌ Error al subir a Firestore:', error);
    }
}

/* ========================================
   OPERACIONES HÍBRIDAS (Dual Write)
   Escribe en ambos: local + remoto
   ======================================== */

// Agregar Producto (Híbrido)
async function addProductHybrid(productData) {
    try {
        // 1. Guardar en IndexedDB (siempre funciona)
        const localId = await window.DB.addProduct(productData);
        console.log('✅ Producto guardado localmente:', localId);
        
        // 2. Intentar subir a Firestore
        if (navigator.onLine) {
            try {
                const firestoreId = await window.FirebaseDB.addProduct(productData);
                
                // Actualizar el producto local con el firestoreId
                await window.DB.updateProduct(localId, { firestoreId });
                
                console.log('✅ Producto sincronizado con Firestore:', firestoreId);
            } catch (error) {
                console.warn('⚠️ No se pudo subir a Firestore, se sincronizará después:', error);
            }
        } else {
            console.log('📴 Offline: producto se sincronizará cuando haya conexión');
        }
        
        return localId;
        
    } catch (error) {
        console.error('❌ Error al agregar producto:', error);
        throw error;
    }
}

// Actualizar Producto (Híbrido)
async function updateProductHybrid(localId, updates) {
    try {
        // Obtener producto actual
        const product = await window.DB.getProductById(localId);
        
        if (!product) {
            throw new Error('Producto no encontrado');
        }
        
        // 1. Actualizar IndexedDB
        await window.DB.updateProduct(localId, updates);
        console.log('✅ Producto actualizado localmente');
        
        // 2. Actualizar Firestore si tiene firestoreId
        if (product.firestoreId && navigator.onLine) {
            try {
                await window.FirebaseDB.updateProduct(product.firestoreId, updates);
                console.log('✅ Producto actualizado en Firestore');
            } catch (error) {
                console.warn('⚠️ No se pudo actualizar en Firestore:', error);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error al actualizar producto:', error);
        throw error;
    }
}

// Eliminar Producto (Híbrido)
async function deleteProductHybrid(localId) {
    try {
        // Obtener producto antes de eliminar
        const product = await window.DB.getProductById(localId);
        
        if (!product) {
            throw new Error('Producto no encontrado');
        }
        
        // 1. Eliminar de IndexedDB
        await window.DB.deleteProduct(localId);
        console.log('✅ Producto eliminado localmente');
        
        // 2. Eliminar de Firestore
        if (product.firestoreId && navigator.onLine) {
            try {
                await window.FirebaseDB.deleteProduct(product.firestoreId);
                console.log('✅ Producto eliminado de Firestore');
            } catch (error) {
                console.warn('⚠️ No se pudo eliminar de Firestore:', error);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error al eliminar producto:', error);
        throw error;
    }
}

// Obtener Todos los Productos (Híbrido)
async function getAllProductsHybrid() {
    try {
        // Primero intentar desde IndexedDB (más rápido)
        const localProducts = await window.DB.getAllProducts();
        
        // Si estamos online y no hay productos locales, sincronizar
        if (localProducts.length === 0 && navigator.onLine) {
            await syncFromFirestoreToIndexedDB();
            return await window.DB.getAllProducts();
        }
        
        return localProducts;
        
    } catch (error) {
        console.error('❌ Error al obtener productos:', error);
        return [];
    }
}

// Obtener Estadísticas (Híbrido)
async function getStatsHybrid() {
    try {
        // Usar datos locales para estadísticas (más rápido)
        return await window.DB.getStats();
    } catch (error) {
        console.error('❌ Error al obtener estadísticas:', error);
        return {
            totalProducts: 0,
            totalStock: 0,
            lowStock: 0,
            todayMovements: 0
        };
    }
}

/* ========================================
   Event Handlers
   ======================================== */
async function handleOnlineSync() {
    console.log('🌐 Conexión restaurada, sincronizando...');
    
    // Subir cambios locales pendientes
    await syncFromIndexedDBToFirestore();
    
    // Descargar cambios remotos
    await syncFromFirestoreToIndexedDB();
}

/* ========================================
   Exportar API Unificada
   ======================================== */
window.SyncDB = {
    // Inicialización
    init: initSync,
    
    // Sincronización manual
    syncDown: syncFromFirestoreToIndexedDB,
    syncUp: syncFromIndexedDBToFirestore,
    
    // CRUD Híbrido (usa automáticamente local + remoto)
    addProduct: addProductHybrid,
    updateProduct: updateProductHybrid,
    deleteProduct: deleteProductHybrid,
    getAllProducts: getAllProductsHybrid,
    getStats: getStatsHybrid,
    
    // Alias para búsqueda (usa IndexedDB)
    searchProducts: window.DB.searchProducts,
    filterByCategory: window.DB.filterByCategory,
    getProductById: window.DB.getProductById,
    getProductByQR: window.DB.getProductByQR,
    
    // Movimientos (usa IndexedDB por ahora)
    addMovement: window.DB.addMovement,
    getAllMovements: window.DB.getAllMovements,
    
    // Categorías
    getAllCategories: window.DB.getAllCategories
};

console.log('✅ sync.js cargado - Sistema híbrido listo');
console.log('💡 Usa: window.SyncDB.addProduct(...)');
console.log('💡 Usa: window.SyncDB.getAllProducts()');
console.log('💡 Sincronización automática activada');