import { getDb } from './db.js';

function obterAcessoModulo(roleName: string, moduleName: string): number {
  if (roleName === 'admin') return 1;
  if (roleName === 'manager') return moduleName === 'users' ? 0 : 1;
  if (roleName === 'cashier') return moduleName === 'pos' ? 1 : 0;
  return 0;
}

async function wipeDatabase(db: any) {
  const tables = [
    'categories', 'subcategories', 'terminals', 'roles', 'role_permissions',
    'users', 'suppliers', 'accounts_payable', 'products', 'customers',
    'employees', 'recurring_accounts', 'sales', 'sale_items', 'cash_sessions',
    'system_logs', 'adjustments', 'promotions', 'promotion_products',
    'fiscal_settings', 'nfe_entries', 'nfe_items', 'inventory_sessions',
    'inventory_items'
  ];

  const isPostgres = !!(process.env.DATABASE_URL || process.env.PGHOST);

  for (const table of tables) {
    try {
      if (isPostgres) {
        await db.run(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
      } else {
        await db.run(`DELETE FROM ${table}`);
      }
    } catch (e: any) {
      console.log(`Table ${table} might not exist or failed to clear: ${e.message}`);
    }
  }

  try {
    if (!isPostgres) {
      await db.run("DELETE FROM sqlite_sequence");
    }
  } catch (e: any) {
    console.warn("Could not delete from sqlite_sequence:", e.message);
  }

  console.log("Database cleared successfully.");
}

async function seedRolesAndPermissions(db: any) {
  console.log("Seeding roles and permissions...");
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
  }

  for (const mod of modules) {
    const hasAccess = mod !== 'users';
    await db.run("INSERT INTO role_permissions (role_id, module_name, can_view, can_write) VALUES (?, ?, ?, ?)", [
      managerRoleResult.lastID, mod, hasAccess ? 1 : 0, hasAccess ? 1 : 0
    ]);
  }

  for (const mod of modules) {
    const hasAccess = mod === 'pos';
    await db.run("INSERT INTO role_permissions (role_id, module_name, can_view, can_write) VALUES (?, ?, ?, ?)", [
      cashierRoleResult.lastID, mod, hasAccess ? 1 : 0, hasAccess ? 1 : 0
    ]);
  }
}

async function seedUsers(db: any) {
  console.log("Seeding users...");
  await db.run("INSERT INTO users (username, password, role) VALUES ('admin', 'admin', 'admin')");
  await db.run("INSERT INTO users (username, password, role) VALUES ('gerente', 'gerente', 'manager')");
  await db.run("INSERT INTO users (username, password, role) VALUES ('operador1', '1234', 'cashier')");
}

async function seedCategoriesAndSubcategories(db: any) {
  console.log("Seeding categories and subcategories...");
  const defaultCats = ['Alimentos', 'Bebidas', 'Limpeza', 'Higiene'];
  for (const catName of defaultCats) {
    await db.run("INSERT INTO categories (name) VALUES (?)", [catName]);
  }

  await db.run("INSERT INTO subcategories (category_id, name) VALUES (1, 'Grãos')");
  await db.run("INSERT INTO subcategories (category_id, name) VALUES (1, 'Doces')");
  await db.run("INSERT INTO subcategories (category_id, name) VALUES (1, 'Matinais')");
  await db.run("INSERT INTO subcategories (category_id, name) VALUES (2, 'Alcoólicas')");
  await db.run("INSERT INTO subcategories (category_id, name) VALUES (2, 'Não Alcoólicas')");
  await db.run("INSERT INTO subcategories (category_id, name) VALUES (3, 'Detergentes')");
  await db.run("INSERT INTO subcategories (category_id, name) VALUES (3, 'Lavanderia')");
  await db.run("INSERT INTO subcategories (category_id, name) VALUES (4, 'Cuidados Pessoais')");
  await db.run("INSERT INTO subcategories (category_id, name) VALUES (4, 'Cabelos')");
}

async function seedTerminalsSuppliersAndPayable(db: any) {
  console.log("Seeding terminals...");
  await db.run("INSERT INTO terminals (name) VALUES ('Caixa 01')");
  await db.run("INSERT INTO terminals (name) VALUES ('Caixa 02')");

  console.log("Seeding suppliers...");
  await db.run("INSERT INTO suppliers (name, cnpj, phone, email) VALUES ('Distribuidora de Alimentos Alfa', '12.345.678/0001-90', '(11) 98765-4321', 'comercial@alfa.com')");
  await db.run("INSERT INTO suppliers (name, cnpj, phone, email) VALUES ('Distribuidora de Bebidas Geladas', '98.765.432/0001-10', '(21) 99999-8888', 'contato@geladas.com')");
  await db.run("INSERT INTO suppliers (name, cnpj, phone, email) VALUES ('Higiene & Cia Ltda', '45.678.901/0001-23', '(31) 3456-7890', 'financeiro@higiene.com')");

  console.log("Seeding accounts payable...");
  await db.run("INSERT INTO accounts_payable (supplier_id, description, amount, due_date, status) VALUES (1, 'Compra de Arroz e Feijão', 1250, '2026-07-10', 'pending')");
  await db.run("INSERT INTO accounts_payable (supplier_id, description, amount, due_date, status) VALUES (2, 'Carga de Cervejas e Refri', 800, '2026-06-25', 'pending')");
  await db.run("INSERT INTO accounts_payable (supplier_id, description, amount, due_date, status, paid_at) VALUES (3, 'Sabonetes e Cremes Dentais', 450, '2026-06-12', 'paid', '2026-06-12 14:00:00')");
}

async function seedProductsAndCustomers(db: any) {
  console.log("Seeding products...");
  const defaultProducts = [
    ["7891000100101", "Arroz Agulhinha Tipo 1 5kg", "Alimentos", 1, 1, 18.5, 24.9, 50, 10, "un"],
    ["7891000100102", "Feijão Carioca 1kg", "Alimentos", 1, 1, 5.2, 7.8, 80, 15, "un"],
    ["7891000100103", "Açúcar Refinado 1kg", "Alimentos", 1, 2, 3.1, 4.5, 60, 10, "un"],
    ["7891000100104", "Café Torrado e Moído 500g", "Alimentos", 1, 3, 12.4, 17.9, 40, 8, "un"],
    ["7891000100105", "Óleo de Soja 900ml", "Alimentos", 1, 1, 4.8, 6.5, 100, 20, "un"],
    ["7891000200201", "Leite UHT Integral 1L", "Bebidas", 2, 5, 3.2, 4.89, 120, 24, "un"],
    ["7891000200202", "Refrigerante Cola 2L", "Bebidas", 2, 5, 5.9, 8.99, 90, 15, "un"],
    ["7891000200203", "Água Mineral Sem Gás 500ml", "Bebidas", 2, 5, 0.8, 2, 200, 30, "un"],
    ["7891000200204", "Cerveja Pilsen Lata 350ml", "Bebidas", 2, 4, 2.2, 3.8, 150, 30, "un"],
    ["7891000300301", "Pão de Forma Tradicional", "Alimentos", 1, 3, 4.2, 6.99, 30, 5, "un"],
    ["7891000400401", "Detergente Líquido Neutro 500ml", "Limpeza", 3, 6, 1.4, 2.3, 80, 12, "un"],
    ["7891000400402", "Sabão em Pó 1kg", "Limpeza", 3, 7, 7.5, 11.9, 45, 10, "un"],
    ["7891000400403", "Amaciante de Roupas 2L", "Limpeza", 3, 7, 9.8, 15.9, 25, 5, "un"],
    ["7891000500501", "Sabonete Barra 90g", "Higiene", 4, 8, 1.1, 2.1, 120, 15, "un"],
    ["7891000500502", "Creme Dental Tripla Ação 90g", "Higiene", 4, 8, 2.5, 4.2, 70, 10, "un"],
    ["7891000500503", "Shampoo Suave 350ml", "Higiene", 4, 9, 6.2, 9.9, 35, 8, "un"]
  ];

  for (const p of defaultProducts) {
    await db.run(
      `INSERT INTO products (barcode, name, category, category_id, subcategory_id, price_buy, price_sell, stock_qty, min_stock, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      p
    );
  }

  console.log("Seeding customers...");
  const defaultCustomers = [
    ["Consumidor Final", null, null, null, 0, 0, 0],
    ["João Silva", "123.456.789-00", "joao@email.com", "(11) 98765-4321", 500, 50, 120],
    ["Maria Oliveira", "987.654.321-11", "maria@email.com", "(11) 91234-5678", 300, 0, 45],
    ["Carlos Souza", "456.789.123-22", "carlos@email.com", "(11) 95555-4444", 1000, 150, 210]
  ];

  for (const c of defaultCustomers) {
    await db.run(
      `INSERT INTO customers (name, cpf, email, phone, debt_limit, current_debt, loyalty_points)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      c
    );
  }
}

async function seedEmployeesAndRecurring(db: any) {
  console.log("Seeding employees...");
  await db.run("INSERT INTO employees (name, cpf, rg, phone, email, role, salary, admission_date, status, documents_info) VALUES ('Carlos Oliveira', '234.567.890-12', '12.345.678-9', '(11) 98888-7777', 'carlos.oliveira@superpos.com', 'Açougueiro', 2500, '2025-01-15', 'active', 'PIS: 120.45678.90-1, CTPS: 45678 Série 002')");
  await db.run("INSERT INTO employees (name, cpf, rg, phone, email, role, salary, admission_date, status, documents_info) VALUES ('Ana Beatriz Santos', '345.678.901-23', '23.456.789-0', '(11) 97777-6666', 'ana.beatriz@superpos.com', 'Operadora de Caixa', 1800, '2025-03-10', 'active', 'PIS: 130.56789.01-2, CTPS: 56789 Série 003')");
  await db.run("INSERT INTO employees (name, cpf, rg, phone, email, role, salary, admission_date, status, documents_info) VALUES ('Roberto Souza', '456.789.012-34', '34.567.890-1', '(11) 96666-5555', 'roberto.souza@superpos.com', 'Repositor de Estoque', 1600, '2025-02-20', 'active', 'PIS: 140.67890.12-3, CTPS: 67890 Série 004')");

  console.log("Seeding recurring accounts...");
  await db.run("INSERT INTO recurring_accounts (description, amount, due_day, category, supplier_id, status) VALUES ('Aluguel do Galpão', 3500, 5, 'Aluguel', NULL, 'active')");
  await db.run("INSERT INTO recurring_accounts (description, amount, due_day, category, supplier_id, status) VALUES ('Assinatura Software SuperPOS', 250, 15, 'Sistemas', 1, 'active')");
  await db.run("INSERT INTO recurring_accounts (description, amount, due_day, category, supplier_id, status) VALUES ('Serviço de Limpeza Mensal', 1200, 20, 'Serviços', 3, 'active')");
}

async function generateSingleSale(db: any, products: any[], dayOffset: number) {
  const hourOffset = Math.floor(Math.random() * 12) + 8;
  const minuteOffset = Math.floor(Math.random() * 60);
  const dateObj = new Date();
  dateObj.setDate(dateObj.getDate() - dayOffset);
  dateObj.setHours(hourOffset, minuteOffset, 0, 0);
    const dateStr = dateObj.toISOString();

  const paymentMethods = ['Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'PIX'];
  const pm = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];

  const saleItemsCount = Math.floor(Math.random() * 3) + 1;
  const selectedItems: any[] = [];
  let totalVal = 0;

  for (let k = 0; k < saleItemsCount; k++) {
    const prod = products[Math.floor(Math.random() * products.length)];
    
    // Sabonete sem vendas para testar insight da IA
    if (prod.name === 'Sabonete Barra 90g') continue;
    // Queda de vendas do Refrigerante na última quinzena
    if (prod.name === 'Refrigerante Cola 2L' && dayOffset < 15) continue;

    const qty = Math.floor(Math.random() * 3) + 1;
    const price = prod.price_sell;
    const subtotal = qty * price;

    selectedItems.push({
      product_id: prod.id,
      qty,
      price,
      subtotal
    });
    totalVal += subtotal;
  }

  if (selectedItems.length === 0) return;

  const saleResult = await db.run(
    `INSERT INTO sales (customer_id, total_amount, discount, final_amount, payment_method, created_at)
     VALUES (1, ?, 0, ?, ?, ?)`,
    [totalVal, totalVal, pm, dateStr]
  );

  const saleId = saleResult.lastID;

  for (const item of selectedItems) {
    await db.run(
      `INSERT INTO sale_items (sale_id, product_id, quantity, price_unit, price_total)
       VALUES (?, ?, ?, ?, ?)`,
      [saleId, item.product_id, item.qty, item.price, item.subtotal]
    );
  }
}

async function seedSalesMovement(db: any) {
  console.log("Seeding sales movements...");
  const products = await db.all("SELECT id, price_sell, name FROM products");
  if (products.length === 0) return;

  for (let i = 29; i >= 0; i--) {
    const numSales = Math.floor(Math.random() * 3) + 2;
    for (let j = 0; j < numSales; j++) {
      await generateSingleSale(db, products, i);
    }
  }
  console.log("Sales movements seeded successfully.");
}

async function seedSessionsLogsAndLayout(db: any) {
  console.log("Seeding cash sessions...");
  const date2DaysAgo = new Date();
  date2DaysAgo.setDate(date2DaysAgo.getDate() - 2);
  const date2DaysAgoPlus8 = new Date(date2DaysAgo.getTime() + 8 * 60 * 60 * 1000);

  const date1DayAgo = new Date();
  date1DayAgo.setDate(date1DayAgo.getDate() - 1);
  const date1DayAgoPlus8 = new Date(date1DayAgo.getTime() + 8 * 60 * 60 * 1000);

  const date2HoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

  await db.run(`
    INSERT INTO cash_sessions (pdv_name, operator_name, opened_at, closed_at, initial_float, final_cash_reported, status, closed_by)
    VALUES ('Caixa 01', 'operador1', ?, ?, 100, 350, 'closed', 'gerente')
  `, [date2DaysAgo.toISOString(), date2DaysAgoPlus8.toISOString()]);

  await db.run(`
    INSERT INTO cash_sessions (pdv_name, operator_name, opened_at, closed_at, initial_float, final_cash_reported, status, closed_by)
    VALUES ('Caixa 01', 'operador1', ?, ?, 100, 420, 'closed', 'gerente')
  `, [date1DayAgo.toISOString(), date1DayAgoPlus8.toISOString()]);

  await db.run(`
    INSERT INTO cash_sessions (pdv_name, operator_name, opened_at, initial_float, status)
    VALUES ('Caixa 01', 'gerente', ?, 100, 'open')
  `, [date2HoursAgo.toISOString()]);

  console.log("Seeding system logs...");
  await db.run("INSERT INTO system_logs (action_type, operator_name, details) VALUES ('LOGIN', 'admin', 'Login efetuado no painel administrativo')");
  await db.run("INSERT INTO system_logs (action_type, operator_name, details) VALUES ('STOCK_UPDATE', 'gerente', 'Estoque do produto Arroz Agulhinha Tipo 1 5kg adjusted manual')");

  console.log("Seeding layout mapping...");
  const z1 = await db.run("INSERT INTO layout_zones (name, zone_type, x, y, width, height, color) VALUES ('Gôndola Alimentos', 'shelf', 2, 2, 4, 2, '#4f46e5')");
  const z2 = await db.run("INSERT INTO layout_zones (name, zone_type, x, y, width, height, color) VALUES ('Gôndola Limpeza', 'shelf', 2, 6, 4, 2, '#06b6d4')");
  const z3 = await db.run("INSERT INTO layout_zones (name, zone_type, x, y, width, height, color) VALUES ('Gôndola Higiene', 'shelf', 8, 2, 4, 2, '#ec4899')");
  await db.run("INSERT INTO layout_zones (name, zone_type, x, y, width, height, color) VALUES ('Hortifrúti', 'hortifruti', 8, 6, 4, 3, '#10b981')");
  const z5 = await db.run("INSERT INTO layout_zones (name, zone_type, x, y, width, height, color) VALUES ('Geladeira Bebidas', 'fridge', 13, 2, 2, 5, '#3b82f6')");
  await db.run("INSERT INTO layout_zones (name, zone_type, x, y, width, height, color) VALUES ('Padaria', 'bakery', 13, 8, 2, 3, '#f59e0b')");
  await db.run("INSERT INTO layout_zones (name, zone_type, x, y, width, height, color) VALUES ('Caixa 01', 'checkout', 2, 10, 3, 2, '#ef4444')");
  await db.run("INSERT INTO layout_zones (name, zone_type, x, y, width, height, color) VALUES ('Caixa 02', 'checkout', 7, 10, 3, 2, '#ef4444')");

  await db.run("INSERT INTO layout_zone_items (zone_id, category_id) VALUES (?, 1)", [z1.lastID]); // Alimentos -> Gôndola Alimentos
  await db.run("INSERT INTO layout_zone_items (zone_id, category_id) VALUES (?, 3)", [z2.lastID]); // Limpeza -> Gôndola Limpeza
  await db.run("INSERT INTO layout_zone_items (zone_id, category_id) VALUES (?, 4)", [z3.lastID]); // Higiene -> Gôndola Higiene
  await db.run("INSERT INTO layout_zone_items (zone_id, category_id) VALUES (?, 2)", [z5.lastID]); // Bebidas -> Geladeira Bebidas
}

async function runSeed() {
  console.log("Starting database reset and seeding...");
  const db = await getDb();

  await wipeDatabase(db);
  await seedRolesAndPermissions(db);
  await seedUsers(db);
  await seedCategoriesAndSubcategories(db);
  await seedTerminalsSuppliersAndPayable(db);
  await seedProductsAndCustomers(db);
  await seedEmployeesAndRecurring(db);
  await seedSalesMovement(db);
  await seedSessionsLogsAndLayout(db);

  await db.run("PRAGMA foreign_keys = ON");
  await db.close();
  console.log("Database reset and seeding completed successfully!");
}

try {
  await runSeed();
} catch (err) {
  console.error("Failed to run seed script:", err);
  process.exit(1);
}
