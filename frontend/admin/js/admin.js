const API_BASE = '/api/v1';

function getCSRFToken() {
    const cookie = document.cookie.split('; ').find(row => row.startsWith('csrf_token='));
    return cookie ? cookie.split('=')[1] : '';
}

async function csrfFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (typeof options.headers === 'object' && !(options.headers instanceof Headers)) {
        if (!options.method || options.method === 'GET' || options.method === 'HEAD') {
            // CSRF not needed for safe methods
        } else {
            options.headers['X-CSRF-Token'] = getCSRFToken();
        }
    }
    return fetch(url, options);
}

let currentSection = 'dashboard';
let editingProductId = null;
let productColors = [];
let globalSizes = [];

function setupImageUpload() {
    const area = document.getElementById('image-upload-area');
    const input = document.getElementById('image-file-input');
    const preview = document.getElementById('image-preview');
    const placeholder = document.getElementById('image-upload-placeholder');
    const hidden = document.getElementById('image_url_hidden');

    if (!area) return;

    area.addEventListener('click', () => input.click());

    area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = '#666'; });
    area.addEventListener('dragleave', () => { area.style.borderColor = '#ccc'; });
    area.addEventListener('drop', (e) => {
        e.preventDefault();
        area.style.borderColor = '#ccc';
        if (e.dataTransfer.files.length) handleImageFile(e.dataTransfer.files[0]);
    });

    input.addEventListener('change', () => {
        if (input.files.length) handleImageFile(input.files[0]);
    });

    async function handleImageFile(file) {
        if (!file.type.match(/^image\/(jpeg|png|webp|gif)$/)) {
            alert('Formato no permitido. Usa JPG, PNG, WebP o GIF.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            alert('El archivo es demasiado grande. Máximo 5MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            preview.src = e.target.result;
            preview.style.display = 'block';
            placeholder.style.display = 'none';
            area.classList.add('has-image');
        };
        reader.readAsDataURL(file);

        const formData = new FormData();
        formData.append('image', file);

        try {
            area.style.opacity = '0.5';
            const response = await csrfFetch(`${API_BASE}/admin/upload`, { method: 'POST', body: formData });
            if (response.ok) {
                const data = await response.json();
                hidden.value = data.filename;
            } else {
                const err = await response.json();
                alert(err.error || 'Error al subir imagen');
                resetImageUpload();
            }
        } catch (error) {
            console.error('Error uploading image:', error);
            alert('Error al subir imagen');
            resetImageUpload();
        } finally {
            area.style.opacity = '1';
        }
    }
}

function resetImageUpload() {
    const preview = document.getElementById('image-preview');
    const placeholder = document.getElementById('image-upload-placeholder');
    const area = document.getElementById('image-upload-area');
    const hidden = document.getElementById('image_url_hidden');
    const input = document.getElementById('image-file-input');
    if (preview) preview.style.display = 'none';
    if (placeholder) placeholder.style.display = 'flex';
    if (area) area.classList.remove('has-image');
    if (hidden) hidden.value = '';
    if (input) input.value = '';
}

function setImageUploadPreview(url) {
    const preview = document.getElementById('image-preview');
    const placeholder = document.getElementById('image-upload-placeholder');
    const area = document.getElementById('image-upload-area');
    const hidden = document.getElementById('image_url_hidden');
    if (!preview || !url) return;
    preview.src = url.startsWith('http') || url.startsWith('/') ? url : '/assets/img/' + url;
    preview.style.display = 'block';
    placeholder.style.display = 'none';
    area.classList.add('has-image');
    hidden.value = url;
}

function onGlobalSizesChange() {
    const input = document.getElementById('product-sizes-input');
    globalSizes = (input.value || '').split(',').map(s => s.trim()).filter(Boolean);
    const area = document.getElementById('color-size-stock-area');
    const inputs = document.getElementById('color-size-stock-inputs');
    if (globalSizes.length > 0) {
        area.style.display = 'block';
        inputs.innerHTML = globalSizes.map(s => `
            <label class="size-stock-inline">
                ${s}:
                <input type="number" class="size-stock-input" data-size="${s}" value="0" min="0">
            </label>
        `).join('');
    } else {
        area.style.display = 'none';
    }
}

function addColor() {
    const nameInput = document.getElementById('color-name-input');
    const hexInput = document.getElementById('color-hex-input');
    const name = nameInput.value.trim();
    const hex = hexInput.value.trim();
    if (!name || !hex) return;

    const sizes = globalSizes.map(s => {
        const input = document.querySelector(`#color-size-stock-inputs .size-stock-input[data-size="${s}"]`);
        return { size: s, stock: parseInt(input?.value) || 0 };
    });

    const stock = sizes.reduce((sum, s) => sum + s.stock, 0);
    productColors.push({ name, hex_code: hex, stock, sizes });
    nameInput.value = '';
    hexInput.value = '';

    document.querySelectorAll('#color-size-stock-inputs .size-stock-input').forEach(inp => inp.value = '0');

    renderColorList();
}

function removeColor(index) {
    productColors.splice(index, 1);
    renderColorList();
}

function getSizeStock(color, size) {
    const s = (color.sizes || []).find(s => s.size === size);
    return s ? s.stock : 0;
}

function updateSizeStock(colorIndex, size, value) {
    const c = productColors[colorIndex];
    if (!c) return;
    const s = (c.sizes || []).find(s => s.size === size);
    if (s) {
        s.stock = parseInt(value) || 0;
    } else {
        if (!c.sizes) c.sizes = [];
        c.sizes.push({ size, stock: parseInt(value) || 0 });
    }
    const total = (c.sizes || []).reduce((sum, s) => sum + s.stock, 0);
    const badge = document.querySelector(`#color-list .color-chip:nth-child(${colorIndex + 1}) .color-stock-badge`);
    if (badge) badge.textContent = 'Stock: ' + total;
}

function renderColorList() {
    const container = document.getElementById('color-list');
    container.innerHTML = productColors.map((c, i) => {
        const sizes = c.sizes || [];
        const totalStock = sizes.reduce((sum, s) => sum + s.stock, 0);
        return `
        <div class="color-chip">
            <span class="color-swatch" style="background:${c.hex_code}"></span>
            <span class="color-chip-name">${c.name}</span>
            <span class="color-stock-badge">Stock: ${totalStock}</span>
            <span class="color-size-stocks">
                ${globalSizes.map(s => {
                    const sz = sizes.find(x => x.size === s);
                    return `
                    <label class="size-stock-inline">
                        ${s}:
                        <input type="number" class="size-stock-input" value="${sz ? sz.stock : 0}" min="0"
                            onchange="updateSizeStock(${i}, '${s}', this.value)">
                    </label>`;
                }).join('')}
            </span>
            <button type="button" class="color-remove" onclick="removeColor(${i})">&times;</button>
        </div>`;
    }).join('');
}

async function editProduct(productId) {
    try {
        const response = await csrfFetch(`${API_BASE}/products/${productId}`);
        const product = await response.json();
        editingProductId = productId;
        showProductModal(product);
    } catch (error) {
        console.error('Error loading product:', error);
        alert('Error al cargar el producto');
    }
}

function showProductModal(product = null) {
    const modal = document.getElementById('productModal');
    const form = document.getElementById('productForm');
    const title = document.getElementById('productModalTitle');

    resetImageUpload();

    if (product) {
        title.textContent = 'Editar Producto';
        form.name.value = product.name;
        form.description.value = product.description;
        form.price.value = product.price;
        form.category.value = product.category;
        if (product.imageUrl) setImageUploadPreview(product.imageUrl);
        form.material.value = product.material || '';
        form.sizes.value = (product.sizes || []).join(', ');
        onGlobalSizesChange();
        productColors = (product.colors || []).map(c => ({ name: c.name, hex_code: c.hex, stock: c.stock || 0, sizes: c.sizes || [] }));
        renderColorList();
    } else {
        title.textContent = 'Nuevo Producto';
        form.reset();
        onGlobalSizesChange();
        productColors = [];
        renderColorList();
    }

    modal.classList.add('active');
}

function closeProductModal() {
    document.getElementById('productModal').classList.remove('active');
    editingProductId = null;
}

document.getElementById('productForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const colors = productColors.map(c => {
        const sizes = c.sizes || [];
        const stock = sizes.reduce((sum, s) => sum + s.stock, 0);
        return { name: c.name, hex: c.hex_code, stock, sizes };
    });
    const totalStock = colors.reduce((sum, c) => sum + c.stock, 0);
    const payload = {
        name: form.name.value,
        description: form.description.value,
        price: parseFloat(form.price.value) || 0,
        stock: totalStock,
        category: form.category.value,
        imageUrl: document.getElementById('image_url_hidden').value,
        material: form.material.value,
        sizes: form.sizes.value.split(',').map(s => s.trim()).filter(Boolean),
        colors
    };

    try {
        const url = editingProductId
            ? `${API_BASE}/admin/products/${editingProductId}`
            : `${API_BASE}/admin/products`;
        const method = editingProductId ? 'PUT' : 'POST';
        const response = await csrfFetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (response.ok) {
            closeProductModal();
            loadProducts();
        } else {
            const err = await response.json();
            alert(err.error || 'Error al guardar producto');
        }
    } catch (error) {
        console.error('Error saving product:', error);
        alert('Error al guardar producto');
    }
});

async function deleteProduct(productId) {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
        const response = await csrfFetch(`${API_BASE}/admin/products/${productId}`, { method: 'DELETE' });
        if (response.ok) {
            loadProducts();
        } else {
            alert('Error al eliminar producto');
        }
    } catch (error) {
        console.error('Error deleting product:', error);
        alert('Error al eliminar producto');
    }
}

async function loadPaymentMethods() {
    try {
        const response = await csrfFetch(`${API_BASE}/payment-methods`);
        const methods = await response.json();
        renderPaymentMethods(methods || []);
    } catch (error) {
        console.error('Error loading payment methods:', error);
    }
}

function renderPaymentMethods(methods) {
    const container = document.getElementById('paymentMethods');
    if (methods.length === 0) {
        container.innerHTML = '<p class="loading">No hay métodos de pago</p>';
        return;
    }
    container.innerHTML = methods.map(m => `
        <div class="payment-card">
            <h3>${m.name}</h3>
            <p>${m.description || ''}</p>
            <span class="status-badge ${m.enabled ? 'paid' : 'disabled'}">${m.enabled ? 'Activo' : 'Inactivo'}</span>
        </div>
    `).join('');
}

let allUsers = [];

async function loadUsers() {
    try {
        const response = await csrfFetch(`${API_BASE}/admin/users`);
        allUsers = await response.json();
        renderUsers(allUsers || []);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function applyUsersFilter() {
    const query = document.getElementById('usersSearchInput').value.toLowerCase().trim();
    const role = document.getElementById('usersRoleFilter').value;
    let filtered = allUsers;
    if (query) filtered = filtered.filter(u => (u.username || '').toLowerCase().includes(query) || (u.email || '').toLowerCase().includes(query));
    if (role) filtered = filtered.filter(u => u.role === role);
    renderUsers(filtered);
}

function renderUsers(users) {
    const container = document.getElementById('usersTable');
    if (users.length === 0) {
        container.innerHTML = '<p class="loading">No hay usuarios</p>';
        return;
    }
    container.innerHTML = `
        <table>
            <thead>
                <tr><th>ID</th><th>Usuario</th><th>Email</th><th>Rol</th><th>Registro</th></tr>
            </thead>
            <tbody>
                ${users.map(user => `
                    <tr>
                        <td>${user.id}</td>
                        <td>${user.username}</td>
                        <td>${user.email}</td>
                        <td><span class="status-badge ${user.role}">${user.role}</span></td>
                        <td>${formatDate(user.createdAt)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function loadSettings() {
    try {
        const response = await csrfFetch(`${API_BASE}/admin/settings`);
        const settings = await response.json();
        renderSettings(settings || []);
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function renderSettings(settings) {
    const container = document.getElementById('settingsForm');
    if (settings.length === 0) {
        container.innerHTML = '<p class="loading">No hay configuraciones</p>';
        return;
    }
    const html = settings.map(setting => `
        <div class="form-group">
            <label>${setting.key}</label>
            <input type="text" value="${setting.value}" onchange="updateSetting('${setting.key}', this.value)">
        </div>
    `).join('');
    container.innerHTML = html;
}

async function updateSetting(key, value) {
    try {
        const response = await csrfFetch(`${API_BASE}/admin/settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key, value })
        });
        if (response.ok) {
            alert('Configuración actualizada');
        } else {
            alert('Error al actualizar la configuración');
        }
    } catch (error) {
        console.error('Error updating setting:', error);
        alert('Error al actualizar la configuración');
    }
}

async function loadLogs() {
    try {
        const response = await csrfFetch(`${API_BASE}/admin/logs`);
        const logs = await response.json();
        renderLogs(logs || []);
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

function renderLogs(logs) {
    const container = document.getElementById('logsTable');
    if (logs.length === 0) {
        container.innerHTML = '<p class="loading">No hay logs</p>';
        return;
    }
    const html = `
        <table>
            <thead>
                <tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Entidad</th><th>IP</th></tr>
            </thead>
            <tbody>
                ${logs.map(log => `
                    <tr>
                        <td>${formatDate(log.createdAt)}</td>
                        <td>${log.userId || 'N/A'}</td>
                        <td>${log.action}</td>
                        <td>${log.entity || 'N/A'}</td>
                        <td>${log.ipAddress || 'N/A'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    container.innerHTML = html;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-CO', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    }).format(date);
}

async function loadDashboard() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/dashboard/stats`);
        const stats = await resp.json();
        renderDashboardStats(stats);
    } catch (err) {
        console.error('Error loading dashboard:', err);
    }
}

function renderDashboardStats(stats) {
    document.getElementById('totalRevenue').textContent = formatCurrency(stats.totalRevenue);
    document.getElementById('totalOrders').textContent = stats.totalOrders;
    document.getElementById('pendingOrders').textContent = stats.pendingOrders;
    document.getElementById('totalCustomers').textContent = stats.totalCustomers;

    const orders = stats.recentOrders || [];
    document.getElementById('recentOrders').innerHTML = orders.length === 0
        ? '<p class="loading">No hay órdenes recientes</p>'
        : `<table><thead><tr><th>ID</th><th>Total</th><th>Estado</th><th>Pago</th><th>Fecha</th></tr></thead><tbody>
            ${orders.map(o => `
                <tr>
                    <td>#${o.id}</td>
                    <td>${formatCurrency(o.total)}</td>
                    <td><span class="status-badge ${o.status}">${o.status}</span></td>
                    <td><span class="status-badge ${o.paymentStatus}">${o.paymentStatus || 'pending'}</span></td>
                    <td>${formatDate(o.createdAt)}</td>
                </tr>
            `).join('')}
        </tbody></table>`;

    const products = stats.topProducts || [];
    document.getElementById('topProducts').innerHTML = products.length === 0
        ? '<p class="loading">Sin ventas aún</p>'
        : products.map(p => {
            const img = p.imageUrl ? `<img src="${imgUrl(p.imageUrl)}" alt="${p.name}" class="top-product-img">` : '<div class="top-product-img placeholder"></div>';
            return `
            <div class="top-product-item">
                ${img}
                <div class="top-product-info">
                    <span class="top-product-name">${p.name}</span>
                    <span class="top-product-price">${formatCurrency(p.price)}</span>
                </div>
            </div>`;
        }).join('');
}

async function loadOrders() {
    const statusFilter = document.getElementById('orderStatusFilter')?.value || '';
    const paymentFilter = document.getElementById('paymentStatusFilter')?.value || '';
    let url = `${API_BASE}/admin/orders`;
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (paymentFilter) params.set('payment_status', paymentFilter);
    const qs = params.toString();
    if (qs) url += '?' + qs;

    try {
        const resp = await csrfFetch(url);
        const orders = await resp.json();
        renderOrders(orders || []);
    } catch (err) {
        console.error('Error loading orders:', err);
    }
}

function renderOrders(orders) {
    const container = document.getElementById('ordersTable');
    if (orders.length === 0) {
        container.innerHTML = '<p class="loading">No hay órdenes</p>';
        return;
    }
    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>ID</th><th>Cliente</th><th>Total</th><th>Estado</th>
                    <th>Pago</th><th>Método</th><th>Fecha</th><th>Acciones</th>
                </tr>
            </thead>
            <tbody>
                ${orders.map(o => `
                    <tr>
                        <td>#${o.id}</td>
                        <td>Usuario #${o.userId}</td>
                        <td>${formatCurrency(o.total)}</td>
                        <td><span class="status-badge ${o.status}">${o.status}</span></td>
                        <td><span class="status-badge ${o.paymentStatus}">${o.paymentStatus}</span></td>
                        <td>${o.paymentMethod}</td>
                        <td>${formatDate(o.createdAt)}</td>
                        <td><button class="btn-success btn-sm" onclick="viewOrder(${o.id})">Ver</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

async function viewOrder(orderId) {
    try {
        const resp = await csrfFetch(`${API_BASE}/orders/${orderId}`);
        const order = await resp.json();
        renderOrderDetails(order);
    } catch (err) {
        console.error('Error loading order details:', err);
        alert('Error al cargar detalles de la orden');
    }
}

function renderOrderDetails(order) {
    const container = document.getElementById('orderDetails');
    const methodNames = { cash_on_delivery: 'Contra Entrega', transfer: 'Transferencia', card: 'Tarjeta' };
    container.innerHTML = `
        <div class="order-details">
            <h3>Información de Envío</h3>
            <p><strong>Nombre:</strong> ${order.shippingName || '—'}</p>
            <p><strong>Dirección:</strong> ${order.shippingAddress}</p>
            <p><strong>Ciudad:</strong> ${order.shippingCity}</p>
            <p><strong>Teléfono:</strong> ${order.shippingPhone}</p>
            <p><strong>Método de Pago:</strong> ${methodNames[order.paymentMethod] || order.paymentMethod || '—'}</p>
            <p><strong>Fecha:</strong> ${order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}</p>
            <h3>Productos</h3>
            ${(order.items || []).map(item => `
                <div class="order-item">
                    <p><strong>${item.productName}</strong>${item.colorName ? ` (${item.colorName})` : ''}${item.size ? ` [${item.size}]` : ''} × ${item.quantity}</p>
                    <p>Precio: ${formatCurrency(item.productPrice)}</p>
                </div>
            `).join('')}
            <h3>Total: ${formatCurrency(order.total)}</h3>
            <h3>Actualizar Estado</h3>
            <div class="form-group">
                <label>Estado de la Orden</label>
                <select id="orderStatusSelect">
                    <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>Pendiente</option>
                    <option value="processing" ${order.status === 'processing' ? 'selected' : ''}>Procesando</option>
                    <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>Completado</option>
                    <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>Cancelado</option>
                </select>
            </div>
            <div class="form-group">
                <label>Estado del Pago</label>
                <select id="paymentStatusSelect">
                    <option value="pending" ${order.paymentStatus === 'pending' ? 'selected' : ''}>Pendiente</option>
                    <option value="paid" ${order.paymentStatus === 'paid' ? 'selected' : ''}>Pagado</option>
                    <option value="failed" ${order.paymentStatus === 'failed' ? 'selected' : ''}>Fallido</option>
                </select>
            </div>
            <button class="btn-primary" onclick="updateOrderStatus(${order.id})">Actualizar</button>
        </div>
    `;
    document.getElementById('orderModal').classList.add('active');
}

async function updateOrderStatus(orderId) {
    const status = document.getElementById('orderStatusSelect').value;
    const paymentStatus = document.getElementById('paymentStatusSelect').value;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/orders/${orderId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, paymentStatus })
        });
        if (resp.ok) {
            alert('Orden actualizada');
            document.getElementById('orderModal').classList.remove('active');
            loadOrders();
            loadDashboard();
        }
    } catch (err) {
        console.error('Error updating order:', err);
        alert('Error al actualizar la orden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('orderModal');
    if (modal) {
        modal.querySelector('.close').onclick = () => modal.classList.remove('active');
    }
    setupImageUpload();
});

function imgUrl(url) {
    if (!url || url.startsWith('http') || url.startsWith('/')) return url;
    return '/assets/img/' + url;
}

async function loadProducts() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/products`);
        const data = await resp.json();
        const list = Array.isArray(data) ? data : (data.data || []);
        renderProducts(list);
    } catch (err) {
        console.error('Error loading products:', err);
    }
}

function renderProducts(products) {
    const container = document.getElementById('productsGrid');
    if (products.length === 0) {
        container.innerHTML = '<p class="loading">No hay productos</p>';
        return;
    }
    container.innerHTML = products.map(p => `
        <div class="product-card ${p.stock === 0 ? 'out-of-stock' : ''}">
            <img src="${imgUrl(p.imageUrl)}" alt="${p.name}" class="product-image" loading="lazy">
            <div class="product-info">
                <div class="product-name">${p.name}</div>
                <div class="product-price">${formatCurrency(p.price)}</div>
                <div class="product-stock">${p.stock === 0 ? '⚠ AGOTADO' : 'Stock: ' + p.stock} · ${p.category}</div>
                <div class="product-actions">
                    <button class="btn-success btn-sm" onclick="editProduct(${p.id})">Editar</button>
                    <button class="btn-danger btn-sm" onclick="deleteProduct(${p.id})">Eliminar</button>
                </div>
            </div>
        </div>
    `).join('');
}

document.getElementById('addProductBtn')?.addEventListener('click', () => showProductModal());

const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('adminLoginForm');
const loginError = document.getElementById('loginError');

function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.style.display = 'block';
}

function hideLoginError() {
    loginError.style.display = 'none';
}

function showAdminContent() {
    loginOverlay.classList.remove('active');
    document.querySelector('.admin-container').style.display = 'flex';
}

function showLoginOverlay() {
    loginOverlay.classList.add('active');
    document.querySelector('.admin-container').style.display = 'none';
}

async function checkAdminAuth() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/users`);
        if (resp.ok) {
            showAdminContent();
            loadDashboard();
            return;
        }
    } catch (_) {}
    showLoginOverlay();
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideLoginError();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Ingresando...';
    try {
        const resp = await csrfFetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (resp.ok) {
            const user = await resp.json();
            if (user.email !== 'latrode.co@gmail.com') {
                showLoginError('Solo el administrador puede acceder a este panel');
                return;
            }
            document.getElementById('loginEmail').value = '';
            document.getElementById('loginPassword').value = '';
            showAdminContent();
            document.getElementById('adminUsername').textContent = user.username;
            loadDashboard();
        } else {
            const err = await resp.json();
            showLoginError(err.error || 'Credenciales inválidas');
        }
    } catch (err) {
        showLoginError('Error de conexión con el servidor');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Ingresar';
    }
});

/* ========== Admin Password Reset ========== */
let resetStep = 1;
const ADMIN_EMAIL = 'latrode.co@gmail.com';

function showResetError(msg) {
    const el = document.getElementById('resetError');
    el.textContent = msg;
    el.style.display = 'block';
}

function hideResetError() {
    document.getElementById('resetError').style.display = 'none';
}

function showResetStep(step) {
    document.getElementById('adminResetStep1').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('adminResetStep2').style.display = step === 2 ? 'block' : 'none';
    document.getElementById('adminResetStep3').style.display = step === 3 ? 'block' : 'none';
}

document.getElementById('adminForgotLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('adminLoginView').style.display = 'none';
    document.getElementById('adminResetView').style.display = 'block';
    resetStep = 1;
    hideResetError();
    showResetStep(1);
});

document.getElementById('adminBackToLogin')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('adminLoginView').style.display = 'block';
    document.getElementById('adminResetView').style.display = 'none';
});

document.getElementById('adminSendCodeBtn')?.addEventListener('click', async () => {
    hideResetError();
    const btn = document.getElementById('adminSendCodeBtn');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
        const resp = await csrfFetch(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL })
        });
        if (resp.ok) {
            resetStep = 2;
            showResetStep(2);
        } else {
            const data = await resp.json();
            showResetError(data.error || 'Error al enviar código');
        }
    } catch (_) {
        showResetError('Error de conexión');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Enviar Código';
    }
});

document.getElementById('adminVerifyCodeBtn')?.addEventListener('click', async () => {
    hideResetError();
    const code = document.getElementById('resetCode').value.trim();
    if (!code) { showResetError('Ingresa el código'); return; }
    const btn = document.getElementById('adminVerifyCodeBtn');
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    try {
        const resp = await csrfFetch(`${API_BASE}/auth/verify-reset-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL, code })
        });
        if (resp.ok) {
            resetStep = 3;
            showResetStep(3);
        } else {
            const data = await resp.json();
            showResetError(data.error || 'Código inválido');
        }
    } catch (_) {
        showResetError('Error de conexión');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Verificar Código';
    }
});

document.getElementById('adminChangePwBtn')?.addEventListener('click', async () => {
    hideResetError();
    const newPassword = document.getElementById('resetNewPassword').value;
    if (!newPassword || newPassword.length < 6) {
        showResetError('La contraseña debe tener al menos 6 caracteres');
        return;
    }
    const code = document.getElementById('resetCode').value.trim();
    const btn = document.getElementById('adminChangePwBtn');
    btn.disabled = true;
    btn.textContent = 'Cambiando...';
    try {
        const resp = await csrfFetch(`${API_BASE}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: ADMIN_EMAIL, code, newPassword })
        });
        if (resp.ok) {
            alert('Contraseña actualizada exitosamente');
            document.getElementById('adminResetView').style.display = 'none';
            document.getElementById('adminLoginView').style.display = 'block';
        } else {
            const data = await resp.json();
            showResetError(data.error || 'Error al cambiar contraseña');
        }
    } catch (_) {
        showResetError('Error de conexión');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Cambiar Contraseña';
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await csrfFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
    } catch (_) {}
    document.getElementById('adminUsername').textContent = 'Admin';
    showLoginOverlay();
});

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.admin-container').style.display = 'none';
    checkAdminAuth();
});

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        if (!section) return;

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`section-${section}`)?.classList.add('active');

        document.getElementById('pageTitle').textContent = item.textContent.trim();

        switch (section) {
            case 'dashboard': loadDashboard(); break;
            case 'orders': loadOrders(); break;
            case 'products': loadProducts(); break;
            case 'payments': loadPaymentMethods(); break;
            case 'users': loadUsers(); break;
            case 'settings': loadSettings(); break;
            case 'logs': loadLogs(); break;
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const pm = document.getElementById('productModal');
    if (pm) {
        const existingClose = pm.querySelector('.close');
        if (existingClose) {
            existingClose.onclick = () => closeProductModal();
        }
    }
});
