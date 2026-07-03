import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import fs from 'node:fs';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadDotEnv() {
  try {
    const rootEnvPath = path.resolve(process.cwd(), '.env');
    const apiEnvPath = path.resolve(process.cwd(), 'apps/api/.env');
    let envPath = '';
    if (fs.existsSync(rootEnvPath)) {
      envPath = rootEnvPath;
    } else if (fs.existsSync(apiEnvPath)) {
      envPath = apiEnvPath;
    } else {
      const upEnvPath = path.resolve(process.cwd(), '../../.env');
      if (fs.existsSync(upEnvPath)) {
        envPath = upEnvPath;
      }
    }

    if (envPath) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const firstEqual = trimmed.indexOf('=');
          if (firstEqual > 0) {
            const key = trimmed.slice(0, firstEqual).trim();
            let val = trimmed.slice(firstEqual + 1).trim();
            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Env Loader] Failed to load .env file:', err);
  }
}

export interface Database {
  run(sql: string, params?: any[]): Promise<{ lastID?: number; changes?: number }>;
  all<T = any>(sql: string, params?: any[]): Promise<T[]>;
  get<T = any>(sql: string, params?: any[]): Promise<T | undefined>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

function replacePlaceholders(sql: string): string {
  let paramCount = 0;
  let inString = false;
  let escaped = false;
  let translatedSql = '';
  for (const char of sql) {
    if (char === "'" && !escaped) {
      inString = !inString;
    }
    if (char === "\\" && inString) {
      escaped = !escaped;
    } else {
      escaped = false;
    }
    
    if (char === '?' && !inString) {
      paramCount++;
      translatedSql += `$${paramCount}`;
    } else {
      translatedSql += char;
    }
  }
  return translatedSql;
}

function resolveInsertOrIgnore(sql: string): string {
  if (/INSERT OR IGNORE INTO product_barcodes/i.test(sql)) {
    return sql.replace(/INSERT OR IGNORE INTO product_barcodes/i, 'INSERT INTO product_barcodes') + ' ON CONFLICT (barcode) DO NOTHING';
  }
  if (/INSERT OR IGNORE INTO role_permissions/i.test(sql)) {
    return sql.replace(/INSERT OR IGNORE INTO role_permissions/i, 'INSERT INTO role_permissions') + ' ON CONFLICT (role_id, module_name) DO NOTHING';
  }
  if (/INSERT OR IGNORE INTO/i.test(sql)) {
    return sql.replace(/INSERT OR IGNORE INTO/i, 'INSERT INTO');
  }
  return sql;
}

export function translateSqlToPostgres(sql: string): string {
  if (!sql) return '';
  const trimmed = sql.trim();
  
  if (/^PRAGMA/i.test(trimmed)) {
    return '';
  }
  if (/sqlite_sequence/i.test(trimmed)) {
    return '';
  }

  let translatedSql = replacePlaceholders(sql);
  
  translatedSql = translatedSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
  translatedSql = translatedSql.replace(/GROUP_CONCAT\(([^)]+)\)/gi, "string_agg($1, ',')");
  translatedSql = translatedSql.replace(/\s+LIKE\s+/gi, ' ILIKE ');
  
  translatedSql = resolveInsertOrIgnore(translatedSql);

  translatedSql = translatedSql.replace(/date\('now',\s*'-7 days'\)/gi, "CURRENT_DATE - INTERVAL '7 days'");
  translatedSql = translatedSql.replace(/date\('now'\)/gi, "CURRENT_DATE");
  translatedSql = translatedSql.replace(/datetime\('now',\s*'-2 days',\s*'\+8 hours'\)/gi, "NOW() - INTERVAL '2 days' + INTERVAL '8 hours'");
  translatedSql = translatedSql.replace(/datetime\('now',\s*'-2 days'\)/gi, "NOW() - INTERVAL '2 days'");
  translatedSql = translatedSql.replace(/datetime\('now',\s*'-1 days',\s*'\+8 hours'\)/gi, "NOW() - INTERVAL '1 days' + INTERVAL '8 hours'");
  translatedSql = translatedSql.replace(/datetime\('now',\s*'-1 days'\)/gi, "NOW() - INTERVAL '1 days'");
  translatedSql = translatedSql.replace(/datetime\('now',\s*'-2 hours'\)/gi, "NOW() - INTERVAL '2 hours'");
  translatedSql = translatedSql.replace(/datetime\('now',\s*'(-?\d+)\s+(days|hours|minutes|seconds)'\)/gi, "NOW() + INTERVAL '$1 $2'");
  translatedSql = translatedSql.replace(/datetime\('now'\)/gi, "NOW()");
  translatedSql = translatedSql.replace(/\bTIMESTAMP\b/gi, 'TIMESTAMPTZ');
  translatedSql = translatedSql.replace(/datetime\(([^,]+),\s*'localtime'\)/gi, "($1)::timestamptz");
  translatedSql = translatedSql.replace(/datetime\(([^)]+)\)/gi, "($1)::timestamptz");

  translatedSql = translatedSql.replace(/date\(([^)]+)\)/gi, "($1)::date");

  // Translate SQLite strftime to PostgreSQL EXTRACT
  translatedSql = translatedSql.replace(/strftime\('%w',\s*([^)]+)\)/gi, "EXTRACT(DOW FROM ($1)::timestamptz)");
  translatedSql = translatedSql.replace(/strftime\('%d',\s*([^)]+)\)/gi, "EXTRACT(DAY FROM ($1)::timestamptz)");

  return translatedSql;
}

class PostgresDbWrapper implements Database {
  private readonly client: pg.Client;
  constructor(client: pg.Client) {
    this.client = client;
  }

  async run(sql: string, params: any[] = []): Promise<{ lastID?: number; changes?: number }> {
    const pgSql = translateSqlToPostgres(sql);
    if (!pgSql) return {};
    
    let querySql = pgSql;
    const isInsert = /^insert\s+/i.test(querySql.trim());
    const hasReturning = /returning/i.test(querySql);

    if (isInsert && !hasReturning) {
      try {
        const res = await this.client.query(querySql + ' RETURNING id', params);
        const lastID = res.rows[0]?.id;
        const changes = res.rowCount || 0;
        return { lastID, changes };
      } catch (err: any) {
        if (err.message.includes('column "id" does not exist') || err.message.includes('não existe a coluna "id"')) {
          const res = await this.client.query(querySql, params);
          const changes = res.rowCount || 0;
          return { changes };
        }
        throw err;
      }
    }
    
    const res = await this.client.query(querySql, params);
    const changes = res.rowCount || 0;
    return { changes };
  }

  async all<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const pgSql = translateSqlToPostgres(sql);
    if (!pgSql) return [];
    const res = await this.client.query(pgSql, params);
    return res.rows as T[];
  }

  async get<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    const pgSql = translateSqlToPostgres(sql);
    if (!pgSql) return undefined;
    const res = await this.client.query(pgSql, params);
    return res.rows[0] as T | undefined;
  }

  async exec(sql: string): Promise<void> {
    const pgSql = translateSqlToPostgres(sql);
    if (!pgSql) return;
    await this.client.query(pgSql);
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  loadDotEnv();
  if (dbInstance) return dbInstance;

  let client: pg.Client;

  if (process.env.DATABASE_URL) {
    console.log("Connecting to PostgreSQL database using DATABASE_URL...");
    client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false }
    });
  } else if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
    console.log("Connecting to PostgreSQL database using individual credentials...");
    const host = process.env.PGHOST;
    client = new pg.Client({
      host: host,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port: process.env.PGPORT ? Number.parseInt(process.env.PGPORT, 10) : 5432,
      ssl: host.includes('localhost') || host.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false }
    });
  } else {
    throw new Error(
      "Configuração de banco de dados ausente. Defina a variável de ambiente DATABASE_URL ou as credenciais individuais (PGHOST, PGUSER, PGPASSWORD, PGDATABASE)."
    );
  }

  await client.connect();
  dbInstance = new PostgresDbWrapper(client);
  return dbInstance;
}

export async function resetDbConnection(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}

async function criarTabelas(db: Database): Promise<void> {
  // 0. Categories & Subcategories Tables (Mercadológico)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      date TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS subcategories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE(category_id, name)
    )
  `);

  // 1. Products Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE,
      barcode TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      category_id INTEGER,
      subcategory_id INTEGER,
      price_buy REAL NOT NULL,
      price_sell REAL NOT NULL,
      stock_qty REAL NOT NULL,
      min_stock REAL DEFAULT 0,
      unit TEXT DEFAULT 'un',
      ncm TEXT DEFAULT '00000000',
      cest TEXT DEFAULT '',
      cfop TEXT DEFAULT '5102',
      origin TEXT DEFAULT '0',
      csosn TEXT DEFAULT '102',
      cst_pis TEXT DEFAULT '49',
      cst_cofins TEXT DEFAULT '49',
      aliquot_icms REAL DEFAULT 18.0,
      aliquot_pis REAL DEFAULT 0.0,
      aliquot_cofins REAL DEFAULT 0.0,
      is_fiscal INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(category_id) REFERENCES categories(id),
      FOREIGN KEY(subcategory_id) REFERENCES subcategories(id)
    )
  `);

  // 2. Customers Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cpf TEXT UNIQUE,
      email TEXT,
      phone TEXT,
      debt_limit REAL DEFAULT 0.0,
      current_debt REAL DEFAULT 0.0,
      loyalty_points INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Sales Table (with offline sync tracking)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      total_amount REAL NOT NULL,
      discount REAL DEFAULT 0.0,
      final_amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_details TEXT,
      amount_paid REAL,
      change_given REAL,
      fee_amount REAL DEFAULT 0.0,
      offline_uuid TEXT UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(customer_id) REFERENCES customers(id)
    )
  `);

  // 4. Sale Items Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL,
      price_unit REAL NOT NULL,
      price_total REAL NOT NULL,
      FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);

  // 5. Users Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL
    )
  `);

  // 6. Cash Sessions Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS cash_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pdv_name TEXT DEFAULT 'Caixa 01',
      operator_name TEXT NOT NULL,
      opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP,
      initial_float REAL NOT NULL,
      final_cash_reported REAL,
      final_card_reported REAL,
      sales_cash REAL DEFAULT 0.0,
      sales_pix REAL DEFAULT 0.0,
      sales_card REAL DEFAULT 0.0,
      sales_fiado REAL DEFAULT 0.0,
      status TEXT DEFAULT 'open',
      closed_by TEXT
    )
  `);

  // 6.5 Terminals Table (Caixas/PDVs configuráveis)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS terminals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 7. Suppliers Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cnpj TEXT,
      phone TEXT,
      email TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 8. Accounts Payable Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS accounts_payable (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      paid_at TIMESTAMP,
      boleto_file TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    )
  `);

  // 9. System Logs Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      action_type TEXT NOT NULL,
      operator_name TEXT NOT NULL,
      details TEXT
    )
  `);

  // 10. Inventory Adjustments (Balanço/Inventário)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_adjustments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      previous_stock REAL NOT NULL,
      new_stock REAL NOT NULL,
      reason TEXT NOT NULL,
      operator_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);

  // 10.5. Inventory Sessions (Controle de Auditoria e Balanço de Estoque)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS inventories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      status TEXT DEFAULT 'draft',
      operator_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      expected_qty REAL NOT NULL,
      counted_qty REAL DEFAULT 0.0,
      difference REAL DEFAULT 0.0,
      counted_at TIMESTAMP,
      FOREIGN KEY(inventory_id) REFERENCES inventories(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(inventory_id, product_id)
    )
  `);

  // 11. Roles Table (Cargos)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT
    )
  `);

  // 12. Role Permissions Table (Permissões por módulo)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role_id INTEGER NOT NULL,
      module_name TEXT NOT NULL,
      can_view INTEGER DEFAULT 0,
      can_write INTEGER DEFAULT 0,
      FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
      UNIQUE(role_id, module_name)
    )
  `);

  // 13. Fiscal Settings Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS fiscal_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      default_aliquot_icms REAL DEFAULT 18.0,
      default_aliquot_pis REAL DEFAULT 0.0,
      default_aliquot_cofins REAL DEFAULT 0.0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 14. Received Invoices Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS received_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chave_acesso TEXT UNIQUE NOT NULL,
      cnpj_emitente TEXT NOT NULL,
      nome_emitente TEXT NOT NULL,
      numero_nota TEXT NOT NULL,
      valor_total REAL NOT NULL,
      data_emissao TEXT NOT NULL,
      status_manifesto TEXT DEFAULT 'none',
      xml_completo TEXT,
      status_estoque TEXT DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 15. Emitted Invoices / Fiscal Logs Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS emitted_invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER,
      chave_acesso TEXT UNIQUE,
      numero_nota TEXT,
      total_amount REAL,
      discount REAL,
      final_amount REAL,
      cpf_customer TEXT,
      protocolo TEXT,
      xml_completo TEXT,
      status TEXT NOT NULL,
      erro_mensagem TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 16. Employees Table (RH)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cpf TEXT UNIQUE,
      rg TEXT,
      phone TEXT,
      email TEXT,
      role TEXT NOT NULL,
      salary REAL NOT NULL,
      admission_date TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      documents_info TEXT,
      admission_pdf TEXT,
      dismissal_pdf TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 17. Recurring Accounts Table (Financeiro Recorrente)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS recurring_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      due_day INTEGER NOT NULL,
      category TEXT,
      supplier_id INTEGER,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(supplier_id) REFERENCES suppliers(id)
    )
  `);

  // 18. Promotions Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      discount_type TEXT NOT NULL,
      discount_value REAL NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS promotion_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promotion_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      discount_type TEXT,
      discount_value REAL,
      FOREIGN KEY(promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
      UNIQUE(promotion_id, product_id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS product_barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      barcode TEXT UNIQUE NOT NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // 19. Layout Zones Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS layout_zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      zone_type TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      color TEXT
    )
  `);

  // 20. Layout Zone Items Table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS layout_zone_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zone_id INTEGER NOT NULL,
      category_id INTEGER,
      product_id INTEGER,
      FOREIGN KEY(zone_id) REFERENCES layout_zones(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES categories(id) ON DELETE SET NULL,
      FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE SET NULL
    )
  `);
}

async function executarMigracoes(db: Database, execSafe: (sql: string) => Promise<void>): Promise<void> {
  await execSafe("ALTER TABLE promotion_products ADD COLUMN discount_type TEXT");
  await execSafe("ALTER TABLE promotion_products ADD COLUMN discount_value REAL");

  // --- SAFE ALTERS FOR EXISTING DATABASES ---
  await execSafe("ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id)");
  await execSafe("ALTER TABLE products ADD COLUMN subcategory_id INTEGER REFERENCES subcategories(id)");
  await execSafe("ALTER TABLE products ADD COLUMN code TEXT");
  await execSafe("CREATE UNIQUE INDEX IF NOT EXISTS idx_products_code ON products(code)");

  try {
    await db.exec("UPDATE products SET code = REPLACE(code, 'P', '') WHERE code LIKE 'P%'");
    await db.exec("UPDATE products SET code = CAST(id AS TEXT) WHERE code IS NULL OR code = ''");
  } catch (error_: any) {
    console.debug(`[Migração] Erro ao atualizar códigos de produto: ${error_.message}`);
  }

  await execSafe("INSERT OR IGNORE INTO product_barcodes (product_id, barcode) SELECT id, barcode FROM products WHERE barcode IS NOT NULL AND barcode != ''");
  await execSafe("ALTER TABLE sales ADD COLUMN payment_details TEXT");
  await execSafe("ALTER TABLE sales ADD COLUMN fee_amount REAL DEFAULT 0.0");
  await execSafe("ALTER TABLE accounts_payable ADD COLUMN boleto_file TEXT");

  // Product Fiscal Alters
  await execSafe("ALTER TABLE products ADD COLUMN ncm TEXT DEFAULT '00000000'");
  await execSafe("ALTER TABLE products ADD COLUMN cest TEXT DEFAULT ''");
  await execSafe("ALTER TABLE products ADD COLUMN cfop TEXT DEFAULT '5102'");
  await execSafe("ALTER TABLE products ADD COLUMN origin TEXT DEFAULT '0'");
  await execSafe("ALTER TABLE products ADD COLUMN csosn TEXT DEFAULT '102'");
  await execSafe("ALTER TABLE products ADD COLUMN cst_pis TEXT DEFAULT '49'");
  await execSafe("ALTER TABLE products ADD COLUMN cst_cofins TEXT DEFAULT '49'");
  await execSafe("ALTER TABLE products ADD COLUMN aliquot_icms REAL DEFAULT 18.0");
  await execSafe("ALTER TABLE products ADD COLUMN aliquot_pis REAL DEFAULT 0.0");
  await execSafe("ALTER TABLE products ADD COLUMN aliquot_cofins REAL DEFAULT 0.0");
  await execSafe("ALTER TABLE products ADD COLUMN is_fiscal INTEGER DEFAULT 1");
  await execSafe("ALTER TABLE cash_sessions ADD COLUMN final_card_reported REAL");
  await execSafe("ALTER TABLE cash_sessions ADD COLUMN closed_by TEXT");

  // Fiscal Settings Default Alters
  await execSafe("ALTER TABLE fiscal_settings ADD COLUMN default_cfop TEXT DEFAULT '5102'");
  await execSafe("ALTER TABLE fiscal_settings ADD COLUMN default_origin TEXT DEFAULT '0'");
  await execSafe("ALTER TABLE fiscal_settings ADD COLUMN default_csosn TEXT DEFAULT '102'");
  await execSafe("ALTER TABLE fiscal_settings ADD COLUMN default_cst_pis TEXT DEFAULT '49'");
  await execSafe("ALTER TABLE fiscal_settings ADD COLUMN default_cst_cofins TEXT DEFAULT '49'");
  await execSafe("ALTER TABLE fiscal_settings ADD COLUMN default_aliquot_icms REAL DEFAULT 18.0");
  await execSafe("ALTER TABLE fiscal_settings ADD COLUMN default_aliquot_pis REAL DEFAULT 0.0");
  await execSafe("ALTER TABLE fiscal_settings ADD COLUMN default_aliquot_cofins REAL DEFAULT 0.0");
  await execSafe("ALTER TABLE employees ADD COLUMN admission_pdf TEXT");
  await execSafe("ALTER TABLE employees ADD COLUMN dismissal_pdf TEXT");
}

function obterAcessoModulo(roleName: string, moduleName: string): number {
  if (roleName === 'admin') return 1;
  if (roleName === 'manager') return moduleName === 'users' ? 0 : 1;
  if (roleName === 'cashier') return moduleName === 'pos' ? 1 : 0;
  return 0;
}

async function semearCargosEPermissoesIniciais(db: Database): Promise<void> {
  const rolesCount = await db.get<{ count: number }>("SELECT COUNT(*) as count FROM roles");
  if (rolesCount?.count === 0) {
    const adminRoleResult = await db.run("INSERT INTO roles (name, description) VALUES ('admin', 'Super Administrador do Sistema')");
    const managerRoleResult = await db.run("INSERT INTO roles (name, description) VALUES ('manager', 'Gerente de Loja')");
    const cashierRoleResult = await db.run("INSERT INTO roles (name, description) VALUES ('cashier', 'Operador de Caixa')");

    const modules = [
      'pos', 'dashboard', 'products', 'categories', 'adjustments', 'logs',
      'customers', 'payable', 'cash_sessions', 'sales', 'terminals', 'users',
      'employees', 'promotions', 'fiscal', 'invoice', 'inventory'
    ];

    for (const mod of modules) {
      await db.run("INSERT INTO role_permissions (role_id, module_name, can_view, can_write) VALUES (?, ?, 1, 1)", [adminRoleResult.lastID, mod]);

      const managerAccess = mod === 'users' ? 0 : 1;
      await db.run("INSERT INTO role_permissions (role_id, module_name, can_view, can_write) VALUES (?, ?, ?, ?)", [
        managerRoleResult.lastID, mod, managerAccess, managerAccess
      ]);

      const cashierAccess = mod === 'pos' ? 1 : 0;
      await db.run("INSERT INTO role_permissions (role_id, module_name, can_view, can_write) VALUES (?, ?, ?, ?)", [
        cashierRoleResult.lastID, mod, cashierAccess, cashierAccess
      ]);
    }
  }
}

async function migrarModuloParaRole(db: Database, role: { id: number; name: string }, mod: string): Promise<void> {
  const exists = await db.get(
    "SELECT id FROM role_permissions WHERE role_id = ? AND module_name = ?",
    [role.id, mod]
  );
  if (!exists) {
    const hasAccess = obterAcessoModulo(role.name, mod);
    await db.run(
      "INSERT INTO role_permissions (role_id, module_name, can_view, can_write) VALUES (?, ?, ?, ?)",
      [role.id, mod, hasAccess, hasAccess]
    );
  }
}

async function migrarPermissoesFaltantes(db: Database): Promise<void> {
  try {
    const existingRoles = await db.all("SELECT id, name FROM roles");
    const allModules = [
      'pos', 'dashboard', 'products', 'categories', 'adjustments', 'logs',
      'customers', 'payable', 'cash_sessions', 'sales', 'terminals', 'users',
      'employees', 'promotions', 'fiscal', 'invoice', 'inventory'
    ];

    for (const role of existingRoles) {
      for (const mod of allModules) {
        await migrarModuloParaRole(db, role, mod);
      }
    }
  } catch (error_: any) {
    console.error("Erro na migração de role_permissions:", error_);
  }
}

async function semearUsuariosPadrao(db: Database): Promise<void> {
  const adminExists = await db.get("SELECT id FROM users WHERE username = 'admin'");
  if (!adminExists) {
    await db.run("INSERT INTO users (username, password, role) VALUES ('admin', 'admin', 'admin')");
  }
}

async function semearUsuariosEPermissoes(db: Database): Promise<void> {
  await semearCargosEPermissoesIniciais(db);
  await migrarPermissoesFaltantes(db);
  await semearUsuariosPadrao(db);
}

export async function initDb(): Promise<void> {
  const db = await getDb();

  const execSafe = async (sql: string) => {
    try {
      await db.exec(sql);
    } catch (error_: any) {
      console.debug(`[Migração] Ignorado erro esperado: ${error_.message}`);
    }
  };

  await criarTabelas(db);
  await executarMigracoes(db, execSafe);
  await semearUsuariosEPermissoes(db);
  await alterTablesToTimestamptz(db);

  console.log("PostgreSQL database initialized successfully.");
}

const DB_FILE = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(process.cwd(), 'database.db');

const TABLES_TO_SYNC = [
  'categories',
  'subcategories',
  'products',
  'product_barcodes',
  'customers',
  'sales',
  'sale_items',
  'users',
  'roles',
  'role_permissions',
  'cash_sessions',
  'terminals',
  'suppliers',
  'accounts_payable',
  'system_logs',
  'inventory_adjustments',
  'inventories',
  'inventory_items',
  'fiscal_settings',
  'received_invoices',
  'emitted_invoices',
  'employees',
  'recurring_accounts',
  'promotions',
  'promotion_products',
  'layout_zones',
  'layout_zone_items'
];

async function alterTablesToTimestamptz(db: Database): Promise<void> {
  const colsToAlter = [
    { table: 'customers', col: 'created_at' },
    { table: 'sales', col: 'created_at' },
    { table: 'cash_sessions', col: 'opened_at' },
    { table: 'cash_sessions', col: 'closed_at' },
    { table: 'terminals', col: 'created_at' },
    { table: 'suppliers', col: 'created_at' },
    { table: 'accounts_payable', col: 'paid_at' },
    { table: 'accounts_payable', col: 'created_at' },
    { table: 'system_logs', col: 'timestamp' },
    { table: 'inventory_adjustments', col: 'created_at' },
    { table: 'inventories', col: 'created_at' },
    { table: 'inventories', col: 'completed_at' },
    { table: 'inventory_items', col: 'counted_at' },
    { table: 'fiscal_settings', col: 'created_at' },
    { table: 'received_invoices', col: 'created_at' },
    { table: 'emitted_invoices', col: 'created_at' },
    { table: 'employees', col: 'created_at' },
    { table: 'recurring_accounts', col: 'created_at' },
    { table: 'promotions', col: 'created_at' }
  ];
  for (const c of colsToAlter) {
    try {
      await db.exec(`ALTER TABLE "${c.table}" ALTER COLUMN "${c.col}" TYPE TIMESTAMPTZ`);
    } catch (e: any) {
      // Ignore if column is already timestamptz or table/column doesn't exist
    }
  }
}

export async function syncPgToSqlite(): Promise<void> {
  const pgDb = await getDb();
  
  if (fs.existsSync(DB_FILE)) {
    fs.unlinkSync(DB_FILE);
  }
  
  const sqliteDb = await open({
    filename: DB_FILE,
    driver: sqlite3.Database
  });
  
  try {
    await criarTabelas(sqliteDb as any);
    
    for (const table of TABLES_TO_SYNC) {
      const rows = await pgDb.all(`SELECT * FROM "${table}"`);
      if (rows.length === 0) continue;
      
      const keys = Object.keys(rows[0]);
      const columns = keys.map(k => `"${k}"`).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`;
      
      for (const row of rows) {
        const values = keys.map(k => {
          const val = row[k];
          if (val instanceof Date) {
            return val.toISOString();
          }
          if (typeof val === 'boolean') {
            return val ? 1 : 0;
          }
          return val;
        });
        await sqliteDb.run(sql, values);
      }
    }
  } finally {
    await sqliteDb.close();
  }
}

export async function syncSqliteToPg(sqliteFilePath: string): Promise<void> {
  const pgDb = await getDb();
  
  const sqliteDb = await open({
    filename: sqliteFilePath,
    driver: sqlite3.Database
  });
  
  try {
    await pgDb.exec('SET session_replication_role = "replica"');
    
    for (const table of TABLES_TO_SYNC) {
      await pgDb.exec(`TRUNCATE TABLE "${table}" CASCADE`);
    }
    
    for (const table of TABLES_TO_SYNC) {
      const rows = await sqliteDb.all(`SELECT * FROM "${table}"`);
      if (rows.length === 0) continue;
      
      const keys = Object.keys(rows[0]);
      const columns = keys.map(k => `"${k}"`).join(', ');
      const placeholders = keys.map(() => '?').join(', ');
      const sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`;
      
      for (const row of rows) {
        const values = keys.map(k => {
          const val = row[k];
          if (typeof val === 'boolean') {
            return val ? 1 : 0;
          }
          return val;
        });
        await pgDb.run(sql, values);
      }
    }
    
    for (const table of TABLES_TO_SYNC) {
      try {
        await pgDb.exec(`
          SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id), 1)) FROM "${table}"
        `);
      } catch (err) {
        // Ignore if table has no serial sequence
      }
    }
  } finally {
    await pgDb.exec('SET session_replication_role = "origin"');
    await sqliteDb.close();
  }
}
