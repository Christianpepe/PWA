/* ui.js - Helper UI utilities: toasts and loading indicator
   Crea funciones globales: showError, showSuccess, showLoadingIndicator, hideLoadingIndicator
*/

(function(){
    // Prevent duplicate definitions
    if (window.UI && window.UI.initialized) return;

    function createToast(message, variant = 'default', autoRemoveMs = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${variant === 'error' ? 'error-toast' : variant === 'success' ? 'toast-success' : ''}`.trim();
        toast.setAttribute('role', variant === 'error' ? 'alert' : 'status');
        toast.textContent = message;
        document.body.appendChild(toast);

        // trigger fade-out then remove
        setTimeout(() => toast.classList.add('fade-out'), Math.max(300, autoRemoveMs - 600));
        setTimeout(() => toast.remove(), autoRemoveMs);
        return toast;
    }

    function showError(message) {
        return createToast(message, 'error', 5000);
    }

    function showSuccess(message) {
        return createToast(message, 'success', 3000);
    }

    function showLoadingIndicator() {
        if (document.getElementById('loadingIndicator')) return;
        const indicator = document.createElement('div');
        indicator.id = 'loadingIndicator';
        indicator.setAttribute('role', 'status');
        indicator.setAttribute('aria-live', 'polite');
        indicator.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:center;gap:.5rem;">
                <div class="spinner" aria-hidden="true"></div>
                <span>Procesando...</span>
            </div>
        `;
        document.body.appendChild(indicator);
    }

    function hideLoadingIndicator() {
        const el = document.getElementById('loadingIndicator');
        if (el) el.remove();
    }

    window.UI = window.UI || {};
    window.UI.showError = showError;
    window.UI.showSuccess = showSuccess;
    window.UI.showLoadingIndicator = showLoadingIndicator;
    window.UI.hideLoadingIndicator = hideLoadingIndicator;
    window.showError = showError;
    window.showSuccess = showSuccess;
    window.showLoadingIndicator = showLoadingIndicator;
    window.hideLoadingIndicator = hideLoadingIndicator;
    window.UI.initialized = true;
})();
