
// Thin wrapper around fetch() for talking to the MARALEX Allied API.
// The frontend (Vercel) and backend (Render) are deployed separately, so
// API_BASE points at the live Render API rather than a relative path.
// Falling back to a relative "/api" when running locally off the same
// Express server (e.g. http://localhost:5000) still works.
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? '/api'
  : 'https://maralexhospital.onrender.com/api';
 
function getToken() {
  return localStorage.getItem('maralex_token');
}
function setToken(token) {
  if (token) localStorage.setItem('maralex_token', token);
  else localStorage.removeItem('maralex_token');
}
 
async function apiRequest(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
 
  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
 
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    // no JSON body
  }
 
  if (!res.ok) {
    const message = (data && data.message) || `Request failed (${res.status}).`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}
 
const api = {
  // auth
  login: (phone, password, role) => apiRequest('/auth/login', { method: 'POST', body: { phone, password, role } }),
  me: () => apiRequest('/auth/me'),
  updateProfile: (payload) => apiRequest('/auth/profile', { method: 'PUT', body: payload }),
  changePassword: (payload) => apiRequest('/auth/password', { method: 'PUT', body: payload }),
  deleteMyAccount: () => apiRequest('/auth/me', { method: 'DELETE' }),
 
  // staff (Supervisor only)
  listStaff: () => apiRequest('/staff'),
  createStaff: (payload) => apiRequest('/staff', { method: 'POST', body: payload }),
  updateStaff: (id, payload) => apiRequest(`/staff/${id}`, { method: 'PUT', body: payload }),
  deleteStaff: (id) => apiRequest(`/staff/${id}`, { method: 'DELETE' }),
 
  // inventory
  listProducts: () => apiRequest('/products'),
  createProduct: (payload) => apiRequest('/products', { method: 'POST', body: payload }),
  updateProduct: (id, payload) => apiRequest(`/products/${id}`, { method: 'PUT', body: payload }),
  deleteProduct: (id) => apiRequest(`/products/${id}`, { method: 'DELETE' }),
 
  // sales
  listSales: () => apiRequest('/sales'),
  checkout: (payload) => apiRequest('/sales/checkout', { method: 'POST', body: payload }),
 
  // suppliers
  listSuppliers: () => apiRequest('/suppliers'),
  createSupplier: (payload) => apiRequest('/suppliers', { method: 'POST', body: payload }),
 
  // customers
  listCustomers: () => apiRequest('/customers'),
  createCustomer: (payload) => apiRequest('/customers', { method: 'POST', body: payload }),
 
  // stock adjustments
  listAdjustments: () => apiRequest('/adjustments'),
  createAdjustment: (payload) => apiRequest('/adjustments', { method: 'POST', body: payload }),
 
  // reports
  dashboard: () => apiRequest('/reports/dashboard'),
  salesReport: (period, date) => apiRequest(`/reports/sales?period=${period}&date=${date}`),

  // bank transactions
  bankSummary: () => apiRequest('/bank/summary'),
  listBankTransactions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest('/bank' + (q ? '?' + q : ''));
  },
  createBankTransaction: async (payload, file) => {
    if (file) {
      const fd = new FormData();
      Object.entries(payload).forEach(([k, v]) => fd.append(k, v == null ? '' : v));
      fd.append('slip', file);
      const headers = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(API_BASE + '/bank', { method: 'POST', headers, body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw Object.assign(new Error((data && data.message) || 'Upload failed'), { status: res.status });
      return data;
    }
    return apiRequest('/bank', { method: 'POST', body: payload });
  },
  deleteBankTransaction: (id) => apiRequest(`/bank/${id}`, { method: 'DELETE' }),

  // purchases
  listPurchases: () => apiRequest('/purchases'),
  createPurchase: (payload) => apiRequest('/purchases', { method: 'POST', body: payload }),
  deletePurchase: (id) => apiRequest(`/purchases/${id}`, { method: 'DELETE' }),

  // expenses
  listExpenses: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest('/expenses' + (q ? '?' + q : ''));
  },
  expenseSummary: () => apiRequest('/expenses/summary'),
  createExpense: (payload) => apiRequest('/expenses', { method: 'POST', body: payload }),
  deleteExpense: (id) => apiRequest(`/expenses/${id}`, { method: 'DELETE' })
,

  // purchases extras
  receivePurchase: (id, payload) => apiRequest(`/purchases/${id}/receive`, { method: 'POST', body: payload || {} }),
  cancelPurchase: (id) => apiRequest(`/purchases/${id}/cancel`, { method: 'PUT' }),

  // prescriptions
  listPrescriptions: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest('/prescriptions' + (q ? '?' + q : ''));
  },
  createPrescription: (payload) => apiRequest('/prescriptions', { method: 'POST', body: payload }),
  dispensePrescription: (id, payload) => apiRequest(`/prescriptions/${id}/dispense`, { method: 'POST', body: payload }),
  cancelPrescription: (id) => apiRequest(`/prescriptions/${id}/cancel`, { method: 'PUT' }),
  deletePrescription: (id) => apiRequest(`/prescriptions/${id}`, { method: 'DELETE' }),

  // audit
  listAudit: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest('/audit' + (q ? '?' + q : ''));
  },

  // P&L
  pnlReport: (from, to) => apiRequest(`/reports/pnl?from=${from}&to=${to}`)
,

  nextSku: (cat) => apiRequest('/products/next-sku?cat=' + encodeURIComponent(cat || 'Medicines')),
  uploadAvatar: async (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    const res = await fetch(API_BASE + '/auth/avatar', { method: 'POST', headers, body: fd });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error((data && data.message) || 'Upload failed'), { status: res.status });
    return data;
  },
  listTreatments: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return apiRequest('/treatments' + (q ? '?' + q : ''));
  },
  createTreatment: (payload) => apiRequest('/treatments', { method: 'POST', body: payload }),
  addTreatmentPayment: (id, payload) => apiRequest(`/treatments/${id}/payment`, { method: 'POST', body: payload }),
  deleteTreatment: (id) => apiRequest(`/treatments/${id}`, { method: 'DELETE' }),
  vapidPublicKey: () => apiRequest('/push/vapid-public-key'),
  pushSubscribe: (sub) => apiRequest('/push/subscribe', { method: 'POST', body: sub }),
  pushUnsubscribe: (endpoint) => apiRequest('/push/unsubscribe', { method: 'POST', body: { endpoint } })
};
