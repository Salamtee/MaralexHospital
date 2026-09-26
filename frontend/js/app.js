// MARALEX Allied — frontend application logic.
// All data is read from / written to the backend API (js/api.js); nothing
// is stored in localStorage except the auth token.

const fmt = (n) => 'Le ' + Number(n || 0).toLocaleString('en-US');
const todayISO = () => new Date().toISOString().slice(0, 10);

let currentUser = null;
let selectedRole = 'Pharmacist';
let cart = []; // { productId, name, price, qty, available }
let products = [];
let editingStaffId = null;

function toast(message, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = message;
  document.getElementById('toastHost').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function status(p) {
  if (p.qty <= 0) return ['out', 'Out of stock'];
  if (new Date(p.expiry) < new Date()) return ['expired', 'Expired'];
  if (p.qty <= p.reorder) return ['low', 'Low stock'];
  return ['ok', 'In stock'];
}

function initials(n) {
  return (n || '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

/* ---------------- Auth / session ---------------- */

function selectRole(r) {
  selectedRole = r;
  document.querySelectorAll('.role-tab').forEach((b) => b.classList.toggle('active', b.dataset.role === r));
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const { token, user } = await api.login(lUser.value.trim(), lPass.value, selectedRole);
    setToken(token);
    currentUser = user;
    document.getElementById('loginForm').reset();
    await enterApp();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Login';
  }
});

async function enterApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appRoot').style.display = 'flex';
  document.getElementById('navStaff').style.display = currentUser.role === 'Supervisor' ? '' : 'none';
  renderUserChip();
  await go('dashboard');
}

function renderUserChip() {
  document.getElementById('userChip').innerHTML =
    `<div class="avatar">${initials(currentUser.name)}</div><div class="who"><b>${currentUser.name}</b><span>${currentUser.role}</span></div>`;
}

function logout() {
  setToken(null);
  currentUser = null;
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('lUser').value = '';
  document.getElementById('lPass').value = '';
  document.getElementById('loginError').textContent = '';
}

async function tryResumeSession() {
  if (!getToken()) {
    document.getElementById('loginScreen').style.display = 'flex';
    return;
  }
  try {
    const { user } = await api.me();
    currentUser = user;
    await enterApp();
  } catch (err) {
    setToken(null);
    document.getElementById('loginScreen').style.display = 'flex';
  }
}

/* ---------------- Navigation ---------------- */

document.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => go(b.dataset.page)));

async function go(id) {
  if (id === 'staff' && currentUser.role !== 'Supervisor') return;
  document.querySelectorAll('.page').forEach((x) => x.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav button').forEach((x) => x.classList.toggle('active', x.dataset.page === id));
  document.getElementById('pageTitle').textContent =
    id === 'sales' ? 'Sales / POS'
    : id === 'stock' ? 'Stock Adjustments'
    : id === 'customers' ? 'Patients / Customers'
    : id === 'reports' ? 'Sales Reports'
    : id === 'staff' ? 'Manage Staff'
    : id === 'profile' ? 'My Profile'
    : id[0].toUpperCase() + id.slice(1);

  try {
    if (id === 'dashboard') await renderDashboard();
    if (id === 'inventory') await renderInventory();
    if (id === 'sales') await renderPOS();
    if (id === 'reports') await renderReports();
    if (id === 'suppliers') await renderSuppliers();
    if (id === 'customers') await renderCustomers();
    if (id === 'stock') await renderAdjustments();
    if (id === 'staff') await renderStaff();
    if (id === 'profile') renderProfile();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Dashboard ---------------- */

async function renderDashboard() {
  const d = await api.dashboard();
  document.getElementById('mItems').textContent = d.items;
  document.getElementById('mLow').textContent = d.low;
  document.getElementById('mToday').textContent = fmt(d.todaySales);
  document.getElementById('mExpiry').textContent = d.nearExpiry;

  const max = Math.max(1, ...d.last7.map((x) => x.value));
  document.getElementById('chart').innerHTML = d.last7
    .map((x) => `<div class="bar" style="height:${Math.max(8, (x.value / max) * 82)}%"><strong>${Math.round(x.value)}</strong><em>${x.label}</em></div>`)
    .join('');

  document.getElementById('alerts').innerHTML = d.alerts.length
    ? d.alerts.map((p) => `<div class="alert ${p.status === 'out' ? 'red' : ''}"><span><b>${p.name}</b><br>${p.status === 'out' ? 'Out of stock' : p.status === 'expired' ? 'Expired' : 'Low stock'} • Qty ${p.qty}</span><button class="btn small secondary" onclick="go('inventory')">View</button></div>`).join('')
    : '<div class="empty">No stock alerts.</div>';

  document.getElementById('recentSales').innerHTML = d.recentSales.length
    ? d.recentSales.map((s) => `<tr><td>${s.invoice}</td><td>${s.date}</td><td>${s.customer}</td><td>${s.units}</td><td>${fmt(s.total)}</td><td><span class="badge ok">Completed</span></td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">No sales recorded yet.</td></tr>';
}

/* ---------------- Inventory ---------------- */

async function loadProducts() {
  products = await api.listProducts();
  return products;
}

async function renderInventory() {
  await loadProducts();
  filterInventory();
}

function filterInventory() {
  const q = (document.getElementById('invSearch')?.value || '').toLowerCase();
  const cat = document.getElementById('invCat')?.value || '';
  const st = document.getElementById('invStatus')?.value || '';
  const arr = products.filter(
    (p) => (!q || (p.name + ' ' + p.sku + ' ' + p.cat).toLowerCase().includes(q)) && (!cat || p.cat === cat) && (!st || status(p)[0] === st)
  );
  document.getElementById('inventoryBody').innerHTML = arr.length
    ? arr.map((p) => {
        const s = status(p);
        return `<tr><td>${p.sku}</td><td><b>${p.name}</b></td><td>${p.cat}</td><td>${p.batch}</td><td>${new Date(p.expiry).toISOString().slice(0, 10)}</td><td>${p.qty}</td><td>${p.reorder}</td><td>${fmt(p.cost)}</td><td>${fmt(p.price)}</td><td><span class="badge ${s[0]}">${s[1]}</span></td><td><button class="btn small secondary" onclick="quickAdjust('${p._id}')">Adjust</button></td></tr>`;
      }).join('')
    : '<tr><td colspan="11" class="empty">No inventory items yet. Click "Add Item" to get started.</td></tr>';
}

function openProductModal() {
  document.getElementById('productForm').reset();
  document.getElementById('productModal').classList.add('show');
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.createProduct({
      name: pName.value.trim(),
      sku: pSku.value.trim(),
      cat: pCat.value,
      batch: pBatch.value.trim(),
      expiry: pExpiry.value,
      qty: pQty.value,
      reorder: pReorder.value,
      cost: pCost.value,
      price: pPrice.value
    });
    closeModal('productModal');
    toast('Inventory item added.');
    await renderInventory();
    await renderDashboard();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------------- Sales / POS ---------------- */

async function renderPOS() {
  await loadProducts();
  filterPOS();
  document.getElementById('cart').innerHTML = cart.length
    ? cart.map((c, i) => `<div class="cart-row"><span><b>${c.name}</b><br>${fmt(c.price)} each</span><span class="qty"><button onclick="changeQty(${i},-1)">−</button>${c.qty}<button onclick="changeQty(${i},1)">+</button></span><span>${fmt(c.price * c.qty)}</span></div>`).join('')
    : '<div class="empty">Click an inventory item to add it to the sale.</div>';
  document.getElementById('cartTotal').textContent = fmt(cart.reduce((a, c) => a + c.price * c.qty, 0));
}

function filterPOS() {
  const q = (document.getElementById('posSearch')?.value || '').toLowerCase();
  const cat = document.getElementById('posCat')?.value || '';
  const arr = products.filter((p) => p.qty > 0 && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) && (!cat || p.cat === cat));
  document.getElementById('productGrid').innerHTML = arr.length
    ? arr.map((p) => `<div class="product" onclick="addToCart('${p._id}')"><div class="name">${p.name}</div><div class="sku">${p.sku} • ${p.cat}</div><div class="price">${fmt(p.price)}</div><div class="stock">Available: ${p.qty}</div></div>`).join('')
    : '<div class="empty">No inventory available for sale.</div>';
}

function addToCart(id) {
  const p = products.find((x) => x._id === id);
  const c = cart.find((x) => x.productId === id);
  if (c) {
    if (c.qty < p.qty) c.qty += 1;
    else toast('Quantity exceeds available stock.', true);
  } else {
    cart.push({ productId: p._id, name: p.name, price: p.price, qty: 1 });
  }
  renderPOSCartOnly();
}

function renderPOSCartOnly() {
  document.getElementById('cart').innerHTML = cart.length
    ? cart.map((c, i) => `<div class="cart-row"><span><b>${c.name}</b><br>${fmt(c.price)} each</span><span class="qty"><button onclick="changeQty(${i},-1)">−</button>${c.qty}<button onclick="changeQty(${i},1)">+</button></span><span>${fmt(c.price * c.qty)}</span></div>`).join('')
    : '<div class="empty">Click an inventory item to add it to the sale.</div>';
  document.getElementById('cartTotal').textContent = fmt(cart.reduce((a, c) => a + c.price * c.qty, 0));
}

function changeQty(i, d) {
  const c = cart[i];
  const p = products.find((x) => x._id === c.productId);
  c.qty += d;
  if (c.qty <= 0) cart.splice(i, 1);
  else if (p && c.qty > p.qty) c.qty = p.qty;
  renderPOSCartOnly();
}

function clearCart() {
  cart = [];
  renderPOSCartOnly();
}

async function checkout() {
  if (!cart.length) return toast('Add at least one item to the sale.', true);
  const customer = document.getElementById('saleCustomer').value.trim() || 'Walk-in Patient';
  try {
    const sale = await api.checkout({
      customer,
      items: cart.map((c) => ({ productId: c.productId, qty: c.qty }))
    });
    cart = [];
    document.getElementById('saleCustomer').value = '';
    toast(`Sale ${sale.invoice} completed successfully.`);
    await renderPOS();
    await renderDashboard();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Reports ---------------- */

async function renderReports() {
  const period = document.getElementById('reportPeriod').value;
  const date = document.getElementById('reportDate').value || todayISO();
  const r = await api.salesReport(period, date);
  document.getElementById('rTotal').textContent = fmt(r.total);
  document.getElementById('rTx').textContent = r.transactions;
  document.getElementById('rUnits').textContent = r.units;
  document.getElementById('rAvg').textContent = fmt(r.average);
  document.getElementById('reportHeading').textContent = period[0].toUpperCase() + period.slice(1) + ' Sales Report';
  document.getElementById('reportBody').innerHTML = r.sales.length
    ? r.sales.map((s) => `<tr><td>${s.invoice}</td><td>${s.date}</td><td>${s.customer}</td><td>${s.units}</td><td>${fmt(s.total)}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">No sales found for this period.</td></tr>';
}

async function downloadPDF() {
  const period = document.getElementById('reportPeriod').value;
  const date = document.getElementById('reportDate').value || todayISO();
  const { jsPDF } = window.jspdf || {};
  const r = await api.salesReport(period, date);
  if (!jsPDF) {
    window.print();
    return;
  }
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text('MARALEX ALLIED', 20, 20);
  doc.setFontSize(10);
  doc.text('Hospital & Educational Services', 20, 27);
  doc.text('Pharmaceutical & Medical Inventory and Sales', 20, 33);
  doc.text(`${period.toUpperCase()} SALES REPORT — ${date}`, 20, 43);

  let y = 55;
  doc.setFontSize(9);
  doc.text('Invoice', 20, y);
  doc.text('Date', 50, y);
  doc.text('Customer / Patient', 78, y);
  doc.text('Items', 145, y);
  doc.text('Total', 170, y);
  y += 7;
  r.sales.forEach((s) => {
    if (y > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(s.invoice, 20, y);
    doc.text(s.date, 50, y);
    doc.text(String(s.customer).slice(0, 30), 78, y);
    doc.text(String(s.units), 145, y);
    doc.text(fmt(s.total), 170, y);
    y += 6;
  });
  doc.setFontSize(11);
  doc.text(`Total Sales: ${fmt(r.total)}`, 20, y + 8);
  doc.text('MARALEX Allied Inventory & Sales System', 20, y + 18);
  doc.save(`maralex-${period}-sales-report-${date}.pdf`);
}

/* ---------------- Suppliers ---------------- */

async function renderSuppliers() {
  const suppliers = await api.listSuppliers();
  document.getElementById('supplierBody').innerHTML = suppliers.length
    ? suppliers.map((s) => `<tr><td><b>${s.name}</b></td><td>${s.contact}</td><td>${s.phone}</td><td>${s.products}</td><td><span class="badge ok">${s.status}</span></td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">No suppliers added yet.</td></tr>';
}

function openSupplierModal() {
  document.getElementById('supplierForm').reset();
  document.getElementById('supplierModal').classList.add('show');
}

document.getElementById('supplierForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.createSupplier({ name: sName.value.trim(), contact: sContact.value.trim(), phone: sPhone.value.trim() });
    closeModal('supplierModal');
    toast('Supplier added.');
    await renderSuppliers();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------------- Customers ---------------- */

async function renderCustomers() {
  const customers = await api.listCustomers();
  document.getElementById('customerBody').innerHTML = customers.length
    ? customers.map((c) => `<tr><td><b>${c.name}</b></td><td>${c.phone}</td><td>${c.type}</td><td>${fmt(c.purchases)}</td><td>${c.last}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">No patients or customers recorded yet.</td></tr>';
}

function openCustomerModal() {
  document.getElementById('customerForm').reset();
  document.getElementById('customerModal').classList.add('show');
}

document.getElementById('customerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.createCustomer({ name: cName.value.trim(), phone: cPhone.value.trim(), type: cType.value });
    closeModal('customerModal');
    toast('Customer added.');
    await renderCustomers();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------------- Stock adjustments ---------------- */

async function renderAdjustments() {
  const adjustments = await api.listAdjustments();
  document.getElementById('adjustBody').innerHTML = adjustments.length
    ? adjustments.map((a) => `<tr><td>${a.date}</td><td>${a.item}</td><td>${a.type}</td><td>${a.qty}</td><td>${a.reason}</td></tr>`).join('')
    : '<tr><td colspan="5" class="empty">No stock adjustments recorded.</td></tr>';
}

async function openAdjustModal() {
  await loadProducts();
  const s = document.getElementById('aItem');
  s.innerHTML = products.map((p) => `<option value="${p._id}">${p.name} (${p.qty})</option>`).join('');
  document.getElementById('adjustForm').reset();
  document.getElementById('adjustModal').classList.add('show');
}

function quickAdjust(id) {
  openAdjustModal().then(() => {
    document.getElementById('aItem').value = id;
  });
}

document.getElementById('adjustForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.createAdjustment({ productId: aItem.value, type: aType.value, qty: aQty.value, reason: aReason.value });
    closeModal('adjustModal');
    toast('Stock adjustment recorded.');
    await renderAdjustments();
    await renderInventory();
    await renderDashboard();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------------- Staff (Supervisor only) ---------------- */

async function renderStaff() {
  const staff = await api.listStaff();
  document.getElementById('staffBody').innerHTML = staff
    .map((u) => `<tr><td><b>${u.name}</b>${u.id === currentUser.id ? ' <span class="badge ok">You</span>' : ''}</td><td>${u.username}</td><td>${u.role}</td><td>${u.phone || '—'}</td><td><button class="btn small secondary" onclick="editStaff('${u.id}')">Edit</button> <button class="btn small danger" onclick="deleteStaff('${u.id}')">Delete</button></td></tr>`)
    .join('');
}

function openStaffModal() {
  editingStaffId = null;
  document.getElementById('staffForm').reset();
  document.getElementById('staffModalTitle').textContent = 'Add Staff';
  document.getElementById('staffModal').classList.add('show');
}

async function editStaff(id) {
  const staff = await api.listStaff();
  const u = staff.find((x) => x.id === id);
  if (!u) return;
  editingStaffId = id;
  stName.value = u.name;
  stUser.value = u.username;
  stRole.value = u.role;
  stPhone.value = u.phone || '';
  stPass.value = '';
  document.getElementById('staffModalTitle').textContent = 'Edit Staff';
  document.getElementById('staffModal').classList.add('show');
}

document.getElementById('staffForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { name: stName.value.trim(), username: stUser.value.trim(), role: stRole.value, phone: stPhone.value.trim() };
  if (stPass.value) payload.password = stPass.value;
  try {
    if (editingStaffId) await api.updateStaff(editingStaffId, payload);
    else await api.createStaff(payload);
    closeModal('staffModal');
    toast('Staff account saved.');
    await renderStaff();
  } catch (err) {
    toast(err.message, true);
  }
});

async function deleteStaff(id) {
  if (!confirm('Delete this staff account?')) return;
  try {
    await api.deleteStaff(id);
    toast('Staff account deleted.');
    await renderStaff();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Profile ---------------- */

function renderProfile() {
  pfName.value = currentUser.name;
  pfUser.value = currentUser.username;
  pfPhone.value = currentUser.phone || '';
  pfRole.value = currentUser.role;
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { user } = await api.updateProfile({ name: pfName.value, username: pfUser.value, phone: pfPhone.value });
    currentUser = user;
    renderUserChip();
    toast('Profile updated successfully.');
  } catch (err) {
    toast(err.message, true);
  }
});

document.getElementById('passwordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (pfNewPass.value !== pfConfPass.value) return toast('New passwords do not match.', true);
  try {
    await api.changePassword({ currentPassword: pfCurPass.value, newPassword: pfNewPass.value });
    document.getElementById('passwordForm').reset();
    toast('Password updated successfully.');
  } catch (err) {
    toast(err.message, true);
  }
});

async function deleteAccount() {
  if (!confirm('Delete your account? You will be logged out immediately and lose access.')) return;
  try {
    await api.deleteMyAccount();
    logout();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Modals ---------------- */

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

/* ---------------- Init ---------------- */

document.getElementById('today').textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
document.getElementById('reportDate').value = todayISO();
tryResumeSession();
