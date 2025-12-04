/* ========================================
   escanear.js - Lógica de Escaneo QR
   Leer códigos QR y mostrar productos
   ======================================== */

let video = null;
let canvasElement = null;
let canvas = null;
let scannerActive = false;
let currentProduct = null;
let scanTimeout = null;

/* ========================================
   Inicialización
   ======================================== */
async function initScanner() {
    try {
        console.log('📱 Inicializando módulo de escaneo...');
        
        // VERIFICAR AUTENTICACIÓN
        if (!isUserAuthenticated()) {
            console.log('❌ Usuario no autenticado, redirigiendo...');
            window.location.href = 'login.html';
            return;
        }
        
        // Inicializar sistema de sincronización
        await window.SyncDB.init();
        
        // Obtener elementos del DOM
        video = document.getElementById('video');
        canvasElement = document.createElement('canvas');
        canvas = canvasElement.getContext('2d');
        
        // Setup event listeners
        setupEventListeners();
        
        console.log('✅ Módulo de escaneo listo');
        
    } catch (error) {
        console.error('❌ Error al inicializar escaneo:', error);
        showError('Error al inicializar el escáner');
    }
}

/* ========================================
   Gestión de Cámara
   ======================================== */
async function startScanner() {
    try {
        console.log('📷 Iniciando cámara...');
        
        // Solicitar acceso a la cámara
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' },
            audio: false
        });
        
        video.srcObject = stream;
        video.play();
        
        scannerActive = true;
        
        console.log('✅ Cámara iniciada');
        
        // Comenzar a escanear
        scan();
        
    } catch (error) {
        console.error('❌ Error al acceder a cámara:', error);
        
        if (error.name === 'NotAllowedError') {
            showError('Permiso denegado. Habilita el acceso a la cámara en la configuración.');
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
   Escaneo de Códigos QR
   ======================================== */
function scan() {
    if (!scannerActive) return;
    
    try {
        // Obtener frame de video
        canvasElement.width = video.videoWidth;
        canvasElement.height = video.videoHeight;
        
        canvas.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        
        const imageData = canvas.getImageData(0, 0, video.videoWidth, video.videoHeight);
        
        // Escanear código QR
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
        });
        
        if (code) {
            console.log('✅ Código QR detectado:', code.data);
            stopScanner();
            searchByQRCode(code.data);
        }
        
    } catch (error) {
        console.error('Error en escaneo:', error);
    }
    
    // Continuar escaneando
    scanTimeout = requestAnimationFrame(scan);
}

/* ========================================
   Búsqueda de Productos
   ======================================== */
async function searchByQRCode(qrCode = null) {
    try {
        // Si no hay código, obtenerlo del input manual
        if (!qrCode) {
            qrCode = document.getElementById('manualQRCode').value.trim();
            if (!qrCode) {
                showError('Por favor ingresa un código QR');
                return;
            }
            closeManualModal();
        }
        
        console.log('🔍 Buscando producto con QR:', qrCode);
        
        // Buscar en IndexedDB
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
        console.error('❌ Error al buscar producto:', error);
        showError('Error al buscar el producto');
    }
}

/* ========================================
   Mostrar Producto
   ======================================== */
function displayProduct(product) {
    try {
        // Mostrar resultado
        const resultContainer = document.getElementById('resultContainer');
        const productResult = document.getElementById('productResult');
        const emptyState = document.getElementById('emptyState');
        
        resultContainer.classList.remove('hidden');
        productResult.classList.remove('hidden');
        emptyState.classList.add('hidden');
        
        // Llenar datos
        document.getElementById('resultName').textContent = product.name;
        document.getElementById('resultCategory').textContent = product.category;
        document.getElementById('resultCategoryFull').textContent = product.category;
        document.getElementById('resultPrice').textContent = '$' + formatPrice(product.price);
        document.getElementById('resultQR').textContent = product.qrCode;
        document.getElementById('resultStock').textContent = product.quantity;
        
        // Descripción
        const descElement = document.getElementById('resultDescription');
        if (product.description) {
            descElement.textContent = product.description;
            descElement.classList.remove('hidden');
        } else {
            descElement.classList.add('hidden');
        }
        
        // Indicador de stock
        const stockIndicator = document.getElementById('stockIndicator');
        if (product.quantity < 5) {
            stockIndicator.className = 'stock-indicator critical';
        } else if (product.quantity < 20) {
            stockIndicator.className = 'stock-indicator low';
        } else {
            stockIndicator.className = 'stock-indicator';
        }
        
        // Fecha actualización
        const updatedDate = new Date(product.updatedAt);
        document.getElementById('resultUpdated').textContent = updatedDate.toLocaleDateString('es-MX');
        
        console.log('✅ Producto mostrado en pantalla');
        
    } catch (error) {
        console.error('Error al mostrar producto:', error);
        showError('Error al mostrar el producto');
    }
}

/* ========================================
   Mensajes
   ======================================== */
function showError(message) {
    const errorElement = document.getElementById('errorMessage');
    errorElement.textContent = message;
    errorElement.classList.remove('hidden');
    
    // Ocultar después de 5 segundos
    setTimeout(() => {
        errorElement.classList.add('hidden');
    }, 5000);
}

function showSuccess(message) {
    const successElement = document.getElementById('successMessage');
    successElement.textContent = message;
    successElement.classList.remove('hidden');
    
    // Ocultar después de 3 segundos
    setTimeout(() => {
        successElement.classList.add('hidden');
    }, 3000);
}

function showEmptyState() {
    const resultContainer = document.getElementById('resultContainer');
    const productResult = document.getElementById('productResult');
    const emptyState = document.getElementById('emptyState');
    
    resultContainer.classList.remove('hidden');
    productResult.classList.add('hidden');
    emptyState.classList.remove('hidden');
}

/* ========================================
   Modal Manual
   ======================================== */
function openManualModal() {
    document.getElementById('manualInputModal').classList.remove('hidden');
    document.getElementById('manualQRCode').focus();
}

function closeManualModal() {
    document.getElementById('manualInputModal').classList.add('hidden');
    document.getElementById('manualQRCode').value = '';
}

/* ========================================
   Editar Producto
   ======================================== */
function editProduct() {
    if (!currentProduct) {
        showError('No hay producto seleccionado');
        return;
    }
    
    // Redirigir a productos.html con el ID del producto
    const productId = currentProduct.id;
    window.location.href = `productos.html?edit=${productId}`;
}

/* ========================================
   Nuevo Escaneo
   ======================================== */
function newScan() {
    currentProduct = null;
    document.getElementById('manualQRCode').value = '';
    showEmptyState();
    clearMessages();
    
    // Iniciar cámara de nuevo
    if (!scannerActive) {
        startScanner();
    }
}

function clearMessages() {
    document.getElementById('errorMessage').classList.add('hidden');
    document.getElementById('successMessage').classList.add('hidden');
}

/* ========================================
   Event Listeners
   ======================================== */
function setupEventListeners() {
    // Botones de control
    document.getElementById('btnStartScanner').addEventListener('click', startScanner);
    document.getElementById('btnStopScanner').addEventListener('click', stopScanner);
    document.getElementById('btnManualInput').addEventListener('click', openManualModal);
    
    // Botones de resultado
    document.getElementById('btnEditProduct').addEventListener('click', editProduct);
    document.getElementById('btnNewScan').addEventListener('click', newScan);
    
    // Modal manual
    document.getElementById('manualInputModal').addEventListener('click', (e) => {
        if (e.target.id === 'manualInputModal') {
            closeManualModal();
        }
    });
    
    // Enter en input manual
    document.getElementById('manualQRCode').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchByQRCode();
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

/* ========================================
   Auto-inicialización
   ======================================== */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScanner);
} else {
    initScanner();
}

// Limpiar al salir
window.addEventListener('beforeunload', () => {
    stopScanner();
});

console.log('✅ escanear.js cargado');
