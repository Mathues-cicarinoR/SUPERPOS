import { getDb } from './db.js';

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

async function seedDefaultData(db: any) {
  console.log("Seeding default essential data...");
  
  // 1. Terminals (Requires at least one terminal to open a Cash Session)
  await db.run("INSERT INTO terminals (name) VALUES ('Caixa 01')");

  // 2. Customers (Consumidor Final is required by the POS system)
  await db.run(
    `INSERT INTO customers (name, cpf, email, phone, debt_limit, current_debt, loyalty_points)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ["Consumidor Final", null, null, null, 0, 0, 0]
  );
}

async function runSeed() {
  console.log("Starting database reset and seeding...");
  const db = await getDb();

  await wipeDatabase(db);
  await seedRolesAndPermissions(db);
  await seedUsers(db);
  await seedDefaultData(db);

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
