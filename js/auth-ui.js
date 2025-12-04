/* auth-ui.js
   Small UX improvements for auth pages:
   - Show/Hide password toggle
   - Smooth reveal for error messages
*/

document.addEventListener('DOMContentLoaded', () => {
    try {
        // Wrap password inputs and add toggle
        document.querySelectorAll('input[type="password"]').forEach(input => {
            // Skip if already wrapped
            if (input.parentElement && input.parentElement.classList.contains('input-with-action')) return;

            const wrapper = document.createElement('div');
            wrapper.className = 'input-with-action';

            // Insert wrapper before input
            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);

            // Create action button
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'input-action-btn';
            btn.setAttribute('aria-label', 'Mostrar contraseña');
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"></path><circle cx="12" cy="12" r="3"></circle></svg>';

            btn.addEventListener('click', () => {
                if (input.type === 'password') {
                    input.type = 'text';
                    btn.setAttribute('aria-label', 'Ocultar contraseña');
                    btn.style.color = '#2563eb';
                } else {
                    input.type = 'password';
                    btn.setAttribute('aria-label', 'Mostrar contraseña');
                    btn.style.color = '';
                }
            });

            wrapper.appendChild(btn);
        });

        // Smooth reveal for error messages when they become visible
        const errorEl = document.getElementById('errorMessage');
        if (errorEl) {
            const observer = new MutationObserver(() => {
                if (!errorEl.classList.contains('hidden')) {
                    errorEl.style.opacity = '0';
                    errorEl.style.transition = 'opacity 220ms ease-out, transform 220ms ease-out';
                    errorEl.style.transform = 'translateY(-4px)';
                    requestAnimationFrame(() => {
                        errorEl.style.opacity = '1';
                        errorEl.style.transform = 'translateY(0)';
                    });
                }
            });

            observer.observe(errorEl, { attributes: true, attributeFilter: ['class'] });
        }

    } catch (err) {
        console.error('auth-ui error:', err);
    }
});
