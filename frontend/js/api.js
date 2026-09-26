// Thin wrapper around fetch() for talking to the MARALEX Allied API.
// The API base is relative ("/api/...") since the frontend is served by the
// same Express server. If you host the frontend elsewhere, set API_BASE.
const API_BASE = '/api';

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
  login: (username, password, role) => apiRequest('/auth/login', { method: 'POST', body: { username, password, role } }),
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
  salesReport: (period, date) => apiRequest(`/reports/sales?period=${period}&date=${date}`)
};
