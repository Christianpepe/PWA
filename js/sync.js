/* ========================================
   sync.js - Sincronización Híbrida (CORREGIDO)
   IndexedDB (local/offline) + Firestore (remoto)
   ======================================== */

let syncInProgress = false;

/* ========================================
   UTILIDADES
   ======================================== */
async function cleanupDuplicates() {
    try {
        console.log('🧹 Limpiando duplicados...');
        const allProducts = await window.DB.getAllProducts();
        
        // Agrupar por nombre + categoría (cuando falta QR)
        const byKey = {};
        allProducts.forEach(p => {
            const key = `${p.name}_${p.category}_${p.price}`;
            if (!byKey[key]) {
                byKey[key] = [];
            }
            byKey[key].push(p);
        });
        
        // Eliminar duplicados
        let deleted = 0;
        for (const [key, products] of Object.entries(byKey)) {
            if (products.length > 1) {
                // Mantener el que tiene firestoreId, o el más reciente
                products.sort((a, b) => {
                    if (a.firestoreId && !b.firestoreId) return -1;
                    if (!a.firestoreId && b.firestoreId) return 1;
                    return new Date(b.updatedAt) - new Date(a.updatedAt);
                });
                
                // Eliminar duplicados
                for (let i = 1; i < products.length; i++) {
                    await window.DB.deleteProduct(products[i].id);
                    deleted++;
                    console.log(`🗑️ Duplicado eliminado: ${products[i].name} (ID: ${products[i].id})`);
                }
            }
        }
        
        if (deleted > 0) {
            console.log(`✅ ${deleted} duplicados eliminados`);
        } else {
            console.log('✅ No hay duplicados');
        }
        
    } catch (error) {
        console.error('❌ Error limpiando duplicados:', error);
    }
}

/* ========================================
   Inicialización
   ======================================== */
async function initSync() {
    console.log('🔄 Inicializando sistema de sincronización...');
    
    // Inicializar IndexedDB primero
    await window.DB.init();
    
    console.log('✅ Sistema de sincronización listo');
    
    // Monitorear conexión
    window.addEventListener('online', handleOnlineSync);
}

/* ========================================
   SINCRONIZACIÓN: Firestore → IndexedDB
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
            console.log('ℹ️ No hay productos en Firestore');
            syncInProgress = false;
            return;
        }
        
        // Obtener productos locales
        const localProducts = await window.DB.getAllProducts();
        
        // Crear mapa por firestoreId
        const localByFirestoreId = new Map();
        localProducts.forEach(p => {
            if (p.firestoreId) {
                localByFirestoreId.set(p.firestoreId, p);
            }
        });
        
        let updated = 0;
        let created = 0;
        let skipped = 0;
        
        for (const fsProduct of firestoreProducts) {
            // El ID del documento de Firestore
            const docId = fsProduct.firestoreId;
            
            // Buscar si ya existe localmente
            let localProduct = localByFirestoreId.get(docId);
            
            // Si no existe, buscar por nombre + categoría + precio (última opción)
            if (!localProduct) {
                localProduct = localProducts.find(p => 
                    p.name === fsProduct.name &&
                    p.category === fsProduct.category &&
                    p.price === fsProduct.price &&
                    !p.firestoreId // Solo productos sin vincular
                );
                
                // Si lo encontramos, vincular
                if (localProduct) {
                    console.log(`🔗 Vinculando: ${localProduct.name}`);
                    await window.DB.updateProduct(localProduct.id, {
                        firestoreId: docId
                    });
                    localProduct.firestoreId = docId;
                }
            }
            
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
                } else {
                    skipped++;
                }
            } else {
                // Crear nuevo producto local
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
        
        console.log(`✅ Sync: ${created} creados, ${updated} actualizados, ${skipped} sin cambios`);
        
        // Limpiar duplicados
        await cleanupDuplicates();
        
    } catch (error) {
        console.error('❌ Error en sincronización:', error);
    } finally {
        syncInProgress = false;
    }
}

/* ========================================
   SINCRONIZACIÓN: IndexedDB → Firestore
   ======================================== */
async function syncFromIndexedDBToFirestore() {
    if (!navigator.onLine) {
        console.log('📴 Sin conexión');
        return;
    }
    
    console.log('📤 Sincronizando IndexedDB → Firestore...');
    
    try {
        const localProducts = await window.DB.getAllProducts();
        let uploaded = 0;
        
        for (const product of localProducts) {
            // Solo subir productos sin firestoreId
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
                    
                    // Guardar firestoreId localmente
                    await window.DB.updateProduct(product.id, {
                        firestoreId: docId
                    });
                    
                    uploaded++;
                    console.log(`📤 Subido: ${product.name}`);
                    
                } catch (error) {
                    console.error(`❌ Error subiendo ${product.name}:`, error);
                }
            }
        }
        
        if (uploaded > 0) {
            console.log(`✅ ${uploaded} productos subidos`);
        }
        
    } catch (error) {
        console.error('❌ Error al subir:', error);
    }
}

/* ========================================
   OPERACIONES HÍBRIDAS
   ======================================== */

async function addProductHybrid(productData) {
    try {
        // Generar QR si no existe
        if (!productData.qrCode) {
            productData.qrCode = generateQRCode();
        }
        
        // 1. Guardar localmente
        const localId = await window.DB.addProduct(productData);
        console.log('✅ Guardado localmente:', localId);
        
        // 2. Subir a Firestore
        if (navigator.onLine) {
            try {
                const docId = await window.FirebaseDB.addProduct(productData);
                
                // Vincular con firestoreId
                await window.DB.updateProduct(localId, { 
                    firestoreId: docId 
                });
                
                console.log('✅ Sincronizado con Firestore:', docId);
                
            } catch (error) {
                console.warn('⚠️ No se pudo subir, se sincronizará después');
            }
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
        
        // 1. Actualizar localmente
        await window.DB.updateProduct(localId, updates);
        
        // 2. Actualizar en Firestore
        if (product.firestoreId && navigator.onLine) {
            try {
                await window.FirebaseDB.updateProduct(product.firestoreId, updates);
            } catch (error) {
                console.warn('⚠️ No se pudo actualizar en Firestore');
            }
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
        
        // 1. Eliminar localmente
        await window.DB.deleteProduct(localId);
        
        // 2. Eliminar de Firestore
        if (product.firestoreId && navigator.onLine) {
            try {
                await window.FirebaseDB.deleteProduct(product.firestoreId);
            } catch (error) {
                console.warn('⚠️ No se pudo eliminar de Firestore');
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error:', error);
        throw error;
    }
}

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
   Event Handlers
   ======================================== */
async function handleOnlineSync() {
    console.log('🌐 Conexión restaurada');
    await syncFromIndexedDBToFirestore();
    await syncFromFirestoreToIndexedDB();
}

/* ========================================
   Utilidades
   ======================================== */
function generateQRCode() {
    return 'SP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

/* ========================================
   API Exportada
   ======================================== */
window.SyncDB = {
    init: initSync,
    syncDown: syncFromFirestoreToIndexedDB,
    syncUp: syncFromIndexedDBToFirestore,
    
    addProduct: addProductHybrid,
    updateProduct: updateProductHybrid,
    deleteProduct: deleteProductHybrid,
    getAllProducts: getAllProductsHybrid,
    getStats: getStatsHybrid,
    
    searchProducts: window.DB.searchProducts,
    filterByCategory: window.DB.filterByCategory,
    getProductById: window.DB.getProductById,
    getProductByQR: window.DB.getProductByQR,
    
    addMovement: window.DB.addMovement,
    getAllMovements: window.DB.getAllMovements,
    getAllCategories: window.DB.getAllCategories
};

console.log('✅ sync.js cargado - Sistema híbrido listo');