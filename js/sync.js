/* ========================================
   sync.js - Sincronización Híbrida COMPLETA
   IndexedDB (local/offline) + Firestore (remoto)
   CON SOPORTE PARA PRODUCTOS Y MOVIMIENTOS
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
   SINCRONIZACIÓN: Firestore → IndexedDB (PRODUCTOS)
   ======================================== */
async function syncFromFirestoreToIndexedDB() {
    if (syncInProgress) {
        console.log('⏳ Sincronización ya en progreso...');
        return;
    }
    
    syncInProgress = true;
    console.log('📥 Sincronizando Firestore → IndexedDB (Productos)...');
    
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
        
        console.log(`✅ Sync Productos: ${created} creados, ${updated} actualizados, ${skipped} sin cambios`);
        
        // Limpiar duplicados
        await cleanupDuplicates();
        
    } catch (error) {
        console.error('❌ Error en sincronización de productos:', error);
    } finally {
        syncInProgress = false;
    }
}

/* ========================================
   SINCRONIZACIÓN: IndexedDB → Firestore (PRODUCTOS)
   ======================================== */
async function syncFromIndexedDBToFirestore() {
    if (!navigator.onLine) {
        console.log('📴 Sin conexión');
        return;
    }
    
    console.log('📤 Sincronizando IndexedDB → Firestore (Productos)...');
    
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
   OPERACIONES HÍBRIDAS - PRODUCTOS
   ======================================== */

async function addProductHybrid(productData) {
    try {
        // Generar QR si no existe
        if (!productData.qrCode) {
            productData.qrCode = generateQRCode();
        }
        
        // 1. Guardar localmente
        const localId = await window.DB.addProduct(productData);
        console.log('✅ Producto guardado localmente:', localId);
        
        // 2. Subir a Firestore
        if (navigator.onLine) {
            try {
                const docId = await window.FirebaseDB.addProduct(productData);
                
                // Vincular con firestoreId
                await window.DB.updateProduct(localId, { 
                    firestoreId: docId 
                });
                
                console.log('✅ Producto sincronizado con Firestore:', docId);
                
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
   OPERACIONES HÍBRIDAS - MOVIMIENTOS
   ======================================== */

/**
 * Agregar movimiento (entrada/salida) con sincronización
 * Guarda localmente y sincroniza con Firestore
 */
async function addMovementHybrid(movementData) {
    try {
        // VALIDACIÓN: Verificar que el producto existe
        const product = await window.DB.getProductById(movementData.productId);
        
        if (!product) {
            throw new Error('Producto no encontrado');
        }
        
        // VALIDAR STOCK SUFICIENTE (para salidas)
        if (movementData.type === 'salida') {
            if (product.quantity < movementData.quantity) {
                throw new Error(`Stock insuficiente. Disponible: ${product.quantity}`);
            }
        }
        
        // 1. GUARDAR MOVIMIENTO LOCALMENTE (IndexedDB)
        // Esto automáticamente actualiza el stock del producto
        const localMovementId = await window.DB.addMovement(movementData);
        console.log('✅ Movimiento guardado localmente:', localMovementId);
        
        // 2. SUBIR A FIRESTORE SI HAY CONEXIÓN
        let firestoreMovementId = null;
        
        if (navigator.onLine && window.FirebaseDB) {
            try {
                // Preparar datos para Firestore
                const firestoreMovementData = {
                    productId: product.firestoreId || product.id, // Usar firestoreId si existe
                    productName: product.name,
                    type: movementData.type,
                    quantity: movementData.quantity,
                    note: movementData.note || '',
                    userId: getCurrentUserId(),
                    createdAt: new Date().toISOString()
                };
                
                firestoreMovementId = await window.FirebaseDB.addMovement(firestoreMovementData);
                
                console.log('✅ Movimiento sincronizado con Firestore:', firestoreMovementId);
                
                // ACTUALIZAR STOCK EN FIRESTORE
                if (product.firestoreId) {
                    const updatedProduct = await window.DB.getProductById(product.id);
                    await window.FirebaseDB.updateProduct(product.firestoreId, {
                        quantity: updatedProduct.quantity
                    });
                    console.log('✅ Stock actualizado en Firestore');
                }
                
            } catch (error) {
                console.warn('⚠️ No se pudo sincronizar movimiento con Firestore:', error);
                // El movimiento queda guardado localmente y se sincronizará después
            }
        } else {
            console.log('📴 Sin conexión - Movimiento se sincronizará después');
        }
        
        // 3. RETORNAR ID LOCAL
        return localMovementId;
        
    } catch (error) {
        console.error('❌ Error al agregar movimiento:', error);
        throw error;
    }
}

/**
 * Obtener todos los movimientos (solo lectura local)
 */
async function getAllMovementsHybrid() {
    try {
        return await window.DB.getAllMovements();
    } catch (error) {
        console.error('❌ Error al obtener movimientos:', error);
        return [];
    }
}

/**
 * Obtener movimientos por producto
 */
async function getMovementsByProductHybrid(productId) {
    try {
        return await window.DB.getMovementsByProduct(productId);
    } catch (error) {
        console.error('❌ Error al obtener movimientos del producto:', error);
        return [];
    }
}

/**
 * Sincronizar movimientos pendientes (IndexedDB → Firestore)
 */
async function syncPendingMovements() {
    if (!navigator.onLine || !window.FirebaseDB) {
        console.log('📴 Sin conexión - No se pueden sincronizar movimientos');
        return;
    }
    
    console.log('🔄 Sincronizando movimientos pendientes...');
    
    try {
        // Obtener todos los movimientos locales
        const localMovements = await window.DB.getAllMovements();
        
        // Por simplicidad, subir todos los movimientos de las últimas 24 horas
        // (en producción podrías usar un flag "synced" en cada movimiento)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const recentMovements = localMovements.filter(m => {
            const movDate = new Date(m.date);
            return movDate >= yesterday;
        });
        
        if (recentMovements.length === 0) {
            console.log('✅ No hay movimientos recientes para sincronizar');
            return;
        }
        
        console.log(`📤 Subiendo ${recentMovements.length} movimientos recientes...`);
        
        let uploaded = 0;
        let failed = 0;
        
        for (const movement of recentMovements) {
            try {
                // Obtener producto para tener su firestoreId
                const product = await window.DB.getProductById(movement.productId);
                
                if (!product || !product.firestoreId) {
                    console.warn(`⚠️ Producto no encontrado o sin firestoreId:`, movement.productId);
                    failed++;
                    continue;
                }
                
                // Subir a Firestore
                const firestoreData = {
                    productId: product.firestoreId,
                    productName: movement.productName,
                    type: movement.type,
                    quantity: movement.quantity,
                    note: movement.note || '',
                    date: movement.date,
                    userId: getCurrentUserId()
                };
                
                await window.FirebaseDB.addMovement(firestoreData);
                
                uploaded++;
                console.log(`✅ Movimiento subido: ${movement.productName} (${movement.type})`);
                
            } catch (error) {
                console.error(`❌ Error subiendo movimiento:`, error);
                failed++;
            }
        }
        
        console.log(`✅ Sincronización de movimientos: ${uploaded} subidos, ${failed} fallidos`);
        
        // También sincronizar el stock actualizado
        await syncProductStockToFirestore();
        
    } catch (error) {
        console.error('❌ Error en sincronización de movimientos:', error);
    }
}

/**
 * Sincronizar stock de productos a Firestore
 */
async function syncProductStockToFirestore() {
    if (!navigator.onLine || !window.FirebaseDB) {
        return;
    }
    
    console.log('🔄 Sincronizando stock de productos...');
    
    try {
        const localProducts = await window.DB.getAllProducts();
        
        let updated = 0;
        
        for (const product of localProducts) {
            if (product.firestoreId) {
                try {
                    await window.FirebaseDB.updateProduct(product.firestoreId, {
                        quantity: product.quantity
                    });
                    updated++;
                } catch (error) {
                    console.warn(`⚠️ Error actualizando stock de ${product.name}`);
                }
            }
        }
        
        console.log(`✅ ${updated} productos con stock actualizado`);
        
    } catch (error) {
        console.error('❌ Error sincronizando stock:', error);
    }
}

/* ========================================
   Event Handlers
   ======================================== */
async function handleOnlineSync() {
    console.log('🌐 Conexión restaurada - Iniciando sincronización completa...');
    
    try {
        // 1. Sincronizar productos
        await syncFromIndexedDBToFirestore();
        await syncFromFirestoreToIndexedDB();
        
        // 2. Sincronizar movimientos pendientes
        await syncPendingMovements();
        
        console.log('✅ Sincronización completa finalizada');
        
        // Notificar al usuario
        if ('vibrate' in navigator) {
            navigator.vibrate(200);
        }
        
    } catch (error) {
        console.error('❌ Error en sincronización automática:', error);
    }
}

/* ========================================
   API Exportada
   ======================================== */
window.SyncDB = {
    // Sistema
    init: initSync,
    syncDown: syncFromFirestoreToIndexedDB,
    syncUp: syncFromIndexedDBToFirestore,
    
    // Productos
    addProduct: addProductHybrid,
    updateProduct: updateProductHybrid,
    deleteProduct: deleteProductHybrid,
    getAllProducts: getAllProductsHybrid,
    getStats: getStatsHybrid,
    searchProducts: window.DB.searchProducts,
    filterByCategory: window.DB.filterByCategory,
    getProductById: window.DB.getProductById,
    getProductByQR: window.DB.getProductByQR,
    
    // Movimientos
    addMovement: addMovementHybrid,
    getAllMovements: getAllMovementsHybrid,
    getMovementsByProduct: getMovementsByProductHybrid,
    syncPendingMovements: syncPendingMovements,
    
    // Categorías
    getAllCategories: window.DB.getAllCategories
};

console.log('✅ sync.js cargado - Sistema híbrido completo (Productos + Movimientos)');