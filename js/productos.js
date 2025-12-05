/* ========================================
   productos.js - CORREGIDO PARA OFFLINE
   Ya NO espera a Firebase para funcionar
   ======================================== */

let currentProductId = null;
let allProducts = [];
let categories = [];

async function initProductos() {
    try {
        console.log('🛒 Inicializando módulo de productos...');
        
        // VERIFICAR AUTENTICACIÓN
        if (!isUserAuthenticated()) {
            console.log('❌ Usuario no autenticado');
            window.location.href = 'login.html';
            return;
        }
        
        showLoadingIndicator();
        
        // 1. INICIALIZAR SISTEMA LOCAL (NO ESPERAR A FIREBASE)
        console.log('📦 Inicializando sistema local...');
        await window.SyncDB.init();
        
        // 2. CARGAR DATOS LOCALES INMEDIATAMENTE
        console.log('📦 Cargando datos locales...');
        await loadCategories();
        await loadProducts();
        
        // 3. SINCRONIZAR EN BACKGROUND SOLO SI HAY CONEXIÓN
        if (navigator.onLine) {
            console.log('🌐 Sincronizando en background...');
            syncInBackground();
        } else {
            console.log('📴 Offline - Trabajando solo con datos locales');
        }
        
        // 4. SETUP
        setupEventListeners();
        
        // 5. VERIFICAR URL PARAMS
        const urlParams = new URLSearchParams(window.location.search);
        const editId = urlParams.get('edit');
        if (editId) {
            editProduct(parseInt(editId));
        }
        
        hideLoadingIndicator();
        console.log('✅ Módulo de productos listo');
        
    } catch (error) {
        console.error('❌ Error:', error);
        hideLoadingIndicator();
        showError('Error al cargar. La app seguirá funcionando offline.');
    }
}

/* ========================================
   Sincronización en Background
   ======================================== */
async function syncInBackground() {
    try {
        // No bloquear la UI
        setTimeout(async () => {
            console.log('🔄 Sincronizando...');
            
            // Subir cambios locales
            await window.SyncDB.syncUp();
            
            // Descargar cambios remotos
            await window.SyncDB.syncDown();
            
            // Recargar productos
            await loadProducts();
            
            console.log('✅ Sincronización en background completada');
            
        }, 1000); // Delay de 1 segundo
        
    } catch (error) {
        console.warn('⚠️ Error en sincronización background:', error);
        // No mostrar error al usuario, seguir trabajando offline
    }
}

/* ========================================
   UI Helpers
   ======================================== */
function showLoadingIndicator() {
    if (window.UI && typeof window.UI.showLoadingIndicator === 'function') {
        window.UI.showLoadingIndicator();
        return;
    }

    if (document.getElementById('loadingIndicator')) return;
    
    const indicator = document.createElement('div');
    indicator.id = 'loadingIndicator';
    indicator.innerHTML = `
        <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
                    background:white;padding:20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);
                    display:flex;align-items:center;gap:12px;z-index:10000;">
            <div class="spinner" style="width:24px;height:24px;border:3px solid #e5e7eb;
                border-top-color:#2563eb;border-radius:50%;animation:spin 0.8s linear infinite;"></div>
            <span style="font-weight:500;color:#374151;">Cargando productos...</span>
        </div>
        <style>
            @keyframes spin { to { transform: rotate(360deg); } }
        </style>
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
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed;top:20px;right:20px;background:#ef4444;color:white;
        padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);
        z-index:10000;animation:slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 5000);
}

function showSuccess(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed;top:20px;right:20px;background:#10b981;color:white;
        padding:12px 20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.2);
        z-index:10000;animation:slideIn 0.3s ease-out;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 3000);
}

/* ========================================
   Cargar Datos - SIEMPRE LOCAL
   ======================================== */
async function loadCategories() {
    try {
        categories = await window.SyncDB.getAllCategories();
        
        const selects = [
            document.getElementById('productCategory'),
            document.getElementById('filterCategory')
        ];
        
        selects.forEach(select => {
            if (!select) return;
            
            while (select.options.length > 1) {
                select.remove(1);
            }
            
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
        
        // SIEMPRE obtener de IndexedDB local
        if (filter) {
            allProducts = await window.SyncDB.filterByCategory(filter);
        } else {
            allProducts = await window.SyncDB.getAllProducts();
        }
        
        console.log(`📦 ${allProducts.length} productos cargados (local)`);
        
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
    
    if (emptyState) emptyState.classList.add('hidden');
    
    // Eliminar duplicados
    const uniqueProducts = [];
    const seenIds = new Set();
    
    products.forEach(product => {
        const uniqueId = product.firestoreId || product.id;
        
        if (!seenIds.has(uniqueId)) {
            seenIds.add(uniqueId);
            uniqueProducts.push(product);
        }
    });
    
    console.log(`📊 Renderizando ${uniqueProducts.length} productos únicos`);
    
    container.innerHTML = uniqueProducts.map(product => createProductCard(product)).join('');
    
    // Event listeners
    container.querySelectorAll('.product-card').forEach(card => {
        const id = parseInt(card.dataset.id);
        
        card.addEventListener('click', (e) => {
            if (!e.target.closest('.product-actions')) {
                viewProductDetails(id);
            }
        });
        
        const btnEdit = card.querySelector('.btn-edit');
        if (btnEdit) {
            btnEdit.addEventListener('click', (e) => {
                e.stopPropagation();
                editProduct(id);
            });
        }
        
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
   Modal y CRUD
   ======================================== */
function openAddModal() {
    currentProductId = null;
    
    document.getElementById('modalTitle').textContent = 'Agregar Producto';
    document.getElementById('productForm').reset();
    document.getElementById('productId').value = '';
    document.getElementById('productQR').value = '';
    
    document.getElementById('productModal').classList.remove('hidden');
    document.body.classList.add('modal-open');
    
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
        
        document.getElementById('modalTitle').textContent = 'Editar Producto';
        document.getElementById('productId').value = product.id;
        document.getElementById('productName').value = product.name;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productQuantity').value = product.quantity;
        document.getElementById('productCategory').value = product.category;
        document.getElementById('productQR').value = product.qrCode;
        
        document.getElementById('productModal').classList.remove('hidden');
        
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
        
    } catch (error) {
        console.error('Error al editar:', error);
        alert('Error al cargar producto');
    }
}

function closeModal() {
    document.getElementById('productModal').classList.add('hidden');
    currentProductId = null;
    document.body.classList.remove('modal-open');
}

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
        
        if (!productData.name || !productData.category) {
            alert('Por favor completa los campos requeridos');
            return;
        }
        
        if (productData.price < 0 || productData.quantity < 0) {
            alert('Precio y cantidad deben ser positivos');
            return;
        }
        
        if (currentProductId) {
            await window.SyncDB.updateProduct(currentProductId, productData);
            console.log('✅ Producto actualizado');
            showSuccess('Producto actualizado correctamente');
            
            if ('vibrate' in navigator) {
                navigator.vibrate([50, 50, 50]);
            }
        } else {
            await window.SyncDB.addProduct(productData);
            console.log('✅ Producto creado');
            showSuccess('Producto agregado correctamente');
            
            if ('vibrate' in navigator) {
                navigator.vibrate(200);
            }
        }
        
        await loadProducts();
        closeModal();
        
    } catch (error) {
        console.error('Error al guardar:', error);
        alert('Error al guardar. ' + error.message);
    } finally {
        btnSave.disabled = false;
        btnSave.textContent = 'Guardar';
    }
}

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
        console.log('✅ Producto eliminado');
        showSuccess('Producto eliminado correctamente');
        
        if ('vibrate' in navigator) {
            navigator.vibrate([100, 50, 100]);
        }
        
        await loadProducts();
        
    } catch (error) {
        console.error('Error al eliminar:', error);
        alert('Error al eliminar producto');
    }
}

async function viewProductDetails(id) {
    try {
        const product = await window.SyncDB.getProductById(id);
        
        if (!product) {
            alert('Producto no encontrado');
            return;
        }
        
        document.getElementById('detailName').textContent = product.name;
        document.getElementById('detailDescription').textContent = product.description || 'Sin descripción';
        document.getElementById('detailPrice').textContent = '$' + formatPrice(product.price);
        document.getElementById('detailQuantity').textContent = product.quantity;
        document.getElementById('detailCategory').textContent = product.category;
        document.getElementById('detailQR').textContent = product.qrCode;
        
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
        
        document.getElementById('btnEditFromDetails').onclick = () => {
            closeDetailsModal();
            editProduct(id);
        };
        
        document.getElementById('detailsModal').classList.remove('hidden');
        document.body.classList.add('modal-open');
        
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
                renderProducts(allProducts);
                updateProductCount(allProducts.length);
            } else if (query.length >= 2) {
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

function setupEventListeners() {
    const btnAdd = document.getElementById('btnAddProduct');
    if (btnAdd) {
        btnAdd.addEventListener('click', openAddModal);
    }
    
    const form = document.getElementById('productForm');
    if (form) {
        form.addEventListener('submit', saveProduct);
    }
    
    setupSearch();
    setupCategoryFilter();
    
    document.getElementById('productModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'productModal') {
            closeModal();
        }
    });
    
    document.getElementById('detailsModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'detailsModal') {
            closeDetailsModal();
        }
    });
}

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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductos);
} else {
    initProductos();
}

console.log('✅ productos.js cargado (OFFLINE FIRST)');