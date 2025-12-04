/* ========================================
   VERSIÓN SIMPLIFICADA PARA PRUEBAS
   Sin autenticación, sin redirecciones
   ======================================== */

// Estado global
const appState = {
    user: null,
    isOnline: navigator.onLine,
    stats: {
        totalProducts: 0,
        totalStock: 0,
        lowStock: 0,
        todayMovements: 0
    }
};

/* ========================================
   Inicialización
   ======================================== */
async function initHome() {
    try {
        console.log('🚀 Inicializando Dashboard...');
        
        // VERIFICAR AUTENTICACIÓN REAL
        if (!isUserAuthenticated()) {
            console.log('❌ Usuario no autenticado, redirigiendo a login...');
            window.location.href = 'login.html';
            return;
        }
        
        // Obtener usuario de la sesión
        const user = getUserFromSession();
        appState.user = user;
        
        console.log('✅ Usuario autenticado:', appState.user?.name);
        
        // Inicializar IndexedDB
        try {
            await initDB();
            console.log('✅ Base de datos inicializada');
        } catch (error) {
            console.warn('⚠️ Error inicializando DB:', error);
        }
        
        // Cargar datos
        loadUserData();
        await loadDashboardStats();
        setupEventListeners();
        setupConnectionMonitor();
        
        // Recargar estadísticas periódicamente
        setupStatsRefresh();
        
        console.log('✅ Dashboard listo!');
        console.log('💡 Abre DevTools y prueba las funcionalidades');
        
    } catch (error) {
        console.error('❌ Error:', error);
        alert('Error al cargar. Revisa la consola (F12)');
    }
}

/* ========================================
   Autenticación
   ======================================== */
function isUserAuthenticated() {
    const userData = localStorage.getItem('user');
    return userData !== null;
}

function getUserFromSession() {
    const userData = localStorage.getItem('user');
    if (!userData) return null;
    
    try {
        return JSON.parse(userData);
    } catch (error) {
        console.error('Error al parsear usuario:', error);
        localStorage.removeItem('user');
        return null;
    }
}

/* ========================================
   Cargar datos del usuario
   ======================================== */
function loadUserData() {
    const userName = document.getElementById('userName');
    if (userName && appState.user) {
        userName.textContent = appState.user.name;
        console.log('👤 Usuario cargado en UI:', appState.user.name);
    }
}

/* ========================================
   Cargar estadísticas
   ======================================== */
async function loadDashboardStats() {
    try {
        console.log('📊 Cargando estadísticas...');
        
        // Obtener estadísticas reales de la BD
        const stats = await getStats();
        
        appState.stats = stats;
        updateStatsUI(stats);
        
        console.log('✅ Estadísticas cargadas:', stats);
        
    } catch (error) {
        console.error('❌ Error cargando stats:', error);
        // Mostrar valores por defecto en caso de error
        const defaultStats = {
            totalProducts: 0,
            totalStock: 0,
            lowStock: 0,
            todayMovements: 0
        };
        updateStatsUI(defaultStats);
    }
}

function updateStatsUI(stats) {
    // Animar números
    animateValue('totalProducts', 0, stats.totalProducts, 1000);
    animateValue('totalStock', 0, stats.totalStock, 1200);
    animateValue('lowStock', 0, stats.lowStock, 800);
    animateValue('todayMovements', 0, stats.todayMovements, 900);
    
    // Badge de notificaciones
    updateNotificationBadge(stats.lowStock);
}

function animateValue(elementId, start, end, duration) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`⚠️ Elemento no encontrado: ${elementId}`);
        return;
    }
    
    const startTime = Date.now();
    const range = end - start;
    
    function update() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing suave
        const eased = progress * (2 - progress);
        const current = Math.floor(start + range * eased);
        
        element.textContent = current.toLocaleString('es-MX');
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
    
    console.log(`🔔 Badge actualizado: ${count}`);
}

/* ========================================
   Event Listeners
   ======================================== */
function setupStatsRefresh() {
    // Recargar estadísticas cada 30 segundos
    setInterval(async () => {
        try {
            console.log('🔄 Actualizando estadísticas...');
            const stats = await getStats();
            
            // Solo actualizar si hay cambios
            if (JSON.stringify(appState.stats) !== JSON.stringify(stats)) {
                appState.stats = stats;
                updateStatsUI(stats);
                console.log('✅ Estadísticas actualizadas:', stats);
            }
        } catch (error) {
            console.warn('⚠️ Error actualizando estadísticas:', error);
        }
    }, 30000);
    
    // También actualizar cuando la página está visible
    document.addEventListener('visibilitychange', async () => {
        if (!document.hidden) {
            console.log('👁️ Página visible - actualizando estadísticas');
            await loadDashboardStats();
        }
    });
}

function setupEventListeners() {
    // Notificaciones
    const btnNotif = document.getElementById('btnNotifications');
    if (btnNotif) {
        btnNotif.addEventListener('click', handleNotifications);
        console.log('✅ Listener: Notificaciones');
    }
    
    // Logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', handleLogout);
        console.log('✅ Listener: Logout');
    }
    
    // Vibración en links
    document.querySelectorAll('.action-card').forEach(card => {
        card.addEventListener('click', () => {
            // Vibrar
            if ('vibrate' in navigator) {
                navigator.vibrate(50);
            }
        });
    });
    
    console.log('✅ Event listeners configurados');
}

function handleNotifications() {
    console.log('🔔 Click en notificaciones');
    
    // Vibrar
    if ('vibrate' in navigator) {
        navigator.vibrate(50);
    }
    
    const lowStock = appState.stats.lowStock;
    
    if (lowStock > 0) {
        alert(`⚠️ ALERTA DE STOCK BAJO\n\nHay ${lowStock} productos con stock bajo\n\n📦 Revisa el inventario pronto\n\n(En la versión final esto será una notificación push)`);
    } else {
        alert(`✅ TODO BIEN\n\nNo hay productos con stock bajo\n\n📊 El inventario está saludable`);
    }
}

function handleLogout() {
    console.log('🚪 Intento de logout');
    
    if (!confirm('¿Seguro que quieres cerrar sesión?')) {
        console.log('❌ Logout cancelado');
        return;
    }
    
    // Vibrar
    if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
    }
    
    console.log('✅ Cerrando sesión...');
    
    // Limpiar sesión
    localStorage.removeItem('user');
    appState.user = null;
    
    // Redirigir a login
    window.location.href = 'login.html';
}

/* ========================================
   Monitoreo de conexión
   ======================================== */
function setupConnectionMonitor() {
    updateConnectionStatus(navigator.onLine);
    
    window.addEventListener('online', () => {
        console.log('🌐 ONLINE');
        appState.isOnline = true;
        updateConnectionStatus(true);
        
        // Vibrar
        if ('vibrate' in navigator) {
            navigator.vibrate(200);
        }
        
        alert('✅ Conexión restaurada\n\n🔄 Sincronizando datos...');
        loadDashboardStats();
    });
    
    window.addEventListener('offline', () => {
        console.log('📴 OFFLINE');
        appState.isOnline = false;
        updateConnectionStatus(false);
        
        // Vibrar
        if ('vibrate' in navigator) {
            navigator.vibrate([100, 100, 100]);
        }
        
        alert('⚠️ Sin conexión a Internet\n\n💾 Trabajando en modo offline\n\nLos cambios se sincronizarán cuando vuelva la conexión');
    });
    
    console.log('✅ Monitor de conexión activo');
}

function updateConnectionStatus(isOnline) {
    const bar = document.getElementById('statusBar');
    const text = document.getElementById('statusText');
    
    if (!bar || !text) return;
    
    if (isOnline) {
        bar.classList.remove('offline');
        text.textContent = '✓ Conectado';
    } else {
        bar.classList.add('offline');
        text.textContent = '⚠ Sin conexión - Modo offline';
    }
}

/* ========================================
   Utilidades
   ======================================== */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/* ========================================
   Auto-inicialización
   ======================================== */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initHome);
} else {
    initHome();
}

console.log('');
console.log('═══════════════════════════════════════');
console.log('  📱 SafeProducts Dashboard - Pruebas  ');
console.log('═══════════════════════════════════════');
console.log('');
console.log('✅ App.js cargado correctamente');
console.log('');
console.log('💡 PRUEBA ESTAS FUNCIONALIDADES:');
console.log('   1. Ver animación de números');
console.log('   2. Click en 🔔 (notificaciones)');
console.log('   3. Click en 🚪 (logout)');
console.log('   4. Click en tarjetas de acción');
console.log('   5. DevTools > Network > Offline');
console.log('');
console.log('📊 Estado inicial:', appState);
console.log('');
console.log('═══════════════════════════════════════');