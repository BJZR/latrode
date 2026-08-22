const API_BASE = '/api/v1';

function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getCSRFToken() {
    const cookie = document.cookie.split('; ').find(row => row.startsWith('csrf_token='));
    return cookie ? cookie.split('=')[1] : '';
}

async function csrfFetch(url, options = {}) {
    if (!options.headers) options.headers = {};
    if (typeof options.headers === 'object' && !(options.headers instanceof Headers)) {
        if (options.method && options.method !== 'GET' && options.method !== 'HEAD') {
            options.headers['X-CSRF-Token'] = getCSRFToken();
        }
    }
    return fetch(url, options);
}

let currentSection = 'dashboard';
let editingProductId = null;
let productColors = [];
let globalSizes = [];

function imgUrl(url) {
    if (!url || url.startsWith('http') || url.startsWith('/')) return url;
    return '/images/' + url;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(amount);
}

function formatDate(dateString) {
    if (!dateString) return '—';
    return new Intl.DateTimeFormat('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(dateString));
}

function statusText(status) {
    return { pending: 'Pendiente', processing: 'Procesando', completed: 'Completado', cancelled: 'Cancelado', paid: 'Pagado' }[status] || status;
}

function paymentStatusText(status) {
    return { pending: 'Pago Pendiente', paid: 'Pagado', failed: 'Fallido' }[status] || status;
}

function paymentMethodText(method) {
    return { cash_on_delivery: 'Contra Entrega', transfer: 'Transferencia', card: 'Tarjeta' }[method] || method;
}

/* ========== Image Upload ========== */
function setupImageUpload() {
    const area = document.getElementById('image-upload-area');
    const input = document.getElementById('image-file-input');
    if (!area) return;
    area.addEventListener('click', () => input.click());
    area.addEventListener('dragover', (e) => { e.preventDefault(); area.style.borderColor = '#666'; });
    area.addEventListener('dragleave', () => { area.style.borderColor = '#ccc'; });
    area.addEventListener('drop', (e) => { e.preventDefault(); area.style.borderColor = '#ccc'; if (e.dataTransfer.files.length) handleImageFile(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => { if (input.files.length) handleImageFile(input.files[0]); });

    async function handleImageFile(file) {
        if (!file.type.match(/^image\/(jpeg|png|webp|gif)$/)) { alert('Formato no permitido. Usa JPG, PNG, WebP o GIF.'); return; }
        if (file.size > 5*1024*1024) { alert('El archivo es demasiado grande. Máximo 5MB.'); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('image-preview').src = e.target.result;
            document.getElementById('image-preview').style.display = 'block';
            document.getElementById('image-upload-placeholder').style.display = 'none';
            area.classList.add('has-image');
        };
        reader.readAsDataURL(file);
        const formData = new FormData();
        formData.append('image', file);
        try {
            area.style.opacity = '0.5';
            const resp = await csrfFetch(`${API_BASE}/admin/upload`, { method: 'POST', body: formData });
            if (resp.ok) { const d = await resp.json(); document.getElementById('image_url_hidden').value = d.filename; }
            else { alert('Error al subir imagen'); resetImageUpload(); }
        } catch(_) { alert('Error al subir imagen'); resetImageUpload(); }
        finally { area.style.opacity = '1'; }
    }
}

function resetImageUpload() {
    ['image-preview','image-upload-placeholder','image-upload-area','image_url_hidden','image-file-input'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'image-preview') el.style.display = 'none';
        else if (id === 'image-upload-placeholder') el.style.display = 'flex';
        else if (id === 'image-upload-area') el.classList.remove('has-image');
        else el.value = '';
    });
}

function setImageUploadPreview(url) {
    const preview = document.getElementById('image-preview');
    const ph = document.getElementById('image-upload-placeholder');
    const area = document.getElementById('image-upload-area');
    if (!preview || !url) return;
    preview.src = url.startsWith('http') || url.startsWith('/') ? url : '/images/' + url;
    preview.style.display = 'block'; ph.style.display = 'none'; area.classList.add('has-image');
    document.getElementById('image_url_hidden').value = url;
}

function onGlobalSizesChange() {
    const input = document.getElementById('product-sizes-input');
    globalSizes = (input.value || '').split(',').map(s => s.trim()).filter(Boolean);
}

function setupColorImageUpload() {
    const area = document.getElementById('color-image-upload');
    const input = document.getElementById('color-image-file-input');
    if (!area) return;
    area.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { if (input.files.length) handleColorFile(input.files[0]); });

    async function handleColorFile(file) {
        if (!file.type.match(/^image\/(jpeg|png|webp|gif)$/)) { alert('Formato no permitido.'); return; }
        if (file.size > 5*1024*1024) { alert('Máximo 5MB.'); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('color-image-preview').src = e.target.result;
            document.getElementById('color-image-preview').style.display = 'block';
            document.getElementById('color-image-placeholder').style.display = 'none';
            area.classList.add('has-image');
        };
        reader.readAsDataURL(file);
        const formData = new FormData();
        formData.append('image', file);
        try {
            area.style.opacity = '0.5';
            const resp = await csrfFetch(`${API_BASE}/admin/upload`, { method: 'POST', body: formData });
            if (resp.ok) { const d = await resp.json(); document.getElementById('color-image-hidden').value = d.filename; }
            else { alert('Error al subir imagen'); resetColorImageUpload(); }
        } catch(_) { alert('Error al subir imagen'); resetColorImageUpload(); }
        finally { area.style.opacity = '1'; }
    }
}

function resetColorImageUpload() {
    ['color-image-preview','color-image-placeholder','color-image-upload','color-image-hidden','color-image-file-input'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (id === 'color-image-preview') el.style.display = 'none';
        else if (id === 'color-image-placeholder') el.style.display = 'flex';
        else if (id === 'color-image-upload') el.classList.remove('has-image');
        else el.value = '';
    });
}

/* ========== Colors ========== */
function addColor() {
    const name = document.getElementById('color-name-input').value.trim();
    const hex = document.getElementById('color-hex-input').value.trim();
    const imageUrl = document.getElementById('color-image-hidden')?.value || '';
    if (!name || !hex) return;
    productColors.push({ name, hex_code: hex, imageUrl, sizes: [] });
    document.getElementById('color-name-input').value = '';
    document.getElementById('color-hex-input').value = '';
    resetColorImageUpload();
    renderColorList();
}

function removeColor(index) { productColors.splice(index, 1); renderColorList(); }

function renderColorList() {
    document.getElementById('color-list').innerHTML = productColors.map((c, i) => {
        const thumb = c.imageUrl ? `<img src="${imgUrl(c.imageUrl)}" class="color-thumb" alt="">` : '';
        return `<div class="color-chip"><span class="color-swatch" style="background:${c.hex_code}"></span><span class="color-chip-name">${c.name}</span>${thumb}<button type="button" class="color-remove" onclick="removeColor(${i})">&times;</button></div>`;
    }).join('');
}

/* ========== Products ========== */
async function loadProducts() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/products`);
        const data = await resp.json();
        renderProducts(Array.isArray(data) ? data : (data.data || []));
    } catch(_) {}
}

function renderProducts(products) {
    const c = document.getElementById('productsGrid');
    if (!products.length) { c.innerHTML = '<p class="loading">No hay productos</p>'; return; }
    c.innerHTML = products.map(p => `
        <div class="product-card">
            <img src="${imgUrl(p.imageUrl)}" alt="${p.name}" class="product-image" loading="lazy">
            <div class="product-info">
                <div class="product-name">${escapeHTML(p.name)}</div>
                <div class="product-price">${formatCurrency(p.price)}</div>
                <div class="product-stock">${p.category || ''}</div>
                <div class="product-actions">
                    <button class="btn-success btn-sm" onclick="editProduct(${p.id})">Editar</button>
                    <button class="btn-warning btn-sm" onclick="trashProduct(${p.id}, '${escapeHTML(p.name).replace(/'/g,"\\'")}')">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function editProduct(id) {
    try {
        const resp = await csrfFetch(`${API_BASE}/products/${id}`);
        const product = await resp.json();
        editingProductId = id;
        showProductModal(product);
    } catch(_) { alert('Error al cargar el producto'); }
}

function showProductModal(product = null) {
    const modal = document.getElementById('productModal');
    const form = document.getElementById('productForm');
    resetImageUpload();
    if (product) {
        document.getElementById('productModalTitle').textContent = 'Editar Producto';
        form.name.value = product.name;
        form.description.value = product.description;
        form.price.value = product.price;
        form.category.value = product.category;
        if (product.imageUrl) setImageUploadPreview(product.imageUrl);
        form.material.value = product.material || '';
        form.sizes.value = (product.sizes || []).join(', ');
        onGlobalSizesChange();
        productColors = (product.colors || []).map(c => ({ name: c.name, hex_code: c.hex, imageUrl: c.imageUrl || '', sizes: c.sizes || [] }));
    } else {
        document.getElementById('productModalTitle').textContent = 'Nuevo Producto';
        form.reset(); onGlobalSizesChange(); productColors = [];
    }
    renderColorList();
    modal.classList.add('active');
}

function closeProductModal() { document.getElementById('productModal').classList.remove('active'); editingProductId = null; }

document.getElementById('productForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const colors = productColors.map(c => ({ name: c.name, hex: c.hex_code, stock: -1, imageUrl: c.imageUrl || '', sizes: [] }));
    const payload = {
        name: form.name.value, description: form.description.value, price: parseFloat(form.price.value) || 0,
        stock: -1, category: form.category.value, imageUrl: document.getElementById('image_url_hidden').value,
        material: form.material.value, sizes: form.sizes.value.split(',').map(s=>s.trim()).filter(Boolean), colors
    };
    try {
        const url = editingProductId ? `${API_BASE}/admin/products/${editingProductId}` : `${API_BASE}/admin/products`;
        const resp = await csrfFetch(url, { method: editingProductId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (resp.ok) { closeProductModal(); loadProducts(); } else { const err = await resp.json(); alert(err.error || 'Error al guardar'); }
    } catch(_) { alert('Error al guardar producto'); }
});

document.getElementById('addProductBtn')?.addEventListener('click', () => showProductModal());

/* ========== Products Trash ========== */
async function trashProduct(id, name) {
    if (!confirm(`¿Enviar "${name}" a la papelería?`)) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/products/${id}`, { method: 'DELETE' });
        if (resp.ok) loadProducts(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

function switchProductsTab(tab) {
    document.querySelectorAll('#section-products .tab-btn').forEach((b,i) => b.classList.toggle('active', (tab==='list'?i===0:i===1)));
    document.getElementById('productsListView').style.display = tab==='list' ? '' : 'none';
    document.getElementById('productsTrashView').style.display = tab==='trash' ? '' : 'none';
    if (tab === 'trash') loadTrashedProducts();
}

async function loadTrashedProducts() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/products`);
        const items = await resp.json();
        renderTrashedProducts(items || []);
    } catch(_) {}
}

function renderTrashedProducts(items) {
    const c = document.getElementById('productsTrashGrid');
    if (!items.length) { c.innerHTML = '<p class="loading">La papelería está vacía</p>'; return; }
    c.innerHTML = items.map(p => `
        <div class="product-card trash-card">
            <img src="${imgUrl(p.imageUrl)}" alt="${p.name}" class="product-image" loading="lazy">
            <div class="product-info">
                <div class="product-name">${escapeHTML(p.name)}</div>
                <div class="product-price">${formatCurrency(p.price)}</div>
                <div class="product-stock">Eliminado: ${formatDate(p.deletedAt)}</div>
                <div class="product-actions">
                    <button class="btn-success btn-sm" onclick="restoreProduct(${p.id})">Restaurar</button>
                    <button class="btn-danger btn-sm" onclick="permanentDeleteProduct(${p.id}, '${escapeHTML(p.name).replace(/'/g,"\\'")}')">Eliminar</button>
                </div>
            </div>
        </div>
    `).join('');
}

async function restoreProduct(id) {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/restore/products/${id}`, { method: 'POST' });
        if (resp.ok) loadTrashedProducts(); else alert('Error al restaurar');
    } catch(_) { alert('Error de conexión'); }
}

async function permanentDeleteProduct(id, name) {
    if (!confirm(`¿Eliminar permanentemente "${name}"?\n\nEsta acción no se puede deshacer.`)) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/permanent/products/${id}`, { method: 'DELETE' });
        if (resp.ok) loadTrashedProducts(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

async function emptyProductsTrash() {
    if (!confirm('¿Vaciar toda la papelería de productos?\n\nSe eliminarán permanentemente todos los productos eliminados.')) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/empty?section=products`, { method: 'DELETE' });
        if (resp.ok) loadTrashedProducts(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

/* ========== Orders ========== */
async function loadOrders() {
    const sf = document.getElementById('orderStatusFilter')?.value || '';
    const pf = document.getElementById('paymentStatusFilter')?.value || '';
    let url = `${API_BASE}/admin/orders`;
    const params = new URLSearchParams();
    if (sf) params.set('status', sf);
    if (pf) params.set('payment_status', pf);
    const qs = params.toString();
    if (qs) url += '?' + qs;
    try {
        const resp = await csrfFetch(url);
        renderOrders(await resp.json() || []);
    } catch(_) {}
}

function renderOrders(orders) {
    const c = document.getElementById('ordersTable');
    if (!orders.length) { c.innerHTML = '<p class="loading">No hay órdenes</p>'; return; }
    c.innerHTML = `
        <div class="table-actions-bar" id="ordersActionsBar" style="display:none">
            <span id="ordersSelectedCount">0 seleccionados</span>
            <button class="btn-danger btn-sm" onclick="bulkTrashOrders()">🗑️ Enviar a papelera</button>
        </div>
        <div class="table-responsive">
        <table class="table-orders">
            <thead><tr>
                <th class="col-check"><input type="checkbox" id="ordersSelectAll" onchange="toggleAllOrders(this.checked)"></th>
                <th class="col-id">ID</th><th>Cliente</th><th>Total</th><th>Estado</th><th class="col-paystatus">Pago</th><th class="col-method">Método</th><th class="col-date">Fecha</th><th class="col-actions">Acciones</th>
            </tr></thead>
            <tbody>
            ${orders.map(o => `<tr>
                <td class="col-check"><input type="checkbox" class="order-checkbox" data-id="${o.id}" onchange="updateOrdersBar()"></td>
                <td class="col-id" data-label="ID">#${o.id}</td>
                <td data-label="Cliente">Usuario #${o.userId}</td>
                <td data-label="Total">${formatCurrency(o.total)}</td>
                <td data-label="Estado"><span class="status-badge ${o.status}">${statusText(o.status)}</span></td>
                <td class="col-paystatus" data-label="Pago"><span class="status-badge ${o.paymentStatus}">${paymentStatusText(o.paymentStatus)}</span></td>
                <td class="col-method" data-label="Método">${paymentMethodText(o.paymentMethod)}</td>
                <td class="col-date" data-label="Fecha">${formatDate(o.createdAt)}</td>
                <td class="col-actions row-actions">
                    <button class="btn-success btn-sm" onclick="viewOrder(${o.id})">Ver</button>
                    <button class="btn-warning btn-sm" onclick="trashOrder(${o.id})">🗑️</button>
                </td>
            </tr>`).join('')}
            </tbody>
        </table></div>`;
}

function toggleAllOrders(checked) { document.querySelectorAll('.order-checkbox').forEach(cb => cb.checked = checked); updateOrdersBar(); }

function updateOrdersBar() {
    const count = document.querySelectorAll('.order-checkbox:checked').length;
    const bar = document.getElementById('ordersActionsBar');
    bar.style.display = count > 0 ? 'flex' : 'none';
    document.getElementById('ordersSelectedCount').textContent = `${count} seleccionados`;
}

async function trashOrder(id) {
    if (!confirm(`¿Enviar orden #${id} a la papelería?`)) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/orders/${id}`, { method: 'DELETE' });
        if (resp.ok) loadOrders(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

async function bulkTrashOrders() {
    const ids = Array.from(document.querySelectorAll('.order-checkbox:checked')).map(cb => parseInt(cb.dataset.id));
    if (!ids.length) return;
    if (!confirm(`¿Enviar ${ids.length} orden(es) a la papelería?`)) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/orders`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
        if (resp.ok) loadOrders(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

function switchOrdersTab(tab) {
    document.querySelectorAll('#section-orders .tab-btn').forEach((b,i) => b.classList.toggle('active', (tab==='list'?i===0:i===1)));
    document.getElementById('ordersListView').style.display = tab==='list' ? '' : 'none';
    document.getElementById('ordersTrashView').style.display = tab==='trash' ? '' : 'none';
    if (tab === 'trash') loadTrashedOrders();
}

async function loadTrashedOrders() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/orders`);
        renderTrashedOrders(await resp.json() || []);
    } catch(_) {}
}

function renderTrashedOrders(orders) {
    const c = document.getElementById('ordersTrashTable');
    if (!orders.length) { c.innerHTML = '<p class="loading">La papelería está vacía</p>'; return; }
    c.innerHTML = `
        <div class="table-actions-bar" id="trashOrdersBar" style="display:none">
            <span id="trashOrdersSelectedCount">0 seleccionados</span>
            <button class="btn-success btn-sm" onclick="bulkRestoreOrders()">Restaurar</button>
            <button class="btn-danger btn-sm" onclick="bulkPermanentDeleteOrders()">Eliminar</button>
        </div>
        <div class="table-responsive">
        <table class="table-trash table-orders">
            <thead><tr>
                <th class="col-check"><input type="checkbox" id="trashOrdersSelectAll" onchange="toggleAllTrashOrders(this.checked)"></th>
                <th class="col-id">ID</th><th>Cliente</th><th>Total</th><th>Estado</th><th class="col-date">Eliminado</th><th class="col-actions">Acciones</th>
            </tr></thead>
            <tbody>
            ${orders.map(o => `<tr>
                <td class="col-check"><input type="checkbox" class="trash-order-checkbox" data-id="${o.id}" onchange="updateTrashOrdersBar()"></td>
                <td class="col-id" data-label="ID">#${o.id}</td>
                <td data-label="Cliente">Usuario #${o.userId}</td>
                <td data-label="Total">${formatCurrency(o.total)}</td>
                <td data-label="Estado"><span class="status-badge ${o.status}">${statusText(o.status)}</span></td>
                <td class="col-date" data-label="Eliminado">${formatDate(o.deletedAt)}</td>
                <td class="col-actions row-actions">
                    <button class="btn-success btn-sm" onclick="restoreOrder(${o.id})">Restaurar</button>
                    <button class="btn-danger btn-sm" onclick="permanentDeleteOrder(${o.id})">Eliminar</button>
                </td>
            </tr>`).join('')}
            </tbody>
        </table></div>`;
}

function toggleAllTrashOrders(checked) { document.querySelectorAll('.trash-order-checkbox').forEach(cb => cb.checked = checked); updateTrashOrdersBar(); }
function updateTrashOrdersBar() {
    const count = document.querySelectorAll('.trash-order-checkbox:checked').length;
    const bar = document.getElementById('trashOrdersBar');
    bar.style.display = count > 0 ? 'flex' : 'none';
    document.getElementById('trashOrdersSelectedCount').textContent = `${count} seleccionados`;
}

async function restoreOrder(id) {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/restore/orders/${id}`, { method: 'POST' });
        if (resp.ok) loadTrashedOrders(); else alert('Error al restaurar');
    } catch(_) { alert('Error de conexión'); }
}

async function bulkRestoreOrders() {
    const ids = Array.from(document.querySelectorAll('.trash-order-checkbox:checked')).map(cb => parseInt(cb.dataset.id));
    if (!ids.length) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/restore/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
        if (resp.ok) loadTrashedOrders(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

async function permanentDeleteOrder(id) {
    if (!confirm('¿Eliminar permanentemente esta orden?')) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/permanent/orders/${id}`, { method: 'DELETE' });
        if (resp.ok) loadTrashedOrders(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

async function bulkPermanentDeleteOrders() {
    const ids = Array.from(document.querySelectorAll('.trash-order-checkbox:checked')).map(cb => parseInt(cb.dataset.id));
    if (!ids.length) return;
    if (!confirm(`¿Eliminar permanentemente ${ids.length} orden(es)? Esta acción no se puede deshacer.`)) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/permanent/orders`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
        if (resp.ok) loadTrashedOrders(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

async function emptyOrdersTrash() {
    if (!confirm('¿Vaciar toda la papelería de órdenes?')) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/empty?section=orders`, { method: 'DELETE' });
        if (resp.ok) loadTrashedOrders(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

/* ========== Order Details ========== */
async function viewOrder(orderId) {
    try {
        const resp = await csrfFetch(`${API_BASE}/orders/${orderId}`);
        renderOrderDetails(await resp.json());
    } catch(_) { alert('Error al cargar detalles'); }
}

function renderOrderDetails(order) {
    const c = document.getElementById('orderDetails');
    c.innerHTML = `
        <div class="order-details">
            <h3>Información de Envío</h3>
            <p><strong>Nombre:</strong> ${order.shippingName || '—'}</p>
            <p><strong>Dirección:</strong> ${order.shippingAddress || '—'}</p>
            <p><strong>Ciudad:</strong> ${order.shippingCity || '—'}</p>
            <p><strong>Teléfono:</strong> ${order.shippingPhone || '—'}</p>
            <p><strong>Método de Pago:</strong> ${paymentMethodText(order.paymentMethod)}</p>
            <p><strong>Fecha:</strong> ${order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}</p>
            <h3>Productos</h3>
            ${(order.items||[]).map(item => {
                const img = item.colorImageUrl || item.imageUrl;
                return `<div class="order-item order-item-row">
                    ${img ? `<img src="${imgUrl(img)}" class="order-item-img" alt="">` : ''}
                    <div class="order-item-info">
                        <p><strong>${item.productName}</strong></p>
                        ${item.colorName ? `<p>${item.colorName}</p>` : ''}
                        <p>Cantidad: ${item.quantity || 1}</p>
                    </div>
                </div>`;
            }).join('')}
            <h3>Total: ${formatCurrency(order.total)}</h3>
            <h3>Actualizar Estado</h3>
            <div class="form-group"><label>Estado de la Orden</label>
                <select id="orderStatusSelect">
                    <option value="pending" ${order.status==='pending'?'selected':''}>Pendiente</option>
                    <option value="processing" ${order.status==='processing'?'selected':''}>Procesando</option>
                    <option value="completed" ${order.status==='completed'?'selected':''}>Completado</option>
                    <option value="cancelled" ${order.status==='cancelled'?'selected':''}>Cancelado</option>
                </select>
            </div>
            <div class="form-group"><label>Estado del Pago</label>
                <select id="paymentStatusSelect">
                    <option value="pending" ${order.paymentStatus==='pending'?'selected':''}>Pendiente</option>
                    <option value="paid" ${order.paymentStatus==='paid'?'selected':''}>Pagado</option>
                    <option value="failed" ${order.paymentStatus==='failed'?'selected':''}>Fallido</option>
                </select>
            </div>
            <button class="btn-primary" onclick="updateOrderStatus(${order.id})">Actualizar</button>
        </div>`;
    document.getElementById('orderModal').classList.add('active');
}

async function updateOrderStatus(orderId) {
    const status = document.getElementById('orderStatusSelect').value;
    const paymentStatus = document.getElementById('paymentStatusSelect').value;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/orders/${orderId}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, paymentStatus }) });
        if (resp.ok) { document.getElementById('orderModal').classList.remove('active'); loadOrders(); loadDashboard(); }
    } catch(_) { alert('Error al actualizar'); }
}

/* ========== Users ========== */
let allUsers = [];
let _adminUsers = [];

async function loadUsers() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/users`);
        allUsers = await resp.json();
        renderUsers(allUsers || []);
    } catch(_) {}
}

function applyUsersFilter() {
    const q = document.getElementById('usersSearchInput').value.toLowerCase().trim();
    const role = document.getElementById('usersRoleFilter').value;
    let filtered = allUsers;
    if (q) filtered = filtered.filter(u => (u.username||'').toLowerCase().includes(q) || (u.email||'').toLowerCase().includes(q));
    if (role) filtered = filtered.filter(u => u.role === role);
    renderUsers(filtered);
}

function renderUsers(users) {
    _adminUsers = users;
    const c = document.getElementById('usersTable');
    if (!users.length) { c.innerHTML = '<p class="loading">No hay usuarios</p>'; return; }
    c.innerHTML = `
        <div class="table-actions-bar" id="usersActionsBar" style="display:none">
            <span id="usersSelectedCount">0 seleccionados</span>
            <button class="btn-danger btn-sm" onclick="bulkTrashUsers()">🗑️ Enviar a papelera</button>
        </div>
        <div class="table-responsive">
        <table class="table-users">
            <thead><tr>
                <th class="col-check"><input type="checkbox" id="usersSelectAll" onchange="toggleAllUsers(this.checked)"></th>
                <th>Usuario</th><th>Email</th><th>Tipo</th><th class="col-actions">Acciones</th>
            </tr></thead>
            <tbody>
            ${users.map((u,i) => `<tr>
                <td class="col-check"><input type="checkbox" class="user-checkbox" data-id="${u.id}" onchange="updateUsersBar()"></td>
                <td data-label="Usuario"><div class="user-cell"><span class="user-avatar">${(u.username||'?')[0].toUpperCase()}</span><span class="user-name">${escapeHTML(u.username)}</span></div></td>
                <td data-label="Email">${escapeHTML(u.email)}</td>
                <td data-label="Tipo"><span class="status-badge ${u.role}">${u.role==='admin'?'Admin':'Cliente'}</span></td>
                <td class="col-actions row-actions">
                    <button class="btn-success btn-sm" onclick="editUser(${i})">Editar</button>
                    <button class="btn-warning btn-sm" onclick="trashUser(${u.id}, '${escapeHTML(u.username).replace(/'/g,"\\'")}')">🗑️</button>
                </td>
            </tr>`).join('')}
            </tbody>
        </table></div>`;
}

function toggleAllUsers(checked) { document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = checked); updateUsersBar(); }
function updateUsersBar() {
    const count = document.querySelectorAll('.user-checkbox:checked').length;
    const bar = document.getElementById('usersActionsBar');
    bar.style.display = count > 0 ? 'flex' : 'none';
    document.getElementById('usersSelectedCount').textContent = `${count} seleccionados`;
}

let editingUserId = null;

function editUser(idx) {
    const u = _adminUsers[idx];
    if (!u) return;
    editingUserId = u.id;
    const f = document.getElementById('userForm');
    f.username.value = u.username || ''; f.email.value = u.email || ''; f.role.value = u.role || 'customer';
    f.phone.value = u.phone || ''; f.address.value = u.address || ''; f.city.value = u.city || '';
    f.postalCode.value = u.postalCode || ''; f.country.value = u.country || '';
    f.documentType.value = u.documentType || ''; f.documentNumber.value = u.documentNumber || '';
    document.getElementById('userModal').classList.add('active');
}

function closeUserModal() { document.getElementById('userModal').classList.remove('active'); editingUserId = null; }

document.getElementById('userForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingUserId) return;
    const f = e.target;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/users/${editingUserId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: f.username.value, email: f.email.value, role: f.role.value, phone: f.phone.value, address: f.address.value, city: f.city.value, postalCode: f.postalCode.value, country: f.country.value, documentType: f.documentType.value, documentNumber: f.documentNumber.value })
        });
        if (resp.ok) { closeUserModal(); loadUsers(); } else { const err = await resp.json(); alert(err.error || 'Error'); }
    } catch(_) { alert('Error de conexión'); }
});

async function trashUser(id, name) {
    if (!confirm(`¿Enviar "${name}" a la papelería?`)) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/users/${id}`, { method: 'DELETE' });
        if (resp.ok) loadUsers(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

async function bulkTrashUsers() {
    const ids = Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => parseInt(cb.dataset.id));
    if (!ids.length) return;
    if (!confirm(`¿Enviar ${ids.length} usuario(s) a la papelería?`)) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/users`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
        if (resp.ok) loadUsers(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

function switchUsersTab(tab) {
    document.querySelectorAll('#section-users .tab-btn').forEach((b,i) => b.classList.toggle('active', (tab==='list'?i===0:i===1)));
    document.getElementById('usersListView').style.display = tab==='list' ? '' : 'none';
    document.getElementById('usersTrashView').style.display = tab==='trash' ? '' : 'none';
    if (tab === 'trash') loadTrashedUsers();
}

async function loadTrashedUsers() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/users`);
        renderTrashedUsers(await resp.json() || []);
    } catch(_) {}
}

function renderTrashedUsers(users) {
    const c = document.getElementById('usersTrashTable');
    if (!users.length) { c.innerHTML = '<p class="loading">La papelería está vacía</p>'; return; }
    c.innerHTML = `
        <div class="table-actions-bar" id="trashUsersBar" style="display:none">
            <span id="trashUsersSelectedCount">0 seleccionados</span>
            <button class="btn-success btn-sm" onclick="bulkRestoreUsers()">Restaurar</button>
            <button class="btn-danger btn-sm" onclick="bulkPermanentDeleteUsers()">Eliminar</button>
        </div>
        <div class="table-responsive">
        <table class="table-trash table-users">
            <thead><tr>
                <th class="col-check"><input type="checkbox" id="trashUsersSelectAll" onchange="toggleAllTrashUsers(this.checked)"></th>
                <th>Usuario</th><th>Email</th><th>Tipo</th><th class="col-actions">Acciones</th>
            </tr></thead>
            <tbody>
            ${users.map(u => `<tr>
                <td class="col-check"><input type="checkbox" class="trash-user-checkbox" data-id="${u.id}" onchange="updateTrashUsersBar()"></td>
                <td data-label="Usuario"><div class="user-cell"><span class="user-avatar">${(u.username||'?')[0].toUpperCase()}</span><span class="user-name">${escapeHTML(u.username)}</span></div></td>
                <td data-label="Email">${escapeHTML(u.email)}</td>
                <td data-label="Tipo"><span class="status-badge ${u.role}">${u.role==='admin'?'Admin':'Cliente'}</span></td>
                <td class="col-actions row-actions">
                    <button class="btn-success btn-sm" onclick="restoreUser(${u.id})">Restaurar</button>
                    <button class="btn-danger btn-sm" onclick="permanentDeleteUser(${u.id}, '${escapeHTML(u.username).replace(/'/g,"\\'")}')">Eliminar</button>
                </td>
            </tr>`).join('')}
            </tbody>
        </table></div>`;
}

function toggleAllTrashUsers(checked) { document.querySelectorAll('.trash-user-checkbox').forEach(cb => cb.checked = checked); updateTrashUsersBar(); }
function updateTrashUsersBar() {
    const count = document.querySelectorAll('.trash-user-checkbox:checked').length;
    const bar = document.getElementById('trashUsersBar');
    bar.style.display = count > 0 ? 'flex' : 'none';
    document.getElementById('trashUsersSelectedCount').textContent = `${count} seleccionados`;
}

async function restoreUser(id) {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/restore/users/${id}`, { method: 'POST' });
        if (resp.ok) loadTrashedUsers(); else alert('Error al restaurar');
    } catch(_) { alert('Error de conexión'); }
}

async function bulkRestoreUsers() {
    const ids = Array.from(document.querySelectorAll('.trash-user-checkbox:checked')).map(cb => parseInt(cb.dataset.id));
    if (!ids.length) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/restore/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
        if (resp.ok) loadTrashedUsers(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

async function permanentDeleteUser(id, name) {
    if (!confirm(`¿Eliminar permanentemente a "${name}"?`)) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/permanent/users/${id}`, { method: 'DELETE' });
        if (resp.ok) loadTrashedUsers(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

async function bulkPermanentDeleteUsers() {
    const ids = Array.from(document.querySelectorAll('.trash-user-checkbox:checked')).map(cb => parseInt(cb.dataset.id));
    if (!ids.length) return;
    if (!confirm(`¿Eliminar permanentemente ${ids.length} usuario(s)?`)) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/permanent/users`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
        if (resp.ok) loadTrashedUsers(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

async function emptyUsersTrash() {
    if (!confirm('¿Vaciar toda la papelería de usuarios?')) return;
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/trash/empty?section=users`, { method: 'DELETE' });
        if (resp.ok) loadTrashedUsers(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

/* ========== Payments ========== */
async function loadPaymentMethods() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/payment-methods`);
        renderPaymentMethods(await resp.json() || []);
    } catch(_) {}
}

function renderPaymentMethods(methods) {
    const c = document.getElementById('paymentMethods');
    if (!methods.length) { c.innerHTML = '<p class="loading">No hay métodos de pago</p>'; return; }
    c.innerHTML = methods.map(m => `
        <div class="payment-card ${m.enabled?'':'payment-card-disabled'}">
            <div class="payment-card-header">
                <div class="payment-card-info">
                    <h3>${paymentMethodText(m.name)}</h3>
                    <p class="payment-card-desc">${m.description||''}</p>
                </div>
                <button class="payment-toggle-btn ${m.enabled?'active':''}" onclick="togglePaymentMethod(${m.id}, ${m.enabled})">
                    <span class="payment-toggle-track"><span class="payment-toggle-thumb"></span></span>
                    <span class="payment-toggle-label">${m.enabled?'Activo':'Inactivo'}</span>
                </button>
            </div>
        </div>
    `).join('');
}

async function togglePaymentMethod(id, currentEnabled) {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/payment-methods/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !currentEnabled }) });
        if (resp.ok) loadPaymentMethods(); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

/* ========== Settings ========== */
async function loadSettings() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/settings`);
        renderSettings(await resp.json() || []);
    } catch(_) {}
}

const SETTING_LABELS = { iva: 'IVA (%)', comision: 'Comisión ($)', envio: 'Envío ($)', site_name: 'Nombre del sitio', site_description: 'Descripción', contact_phone: 'Teléfono de contacto', contact_email: 'Correo de contacto', free_shipping_min: 'Envío gratis desde ($)' };
const PRICING_KEYS = ['iva', 'comision', 'envio'];

function renderSettings(settings) {
    const c = document.getElementById('settingsForm');
    if (!settings.length) { c.innerHTML = '<p class="loading">No hay configuraciones</p>'; return; }
    const pricing = settings.filter(s => PRICING_KEYS.includes(s.key));
    const other = settings.filter(s => !PRICING_KEYS.includes(s.key));
    let html = '';
    if (pricing.length) {
        html += `<div class="settings-group"><h4>Precios y Recargos</h4><div class="settings-grid">`;
        pricing.forEach(s => { html += `<div class="form-group" style="position:relative"><label>${SETTING_LABELS[s.key]||s.key}</label><input type="number" value="${s.value}" step="0.01" onchange="updateSetting('${s.key}', this.value)"><span class="input-suffix">${s.key==='iva'?'%':'$'}</span></div>`; });
        html += `</div></div>`;
    }
    if (other.length) {
        html += `<div class="settings-group"><h4>General</h4>`;
        other.forEach(s => { html += `<div class="form-group"><label>${SETTING_LABELS[s.key]||s.key}</label><input type="text" value="${s.value}" onchange="updateSetting('${s.key}', this.value)"></div>`; });
        html += `</div>`;
    }
    c.innerHTML = html;
}

async function updateSetting(key, value) {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, value }) });
        if (resp.ok) alert('Configuración actualizada'); else alert('Error');
    } catch(_) { alert('Error de conexión'); }
}

/* ========== Logs ========== */
async function loadLogs() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/logs`);
        renderLogs(await resp.json() || []);
    } catch(_) {}
}

function renderLogs(logs) {
    const c = document.getElementById('logsTable');
    if (!logs.length) { c.innerHTML = '<p class="loading">No hay logs</p>'; return; }
    c.innerHTML = `<div class="table-responsive"><table class="table-trash">
        <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th class="col-email">Entidad</th><th class="col-phone">IP</th></tr></thead>
        <tbody>${logs.map(l => `<tr><td>${formatDate(l.createdAt)}</td><td>${l.userId||'N/A'}</td><td>${l.action}</td><td class="col-email">${l.entity||'N/A'}</td><td class="col-phone">${l.ipAddress||'N/A'}</td></tr>`).join('')}</tbody>
    </table></div>`;
}

/* ========== Dashboard ========== */
async function loadDashboard() {
    try {
        const resp = await csrfFetch(`${API_BASE}/admin/dashboard/stats`);
        renderDashboardStats(await resp.json());
    } catch(_) {}
}

function renderDashboardStats(stats) {
    document.getElementById('totalRevenue').textContent = formatCurrency(stats.totalRevenue);
    document.getElementById('totalOrders').textContent = stats.totalOrders;
    document.getElementById('pendingOrders').textContent = stats.pendingOrders;
    document.getElementById('totalCustomers').textContent = stats.totalCustomers;

    const orders = stats.recentOrders || [];
    document.getElementById('recentOrders').innerHTML = orders.length === 0
        ? '<p class="loading">No hay órdenes recientes</p>'
        : `<div class="table-responsive"><table class="table-orders"><thead><tr><th class="col-id">ID</th><th>Total</th><th>Estado</th><th class="col-paystatus">Pago</th><th class="col-date">Fecha</th></tr></thead><tbody>
            ${orders.map(o => `<tr><td class="col-id" data-label="ID">#${o.id}</td><td data-label="Total">${formatCurrency(o.total)}</td><td data-label="Estado"><span class="status-badge ${o.status}">${statusText(o.status)}</span></td><td class="col-paystatus" data-label="Pago"><span class="status-badge ${o.paymentStatus}">${paymentStatusText(o.paymentStatus||'pending')}</span></td><td class="col-date" data-label="Fecha">${formatDate(o.createdAt)}</td></tr>`).join('')}
        </tbody></table></div>`;

    const products = stats.topProducts || [];
    document.getElementById('topProducts').innerHTML = products.length === 0
        ? '<p class="loading">Sin ventas aún</p>'
        : products.map(p => {
            const img = p.imageUrl ? `<img src="${imgUrl(p.imageUrl)}" alt="${p.name}" class="top-product-img">` : '<div class="top-product-img placeholder"></div>';
            return `<div class="top-product-item">${img}<div class="top-product-info"><span class="top-product-name">${p.name}</span><span class="top-product-price">${formatCurrency(p.price)}</span></div></div>`;
        }).join('');
}

/* ========== Auth ========== */
const loginOverlay = document.getElementById('loginOverlay');
const loginForm = document.getElementById('adminLoginForm');
const loginError = document.getElementById('loginError');

function showLoginError(msg) { loginError.textContent = msg; loginError.style.display = 'block'; }
function hideLoginError() { loginError.style.display = 'none'; }
function showAdminContent() { loginOverlay.classList.remove('active'); document.querySelector('.admin-container').style.display = 'flex'; }
function showLoginOverlay() { loginOverlay.classList.add('active'); document.querySelector('.admin-container').style.display = 'none'; }

async function checkAdminAuth() {
    try { const resp = await csrfFetch(`${API_BASE}/admin/users`); if (resp.ok) { showAdminContent(); loadDashboard(); return; } } catch(_) {}
    showLoginOverlay();
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault(); hideLoginError();
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const btn = loginForm.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Ingresando...';
    try {
        const resp = await csrfFetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
        if (resp.ok) {
            const user = await resp.json();
            if (user.email !== 'latrode.co@gmail.com') { showLoginError('Solo el administrador puede acceder'); return; }
            document.getElementById('loginEmail').value = '';
            document.getElementById('loginPassword').value = '';
            showAdminContent();
            document.getElementById('adminUsername').textContent = user.username;
            loadDashboard();
        } else { const err = await resp.json(); showLoginError(err.error || 'Credenciales inválidas'); }
    } catch(_) { showLoginError('Error de conexión'); }
    finally { btn.disabled = false; btn.textContent = 'Ingresar'; }
});

/* ========== Password Reset ========== */
const ADMIN_EMAIL = 'latrode.co@gmail.com';

function showResetError(msg) { const el = document.getElementById('resetError'); el.textContent = msg; el.style.display = 'block'; }
function hideResetError() { document.getElementById('resetError').style.display = 'none'; }
function showResetStep(step) { [1,2,3].forEach(s => document.getElementById(`adminResetStep${s}`).style.display = s===step?'block':'none'); }

document.getElementById('adminForgotLink')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('adminLoginView').style.display='none'; document.getElementById('adminResetView').style.display='block'; hideResetError(); showResetStep(1); });
document.getElementById('adminBackToLogin')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('adminLoginView').style.display='block'; document.getElementById('adminResetView').style.display='none'; });

document.getElementById('adminSendCodeBtn')?.addEventListener('click', async () => {
    hideResetError(); const btn = document.getElementById('adminSendCodeBtn'); btn.disabled=true; btn.textContent='Enviando...';
    try { const resp = await csrfFetch(`${API_BASE}/auth/forgot-password`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:ADMIN_EMAIL}) }); if (resp.ok) showResetStep(2); else { const d=await resp.json(); showResetError(d.error||'Error'); } } catch(_) { showResetError('Error de conexión'); }
    finally { btn.disabled=false; btn.textContent='Enviar Código'; }
});

document.getElementById('adminVerifyCodeBtn')?.addEventListener('click', async () => {
    hideResetError(); const code = document.getElementById('resetCode').value.trim();
    if (!code) { showResetError('Ingresa el código'); return; }
    const btn = document.getElementById('adminVerifyCodeBtn'); btn.disabled=true; btn.textContent='Verificando...';
    try { const resp = await csrfFetch(`${API_BASE}/auth/verify-reset-code`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:ADMIN_EMAIL,code}) }); if (resp.ok) showResetStep(3); else { const d=await resp.json(); showResetError(d.error||'Código inválido'); } } catch(_) { showResetError('Error de conexión'); }
    finally { btn.disabled=false; btn.textContent='Verificar Código'; }
});

document.getElementById('adminChangePwBtn')?.addEventListener('click', async () => {
    hideResetError(); const pw = document.getElementById('resetNewPassword').value;
    if (!pw||pw.length<6) { showResetError('Mínimo 6 caracteres'); return; }
    const code = document.getElementById('resetCode').value.trim();
    const btn = document.getElementById('adminChangePwBtn'); btn.disabled=true; btn.textContent='Cambiando...';
    try { const resp = await csrfFetch(`${API_BASE}/auth/reset-password`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:ADMIN_EMAIL,code,newPassword:pw}) }); if (resp.ok) { alert('Contraseña actualizada'); document.getElementById('adminResetView').style.display='none'; document.getElementById('adminLoginView').style.display='block'; } else { const d=await resp.json(); showResetError(d.error||'Error'); } } catch(_) { showResetError('Error de conexión'); }
    finally { btn.disabled=false; btn.textContent='Cambiar Contraseña'; }
});

/* ========== Navigation ========== */
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try { await csrfFetch(`${API_BASE}/auth/logout`, { method:'POST' }); } catch(_) {}
    document.getElementById('adminUsername').textContent = 'Admin'; showLoginOverlay();
});

function initScrollIndicators() {
    document.querySelectorAll('.table-responsive').forEach(el => {
        if (el._scrollInit) return;
        el._scrollInit = true;
        const check = () => {
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 5;
            el.classList.toggle('scrolled-end', atEnd);
        };
        el.addEventListener('scroll', check, { passive: true });
        setTimeout(check, 100);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.admin-container').style.display = 'none';
    checkAdminAuth();
    setupImageUpload();
    setupColorImageUpload();
    const om = document.getElementById('orderModal');
    if (om) om.querySelector('.close').onclick = () => om.classList.remove('active');
    const pm = document.getElementById('productModal');
    if (pm) pm.querySelector('.close').onclick = () => closeProductModal();
    initScrollIndicators();
    const _scrollObs = new MutationObserver(() => initScrollIndicators());
    _scrollObs.observe(document.body, { childList: true, subtree: true });
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
        closeSidebar();
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

function openSidebar() {
    document.querySelector('.sidebar').classList.add('open');
    document.getElementById('sidebarOverlay').classList.add('active');
}

function closeSidebar() {
    document.querySelector('.sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
}

document.getElementById('hamburgerBtn')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
});

document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);
