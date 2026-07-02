export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyOfflineLogin(username: string, hashedPassword: string): Promise<{ success: boolean; user: { username: string; role: string } } | null> {
  try {
    const cachedUsers = JSON.parse(localStorage.getItem('superpos_offline_users') || '{}');
    const cached = cachedUsers[username];
    if (cached?.hash === hashedPassword) {
      return { success: true, user: { username, role: cached.role } };
    }
  } catch {}
  return null;
}

function cacheOfflineCredentials(username: string, role: string, hash: string) {
  try {
    const cachedUsers = JSON.parse(localStorage.getItem('superpos_offline_users') || '{}');
    cachedUsers[username] = { role, hash };
    localStorage.setItem('superpos_offline_users', JSON.stringify(cachedUsers));
  } catch (err) {
    console.error("Falha ao salvar credenciais offline:", err);
  }
}

export interface Product {
  id: number;
  code?: string;
  barcode: string;
  barcodes?: string[];
  name: string;
  category?: string;
  category_id?: number | null;
  subcategory_id?: number | null;
  price_buy: number;
  price_sell: number;
  stock_qty: number;
  min_stock: number;
  unit: string;
  created_at: string;
  ncm?: string;
  cest?: string;
  cfop?: string;
  origin?: string;
  csosn?: string;
  cst_pis?: string;
  cst_cofins?: string;
  aliquot_icms?: number;
  aliquot_pis?: number;
  aliquot_cofins?: number;
  is_fiscal?: boolean | number;
  promotional_price?: number;
  active_promotion?: {
    id: number;
    name: string;
    description: string | null;
    discount_type: string;
    discount_value: number;
    start_date: string;
    end_date: string;
  } | null;
}

export interface Promotion {
  id?: number;
  name: string;
  description: string | null;
  discount_type: 'percentage' | 'fixed_price' | 'fixed_discount';
  discount_value: number;
  start_date: string;
  end_date: string;
  status: 'active' | 'inactive';
  product_ids: number[];
  products?: Array<{ product_id: number; discount_type: 'percentage' | 'fixed_price' | 'fixed_discount' | null; discount_value: number | null }>;
  created_at?: string;
}

export interface Customer {
  id: number;
  name: string;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  debt_limit: number;
  current_debt: number;
  loyalty_points: number;
  created_at: string;
}

export interface SaleItem {
  product_id: number;
  quantity: number;
  price_unit: number;
  price_total: number;
  product_name?: string;
  unit?: string;
}

export interface Sale {
  id?: number;
  customer_id: number | null;
  total_amount: number;
  discount: number;
  final_amount: number;
  payment_method: string;
  payment_details?: any;
  amount_paid: number;
  change_given: number;
  fee_amount?: number;
  offline_uuid?: string | null;
  created_at?: string;
  items: SaleItem[];
  customer_name?: string;
}

export interface FiscalSettings {
  id?: number;
  cnpj: string;
  razao_social: string;
  inscricao_estadual: string;
  environment: number;
  state: string;
  csc_id: string;
  csc_token: string;
  has_certificate: boolean;
  default_cfop?: string;
  default_origin?: string;
  default_csosn?: string;
  default_cst_pis?: string;
  default_cst_cofins?: string;
  default_aliquot_icms?: number;
  default_aliquot_pis?: number;
  default_aliquot_cofins?: number;
}

export interface DashboardData {
  today_sales: number;
  today_count: number;
  today_profit: number;
  low_stock_count: number;
  chart_data: Array<{ sale_date: string; amount: number; cnt: number }>;
  best_sellers: Array<{ name: string; total_qty: number; total_revenue: number }>;
  low_stock_list: Array<{ name: string; stock_qty: number; min_stock: number; unit: string }>;
}

// Connection state listeners
type ConnectionListener = (isOnline: boolean) => void;
const listeners = new Set<ConnectionListener>();
let isOnline = true;
let checkIntervalId: any = null;

export const connectionService = {
  subscribe(listener: ConnectionListener) {
    listeners.add(listener);
    listener(isOnline);
    return () => {
      listeners.delete(listener);
    };
  },
  
  setOnlineStatus(status: boolean) {
    if (isOnline !== status) {
      isOnline = status;
      listeners.forEach((l) => l(isOnline));
      if (isOnline) {
        // Trigger background sync when coming online
        syncOfflineSales().catch(console.error);
      }
    }
  },

  getIsOnline() {
    return isOnline;
  },

  async checkConnection(): Promise<boolean> {
    try {
      const res = await fetch(`${API_BASE_URL}/ping`);
      if (res.ok) {
        this.setOnlineStatus(true);
        return true;
      }
    } catch (error) {
      console.warn("API de monitoramento offline:", error);
    }
    this.setOnlineStatus(false);
    return false;
  },

  startMonitoring() {
    if (checkIntervalId) return;
    this.checkConnection();
    checkIntervalId = setInterval(() => {
      this.checkConnection();
    }, 10000); // Check every 10 seconds
  },

  stopMonitoring() {
    if (checkIntervalId) {
      clearInterval(checkIntervalId);
      checkIntervalId = null;
    }
  }
};

// Start monitoring automatically on load
connectionService.startMonitoring();

// API Helper
async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error || `HTTP error! status: ${response.status}`);
    }

    // Ping succeeded if request did, make sure we mark connection as online
    connectionService.setOnlineStatus(true);
    return await response.json() as T;
  } catch (err: any) {
    // Check if network error
    if (err.name === 'TypeError' || err.message.includes('Failed to fetch')) {
      connectionService.setOnlineStatus(false);
    }
    throw err;
  }
}

// REST API Methods
export const api = {
  // Products
  async getProducts(search?: string): Promise<Product[]> {
    const query = search ? `?q=${encodeURIComponent(search)}` : '';
    return apiRequest<Product[]>(`/products${query}`);
  },

  async getProductByBarcode(barcode: string): Promise<Product> {
    return apiRequest<Product>(`/products/barcode/${barcode}`);
  },

  async createProduct(product: Omit<Product, 'id' | 'created_at'>): Promise<Product> {
    return apiRequest<Product>('/products', {
      method: 'POST',
      body: JSON.stringify(product),
    });
  },

  async updateProduct(id: number, product: Partial<Product>): Promise<Product> {
    return apiRequest<Product>(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(product),
    });
  },

  async deleteProduct(id: number, operatorName?: string): Promise<{ success: boolean; message: string }> {
    const query = operatorName ? `?operator_name=${encodeURIComponent(operatorName)}` : '';
    return apiRequest<{ success: boolean; message: string }>(`/products/${id}${query}`, {
      method: 'DELETE',
    });
  },

  async invoiceEntry(invoiceData: {
    invoice_number: string;
    supplier_name: string;
    supplier_cnpj?: string | null;
    total_amount: number;
    due_date?: string | null;
    operator_name?: string;
    schedule_payment?: boolean;
    installments?: Array<{ due_date: string; amount: number }>;
    items: Array<{
      barcode: string;
      name: string;
      quantity: number;
      price_buy: number;
      price_sell?: number;
    }>;
  }): Promise<{ success: boolean; processedItems: any[] }> {
    return apiRequest<{ success: boolean; processedItems: any[] }>('/products/invoice-entry', {
      method: 'POST',
      body: JSON.stringify(invoiceData),
    });
  },

  // Customers
  async getCustomers(search?: string): Promise<Customer[]> {
    const query = search ? `?q=${encodeURIComponent(search)}` : '';
    return apiRequest<Customer[]>(`/customers${query}`);
  },

  async createCustomer(customer: Omit<Customer, 'id' | 'created_at' | 'current_debt' | 'loyalty_points'>): Promise<Customer> {
    return apiRequest<Customer>('/customers', {
      method: 'POST',
      body: JSON.stringify(customer),
    });
  },

  async updateCustomer(id: number, customer: Partial<Customer>): Promise<Customer> {
    return apiRequest<Customer>(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(customer),
    });
  },

  async payCustomerDebt(id: number, amount: number): Promise<Customer> {
    return apiRequest<Customer>(`/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ pay_amount: amount }),
    });
  },

  async deleteCustomer(id: number): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>(`/customers/${id}`, {
      method: 'DELETE',
    });
  },

  // Sales
  async getSales(): Promise<Sale[]> {
    return apiRequest<Sale[]>('/sales');
  },

  async createSale(sale: Omit<Sale, 'id' | 'created_at'>): Promise<{ success: boolean; sale_id: number }> {
    // If connection is offline, we save sale in queue
    if (!connectionService.getIsOnline()) {
      const offlineUuid = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
      const offlineSale: Sale = {
        ...sale,
        offline_uuid: offlineUuid,
        created_at: new Date().toISOString(),
      };
      
      saveOfflineSaleLocally(offlineSale);
      return { success: true, sale_id: -1 }; // Return negative ID to indicate offline processing
    }

    try {
      return await apiRequest<{ success: boolean; sale_id: number }>('/sales', {
        method: 'POST',
        body: JSON.stringify(sale),
      });
    } catch (e: any) {
      // If request failed because the server went down during the request
      if (e.name === 'TypeError' || e.message.includes('Failed to fetch')) {
        const offlineUuid = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        const offlineSale: Sale = {
          ...sale,
          offline_uuid: offlineUuid,
          created_at: new Date().toISOString(),
        };
        saveOfflineSaleLocally(offlineSale);
        return { success: true, sale_id: -1 };
      }
      throw e;
    }
  },

  // Dashboard
  async getDashboard(): Promise<DashboardData> {
    return apiRequest<DashboardData>('/dashboard');
  },

  // Reset database
  async resetDatabase(): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/reset', {
      method: 'POST',
    });
  },

  // Authentication
  async login(username: string, password: string): Promise<{ success: boolean; user: { username: string; role: string } }> {
    if (!connectionService.getIsOnline()) {
      const hashedPassword = await hashPassword(password);
      const offlineResult = await verifyOfflineLogin(username, hashedPassword);
      if (offlineResult) {
        return offlineResult;
      }
      throw new Error("Modo offline: é necessário ter feito login online ao menos uma vez para registrar suas credenciais offline.");
    }

    const result = await apiRequest<{ success: boolean; user: { username: string; role: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    if (result.success && result.user) {
      const hashedPassword = await hashPassword(password);
      cacheOfflineCredentials(username, result.user.role, hashedPassword);
    }

    return result;
  },

  async checkManagerPassword(password: string): Promise<{ success: boolean }> {
    if (!connectionService.getIsOnline()) {
      const hashedPassword = await hashPassword(password);

      // Check cached local managers/admins first
      try {
        const cachedUsers = JSON.parse(localStorage.getItem('superpos_offline_users') || '{}');
        for (const username of Object.keys(cachedUsers)) {
          const u = cachedUsers[username];
          if ((u.role === 'manager' || u.role === 'admin') && u.hash === hashedPassword) {
            return { success: true };
          }
        }
      } catch {}

      throw new Error("Senha de gerência inválida offline. É necessário ter feito login online ao menos uma vez para habilitar a validação offline.");
    }
    return apiRequest<{ success: boolean }>('/auth/manager-check', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  },

  // Cash Session
  async getActiveCashSession(): Promise<CashSession | null> {
    if (!connectionService.getIsOnline()) {
      const local = localStorage.getItem('superpos_active_cash_session');
      return local ? JSON.parse(local) : null;
    }
    try {
      const active = await apiRequest<CashSession | null>('/cash/active');
      if (active) {
        localStorage.setItem('superpos_active_cash_session', JSON.stringify(active));
      } else {
        localStorage.removeItem('superpos_active_cash_session');
      }
      return active;
    } catch (error) {
      console.warn("Erro ao buscar sessão de caixa ativa, usando dados locais offline:", error);
      const local = localStorage.getItem('superpos_active_cash_session');
      return local ? JSON.parse(local) : null;
    }
  },

  async openCashSession(operatorName: string, initialFloat: number, pdvName?: string): Promise<CashSession> {
    const localSession: CashSession = {
      operator_name: operatorName,
      pdv_name: pdvName || 'Caixa 01',
      opened_at: new Date().toISOString(),
      initial_float: initialFloat,
      sales_cash: 0,
      sales_pix: 0,
      sales_card: 0,
      sales_fiado: 0,
      status: 'open'
    };

    if (!connectionService.getIsOnline()) {
      localStorage.setItem('superpos_active_cash_session', JSON.stringify(localSession));
      return localSession;
    }

    try {
      const session = await apiRequest<CashSession>('/cash/open', {
        method: 'POST',
        body: JSON.stringify({ operator_name: operatorName, initial_float: initialFloat, pdv_name: pdvName || 'Caixa 01' })
      });
      localStorage.setItem('superpos_active_cash_session', JSON.stringify(session));
      return session;
    } catch (error) {
      console.warn("Erro ao abrir sessão de caixa, salvando localmente offline:", error);
      localStorage.setItem('superpos_active_cash_session', JSON.stringify(localSession));
      return localSession;
    }
  },

  async closeCashSession(finalCashReported: number, finalCardReported: number, managerPassword?: string): Promise<CashSession> {
    if (!connectionService.getIsOnline()) {
      const local = localStorage.getItem('superpos_active_cash_session');
      if (!local) throw new Error("Nenhum caixa aberto localmente.");
      
      const session = JSON.parse(local) as CashSession;
      session.closed_at = new Date().toISOString();
      session.final_cash_reported = finalCashReported;
      session.final_card_reported = finalCardReported;
      session.status = 'closed';
      session.closed_by = managerPassword ? 'Autorizado' : session.operator_name;
      
      localStorage.setItem('superpos_last_closed_session', JSON.stringify(session));
      localStorage.removeItem('superpos_active_cash_session');
      return session;
    }

    const closed = await apiRequest<CashSession>('/cash/close', {
      method: 'POST',
      body: JSON.stringify({ 
        final_cash_reported: finalCashReported,
        final_card_reported: finalCardReported,
        manager_password: managerPassword
      })
    });
    
    localStorage.removeItem('superpos_active_cash_session');
    localStorage.setItem('superpos_last_closed_session', JSON.stringify(closed));
    return closed;
  },

  // GET all sessions (for admin cash-flow)
  async getCashSessions(): Promise<CashSession[]> {
    return apiRequest<CashSession[]>('/cash/sessions');
  },

  // Users Management
  async getUsers(): Promise<Array<{ id: number; username: string; role: string }>> {
    return apiRequest<Array<{ id: number; username: string; role: string }>>('/users');
  },

  async createUser(user: { username: string; password?: string; role: string }): Promise<{ id: number; username: string; role: string }> {
    return apiRequest<{ id: number; username: string; role: string }>('/users', {
      method: 'POST',
      body: JSON.stringify(user)
    });
  },

  async deleteUser(id: number): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>(`/users/${id}`, {
      method: 'DELETE'
    });
  },

  // Suppliers Management
  async getSuppliers(): Promise<Supplier[]> {
    return apiRequest<Supplier[]>('/suppliers');
  },

  async createSupplier(supplier: Omit<Supplier, 'id' | 'created_at'>): Promise<Supplier> {
    return apiRequest<Supplier>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(supplier)
    });
  },

  async deleteSupplier(id: number, operatorName?: string): Promise<{ success: boolean; message: string }> {
    const query = operatorName ? `?operator_name=${encodeURIComponent(operatorName)}` : '';
    return apiRequest<{ success: boolean; message: string }>(`/suppliers/${id}${query}`, {
      method: 'DELETE'
    });
  },

  // Accounts Payable Management
  async getPayableAccounts(): Promise<PayableAccount[]> {
    return apiRequest<PayableAccount[]>('/payable');
  },

  async createPayableAccount(account: Omit<PayableAccount, 'id' | 'status' | 'created_at' | 'paid_at' | 'supplier_name'> & { operator_name?: string }): Promise<PayableAccount> {
    return apiRequest<PayableAccount>('/payable', {
      method: 'POST',
      body: JSON.stringify(account)
    });
  },

  async updatePayableAccountStatus(id: number, status: 'paid' | 'pending', operator_name?: string): Promise<PayableAccount> {
    return apiRequest<PayableAccount>(`/payable/${id}/pay`, {
      method: 'PUT',
      body: JSON.stringify({ status, operator_name })
    });
  },

  async deletePayableAccount(id: number, operator_name?: string): Promise<{ success: boolean; message: string }> {
    const query = operator_name ? `?operator_name=${encodeURIComponent(operator_name)}` : '';
    return apiRequest<{ success: boolean; message: string }>(`/payable/${id}${query}`, {
      method: 'DELETE'
    });
  },

  // Categories & Subcategories (Mercadológico)
  async getCategories(): Promise<Category[]> {
    return apiRequest<Category[]>('/categories');
  },

  async createCategory(name: string, operator_name?: string): Promise<Category> {
    return apiRequest<Category>('/categories', {
      method: 'POST',
      body: JSON.stringify({ name, operator_name })
    });
  },

  async deleteCategory(id: number, operator_name?: string): Promise<{ success: boolean }> {
    const query = operator_name ? `?operator_name=${encodeURIComponent(operator_name)}` : '';
    return apiRequest<{ success: boolean }>(`/categories/${id}${query}`, {
      method: 'DELETE'
    });
  },

  async getSubcategories(categoryId?: number): Promise<Subcategory[]> {
    const query = categoryId ? `?category_id=${categoryId}` : '';
    return apiRequest<Subcategory[]>(`/subcategories${query}`);
  },

  async createSubcategory(categoryId: number, name: string, operator_name?: string): Promise<Subcategory> {
    return apiRequest<Subcategory>('/subcategories', {
      method: 'POST',
      body: JSON.stringify({ category_id: categoryId, name, operator_name })
    });
  },

  async deleteSubcategory(id: number, operator_name?: string): Promise<{ success: boolean }> {
    const query = operator_name ? `?operator_name=${encodeURIComponent(operator_name)}` : '';
    return apiRequest<{ success: boolean }>(`/subcategories/${id}${query}`, {
      method: 'DELETE'
    });
  },

  // Bulk Product Edit
  async bulkEditProducts(params: {
    ids: number[];
    category_id?: number | null;
    subcategory_id?: number | null;
    price_sell_adjust?: { type: 'percent' | 'fixed'; value: number };
    operator_name?: string;
  }): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/products/bulk-edit', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  // Inventory Stock Adjustments & History
  async getInventoryAdjustments(): Promise<InventoryAdjustment[]> {
    return apiRequest<InventoryAdjustment[]>('/inventory/adjustments');
  },

  async adjustInventory(params: {
    product_id: number;
    new_stock: number;
    reason: string;
    operator_name?: string;
  }): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/inventory/adjust', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  // Terminals (PDVs)
  async getTerminals(): Promise<Terminal[]> {
    return apiRequest<Terminal[]>('/terminals');
  },

  async createTerminal(name: string, operator_name?: string): Promise<Terminal> {
    return apiRequest<Terminal>('/terminals', {
      method: 'POST',
      body: JSON.stringify({ name, operator_name })
    });
  },

  async deleteTerminal(id: number, operator_name?: string): Promise<{ success: boolean; message: string }> {
    const query = operator_name ? `?operator_name=${encodeURIComponent(operator_name)}` : '';
    return apiRequest<{ success: boolean; message: string }>(`/terminals/${id}${query}`, {
      method: 'DELETE'
    });
  },

  // Roles & Permissions
  async getRoles(): Promise<Role[]> {
    return apiRequest<Role[]>('/roles');
  },

  async createRole(name: string, description?: string, operator_name?: string): Promise<Role> {
    return apiRequest<Role>('/roles', {
      method: 'POST',
      body: JSON.stringify({ name, description, operator_name })
    });
  },

  async updateRolePermissions(id: number, permissions: RolePermission[], operator_name?: string): Promise<Role> {
    return apiRequest<Role>(`/roles/${id}/permissions`, {
      method: 'PUT',
      body: JSON.stringify({ permissions, operator_name })
    });
  },

  async deleteRole(id: number, operator_name?: string): Promise<{ success: boolean; message: string }> {
    const query = operator_name ? `?operator_name=${encodeURIComponent(operator_name)}` : '';
    return apiRequest<{ success: boolean; message: string }>(`/roles/${id}${query}`, {
      method: 'DELETE'
    });
  },

  async getRolePermissions(roleName: string): Promise<RolePermission[]> {
    return apiRequest<RolePermission[]>(`/users/permissions/${roleName}`);
  },

  // System Logs
  async getSystemLogs(): Promise<SystemLog[]> {
    return apiRequest<SystemLog[]>('/logs');
  },

  async getFiscalSettings(): Promise<FiscalSettings> {
    return apiRequest<FiscalSettings>('/fiscal/settings');
  },
 
  async updateFiscalSettings(settings: FiscalSettings & {
    certificate_pfx?: string;
    certificate_password?: string;
    operator_name?: string;
  }): Promise<{ success: boolean; message: string }> {
    return apiRequest('/fiscal/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },

  async syncReceivedInvoices(cnpj: string): Promise<any[]> {
    return apiRequest('/fiscal/sync-received', {
      method: 'POST',
      body: JSON.stringify({ cnpj }),
    });
  },

  async manifestAndDownloadInvoice(cnpj: string, chave: string, type?: string): Promise<{ success: boolean; xml: string }> {
    return apiRequest('/fiscal/manifest-and-download', {
      method: 'POST',
      body: JSON.stringify({ cnpj, chave, type }),
    });
  },

  async emitNFCe(saleData: {
    sale_id: number;
    total_amount: number;
    discount: number;
    final_amount: number;
    cpf_customer?: string;
    operator_name?: string;
  }): Promise<{ success: boolean; chave: string; xml: string; protocol: string; qrCodeUrl: string }> {
    return apiRequest('/fiscal/emit-nfce', {
      method: 'POST',
      body: JSON.stringify(saleData),
    });
  },

  async getEmittedFiscalReport(filters: {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    status: string;
  }): Promise<EmittedInvoice[]> {
    const params = new URLSearchParams(filters);
    return apiRequest<EmittedInvoice[]>(`/fiscal/emitted-report?${params.toString()}`);
  },

  exportFiscalXmlsUrl(filters: {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
  }): string {
    const params = new URLSearchParams(filters);
    return `${API_BASE_URL}/fiscal/export-xmls?${params.toString()}`;
  },

  async getBestBuyDayReport(): Promise<{
    salesByWeekDay: Array<{ weekday: number; name: string; total_sales: number; count_sales: number }>;
    salesByDayOfMonth: Array<{ day: number; total_sales: number }>;
    payablesByDayOfMonth: Array<{ day: number; total_payable: number }>;
    recommendation: {
      bestWeekday: string;
      bestDayOfMonth: number;
      peakWeekday: string;
      peakDayOfMonth: number;
      heavyPayableDays: number[];
      text: string;
    };
  }> {
    return apiRequest('/reports/best-buy-day');
  },

  // Inventory Sessions (Balanço / Auditoria)
  async getInventories(): Promise<Inventory[]> {
    return apiRequest<Inventory[]>('/inventories');
  },

  async getInventoryDetails(id: number): Promise<Inventory> {
    return apiRequest<Inventory>(`/inventories/${id}`);
  },

  async createInventory(params: { name: string; operator_name: string; populate_all: boolean }): Promise<Inventory> {
    return apiRequest<Inventory>('/inventories', {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async scanOrAddInventoryItem(inventoryId: number, params: { barcode_or_sku: string; counted_qty?: number; mode: 'add' | 'set' | 'increment' }): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/inventories/${inventoryId}/items`, {
      method: 'POST',
      body: JSON.stringify(params)
    });
  },

  async updateInventoryItemQty(inventoryId: number, itemId: number, countedQty: number): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/inventories/${inventoryId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify({ counted_qty: countedQty })
    });
  },

  async deleteInventoryItem(inventoryId: number, itemId: number): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/inventories/${inventoryId}/items/${itemId}`, {
      method: 'DELETE'
    });
  },

  async finalizeInventory(id: number): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/inventories/${id}/finalize`, {
      method: 'POST'
    });
  },

  async deleteInventory(id: number): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/inventories/${id}`, {
      method: 'DELETE'
    });
  },

  // Employees (RH)
  async getEmployees(): Promise<Employee[]> {
    return apiRequest<Employee[]>('/employees');
  },
  async createEmployee(employee: Omit<Employee, 'id'>): Promise<{ success: boolean; id: number }> {
    return apiRequest<{ success: boolean; id: number }>('/employees', {
      method: 'POST',
      body: JSON.stringify(employee),
    });
  },
  async updateEmployee(id: number, employee: Partial<Employee>): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/employees/${id}`, {
      method: 'PUT',
      body: JSON.stringify(employee),
    });
  },
  async deleteEmployee(id: number): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/employees/${id}`, {
      method: 'DELETE',
    });
  },

  // Recurring Accounts
  async getRecurringAccounts(): Promise<RecurringAccount[]> {
    return apiRequest<RecurringAccount[]>('/recurring-accounts');
  },
  async createRecurringAccount(account: Omit<RecurringAccount, 'id'>): Promise<{ success: boolean; id: number }> {
    return apiRequest<{ success: boolean; id: number }>('/recurring-accounts', {
      method: 'POST',
      body: JSON.stringify(account),
    });
  },
  async updateRecurringAccount(id: number, account: Partial<RecurringAccount>): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/recurring-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(account),
    });
  },
  async deleteRecurringAccount(id: number): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/recurring-accounts/${id}`, {
      method: 'DELETE',
    });
  },
  async generateRecurringAccounts(year: number, month: number): Promise<{ success: boolean; count: number }> {
    return apiRequest<{ success: boolean; count: number }>('/recurring-accounts/generate', {
      method: 'POST',
      body: JSON.stringify({ year, month }),
    });
  },
  
  // Promotions
  async getPromotions(): Promise<Promotion[]> {
    return apiRequest<Promotion[]>('/promotions');
  },
  async createPromotion(promotion: Omit<Promotion, 'id' | 'created_at'> & { operator_name?: string }): Promise<{ success: boolean; id: number }> {
    return apiRequest<{ success: boolean; id: number }>('/promotions', {
      method: 'POST',
      body: JSON.stringify(promotion)
    });
  },
  async updatePromotion(id: number, promotion: Partial<Promotion> & { operator_name?: string }): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/promotions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(promotion)
    });
  },
  async deletePromotion(id: number, operatorName?: string): Promise<{ success: boolean }> {
    const query = operatorName ? `?operator_name=${encodeURIComponent(operatorName)}` : '';
    return apiRequest<{ success: boolean }>(`/promotions/${id}${query}`, {
      method: 'DELETE'
    });
  },

  // Backup & Restore
  async getBackupList(): Promise<any[]> {
    return apiRequest<any[]>('/backup/list');
  },
  async createBackup(operator_name?: string): Promise<{ success: boolean; filename: string }> {
    return apiRequest<{ success: boolean; filename: string }>('/backup/create', {
      method: 'POST',
      body: JSON.stringify({ operator_name }),
    });
  },
  async deleteBackup(filename: string, operator_name?: string): Promise<{ success: boolean }> {
    const query = operator_name ? `?operator_name=${encodeURIComponent(operator_name)}` : '';
    return apiRequest<{ success: boolean }>(`/backup/${filename}${query}`, {
      method: 'DELETE',
    });
  },
  async restoreBackup(filename: string, operator_name?: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>(`/backup/restore/${filename}`, {
      method: 'POST',
      body: JSON.stringify({ operator_name }),
    });
  },
  async uploadRestoreBackup(dbBase64: string, filename: string, operator_name?: string): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }>('/backup/upload-restore', {
      method: 'POST',
      body: JSON.stringify({ db_base64: dbBase64, filename, operator_name }),
    });
  },

  // AI recommendations
  async getAIRecommendations(apiKey?: string, model?: string): Promise<{ isMock: boolean; recommendations: AIRecommendation[] }> {
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['x-gemini-api-key'] = apiKey;
    }
    if (model) {
      headers['x-gemini-model'] = model;
    }
    return apiRequest<{ isMock: boolean; recommendations: AIRecommendation[] }>('/reports/ai-recommendations', {
      headers
    });
  },

  // Store Layout Mapping API methods
  async getLayoutZones(): Promise<LayoutZone[]> {
    return apiRequest<LayoutZone[]>('/layout/zones');
  },
  async createLayoutZone(zone: Omit<LayoutZone, 'id' | 'items' | 'sales_30_days'>): Promise<LayoutZone> {
    return apiRequest<LayoutZone>('/layout/zones', {
      method: 'POST',
      body: JSON.stringify(zone)
    });
  },
  async updateLayoutZone(id: number, zone: Omit<LayoutZone, 'id' | 'items' | 'sales_30_days'>): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/layout/zones/${id}`, {
      method: 'PUT',
      body: JSON.stringify(zone)
    });
  },
  async deleteLayoutZone(id: number): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/layout/zones/${id}`, {
      method: 'DELETE'
    });
  },
  async addLayoutZoneItem(zoneId: number, item: { category_id?: number | null; product_id?: number | null }): Promise<{ id: number; success: boolean }> {
    return apiRequest<{ id: number; success: boolean }>(`/layout/zones/${zoneId}/items`, {
      method: 'POST',
      body: JSON.stringify(item)
    });
  },
  async deleteLayoutZoneItem(zoneId: number, itemId: number): Promise<{ success: boolean }> {
    return apiRequest<{ success: boolean }>(`/layout/zones/${zoneId}/items/${itemId}`, {
      method: 'DELETE'
    });
  }
};

export interface EmittedInvoice {
  id: number;
  sale_id: number | null;
  chave_acesso: string | null;
  numero_nota: string | null;
  total_amount: number;
  discount: number;
  final_amount: number;
  cpf_customer: string | null;
  protocolo: string | null;
  xml_completo?: string;
  status: 'success' | 'error';
  erro_mensagem: string | null;
  created_at: string;
}

export interface Category {
  id: number;
  name: string;
}

export interface Subcategory {
  id: number;
  category_id: number;
  name: string;
}

export interface RolePermission {
  module_name: string;
  can_view: number;
  can_write: number;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions?: RolePermission[];
}

export interface SystemLog {
  id: number;
  timestamp: string;
  action_type: string;
  operator_name: string;
  details?: string | null;
}

export interface InventoryAdjustment {
  id: number;
  product_id: number;
  product_name?: string;
  barcode?: string;
  previous_stock: number;
  new_stock: number;
  reason: string;
  operator_name: string;
  created_at: string;
}

export interface AIRecommendation {
  produto_id: number | null;
  nome_produto: string;
  categoria: string;
  status: 'queda_vendas' | 'parado' | 'estoque_baixo' | 'layout_geral';
  titulo: string;
  descricao: string;
  sugestao_preco: number | null;
  tipo_acao: 'promocao' | 'compra' | 'layout' | 'outro';
}

export interface Inventory {
  id: number;
  name: string;
  status: 'draft' | 'in_progress' | 'completed';
  operator_name: string;
  created_at: string;
  completed_at?: string | null;
  items?: InventoryItem[];
}

export interface InventoryItem {
  id: number;
  inventory_id: number;
  product_id: number;
  expected_qty: number;
  counted_qty: number;
  difference: number;
  counted_at?: string | null;
  product_name?: string;
  product_barcode?: string;
  product_code?: string;
  product_unit?: string;
}

export interface CashSession {
  id?: number;
  pdv_name?: string;
  operator_name: string;
  opened_at: string;
  closed_at?: string;
  initial_float: number;
  final_cash_reported?: number;
  final_card_reported?: number;
  sales_cash: number;
  sales_pix: number;
  sales_card: number;
  sales_fiado: number;
  status: 'open' | 'closed';
  closed_by?: string;
}

export interface Terminal {
  id: number;
  name: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface Employee {
  id?: number;
  name: string;
  cpf?: string | null;
  rg?: string | null;
  phone?: string | null;
  email?: string | null;
  role: string;
  salary: number;
  admission_date: string;
  status: 'active' | 'inactive';
  documents_info?: string | null;
  admission_pdf?: string | null;
  dismissal_pdf?: string | null;
  created_at?: string;
}

export interface RecurringAccount {
  id?: number;
  description: string;
  amount: number;
  due_day: number;
  category?: string | null;
  supplier_id?: number | null;
  status: 'active' | 'inactive';
  supplier_name?: string | null;
  created_at?: string;
}

export interface Supplier {
  id?: number;
  name: string;
  cnpj?: string | null;
  phone?: string | null;
  email?: string | null;
  created_at?: string;
}

export interface PayableAccount {
  id?: number;
  supplier_id?: number | null;
  description: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid';
  paid_at?: string | null;
  supplier_name?: string | null;
  boleto_file?: string | null;
  created_at?: string;
}

// LocalStorage Offline Sales Queue Management
const OFFLINE_SALES_KEY = 'superpos_offline_sales';

export function getOfflineSales(): Sale[] {
  try {
    const data = localStorage.getItem(OFFLINE_SALES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    console.error('Error reading offline sales', e);
    return [];
  }
}

function saveOfflineSaleLocally(sale: Sale) {
  const currentSales = getOfflineSales();
  currentSales.push(sale);
  localStorage.setItem(OFFLINE_SALES_KEY, JSON.stringify(currentSales));
  
  // Deduct stock locally from localStorage if we want to reflect it
  // This is a helper for frontend UI consistency
  try {
    const cacheKey = 'superpos_local_stock_adjustments';
    const adjustments = JSON.parse(localStorage.getItem(cacheKey) || '{}');
    sale.items.forEach(item => {
      adjustments[item.product_id] = (adjustments[item.product_id] || 0) + item.quantity;
    });
    localStorage.setItem(cacheKey, JSON.stringify(adjustments));
  } catch (e) {
    console.error('Failed to update local stock cache', e);
  }
}

export async function syncOfflineSales(): Promise<{ synced: number; failed: number }> {
  const sales = getOfflineSales();
  if (sales.length === 0) return { synced: 0, failed: 0 };

  console.log(`Attempting to sync ${sales.length} offline sales...`);
  
  try {
    const result = await apiRequest<{ success: boolean; synced_count: number; errors: string[] }>('/sales/sync', {
      method: 'POST',
      body: JSON.stringify({ sales }),
    });

    if (result.success) {
      // Clear queue
      localStorage.removeItem(OFFLINE_SALES_KEY);
      // Clear local stock adjustments cache
      localStorage.removeItem('superpos_local_stock_adjustments');
      console.log(`Synced ${result.synced_count} sales successfully.`);
      return { synced: result.synced_count, failed: sales.length - result.synced_count };
    }
  } catch (e) {
    console.error('Error syncing offline sales:', e);
  }
  
  return { synced: 0, failed: sales.length };
}

export interface LayoutZoneItem {
  item_id: number;
  zone_id: number;
  product_id: number | null;
  category_id: number | null;
  product_name: string | null;
  product_barcode: string | null;
  category_name: string | null;
}

export interface LayoutZone {
  id: number;
  name: string;
  zone_type: string; // 'shelf' | 'checkout' | 'fridge' | 'bakery' | 'butcher' | 'hortifruti'
  x: number;
  y: number;
  width: number;
  height: number;
  color: string | null;
  items: LayoutZoneItem[];
  sales_30_days: number;
}
