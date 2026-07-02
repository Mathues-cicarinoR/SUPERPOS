import express from 'express';
import cors from 'cors';
import { initDb, getDb, resetDbConnection } from './database/db.js';
import { FiscalService } from './services/fiscal.js';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '../../database.db');
const BACKUP_DIR = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.resolve(__dirname, '../../backups');

// Initialize backup folder
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Helper to create SQLite database backup
export function createBackupFile(label: string = 'manual'): string {
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup_${label}_${dateStr}.db`;
  const destPath = path.join(BACKUP_DIR, filename);
  const sourcePath = DB_FILE;

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, destPath);
    // Keep only the last 15 backups to save space
    try {
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
        .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
        .sort((a, b) => b.time - a.time);

      if (files.length > 15) {
        for (let i = 15; i < files.length; i++) {
          fs.unlinkSync(path.join(BACKUP_DIR, files[i].name));
        }
      }
    } catch (err) {
      console.error("Erro ao limpar backups antigos:", err);
    }
    return filename;
  }
  throw new Error("Arquivo de banco de dados não encontrado.");
}

const app = express();
const PORT = process.env.PORT || 8000;

// System Logging Helper
export async function logAction(action_type: string, operator_name: string, details: any) {
  try {
    const db = await getDb();
    await db.run(
      "INSERT INTO system_logs (action_type, operator_name, details) VALUES (?, ?, ?)",
      [action_type, operator_name || 'Desconhecido', details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : null]
    );
  } catch (e) {
    console.error("Erro ao gravar log:", e);
  }
}

export async function applyPromotionsToProducts(db: any, products: any[]) {
  const nowStr = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  
  try {
    const activePromos = await db.all(`
      SELECT p.*, pp.product_id, pp.discount_type AS prod_discount_type, pp.discount_value AS prod_discount_value
      FROM promotions p
      JOIN promotion_products pp ON p.id = pp.promotion_id
      WHERE p.status = 'active' 
        AND p.start_date <= ? 
        AND p.end_date >= ?
    `, [nowStr, nowStr]);

    const promoMap = new Map<number, any>();
    for (const promo of activePromos) {
      const existing = promoMap.get(promo.product_id);
      if (!existing) {
        promoMap.set(promo.product_id, promo);
      }
    }

    return products.map(product => {
      const promo = promoMap.get(product.id);
      if (promo) {
        const effectiveType = promo.prod_discount_type || promo.discount_type;
        const effectiveValue = promo.prod_discount_value !== null && promo.prod_discount_value !== undefined ? promo.prod_discount_value : promo.discount_value;

        let promotional_price = product.price_sell;
        if (effectiveType === 'percentage') {
          promotional_price = product.price_sell * (1 - effectiveValue / 100);
        } else if (effectiveType === 'fixed_price') {
          promotional_price = effectiveValue;
        } else if (effectiveType === 'fixed_discount') {
          promotional_price = Math.max(0, product.price_sell - effectiveValue);
        }
        promotional_price = parseFloat(promotional_price.toFixed(2));

        return {
          ...product,
          promotional_price,
          active_promotion: {
            id: promo.id,
            name: promo.name,
            description: promo.description,
            discount_type: effectiveType,
            discount_value: effectiveValue,
            start_date: promo.start_date,
            end_date: promo.end_date
          }
        };
      }
      return product;
    });
  } catch (e) {
    console.error("Erro ao aplicar promoções:", e);
    return products;
  }
}

app.use(cors({
  exposedHeaders: ['Content-Disposition']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 1. Connection Ping Route (Contingency Sincronization health check)
app.get('/api/ping', (req, res) => {
  res.json({ status: 'online', timestamp: new Date().toISOString() });
});

// 2. Products Routes
app.get('/api/products', async (req, res) => {
  const db = await getDb();
  const search = req.query.q as string;
  try {
    let products;
    if (search) {
      products = await db.all(
        `SELECT p.*, GROUP_CONCAT(pb.barcode) as barcodes_str 
         FROM products p 
         LEFT JOIN product_barcodes pb ON p.id = pb.product_id 
         WHERE p.name LIKE ? OR p.barcode = ? OR p.code = ? OR pb.barcode = ? OR p.category LIKE ? 
         GROUP BY p.id 
         ORDER BY p.name ASC`,
        [`%${search}%`, search, search, search, `%${search}%`]
      );
    } else {
      products = await db.all(
        `SELECT p.*, GROUP_CONCAT(pb.barcode) as barcodes_str 
         FROM products p 
         LEFT JOIN product_barcodes pb ON p.id = pb.product_id 
         GROUP BY p.id 
         ORDER BY p.name ASC`
      );
    }
    const formatted = products.map(p => ({
      ...p,
      barcodes: p.barcodes_str ? p.barcodes_str.split(',') : []
    }));
    const withPromotions = await applyPromotionsToProducts(db, formatted);
    res.json(withPromotions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/products/barcode/:barcode', async (req, res) => {
  const db = await getDb();
  const { barcode } = req.params;
  try {
    const product = await db.get(
      `SELECT p.*, GROUP_CONCAT(pb.barcode) as barcodes_str 
       FROM products p 
       LEFT JOIN product_barcodes pb ON p.id = pb.product_id 
       WHERE p.barcode = ? OR pb.barcode = ? OR p.code = ?
       GROUP BY p.id`, 
      [barcode, barcode, barcode]
    );
    if (product) {
      product.barcodes = product.barcodes_str ? product.barcodes_str.split(',') : [];
      const withPromotions = await applyPromotionsToProducts(db, [product]);
      res.json(withPromotions[0]);
    } else {
      res.status(404).json({ error: "Produto não cadastrado" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  const db = await getDb();
  const { 
    code, barcode, barcodes, name, category, category_id, subcategory_id, price_buy, price_sell, stock_qty, min_stock, unit, operator_name,
    ncm, cest, cfop, origin, csosn, cst_pis, cst_cofins, aliquot_icms, aliquot_pis, aliquot_cofins, is_fiscal
  } = req.body;
  try {
    let finalCategory = category || 'Geral';
    if (category_id) {
      const cat = await db.get("SELECT name FROM categories WHERE id = ?", [category_id]);
      if (cat) finalCategory = cat.name;
    }

    let finalCode = code?.trim();
    if (!finalCode) {
      finalCode = Date.now().toString().slice(-6) + Math.floor(100 + Math.random() * 900);
    }

    const settings = await db.get("SELECT default_cfop, default_origin, default_csosn, default_cst_pis, default_cst_cofins, default_aliquot_icms, default_aliquot_pis, default_aliquot_cofins FROM fiscal_settings LIMIT 1") || {
      default_cfop: '5102', default_origin: '0', default_csosn: '102', default_cst_pis: '49', default_cst_cofins: '49',
      default_aliquot_icms: 18.0, default_aliquot_pis: 0.0, default_aliquot_cofins: 0.0
    };

    const result = await db.run(
      `INSERT INTO products (code, barcode, name, category, category_id, subcategory_id, price_buy, price_sell, stock_qty, min_stock, unit,
                             ncm, cest, cfop, origin, csosn, cst_pis, cst_cofins, aliquot_icms, aliquot_pis, aliquot_cofins, is_fiscal)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        finalCode, barcode, name, finalCategory, category_id || null, subcategory_id || null, price_buy, price_sell, stock_qty, min_stock || 0, unit || 'un',
        ncm || '00000000',
        cest || '',
        cfop || settings.default_cfop || '5102',
        origin || settings.default_origin || '0',
        csosn || settings.default_csosn || '102',
        cst_pis || settings.default_cst_pis || '49',
        cst_cofins || settings.default_cst_cofins || '49',
        aliquot_icms !== undefined ? parseFloat(aliquot_icms) : settings.default_aliquot_icms,
        aliquot_pis !== undefined ? parseFloat(aliquot_pis) : settings.default_aliquot_pis,
        aliquot_cofins !== undefined ? parseFloat(aliquot_cofins) : settings.default_aliquot_cofins,
        is_fiscal !== undefined ? (is_fiscal ? 1 : 0) : 1
      ]
    );

    const productId = result.lastID;
    
    // Save multiple barcodes
    const barcodeList = new Set<string>();
    if (barcode && barcode.trim()) {
      barcodeList.add(barcode.trim());
    }
    if (barcodes && Array.isArray(barcodes)) {
      barcodes.forEach(b => {
        if (b && typeof b === 'string' && b.trim()) {
          barcodeList.add(b.trim());
        }
      });
    }

    for (const b of barcodeList) {
      await db.run("INSERT OR IGNORE INTO product_barcodes (product_id, barcode) VALUES (?, ?)", [productId, b]);
    }

    const newProduct = await db.get("SELECT * FROM products WHERE id = ?", [productId]);
    newProduct.barcodes = Array.from(barcodeList);
    await logAction('PRODUCT_CREATE', operator_name || 'Gerente', { id: productId, name, barcode, stock_qty });
    res.status(201).json(newProduct);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  const { 
    code, barcode, barcodes, name, category, category_id, subcategory_id, price_buy, price_sell, stock_qty, min_stock, unit, operator_name,
    ncm, cest, cfop, origin, csosn, cst_pis, cst_cofins, aliquot_icms, aliquot_pis, aliquot_cofins, is_fiscal
  } = req.body;
  try {
    let finalCategory = category;
    if (category_id) {
      const cat = await db.get("SELECT name FROM categories WHERE id = ?", [category_id]);
      if (cat) finalCategory = cat.name;
    }

    let finalCode = code?.trim();
    if (!finalCode) {
      finalCode = 'P' + id;
    }

    let valorIsFiscal = 1;
    if (is_fiscal !== undefined) {
      valorIsFiscal = is_fiscal ? 1 : 0;
    }

    await db.run(
      `UPDATE products
       SET code = ?, barcode = ?, name = ?, category = ?, category_id = ?, subcategory_id = ?, price_buy = ?, price_sell = ?, stock_qty = ?, min_stock = ?, unit = ?,
           ncm = ?, cest = ?, cfop = ?, origin = ?, csosn = ?, cst_pis = ?, cst_cofins = ?, aliquot_icms = ?, aliquot_pis = ?, aliquot_cofins = ?, is_fiscal = ?
       WHERE id = ?`,
      [
        finalCode, barcode, name, finalCategory, category_id || null, subcategory_id || null, price_buy, price_sell, stock_qty, min_stock, unit,
        ncm, cest, cfop, origin, csosn, cst_pis, cst_cofins, aliquot_icms, aliquot_pis, aliquot_cofins,
        valorIsFiscal,
        id
      ]
    );

    // Update barcodes table
    await db.run("DELETE FROM product_barcodes WHERE product_id = ?", [id]);
    
    const barcodeList = new Set<string>();
    if (barcode && barcode.trim()) {
      barcodeList.add(barcode.trim());
    }
    if (barcodes && Array.isArray(barcodes)) {
      barcodes.forEach(b => {
        if (b && typeof b === 'string' && b.trim()) {
          barcodeList.add(b.trim());
        }
      });
    }

    for (const b of barcodeList) {
      await db.run("INSERT OR IGNORE INTO product_barcodes (product_id, barcode) VALUES (?, ?)", [id, b]);
    }

    const updated = await db.get("SELECT * FROM products WHERE id = ?", [id]);
    updated.barcodes = Array.from(barcodeList);
    await logAction('PRODUCT_UPDATE', operator_name || 'Gerente', { id, name, price_sell, stock_qty });
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  const { operator_name } = req.body; // optionally passed in request body or query
  const operator = (req.query.operator_name as string) || operator_name || 'Gerente';
  try {
    const product = await db.get("SELECT stock_qty, name, barcode FROM products WHERE id = ?", [id]);
    if (!product) {
      return res.status(404).json({ error: "Produto não encontrado." });
    }
    if (product.stock_qty > 0) {
      return res.status(400).json({ error: "Não é permitido excluir um produto com estoque ativo positivo (Estoque atual: " + product.stock_qty + ")." });
    }
    await db.run("DELETE FROM products WHERE id = ?", [id]);
    await logAction('PRODUCT_DELETE', operator, { id, name: product.name, barcode: product.barcode });
    res.json({ success: true, message: "Produto excluído com sucesso" });
  } catch (err: any) {
    res.status(400).json({ error: "Não é possível excluir o produto. Ele pode estar associado a vendas passadas." });
  }
});

app.post('/api/products/invoice-entry', async (req, res) => {
  const db = await getDb();
  const { invoice_number, supplier_name, supplier_cnpj, total_amount, due_date, operator_name, items, schedule_payment, installments } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: "Lista de itens da nota fiscal inválida." });
  }

  try {
    const settings = await db.get("SELECT default_cfop, default_origin, default_csosn, default_cst_pis, default_cst_cofins, default_aliquot_icms, default_aliquot_pis, default_aliquot_cofins FROM fiscal_settings LIMIT 1") || {
      default_cfop: '5102', default_origin: '0', default_csosn: '102', default_cst_pis: '49', default_cst_cofins: '49',
      default_aliquot_icms: 18.0, default_aliquot_pis: 0.0, default_aliquot_cofins: 0.0
    };

    await db.run("BEGIN TRANSACTION");

    // 1. Fornecedor
    let supplierId = null;
    if (supplier_name) {
      let supplier = null;
      if (supplier_cnpj) {
        supplier = await db.get("SELECT id FROM suppliers WHERE cnpj = ?", [supplier_cnpj]);
      } else {
        supplier = await db.get("SELECT id FROM suppliers WHERE name = ?", [supplier_name]);
      }

      if (supplier) {
        supplierId = supplier.id;
      } else {
        const supResult = await db.run(
          "INSERT INTO suppliers (name, cnpj) VALUES (?, ?)",
          [supplier_name, supplier_cnpj || null]
        );
        supplierId = supResult.lastID;
        await logAction('SUPPLIER_CREATE', operator_name || 'Gerente', { id: supplierId, name: supplier_name });
      }
    }

    // 2. Contas a Pagar (configurável/agendamento de boletos)
    const shouldSchedule = schedule_payment !== undefined ? !!schedule_payment : true;
    if (shouldSchedule) {
      if (installments && Array.isArray(installments) && installments.length > 0) {
        for (let i = 0; i < installments.length; i++) {
          const inst = installments[i];
          const desc = `Entrada NF nº ${invoice_number || 'S/N'} (Parc ${i+1}/${installments.length}) - ${supplier_name || 'Fornecedor avulso'}`;
          await db.run(
            "INSERT INTO accounts_payable (supplier_id, description, amount, due_date, status) VALUES (?, ?, ?, ?, 'pending')",
            [supplierId, desc, parseFloat(inst.amount), inst.due_date]
          );
          await logAction('PAYABLE_CREATE', operator_name || 'Gerente', { description: desc, amount: parseFloat(inst.amount) });
        }
      } else if (due_date && total_amount > 0) {
        const desc = `Entrada NF nº ${invoice_number || 'S/N'} - ${supplier_name || 'Fornecedor avulso'}`;
        await db.run(
          "INSERT INTO accounts_payable (supplier_id, description, amount, due_date, status) VALUES (?, ?, ?, ?, 'pending')",
          [supplierId, desc, total_amount, due_date]
        );
        await logAction('PAYABLE_CREATE', operator_name || 'Gerente', { description: desc, amount: total_amount });
      }
    }

    // 3. Processar Itens
    const processedItems = [];
    for (const item of items) {
      const { barcode, name: itemName, quantity, price_buy, price_sell, ncm, cest } = item;

      // Buscar produto existente pelo código de barras, código de produto ou códigos de barras alternativos
      let product = await db.get(
        `SELECT p.* FROM products p 
         LEFT JOIN product_barcodes pb ON p.id = pb.product_id 
         WHERE p.barcode = ? OR pb.barcode = ? OR p.code = ?
         GROUP BY p.id`, 
        [barcode, barcode, barcode]
      );

      if (product) {
        // Atualizar estoque e preço de compra
        const newStock = product.stock_qty + parseFloat(quantity);
        const finalPriceSell = price_sell ? parseFloat(price_sell) : product.price_sell;
        
        await db.run(
          "UPDATE products SET stock_qty = ?, price_buy = ?, price_sell = ? WHERE id = ?",
          [newStock, parseFloat(price_buy), finalPriceSell, product.id]
        );

        // Gravar histórico de ajuste (balanço/entrada)
        await db.run(
          "INSERT INTO inventory_adjustments (product_id, previous_stock, new_stock, reason, operator_name) VALUES (?, ?, ?, ?, ?)",
          [product.id, product.stock_qty, newStock, `Entrada NF nº ${invoice_number || 'S/N'}`, operator_name || 'Gerente']
        );

        await logAction('INVENTORY_ENTRY', operator_name || 'Gerente', { id: product.id, name: product.name, barcode, qty_added: quantity, new_stock: newStock });
        processedItems.push({ id: product.id, name: product.name, status: 'updated', qty: quantity });
      } else {
        // Cadastrar produto novo com código de barras e código de barras associados
        let cat = await db.get("SELECT id, name FROM categories LIMIT 1");
        let catId = cat ? cat.id : null;
        let catName = cat ? cat.name : 'Geral';

        if (!catId) {
          const catResult = await db.run("INSERT INTO categories (name) VALUES ('Geral')");
          catId = catResult.lastID;
          catName = 'Geral';
        }

        const finalPriceSell = price_sell ? parseFloat(price_sell) : parseFloat(price_buy) * 1.3; // Margem de 30%
        const finalCode = Date.now().toString().slice(-6) + Math.floor(100 + Math.random() * 900);
        
        const result = await db.run(
          `INSERT INTO products (code, barcode, name, category, category_id, price_buy, price_sell, stock_qty, min_stock, unit,
                                 ncm, cest, cfop, origin, csosn, cst_pis, cst_cofins, aliquot_icms, aliquot_pis, aliquot_cofins)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            finalCode, barcode, itemName, catName, catId, parseFloat(price_buy), finalPriceSell, parseFloat(quantity), 0, 'un',
            ncm || '00000000',
            cest || '',
            item.cfop || settings.default_cfop || '5102',
            item.origin || settings.default_origin || '0',
            item.csosn || settings.default_csosn || '102',
            item.cst_pis || settings.default_cst_pis || '49',
            item.cst_cofins || settings.default_cst_cofins || '49',
            item.aliquot_icms !== undefined ? parseFloat(item.aliquot_icms) : settings.default_aliquot_icms,
            item.aliquot_pis !== undefined ? parseFloat(item.aliquot_pis) : settings.default_aliquot_pis,
            item.aliquot_cofins !== undefined ? parseFloat(item.aliquot_cofins) : settings.default_aliquot_cofins
          ]
        );

        const newProdId = result.lastID;

        // Associar o código de barras
        if (barcode && barcode.trim()) {
          await db.run("INSERT OR IGNORE INTO product_barcodes (product_id, barcode) VALUES (?, ?)", [newProdId, barcode.trim()]);
        }

        // Histórico de ajuste
        await db.run(
          "INSERT INTO inventory_adjustments (product_id, previous_stock, new_stock, reason, operator_name) VALUES (?, 0, ?, ?, ?)",
          [newProdId, parseFloat(quantity), `Entrada NF nº ${invoice_number || 'S/N'} (Novo Produto)`, operator_name || 'Gerente']
        );

        await logAction('PRODUCT_CREATE', operator_name || 'Gerente', { id: newProdId, name: itemName, barcode, stock_qty: quantity });
        processedItems.push({ id: newProdId, name: itemName, status: 'created', qty: quantity });
      }
    }

    await db.run("COMMIT");
    res.json({ success: true, processedItems });
  } catch (err: any) {
    await db.run("ROLLBACK");
    res.status(500).json({ error: err.message });
  }
});

// 3. Customers Routes
app.get('/api/customers', async (req, res) => {
  const db = await getDb();
  const search = req.query.q as string;
  try {
    let customers;
    if (search) {
      customers = await db.all(
        "SELECT * FROM customers WHERE name LIKE ? OR cpf = ? OR phone LIKE ? ORDER BY name ASC",
        [`%${search}%`, search, `%${search}%`]
      );
    } else {
      customers = await db.all("SELECT * FROM customers ORDER BY name ASC");
    }
    res.json(customers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  const db = await getDb();
  const { name, cpf, email, phone, debt_limit } = req.body;
  try {
    const result = await db.run(
      `INSERT INTO customers (name, cpf, email, phone, debt_limit, current_debt, loyalty_points)
       VALUES (?, ?, ?, ?, ?, 0.0, 0)`,
      [name, cpf || null, email || null, phone || null, debt_limit || 0.0]
    );
    const newCustomer = await db.get("SELECT * FROM customers WHERE id = ?", [result.lastID]);
    res.status(201).json(newCustomer);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  const { name, cpf, email, phone, debt_limit, pay_amount } = req.body;

  try {
    if (pay_amount !== undefined) {
      // Record payment of debt
      const customer = await db.get("SELECT current_debt, name FROM customers WHERE id = ?", [id]);
      if (!customer) throw new Error("Cliente não encontrado");

      const newDebt = Math.max(0.0, customer.current_debt - parseFloat(pay_amount));
      await db.run("UPDATE customers SET current_debt = ? WHERE id = ?", [newDebt, id]);
    } else {
      // Normal profile update
      await db.run(
        `UPDATE customers
         SET name = ?, cpf = ?, email = ?, phone = ?, debt_limit = ?
         WHERE id = ?`,
        [name, cpf || null, email || null, phone || null, debt_limit || 0.0, id]
      );
    }
    const updated = await db.get("SELECT * FROM customers WHERE id = ?", [id]);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  try {
    if (parseInt(id) === 1) {
      throw new Error("O Consumidor Final padrão não pode ser excluído.");
    }
    // Check if customer has outstanding debt
    const customer = await db.get("SELECT current_debt FROM customers WHERE id = ?", [id]);
    if (customer && customer.current_debt > 0) {
      throw new Error("Não é possível excluir um cliente com dívidas pendentes.");
    }
    await db.run("DELETE FROM customers WHERE id = ?", [id]);
    res.json({ success: true, message: "Cliente excluído com sucesso" });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Helper function to process single sale within connection
async function processSaleTransaction(db: any, saleData: any): Promise<number> {
  const { customer_id, items, total_amount, discount, final_amount, payment_method, payment_details, amount_paid, change_given, fee_amount, offline_uuid } = saleData;

  // If sale has UUID, check if it was already processed (to prevent double sync)
  if (offline_uuid) {
    const existing = await db.get("SELECT id FROM sales WHERE offline_uuid = ?", [offline_uuid]);
    if (existing) {
      return existing.id; // Already processed, return existing ID
    }
  }

  // 1. Insert Sale record
  const saleResult = await db.run(
    `INSERT INTO sales (customer_id, total_amount, discount, final_amount, payment_method, payment_details, amount_paid, change_given, fee_amount, offline_uuid)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      customer_id || null, 
      total_amount, 
      discount || 0.0, 
      final_amount, 
      payment_method, 
      payment_details ? (typeof payment_details === 'object' ? JSON.stringify(payment_details) : payment_details) : null,
      amount_paid, 
      change_given, 
      fee_amount || 0.0,
      offline_uuid || null
    ]
  );
  const saleId = saleResult.lastID;

  // 2. Add Items & Update stock
  for (const item of items) {
    const prodId = item.product_id;
    const qty = parseFloat(item.quantity);
    const priceUnit = parseFloat(item.price_unit);
    const priceTotal = parseFloat(item.price_total);

    // Verify product exists and check stock level
    const prod = await db.get("SELECT stock_qty, name FROM products WHERE id = ?", [prodId]);
    if (!prod) {
      throw new Error(`Produto ID ${prodId} não encontrado.`);
    }
    if (prod.stock_qty < qty) {
      throw new Error(`Estoque insuficiente para o produto '${prod.name}'. Disponível: ${prod.stock_qty}, Solicitado: ${qty}`);
    }

    // Insert sale item
    await db.run(
      `INSERT INTO sale_items (sale_id, product_id, quantity, price_unit, price_total)
       VALUES (?, ?, ?, ?, ?)`,
      [saleId, prodId, qty, priceUnit, priceTotal]
    );

    // Decrement stock
    await db.run("UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?", [qty, prodId]);
  }

  // 3. Update customer balance for fiado
  if (payment_method === 'fiado' && customer_id) {
    const cust = await db.get("SELECT debt_limit, current_debt, name FROM customers WHERE id = ?", [customer_id]);
    if (cust) {
      const newDebt = cust.current_debt + final_amount;
      // Note: in offline mode we check limit in frontend, but backend validates it during online checkout
      if (newDebt > cust.debt_limit && !offline_uuid) {
        throw new Error(`Limite de fiado excedido para ${cust.name}.`);
      }
      await db.run("UPDATE customers SET current_debt = ? WHERE id = ?", [newDebt, customer_id]);
    }
  }

  // 4. Update loyalty points
  if (customer_id) {
    const pointsEarned = Math.floor(final_amount / 10);
    if (pointsEarned > 0) {
      await db.run("UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?", [pointsEarned, customer_id]);
    }
  }

  // Log sale action
  await logAction('SALE_COMPLETE', saleData.operator_name || 'Caixa', { sale_id: saleId, total: final_amount, payment_method });

  return saleId;
}

// 4. Sales Routes
app.post('/api/sales', async (req, res) => {
  const db = await getDb();
  
  try {
    await db.run("BEGIN TRANSACTION");
    const saleId = await processSaleTransaction(db, req.body);
    await db.run("COMMIT");
    res.status(201).json({ success: true, sale_id: saleId });
  } catch (err: any) {
    await db.run("ROLLBACK");
    res.status(400).json({ error: err.message });
  }
});

// Offline Synchronization endpoint: receives array of sales completed in contingency
app.post('/api/sales/sync', async (req, res) => {
  const db = await getDb();
  const salesBatch = req.body.sales; // Array of sales
  
  if (!salesBatch || !Array.isArray(salesBatch)) {
    return res.status(400).json({ error: "Lote de vendas inválido" });
  }

  const syncedIds: number[] = [];
  const errors: string[] = [];

  try {
    await db.run("BEGIN TRANSACTION");
    for (const sale of salesBatch) {
      try {
        const id = await processSaleTransaction(db, sale);
        syncedIds.push(id);
      } catch (e: any) {
        errors.push(`Venda offline (UUID: ${sale.offline_uuid}): ${e.message}`);
      }
    }
    await db.run("COMMIT");
    res.json({ success: true, synced_count: syncedIds.length, errors });
  } catch (err: any) {
    await db.run("ROLLBACK");
    res.status(500).json({ error: `Falha crítica de transação de lote: ${err.message}` });
  }
});

app.get('/api/sales', async (req, res) => {
  const db = await getDb();
  try {
    const sales = await db.all(`
      SELECT s.*, c.name as customer_name 
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      ORDER BY s.created_at DESC
      LIMIT 100
    `);

    for (const sale of sales) {
      sale.items = await db.all(`
        SELECT si.*, p.name as product_name, p.unit
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = ?
      `, [sale.id]);
    }
    res.json(sales);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Dashboard Aggregations
app.get('/api/dashboard', async (req, res) => {
  const db = await getDb();
  const todayStr = new Date().toISOString().split('T')[0];

  try {
    // Today's total sales
    const salesToday = await db.get<{ amount: number; count: number }>(
      "SELECT SUM(final_amount) as amount, COUNT(id) as count FROM sales WHERE date(created_at) = date(?)",
      [todayStr]
    );
    const today_sales = salesToday?.amount || 0.0;
    const today_count = salesToday?.count || 0;

    // Estimate profit today
    const profitToday = await db.get<{ profit: number }>(
      `SELECT SUM(si.quantity * (si.price_unit - p.price_buy)) as profit
       FROM sale_items si
       JOIN sales s ON si.sale_id = s.id
       JOIN products p ON si.product_id = p.id
       WHERE date(s.created_at) = date(?)`,
      [todayStr]
    );
    const today_profit = profitToday?.profit || 0.0;

    // Low stock alert count
    const lowStock = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM products WHERE stock_qty <= min_stock"
    );
    const low_stock_count = lowStock?.count || 0;

    // Line chart coordinates (last 7 days of totals)
    const chart_data = await db.all(`
      SELECT date(created_at) as sale_date, SUM(final_amount) as amount, COUNT(id) as cnt
      FROM sales
      WHERE created_at >= date('now', '-7 days')
      GROUP BY sale_date
      ORDER BY sale_date ASC
    `);

    // Top 5 best sellers
    const best_sellers = await db.all(`
      SELECT p.name, SUM(si.quantity) as total_qty, SUM(si.price_total) as total_revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      GROUP BY si.product_id
      ORDER BY total_qty DESC
      LIMIT 5
    `);

    // Top 5 low stock items list
    const low_stock_list = await db.all(`
      SELECT name, stock_qty, min_stock, unit 
      FROM products 
      WHERE stock_qty <= min_stock 
      ORDER BY stock_qty ASC 
      LIMIT 5
    `);

    res.json({
      today_sales,
      today_count,
      today_profit,
      low_stock_count,
      chart_data,
      best_sellers,
      low_stock_list
    });

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5.5 AI Recommendations Route
app.get('/api/reports/ai-recommendations', async (req, res) => {
  const db = await getDb();
  const rawApiKey = req.headers['x-gemini-api-key'] || process.env.GEMINI_API_KEY;
  const apiKey = Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey;
  const geminiModel = 'gemini-2.5-flash-lite';

  try {
    // 1. Query products metrics and quantities sold in the last 15 days vs previous 15 days
    const productsData = await db.all(`
      SELECT 
        p.id, 
        p.name, 
        p.category, 
        p.price_buy, 
        p.price_sell, 
        p.stock_qty, 
        p.min_stock, 
        p.unit,
        COALESCE(SUM(CASE WHEN s.created_at >= datetime('now', '-15 days') THEN si.quantity ELSE 0 END), 0) as qty_last_15_days,
        COALESCE(SUM(CASE WHEN s.created_at >= datetime('now', '-30 days') AND s.created_at < datetime('now', '-15 days') THEN si.quantity ELSE 0 END), 0) as qty_prev_15_days
      FROM products p
      LEFT JOIN sale_items si ON p.id = si.product_id
      LEFT JOIN sales s ON si.sale_id = s.id
      GROUP BY p.id
    `);

    // Query physical layout zones to give spatial intelligence to the prompt
    const layoutZones = await db.all(`
      SELECT lz.id, lz.name, lz.zone_type, lz.x, lz.y, lz.width, lz.height,
             GROUP_CONCAT(DISTINCT c.name) as categories,
             GROUP_CONCAT(DISTINCT p.name) as products
      FROM layout_zones lz
      LEFT JOIN layout_zone_items lzi ON lz.id = lzi.zone_id
      LEFT JOIN categories c ON lzi.category_id = c.id
      LEFT JOIN products p ON lzi.product_id = p.id
      GROUP BY lz.id
    `);

    // 2. Return error if no API key is provided
    if (!apiKey) {
      return res.status(400).json({
        error: "Chave Gemini API não configurada. Por favor, configure a chave de API nas configurações."
      });
    }

    // 2.5 Track and enforce daily query limit (20 requests/day)
    const todayStr = new Date().toLocaleDateString('sv-SE');
    const usage = await db.get("SELECT count FROM ai_usage WHERE date = ?", [todayStr]);
    const currentCount = usage ? usage.count : 0;

    if (currentCount >= 20) {
      return res.status(429).json({
        error: "Limite diário de 20 consultas de IA excedido. Por favor, tente novamente amanhã."
      });
    }

    await db.run(
      "INSERT INTO ai_usage (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1",
      [todayStr]
    );

    // 3. Filter products that actually require attention to save token quota and speed up the response
    const filteredProductsData = productsData.filter((p: any) => {
      const isLowStock = p.stock_qty <= p.min_stock;
      const isDecliningSales = p.qty_last_15_days < p.qty_prev_15_days;
      const isDeadStock = p.qty_last_15_days === 0 && p.qty_prev_15_days === 0 && p.stock_qty > 0;
      return isLowStock || isDecliningSales || isDeadStock;
    });

    // 4. Prepare Prompt for Gemini API
    const prompt = `Você é um analista de dados especialista em varejo, inteligência de estoque e layout espacial de supermercados de bairro.
Analise os seguintes dados de produtos, estoque e vendas (quantidades vendidas nos últimos 15 dias vs 15 dias anteriores):

${JSON.stringify(filteredProductsData, null, 2)}

Aqui está o mapeamento atual do layout físico das seções na loja (coordenadas x, y no grid do mapa de 16x12, largura, altura, e as categorias/produtos alocados em cada seção):
${JSON.stringify(layoutZones, null, 2)}

Com base nos dados de vendas e no mapa físico do mercado, identifique tendências e gere uma lista de recomendações práticas, acionáveis e espaciais.
Analise especificamente:
1. Queda de vendas: produtos cuja venda nos últimos 15 dias caiu significativamente. Sugira reposicionar o item fisicamente usando o mapa (ex: "mover refrigerante de Gôndola X para Geladeira Y").
2. Produtos parados: com estoque disponível mas sem giro recente. Recomende movê-los para gôndolas com categorias mais populares ou para gôndolas promocionais perto do caixa (coordenadas de checkout).
3. Reposição de estoque: produtos abaixo do mínimo.
4. Insights de Layout do Mercado: sugira alterações estratégicas de proximidade e posicionamento físico (planograma) com base nas seções e corredores da loja física.

Responda OBRIGATORIAMENTE em formato JSON válido, contendo um array de objetos com a seguinte estrutura:
[
  {
    "produto_id": number (ou null se for geral),
    "nome_produto": "Nome do Produto" (ou "Geral" para layout de loja),
    "categoria": "Categoria do Produto",
    "status": "queda_vendas" | "parado" | "estoque_baixo" | "layout_geral",
    "titulo": "Título curto da recomendação",
    "descricao": "Explicação detalhada contendo a justificativa dos dados (ex: 'vendas caíram de X para Y') e a recomendação acionável.",
    "sugestao_preco": number (preço de venda sugerido opcional se for criar promoção, senão null),
    "tipo_acao": "promocao" | "compra" | "layout" | "outro"
  }
]
Não adicione blocos de markdown (\`\`\`json ou \`\`\`), comentários de código, nem qualquer texto de introdução ou conclusão. Retorne APENAS o JSON puro.`;

    // 5. Send request to Google Gemini API (with retries on transient errors)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`;
    let responseText = "";
    let lastError: any = null;
    let delay = 500;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: prompt
                  }
                ]
              }
            ]
          })
        });

        if (response.ok) {
          const data: any = await response.json();
          responseText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (responseText) {
            break;
          }
        }

        const errorText = await response.text();
        lastError = new Error(`Erro na chamada da API do Gemini: ${response.status} - ${errorText}`);
      } catch (err: any) {
        lastError = err;
      }

      if (attempt < 3) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    if (!responseText) {
      throw lastError || new Error("Resposta vazia da API do Gemini.");
    }

    // Clean markdown formatting if returned (sometimes models ignore responseMimeType instructions)
    let cleanText = responseText.trim();
    if (cleanText.startsWith("```")) {
      cleanText = cleanText.replace(/^```json\s*/, "").replace(/```$/, "").trim();
    }

    const parsedRecommendations = JSON.parse(cleanText);
    res.json({
      isMock: false,
      recommendations: parsedRecommendations
    });

  } catch (err: any) {
    console.error("Erro ao chamar API do Gemini (usando fallback local):", err.message);

    // Fallback: se a API do Gemini falhar (ex: erro 503 por alta demanda), retornamos dados locais simulados.
    const fallbackData = [
      {
        "produto_id": 7,
        "nome_produto": "Refrigerante Cola 2L",
        "categoria": "Bebidas",
        "status": "queda_vendas",
        "titulo": "Queda nas vendas de Refrigerante Cola 2L",
        "descricao": "As vendas deste item registraram queda de aproximadamente 40% na quinzena atual. Sugerimos reposicionar este produto em geladeira visível próxima ao caixa ou criar uma oferta combinada com salgadinhos nos fins de semana.",
        "sugestao_preco": 7.99,
        "tipo_acao": "promocao"
      },
      {
        "produto_id": 13,
        "nome_produto": "Amaciante de Roupas 2L",
        "categoria": "Limpeza",
        "status": "parado",
        "titulo": "Produto Parado em Estoque (Sem Giro)",
        "descricao": "Há 25 unidades de Amaciante de Roupas em estoque e nenhuma venda foi efetuada nos últimos 30 dias. Recomendamos criar um desconto de 15% ou colocá-lo em uma ilha de destaque na entrada do corredor de limpeza.",
        "sugestao_preco": 13.90,
        "tipo_acao": "layout"
      },
      {
        "produto_id": 10,
        "nome_produto": "Pão de Forma Tradicional",
        "categoria": "Alimentos",
        "status": "estoque_baixo",
        "titulo": "Estoque abaixo do Mínimo Recomendado",
        "descricao": "O estoque atual (4 unidades) está abaixo do mínimo (5 unidades). Realize o pedido de compra imediatamente para evitar ruptura de prateleira.",
        "sugestao_preco": null,
        "tipo_acao": "compra"
      },
      {
        "produto_id": null,
        "nome_produto": "Geral",
        "categoria": "Mercadológico",
        "status": "layout_geral",
        "titulo": "Otimização de Compra por Impulso (Layout)",
        "descricao": "Com base na queda geral de itens matinais, sugerimos posicionar os cafés especiais e bolachas artesanais próximos à seção de pães frescos, impulsionando a venda cruzada.",
        "sugestao_preco": null,
        "tipo_acao": "layout"
      }
    ];

    res.json({
      isMock: true,
      recommendations: fallbackData,
      fallbackReason: `API do Gemini temporariamente indisponível. Motivo: ${err.message}`
    });
  }
});// 5.8. Store Layout Mapping Routes
app.get('/api/layout/zones', async (req, res) => {
  const db = await getDb();
  try {
    const zones = await db.all("SELECT * FROM layout_zones");
    const items = await db.all(`
      SELECT 
        lzi.id as item_id,
        lzi.zone_id,
        lzi.product_id,
        lzi.category_id,
        p.name as product_name,
        p.barcode as product_barcode,
        c.name as category_name
      FROM layout_zone_items lzi
      LEFT JOIN products p ON lzi.product_id = p.id
      LEFT JOIN categories c ON lzi.category_id = c.id
    `);

    const salesData = await db.all(`
      SELECT 
        lzi.zone_id,
        SUM(si.price_total) as total_sales
      FROM layout_zone_items lzi
      LEFT JOIN products p ON lzi.product_id = p.id OR (lzi.category_id = p.category_id AND lzi.product_id IS NULL)
      LEFT JOIN sale_items si ON p.id = si.product_id
      LEFT JOIN sales s ON si.sale_id = s.id AND s.created_at >= datetime('now', '-30 days')
      GROUP BY lzi.zone_id
    `);

    const salesMap = new Map<number, number>();
    for (const s of salesData) {
      salesMap.set(s.zone_id, s.total_sales || 0);
    }

    const zonesWithItems = zones.map(z => {
      const zoneItems = items.filter(i => i.zone_id === z.id);
      return {
        ...z,
        items: zoneItems,
        sales_30_days: salesMap.get(z.id) || 0
      };
    });

    res.json(zonesWithItems);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/layout/zones', async (req, res) => {
  const db = await getDb();
  const { name, zone_type, x, y, width, height, color } = req.body;
  try {
    const result = await db.run(
      "INSERT INTO layout_zones (name, zone_type, x, y, width, height, color) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [name, zone_type, Number(x), Number(y), Number(width), Number(height), color]
    );
    res.json({ id: result.lastID, name, zone_type, x, y, width, height, color, items: [], sales_30_days: 0 });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/layout/zones/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  const { name, zone_type, x, y, width, height, color } = req.body;
  try {
    await db.run(
      "UPDATE layout_zones SET name = ?, zone_type = ?, x = ?, y = ?, width = ?, height = ?, color = ? WHERE id = ?",
      [name, zone_type, Number(x), Number(y), Number(width), Number(height), color, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/layout/zones/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  try {
    await db.run("DELETE FROM layout_zones WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/layout/zones/:id/items', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  const { category_id, product_id } = req.body;
  try {
    const result = await db.run(
      "INSERT INTO layout_zone_items (zone_id, category_id, product_id) VALUES (?, ?, ?)",
      [id, category_id || null, product_id || null]
    );
    res.json({ id: result.lastID, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/layout/zones/:id/items/:itemId', async (req, res) => {
  const db = await getDb();
  const { itemId } = req.params;
  try {
    await db.run("DELETE FROM layout_zone_items WHERE id = ?", [itemId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


// 6. Authentication Routes
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const db = await getDb();
  try {
    const user = await db.get("SELECT * FROM users WHERE username = ? AND password = ?", [username, password]);
    if (user) {
      res.json({ success: true, user: { username: user.username, role: user.role } });
    } else {
      res.status(401).json({ error: "Usuário ou senha incorretos." });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/manager-check', async (req, res) => {
  const { password } = req.body;
  const db = await getDb();
  try {
    const manager = await db.get("SELECT * FROM users WHERE role IN ('manager', 'admin') AND password = ?", [password]);
    if (manager) {
      res.json({ success: true, username: manager.username });
    } else {
      res.status(401).json({ error: "Senha de gerente inválida." });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Cash Session Routes
app.get('/api/cash/active', async (req, res) => {
  const db = await getDb();
  try {
    const activeSession = await db.get("SELECT * FROM cash_sessions WHERE status = 'open'");
    res.json(activeSession || null);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/cash/open', async (req, res) => {
  const { operator_name, initial_float, pdv_name } = req.body;
  const db = await getDb();
  try {
    const active = await db.get("SELECT id FROM cash_sessions WHERE status = 'open'");
    if (active) {
      return res.status(400).json({ error: "Já existe um caixa aberto." });
    }
    const result = await db.run(
      `INSERT INTO cash_sessions (operator_name, initial_float, pdv_name, status) VALUES (?, ?, ?, 'open')`,
      [operator_name, initial_float, pdv_name || 'Caixa 01']
    );
    const session = await db.get("SELECT * FROM cash_sessions WHERE id = ?", [result.lastID]);
    await logAction('CASH_SESSION_OPEN', operator_name, { initial_float, pdv_name });
    res.status(201).json(session);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
app.post('/api/cash/close', async (req, res) => {
  const { final_cash_reported, final_card_reported, manager_password } = req.body;
  const db = await getDb();
  try {
    const active = await db.get("SELECT * FROM cash_sessions WHERE status = 'open'");
    if (!active) {
      return res.status(400).json({ error: "Nenhum caixa está aberto." });
    }
    
    // Check permission of operator
    const operatorUser = await db.get("SELECT role FROM users WHERE username = ?", [active.operator_name]);
    let closedBy = active.operator_name;
    const isManagerOrAdmin = operatorUser && (operatorUser.role === 'manager' || operatorUser.role === 'admin');

    if (!isManagerOrAdmin) {
      if (!manager_password) {
        return res.status(400).json({ error: "Senha de autorização do gerente é obrigatória." });
      }
      const manager = await db.get("SELECT username FROM users WHERE role IN ('manager', 'admin') AND password = ?", [manager_password]);
      if (!manager) {
        return res.status(401).json({ error: "Senha de gerente inválida." });
      }
      closedBy = manager.username;
    }

    const sessionSales = await db.all(
      "SELECT final_amount, payment_method, payment_details FROM sales WHERE created_at >= ?",
      [active.opened_at]
    );

    let sales_cash = 0.0;
    let sales_pix = 0.0;
    let sales_card = 0.0;
    let sales_fiado = 0.0;

    for (const sale of sessionSales) {
      if (sale.payment_details) {
        try {
          const details = typeof sale.payment_details === 'string' ? JSON.parse(sale.payment_details) : sale.payment_details;
          sales_cash += parseFloat(details.dinheiro || 0);
          sales_pix += parseFloat(details.pix || 0);
          sales_card += parseFloat(details.cartao || 0);
          sales_fiado += parseFloat(details.fiado || 0);
        } catch (e) {
          if (sale.payment_method === 'dinheiro') sales_cash += sale.final_amount;
          else if (sale.payment_method === 'pix') sales_pix += sale.final_amount;
          else if (sale.payment_method === 'cartao') sales_card += sale.final_amount;
          else if (sale.payment_method === 'fiado') sales_fiado += sale.final_amount;
        }
      } else {
        if (sale.payment_method === 'dinheiro') sales_cash += sale.final_amount;
        else if (sale.payment_method === 'pix') sales_pix += sale.final_amount;
        else if (sale.payment_method === 'cartao') sales_card += sale.final_amount;
        else if (sale.payment_method === 'fiado') sales_fiado += sale.final_amount;
      }
    }

    await db.run(
      `UPDATE cash_sessions 
       SET closed_at = CURRENT_TIMESTAMP, 
           final_cash_reported = ?, 
           final_card_reported = ?, 
           sales_cash = ?, 
           sales_pix = ?, 
           sales_card = ?, 
           sales_fiado = ?, 
           status = 'closed',
           closed_by = ?
       WHERE id = ?`,
      [final_cash_reported, final_card_reported || 0.0, sales_cash, sales_pix, sales_card, sales_fiado, closedBy, active.id]
    );
    
    const closed = await db.get("SELECT * FROM cash_sessions WHERE id = ?", [active.id]);
    await logAction('CASH_SESSION_CLOSE', active.operator_name, { 
      pdv_name: active.pdv_name, 
      final_cash_reported, 
      final_card_reported: final_card_reported || 0.0,
      sales_cash, 
      discrepancy: final_cash_reported - (active.initial_float + sales_cash),
      authorized_by: closedBy
    });
    res.json(closed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET all cash sessions (for dashboard reporting)
app.get('/api/cash/sessions', async (req, res) => {
  const db = await getDb();
  try {
    const sessions = await db.all("SELECT * FROM cash_sessions ORDER BY opened_at DESC");
    res.json(sessions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. User Management Routes
app.get('/api/users', async (req, res) => {
  const db = await getDb();
  try {
    const users = await db.all("SELECT id, username, role FROM users ORDER BY username ASC");
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, role, operator_name } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: "Nome de usuário, senha e perfil são obrigatórios." });
  }
  const db = await getDb();
  try {
    const result = await db.run(
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
      [username, password, role]
    );
    await logAction('USER_CREATE', operator_name || 'Gerente', { id: result.lastID, username, role });
    res.status(201).json({ id: result.lastID, username, role });
  } catch (err: any) {
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "Este nome de usuário já está cadastrado." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const operator = (req.query.operator_name as string) || 'Gerente';
  const db = await getDb();
  try {
    const user = await db.get("SELECT username FROM users WHERE id = ?", [id]);
    await db.run("DELETE FROM users WHERE id = ?", [id]);
    await logAction('USER_DELETE', operator, { id, username: user?.username });
    res.json({ success: true, message: "Usuário excluído com sucesso." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Supplier Management Routes
app.get('/api/suppliers', async (req, res) => {
  const db = await getDb();
  try {
    const suppliers = await db.all("SELECT * FROM suppliers ORDER BY name ASC");
    res.json(suppliers);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/suppliers', async (req, res) => {
  const { name, cnpj, phone, email, operator_name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Nome do fornecedor é obrigatório." });
  }
  const db = await getDb();
  try {
    const result = await db.run(
      "INSERT INTO suppliers (name, cnpj, phone, email) VALUES (?, ?, ?, ?)",
      [name, cnpj || null, phone || null, email || null]
    );
    const supplier = await db.get("SELECT * FROM suppliers WHERE id = ?", [result.lastID]);
    await logAction('SUPPLIER_CREATE', operator_name || 'Gerente', { id: result.lastID, name });
    res.status(201).json(supplier);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suppliers/:id', async (req, res) => {
  const { id } = req.params;
  const operator = (req.query.operator_name as string) || 'Gerente';
  const db = await getDb();
  try {
    // Check if supplier is used in accounts payable
    const inUse = await db.get("SELECT id FROM accounts_payable WHERE supplier_id = ? LIMIT 1", [id]);
    if (inUse) {
      return res.status(400).json({ error: "Não é possível excluir este fornecedor pois ele possui contas a pagar associadas." });
    }
    const supplier = await db.get("SELECT name FROM suppliers WHERE id = ?", [id]);
    await db.run("DELETE FROM suppliers WHERE id = ?", [id]);
    await logAction('SUPPLIER_DELETE', operator, { id, name: supplier?.name });
    res.json({ success: true, message: "Fornecedor excluído com sucesso." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 10. Accounts Payable Routes
app.get('/api/payable', async (req, res) => {
  const db = await getDb();
  try {
    const accounts = await db.all(`
      SELECT ap.*, s.name as supplier_name 
      FROM accounts_payable ap 
      LEFT JOIN suppliers s ON ap.supplier_id = s.id 
      ORDER BY ap.due_date ASC
    `);
    res.json(accounts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payable', async (req, res) => {
  const { supplier_id, description, amount, due_date, boleto_file, operator_name } = req.body;
  if (!description || !amount || !due_date) {
    return res.status(400).json({ error: "Descrição, valor e data de vencimento são obrigatórios." });
  }
  const db = await getDb();
  try {
    const result = await db.run(
      "INSERT INTO accounts_payable (supplier_id, description, amount, due_date, status, boleto_file) VALUES (?, ?, ?, ?, 'pending', ?)",
      [supplier_id || null, description, amount, due_date, boleto_file || null]
    );
    const account = await db.get(`
      SELECT ap.*, s.name as supplier_name 
      FROM accounts_payable ap 
      LEFT JOIN suppliers s ON ap.supplier_id = s.id 
      WHERE ap.id = ?
    `, [result.lastID]);
    await logAction('PAYABLE_CREATE', operator_name || 'Gerente', { id: result.lastID, description, amount });
    res.status(201).json(account);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/payable/:id/pay', async (req, res) => {
  const { id } = req.params;
  const { status, operator_name } = req.body; // 'paid' or 'pending'
  const db = await getDb();
  try {
    const paidAt = status === 'paid' ? new Date().toISOString() : null;
    await db.run(
      "UPDATE accounts_payable SET status = ?, paid_at = ? WHERE id = ?",
      [status, paidAt, id]
    );
    const account = await db.get(`
      SELECT ap.*, s.name as supplier_name 
      FROM accounts_payable ap 
      LEFT JOIN suppliers s ON ap.supplier_id = s.id 
      WHERE ap.id = ?
    `, [id]);
    await logAction('PAYABLE_PAY', operator_name || 'Gerente', { id, status, description: account?.description, amount: account?.amount });
    res.json(account);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/payable/:id', async (req, res) => {
  const { id } = req.params;
  const operator = (req.query.operator_name as string) || 'Gerente';
  const db = await getDb();
  try {
    const account = await db.get("SELECT description, amount FROM accounts_payable WHERE id = ?", [id]);
    await db.run("DELETE FROM accounts_payable WHERE id = ?", [id]);
    await logAction('PAYABLE_DELETE', operator, { id, description: account?.description, amount: account?.amount });
    res.json({ success: true, message: "Conta a pagar excluída com sucesso." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 11. Category & Subcategory Management (Mercadológico)
app.get('/api/categories', async (req, res) => {
  const db = await getDb();
  try {
    const cats = await db.all("SELECT * FROM categories ORDER BY name ASC");
    res.json(cats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/categories', async (req, res) => {
  const { name, operator_name } = req.body;
  if (!name) return res.status(400).json({ error: "Nome da categoria é obrigatório." });
  const db = await getDb();
  try {
    const result = await db.run("INSERT INTO categories (name) VALUES (?)", [name]);
    await logAction('CATEGORY_CREATE', operator_name || 'Gerente', { id: result.lastID, name });
    res.status(201).json({ id: result.lastID, name });
  } catch (err: any) {
    res.status(400).json({ error: "Categoria já existe ou erro interno." });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  const operator = (req.query.operator_name as string) || 'Gerente';
  const db = await getDb();
  try {
    const inUse = await db.get("SELECT id FROM products WHERE category_id = ? LIMIT 1", [id]);
    if (inUse) {
      return res.status(400).json({ error: "Não é possível excluir esta categoria pois ela possui produtos vinculados." });
    }
    const cat = await db.get("SELECT name FROM categories WHERE id = ?", [id]);
    await db.run("DELETE FROM categories WHERE id = ?", [id]);
    await logAction('CATEGORY_DELETE', operator, { id, name: cat?.name });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/subcategories', async (req, res) => {
  const db = await getDb();
  const categoryId = req.query.category_id;
  try {
    let subcats;
    if (categoryId) {
      subcats = await db.all("SELECT * FROM subcategories WHERE category_id = ? ORDER BY name ASC", [categoryId]);
    } else {
      subcats = await db.all("SELECT * FROM subcategories ORDER BY name ASC");
    }
    res.json(subcats);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/subcategories', async (req, res) => {
  const { category_id, name, operator_name } = req.body;
  if (!category_id || !name) return res.status(400).json({ error: "Categoria e nome da subcategoria são obrigatórios." });
  const db = await getDb();
  try {
    const result = await db.run("INSERT INTO subcategories (category_id, name) VALUES (?, ?)", [category_id, name]);
    await logAction('SUBCATEGORY_CREATE', operator_name || 'Gerente', { id: result.lastID, category_id, name });
    res.status(201).json({ id: result.lastID, category_id, name });
  } catch (err: any) {
    res.status(400).json({ error: "Subcategoria já existe para esta categoria." });
  }
});

app.delete('/api/subcategories/:id', async (req, res) => {
  const { id } = req.params;
  const operator = (req.query.operator_name as string) || 'Gerente';
  const db = await getDb();
  try {
    const inUse = await db.get("SELECT id FROM products WHERE subcategory_id = ? LIMIT 1", [id]);
    if (inUse) {
      return res.status(400).json({ error: "Não é possível excluir esta subcategoria pois ela possui produtos vinculados." });
    }
    const subcat = await db.get("SELECT name FROM subcategories WHERE id = ?", [id]);
    await db.run("DELETE FROM subcategories WHERE id = ?", [id]);
    await logAction('SUBCATEGORY_DELETE', operator, { id, name: subcat?.name });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 12. Bulk Product Edit
app.post('/api/products/bulk-edit', async (req, res) => {
  const { ids, category_id, subcategory_id, price_sell_adjust, operator_name } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Lote de IDs inválido." });
  }
  const db = await getDb();
  try {
    await db.run("BEGIN TRANSACTION");
    
    let finalCategoryName = null;
    if (category_id) {
      const cat = await db.get("SELECT name FROM categories WHERE id = ?", [category_id]);
      if (cat) finalCategoryName = cat.name;
    }

    for (const id of ids) {
      if (category_id !== undefined) {
        await db.run("UPDATE products SET category_id = ?, category = COALESCE(?, category) WHERE id = ?", [category_id, finalCategoryName, id]);
      }
      if (subcategory_id !== undefined) {
        await db.run("UPDATE products SET subcategory_id = ? WHERE id = ?", [subcategory_id, id]);
      }
      if (price_sell_adjust) {
        const prod = await db.get("SELECT price_sell FROM products WHERE id = ?", [id]);
        if (prod) {
          let newPrice = prod.price_sell;
          if (price_sell_adjust.type === 'percent') {
            newPrice = prod.price_sell * (1 + parseFloat(price_sell_adjust.value) / 100);
          } else if (price_sell_adjust.type === 'fixed') {
            newPrice = prod.price_sell + parseFloat(price_sell_adjust.value);
          }
          await db.run("UPDATE products SET price_sell = ? WHERE id = ?", [Math.max(0, newPrice), id]);
        }
      }
    }
    await db.run("COMMIT");
    await logAction('PRODUCT_BULK_EDIT', operator_name || 'Gerente', { ids_count: ids.length, category_id, subcategory_id, price_sell_adjust });
    res.json({ success: true, message: `${ids.length} produtos alterados com sucesso.` });
  } catch (err: any) {
    await db.run("ROLLBACK");
    res.status(500).json({ error: err.message });
  }
});

// 13. Stock Inventory & Adjustments
app.get('/api/inventory/adjustments', async (req, res) => {
  const db = await getDb();
  try {
    const list = await db.all(`
      SELECT ia.*, p.name as product_name, p.barcode 
      FROM inventory_adjustments ia
      JOIN products p ON ia.product_id = p.id
      ORDER BY ia.created_at DESC
    `);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inventory/adjust', async (req, res) => {
  const { product_id, new_stock, reason, operator_name } = req.body;
  if (!product_id || new_stock === undefined || !reason) {
    return res.status(400).json({ error: "Produto, novo estoque e justificativa são obrigatórios." });
  }
  const db = await getDb();
  try {
    const prod = await db.get("SELECT stock_qty, name FROM products WHERE id = ?", [product_id]);
    if (!prod) return res.status(404).json({ error: "Produto não encontrado." });

    const previous_stock = prod.stock_qty;
    
    await db.run("BEGIN TRANSACTION");
    await db.run("UPDATE products SET stock_qty = ? WHERE id = ?", [new_stock, product_id]);
    await db.run(
      `INSERT INTO inventory_adjustments (product_id, previous_stock, new_stock, reason, operator_name)
       VALUES (?, ?, ?, ?, ?)`,
      [product_id, previous_stock, new_stock, reason, operator_name || 'Gerente']
    );
    await db.run("COMMIT");
    
    await logAction('STOCK_ADJUST', operator_name || 'Gerente', { 
      product_id, 
      product_name: prod.name, 
      previous_stock, 
      new_stock, 
      reason 
    });
    
    res.json({ success: true, message: `Estoque do produto ${prod.name} ajustado com sucesso de ${previous_stock} para ${new_stock}.` });
  } catch (err: any) {
    await db.run("ROLLBACK");
    res.status(500).json({ error: err.message });
  }
});

// 14. System Logs
app.get('/api/logs', async (req, res) => {
  const db = await getDb();
  try {
    const logs = await db.all("SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT 200");
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 15. User creation log audit additions
// Log action is called directly in user creation endpoint

// 16. Administrative Reset Endpoint (Clean all tables)
app.post('/api/reset', async (req, res) => {
  const db = await getDb();
  try {
    // Safe SQLite reset
    await db.exec("DROP TABLE IF EXISTS role_permissions");
    await db.exec("DROP TABLE IF EXISTS roles");
    await db.exec("DROP TABLE IF EXISTS terminals");
    await db.exec("DROP TABLE IF EXISTS inventory_adjustments");
    await db.exec("DROP TABLE IF EXISTS system_logs");
    await db.exec("DROP TABLE IF EXISTS subcategories");
    await db.exec("DROP TABLE IF EXISTS categories");
    await db.exec("DROP TABLE IF EXISTS accounts_payable");
    await db.exec("DROP TABLE IF EXISTS suppliers");
    await db.exec("DROP TABLE IF EXISTS cash_sessions");
    await db.exec("DROP TABLE IF EXISTS users");
    await db.exec("DROP TABLE IF EXISTS sale_items");
    await db.exec("DROP TABLE IF EXISTS sales");
    await db.exec("DROP TABLE IF EXISTS customers");
    await db.exec("DROP TABLE IF EXISTS products");
    await initDb();
    res.json({ success: true, message: "Banco de dados reiniciado com sucesso." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 17. Terminals Routes (PDVs)
app.get('/api/terminals', async (req, res) => {
  const db = await getDb();
  try {
    const terminals = await db.all("SELECT * FROM terminals ORDER BY name ASC");
    res.json(terminals);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/terminals', async (req, res) => {
  const { name, operator_name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Nome do caixa é obrigatório." });
  }
  const db = await getDb();
  try {
    const result = await db.run(
      "INSERT INTO terminals (name) VALUES (?)",
      [name.trim()]
    );
    const terminal = await db.get("SELECT * FROM terminals WHERE id = ?", [result.lastID]);
    await logAction('TERMINAL_CREATE', operator_name || 'Gerente', { id: result.lastID, name: name.trim() });
    res.status(201).json(terminal);
  } catch (err: any) {
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "Já existe um caixa com este nome." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/terminals/:id', async (req, res) => {
  const { id } = req.params;
  const operator = (req.query.operator_name as string) || 'Gerente';
  const db = await getDb();
  try {
    const term = await db.get("SELECT name FROM terminals WHERE id = ?", [id]);
    if (!term) {
      return res.status(404).json({ error: "Caixa não encontrado." });
    }
    // Check if terminal has associated sessions
    const inUse = await db.get("SELECT id FROM cash_sessions WHERE pdv_name = ? LIMIT 1", [term.name]);
    if (inUse) {
      return res.status(400).json({ error: "Não é possível excluir este caixa pois ele já possui sessões de abertura/fechamento gravadas." });
    }
    await db.run("DELETE FROM terminals WHERE id = ?", [id]);
    await logAction('TERMINAL_DELETE', operator, { id, name: term.name });
    res.json({ success: true, message: "Caixa excluído com sucesso." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 18. Roles & Module Permissions Routes
app.get('/api/roles', async (req, res) => {
  const db = await getDb();
  try {
    const roles = await db.all("SELECT * FROM roles ORDER BY name ASC");
    for (const role of roles) {
      role.permissions = await db.all(
        "SELECT module_name, can_view, can_write FROM role_permissions WHERE role_id = ?",
        [role.id]
      );
    }
    res.json(roles);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/roles', async (req, res) => {
  const { name, description, operator_name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Nome do cargo é obrigatório." });
  }
  const db = await getDb();
  try {
    await db.run("BEGIN TRANSACTION");
    const result = await db.run(
      "INSERT INTO roles (name, description) VALUES (?, ?)",
      [name.trim().toLowerCase(), description || '']
    );
    const roleId = result.lastID;
    
    const modules = [
      'pos', 'dashboard', 'products', 'categories', 'adjustments', 'logs',
      'customers', 'payable', 'cash_sessions', 'sales', 'terminals', 'users',
      'employees', 'promotions', 'fiscal', 'invoice', 'inventory'
    ];
    
    for (const mod of modules) {
      await db.run(
        "INSERT INTO role_permissions (role_id, module_name, can_view, can_write) VALUES (?, ?, 0, 0)",
        [roleId, mod]
      );
    }
    await db.run("COMMIT");
    
    const newRole = await db.get("SELECT * FROM roles WHERE id = ?", [roleId]);
    newRole.permissions = await db.all(
      "SELECT module_name, can_view, can_write FROM role_permissions WHERE role_id = ?",
      [roleId]
    );
    
    await logAction('ROLE_CREATE', operator_name || 'Gerente', { id: roleId, name: name.trim().toLowerCase() });
    res.status(201).json(newRole);
  } catch (err: any) {
    await db.run("ROLLBACK");
    if (err.message.includes("UNIQUE")) {
      return res.status(400).json({ error: "Já existe um cargo com este nome." });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/roles/:id/permissions', async (req, res) => {
  const { id } = req.params;
  const { permissions, operator_name } = req.body;
  const db = await getDb();
  try {
    await db.run("BEGIN TRANSACTION");
    for (const perm of permissions) {
      await db.run(
        `UPDATE role_permissions 
         SET can_view = ?, can_write = ? 
         WHERE role_id = ? AND module_name = ?`,
        [perm.can_view ? 1 : 0, perm.can_write ? 1 : 0, id, perm.module_name]
      );
    }
    await db.run("COMMIT");
    
    const updatedRole = await db.get("SELECT * FROM roles WHERE id = ?", [id]);
    updatedRole.permissions = await db.all(
      "SELECT module_name, can_view, can_write FROM role_permissions WHERE role_id = ?",
      [id]
    );
    
    await logAction('ROLE_PERMISSIONS_UPDATE', operator_name || 'Gerente', { id, name: updatedRole.name });
    res.json(updatedRole);
  } catch (err: any) {
    await db.run("ROLLBACK");
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/roles/:id', async (req, res) => {
  const { id } = req.params;
  const operator = (req.query.operator_name as string) || 'Gerente';
  const db = await getDb();
  try {
    const role = await db.get("SELECT name FROM roles WHERE id = ?", [id]);
    if (!role) {
      return res.status(404).json({ error: "Cargo não encontrado." });
    }
    if (['admin', 'manager', 'cashier'].includes(role.name)) {
      return res.status(400).json({ error: "Cargos do sistema (admin, manager, cashier) não podem ser excluídos." });
    }
    
    const inUse = await db.get("SELECT id FROM users WHERE role = ? LIMIT 1", [role.name]);
    if (inUse) {
      return res.status(400).json({ error: "Não é possível excluir este cargo pois existem usuários associados a ele." });
    }
    
    await db.run("DELETE FROM roles WHERE id = ?", [id]);
    await logAction('ROLE_DELETE', operator, { id, name: role.name });
    res.json({ success: true, message: "Cargo excluído com sucesso." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/users/permissions/:roleName', async (req, res) => {
  const { roleName } = req.params;
  const db = await getDb();
  try {
    const role = await db.get("SELECT id FROM roles WHERE name = ?", [roleName]);
    if (!role) {
      const isManagerOrAdmin = roleName === 'manager' || roleName === 'admin';
      const isCashier = roleName === 'cashier';
      const modules = [
        'pos', 'dashboard', 'products', 'categories', 'adjustments', 'logs',
        'customers', 'payable', 'cash_sessions', 'sales', 'terminals', 'users',
        'employees', 'promotions', 'fiscal', 'invoice', 'inventory'
      ];
      const fallbackPerms = modules.map(m => ({
        module_name: m,
        can_view: (isManagerOrAdmin || (isCashier && m === 'pos')) ? 1 : 0,
        can_write: (isManagerOrAdmin || (isCashier && m === 'pos')) ? 1 : 0
      }));
      return res.json(fallbackPerms);
    }
    const permissions = await db.all(
      "SELECT module_name, can_view, can_write FROM role_permissions WHERE role_id = ?",
      [role.id]
    );
    res.json(permissions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 19. Fiscal Routes (NFC-e and received invoices)
app.get('/api/fiscal/settings', async (req, res) => {
  const db = await getDb();
  try {
    const settings = await db.get(`
      SELECT id, cnpj, razao_social, inscricao_estadual, environment, state, csc_id, csc_token, (certificate_pfx IS NOT NULL) as has_certificate,
             default_cfop, default_origin, default_csosn, default_cst_pis, default_cst_cofins, default_aliquot_icms, default_aliquot_pis, default_aliquot_cofins
      FROM fiscal_settings LIMIT 1
    `);
    res.json(settings || { 
      cnpj: '', razao_social: '', inscricao_estadual: '', environment: 2, state: 'PE', csc_id: '', csc_token: '', has_certificate: false,
      default_cfop: '5102', default_origin: '0', default_csosn: '102', default_cst_pis: '49', default_cst_cofins: '49',
      default_aliquot_icms: 18.0, default_aliquot_pis: 0.0, default_aliquot_cofins: 0.0
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fiscal/settings', async (req, res) => {
  const { 
    cnpj, razao_social, inscricao_estadual, environment, state, csc_id, csc_token, certificate_pfx, certificate_password, operator_name,
    default_cfop, default_origin, default_csosn, default_cst_pis, default_cst_cofins, default_aliquot_icms, default_aliquot_pis, default_aliquot_cofins
  } = req.body;
  const db = await getDb();
  try {
    const existing = await db.get("SELECT id FROM fiscal_settings LIMIT 1");
    if (existing) {
      if (certificate_pfx === undefined) {
        await db.run(
          `UPDATE fiscal_settings 
           SET cnpj = ?, razao_social = ?, inscricao_estadual = ?, environment = ?, state = ?, csc_id = ?, csc_token = ?,
               default_cfop = ?, default_origin = ?, default_csosn = ?, default_cst_pis = ?, default_cst_cofins = ?,
               default_aliquot_icms = ?, default_aliquot_pis = ?, default_aliquot_cofins = ?
           WHERE id = ?`,
          [
            cnpj, razao_social, inscricao_estadual, environment, state || 'PE', csc_id, csc_token,
            default_cfop || '5102', default_origin || '0', default_csosn || '102', default_cst_pis || '49', default_cst_cofins || '49',
            default_aliquot_icms !== undefined ? parseFloat(default_aliquot_icms) : 18.0,
            default_aliquot_pis !== undefined ? parseFloat(default_aliquot_pis) : 0.0,
            default_aliquot_cofins !== undefined ? parseFloat(default_aliquot_cofins) : 0.0,
            existing.id
          ]
        );
      } else {
        await db.run(
          `UPDATE fiscal_settings 
           SET cnpj = ?, razao_social = ?, inscricao_estadual = ?, environment = ?, state = ?, csc_id = ?, csc_token = ?, certificate_pfx = ?, certificate_password = ?,
               default_cfop = ?, default_origin = ?, default_csosn = ?, default_cst_pis = ?, default_cst_cofins = ?,
               default_aliquot_icms = ?, default_aliquot_pis = ?, default_aliquot_cofins = ?
           WHERE id = ?`,
          [
            cnpj, razao_social, inscricao_estadual, environment, state || 'PE', csc_id, csc_token, certificate_pfx, certificate_password,
            default_cfop || '5102', default_origin || '0', default_csosn || '102', default_cst_pis || '49', default_cst_cofins || '49',
            default_aliquot_icms !== undefined ? parseFloat(default_aliquot_icms) : 18.0,
            default_aliquot_pis !== undefined ? parseFloat(default_aliquot_pis) : 0.0,
            default_aliquot_cofins !== undefined ? parseFloat(default_aliquot_cofins) : 0.0,
            existing.id
          ]
        );
      }
    } else {
      await db.run(
        `INSERT INTO fiscal_settings (cnpj, razao_social, inscricao_estadual, environment, state, csc_id, csc_token, certificate_pfx, certificate_password,
                                     default_cfop, default_origin, default_csosn, default_cst_pis, default_cst_cofins,
                                     default_aliquot_icms, default_aliquot_pis, default_aliquot_cofins)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cnpj, razao_social, inscricao_estadual, environment, state || 'PE', csc_id, csc_token, certificate_pfx || null, certificate_password || null,
          default_cfop || '5102', default_origin || '0', default_csosn || '102', default_cst_pis || '49', default_cst_cofins || '49',
          default_aliquot_icms !== undefined ? parseFloat(default_aliquot_icms) : 18.0,
          default_aliquot_pis !== undefined ? parseFloat(default_aliquot_pis) : 0.0,
          default_aliquot_cofins !== undefined ? parseFloat(default_aliquot_cofins) : 0.0
        ]
      );
    }
    await logAction('FISCAL_SETTINGS_UPDATE', operator_name || 'Gerente', { cnpj, environment });
    res.json({ success: true, message: "Configurações fiscais salvas com sucesso." });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fiscal/sync-received', async (req, res) => {
  const { cnpj } = req.body;
  if (!cnpj) return res.status(400).json({ error: "CNPJ é obrigatório." });
  try {
    const list = await FiscalService.syncReceivedInvoices(cnpj);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fiscal/manifest-and-download', async (req, res) => {
  const { cnpj, chave, type } = req.body;
  if (!cnpj || !chave) return res.status(400).json({ error: "CNPJ e Chave de Acesso são obrigatórios." });
  try {
    await FiscalService.manifestInvoice(cnpj, chave, type || 'ciencia');
    const xml = await FiscalService.downloadInvoiceXml(cnpj, chave);
    res.json({ success: true, xml });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/best-buy-day', async (req, res) => {
  const db = await getDb();
  try {
    // 1. Sales by weekday (last 90 days)
    const salesByWeekDay = await db.all(`
      SELECT CAST(strftime('%w', created_at) AS INTEGER) as weekday, 
             SUM(final_amount) as total_sales, 
             COUNT(*) as count_sales
      FROM sales
      WHERE created_at >= date('now', '-90 days')
      GROUP BY weekday
      ORDER BY weekday ASC
    `);

    // 2. Sales by day of month (last 90 days)
    const salesByDayOfMonth = await db.all(`
      SELECT CAST(strftime('%d', created_at) AS INTEGER) as day, 
             SUM(final_amount) as total_sales
      FROM sales
      WHERE created_at >= date('now', '-90 days')
      GROUP BY day
      ORDER BY day ASC
    `);

    // 3. Pending payables by day of month
    const payablesByDayOfMonth = await db.all(`
      SELECT CAST(strftime('%d', due_date) AS INTEGER) as day, 
             SUM(amount) as total_payable
      FROM accounts_payable
      WHERE status = 'pending'
      GROUP BY day
      ORDER BY day ASC
    `);

    // Map weekday numbers to Portuguese names
    const weekdayNames = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

    // Find the peak sales weekday
    let peakWeekday = 5; // Default: Sexta-feira
    let maxWeekdaySales = 0;
    salesByWeekDay.forEach((item: any) => {
      if (item.total_sales > maxWeekdaySales) {
        maxWeekdaySales = item.total_sales;
        peakWeekday = item.weekday;
      }
    });
    // Best purchase weekday is typically 1-2 days before peak
    const bestWeekdayIndex = (peakWeekday - 2 + 7) % 7;
    const recommendedWeekdayName = weekdayNames[bestWeekdayIndex];

    // Find the peak sales day of month
    let peakDayOfMonth = 10;
    let maxDaySales = 0;
    salesByDayOfMonth.forEach((item: any) => {
      if (item.total_sales > maxDaySales) {
        maxDaySales = item.total_sales;
        peakDayOfMonth = item.day;
      }
    });
    // Recommend buying 3 days before monthly sales peak
    let recommendedDayOfMonth = peakDayOfMonth - 3;
    if (recommendedDayOfMonth <= 0) recommendedDayOfMonth = 28;

    // Identify days of month with high concentrations of payable accounts
    const heavyPayableDays = payablesByDayOfMonth
      .filter((item: any) => item.total_payable > 0)
      .map((item: any) => item.day);

    res.json({
      salesByWeekDay: salesByWeekDay.map((item: any) => ({
        weekday: item.weekday,
        name: weekdayNames[item.weekday],
        total_sales: item.total_sales,
        count_sales: item.count_sales
      })),
      salesByDayOfMonth,
      payablesByDayOfMonth,
      recommendation: {
        bestWeekday: recommendedWeekdayName,
        bestDayOfMonth: recommendedDayOfMonth,
        peakWeekday: weekdayNames[peakWeekday],
        peakDayOfMonth: peakDayOfMonth,
        heavyPayableDays,
        text: `Com base nas vendas dos últimos 90 dias, seu pico semanal de faturamento ocorre às **${weekdayNames[peakWeekday]}s**, tornando **${recommendedWeekdayName}** o melhor dia para abastecer o estoque e garantir prateleiras cheias. Mensalmente, seu maior volume de vendas é concentrado no dia **${peakDayOfMonth}**, portanto, recomendamos realizar compras preventivas por volta do dia **${recommendedDayOfMonth}**. Evite agendar grandes pagamentos para os dias com alta concentração de boletos vencendo (${heavyPayableDays.length > 0 ? 'dias ' + heavyPayableDays.join(', ') : 'nenhum dia com acúmulo no momento'}).`
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fiscal/emit-nfce', async (req, res) => {
  const { sale_id, total_amount, discount, final_amount, cpf_customer, operator_name } = req.body;
  const db = await getDb();
  try {
    const settings = await db.get("SELECT * FROM fiscal_settings LIMIT 1");
    if (!settings) {
      return res.status(400).json({ error: "Módulo fiscal não configurado. Por favor, preencha as configurações fiscais primeiro." });
    }

    try {
      const result = await FiscalService.emitNFCe(
        { sale_id, total_amount, discount, final_amount, cpf_customer },
        settings
      );

      // Log successful invoice emission in the new table
      await db.run(
        `INSERT INTO emitted_invoices (sale_id, chave_acesso, numero_nota, total_amount, discount, final_amount, cpf_customer, protocolo, xml_completo, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'success')`,
        [
          sale_id || null,
          result.chave,
          result.chave.substring(25, 34),
          result.total_amount,
          result.discount,
          result.final_amount,
          cpf_customer || null,
          result.protocol,
          result.xml
        ]
      );

      await logAction('NFCE_EMIT', operator_name || 'Caixa', { sale_id, chave: result.chave });
      res.json(result);
    } catch (emitErr: any) {
      // Log failed invoice emission attempt in the database
      await db.run(
        `INSERT INTO emitted_invoices (sale_id, total_amount, discount, final_amount, cpf_customer, status, erro_mensagem)
         VALUES (?, ?, ?, ?, ?, 'error', ?)`,
        [
          sale_id || null,
          total_amount || 0.0,
          discount || 0.0,
          final_amount || 0.0,
          cpf_customer || null,
          emitErr.message || 'Erro desconhecido na emissão'
        ]
      );
      throw emitErr;
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to query emitted invoices list for the administrative report
app.get('/api/fiscal/emitted-report', async (req, res) => {
  const { startDate, startTime, endDate, endTime, status } = req.query;
  const db = await getDb();
  try {
    let query = `SELECT * FROM emitted_invoices WHERE 1=1`;
    const params: any[] = [];

    if (startDate && startTime && endDate && endTime) {
      const startTimestamp = `${startDate} ${startTime}:00`;
      const endTimestamp = `${endDate} ${endTime}:59`;
      query += ` AND datetime(created_at, 'localtime') >= datetime(?) AND datetime(created_at, 'localtime') <= datetime(?)`;
      params.push(startTimestamp, endTimestamp);
    }

    if (status && status !== 'all') {
      query += ` AND status = ?`;
      params.push(status);
    }

    query += ` ORDER BY created_at DESC`;
    const rows = await db.all(query, params);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint to export all XMLs of successfully emitted invoices in a ZIP archive
app.get('/api/fiscal/export-xmls', async (req, res) => {
  const { startDate, startTime, endDate, endTime } = req.query;
  const db = await getDb();
  try {
    let query = `SELECT chave_acesso, xml_completo FROM emitted_invoices WHERE status = 'success' AND xml_completo IS NOT NULL`;
    const params: any[] = [];

    if (startDate && startTime && endDate && endTime) {
      const startTimestamp = `${startDate} ${startTime}:00`;
      const endTimestamp = `${endDate} ${endTime}:59`;
      query += ` AND datetime(created_at, 'localtime') >= datetime(?) AND datetime(created_at, 'localtime') <= datetime(?)`;
      params.push(startTimestamp, endTimestamp);
    }

    const rows = await db.all(query, params);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Nenhum XML de NFC-e encontrado no período selecionado." });
    }

    const zip = new JSZip();
    rows.forEach((row) => {
      const filename = `${row.chave_acesso}.xml`;
      zip.file(filename, row.xml_completo);
    });

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=xmls_fiscal_${startDate || 'export'}_${endDate || 'export'}.zip`);
    res.send(zipBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// INVENTORY/BALANÇO ENDPOINTS
// ==========================================

// Get all inventory sessions
app.get('/api/inventories', async (req, res) => {
  const db = await getDb();
  try {
    const rows = await db.all('SELECT * FROM inventories ORDER BY created_at DESC');
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific inventory session details & its items
app.get('/api/inventories/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  try {
    const inventory = await db.get('SELECT * FROM inventories WHERE id = ?', [id]);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventário não encontrado' });
    }

    const items = await db.all(`
      SELECT ii.*, p.name as product_name, p.barcode as product_barcode, p.code as product_code, p.unit as product_unit
      FROM inventory_items ii
      JOIN products p ON ii.product_id = p.id
      WHERE ii.inventory_id = ?
      ORDER BY p.name ASC
    `, [id]);

    res.json({
      ...inventory,
      items
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new inventory session
app.post('/api/inventories', async (req, res) => {
  const db = await getDb();
  const { name, operator_name, populate_all } = req.body;
  try {
    if (!name || !operator_name) {
      return res.status(400).json({ error: 'Nome do inventário e operador são obrigatórios.' });
    }

    const result = await db.run(
      'INSERT INTO inventories (name, operator_name, status) VALUES (?, ?, ?)',
      [name, operator_name, 'draft']
    );
    const inventoryId = result.lastID;

    // If populate_all is true, add all existing products in the system to this inventory session
    if (populate_all) {
      const products = await db.all('SELECT id, stock_qty FROM products');
      for (const prod of products) {
        await db.run(
          `INSERT OR IGNORE INTO inventory_items (inventory_id, product_id, expected_qty, counted_qty, difference)
           VALUES (?, ?, ?, 0.0, ?)`,
          [inventoryId, prod.id, prod.stock_qty, -prod.stock_qty]
        );
      }
    }

    res.status(201).json({ id: inventoryId, name, operator_name, status: 'draft' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add or scan product in an inventory session
app.post('/api/inventories/:id/items', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  const { barcode_or_sku, counted_qty, mode } = req.body; // mode: 'add', 'set', 'increment'
  try {
    const inventory = await db.get('SELECT * FROM inventories WHERE id = ?', [id]);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventário não encontrado' });
    }
    if (inventory.status === 'completed') {
      return res.status(400).json({ error: 'Não é possível alterar um inventário concluído' });
    }

    // Look up product by barcode, alternative barcode or internal code
    const product = await db.get(
      `SELECT p.* FROM products p
       LEFT JOIN product_barcodes pb ON p.id = pb.product_id
       WHERE p.barcode = ? OR pb.barcode = ? OR p.code = ?
       GROUP BY p.id`,
      [barcode_or_sku, barcode_or_sku, barcode_or_sku]
    );

    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }

    // Check if item already exists in this inventory session
    const existingItem = await db.get(
      'SELECT * FROM inventory_items WHERE inventory_id = ? AND product_id = ?',
      [id, product.id]
    );

    let newCounted = parseFloat(counted_qty) || 0.0;
    if (existingItem) {
      if (mode === 'increment') {
        newCounted = existingItem.counted_qty + newCounted;
      } else if (mode === 'add') {
        // default behaviour for scanned item is increment by 1 (or 0.1 for kg)
        const step = product.unit === 'kg' ? 0.1 : 1.0;
        newCounted = existingItem.counted_qty + step;
      }
      
      const difference = newCounted - existingItem.expected_qty;
      await db.run(
        'UPDATE inventory_items SET counted_qty = ?, difference = ?, counted_at = CURRENT_TIMESTAMP WHERE id = ?',
        [newCounted, difference, existingItem.id]
      );
    } else {
      let finalCounted = newCounted;
      if (mode === 'add' || mode === 'increment') {
        const step = product.unit === 'kg' ? 0.1 : 1.0;
        finalCounted = step;
      }
      const difference = finalCounted - product.stock_qty;
      await db.run(
        `INSERT INTO inventory_items (inventory_id, product_id, expected_qty, counted_qty, difference, counted_at)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [id, product.id, product.stock_qty, finalCounted, difference]
      );
    }

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update specific item counted quantity directly
app.put('/api/inventories/:id/items/:itemId', async (req, res) => {
  const db = await getDb();
  const { id, itemId } = req.params;
  const { counted_qty } = req.body;
  try {
    const inventory = await db.get('SELECT * FROM inventories WHERE id = ?', [id]);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventário não encontrado' });
    }
    if (inventory.status === 'completed') {
      return res.status(400).json({ error: 'Não é possível alterar um inventário concluído' });
    }

    const item = await db.get('SELECT * FROM inventory_items WHERE id = ?', [itemId]);
    if (!item) {
      return res.status(404).json({ error: 'Item não encontrado' });
    }

    const newCounted = parseFloat(counted_qty);
    const difference = newCounted - item.expected_qty;

    await db.run(
      'UPDATE inventory_items SET counted_qty = ?, difference = ? WHERE id = ?',
      [newCounted, difference, itemId]
    );

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete specific item from inventory session
app.delete('/api/inventories/:id/items/:itemId', async (req, res) => {
  const db = await getDb();
  const { id, itemId } = req.params;
  try {
    const inventory = await db.get('SELECT * FROM inventories WHERE id = ?', [id]);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventário não encontrado' });
    }
    if (inventory.status === 'completed') {
      return res.status(400).json({ error: 'Não é possível alterar um inventário concluído' });
    }

    await db.run('DELETE FROM inventory_items WHERE id = ?', [itemId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Finalize inventory session (Updates product stock_qty in DB and saves logs)
app.post('/api/inventories/:id/finalize', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  try {
    const inventory = await db.get('SELECT * FROM inventories WHERE id = ?', [id]);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventário não encontrado' });
    }
    if (inventory.status === 'completed') {
      return res.status(400).json({ error: 'Este inventário já foi concluído' });
    }

    const items = await db.all('SELECT * FROM inventory_items WHERE inventory_id = ?', [id]);
    if (items.length === 0) {
      return res.status(400).json({ error: 'Não é possível finalizar um inventário sem itens.' });
    }

    // Start database transaction to guarantee ACID integrity
    await db.run('BEGIN TRANSACTION');
    try {
      // 1. Update inventories status
      await db.run(
        "UPDATE inventories SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [id]
      );

      // 2. Loop and update product stocks & insert adjustments logs
      for (const item of items) {
        // Update product stock
        await db.run(
          'UPDATE products SET stock_qty = ? WHERE id = ?',
          [item.counted_qty, item.product_id]
        );

        // Save adjustment log
        await db.run(
          `INSERT INTO inventory_adjustments (product_id, previous_stock, new_stock, reason, operator_name)
           VALUES (?, ?, ?, ?, ?)`,
          [
            item.product_id,
            item.expected_qty,
            item.counted_qty,
            `Balanço de estoque: ${inventory.name}`,
            inventory.operator_name
          ]
        );
      }

      await db.run('COMMIT');
      res.json({ success: true });
    } catch (txErr: any) {
      await db.run('ROLLBACK');
      throw txErr;
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete an entire inventory session
app.delete('/api/inventories/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  try {
    const inventory = await db.get('SELECT * FROM inventories WHERE id = ?', [id]);
    if (!inventory) {
      return res.status(404).json({ error: 'Inventário não encontrado' });
    }
    await db.run('DELETE FROM inventories WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// EMPLOYEES (RH) ENDPOINTS
// ==========================================
app.get('/api/employees', async (req, res) => {
  const db = await getDb();
  try {
    const list = await db.all('SELECT * FROM employees ORDER BY name ASC');
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/employees', async (req, res) => {
  const db = await getDb();
  const { name, cpf, rg, phone, email, role, salary, admission_date, status, documents_info, admission_pdf, dismissal_pdf } = req.body;
  if (!name || !role || salary === undefined || !admission_date) {
    return res.status(400).json({ error: 'Nome, cargo, salário e data de admissão são obrigatórios.' });
  }
  try {
    const result = await db.run(
      `INSERT INTO employees (name, cpf, rg, phone, email, role, salary, admission_date, status, documents_info, admission_pdf, dismissal_pdf)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, cpf || null, rg || null, phone || null, email || null, role, salary, admission_date, status || 'active', documents_info || null, admission_pdf || null, dismissal_pdf || null]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err: any) {
    if (err.message.includes('UNIQUE constraint failed: employees.cpf')) {
      return res.status(400).json({ error: 'Já existe um funcionário cadastrado com este CPF.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  const { name, cpf, rg, phone, email, role, salary, admission_date, status, documents_info, admission_pdf, dismissal_pdf } = req.body;
  if (!name || !role || salary === undefined || !admission_date) {
    return res.status(400).json({ error: 'Nome, cargo, salário e data de admissão são obrigatórios.' });
  }
  try {
    await db.run(
      `UPDATE employees 
       SET name = ?, cpf = ?, rg = ?, phone = ?, email = ?, role = ?, salary = ?, admission_date = ?, status = ?, documents_info = ?, admission_pdf = ?, dismissal_pdf = ?
       WHERE id = ?`,
      [name, cpf || null, rg || null, phone || null, email || null, role, salary, admission_date, status, documents_info || null, admission_pdf || null, dismissal_pdf || null, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    if (err.message.includes('UNIQUE constraint failed: employees.cpf')) {
      return res.status(400).json({ error: 'Já existe um funcionário cadastrado com este CPF.' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  try {
    await db.run('DELETE FROM employees WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// RECURRING ACCOUNTS ENDPOINTS
// ==========================================
app.get('/api/recurring-accounts', async (req, res) => {
  const db = await getDb();
  try {
    const list = await db.all(`
      SELECT r.*, s.name as supplier_name 
      FROM recurring_accounts r
      LEFT JOIN suppliers s ON r.supplier_id = s.id
      ORDER BY r.due_day ASC
    `);
    res.json(list);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/recurring-accounts', async (req, res) => {
  const db = await getDb();
  const { description, amount, due_day, category, supplier_id, status } = req.body;
  if (!description || amount === undefined || due_day === undefined) {
    return res.status(400).json({ error: 'Descrição, valor e dia de vencimento são obrigatórios.' });
  }
  try {
    const result = await db.run(
      `INSERT INTO recurring_accounts (description, amount, due_day, category, supplier_id, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [description, amount, due_day, category || null, supplier_id || null, status || 'active']
    );
    res.json({ success: true, id: result.lastID });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/recurring-accounts/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  const { description, amount, due_day, category, supplier_id, status } = req.body;
  if (!description || amount === undefined || due_day === undefined) {
    return res.status(400).json({ error: 'Descrição, valor e dia de vencimento são obrigatórios.' });
  }
  try {
    await db.run(
      `UPDATE recurring_accounts 
       SET description = ?, amount = ?, due_day = ?, category = ?, supplier_id = ?, status = ?
       WHERE id = ?`,
      [description, amount, due_day, category || null, supplier_id || null, status, id]
    );
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/recurring-accounts/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  try {
    await db.run('DELETE FROM recurring_accounts WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate accounts payable for a specific month and year
app.post('/api/recurring-accounts/generate', async (req, res) => {
  const db = await getDb();
  const { year, month } = req.body;
  if (!year || !month) {
    return res.status(400).json({ error: 'Ano e mês são obrigatórios.' });
  }

  try {
    const activeRecurring = await db.all("SELECT * FROM recurring_accounts WHERE status = 'active'");
    if (activeRecurring.length === 0) {
      return res.json({ success: true, message: 'Nenhuma conta recorrente ativa para gerar.' });
    }

    const monthStr = String(month).padStart(2, '0');
    const labelSuffix = `${monthStr}/${year}`;
    
    let generatedCount = 0;
    
    await db.run('BEGIN TRANSACTION');
    try {
      for (const rec of activeRecurring) {
        const uniqueDesc = `Recorrente: ${rec.description} - ${labelSuffix}`;
        
        // Check if already generated
        const existing = await db.get("SELECT id FROM accounts_payable WHERE description = ?", [uniqueDesc]);
        if (!existing) {
          const maxDays = new Date(year, month, 0).getDate();
          const day = Math.min(rec.due_day, maxDays);
          const dayStr = String(day).padStart(2, '0');
          const dueDateStr = `${year}-${monthStr}-${dayStr}`;

          await db.run(
            `INSERT INTO accounts_payable (supplier_id, description, amount, due_date, status)
             VALUES (?, ?, ?, ?, 'pending')`,
            [rec.supplier_id, uniqueDesc, rec.amount, dueDateStr]
          );
          generatedCount++;
        }
      }
      await db.run('COMMIT');
      res.json({ success: true, count: generatedCount });
    } catch (txErr) {
      await db.run('ROLLBACK');
      throw txErr;
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// PROMOTIONS ENDPOINTS
// ==========================================
app.get('/api/promotions', async (req, res) => {
  const db = await getDb();
  try {
    const promotions = await db.all(`
      SELECT * FROM promotions ORDER BY created_at DESC
    `);
    
    const formatted = [];
    for (const promo of promotions) {
      const links = await db.all(`
        SELECT product_id, discount_type, discount_value 
        FROM promotion_products 
        WHERE promotion_id = ?
      `, [promo.id]);
      
      formatted.push({
        ...promo,
        products: links,
        product_ids: links.map((l: any) => l.product_id)
      });
    }
    
    res.json(formatted);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/promotions', async (req, res) => {
  const db = await getDb();
  const { name, description, discount_type, discount_value, start_date, end_date, product_ids, products, operator_name } = req.body;
  
  if (!name || !discount_type || discount_value === undefined || !start_date || !end_date) {
    return res.status(400).json({ error: 'Nome, tipo de desconto, valor, data inicial e final são obrigatórios.' });
  }
  
  try {
    await db.run('BEGIN TRANSACTION');
    
    const result = await db.run(
      `INSERT INTO promotions (name, description, discount_type, discount_value, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, ?, 'active')`,
      [name, description || null, discount_type, discount_value, start_date, end_date]
    );
    
    const promoId = result.lastID;
    
    if (products && Array.isArray(products)) {
      for (const item of products) {
        await db.run(
          "INSERT INTO promotion_products (promotion_id, product_id, discount_type, discount_value) VALUES (?, ?, ?, ?)",
          [promoId, item.product_id, item.discount_type || null, item.discount_value !== undefined && item.discount_value !== null ? item.discount_value : null]
        );
      }
    } else if (product_ids && Array.isArray(product_ids)) {
      for (const prodId of product_ids) {
        await db.run(
          "INSERT INTO promotion_products (promotion_id, product_id) VALUES (?, ?)",
          [promoId, prodId]
        );
      }
    }
    
    await logAction('PROMOTION_CREATE', operator_name || 'Gerente', { id: promoId, name, discount_type, discount_value });
    await db.run('COMMIT');
    res.status(201).json({ success: true, id: promoId });
  } catch (err: any) {
    await db.run('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/promotions/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  const { name, description, discount_type, discount_value, start_date, end_date, status, product_ids, products, operator_name } = req.body;
  
  if (!name || !discount_type || discount_value === undefined || !start_date || !end_date) {
    return res.status(400).json({ error: 'Nome, tipo de desconto, valor, data inicial e final são obrigatórios.' });
  }
  
  try {
    await db.run('BEGIN TRANSACTION');
    
    await db.run(
      `UPDATE promotions 
       SET name = ?, description = ?, discount_type = ?, discount_value = ?, start_date = ?, end_date = ?, status = ?
       WHERE id = ?`,
      [name, description || null, discount_type, discount_value, start_date, end_date, status || 'active', id]
    );
    
    // Clear old product associations
    await db.run("DELETE FROM promotion_products WHERE promotion_id = ?", [id]);
    
    // Insert new product associations
    if (products && Array.isArray(products)) {
      for (const item of products) {
        await db.run(
          "INSERT INTO promotion_products (promotion_id, product_id, discount_type, discount_value) VALUES (?, ?, ?, ?)",
          [id, item.product_id, item.discount_type || null, item.discount_value !== undefined && item.discount_value !== null ? item.discount_value : null]
        );
      }
    } else if (product_ids && Array.isArray(product_ids)) {
      for (const prodId of product_ids) {
        await db.run(
          "INSERT INTO promotion_products (promotion_id, product_id) VALUES (?, ?)",
          [id, prodId]
        );
      }
    }
    
    await logAction('PROMOTION_UPDATE', operator_name || 'Gerente', { id, name, status });
    await db.run('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await db.run('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/promotions/:id', async (req, res) => {
  const db = await getDb();
  const { id } = req.params;
  const operator = (req.query.operator_name as string) || 'Gerente';
  
  try {
    await db.run('BEGIN TRANSACTION');
    const promo = await db.get("SELECT name FROM promotions WHERE id = ?", [id]);
    
    await db.run('DELETE FROM promotions WHERE id = ?', [id]);
    await db.run('DELETE FROM promotion_products WHERE promotion_id = ?', [id]);
    
    await logAction('PROMOTION_DELETE', operator, { id, name: promo?.name });
    await db.run('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await db.run('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// 20. Backup & Restore Routes
app.get('/api/backup/list', async (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return {
          filename: f,
          size: stat.size,
          created_at: stat.mtime.toISOString(),
          type: f.includes('_auto') || f.includes('_startup') ? 'Automático' : 'Manual'
        };
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    res.json(files);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/create', async (req, res) => {
  const { operator_name } = req.body;
  try {
    const filename = createBackupFile('manual');
    await logAction('BACKUP_CREATE', operator_name || 'Gerente', { filename });
    res.json({ success: true, filename });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backup/download/:filename', (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(BACKUP_DIR, filename);
  if (fs.existsSync(filePath) && filename.startsWith('backup_') && filename.endsWith('.db')) {
    res.download(filePath, filename);
  } else {
    res.status(404).json({ error: "Backup não encontrado." });
  }
});

app.delete('/api/backup/:filename', async (req, res) => {
  const { filename } = req.params;
  const operator = (req.query.operator_name as string) || 'Gerente';
  const filePath = path.join(BACKUP_DIR, filename);
  try {
    if (fs.existsSync(filePath) && filename.startsWith('backup_') && filename.endsWith('.db')) {
      fs.unlinkSync(filePath);
      await logAction('BACKUP_DELETE', operator, { filename });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Backup não encontrado." });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/restore/:filename', async (req, res) => {
  const { filename } = req.params;
  const { operator_name } = req.body;
  const filePath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filePath) || !filename.startsWith('backup_') || !filename.endsWith('.db')) {
    return res.status(404).json({ error: "Backup não encontrado." });
  }

  try {
    // Create a safety backup first in case restore goes wrong
    createBackupFile('safety_before_restore');

    // 1. Close active DB connection
    await resetDbConnection();

    // 2. Overwrite DB file
    fs.copyFileSync(filePath, DB_FILE);

    // 3. Re-initialize connection
    await initDb();

    // 4. Log the restore
    await logAction('BACKUP_RESTORE', operator_name || 'Gerente', { filename });

    res.json({ success: true, message: "Banco de dados restaurado com sucesso!" });
  } catch (err: any) {
    console.error("Erro ao restaurar banco de dados:", err);
    res.status(500).json({ error: "Falha ao restaurar banco de dados: " + err.message });
  }
});

app.post('/api/backup/upload-restore', async (req, res) => {
  const { db_base64, filename, operator_name } = req.body;
  if (!db_base64) {
    return res.status(400).json({ error: "Conteúdo do banco de dados não informado." });
  }

  try {
    // Create safety backup
    createBackupFile('safety_before_upload_restore');

    const buffer = Buffer.from(db_base64, 'base64');

    // Basic validation: check if buffer starts with SQLite header: "SQLite format 3\0"
    const header = buffer.toString('ascii', 0, 15);
    if (header !== "SQLite format 3") {
      return res.status(400).json({ error: "O arquivo enviado não é um banco de dados SQLite válido." });
    }

    // 1. Close active DB connection
    await resetDbConnection();

    // 2. Write buffer to DB file
    fs.writeFileSync(DB_FILE, buffer);

    // 3. Re-initialize connection
    await initDb();

    // 4. Log the restore
    await logAction('BACKUP_UPLOAD_RESTORE', operator_name || 'Gerente', { filename });

    res.json({ success: true, message: "Banco de dados enviado e restaurado com sucesso!" });
  } catch (err: any) {
    console.error("Erro ao processar envio de banco de dados:", err);
    res.status(500).json({ error: "Falha ao restaurar banco de dados: " + err.message });
  }
});

// Scheduler for automatic backups
function startBackupScheduler() {
  // Startup backup
  try {
    const fn = createBackupFile('startup');
    console.log(`[Backup System] Startup auto-backup created successfully: ${fn}`);
  } catch (err) {
    console.error("[Backup System] Failed to run startup auto-backup:", err);
  }

  // Backup every 24 hours
  setInterval(() => {
    try {
      const fn = createBackupFile('auto');
      console.log(`[Backup System] Daily auto-backup created successfully: ${fn}`);
    } catch (err) {
      console.error("[Backup System] Failed to run daily auto-backup:", err);
    }
  }, 24 * 60 * 60 * 1000);
}

// Server bootup
async function startServer() {
  await initDb();
  startBackupScheduler();
  app.listen(PORT, () => {
    console.log(`Node.js central API server running on http://localhost:${PORT}`);
  });
}

startServer();
