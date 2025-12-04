/* movimientos.js
   Funcionalidad para registrar movimientos de inventario
   Usa window.SyncDB.addMovement(...) y window.SyncDB.getAllMovements()
*/

async function initMovimientos() {
	try {
		// Verificar autenticación básica
		if (typeof isUserAuthenticated === 'function' && !isUserAuthenticated()) {
			window.location.href = 'login.html';
			return;
		}

		// Inicializar sincronización / DB
		if (window.SyncDB && typeof window.SyncDB.init === 'function') {
			await window.SyncDB.init();
		} else if (window.DB && typeof window.DB.init === 'function') {
			await window.DB.init();
		}

		await loadProductsIntoSelect();
		await loadMovementsList();

		document.getElementById('movementForm').addEventListener('submit', saveMovement);
	} catch (error) {
		console.error('Error inicializando movimientos:', error);
	}
}

async function loadProductsIntoSelect() {
	const select = document.getElementById('productSelect');
	if (!select) return;

	try {
		const products = await window.SyncDB.getAllProducts();

		// Limpiar
		select.innerHTML = '<option value="">— Selecciona un producto —</option>';

		products.forEach(p => {
			const opt = document.createElement('option');
			opt.value = p.id; // id local en IndexedDB
			opt.textContent = `${p.name} — stock: ${p.quantity || 0}`;
			select.appendChild(opt);
		});
	} catch (error) {
		console.error('No se pudieron cargar productos:', error);
	}
}

async function loadMovementsList() {
	const container = document.getElementById('movementsList');
	if (!container) return;

	container.innerHTML = '';

	try {
		const movements = await window.DB.getAllMovements();

		if (!movements || movements.length === 0) {
			container.innerHTML = '<p class="text-muted">No hay movimientos registrados.</p>';
			return;
		}

		movements.forEach(m => {
			const div = document.createElement('div');
			div.className = 'movement-item';

			const left = document.createElement('div');
			left.className = 'movement-meta';

			const type = document.createElement('span');
			type.className = `movement-type ${m.type}`;
			type.textContent = m.type === 'entrada' ? 'Entrada' : 'Salida';

			const name = document.createElement('div');
			name.innerHTML = `<div style="font-weight:600">${escapeHtml(m.productName || '—')}</div><div class="text-muted" style="font-size:0.9rem">${new Date(m.date).toLocaleString()}</div>`;

			left.appendChild(type);
			left.appendChild(name);

			const right = document.createElement('div');
			right.style.textAlign = 'right';
			right.innerHTML = `<div class="movement-qty">${m.quantity}</div><div class="text-muted" style="font-size:0.9rem">${escapeHtml(m.note || '')}</div>`;

			div.appendChild(left);
			div.appendChild(right);

			container.appendChild(div);
		});

	} catch (error) {
		console.error('Error cargando movimientos:', error);
		container.innerHTML = '<p class="text-muted">Error al cargar movimientos.</p>';
	}
}

async function saveMovement(event) {
	event.preventDefault();

	const errorEl = document.getElementById('movementError');
	const btn = document.getElementById('btnSaveMovement');

	try {
		const productId = parseInt(document.getElementById('productSelect').value);
		const type = document.getElementById('movementType').value;
		const quantity = parseInt(document.getElementById('movementQty').value);
		const note = document.getElementById('movementNote').value.trim();

		// Validaciones
		if (!productId || !type || !quantity || quantity <= 0) {
			showMovementError('Completa los campos correctamente');
			return;
		}

		btn.disabled = true;
		btn.textContent = 'Registrando...';

		const movement = {
			productId: productId,
			type: type,
			quantity: quantity,
			note: note
		};

		// Usar API hybrid (SyncDB) si está disponible
		if (window.SyncDB && typeof window.SyncDB.addMovement === 'function') {
			await window.SyncDB.addMovement(movement);
		} else if (window.DB && typeof window.DB.addMovement === 'function') {
			await window.DB.addMovement(movement);
		} else {
			throw new Error('API de base de datos no disponible');
		}

		// Limpiar y recargar
		document.getElementById('movementForm').reset();
		await loadProductsIntoSelect();
		await loadMovementsList();
		hideMovementError();

	} catch (error) {
		console.error('Error guardando movimiento:', error);
		showMovementError(error.message || 'Error al registrar movimiento');
	} finally {
		btn.disabled = false;
		btn.textContent = 'Registrar Movimiento';
	}
}

function showMovementError(message) {
	const el = document.getElementById('movementError');
	if (!el) return;
	el.textContent = message;
	el.classList.remove('hidden');
}

function hideMovementError() {
	const el = document.getElementById('movementError');
	if (!el) return;
	el.classList.add('hidden');
}

// Small helper (we reuse escapeHtml from productos.js if not present)
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text || '';
	return div.innerHTML;
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initMovimientos);
} else {
	initMovimientos();
}

