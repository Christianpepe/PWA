/* ========================================
   escanear.js - CORREGIDO PARA OFFLINE
   Escaneo QR que funciona sin conexión
   ======================================== */

let video = null;
let canvasElement = null;
let canvas = null;
let scannerActive = false;
let currentProduct = null;
let scanTimeout = null;

async function initScanner() {
    try {
        console.log('📱 Inicializando módulo de escaneo...');
        
        // Verificar autenticación
        if (!isUserAuthenticated()) {
            console.log('❌ Usuario no autenticado');
            window.location.href = 'login.html';
            return;
        }
        
        // CRÍTICO: Inicializar sistema local (no esperar Firebase)
        try {
            await window.SyncDB.init();
            console.log('✅ Sistema local inicializado');
        } catch (error) {
            console.warn('⚠️ Error inicializando:', error);
        }
        
        // Elementos DOM
        video = document.getElementById('video');
        canvasElement = document.createElement('canvas');
        canvas = canvasElement.getContext('2d');
        
        setupEventListeners();
        
        console.log('✅ Escáner listo (funciona offline)');
        
    } catch (error) {
        console.error('❌ Error:', error);
        showError('Error al inicializar el escáner');
    }
}

/* ========================================
   Cámara
   ======================================== */
async function startScanner() {
    try {
        console.log('📷 Iniciando cámara...');
        
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });
        
        video.srcObject = stream;
        video.play();
        
        scannerActive = true;
        console.log('✅ Cámara iniciada');
        
        scan();
        
    } catch (error) {
        console.error('❌ Error:', error);
        
        if (error.name === 'NotAllowedError') {
            showError('Permiso denegado. Habilita el acceso a la cámara.');
        } else if (error.name === 'NotFoundError') {
            showError('No se encontró cámara en este dispositivo.');
        } else {
            showError('Error al acceder a la cámara: ' + error.message);
        }
    }
}

function stopScanner() {
    console.log('⏹️ Deteniendo cámara...');
    
    if (video && video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
    }
    
    scannerActive = false;
    clearTimeout(scanTimeout);
    
    console.log('✅ Cámara detenida');
}

/* ========================================
   Escaneo
   ======================================== */
function scan() {
    if (!scannerActive) return;
    
    try {
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        
        canvas.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        
        const imageData = canvas.getImageData(0, 0, video.videoWidth, video.videoHeight);
        
        // Escanear código QR
        if (typeof jsQR !== 'undefined') {
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert',
            });
            
            if (code) {
                console.log('✅ QR detectado:', code.data);
                stopScanner();
                searchByQRCode(code.data);
            }
        } else {
            console.warn('⚠️ Librería jsQR no cargada');
        }
        
    } catch (error) {
        console.error('Error en escaneo:', error);
    }
    
    scanTimeout = requestAnimationFrame(scan);
}

/* ========================================
   Búsqueda - SIEMPRE LOCAL
   ======================================== */
async function searchByQRCode(qrCode = null) {
    try {
        if (!qrCode) {
            qrCode = document.getElementById('manualQRCode').value.trim();
            if (!qrCode) {
                showError('Por favor ingresa un código QR');
                return;
            }
            closeManualModal();
        }
        
        console.log('🔍 Buscando QR:', qrCode);
        
        // CRÍTICO: Buscar SIEMPRE en IndexedDB local
        const product = await window.SyncDB.getProductByQR(qrCode);
        
        if (product) {
            console.log('✅ Producto encontrado:', product);
            currentProduct = product;
            displayProduct(product);
            showSuccess('Producto encontrado');
        } else {
            console.warn('⚠️ Producto no encontrado:', qrCode);
            showError('No se encontró producto con este código QR');
            showEmptyState();
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        showError('Error al buscar el producto');
    }
}

/* ========================================
   Mostrar Producto
   ======================================== */
function displayProduct(product) {
    try {
        const resultContainer = document.getElementById('resultContainer');
        const productResult = document.getElementById('productResult');
        const emptyState = document.getElementById('emptyState');
        
        resultContainer.classList.remove('hidden');
        productResult.classList.remove('hidden');
        emptyState.classList.add('hidden');
        
        document.getElementById('resultName').textContent = product.name;
        document.getElementById('resultCategory').textContent = product.category;
        document.getElementById('resultCategoryFull').textContent = product.category;
        document.getElementById('resultPrice').textContent = '$' + formatPrice(product.price);
        document.getElementById('resultQR').textContent = product.qrCode;
        document.getElementById('resultStock').textContent = product.quantity;
        
        const descElement = document.getElementById('resultDescription');
        if (product.description) {
            descElement.textContent = product.description;
            descElement.classList.remove('hidden');
        } else {
            descElement.classList.add('hidden');
        }
        
        const stockIndicator = document.getElementById('stockIndicator');
        if (product.quantity < 5) {
            stockIndicator.className = 'stock-indicator critical';
        } else if (product.quantity < 20) {
            stockIndicator.className = 'stock-indicator low';
        } else {
            stockIndicator.className = 'stock-indicator';
        }
        
        const updatedDate = new Date(product.updatedAt);
        document.getElementById('resultUpdated').textContent = updatedDate.toLocaleDateString('es-MX');
        
        console.log('✅ Producto mostrado');
        
    } catch (error) {
        console.error('Error mostrando producto:', error);
        showError('Error al mostrar el producto');
    }
}

/* ========================================
   UI
   ======================================== */
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

function showEmptyState() {
    const resultContainer = document.getElementById('resultContainer');
    const productResult = document.getElementById('productResult');
    const emptyState = document.getElementById('emptyState');
    
    resultContainer.classList.remove('hidden');
    productResult.classList.add('hidden');
    emptyState.classList.remove('hidden');
}

function openManualModal() {
    document.getElementById('manualInputModal').classList.remove('hidden');
    document.getElementById('manualQRCode').focus();
}

function closeManualModal() {
    document.getElementById('manualInputModal').classList.add('hidden');
    document.getElementById('manualQRCode').value = '';
}

function editProduct() {
    if (!currentProduct) {
        showError('No hay producto seleccionado');
        return;
    }
    
    window.location.href = `productos.html?edit=${currentProduct.id}`;
}

function newScan() {
    currentProduct = null;
    document.getElementById('manualQRCode').value = '';
    showEmptyState();
    
    if (!scannerActive) {
        startScanner();
    }
}

/* ========================================
   Event Listeners
   ======================================== */
function setupEventListeners() {
    document.getElementById('btnStartScanner').addEventListener('click', startScanner);
    document.getElementById('btnStopScanner').addEventListener('click', stopScanner);
    document.getElementById('btnManualInput').addEventListener('click', openManualModal);
    
    document.getElementById('btnEditProduct').addEventListener('click', editProduct);
    document.getElementById('btnNewScan').addEventListener('click', newScan);
    
    document.getElementById('manualInputModal').addEventListener('click', (e) => {
        if (e.target.id === 'manualInputModal') {
            closeManualModal();
        }
    });
    
    document.getElementById('manualQRCode').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchByQRCode();
        }
    });
}

function formatPrice(price) {
    return price.toLocaleString('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/* ========================================
   Auto-inicialización
   ======================================== */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScanner);
} else {
    initScanner();
}

window.addEventListener('beforeunload', () => {
    stopScanner();
});

console.log('✅ escanear.js cargado (OFFLINE FIRST)');