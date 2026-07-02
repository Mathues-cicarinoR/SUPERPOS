-- SCHEMA DE CRIAÇÃO DO BANCO DE DADOS POSTGRESQL (SUPERPOS)
-- Este script cria todas as tabelas necessárias para o sistema no PostgreSQL.

-- 0. Tabela de Categorias e Subcategorias
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  date TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subcategories (
  id SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE(category_id, name)
);

-- 1. Tabela de Produtos
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE,
  barcode TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id INTEGER REFERENCES subcategories(id) ON DELETE SET NULL,
  price_buy DOUBLE PRECISION NOT NULL,
  price_sell DOUBLE PRECISION NOT NULL,
  stock_qty DOUBLE PRECISION NOT NULL,
  min_stock DOUBLE PRECISION DEFAULT 0.0,
  unit TEXT DEFAULT 'un',
  ncm TEXT DEFAULT '00000000',
  cest TEXT DEFAULT '',
  cfop TEXT DEFAULT '5102',
  origin TEXT DEFAULT '0',
  csosn TEXT DEFAULT '102',
  cst_pis TEXT DEFAULT '49',
  cst_cofins TEXT DEFAULT '49',
  aliquot_icms DOUBLE PRECISION DEFAULT 18.0,
  aliquot_pis DOUBLE PRECISION DEFAULT 0.0,
  aliquot_cofins DOUBLE PRECISION DEFAULT 0.0,
  is_fiscal INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabela de Clientes
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  debt_limit DOUBLE PRECISION DEFAULT 0.0,
  current_debt DOUBLE PRECISION DEFAULT 0.0,
  loyalty_points INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabela de Vendas
CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  total_amount DOUBLE PRECISION NOT NULL,
  discount DOUBLE PRECISION DEFAULT 0.0,
  final_amount DOUBLE PRECISION NOT NULL,
  payment_method TEXT NOT NULL,
  payment_details TEXT,
  amount_paid DOUBLE PRECISION,
  change_given DOUBLE PRECISION,
  fee_amount DOUBLE PRECISION DEFAULT 0.0,
  offline_uuid TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Itens da Venda
CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity DOUBLE PRECISION NOT NULL,
  price_unit DOUBLE PRECISION NOT NULL,
  price_total DOUBLE PRECISION NOT NULL
);

-- 5. Usuários
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL
);

-- 6. Sessões de Caixa (Abertura/Fechamento)
CREATE TABLE IF NOT EXISTS cash_sessions (
  id SERIAL PRIMARY KEY,
  pdv_name TEXT DEFAULT 'Caixa 01',
  operator_name TEXT NOT NULL,
  opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  initial_float DOUBLE PRECISION NOT NULL,
  final_cash_reported DOUBLE PRECISION,
  final_card_reported DOUBLE PRECISION,
  sales_cash DOUBLE PRECISION DEFAULT 0.0,
  sales_pix DOUBLE PRECISION DEFAULT 0.0,
  sales_card DOUBLE PRECISION DEFAULT 0.0,
  sales_fiado DOUBLE PRECISION DEFAULT 0.0,
  status TEXT DEFAULT 'open',
  closed_by TEXT
);

-- 6.5 Terminais (Caixas/PDVs configuráveis)
CREATE TABLE IF NOT EXISTS terminals (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Fornecedores
CREATE TABLE IF NOT EXISTS suppliers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cnpj TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Contas a Pagar
CREATE TABLE IF NOT EXISTS accounts_payable (
  id SERIAL PRIMARY KEY,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMP,
  boleto_file TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Logs de Auditoria do Sistema
CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  action_type TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  details TEXT
);

-- 10. Ajustes Avulsos de Estoque
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  previous_stock DOUBLE PRECISION NOT NULL,
  new_stock DOUBLE PRECISION NOT NULL,
  reason TEXT NOT NULL,
  operator_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10.5. Sessões de Auditoria de Inventário (Balanço Completo)
CREATE TABLE IF NOT EXISTS inventories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  operator_name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id SERIAL PRIMARY KEY,
  inventory_id INTEGER NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  expected_qty DOUBLE PRECISION NOT NULL,
  counted_qty DOUBLE PRECISION DEFAULT 0.0,
  difference DOUBLE PRECISION DEFAULT 0.0,
  counted_at TIMESTAMP,
  UNIQUE(inventory_id, product_id)
);

-- 11. Cargos (Roles)
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  description TEXT
);

-- 12. Permissões por Cargo
CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_name TEXT NOT NULL,
  can_view INTEGER DEFAULT 0,
  can_write INTEGER DEFAULT 0,
  UNIQUE(role_id, module_name)
);

-- 13. Configurações Fiscais de Emitente
CREATE TABLE IF NOT EXISTS fiscal_settings (
  id SERIAL PRIMARY KEY,
  cnpj TEXT UNIQUE NOT NULL,
  razao_social TEXT NOT NULL,
  inscricao_estadual TEXT NOT NULL,
  environment INTEGER DEFAULT 2,
  state TEXT DEFAULT 'PE',
  csc_id TEXT,
  csc_token TEXT,
  certificate_pfx TEXT,
  certificate_password TEXT,
  last_nsu TEXT DEFAULT '0',
  default_cfop TEXT DEFAULT '5102',
  default_origin TEXT DEFAULT '0',
  default_csosn TEXT DEFAULT '102',
  default_cst_pis TEXT DEFAULT '49',
  default_cst_cofins TEXT DEFAULT '49',
  default_aliquot_icms DOUBLE PRECISION DEFAULT 18.0,
  default_aliquot_pis DOUBLE PRECISION DEFAULT 0.0,
  default_aliquot_cofins DOUBLE PRECISION DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. Notas Fiscais Recebidas (Entrada via XML)
CREATE TABLE IF NOT EXISTS received_invoices (
  id SERIAL PRIMARY KEY,
  chave_acesso TEXT UNIQUE NOT NULL,
  cnpj_emitente TEXT NOT NULL,
  nome_emitente TEXT NOT NULL,
  numero_nota TEXT NOT NULL,
  valor_total DOUBLE PRECISION NOT NULL,
  data_emissao TEXT NOT NULL,
  status_manifesto TEXT DEFAULT 'none',
  xml_completo TEXT,
  status_estoque TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. Notas Fiscais Emitidas (NFCe/NFe)
CREATE TABLE IF NOT EXISTS emitted_invoices (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
  chave_acesso TEXT UNIQUE,
  numero_nota TEXT,
  total_amount DOUBLE PRECISION,
  discount DOUBLE PRECISION,
  final_amount DOUBLE PRECISION,
  cpf_customer TEXT,
  protocolo TEXT,
  xml_completo TEXT,
  status TEXT NOT NULL,
  erro_mensagem TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 16. Funcionários (RH)
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT UNIQUE,
  rg TEXT,
  phone TEXT,
  email TEXT,
  role TEXT NOT NULL,
  salary DOUBLE PRECISION NOT NULL,
  admission_date TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  documents_info TEXT,
  admission_pdf TEXT,
  dismissal_pdf TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 17. Contas Recorrentes
CREATE TABLE IF NOT EXISTS recurring_accounts (
  id SERIAL PRIMARY KEY,
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  due_day INTEGER NOT NULL,
  category TEXT,
  supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 18. Promoções
CREATE TABLE IF NOT EXISTS promotions (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  discount_type TEXT NOT NULL,
  discount_value DOUBLE PRECISION NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS promotion_products (
  id SERIAL PRIMARY KEY,
  promotion_id INTEGER NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  discount_type TEXT,
  discount_value DOUBLE PRECISION,
  UNIQUE(promotion_id, product_id)
);

CREATE TABLE IF NOT EXISTS product_barcodes (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  barcode TEXT UNIQUE NOT NULL
);

-- 19. Zonas do Layout da Loja
CREATE TABLE IF NOT EXISTS layout_zones (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  color TEXT
);

-- 20. Itens Vinculados às Zonas
CREATE TABLE IF NOT EXISTS layout_zone_items (
  id SERIAL PRIMARY KEY,
  zone_id INTEGER NOT NULL REFERENCES layout_zones(id) ON DELETE CASCADE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL
);
