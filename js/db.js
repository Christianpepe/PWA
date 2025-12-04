/* ========================================
   db.js - Gestor de IndexedDB
   Base de datos local para PWA
   ======================================== */

const DB_NAME = 'SafeProductsDB';
const DB_VERSION = 1;
const STORES = {
    PRODUCTS: 'products',
    MOVEMENTS: 'movements',
    CATEGORIES: 'categories',
    USERS: 'users'
};

let db = null;

/* ========================================
   Inicializar Base de Datos
   ======================================== */
async function initDB() {
    return new Promise((resolve, reject) => {
        console.log('📦 Inicializando IndexedDB...');
        
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        // Crear/actualizar estructura
        request.onupgradeneeded = (event) => {
            db = event.target.result;
            console.log('🔧 Creando estructura de DB...');
            
            // Store de Productos
            if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
                const productStore = db.createObjectStore(STORES.PRODUCTS, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                
                // Índices para búsquedas rápidas
                productStore.createIndex('name', 'name', { unique: false });
                productStore.createIndex('category', 'category', { unique: false });
                productStore.createIndex('qrCode', 'qrCode', { unique: true });
                productStore.createIndex('firestoreId', 'firestoreId', { unique: false });
                productStore.createIndex('quantity', 'quantity', { unique: false });
                
                console.log('✅ Store "products" creado');
            }
            
            // Store de Movimientos
            if (!db.objectStoreNames.contains(STORES.MOVEMENTS)) {
                const movementStore = db.createObjectStore(STORES.MOVEMENTS, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                
                movementStore.createIndex('productId', 'productId', { unique: false });
                movementStore.createIndex('type', 'type', { unique: false });
                movementStore.createIndex('date', 'date', { unique: false });
                
                console.log('✅ Store "movements" creado');
            }
            
            // Store de Categorías
            if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
                const categoryStore = db.createObjectStore(STORES.CATEGORIES, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                
                categoryStore.createIndex('name', 'name', { unique: true });
                
                console.log('✅ Store "categories" creado');
                
                // Insertar categorías por defecto
                categoryStore.transaction.oncomplete = () => {
                    insertDefaultCategories();
                };
            }
            
            // Store de Usuarios
            if (!db.objectStoreNames.contains(STORES.USERS)) {
                const userStore = db.createObjectStore(STORES.USERS, {
                    keyPath: 'id',
                    autoIncrement: true
                });
                
                userStore.createIndex('email', 'email', { unique: true });
                
                console.log('✅ Store "users" creado');
            }
        };
        
        request.onsuccess = (event) => {
            db = event.target.result;
            console.log('✅ IndexedDB inicializado correctamente');
            resolve(db);
        };
        
        request.onerror = (event) => {
            console.error('❌ Error al abrir IndexedDB:', event.target.error);
            reject(event.target.error);
        };
    });
}

/* ========================================
   Categorías por Defecto
   ======================================== */
async function insertDefaultCategories() {
    const defaultCategories = [
        { name: 'Electrónicos', color: '#3b82f6' },
        { name: 'Alimentos', color: '#10b981' },
        { name: 'Ropa', color: '#8b5cf6' },
        { name: 'Herramientas', color: '#f59e0b' },
        { name: 'Limpieza', color: '#06b6d4' },
        { name: 'Otros', color: '#6b7280' }
    ];
    
    for (const category of defaultCategories) {
        await addCategory(category);
    }
    
    console.log('✅ Categorías por defecto insertadas');
}

/* ========================================
   CRUD - PRODUCTOS
   ======================================== */

// Crear Producto
async function addProduct(product) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.PRODUCTS], 'readwrite');
            const store = transaction.objectStore(STORES.PRODUCTS);
            
            // Agregar timestamp y QR único
            const productData = {
                ...product,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                qrCode: product.qrCode || generateQRCode()
            };
            
            const request = store.add(productData);
            
            request.onsuccess = () => {
                console.log('✅ Producto agregado:', request.result);
                resolve(request.result); // Retorna el ID generado
            };
            
            request.onerror = () => {
                console.error('❌ Error al agregar producto:', request.error);
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Leer Todos los Productos
async function getAllProducts() {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.PRODUCTS], 'readonly');
            const store = transaction.objectStore(STORES.PRODUCTS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                console.log(`📦 ${request.result.length} productos obtenidos`);
                resolve(request.result);
            };
            
            request.onerror = () => {
                console.error('❌ Error al obtener productos:', request.error);
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Leer Producto por ID
async function getProductById(id) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.PRODUCTS], 'readonly');
            const store = transaction.objectStore(STORES.PRODUCTS);
            const request = store.get(id);
            
            request.onsuccess = () => {
                if (request.result) {
                    console.log('✅ Producto encontrado:', request.result);
                    resolve(request.result);
                } else {
                    console.warn(`⚠️ Producto ID ${id} no encontrado`);
                    resolve(null);
                }
            };
            
            request.onerror = () => {
                console.error('❌ Error al buscar producto:', request.error);
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Buscar Producto por QR
async function getProductByQR(qrCode) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.PRODUCTS], 'readonly');
            const store = transaction.objectStore(STORES.PRODUCTS);
            const index = store.index('qrCode');
            const request = index.get(qrCode);
            
            request.onsuccess = () => {
                resolve(request.result || null);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Actualizar Producto
async function updateProduct(id, updates) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.PRODUCTS], 'readwrite');
            const store = transaction.objectStore(STORES.PRODUCTS);
            
            // Primero obtener el producto actual
            const getRequest = store.get(id);
            
            getRequest.onsuccess = () => {
                const product = getRequest.result;
                
                if (!product) {
                    reject(new Error(`Producto ID ${id} no encontrado`));
                    return;
                }
                
                // Mergear cambios
                const updatedProduct = {
                    ...product,
                    ...updates,
                    updatedAt: new Date().toISOString()
                };
                
                const putRequest = store.put(updatedProduct);
                
                putRequest.onsuccess = () => {
                    console.log('✅ Producto actualizado:', id);
                    resolve(updatedProduct);
                };
                
                putRequest.onerror = () => {
                    console.error('❌ Error al actualizar:', putRequest.error);
                    reject(putRequest.error);
                };
            };
            
            getRequest.onerror = () => {
                reject(getRequest.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Eliminar Producto
async function deleteProduct(id) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.PRODUCTS], 'readwrite');
            const store = transaction.objectStore(STORES.PRODUCTS);
            const request = store.delete(id);
            
            request.onsuccess = () => {
                console.log('✅ Producto eliminado:', id);
                resolve(true);
            };
            
            request.onerror = () => {
                console.error('❌ Error al eliminar:', request.error);
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/* ========================================
   CRUD - MOVIMIENTOS
   ======================================== */

// Registrar Movimiento (Entrada/Salida)
async function addMovement(movement) {
    return new Promise(async (resolve, reject) => {
        try {
            // Validar que el producto existe
            const product = await getProductById(movement.productId);
            if (!product) {
                reject(new Error('Producto no encontrado'));
                return;
            }
            
            const transaction = db.transaction([STORES.MOVEMENTS, STORES.PRODUCTS], 'readwrite');
            const movementStore = transaction.objectStore(STORES.MOVEMENTS);
            const productStore = transaction.objectStore(STORES.PRODUCTS);
            
            // Crear movimiento
            const movementData = {
                ...movement,
                date: new Date().toISOString(),
                productName: product.name
            };
            
            const addRequest = movementStore.add(movementData);
            
            addRequest.onsuccess = () => {
                // Actualizar cantidad del producto
                let newQuantity = product.quantity;
                
                if (movement.type === 'entrada') {
                    newQuantity += movement.quantity;
                } else if (movement.type === 'salida') {
                    newQuantity -= movement.quantity;
                }
                
                // Validar que no sea negativo
                if (newQuantity < 0) {
                    transaction.abort();
                    reject(new Error('Stock insuficiente'));
                    return;
                }
                
                product.quantity = newQuantity;
                product.updatedAt = new Date().toISOString();
                
                productStore.put(product);
            };
            
            transaction.oncomplete = () => {
                console.log('✅ Movimiento registrado y stock actualizado');
                resolve(addRequest.result);
            };
            
            transaction.onerror = () => {
                console.error('❌ Error en transacción:', transaction.error);
                reject(transaction.error);
            };
            
        } catch (error) {
            reject(error);
        }
    });
}

// Obtener Todos los Movimientos
async function getAllMovements() {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.MOVEMENTS], 'readonly');
            const store = transaction.objectStore(STORES.MOVEMENTS);
            const request = store.getAll();
            
            request.onsuccess = () => {
                // Ordenar por fecha descendente
                const movements = request.result.sort((a, b) => 
                    new Date(b.date) - new Date(a.date)
                );
                resolve(movements);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

// Obtener Movimientos por Producto
async function getMovementsByProduct(productId) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.MOVEMENTS], 'readonly');
            const store = transaction.objectStore(STORES.MOVEMENTS);
            const index = store.index('productId');
            const request = index.getAll(productId);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/* ========================================
   CRUD - CATEGORÍAS
   ======================================== */

async function addCategory(category) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.CATEGORIES], 'readwrite');
            const store = transaction.objectStore(STORES.CATEGORIES);
            const request = store.add(category);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                // Ignorar error si ya existe
                resolve(null);
            };
        } catch (error) {
            resolve(null);
        }
    });
}

async function getAllCategories() {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.CATEGORIES], 'readonly');
            const store = transaction.objectStore(STORES.CATEGORIES);
            const request = store.getAll();
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/* ========================================
   ESTADÍSTICAS
   ======================================== */

async function getStats() {
    try {
        const products = await getAllProducts();
        const movements = await getAllMovements();
        
        // Total de productos
        const totalProducts = products.length;
        
        // Stock total
        const totalStock = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
        
        // Productos con stock bajo (menos de 10)
        const lowStock = products.filter(p => p.quantity < 10).length;
        
        // Movimientos de hoy
        const today = new Date().toISOString().split('T')[0];
        const todayMovements = movements.filter(m => 
            m.date.startsWith(today)
        ).length;
        
        return {
            totalProducts,
            totalStock,
            lowStock,
            todayMovements
        };
    } catch (error) {
        console.error('Error al calcular estadísticas:', error);
        return {
            totalProducts: 0,
            totalStock: 0,
            lowStock: 0,
            todayMovements: 0
        };
    }
}

/* ========================================
   BÚSQUEDA Y FILTROS
   ======================================== */

async function searchProducts(query) {
    try {
        const products = await getAllProducts();
        const lowerQuery = query.toLowerCase();
        
        return products.filter(p => 
            p.name.toLowerCase().includes(lowerQuery) ||
            p.description?.toLowerCase().includes(lowerQuery) ||
            p.qrCode.includes(query)
        );
    } catch (error) {
        console.error('Error en búsqueda:', error);
        return [];
    }
}

async function filterByCategory(category) {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([STORES.PRODUCTS], 'readonly');
            const store = transaction.objectStore(STORES.PRODUCTS);
            const index = store.index('category');
            const request = index.getAll(category);
            
            request.onsuccess = () => {
                resolve(request.result);
            };
            
            request.onerror = () => {
                reject(request.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/* ========================================
   UTILIDADES
   ======================================== */

function generateQRCode() {
    return 'SP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
}

// Limpiar toda la base de datos (para desarrollo)
async function clearAllData() {
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(
                [STORES.PRODUCTS, STORES.MOVEMENTS, STORES.CATEGORIES],
                'readwrite'
            );
            
            transaction.objectStore(STORES.PRODUCTS).clear();
            transaction.objectStore(STORES.MOVEMENTS).clear();
            transaction.objectStore(STORES.CATEGORIES).clear();
            
            transaction.oncomplete = () => {
                console.log('🗑️ Base de datos limpiada');
                insertDefaultCategories();
                resolve(true);
            };
            
            transaction.onerror = () => {
                reject(transaction.error);
            };
        } catch (error) {
            reject(error);
        }
    });
}

/* ========================================
   Exportar Funciones
   ======================================== */

// Hacer disponibles globalmente
window.DB = {
    init: initDB,
    
    // Productos
    addProduct,
    getAllProducts,
    getProductById,
    getProductByQR,
    updateProduct,
    deleteProduct,
    
    // Movimientos
    addMovement,
    getAllMovements,
    getMovementsByProduct,
    
    // Categorías
    getAllCategories,
    
    // Estadísticas
    getStats,
    
    // Búsqueda
    searchProducts,
    filterByCategory,
    
    // Utilidades
    clearAllData
};

// Función de utilidad para limpiar duplicados
window.cleanIndexedDB = async function() {
    console.log('🧹 Limpiando duplicados de IndexedDB...');
    try {
        const products = await window.DB.getAllProducts();
        const byFirestoreId = {};
        let deleted = 0;
        
        products.forEach(p => {
            if (p.firestoreId) {
                if (!byFirestoreId[p.firestoreId]) {
                    byFirestoreId[p.firestoreId] = [];
                }
                byFirestoreId[p.firestoreId].push(p);
            }
        });
        
        for (const [firestoreId, prods] of Object.entries(byFirestoreId)) {
            if (prods.length > 1) {
                prods.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                for (let i = 1; i < prods.length; i++) {
                    await window.DB.deleteProduct(prods[i].id);
                    deleted++;
                }
            }
        }
        
        console.log(`✅ Limpieza completada. ${deleted} duplicados eliminados`);
    } catch (error) {
        console.error('❌ Error limpiando:', error);
    }
};

console.log('✅ db.js cargado - IndexedDB Manager listo');
console.log('💡 Para limpiar duplicados manualmente, ejecuta: window.cleanIndexedDB()');