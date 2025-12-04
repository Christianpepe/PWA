/* ========================================
   components.js - Componentes Reutilizables
   Navbar y Footer para todas las pantallas
   ======================================== */

/**
 * Crea e inyecta la navbar en el documento
 * @param {Object} options - Opciones de configuración
 * @param {string} options.title - Título de la página
 * @param {boolean} options.showBack - Mostrar botón de atrás
 * @param {string} options.backUrl - URL del botón atrás
 * @param {boolean} options.showNotifications - Mostrar botón de notificaciones
 */
function injectNavbar(options = {}) {
    const {
        title = 'SafeProducts',
        showBack = false,
        backUrl = 'home.html',
        showNotifications = false
    } = options;

    const navbar = document.createElement('header');
    navbar.className = 'header';
    navbar.innerHTML = `
        <div class="container header-content">
            <div class="navbar-start">
                ${showBack ? `
                    <a href="${backUrl}" class="btn-icon" title="Atrás">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                    </a>
                ` : `
                    <div class="logo">
                        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                            <rect width="32" height="32" rx="8" fill="currentColor"/>
                            <path d="M16 8L20 12H18V20H14V12H12L16 8Z" fill="white"/>
                        </svg>
                        <span class="logo-text">${title}</span>
                    </div>
                `}
            </div>

            <div class="navbar-end">
                ${showNotifications ? `
                    <button class="btn-icon" id="btnNotifications" aria-label="Notificaciones">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                        <span class="badge" id="notificationBadge">0</span>
                    </button>
                ` : ''}
                
                <button class="btn-icon btn-logout" id="btnLogout" aria-label="Cerrar sesión" title="Cerrar sesión">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
            </div>
        </div>
    `;

    // Insertar al inicio del body
    document.body.insertBefore(navbar, document.body.firstChild);

    // Configurar botón de logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
        btnLogout.addEventListener('click', logout);
    }

    console.log('✅ Navbar inyectada correctamente');
}

/**
 * Crea e inyecta el footer en el documento
 */
function injectFooter() {
    const footer = document.createElement('footer');
    footer.className = 'footer';
    footer.innerHTML = `
        <div class="container footer-content">
            <div class="footer-section">
                <h4>SafeProducts</h4>
                <p>Sistema de inventario con gestión QR</p>
            </div>
            
            <div class="footer-section">
                <h5>Enlaces</h5>
                <ul>
                    <li><a href="home.html">Dashboard</a></li>
                    <li><a href="productos.html">Productos</a></li>
                    <li><a href="movimientos.html">Movimientos</a></li>
                </ul>
            </div>
            
            <div class="footer-section">
                <h5>Estado</h5>
                <p class="connection-status">
                    <span class="status-indicator" id="statusIndicator"></span>
                    <span id="connectionStatus">En línea</span>
                </p>
            </div>
            
            <div class="footer-bottom">
                <p>&copy; 2025 SafeProducts. Todos los derechos reservados.</p>
            </div>
        </div>
    `;

    // Insertar al final del body
    document.body.appendChild(footer);

    // Actualizar estado de conexión
    updateConnectionStatus();

    console.log('✅ Footer inyectado correctamente');
}

/**
 * Actualiza el indicador de conexión
 */
function updateConnectionStatus() {
    const statusIndicator = document.getElementById('statusIndicator');
    const connectionStatus = document.getElementById('connectionStatus');

    if (!statusIndicator || !connectionStatus) return;

    if (navigator.onLine) {
        statusIndicator.className = 'status-indicator online';
        connectionStatus.textContent = 'En línea';
    } else {
        statusIndicator.className = 'status-indicator offline';
        connectionStatus.textContent = 'Sin conexión';
    }
}

/**
 * Función para cerrar sesión
 */
function logout() {
    const confirmed = confirm('¿Estás seguro de que deseas cerrar sesión?');
    
    if (!confirmed) return;

    try {
        // Limpiar localStorage
        localStorage.removeItem('user');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');

        // Limpiar sessionStorage
        sessionStorage.clear();

        // Log
        console.log('✅ Sesión cerrada correctamente');

        // Redirigir a login
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 300);

    } catch (error) {
        console.error('❌ Error al cerrar sesión:', error);
        alert('Error al cerrar sesión');
    }
}

/**
 * Inicializa los componentes globales
 * Debe llamarse desde cada página después de que el DOM esté cargado
 * @param {Object} options - Opciones para la navbar
 */
function initComponents(options = {}) {
    // Inyectar navbar
    injectNavbar(options);

    // Inyectar footer
    injectFooter();

    // Monitorear cambios de conexión
    window.addEventListener('online', () => {
        updateConnectionStatus();
        console.log('🌐 Conexión restaurada');
    });

    window.addEventListener('offline', () => {
        updateConnectionStatus();
        console.log('📴 Sin conexión');
    });

    console.log('✅ Componentes globales inicializados');
}

/* ========================================
   Exportar funciones globales
   ======================================== */
window.Components = {
    injectNavbar,
    injectFooter,
    initComponents,
    logout,
    updateConnectionStatus
};

console.log('✅ components.js cargado');
console.log('💡 Usa: window.Components.initComponents({ title: "Mi Página", showBack: true })');
