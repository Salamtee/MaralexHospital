// MARALEX Allied — frontend application logic.
// All data is read from / written to the backend API (js/api.js); nothing
// is stored in localStorage except the auth token.

const fmt = (n) => 'Le ' + Number(n || 0).toLocaleString('en-US');
const todayISO = () => new Date().toISOString().slice(0, 10);

function formatDateNice(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

let currentUser = null;
let selectedRole = 'Pharmacist';
let cart = []; // { productId, name, price, qty, available }
let products = [];
let editingStaffId = null;

/* ---------------- Theme (light / dark) ---------------- */

function getPreferredTheme() {
  const saved = localStorage.getItem('maralex_theme');
  if (saved === 'dark' || saved === 'light') return saved;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem('maralex_theme', next);
  applyTheme(next);
}

// Apply on load
applyTheme(getPreferredTheme());



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


function isOwner() {
  return currentUser && currentUser.role === 'Owner';
}

function guardOwnerAction() {
  if (isOwner()) {
    toast('Owner accounts are view-only. You cannot make changes.', true);
    return true;
  }
  return false;
}

function selectRole(r) {
  selectedRole = r;
  document.querySelectorAll('.role-tab').forEach((b) => b.classList.toggle('active', b.dataset.role === r));
}

document.querySelectorAll('.role-tab').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    selectRole(btn.dataset.role);
  });
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errorEl = document.getElementById('loginError');
  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in...';
  try {
    const { token, user } = await api.login(lPhone.value.trim(), lPass.value, selectedRole);
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
  applyRoleNav();
  const isOwner = currentUser.role === 'Owner';
  document.body.classList.toggle('is-owner', isOwner);
  const banner = document.getElementById('viewOnlyBanner');
  if (banner) banner.style.display = isOwner ? '' : 'none';
  renderUserChip();
  // Offer push alerts for Supervisor / Owner
  const pushBtn = document.getElementById('enablePushBtn');
  if (pushBtn) {
    pushBtn.style.display = (currentUser.role === 'Supervisor' || currentUser.role === 'Owner') ? '' : 'none';
  }
  await go('dashboard');
  maybeShowNotifyPrompt();
}

function applyRoleNav() {
  const role = currentUser && currentUser.role;
  const show = (id, yes, display) => {
    const el = document.getElementById(id);
    if (el) el.style.display = yes ? (display || '') : 'none';
  };
  // Pharmacist cannot access finance / audit pages
  const isPharm = role === 'Pharmacist';
  const isOwner = role === 'Owner';
  const isSuper = role === 'Supervisor';
  show('navStaff', isSuper);
  show('navPurchases', isSuper || isOwner);
  show('navExpenses', isSuper || isOwner);
  show('navBank', isSuper || isOwner);
  show('navAudit', isSuper || isOwner);
  show('navTreatments', isSuper || isOwner);
  // Pharmacist cannot add inventory items
  show('addItemBtn', !isPharm);
  // Supervisor-only clean-up tools
  show('pastSaleBox', isSuper);
  show('pastSaleDateWrap', isSuper, 'flex');
  show('clearAuditBtn', isSuper);
  show('auditActionTh', isSuper);
  show('clearAdjustBtn', isSuper);
  show('adjActionTh', isSuper);
  // Owner: hide Sales / POS (view activities via reports only)
  show('navSales', !isOwner);
}



async function uploadAvatar(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    const { user } = await api.uploadAvatar(file);
    currentUser = user;
    renderUserChip();
    renderProfile();
    toast('Profile photo updated.');
  } catch (err) {
    toast(err.message, true);
  }
  input.value = '';
}

function avatarUrl(user) {
  if (!user || !user.avatar) return null;
  // Uploads are served from the API host; when frontend is on another domain, use API origin.
  let origin = '';
  if (typeof API_BASE !== 'undefined' && API_BASE && API_BASE.startsWith('http')) {
    origin = API_BASE.replace(/\/api\/?$/, '');
  }
  return origin + '/uploads/' + user.avatar;
}

function renderUserChip() {
  const url = avatarUrl(currentUser);
  const av = url
    ? `<img class="avatar" src="${url}" alt="" style="object-fit:cover">`
    : `<div class="avatar">${initials(currentUser.name)}</div>`;
  document.getElementById('userChip').innerHTML =
    `${av}<div class="who"><b>${currentUser.name}</b><span>${currentUser.role}</span></div>`;
}

function logout() {
  setToken(null);
  currentUser = null;
  document.body.classList.remove('is-owner');
  const banner = document.getElementById('viewOnlyBanner');
  if (banner) banner.style.display = 'none';
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  const lp = document.getElementById('lPhone'); if (lp) lp.value = '';
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

document.querySelectorAll('.nav button').forEach((b) => (b.onclick = () => {
  go(b.dataset.page);
  closeMobileNav();
}));

async function go(id) {
  if (id === 'staff' && currentUser.role !== 'Supervisor') return;
  const financePages = ['purchases', 'expenses', 'bank', 'audit', 'treatments'];
  if (financePages.includes(id) && currentUser.role === 'Pharmacist') {
    toast('Only Supervisor and Owner can access this section.', true);
    return;
  }
  if (id === 'sales' && currentUser.role === 'Owner') {
    toast('Sales / POS is hidden for Owner accounts. Use Sales Reports to review activity.', true);
    return;
  }
  document.querySelectorAll('.page').forEach((x) => x.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.nav button').forEach((x) => x.classList.toggle('active', x.dataset.page === id));
  document.getElementById('pageTitle').textContent =
    id === 'sales' ? 'Sales / POS'
    : id === 'stock' ? 'Stock Adjustments'
    : id === 'purchases' ? 'Purchases'
    : id === 'expenses' ? 'Expenses'
    : id === 'prescriptions' ? 'Prescriptions'
    : id === 'treatments' ? 'Treatments & Payments'
    : id === 'bank' ? 'Bank Transactions'
    : id === 'audit' ? 'Audit Log'
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
    if (id === 'purchases') await renderPurchases();
    if (id === 'expenses') await renderExpenses();
    if (id === 'prescriptions') await renderPrescriptions();
    if (id === 'treatments') await renderTreatments();
    if (id === 'bank') await renderBank();
    if (id === 'audit') await renderAudit();
    if (id === 'staff') await renderStaff();
    if (id === 'profile') renderProfile();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Dashboard ---------------- */

async function renderDashboard() {
  const [d, bank] = await Promise.all([
    api.dashboard(),
    api.bankSummary().catch(() => null)
  ]);
  document.getElementById('mItems').textContent = d.items;
  document.getElementById('mLow').textContent = d.low;
  document.getElementById('mToday').textContent = fmt(d.todaySales);
  document.getElementById('mExpiry').textContent = d.nearExpiry;
  if (bank && document.getElementById('mBank')) {
    document.getElementById('mBank').textContent = fmt(bank.bankBalance);
  }
  // Hide new sale for Owner
  const nsb = document.getElementById('dashNewSaleBtn');
  if (nsb) nsb.style.display = currentUser.role === 'Owner' ? 'none' : '';

  // Bar chart: always Sunday → Saturday for the current calendar week
  const weekOrder = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDate = {};
  (d.last7 || []).forEach((x) => { byDate[x.date] = x.value; });
  // Build this week's 7 ISO dates (local) Sun→Sat so we never depend on API order
  const _now = new Date();
  const _mid = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
  const _sun = new Date(_mid);
  _sun.setDate(_mid.getDate() - _mid.getDay());
  const weekBars = weekOrder.map((label, i) => {
    const dte = new Date(_sun.getFullYear(), _sun.getMonth(), _sun.getDate() + i);
    const iso = dte.getFullYear() + '-' + String(dte.getMonth() + 1).padStart(2, '0') + '-' + String(dte.getDate()).padStart(2, '0');
    // Prefer matching by date; fall back to API row by label index
    let value = byDate[iso];
    if (value === undefined) {
      const row = (d.last7 || []).find((x) => x.label === label || x.date === iso);
      value = row ? row.value : 0;
    }
    return { label, date: iso, value: Number(value) || 0 };
  });
  const max = Math.max(1, ...weekBars.map((x) => x.value));
  const chartEl = document.getElementById('chart');
  if (chartEl) {
    chartEl.innerHTML = weekBars
      .map((x) => {
        const h = Math.max(6, (x.value / max) * 100);
        return `<div class="bar" style="height:${h}%"><strong>${x.value ? Math.round(x.value).toLocaleString() : '0'}</strong><em>${x.label}</em></div>`;
      })
      .join('');
  }
  const weekSum = weekBars.reduce((a, x) => a + x.value, 0);
  const wtl = document.getElementById('weekTotalLabel');
  if (wtl) wtl.textContent = 'Week total: ' + fmt(d.weekSalesTotal != null ? d.weekSalesTotal : weekSum);

  // Pie chart by category
  renderPieChart(d.categories || []);

  // Stock health progress
  renderStockHealth(d.stockStatus || {}, d.items || 0);

  // Top products horizontal bars
  renderTopProducts(d.topProducts || []);

  // Revenue snapshot
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = fmt(v); };
  set('revToday', d.todaySales);
  set('revWeek', d.weekSalesTotal);
  set('revMonth', d.monthSales);
  set('revAll', d.totalRevenue);

  document.getElementById('alerts').innerHTML = d.alerts.length
    ? d.alerts.map((p) => {
        const label = p.status === 'out' ? 'Out of stock' : p.status === 'expired' ? 'Expired' : 'Low stock';
        return `<div class="alert ${p.status === 'out' || p.status === 'expired' ? 'red' : ''}"><span><b>${p.name}</b><br>${label} • Qty ${p.qty}</span><button class="btn small secondary" onclick="go('inventory')">View</button></div>`;
      }).join('')
    : '<div class="empty">No stock alerts. Inventory looks healthy.</div>';

  document.getElementById('recentSales').innerHTML = d.recentSales.length
    ? d.recentSales.map((s) => `<tr><td>${s.invoice}</td><td>${s.date}</td><td>${s.customer}</td><td>${s.units}</td><td>${fmt(s.total)}</td><td><span class="badge ok">Completed</span></td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">No sales recorded yet.</td></tr>';
}

const PIE_COLORS = ['#3d8b3d', '#1f5f9a', '#c47a12', '#6b3fa0', '#0d7377', '#b42318'];

function renderPieChart(categories) {
  const pie = document.getElementById('pieChart');
  const legend = document.getElementById('pieLegend');
  if (!pie || !legend) return;
  if (!categories.length) {
    pie.style.background = '#eef2f7';
    legend.innerHTML = '<div class="empty">No inventory categories yet.</div>';
    return;
  }
  const total = categories.reduce((a, c) => a + c.value, 0) || 1;
  let acc = 0;
  const stops = categories.map((c, i) => {
    const start = (acc / total) * 360;
    acc += c.value;
    const end = (acc / total) * 360;
    return `${PIE_COLORS[i % PIE_COLORS.length]} ${start}deg ${end}deg`;
  });
  pie.style.background = `conic-gradient(${stops.join(', ')})`;
  legend.innerHTML = categories.map((c, i) => {
    const pct = Math.round((c.value / total) * 100);
    return `<div class="pie-legend-row"><span class="pie-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span><span>${c.name}</span><b style="margin-left:auto">${c.value} (${pct}%)</b></div>`;
  }).join('');
}

function renderStockHealth(ss, totalItems) {
  const host = document.getElementById('stockProgress');
  const mini = document.getElementById('stockMiniStats');
  if (!host) return;
  const total = totalItems || (ss.ok || 0) + (ss.low || 0) + (ss.out || 0) + (ss.expired || 0) || 1;
  const rows = [
    ['In stock', 'ok', ss.ok || 0],
    ['Low stock', 'low', ss.low || 0],
    ['Out of stock', 'out', ss.out || 0],
    ['Expired', 'expired', ss.expired || 0]
  ];
  host.innerHTML = rows.map(([label, cls, n]) => {
    const pct = Math.round((n / total) * 100);
    return `<div class="prog-row"><span>${label}</span><div class="prog-track"><div class="prog-fill ${cls}" style="width:${pct}%"></div></div><b>${n}</b></div>`;
  }).join('');
  if (mini) {
    const healthy = Math.round(((ss.ok || 0) / total) * 100);
    mini.innerHTML = `<span class="mini-stat">${healthy}% healthy stock</span><span class="mini-stat">${total} total items</span>`;
  }
}

function renderTopProducts(list) {
  const host = document.getElementById('topProducts');
  if (!host) return;
  if (!list.length) {
    host.innerHTML = '<div class="empty">No sales data yet.</div>';
    return;
  }
  const max = Math.max(1, ...list.map((x) => x.units));
  host.innerHTML = list.map((p) => {
    const pct = Math.max(4, (p.units / max) * 100);
    return `<div class="hbar-row"><div><div style="margin-bottom:4px;font-weight:600">${p.name}</div><div class="hbar-track"><div class="hbar-fill" style="width:${pct}%"></div></div></div><b>${p.units}</b></div>`;
  }).join('');
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
        const rd = p.reorderDate ? new Date(p.reorderDate).toISOString().slice(0, 10) : '—';
        const action = currentUser && currentUser.role === 'Supervisor'
          ? `<button class="btn small secondary" onclick="editProduct('${p._id}')">Edit Item</button> <button class="btn small danger" onclick="deleteProduct('${p._id}')">Delete</button>`
          : currentUser && currentUser.role === 'Pharmacist'
            ? `<button class="btn small secondary" onclick="quickAdjust('${p._id}')">Adjust</button>`
            : '—';
        return `<tr><td>${p.sku}</td><td><b>${p.name}</b></td><td>${p.cat}</td><td>${p.batch}</td><td>${new Date(p.expiry).toISOString().slice(0, 10)}</td><td>${p.qty}</td><td>${p.reorder}</td><td>${rd}</td><td>${fmt(p.cost)}</td><td>${fmt(p.price)}</td><td><span class="badge ${s[0]}">${s[1]}</span></td><td>${action}</td></tr>`;
      }).join('')
    : `<tr><td colspan="12" class="empty">No inventory items yet.${currentUser && currentUser.role === 'Pharmacist' ? '' : ' Click "Add Item" to get started.'}</td></tr>`;
}


async function deleteProduct(id) {
  const p = products.find((x) => x._id === id);
  const label = p ? `${p.name} (${p.sku})` : 'this item';
  if (!confirm(`Delete ${label} from inventory? This cannot be undone.`)) return;
  try {
    await api.deleteProduct(id);
    toast('Inventory item deleted.');
    await renderInventory();
    await renderDashboard();
  } catch (err) {
    toast(err.message, true);
  }
}

async function refreshNextSku() {
  if (document.getElementById('pId')?.value) return; // editing: SKU is fixed
  const cat = document.getElementById('pCat')?.value || 'Medicines';
  try {
    const { sku } = await api.nextSku(cat);
    const el = document.getElementById('pSku');
    if (el) el.value = sku;
  } catch (err) {
    console.warn(err);
  }
}

function setProductModalMode(editing) {
  document.getElementById('productModalTitle').textContent = editing ? 'Edit Inventory Item' : 'Add Inventory Item';
  document.getElementById('productSaveBtn').textContent = editing ? 'Save Changes' : 'Save Item';
  // Supervisors can edit quantity directly; changes are logged as stock adjustments
  const qty = document.getElementById('pQty');
  qty.disabled = false;
  qty.title = editing ? 'Changing this records a stock adjustment' : '';
}

function openProductModal() {
  if (guardOwnerAction()) return;
  if (currentUser.role !== 'Supervisor') return toast('Only Supervisors can add inventory items.', true);
  document.getElementById('productForm').reset();
  document.getElementById('pId').value = '';
  setProductModalMode(false);
  document.getElementById('productModal').classList.add('show');
  refreshNextSku();
}

function editProduct(id) {
  if (guardOwnerAction()) return;
  if (currentUser.role !== 'Supervisor') return toast('Only Supervisors can edit inventory items.', true);
  const p = products.find((x) => x._id === id);
  if (!p) return toast('Item not found.', true);
  document.getElementById('productForm').reset();
  document.getElementById('pId').value = p._id;
  pName.value = p.name;
  pSku.value = p.sku;
  pCat.value = p.cat;
  pBatch.value = p.batch;
  pExpiry.value = new Date(p.expiry).toISOString().slice(0, 10);
  pQty.value = p.qty;
  pReorder.value = p.reorder;
  pReorderDate.value = p.reorderDate ? new Date(p.reorderDate).toISOString().slice(0, 10) : '';
  pCost.value = p.cost;
  pPrice.value = p.price;
  setProductModalMode(true);
  document.getElementById('productModal').classList.add('show');
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('pId').value;
  try {
    if (id) {
      const saved = await api.updateProduct(id, {
        name: pName.value.trim(),
        cat: pCat.value,
        batch: pBatch.value.trim(),
        expiry: pExpiry.value,
        qty: pQty.value,
        reorder: pReorder.value,
        reorderDate: pReorderDate.value,
        cost: pCost.value,
        price: pPrice.value
      });
      if (saved && Number(saved.qty) !== Number(pQty.value)) {
        toast('Saved, but the server did not apply the new quantity. The backend on Render needs the latest deploy.', true);
      } else {
        toast('Inventory item updated.');
      }
    } else {
      await api.createProduct({
        name: pName.value.trim(),
        sku: (pSku.value || '').trim(),
        cat: pCat.value,
        batch: pBatch.value.trim(),
        expiry: pExpiry.value,
        qty: pQty.value,
        reorder: pReorder.value,
        reorderDate: pReorderDate.value,
        cost: pCost.value,
        price: pPrice.value
      });
      toast('Inventory item added.');
    }
    closeModal('productModal');
    await renderInventory();
    await renderDashboard();
  } catch (err) {
    toast(err.message, true);
  }
});

/* ---------------- Sales / POS ---------------- */

async function renderPOS() {
  const sd = document.getElementById('saleDate');
  if (sd) {
    sd.max = todayISO();
    if (!sd.value) sd.value = todayISO();
  }
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
  if (guardOwnerAction()) return;
  if (!cart.length) return toast('Add at least one item to the sale.', true);
  const customer = document.getElementById('saleCustomer').value.trim() || 'Walk-in Patient';
  try {
    const isSuper = currentUser && currentUser.role === 'Supervisor';
    const payload = {
      customer,
      items: cart.map((c) => ({ productId: c.productId, qty: c.qty }))
    };
    let isPast = false;
    if (isSuper) {
      const d = document.getElementById('saleDate').value || todayISO();
      const deduct = document.getElementById('saleDeductStock').checked;
      isPast = d !== todayISO() || !deduct;
      if (isPast) {
        payload.date = d;
        payload.deductStock = deduct;
        if (!confirm(`Record this sale dated ${d}${deduct ? '' : ' without changing current stock'}?`)) return;
      }
    }
    const sale = await api.checkout(payload);
    cart = [];
    document.getElementById('saleCustomer').value = '';
    document.getElementById('saleDate').value = todayISO();
    document.getElementById('saleDeductStock').checked = true;
    toast(isPast ? `Past sale ${sale.invoice} recorded for ${sale.date}.` : `Sale ${sale.invoice} completed successfully.`);
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
    ? r.sales.map((s) => `<tr><td>${s.invoice}</td><td>${s.date}</td><td>${s.customer}</td><td>${s.itemsText}</td><td>${s.units}</td><td>${fmt(s.total)}</td></tr>`).join('')
    : '<tr><td colspan="6" class="empty">No sales found for this period.</td></tr>';
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

  const col = { invoice: 14, date: 34, customer: 56, items: 100, units: 172, total: 184 };
  const itemsColWidth = col.units - col.items - 2;

  let y = 55;
  doc.setFontSize(9);
  doc.setFont(undefined, 'bold');
  doc.text('Invoice', col.invoice, y);
  doc.text('Date', col.date, y);
  doc.text('Customer / Patient', col.customer, y);
  doc.text('Item(s) Sold', col.items, y);
  doc.text('Units', col.units, y);
  doc.text('Total', col.total, y);
  doc.setFont(undefined, 'normal');
  y += 6;

  r.sales.forEach((s) => {
    const itemLines = doc.splitTextToSize(s.itemsText || '-', itemsColWidth);
    const rowHeight = Math.max(6, itemLines.length * 4.5);
    if (y + rowHeight > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(s.invoice, col.invoice, y);
    doc.text(s.date, col.date, y);
    doc.text(String(s.customer).slice(0, 22), col.customer, y);
    doc.text(itemLines, col.items, y);
    doc.text(String(s.units), col.units, y);
    doc.text(fmt(s.total), col.total, y);
    y += rowHeight;
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
  if (guardOwnerAction()) return;
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
  if (guardOwnerAction()) return;
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

let adjustmentList = [];

async function renderAdjustments() {
  adjustmentList = await api.listAdjustments();
  filterAdjustments();
}

function filterAdjustments() {
  const q = (document.getElementById('adjSearch')?.value || '').trim().toLowerCase();
  const isSuper = currentUser && currentUser.role === 'Supervisor';
  const arr = adjustmentList.filter((a) => !q || `${a.item} ${a.type} ${a.reason} ${a.date}`.toLowerCase().includes(q));
  const cols = isSuper ? 7 : 6;
  document.getElementById('adjustBody').innerHTML = arr.length
    ? arr.map((a) => `<tr><td>${a.date}</td><td>${a.item}</td><td>${a.type}</td><td>${a.qty}</td><td>${a.reason}</td><td>${a.reorderDate || '—'}</td>${isSuper ? `<td><button class="btn small danger" onclick="deleteAdjustment('${a._id}')">Delete</button></td>` : ''}</tr>`).join('')
    : `<tr><td colspan="${cols}" class="empty">${adjustmentList.length ? 'No adjustments match your search.' : 'No stock adjustments recorded.'}</td></tr>`;
}

async function deleteAdjustment(id) {
  if (!confirm('Delete this adjustment record? Current stock quantities will not change.')) return;
  try {
    await api.deleteAdjustment(id);
    toast('Adjustment record deleted.');
    await renderAdjustments();
  } catch (err) {
    toast(err.message, true);
  }
}

async function clearAdjustments() {
  if (!confirm('Clear ALL stock adjustment records? Current stock quantities will not change. This cannot be undone.')) return;
  try {
    await api.clearAdjustments();
    toast('Stock adjustment history cleared.');
    await renderAdjustments();
  } catch (err) {
    toast(err.message, true);
  }
}

async function openAdjustModal() {
  if (guardOwnerAction()) return;
  await loadProducts();
  const s = document.getElementById('aItem');
  s.innerHTML = products.map((p) => `<option value="${p._id}">${p.name} (${p.qty})</option>`).join('');
  document.getElementById('adjustForm').reset();
  prefillAdjustReorderDate();
  document.getElementById('adjustModal').classList.add('show');
}

// Pre-fill the Reorder Date with the item's current one (if any)
function prefillAdjustReorderDate() {
  const p = products.find((x) => x._id === document.getElementById('aItem').value);
  document.getElementById('aReorderDate').value = p && p.reorderDate ? new Date(p.reorderDate).toISOString().slice(0, 10) : '';
}
document.getElementById('aItem').addEventListener('change', prefillAdjustReorderDate);

function quickAdjust(id) {
  openAdjustModal().then(() => {
    document.getElementById('aItem').value = id;
    prefillAdjustReorderDate();
  });
}

document.getElementById('adjustForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.createAdjustment({ productId: aItem.value, type: aType.value, qty: aQty.value, reason: aReason.value, reorderDate: aReorderDate.value });
    closeModal('adjustModal');
    toast('Stock adjustment recorded.');
    await renderAdjustments();
    await renderInventory();
    await renderDashboard();
  } catch (err) {
    toast(err.message, true);
  }
});


/* ---------------- Purchases ---------------- */

let purchaseLines = [];

let purchaseList = [];

async function renderPurchases() {
  purchaseList = await api.listPurchases();
  filterPurchases();
}

function filterPurchases() {
  const q = (document.getElementById('purSearch')?.value || '').trim().toLowerCase();
  const purchases = purchaseList.filter((p) => {
    if (!q) return true;
    const names = (p.items || []).map((i) => i.name).join(' ');
    return `${p.invoice} ${p.supplier} ${names} ${p.status || ''}`.toLowerCase().includes(q);
  });
  document.getElementById('purchaseBody').innerHTML = purchases.length
    ? purchases.map((p) => {
        const itemCount = (p.items || []).reduce((a, i) => a + i.qty, 0);
        const st = p.status || 'Received';
        const stBadge = st === 'Received' ? 'ok' : st === 'Ordered' ? 'low' : st === 'Cancelled' ? 'out' : 'low';
        const canReceive = st === 'Ordered' || st === 'Partially Received';
        const actions = [];
        if (canReceive) actions.push(`<button class="btn small primary" onclick="receivePurchase('${p._id}')">Receive</button>`);
        if (st === 'Ordered' || st === 'Partially Received') actions.push(`<button class="btn small secondary" onclick="cancelPurchase('${p._id}')">Cancel</button>`);
        const balance = Number(p.balance) || 0;
        if (balance > 0 && st !== 'Cancelled' && !isOwner()) actions.push(`<button class="btn small primary" onclick="openPurchasePayModal('${p._id}')">Pay Balance</button>`);
        actions.push(`<button class="btn small danger" onclick="deletePurchase('${p._id}')">Delete</button>`);
        return `<tr>
          <td><b>${p.invoice}</b></td>
          <td>${formatDateNice(p.date)}</td>
          <td>${p.supplier}</td>
          <td>${itemCount} unit(s)</td>
          <td><b>${fmt(p.total)}</b></td>
          <td>${fmt(p.amountPaid != null ? p.amountPaid : p.total)}</td>
          <td>${Number(p.balance) > 0 ? `<b style="color:var(--danger,#b42318)">${fmt(p.balance)}</b>` : '<span class="badge ok">Paid</span>'}</td>
          <td><span class="badge ${stBadge}">${st}</span></td>
          <td>${p.paidFromBank ? '<span class="badge dep">Yes</span>' : '—'}</td>
          <td>${p.recordedByName || '—'}</td>
          <td style="white-space:nowrap">${actions.join(' ')}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="11" class="empty">${purchaseList.length ? 'No purchases match your search.' : 'No purchases recorded yet.'}</td></tr>`;
}

async function openPurchasePayModal(id) {
  if (guardOwnerAction()) return;
  const p = purchaseList.find((x) => x._id === id);
  if (!p) return;
  const raw = prompt(`Balance payment for ${p.invoice} (${p.supplier}).\nBalance owed: ${fmt(p.balance)}\n\nEnter amount paid now:`, String(p.balance));
  if (raw === null) return;
  const amount = Number(raw);
  if (!amount || amount <= 0) return toast('Enter a valid amount.', true);
  try {
    await api.payPurchase(id, { amount });
    toast('Balance payment recorded.');
    await renderPurchases();
  } catch (err) {
    toast(err.message, true);
  }
}

async function openPurchaseModal() {
  if (guardOwnerAction()) return;
  await loadProducts();
  const suppliers = await api.listSuppliers();
  const sel = document.getElementById('puSupplier');
  sel.innerHTML = suppliers.length
    ? suppliers.map((s) => `<option value="${s._id}">${s.name}</option>`).join('')
    : '<option value="">No suppliers — add one first</option>';
  document.getElementById('puDate').value = todayISO();
  document.getElementById('puNotes').value = '';
  document.getElementById('puPaidBank').checked = false;
  document.getElementById('puBankWrap').style.display = 'none';
  document.getElementById('puBank').value = '';
  document.getElementById('puPaid').value = '';
  purchaseLines = [];
  addPurchaseLine();
  document.getElementById('purchaseModal').classList.add('show');
}

function addPurchaseLine() {
  purchaseLines.push({ productId: '', qty: 1, unitCost: 0 });
  renderPurchaseLines();
}

function removePurchaseLine(idx) {
  purchaseLines.splice(idx, 1);
  if (!purchaseLines.length) purchaseLines.push({ productId: '', qty: 1, unitCost: 0 });
  renderPurchaseLines();
}

function purchaseOptionsHtml(selectedId, term) {
  const t = (term || '').trim().toLowerCase();
  return products
    .filter((p) => p._id === selectedId || !t || `${p.name} ${p.sku} ${p.cat}`.toLowerCase().includes(t))
    .map((p) => `<option value="${p._id}" ${selectedId === p._id ? 'selected' : ''}>${p.name} (stock ${p.qty})</option>`)
    .join('');
}

// Filter the item dropdown of one purchase line as the user types
function searchPurchaseItem(i, term) {
  const sel = document.getElementById('puItemSel' + i);
  if (!sel) return;
  sel.innerHTML = '<option value="">Select item…</option>' + purchaseOptionsHtml(purchaseLines[i].productId, term);
}

function renderPurchaseLines() {
  const host = document.getElementById('purchaseLines');
  host.innerHTML = purchaseLines.map((line, i) => {
    const opts = purchaseOptionsHtml(line.productId, '');
    return `<div class="purchase-line" style="display:grid;grid-template-columns:2fr 80px 110px 30px;gap:8px;margin-bottom:8px;align-items:end">
      <div class="field" style="margin:0"><label>Item</label>
        <input class="input" type="search" placeholder="Search item…" oninput="searchPurchaseItem(${i}, this.value)" style="width:100%;margin-bottom:4px">
        <select class="select" id="puItemSel${i}" onchange="purchaseLines[${i}].productId=this.value;onPurchaseProductChange(${i})" style="width:100%">
          <option value="">Select item…</option>${opts}
        </select>
      </div>
      <div class="field" style="margin:0"><label>Qty</label>
        <input class="input" type="number" min="1" value="${line.qty}" onchange="purchaseLines[${i}].qty=Number(this.value)||1;updatePurchaseTotal()" style="width:100%">
      </div>
      <div class="field" style="margin:0"><label>Unit Cost (Le)</label>
        <input class="input" type="number" min="0" value="${line.unitCost}" onchange="purchaseLines[${i}].unitCost=Number(this.value)||0;updatePurchaseTotal()" style="width:100%">
      </div>
      <button type="button" class="btn small danger" onclick="removePurchaseLine(${i})" title="Remove">×</button>
    </div>`;
  }).join('');
  updatePurchaseTotal();
}

function onPurchaseProductChange(i) {
  const p = products.find((x) => x._id === purchaseLines[i].productId);
  if (p) {
    purchaseLines[i].unitCost = p.cost || 0;
    renderPurchaseLines();
  } else {
    updatePurchaseTotal();
  }
}

function updatePurchaseTotal() {
  const total = purchaseLines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);
  document.getElementById('puTotal').textContent = fmt(total);
  const paidRaw = document.getElementById('puPaid')?.value;
  const paid = paidRaw === '' || paidRaw == null ? total : Number(paidRaw) || 0;
  const bal = document.getElementById('puBalance');
  if (bal) bal.textContent = fmt(Math.max(0, total - paid));
}

document.getElementById('puPaidBank')?.addEventListener('change', function () {
  document.getElementById('puBankWrap').style.display = this.checked ? '' : 'none';
});

document.getElementById('purchaseForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = purchaseLines
    .filter((l) => l.productId && Number(l.qty) > 0)
    .map((l) => ({ productId: l.productId, qty: Number(l.qty), unitCost: Number(l.unitCost) || 0 }));
  if (!items.length) return toast('Add at least one valid line item.', true);
  const supplierId = puSupplier.value;
  if (!supplierId) return toast('Select a supplier.', true);
  try {
    await api.createPurchase({
      supplierId,
      date: puDate.value,
      notes: puNotes.value.trim(),
      paidFromBank: puPaidBank.checked,
      bankName: puBank.value.trim(),
      status: (typeof puStatus !== 'undefined' && puStatus.value) || 'Received',
      expectedDate: (typeof puExpected !== 'undefined' && puExpected.value) || '',
      amountPaid: puPaid.value === '' ? undefined : Number(puPaid.value),
      items
    });
    closeModal('purchaseModal');
    toast('Purchase recorded. Stock updated.');
    await renderPurchases();
    await loadProducts();
  } catch (err) {
    toast(err.message, true);
  }
});

async function deletePurchase(id) {
  if (!confirm('Delete this purchase? Stock quantities will be reduced accordingly.')) return;
  try {
    await api.deletePurchase(id);
    toast('Purchase deleted.');
    await renderPurchases();
    await loadProducts();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Expenses ---------------- */

async function renderExpenses() {
  const cat = document.getElementById('expCatFilter')?.value || '';
  const [expenses, summary] = await Promise.all([
    api.listExpenses(cat ? { category: cat } : {}),
    api.expenseSummary()
  ]);

  document.getElementById('expTotal').textContent = fmt(summary.total);
  document.getElementById('expCount').textContent = summary.count + ' record(s)';

  let topCat = '—', topAmt = 0;
  for (const [k, v] of Object.entries(summary.byCategory || {})) {
    if (v > topAmt) { topAmt = v; topCat = k; }
  }
  document.getElementById('expTopCat').textContent = topCat;
  document.getElementById('expTopAmt').textContent = fmt(topAmt);

  const now = new Date();
  const ym = now.toISOString().slice(0, 7);
  const allForMonth = cat ? await api.listExpenses() : expenses;
  const monthTotal = allForMonth
    .filter((e) => (e.date || '').startsWith(ym))
    .reduce((a, e) => a + e.amount, 0);
  document.getElementById('expMonth').textContent = fmt(monthTotal);

  document.getElementById('expenseBody').innerHTML = expenses.length
    ? expenses.map((e) => `<tr>
        <td>${formatDateNice(e.date)}</td>
        <td>${e.category}</td>
        <td>${e.description}</td>
        <td><b>${fmt(e.amount)}</b></td>
        <td>${e.paidFromBank ? (e.bankName || 'Yes') : '—'}</td>
        <td>${e.reason || e.reference || '—'}</td>
        <td>${e.recordedByName || '—'}</td>
        <td><button class="btn small danger" onclick="deleteExpense('${e._id}')">Delete</button></td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="empty">No expenses recorded yet.</td></tr>';
}

function openExpenseModal() {
  if (guardOwnerAction()) return;
  document.getElementById('expenseForm').reset();
  document.getElementById('exDate').value = todayISO();
  document.getElementById('exPaidBank').checked = false;
  document.getElementById('exBankWrap').style.display = 'none';
  document.getElementById('expenseModal').classList.add('show');
}

document.getElementById('exPaidBank')?.addEventListener('change', function () {
  document.getElementById('exBankWrap').style.display = this.checked ? '' : 'none';
});

document.getElementById('expenseForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.createExpense({
      category: exCategory.value,
      amount: exAmount.value,
      date: exDate.value,
      description: exDesc.value.trim(),
      reason: exReason.value.trim(),
      paidFromBank: exPaidBank.checked,
      bankName: exBank.value.trim()
    });
    closeModal('expenseModal');
    toast('Expense recorded.');
    await renderExpenses();
  } catch (err) {
    toast(err.message, true);
  }
});

async function deleteExpense(id) {
  if (!confirm('Delete this expense record?')) return;
  try {
    await api.deleteExpense(id);
    toast('Expense deleted.');
    await renderExpenses();
  } catch (err) {
    toast(err.message, true);
  }
}


/* ---------------- Treatments & Payments (Supervisor) ---------------- */

async function renderTreatments() {
  const params = {};
  const st = document.getElementById('trStatusFilter')?.value;
  const q = document.getElementById('trSearch')?.value?.trim();
  if (st) params.status = st;
  if (q) params.q = q;
  const list = await api.listTreatments(params);
  const badge = (s) => {
    const m = { Paid: 'ok', Partial: 'low', Unpaid: 'out' };
    return `<span class="badge ${m[s] || 'ok'}">${s}</span>`;
  };
  document.getElementById('treatmentBody').innerHTML = list.length
    ? list.map((t) => {
        const actions = [];
        if (t.paymentStatus !== 'Paid' && currentUser.role === 'Supervisor') {
          actions.push(`<button class="btn small primary" onclick="openTrPayModal('${t._id}')">Pay</button>`);
        }
        if (currentUser.role === 'Supervisor') {
          actions.push(`<button class="btn small danger" onclick="deleteTreatment('${t._id}')">Delete</button>`);
        }
        return `<tr>
          <td><b>${t.treatmentNo}</b></td>
          <td>${formatDateNice(t.date)}</td>
          <td>${t.patientName}${t.patientPhone ? '<br><span style="color:var(--muted);font-size:10px">' + t.patientPhone + '</span>' : ''}</td>
          <td style="max-width:180px;white-space:normal">${t.treatmentDetails}</td>
          <td>${fmt(t.totalAmount)}</td>
          <td>${fmt(t.amountPaid)}</td>
          <td><b>${fmt(t.balance)}</b></td>
          <td>${badge(t.paymentStatus)}</td>
          <td style="white-space:nowrap">${actions.join(' ') || '—'}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="9" class="empty">No treatments recorded yet.</td></tr>';
}

function openTreatmentModal() {
  if (guardOwnerAction()) return;
  if (currentUser.role !== 'Supervisor') return toast('Only Supervisors can record treatments.', true);
  document.getElementById('treatmentForm').reset();
  document.getElementById('trDate').value = todayISO();
  document.getElementById('trInitial').value = '0';
  document.getElementById('treatmentModal').classList.add('show');
}

document.getElementById('treatmentForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (guardOwnerAction()) return;
  try {
    await api.createTreatment({
      patientName: trPatient.value.trim(),
      patientPhone: trPhone.value.trim(),
      date: trDate.value,
      doctorName: trDoctor.value.trim(),
      diagnosis: trDiagnosis.value.trim(),
      treatmentDetails: trDetails.value.trim(),
      totalAmount: trTotal.value,
      initialPayment: trInitial.value,
      paymentMethod: trMethod.value,
      paymentReference: trPayRef.value.trim(),
      notes: trNotes.value.trim()
    });
    closeModal('treatmentModal');
    toast('Treatment recorded.');
    await renderTreatments();
  } catch (err) {
    toast(err.message, true);
  }
});

async function openTrPayModal(id) {
  if (guardOwnerAction()) return;
  const list = await api.listTreatments();
  const t = list.find((x) => x._id === id);
  if (!t) return;
  document.getElementById('trPayId').value = id;
  document.getElementById('trPayInfo').textContent =
    `${t.treatmentNo} · ${t.patientName} · Balance: ${fmt(t.balance)}`;
  document.getElementById('trPayAmt').value = t.balance;
  document.getElementById('trPayAmt').max = t.balance;
  document.getElementById('trPayModal').classList.add('show');
}

document.getElementById('trPayForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.addTreatmentPayment(trPayId.value, {
      amount: trPayAmt.value,
      method: trPayMethod.value,
      reference: trPayReference.value.trim()
    });
    closeModal('trPayModal');
    toast('Payment recorded.');
    await renderTreatments();
  } catch (err) {
    toast(err.message, true);
  }
});

async function deleteTreatment(id) {
  if (guardOwnerAction()) return;
  if (!confirm('Delete this treatment record?')) return;
  try {
    await api.deleteTreatment(id);
    toast('Deleted.');
    await renderTreatments();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Bank Transactions ---------------- */

async function renderBank() {
  const [summary, txs] = await Promise.all([
    api.bankSummary(),
    api.listBankTransactions(document.getElementById('bankTypeFilter')?.value ? { type: document.getElementById('bankTypeFilter').value } : {})
  ]);

  document.getElementById('bankOpening').textContent = fmt(summary.openingBalance);
  document.getElementById('bankOpeningDate').textContent = summary.openingDate
    ? '▲ ' + formatDateNice(summary.openingDate)
    : 'Not set';
  document.getElementById('bankDeposits').textContent = fmt(summary.totalDeposits);
  document.getElementById('bankWithdrawals').textContent = fmt(summary.totalWithdrawals);
  document.getElementById('bankBalance').textContent = fmt(summary.bankBalance);
  document.getElementById('bankDepLabel').textContent = '▲ This academic year (' + (summary.academicYear || '') + ')';
  document.getElementById('bankWdLabel').textContent = '▼ This academic year (' + (summary.academicYear || '') + ')';

  const typeBadge = (t) => {
    if (t === 'Deposit') return '<span class="badge dep">Deposit</span>';
    if (t === 'Withdrawal') return '<span class="badge wd">Withdrawal</span>';
    return '<span class="badge open">Opening</span>';
  };

  document.getElementById('bankBody').innerHTML = txs.length
    ? txs.map((t) => `<tr>
        <td>${formatDateNice(t.date)}</td>
        <td>${typeBadge(t.type)}</td>
        <td><b>${fmt(t.amount)}</b></td>
        <td>${t.bankName || '—'}</td>
        <td>${t.purpose || '—'}</td>
        <td>${t.reference || '—'}${t.slipFile ? ` <a href="/uploads/${t.slipFile}" target="_blank" style="font-size:10px">📎 Slip</a>` : ''}</td>
        <td>${t.recordedByName || '—'}</td>
        <td>${t.type !== 'Opening' ? `<button class="btn small danger" onclick="deleteBankTx('${t._id}')">Delete</button>` : ''}</td>
      </tr>`).join('')
    : '<tr><td colspan="8" class="empty">No bank transactions recorded yet. Click “Record Transaction” to add one.</td></tr>';
}

function openBankModal() {
  if (guardOwnerAction()) return;
  document.getElementById('bankForm').reset();
  document.getElementById('bDate').value = todayISO();
  document.getElementById('bankModal').classList.add('show');
}

function openOpeningBalanceModal() {
  if (guardOwnerAction()) return;
  document.getElementById('openingForm').reset();
  document.getElementById('oDate').value = todayISO();
  document.getElementById('openingModal').classList.add('show');
}

document.getElementById('bankForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const payload = {
      type: bType.value,
      amount: bAmount.value,
      date: bDate.value,
      bankName: bBank.value.trim(),
      purpose: bPurpose.value.trim(),
      reference: bRef.value.trim()
    };
    const fileInput = document.getElementById('bSlip');
    const file = fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    await api.createBankTransaction(payload, file);
    closeModal('bankModal');
    toast('Bank transaction recorded.');
    await renderBank();
  } catch (err) {
    toast(err.message, true);
  }
});

document.getElementById('openingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api.createBankTransaction({
      type: 'Opening',
      amount: oAmount.value,
      date: oDate.value,
      bankName: '',
      purpose: oNote.value.trim() || 'Opening balance',
      reference: ''
    });
    closeModal('openingModal');
    toast('Opening balance saved.');
    await renderBank();
  } catch (err) {
    toast(err.message, true);
  }
});

async function deleteBankTx(id) {
  if (!confirm('Delete this bank transaction? This cannot be undone.')) return;
  try {
    await api.deleteBankTransaction(id);
    toast('Transaction deleted.');
    await renderBank();
  } catch (err) {
    toast(err.message, true);
  }
}


/* ---------------- Purchase receive / cancel ---------------- */

async function receivePurchase(id) {
  if (!confirm('Mark remaining items as received and add them to inventory?')) return;
  try {
    await api.receivePurchase(id, {});
    toast('Goods received. Stock updated.');
    await renderPurchases();
    await loadProducts();
  } catch (err) {
    toast(err.message, true);
  }
}

async function cancelPurchase(id) {
  if (!confirm('Cancel this purchase order? Any already-received stock will be reversed.')) return;
  try {
    await api.cancelPurchase(id);
    toast('Purchase order cancelled.');
    await renderPurchases();
    await loadProducts();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Prescriptions ---------------- */

let rxLines = [];
let currentDispenseRx = null;

async function renderPrescriptions() {
  const params = {};
  const st = document.getElementById('rxStatusFilter')?.value;
  const q = document.getElementById('rxSearch')?.value?.trim();
  if (st) params.status = st;
  if (q) params.q = q;
  const list = await api.listPrescriptions(params);
  const statusBadge = (s) => {
    const map = { Pending: 'low', 'Partially Dispensed': 'low', Dispensed: 'ok', Cancelled: 'out' };
    return `<span class="badge ${map[s] || 'ok'}">${s}</span>`;
  };
  document.getElementById('rxBody').innerHTML = list.length
    ? list.map((rx) => {
        const itemCount = (rx.items || []).length;
        const actions = [];
        if (rx.status === 'Pending' || rx.status === 'Partially Dispensed') {
          actions.push(`<button class="btn small primary" onclick="openDispenseModal('${rx._id}')">Dispense</button>`);
          actions.push(`<button class="btn small secondary" onclick="cancelRx('${rx._id}')">Cancel</button>`);
        }
        actions.push(`<button class="btn small danger" onclick="deleteRx('${rx._id}')">Delete</button>`);
        return `<tr>
          <td><b>${rx.rxNumber}</b></td>
          <td>${formatDateNice(rx.date)}</td>
          <td>${rx.patientName}${rx.patientPhone ? '<br><span style="color:var(--muted);font-size:10px">' + rx.patientPhone + '</span>' : ''}</td>
          <td>${rx.doctorName || '—'}</td>
          <td>${itemCount} medicine(s)</td>
          <td>${statusBadge(rx.status)}</td>
          <td style="white-space:nowrap">${actions.join(' ')}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="7" class="empty">No prescriptions yet.</td></tr>';
}

function openRxModal() {
  if (guardOwnerAction()) return;
  document.getElementById('rxForm').reset();
  document.getElementById('rxDate').value = todayISO();
  rxLines = [];
  addRxLine();
  document.getElementById('rxModal').classList.add('show');
}

function addRxLine() {
  rxLines.push({ productId: '', qty: 1, dosage: '', duration: '' });
  renderRxLines();
}

function removeRxLine(i) {
  rxLines.splice(i, 1);
  if (!rxLines.length) rxLines.push({ productId: '', qty: 1, dosage: '', duration: '' });
  renderRxLines();
}

async function renderRxLines() {
  if (!products.length) await loadProducts();
  const host = document.getElementById('rxLines');
  host.innerHTML = rxLines.map((line, i) => {
    const opts = products.map((p) =>
      `<option value="${p._id}" ${line.productId === p._id ? 'selected' : ''}>${p.name} (stock ${p.qty})</option>`
    ).join('');
    return `<div style="display:grid;grid-template-columns:2fr 70px 1fr 1fr 28px;gap:8px;margin-bottom:8px;align-items:end">
      <div class="field" style="margin:0"><label>Medicine</label>
        <select class="select" onchange="rxLines[${i}].productId=this.value" style="width:100%">
          <option value="">Select…</option>${opts}
        </select>
      </div>
      <div class="field" style="margin:0"><label>Qty</label>
        <input class="input" type="number" min="1" value="${line.qty}" onchange="rxLines[${i}].qty=Number(this.value)||1" style="width:100%">
      </div>
      <div class="field" style="margin:0"><label>Dosage</label>
        <input class="input" value="${line.dosage || ''}" placeholder="e.g. 1 tab 3x/day" onchange="rxLines[${i}].dosage=this.value" style="width:100%">
      </div>
      <div class="field" style="margin:0"><label>Duration</label>
        <input class="input" value="${line.duration || ''}" placeholder="e.g. 5 days" onchange="rxLines[${i}].duration=this.value" style="width:100%">
      </div>
      <button type="button" class="btn small danger" onclick="removeRxLine(${i})">×</button>
    </div>`;
  }).join('');
}

document.getElementById('rxForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const items = rxLines.filter((l) => l.productId && l.qty > 0).map((l) => ({
    productId: l.productId, qty: Number(l.qty), dosage: l.dosage, duration: l.duration
  }));
  if (!items.length) return toast('Add at least one medicine.', true);
  try {
    await api.createPrescription({
      patientName: rxPatient.value.trim(),
      patientPhone: rxPhone.value.trim(),
      doctorName: rxDoctor.value.trim(),
      diagnosis: rxDiagnosis.value.trim(),
      notes: rxNotes.value.trim(),
      date: rxDate.value,
      items
    });
    closeModal('rxModal');
    toast('Prescription saved.');
    await renderPrescriptions();
  } catch (err) {
    toast(err.message, true);
  }
});

async function openDispenseModal(id) {
  const list = await api.listPrescriptions();
  const rx = list.find((x) => x._id === id);
  if (!rx) return;
  currentDispenseRx = rx;
  document.getElementById('dispenseInfo').innerHTML =
    `<b>${rx.rxNumber}</b> — ${rx.patientName}${rx.doctorName ? ' · Dr. ' + rx.doctorName : ''}`;
  document.getElementById('dispenseLines').innerHTML = (rx.items || []).map((item, i) => {
    const remaining = item.qty - (item.dispensed || 0);
    if (remaining <= 0) {
      return `<div style="padding:8px 0;border-bottom:1px solid var(--line);font-size:12px;color:var(--muted)">
        ${item.name} — fully dispensed (${item.dispensed}/${item.qty})
      </div>`;
    }
    return `<div style="display:grid;grid-template-columns:1fr 90px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
      <div style="font-size:12px"><b>${item.name}</b><br>
        <span style="color:var(--muted)">Prescribed ${item.qty} · Dispensed ${item.dispensed || 0} · Remaining ${remaining}
        ${item.dosage ? ' · ' + item.dosage : ''}</span>
      </div>
      <input class="input" type="number" min="0" max="${remaining}" value="${remaining}" id="dispQty${i}" data-product="${item.product}" style="width:100%">
    </div>`;
  }).join('');
  document.getElementById('dispenseModal').classList.add('show');
}

async function confirmDispense() {
  if (!currentDispenseRx) return;
  const lines = [];
  (currentDispenseRx.items || []).forEach((item, i) => {
    const el = document.getElementById('dispQty' + i);
    if (!el) return;
    const qty = Number(el.value) || 0;
    if (qty > 0) lines.push({ productId: item.product, qty });
  });
  if (!lines.length) return toast('Enter quantities to dispense.', true);
  try {
    await api.dispensePrescription(currentDispenseRx._id, { lines });
    closeModal('dispenseModal');
    toast('Medicines dispensed. Stock updated.');
    await renderPrescriptions();
    await loadProducts();
  } catch (err) {
    toast(err.message, true);
  }
}

async function cancelRx(id) {
  if (!confirm('Cancel this prescription?')) return;
  try {
    await api.cancelPrescription(id);
    toast('Prescription cancelled.');
    await renderPrescriptions();
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteRx(id) {
  if (!confirm('Delete this prescription permanently?')) return;
  try {
    await api.deletePrescription(id);
    toast('Prescription deleted.');
    await renderPrescriptions();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Audit Log ---------------- */

async function renderAudit() {
  const params = {};
  const entity = document.getElementById('auditEntity')?.value;
  const action = document.getElementById('auditAction')?.value;
  const from = document.getElementById('auditFrom')?.value;
  const to = document.getElementById('auditTo')?.value;
  if (entity) params.entity = entity;
  if (action) params.action = action;
  if (from) params.from = from;
  if (to) params.to = to;
  const logs = await api.listAudit(params);
  const isSuper = currentUser && currentUser.role === 'Supervisor';
  document.getElementById('auditBody').innerHTML = logs.length
    ? logs.map((l) => {
        const when = new Date(l.createdAt).toLocaleString('en-GB', {
          day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        return `<tr>
          <td>${when}</td>
          <td>${l.userName || '—'}</td>
          <td>${l.userRole || '—'}</td>
          <td><span class="badge ok">${l.action}</span></td>
          <td>${l.entity}</td>
          <td>${l.summary}</td>
          ${isSuper ? `<td><button class="btn small danger" onclick="deleteAuditEntry('${l._id}')">Delete</button></td>` : ''}
        </tr>`;
      }).join('')
    : `<tr><td colspan="${isSuper ? 7 : 6}" class="empty">No audit entries yet.</td></tr>`;
}

async function deleteAuditEntry(id) {
  if (!confirm('Delete this audit log entry?')) return;
  try {
    await api.deleteAudit(id);
    toast('Log entry deleted.');
    await renderAudit();
  } catch (err) {
    toast(err.message, true);
  }
}

async function clearAuditLog() {
  if (!confirm('Clear the ENTIRE audit log? This cannot be undone.')) return;
  try {
    await api.clearAudit();
    toast('Audit log cleared.');
    await renderAudit();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Profit & Loss ---------------- */

function switchReportMode() {
  const mode = document.getElementById('reportMode')?.value || 'sales';
  const salesPanel = document.getElementById('salesReportPanel');
  const pnlPanel = document.getElementById('pnlPanel');
  const period = document.getElementById('reportPeriod');
  const date = document.getElementById('reportDate');
  const pnlRange = document.getElementById('pnlDateRange');
  if (mode === 'pnl') {
    if (salesPanel) salesPanel.style.display = 'none';
    if (pnlPanel) pnlPanel.style.display = '';
    if (period) period.style.display = 'none';
    if (date) date.style.display = 'none';
    if (pnlRange) pnlRange.style.display = 'inline-flex';
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    if (document.getElementById('pnlFrom') && !document.getElementById('pnlFrom').value) {
      document.getElementById('pnlFrom').value = from;
      document.getElementById('pnlTo').value = todayISO();
    }
    renderPnL();
  } else {
    if (salesPanel) salesPanel.style.display = '';
    if (pnlPanel) pnlPanel.style.display = 'none';
    if (period) period.style.display = '';
    if (date) date.style.display = '';
    if (pnlRange) pnlRange.style.display = 'none';
    renderReports();
  }
}

async function renderPnL() {
  const from = document.getElementById('pnlFrom')?.value || todayISO().slice(0, 7) + '-01';
  const to = document.getElementById('pnlTo')?.value || todayISO();
  try {
    const d = await api.pnlReport(from, to);
    document.getElementById('pnlRevenue').textContent = fmt(d.revenue);
    document.getElementById('pnlCogs').textContent = fmt(d.cogs);
    document.getElementById('pnlGross').textContent = fmt(d.grossProfit);
    document.getElementById('pnlExpenses').textContent = fmt(d.expenses);
    const netEl = document.getElementById('pnlNet');
    netEl.textContent = fmt(d.netProfit);
    netEl.style.color = d.netProfit >= 0 ? 'var(--green2)' : 'var(--danger)';

    document.getElementById('pnlSummary').innerHTML = `
      <div style="font-size:12px;line-height:1.8">
        <div>Period: <b>${from}</b> → <b>${to}</b></div>
        <div>Sales transactions: <b>${d.salesCount}</b></div>
        <div>Purchase receipts: <b>${d.purchaseCount}</b></div>
        <div>Expense records: <b>${d.expenseCount}</b></div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
          Revenue − COGS = Gross Profit<br>
          Gross Profit − Expenses = <b>Net ${d.netProfit >= 0 ? 'Profit' : 'Loss'}</b>
        </div>
      </div>`;

    const cats = Object.entries(d.expensesByCategory || {});
    document.getElementById('pnlByCat').innerHTML = cats.length
      ? `<table class="table"><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>
          ${cats.sort((a,b)=>b[1]-a[1]).map(([k,v]) => `<tr><td>${k}</td><td><b>${fmt(v)}</b></td></tr>`).join('')}
         </tbody></table>`
      : '<div class="empty">No expenses in this period.</div>';
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- Staff (Supervisor only) ---------------- */

async function renderStaff() {
  const staff = await api.listStaff();
  document.getElementById('staffBody').innerHTML = staff
    .map((u) => `<tr><td><b>${u.name}</b>${u.id === currentUser.id ? ' <span class="badge ok">You</span>' : ''}</td><td>${u.phone || '—'}</td><td>${u.role}</td><td><button class="btn small secondary" onclick="editStaff('${u.id}')">${u.role === 'Owner' ? 'Manage Login' : 'Edit'}</button>${u.role === 'Owner' || u.id === currentUser.id ? '' : ` <button class="btn small danger" onclick="deleteStaff('${u.id}')">Delete</button>`}</td></tr>`)
    .join('');
}

function openStaffModal() {
  if (guardOwnerAction()) return;
  editingStaffId = null;
  document.getElementById('staffForm').reset();
  setStaffRoleOptions(null);
  document.getElementById('staffModalTitle').textContent = 'Add Staff';
  document.getElementById('staffModal').classList.add('show');
}

// Owner accounts keep their role; staff accounts choose Pharmacist or Supervisor
function setStaffRoleOptions(role) {
  const sel = document.getElementById('stRole');
  if (role === 'Owner') {
    sel.innerHTML = '<option>Owner</option>';
    sel.disabled = true;
  } else {
    sel.innerHTML = '<option>Pharmacist</option><option>Supervisor</option>';
    sel.disabled = false;
  }
}

async function editStaff(id) {
  const staff = await api.listStaff();
  const u = staff.find((x) => x.id === id);
  if (!u) return;
  editingStaffId = id;
  setStaffRoleOptions(u.role);
  stName.value = u.name;
  if (typeof stPhone !== "undefined") stPhone.value = u.phone || "";
  stRole.value = u.role;
  stPhone.value = u.phone || '';
  stPass.value = '';
  document.getElementById('staffModalTitle').textContent = u.role === 'Owner' ? "Manage Owner's Account" : 'Edit Staff';
  document.getElementById('staffModal').classList.add('show');
}

document.getElementById('staffForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = { name: stName.value.trim(), phone: stPhone.value.trim() };
  if (!stRole.disabled) payload.role = stRole.value;
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
  pfPhone.value = currentUser.phone || '';
  pfRole.value = currentUser.role;
  pfName.disabled = false;
  pfPhone.disabled = false;
  const url = avatarUrl(currentUser);
  const img = document.getElementById('pfAvatarPreview');
  const fb = document.getElementById('pfAvatarFallback');
  if (url && img) {
    img.src = url;
    img.style.display = '';
    if (fb) fb.style.display = 'none';
  } else {
    if (img) img.style.display = 'none';
    if (fb) {
      fb.style.display = 'flex';
      fb.textContent = initials(currentUser.name);
    }
  }
}

document.getElementById('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const { user } = await api.updateProfile({ name: pfName.value, phone: pfPhone.value });
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



/* ---------------- PWA install + Push notifications ---------------- */

let deferredInstallPrompt = null;

/* ---------------- In-app Install prompt ---------------- */

function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

function maybeShowInstallPrompt() {
  if (isStandalonePwa()) return;
  if (sessionStorage.getItem('maralex_install_prompted') === '1') return;
  if (localStorage.getItem('maralex_install_dismissed') === '1') return;
  // Show shortly after page is ready (login or app)
  setTimeout(() => {
    const m = document.getElementById('installPromptModal');
    if (!m) return;
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const hint = document.getElementById('installHint');
    if (isIOS && hint) {
      hint.style.display = '';
      hint.textContent = 'On iPhone/iPad: tap Share → Add to Home Screen after closing this dialog.';
    }
    m.classList.add('show');
    sessionStorage.setItem('maralex_install_prompted', '1');
  }, 800);
}

function dismissInstallPrompt() {
  const m = document.getElementById('installPromptModal');
  if (m) m.classList.remove('show');
  localStorage.setItem('maralex_install_dismissed', '1');
}

async function acceptInstallPrompt() {
  const m = document.getElementById('installPromptModal');
  if (deferredInstallPrompt) {
    if (m) m.classList.remove('show');
    deferredInstallPrompt.prompt();
    try {
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('maralex_install_dismissed', '1');
        toast('Installing app…');
      }
    } catch (e) {}
    deferredInstallPrompt = null;
    const btn = document.getElementById('installAppBtn');
    if (btn) btn.style.display = 'none';
    return;
  }
  // No browser install event yet — show platform guidance inside the modal
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const hint = document.getElementById('installHint');
  if (hint) {
    hint.style.display = '';
    if (isIOS) {
      hint.textContent = 'Tap the Share button in Safari, then choose “Add to Home Screen”.';
    } else {
      hint.textContent = 'Use your browser menu (⋮ or ⋯) and choose “Install app” or “Add to Home screen”. You can also use the Install button in the top bar when it appears.';
    }
  }
}



window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const btn = document.getElementById('installAppBtn');
  if (btn) btn.style.display = '';
  // If user hasn't dismissed, ensure in-app prompt can install natively
  if (localStorage.getItem('maralex_install_dismissed') !== '1') {
    const m = document.getElementById('installPromptModal');
    if (m && !m.classList.contains('show') && sessionStorage.getItem('maralex_install_prompted') !== '1') {
      maybeShowInstallPrompt();
    }
  }
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const btn = document.getElementById('installAppBtn');
  if (btn) btn.style.display = 'none';
  toast('App installed successfully.');
});

async function installPwa() {
  if (!deferredInstallPrompt) {
    // iOS / already installed guidance
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS) {
      toast('On iPhone: tap Share → Add to Home Screen');
    } else {
      toast('Install is not available right now. Use your browser menu → Install app.');
    }
    return;
  }
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') toast('Installing…');
  deferredInstallPrompt = null;
  const btn = document.getElementById('installAppBtn');
  if (btn) btn.style.display = 'none';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}


function maybeShowNotifyPrompt() {
  if (!currentUser) return;
  if (currentUser.role !== 'Supervisor' && currentUser.role !== 'Owner') return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'granted') return;
  if (Notification.permission === 'denied') return;
  if (sessionStorage.getItem('maralex_notify_prompted') === '1') return;
if (localStorage.getItem('maralex_notify_enabled') === '1') return;
  // Slight delay so dashboard paints first
  setTimeout(() => {
    const m = document.getElementById('notifyPromptModal');
    if (m) m.classList.add('show');
  }, 600);
}

function dismissNotifyPrompt() {
  const m = document.getElementById('notifyPromptModal');
  if (m) m.classList.remove('show');
  sessionStorage.setItem('maralex_notify_prompted', '1');
}

async function acceptNotifyPrompt() {
  const m = document.getElementById('notifyPromptModal');
  if (m) m.classList.remove('show');
  sessionStorage.setItem('maralex_notify_prompted', '1');
  await enablePushNotifications();
  if (Notification.permission === 'granted') localStorage.setItem('maralex_notify_enabled', '1');
}

async function enablePushNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return toast('Push notifications are not supported on this device/browser.', true);
  }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return toast('Notification permission denied.', true);
    const { publicKey } = await api.vapidPublicKey();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }
    const json = sub.toJSON();
    await api.pushSubscribe({ endpoint: json.endpoint, keys: json.keys });
    toast('Alerts enabled. You will receive important pharmacy notifications.');
  } catch (err) {
    toast(err.message || 'Could not enable notifications.', true);
  }
}

/* ---------------- Mobile navigation ---------------- */

function openMobileNav() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('navBackdrop');
  const btn = document.getElementById('menuBtn');
  if (sidebar) sidebar.classList.add('open');
  if (backdrop) backdrop.classList.add('show');
  if (btn) btn.classList.add('open');
  document.body.classList.add('nav-open');
}

function closeMobileNav() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('navBackdrop');
  const btn = document.getElementById('menuBtn');
  if (sidebar) sidebar.classList.remove('open');
  if (backdrop) backdrop.classList.remove('show');
  if (btn) btn.classList.remove('open');
  document.body.classList.remove('nav-open');
}

function toggleMobileNav() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && sidebar.classList.contains('open')) closeMobileNav();
  else openMobileNav();
}

// Close drawer on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMobileNav();
});

// Close drawer when resizing to desktop
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) closeMobileNav();
});

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

/* ---------------- Init ---------------- */

document.getElementById('today').textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
document.getElementById('reportDate').value = todayISO();
tryResumeSession();
// Show install prompt once UI is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => maybeShowInstallPrompt());
} else {
  maybeShowInstallPrompt();
}
