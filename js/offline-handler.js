/* ========================================
   offline-handler.js - CORREGIDO
   Manejador global para modo offline
   ======================================== */

// Estado global offline
window.appOfflineState = {
    isOffline: !navigator.onLine,
    lastSync: null,
    pendingChanges: 0
};

// Detectar inmediatamente si estamos offline
function isOffline() {
    return !navigator.onLine;
}

// Timeout adaptativo según conexión
function getNetworkTimeout() {
    return isOffline() ? 500 : 5000; // Más rápido para detectar offline
}

// Envolver promesas con timeout
function promiseWithTimeout(promise, timeoutMs = 3000) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Network timeout')), timeoutMs)
        )
    ]);
}

// CRÍTICO: Prevenir que IndexedDB falle en modo offline
function safeIndexedDBOperation(operation) {
    return new Promise(async (resolve, reject) => {
        try {
            const result = await operation();
            resolve(result);
        } catch (error) {
            console.error('IndexedDB error:', error);
            // No rechazar, retornar datos vacíos
            resolve(null);
        }
    });
}

// Mostrar notificación offline
function showOfflineNotification() {
    const notification = document.createElement('div');
    notification.id = 'offlineNotification';
    notification.className = 'offline-notification';
    notification.innerHTML = `
        <div style="background: #f59e0b; color: white; padding: 12px 20px; 
                    position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
                    display: flex; align-items: center; justify-content: center; gap: 10px;">
            <span style="font-size: 1.2rem;">⚠️</span>
            <span style="font-weight: 500;">Modo Offline - Los cambios se guardarán localmente</span>
        </div>
    `;
    
    // Remover notificación anterior si existe
    const existing = document.getElementById('offlineNotification');
    if (existing) existing.remove();
    
    document.body.appendChild(notification);
}

function hideOfflineNotification() {
    const notification = document.getElementById('offlineNotification');
    if (notification) {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }
}

// CRÍTICO: Handler mejorado para offline
window.addEventListener('offline', () => {
    console.log('📴 OFFLINE detectado');
    window.appOfflineState.isOffline = true;
    
    document.body.classList.add('offline-mode');
    showOfflineNotification();
    
    // Actualizar indicadores en toda la app
    updateAllStatusIndicators(true);
    
    // Vibrar para notificar
    if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
    }
});

// CRÍTICO: Handler mejorado para online
window.addEventListener('online', async () => {
    console.log('🌐 ONLINE detectado');
    window.appOfflineState.isOffline = false;
    
    document.body.classList.remove('offline-mode');
    hideOfflineNotification();
    
    // Actualizar indicadores
    updateAllStatusIndicators(false);
    
    // Vibrar para notificar
    if ('vibrate' in navigator) {
        navigator.vibrate(200);
    }
    
    // CRÍTICO: Esperar un poco antes de sincronizar
    console.log('⏳ Esperando 2 segundos antes de sincronizar...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Intentar sincronización automática
    try {
        if (window.SyncDB) {
            console.log('🔄 Iniciando sincronización automática...');
            
            // Subir cambios locales
            await window.SyncDB.syncUp();
            
            // Descargar cambios remotos
            await window.SyncDB.syncDown();
            
            console.log('✅ Sincronización completada');
            
            // Mostrar notificación de éxito
            showSyncSuccessNotification();
        }
    } catch (error) {
        console.warn('⚠️ Error en sincronización automática:', error);
    }
});

// Actualizar todos los indicadores de estado
function updateAllStatusIndicators(isOffline) {
    // Barra de estado superior
    const statusBar = document.getElementById('statusBar');
    const statusText = document.getElementById('statusText');
    
    if (statusBar && statusText) {
        if (isOffline) {
            statusBar.classList.add('offline');
            statusText.textContent = '⚠ Sin conexión - Modo offline';
        } else {
            statusBar.classList.remove('offline');
            statusText.textContent = '✓ Conectado';
        }
    }
    
    // Indicador genérico
    const indicator = document.getElementById('statusIndicator');
    if (indicator) {
        indicator.classList.toggle('offline', isOffline);
    }
}

// Mostrar notificación de sincronización exitosa
function showSyncSuccessNotification() {
    const notification = document.createElement('div');
    notification.className = 'sync-success-notification';
    notification.innerHTML = `
        <div style="background: #10b981; color: white; padding: 12px 20px; 
                    position: fixed; top: 20px; right: 20px; z-index: 9999;
                    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
                    display: flex; align-items: center; gap: 10px;
                    animation: slideIn 0.3s ease-out;">
            <span style="font-size: 1.2rem;">✅</span>
            <span style="font-weight: 500;">Datos sincronizados correctamente</span>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// CRÍTICO: Verificar estado inicial al cargar
function checkInitialConnectionState() {
    window.appOfflineState.isOffline = !navigator.onLine;
    
    if (window.appOfflineState.isOffline) {
        console.log('📴 Iniciando en modo OFFLINE');
        document.body.classList.add('offline-mode');
        showOfflineNotification();
        updateAllStatusIndicators(true);
    } else {
        console.log('🌐 Iniciando en modo ONLINE');
        updateAllStatusIndicators(false);
    }
}

// Ejecutar verificación al cargar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkInitialConnectionState);
} else {
    checkInitialConnectionState();
}

// CRÍTICO: Wrapper para operaciones de Firebase
window.safeFirebaseOperation = async function(operation, fallbackValue = null) {
    // Si estamos offline, retornar inmediatamente
    if (isOffline()) {
        console.log('📴 Operación Firebase omitida (offline)');
        return fallbackValue;
    }
    
    try {
        // Ejecutar con timeout corto
        return await promiseWithTimeout(operation(), getNetworkTimeout());
    } catch (error) {
        console.warn('⚠️ Operación Firebase falló:', error.message);
        return fallbackValue;
    }
};

// Exportar funciones útiles
window.OfflineHandler = {
    isOffline,
    getNetworkTimeout,
    promiseWithTimeout,
    safeIndexedDBOperation,
    checkInitialConnectionState
};

console.log('✅ offline-handler.js cargado y configurado');
console.log('📊 Estado inicial:', window.appOfflineState);