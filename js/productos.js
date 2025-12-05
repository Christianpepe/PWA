/* ========================================
   productos.js - CORREGIDO
   Ahora descarga productos de Firebase al iniciar
   ======================================== */

let currentProductId = null;
let allProducts = [];
let categories = [];

/* ========================================
   Inicialización - CORREGIDA
   ======================================== */
async function initProductos() {
    try {
        console.log('🛒 Inicializando módulo de productos...');
        
        // VERIFICAR AUTENTICACIÓN
        if (!isUserAuthenticated()) {
            console.log('❌ Usuario no autenticado, redirigiendo...');
            window.location.href = 'login.html';
            return;
        }
        
        // Mostrar indicador de carga
        showLoadingIndicator();
        
        // 0. Esperar a que Firebase esté listo
        console.log('⏳ Esperando que Firebase esté disponible...');
        let attempt = 0;
        while (!window.FirebaseDB && attempt < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempt++;
        }
        
        if (!window.FirebaseDB) {
            console.warn('⚠️ Firebase no se inicializó correctamente');
        } else {
            console.log('✅ Firebase disponible');
        }
        
        // 1. Inicializar sistema de sincronización híbrido
        await window.SyncDB.init();
        
        // 2. 🔥 NUEVO: Sincronizar desde Firebase PRIMERO
        console.log('🔄 Sincronizando productos desde Firebase...');
        
        if (navigator.onLine && window.FirebaseDB) {
            try {
                await window.SyncDB.syncDown(); // Descargar de Firebase → IndexedDB
                console.log('✅ Productos sincronizados desde Firebase');
            } catch (error) {
                console.warn('⚠️ No se pudo sincronizar desde Firebase:', error);
                // Continuar con datos locales si hay error
            }
        } else {
            console.log('📴 Sin conexión - Usando datos locales');
        }
        
        // 3. Limpiar duplicados
        if (typeof window.cleanIndexedDB === 'function') {
            await window.cleanIndexedDB();
        }
        
        // 4. Cargar categorías
        await loadCategories();
        
        // 5. Cargar productos (ahora ya descargados de Firebase)
        await loadProducts();
        
        // 6. Setup event listeners
        setupEventListeners();
        
        // 7. Verificar si viene del escaneo
        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('edit');
        if (editId) {
            const productId = parseInt(editId);
            editProduct(productId);
        }
        
        // Ocultar indicador de carga
        hideLoadingIndicator();
        
        console.log('✅ Módulo de productos listo (Con sincronización Firebase)');
        
    } catch (error) {
        console.error('❌ Error al inicializar productos:', error);
        hideLoadingIndicator();
        showError('Error al cargar productos. Intenta recargar la página.');
    }
}

/* ========================================
   Indicadores de Carga
   ======================================== */
function showLoadingIndicator() {
    if (window.UI && typeof window.UI.showLoadingIndicator === 'function') {
        window.UI.showLoadingIndicator();
        return;
    }

    // Fallback: create a loading indicator element (uses CSS .spinner)
    if (document.getElementById('loadingIndicator')) return;
    const indicator = document.createElement('div');
    indicator.id = 'loadingIndicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;gap:.5rem;">
            <div class="spinner" aria-hidden="true"></div>
            <span>Sincronizando productos...</span>
        </div>
    `;
    document.body.appendChild(indicator);
}

function hideLoadingIndicator() {
    if (window.UI && typeof window.UI.hideLoadingIndicator === 'function') {
        window.UI.hideLoadingIndicator();
        return;
    }

    const indicator = document.getElementById('loadingIndicator');
    if (indicator) indicator.remove();
}

function showError(message) {
    if (window.UI && typeof window.UI.showError === 'function') {
        window.UI.showError(message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'toast error-toast';
    toast.setAttribute('role', 'alert');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('fade-out'), 320);
    setTimeout(() => toast.remove(), 6000);
}

function showSuccess(message) {
    if (window.UI && typeof window.UI.showSuccess === 'function') {
        window.UI.showSuccess(message);
        return;
    }

    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('fade-out'), 320);
    setTimeout(() => toast.remove(), 3600);
}

/* ========================================
   Cargar Datos
   ======================================== */
async function loadCategories() {
    try {
        categories = await window.SyncDB.getAllCategories();
        
        // Llenar selects de categorías
        const selects = [
            document.getElementById('productCategory'),
            document.getElementById('filterCategory')
        ];
        
        selects.forEach(select => {
            if (!select) return;
            
            // Limpiar opciones existentes (excepto la primera)
            while (select.options.length > 1) {
                select.remove(1);
            }
            
            // Agregar categorías
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat.name;
                option.textContent = cat.name;
                select.appendChild(option);
            });
        });
        
        console.log(`✅ ${categories.length} categorías cargadas`);
        
    } catch (error) {
        console.error('Error al cargar categorías:', error);
    }
}

async function loadProducts(filter = '') {
    try {
        console.log('📦 Cargando productos...');
        
        // Obtener productos según filtro (ya están sincronizados)
        if (filter) {
            allProducts = await window.SyncDB.filterByCategory(filter);
        } else {
            allProducts = await window.SyncDB.getAllProducts();
        }
        
        console.log(`📦 ${allProducts.length} productos cargados`);
        
        // Renderizar
        renderProducts(allProducts);
        updateProductCount(allProducts.length);
        
    } catch (error) {
        console.error('Error al cargar productos:', error);
        showEmptyState();
    }
}

/* ========================================
   Renderizado
   ======================================== */
function renderProducts(products) {
    const container = document.getElementById('productsList');
    const emptyState = document.getElementById('emptyState');
    
    if (!products || products.length === 0) {
        showEmptyState();
        return;
    }
    
    // Ocultar empty state
    if (emptyState) emptyState.classList.add('hidden');
    
    // Eliminar duplicados por ID
    const uniqueProducts = [];
    const seenIds = new Set();
    
    products.forEach(product => {
        const uniqueId = product.firestoreId || product.id;
        
        if (!seenIds.has(uniqueId)) {
            seenIds.add(uniqueId);
            uniqueProducts.push(product);
        } else {
            console.warn('⚠️ Producto duplicado detectado (ignorado):', product.name);
        }
    });
    
    console.log(`📊 Renderizando ${uniqueProducts.length} productos únicos`);
    
    // Renderizar productos únicos
    container.innerHTML = uniqueProducts.map(product => createProductCard(product)).join('');
    
    // Agregar event listeners a las tarjetas
    container.querySelectorAll('.product-card').forEach(card => {
        const id = parseInt(card.dataset.id);
        
        // Click en tarjeta = ver detalles
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.product-actions')) {
                viewProductDetails(id);
            }
        });
        
        // Botón editar
        const btnEdit = card.querySelector('.btn-edit');
        if (btnEdit) {
            btnEdit.addEventListener('click', (e) => {
                e.stopPropagation();
                editProduct(id);
            });
        }
        
        // Botón eliminar
        const btnDelete = card.querySelector('.btn-delete');
        if (btnDelete) {
            btnDelete.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteProduct(id);
            });
        }
    });
}

function createProductCard(product) {
    const category = categories.find(c => c.name === product.category);
    const categoryColor = category ? category.color : '#6b7280';
    
    // Determinar clase de stock
    let stockClass = 'stock-high';
    if (product.quantity < 5) {
        stockClass = 'stock-low';
    } else if (product.quantity < 20) {
        stockClass = 'stock-medium';
    }
    
    return `
        <div class="product-card" data-id="${product.id}">
            <div class="product-header">
                <span class="product-category" style="background-color: ${categoryColor}20; color: ${categoryColor}">
                    ${product.category}
                </span>
                <div class="product-actions">
                    <button class="btn-icon btn-edit" title="Editar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                    </button>
                    <button class="btn-icon btn-delete" title="Eliminar">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
            
            <h3 class="product-name">${escapeHtml(product.name)}</h3>
            <p class="product-description">${escapeHtml(product.description || 'Sin descripción')}</p>
            
            <div class="product-info">
                <span class="product-price">$${formatPrice(product.price)}</span>
                <span class="product-stock ${stockClass}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                    </svg>
                    ${product.quantity}
                </span>
            </div>
        </div>
    `;
}

function showEmptyState() {
    const container = document.getElementById('productsList');
    const emptyState = document.getElementById('emptyState');
    
    if (container) container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
}

function updateProductCount(count) {
    const badge = document.getElementById('productCount');
    if (badge) {
        badge.textContent = `${count} producto${count !== 1 ? 's' : ''}`;
    }
}

/* ========================================
   Modal: Agregar/Editar
   ======================================== */
function openAddModal() {
    currentProductId = null;
    
    document.getElementById('modalTitle').textContent = 'Agregar Producto';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productQR').value = '';
    
    document.getElementById('productModal').classList.remove('hidden');
    // Lock background scroll when modal is open
    document.body.classList.add('modal-open');
    
    // Vibrar
    if ('vibrate' in navigator) {
        navigator.vibrate(50);
    }
}

async function editProduct(id) {
    try {
        const product = await window.SyncDB.getProductById(id);
        
        if (!product) {
            alert('Producto no encontrado');
            return;
        }
        
        currentProductId = id;
        
        // Llenar formulario
        document.getElementById('modalTitle').textContent = 'Editar Producto';
        document.getElementById('productId').value = product.id;
        document.getElementById('productName').value = product.name;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productQuantity').value = product.quantity;
        document.getElementById('productCategory').value = product.category;
        document.getElementById('productQR').value = product.qrCode;
        
        document.getElementById('productModal').classList.remove('hidden');
        
        // Vibrar
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
        
    } catch (error) {
        console.error('Error al editar producto:', error);
        alert('Error al cargar producto');
    }
}

function closeModal() {
    document.getElementById('productModal').classList.add('hidden');
    currentProductId = null;
    document.body.classList.remove('modal-open');
}

/* ========================================
   Guardar Producto
   ======================================== */
async function saveProduct(event) {
    event.preventDefault();
    
    const btnSave = document.getElementById('btnSave');
    btnSave.disabled = true;
    btnSave.textContent = 'Guardando...';
    
    try {
        const productData = {
            name: document.getElementById('productName').value.trim(),
            description: document.getElementById('productDescription').value.trim(),
            price: parseFloat(document.getElementById('productPrice').value),
            quantity: parseInt(document.getElementById('productQuantity').value),
            category: document.getElementById('productCategory').value
        };
        
        // Validaciones
        if (!productData.name || !productData.category) {
            alert('Por favor completa los campos requeridos');
            return;
        }
        
        if (productData.price < 0 || productData.quantity < 0) {
            alert('Precio y cantidad deben ser positivos');
            return;
        }
        
        // Guardar
        if (currentProductId) {
            // Actualizar
            await window.SyncDB.updateProduct(currentProductId, productData);
            console.log('✅ Producto actualizado:', currentProductId);
            
            // Vibrar
            if ('vibrate' in navigator) {
                navigator.vibrate([50, 50, 50]);
            }
        } else {
            // Crear nuevo
            const id = await window.SyncDB.addProduct(productData);
            console.log('✅ Producto creado:', id);
            
            // Vibrar
            if ('vibrate' in navigator) {
                navigator.vibrate(200);
            }
        }
        
        // Recargar lista
        await loadProducts();
        
        // Cerrar modal
        closeModal();
        
    } catch (error) {
        console.error('Error al guardar producto:', error);
        alert('Error al guardar. ' + error.message);
    } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Guardar';
    }
}

/* ========================================
   Eliminar Producto
   ======================================== */
async function deleteProduct(id) {
    try {
        const product = await window.SyncDB.getProductById(id);
        
        if (!product) {
            alert('Producto no encontrado');
            return;
        }
        
        const confirmed = confirm(
            `¿Eliminar "${product.name}"?\n\nEsta acción no se puede deshacer.`
        );
        
        if (!confirmed) return;
        
        await window.SyncDB.deleteProduct(id);
        console.log('✅ Producto eliminado:', id);
        
        // Vibrar
        if ('vibrate' in navigator) {
            navigator.vibrate([100, 50, 100]);
        }
        
        // Recargar lista
        await loadProducts();
        
    } catch (error) {
        console.error('Error al eliminar producto:', error);
        alert('Error al eliminar producto');
    }
}

/* ========================================
   Ver Detalles
   ======================================== */
async function viewProductDetails(id) {
    try {
        const product = await window.SyncDB.getProductById(id);
        
        if (!product) {
            alert('Producto no encontrado');
            return;
        }
        
        // Llenar modal de detalles
        document.getElementById('detailName').textContent = product.name;
        document.getElementById('detailDescription').textContent = product.description || 'Sin descripción';
        document.getElementById('detailPrice').textContent = '$' + formatPrice(product.price);
        document.getElementById('detailQuantity').textContent = product.quantity;
        document.getElementById('detailCategory').textContent = product.category;
        document.getElementById('detailQR').textContent = product.qrCode;
        
        // Generar código QR
        const qrContainer = document.getElementById('qrContainer');
        qrContainer.innerHTML = '';
        
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: product.qrCode,
                width: 200,
                height: 200,
                colorDark: '#000000',
                colorLight: '#ffffff',
                correctLevel: QRCode.CorrectLevel.H
            });
        } else {
            qrContainer.innerHTML = '<p>Librería QR no disponible</p>';
        }
        
        // Botón editar desde detalles
        document.getElementById('btnEditFromDetails').onclick = () => {
            closeDetailsModal();
            editProduct(id);
        };
        
        // Mostrar modal
        document.getElementById('detailsModal').classList.remove('hidden');
        document.body.classList.add('modal-open');
        
        // Vibrar
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
        
    } catch (error) {
        console.error('Error al ver detalles:', error);
        alert('Error al cargar detalles');
    }
}

function closeDetailsModal() {
    document.getElementById('detailsModal').classList.add('hidden');
    document.body.classList.remove('modal-open');
}

/* ========================================
   Búsqueda y Filtros
   ======================================== */
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        
        searchTimeout = setTimeout(async () => {
            const query = e.target.value.trim();
            
            if (query.length === 0) {
                // Mostrar todos
                renderProducts(allProducts);
                updateProductCount(allProducts.length);
            } else if (query.length >= 2) {
                // Buscar
                const results = await window.SyncDB.searchProducts(query);
                renderProducts(results);
                updateProductCount(results.length);
            }
        }, 300);
    });
}

function setupCategoryFilter() {
    const filterSelect = document.getElementById('filterCategory');
    
    filterSelect.addEventListener('change', async (e) => {
        const category = e.target.value;
        await loadProducts(category);
    });
}

/* ========================================
   Event Listeners
   ======================================== */
function setupEventListeners() {
    // Botón agregar producto
    const btnAdd = document.getElementById('btnAddProduct');
    if (btnAdd) {
        btnAdd.addEventListener('click', openAddModal);
    }
    
    // Formulario de producto
    const form = document.getElementById('productForm');
    if (form) {
        form.addEventListener('submit', saveProduct);
    }
    
    // Búsqueda
    setupSearch();
    
    // Filtro de categoría
    setupCategoryFilter();
    
    // Click fuera del modal para cerrar
    document.getElementById('productModal').addEventListener('click', (e) => {
        if (e.target.id === 'productModal') {
            closeModal();
        }
    });
    
    document.getElementById('detailsModal').addEventListener('click', (e) => {
        if (e.target.id === 'detailsModal') {
            closeDetailsModal();
        }
    });
}

/* ========================================
   Utilidades
   ======================================== */
function formatPrice(price) {
    return price.toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/* ========================================
   Auto-inicialización
   ======================================== */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductos);
} else {
    initProductos();
}

console.log('✅ productos.js cargado (Con sincronización automática)');