import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type Product, type Category, type Subcategory, type FiscalSettings } from '../services/api';
import { toast } from '../services/toast';
import { confirmService } from '../services/confirm';
import { Search, Plus, Edit2, Trash2, X, SlidersHorizontal, FileText, CheckSquare, Square, Settings2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

/**
 * Componente Principal de Cadastro e Gerenciamento de Produtos
 * Oferece controle completo de estoque, precificação, dados fiscais individuais,
 * reajustes em lote de preços e categorias, e exportação de PDF de inventário.
 */
export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);

  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Estados para ordenação da tabela
  const [sortField, setSortField] = useState<string>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Usuário logado no sistema para registro de auditoria
  const [currentUser] = useState(() => {
    const local = localStorage.getItem('superpos_current_user');
    return local ? JSON.parse(local) : { username: 'Gerente', role: 'manager' };
  });

  // Configurações fiscais padrão
  const [fiscalSettings, setFiscalSettings] = useState<FiscalSettings>({
    cnpj: '',
    razao_social: '',
    inscricao_estadual: '',
    environment: 2,
    state: 'PE',
    csc_id: '',
    csc_token: '',
    has_certificate: false,
    default_cfop: '5102',
    default_origin: '0',
    default_csosn: '102',
    default_cst_pis: '49',
    default_cst_cofins: '49',
    default_aliquot_icms: 18,
    default_aliquot_pis: 0,
    default_aliquot_cofins: 0
  });

  // Estados para edição em lote (Bulk Actions)
  const [selectedProducts, setSelectedProducts] = useState<number[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkSubcategoryId, setBulkSubcategoryId] = useState('');
  const [bulkPriceAdjustType, setBulkPriceAdjustType] = useState<'percent' | 'fixed'>('percent');
  const [bulkPriceAdjustValue, setBulkPriceAdjustValue] = useState('');
  const [isBulkPanelOpen, setIsBulkPanelOpen] = useState(false);

  // Estados para o Modal de CRUD de Produto
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Campos do Formulário de Produto
  const [code, setCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [newBarcodeField, setNewBarcodeField] = useState('');
  const [name, setName] = useState('');
  const [categoryIdField, setCategoryIdField] = useState('');
  const [subcategoryIdField, setSubcategoryIdField] = useState('');
  const [priceBuy, setPriceBuy] = useState('');
  const [priceSell, setPriceSell] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [minStock, setMinStock] = useState('');
  const [unit, setUnit] = useState('un');

  // Campos Fiscais do Formulário
  const [ncm, setNcm] = useState('');
  const [cest, setCest] = useState('');
  const [cfop, setCfop] = useState('');
  const [origin, setOrigin] = useState('0');
  const [csosn, setCsosn] = useState('');
  const [cstPis, setCstPis] = useState('');
  const [cstCofins, setCstCofins] = useState('');
  const [aliquotIcms, setAliquotIcms] = useState('');
  const [aliquotPis, setAliquotPis] = useState('');
  const [aliquotCofins, setAliquotCofins] = useState('');
  const [isFiscal, setIsFiscal] = useState(true);

  // Estados para o Modal de Ajuste Rápido de Estoque
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustNewStock, setAdjustNewStock] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  // Estados para Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Busca lista de produtos
  const fetchProducts = async (query = '') => {
    setLoading(true);
    try {
      const res = await api.getProducts(query);
      setProducts(res);
      setCurrentPage(1);
    } catch (e: any) {
      toast.error('Erro ao carregar produtos: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Busca categorias e subcategorias
  const fetchCategoriesAndSubcategories = async () => {
    try {
      const cats = await api.getCategories();
      setCategories(cats);
      const subcats = await api.getSubcategories();
      setSubcategories(subcats);
    } catch (e: any) {
      console.warn("Erro ao buscar dados mercadológicos:", e);
    }
  };

  // Busca configurações fiscais para sugerir valores padrão
  const fetchFiscalSettings = async () => {
    try {
      const res = await api.getFiscalSettings();
      setFiscalSettings(res);
    } catch (e: any) {
      console.warn("Erro ao buscar configurações fiscais padrão:", e);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchCategoriesAndSubcategories();
    fetchFiscalSettings();
  }, []);

  const handleSearch = (e: React.SyntheticEvent) => {
    e.preventDefault();
    fetchProducts(searchTerm);
  };

  // Controle de Seleção dos Checkboxes para Ação em Lote
  const handleSelectProduct = (id: number) => {
    setSelectedProducts(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedProducts.length === products.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(products.map(p => p.id));
    }
  };

  // Abre Modal de Novo Cadastro
  const openAddModal = () => {
    setEditingProduct(null);
    setCode('');
    setBarcode('');
    setBarcodes([]);
    setNewBarcodeField('');
    setName('');
    setCategoryIdField(categories[0]?.id.toString() || '');
    setSubcategoryIdField('');
    setPriceBuy('');
    setPriceSell('');
    setStockQty('');
    setMinStock('0');
    setUnit('un');

    // Inicializa os campos fiscais com os padrões cadastrados no sistema
    setNcm('');
    setCest('');
    setCfop(fiscalSettings.default_cfop || '5102');
    setOrigin(fiscalSettings.default_origin || '0');
    setCsosn(fiscalSettings.default_csosn || '102');
    setCstPis(fiscalSettings.default_cst_pis || '49');
    setCstCofins(fiscalSettings.default_cst_cofins || '49');
    setAliquotIcms(fiscalSettings.default_aliquot_icms === undefined ? '18' : fiscalSettings.default_aliquot_icms.toString());
    setAliquotPis(fiscalSettings.default_aliquot_pis === undefined ? '0' : fiscalSettings.default_aliquot_pis.toString());
    setAliquotCofins(fiscalSettings.default_aliquot_cofins === undefined ? '0' : fiscalSettings.default_aliquot_cofins.toString());
    setIsFiscal(true);

    setIsModalOpen(true);
  };

  // Abre Modal de Edição
  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setCode(product.code || '');
    setBarcode(product.barcode || '');
    setBarcodes(product.barcodes || []);
    setNewBarcodeField('');
    setName(product.name);
    setCategoryIdField(product.category_id?.toString() || '');
    setSubcategoryIdField(product.subcategory_id?.toString() || '');
    setPriceBuy(product.price_buy.toString());
    setPriceSell(product.price_sell.toString());
    setStockQty(product.stock_qty.toString());
    setMinStock(product.min_stock.toString());
    setUnit(product.unit);

    // Carrega os dados fiscais salvos do produto
    setNcm(product.ncm || '');
    setCest(product.cest || '');
    setCfop(product.cfop || '');
    setOrigin(product.origin || '0');
    setCsosn(product.csosn || '');
    setCstPis(product.cst_pis || '');
    setCstCofins(product.cst_cofins || '');
    setAliquotIcms(product.aliquot_icms === undefined ? '' : product.aliquot_icms.toString());
    setAliquotPis(product.aliquot_pis === undefined ? '' : product.aliquot_pis.toString());
    setAliquotCofins(product.aliquot_cofins === undefined ? '' : product.aliquot_cofins.toString());
    setIsFiscal(product.is_fiscal === undefined || product.is_fiscal === null || product.is_fiscal === 1 || product.is_fiscal === true);

    setIsModalOpen(true);
  };

  // Exclusão de Produto
  const handleDelete = async (product: Product) => {
    if (product.stock_qty > 0) {
      toast.error(`Não é permitido excluir o produto '${product.name}' pois ele possui estoque ativo (${product.stock_qty} ${product.unit}).`);
      return;
    }
    const confirm = await confirmService.show({
      title: 'Excluir Produto',
      message: `Deseja realmente excluir o produto '${product.name}'?`,
      type: 'danger'
    });
    if (!confirm) return;
    try {
      const res = await api.deleteProduct(product.id, currentUser.username);
      if (res.success) {
        toast.success(res.message);
        fetchProducts(searchTerm);
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir produto.');
    }
  };

  // Adicionar código de barras alternativo
  const addAlternativeBarcode = () => {
    const val = newBarcodeField.trim();
    if (!val) return;
    if (val === barcode) {
      toast.warning("Código de barras principal já cadastrado.");
      return;
    }
    if (barcodes.includes(val)) {
      toast.warning("Código de barras já está na lista.");
      return;
    }
    setBarcodes(prev => [...prev, val]);
    setNewBarcodeField('');
  };

  // Remover código de barras alternativo
  const removeAlternativeBarcode = (index: number) => {
    setBarcodes(prev => prev.filter((_, idx) => idx !== index));
  };

  // Enviar formulário de criação/edição
  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!name || !priceBuy || !priceSell || !stockQty) {
      toast.warning('Por favor preencha todos os campos obrigatórios (Nome, Preço de Custo, Preço de Venda e Estoque).');
      return;
    }

    const payload = {
      code: code.trim() || undefined,
      barcode: barcode.trim() || '',
      barcodes,
      name,
      category_id: categoryIdField ? Number.parseInt(categoryIdField) : null,
      subcategory_id: subcategoryIdField ? Number.parseInt(subcategoryIdField) : null,
      price_buy: Number.parseFloat(priceBuy),
      price_sell: Number.parseFloat(priceSell),
      stock_qty: Number.parseFloat(stockQty),
      min_stock: Number.parseFloat(minStock || '0'),
      unit,
      operator_name: currentUser.username,
      ncm,
      cest,
      cfop,
      origin,
      csosn,
      cst_pis: cstPis,
      cst_cofins: cstCofins,
      aliquot_icms: aliquotIcms === '' ? undefined : Number.parseFloat(aliquotIcms),
      aliquot_pis: aliquotPis === '' ? undefined : Number.parseFloat(aliquotPis),
      aliquot_cofins: aliquotCofins === '' ? undefined : Number.parseFloat(aliquotCofins),
      is_fiscal: isFiscal ? 1 : 0
    };

    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, payload);
        toast.success('Produto atualizado com sucesso!');
      } else {
        await api.createProduct(payload);
        toast.success('Produto cadastrado com sucesso!');
      }
      setIsModalOpen(false);
      fetchProducts(searchTerm);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar produto.');
    }
  };

  // Abrir Modal de Ajuste Manual de Estoque (Auditoria)
  const openAdjustModal = (product: Product) => {
    setAdjustingProduct(product);
    setAdjustNewStock(product.stock_qty.toString());
    setAdjustReason('');
  };

  // Executar Ajuste de Estoque
  const handleAdjustSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!adjustingProduct || adjustNewStock === '' || !adjustReason.trim()) {
      toast.warning('Preencha a quantidade e o motivo do ajuste.');
      return;
    }

    try {
      const res = await api.adjustInventory({
        product_id: adjustingProduct.id,
        new_stock: Number.parseFloat(adjustNewStock),
        reason: adjustReason.trim(),
        operator_name: currentUser.username
      });
      if (res.success) {
        toast.success(res.message);
        setAdjustingProduct(null);
        fetchProducts(searchTerm);
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao realizar ajuste de estoque.');
    }
  };

  // Executar Atualização em Lote (Bulk Actions)
  const handleBulkSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (selectedProducts.length === 0) {
      toast.warning('Nenhum produto selecionado.');
      return;
    }

    const priceAdjust = bulkPriceAdjustValue ? {
      type: bulkPriceAdjustType,
      value: Number.parseFloat(bulkPriceAdjustValue)
    } : undefined;

    try {
      const res = await api.bulkEditProducts({
        ids: selectedProducts,
        category_id: bulkCategoryId ? Number.parseInt(bulkCategoryId) : undefined,
        subcategory_id: bulkSubcategoryId ? Number.parseInt(bulkSubcategoryId) : undefined,
        price_sell_adjust: priceAdjust,
        operator_name: currentUser.username
      });

      if (res.success) {
        toast.success(`Alteração em lote aplicada com sucesso em ${selectedProducts.length} produtos!`);
        setSelectedProducts([]);
        setBulkCategoryId('');
        setBulkSubcategoryId('');
        setBulkPriceAdjustValue('');
        setIsBulkPanelOpen(false);
        fetchProducts(searchTerm);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao aplicar alteração em lote.");
    }
  };

  // Geração e Impressão de PDF de Estoque Geral
  const handleDownloadStockPDF = () => {
    const newWindow = window.open('', '_blank');
    if (!newWindow) {
      toast.error('Erro ao abrir nova janela para gerar PDF.');
      return;
    }

    const sortedProducts = [...products].sort((a, b) => a.name.localeCompare(b.name));

    const totalItems = sortedProducts.length;
    const totalQty = sortedProducts.reduce((sum, p) => sum + p.stock_qty, 0);
    const totalCostValue = sortedProducts.reduce((sum, p) => sum + (p.stock_qty * p.price_buy), 0);
    const totalSellValue = sortedProducts.reduce((sum, p) => sum + (p.stock_qty * p.price_sell), 0);

    const formatCurrencyLocal = (val: number) => {
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    const rowsHtml = sortedProducts.map(p => `
      <tr style="border-bottom: 1px solid #e2e8f0; ${p.stock_qty <= (p.min_stock || 0) ? 'background-color: #fffbeb;' : ''}">
        <td style="padding: 8px 10px; text-align: left; font-weight: 600;">${p.name}</td>
        <td style="padding: 8px 10px; text-align: center; font-family: monospace;">${p.barcode || p.code || '-'}</td>
        <td style="padding: 8px 10px; text-align: center;">${p.unit.toUpperCase()}</td>
        <td style="padding: 8px 10px; text-align: right; font-family: monospace;">${formatCurrencyLocal(p.price_buy)}</td>
        <td style="padding: 8px 10px; text-align: right; font-family: monospace;">${formatCurrencyLocal(p.price_sell)}</td>
        <td style="padding: 8px 10px; text-align: center; font-weight: bold; color: ${p.stock_qty <= (p.min_stock || 0) ? '#d97706' : '#1e293b'};">
          ${p.stock_qty} ${p.stock_qty <= (p.min_stock || 0) ? '<span style="font-size: 10px; font-weight: normal; display: block; color: #d97706;">(Baixo)</span>' : ''}
        </td>
        <td style="padding: 8px 10px; text-align: right; font-weight: bold; font-family: monospace;">
          ${formatCurrencyLocal(p.stock_qty * p.price_sell)}
        </td>
      </tr>
    `).join('');

    (newWindow.document as any).write(`
      <html>
        <head>
          <title>Relatorio_Estoque_${new Date().toISOString().slice(0, 10)}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
            .meta { font-size: 12px; color: #64748b; text-align: right; }
            .kpis { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 15px; margin-bottom: 30px; }
            .kpi-card { padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; }
            .kpi-title { font-size: 10px; text-transform: uppercase; font-weight: bold; color: #64748b; margin-bottom: 5px; display: block; }
            .kpi-val { font-size: 16px; font-weight: 800; font-family: monospace; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { background: #f8fafc; padding: 10px; font-size: 11px; font-weight: bold; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
            td { font-size: 12px; padding: 8px; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8; margin-top: 5px; }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Relatório de Inventário & Estoque</h1>
              <div style="font-size: 13px; color: #64748b; margin-top: 5px;">SuperPOS - Controle de Produtos</div>
            </div>
            <div class="meta">
              <div>Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
              <div>Operador: ${currentUser.username}</div>
            </div>
          </div>
          
          <div class="kpis">
            <div class="kpi-card" style="border-top: 3px solid #64748b;">
              <span class="kpi-title">Total de Itens</span>
              <span class="kpi-val">${totalItems}</span>
            </div>
            <div class="kpi-card" style="border-top: 3px solid #3b82f6;">
              <span class="kpi-title">Volume de Estoque</span>
              <span class="kpi-val" style="color: #3b82f6;">${totalQty}</span>
            </div>
            <div class="kpi-card" style="border-top: 3px solid #ef4444;">
              <span class="kpi-title">Custo Total Est.</span>
              <span class="kpi-val" style="color: #ef4444;">${formatCurrencyLocal(totalCostValue)}</span>
            </div>
            <div class="kpi-card" style="border-top: 3px solid #10b981;">
              <span class="kpi-title">Venda Total Est.</span>
              <span class="kpi-val" style="color: #10b981;">${formatCurrencyLocal(totalSellValue)}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">Produto</th>
                <th style="text-align: center; width: 130px;">Cód. Barras</th>
                <th style="text-align: center; width: 60px;">Un.</th>
                <th style="text-align: right; width: 100px;">Preço Compra</th>
                <th style="text-align: right; width: 100px;">Preço Venda</th>
                <th style="text-align: center; width: 100px;">Qtd Estoque</th>
                <th style="text-align: right; width: 120px;">Valor Total (Venda)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          
          <div class="footer">
            Relatório emitido através do módulo de estoque SuperPOS. Todos os direitos reservados.
          </div>
          
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `);
    newWindow.document.close();
  };

  // Funções utilitárias
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const getStockStatusClass = (qty: number, min: number) => {
    if (qty <= min) return 'badge danger';
    if (qty <= min * 1.5) return 'badge warning';
    return 'badge success';
  };

  const getStockStatusText = (qty: number, min: number) => {
    if (qty <= min) return 'Crítico';
    if (qty <= min * 1.5) return 'Alerta';
    return 'Saudável';
  };

  const getCategoryName = (catId?: number | null) => {
    if (!catId) return 'Sem Categoria';
    const found = categories.find(c => c.id === catId);
    return found ? found.name : 'Geral';
  };

  const getSubcategoryName = (subId?: number | null) => {
    if (!subId) return '-';
    const found = subcategories.find(s => s.id === subId);
    return found ? found.name : '-';
  };

  const filteredSubcategories = subcategories.filter(s =>
    s.category_id === (categoryIdField ? Number.parseInt(categoryIdField) : -1)
  );

  const bulkFilteredSubcategories = subcategories.filter(s =>
    s.category_id === (bulkCategoryId ? Number.parseInt(bulkCategoryId) : -1)
  );

  // Handlers para ordenação
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) {
      return <ArrowUpDown size={12} style={{ marginLeft: '4px', opacity: 0.4, verticalAlign: 'middle' }} />;
    }
    if (sortDirection === 'asc') {
      return <ArrowUp size={12} className="text-primary" style={{ marginLeft: '4px', verticalAlign: 'middle' }} />;
    }
    return <ArrowDown size={12} className="text-primary" style={{ marginLeft: '4px', verticalAlign: 'middle' }} />;
  };

  const renderSortableHeader = (field: string, label: string, extraStyle: React.CSSProperties = {}) => {
    return (
      <th
        style={{ cursor: 'pointer', userSelect: 'none', ...extraStyle }}
        onClick={() => handleSort(field)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {label}
          {renderSortIcon(field)}
        </span>
      </th>
    );
  };

  // Cálculo de Paginação e Ordenação
  const sortedProducts = [...products].sort((a, b) => {
    let aVal: any = a[sortField as keyof typeof a];
    let bVal: any = b[sortField as keyof typeof b];

    if (sortField === 'category') {
      aVal = getCategoryName(a.category_id);
      bVal = getCategoryName(b.category_id);
    } else if (sortField === 'subcategory') {
      aVal = getSubcategoryName(a.subcategory_id);
      bVal = getSubcategoryName(b.subcategory_id);
    }

    aVal ??= '';
    bVal ??= '';

    if (typeof aVal === 'string') {
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal, 'pt-BR', { numeric: true })
        : bVal.localeCompare(aVal, 'pt-BR', { numeric: true });
    }

    if (typeof aVal === 'number') {
      return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });

  const indexOfLastProduct = currentPage * itemsPerPage;
  const indexOfFirstProduct = indexOfLastProduct - itemsPerPage;
  const currentProducts = sortedProducts.slice(indexOfFirstProduct, indexOfLastProduct);
  const totalPages = Math.ceil(products.length / itemsPerPage);

  // Renderiza a tabela de produtos, spinner ou mensagem vazia
  const renderTableContent = () => {
    if (loading) {
      return (
        <div className="flex-center py-5" style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="spinner" style={{ width: '32px', height: '32px', border: '3px solid rgba(59,130,246,0.1)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
        </div>
      );
    }

    if (products.length === 0) {
      return (
        <div className="empty-message py-5 text-center text-muted" style={{ padding: '40px 0' }}>Nenhum produto encontrado.</div>
      );
    }

    return (
      <div className="table-responsive">
        <table className="table" style={{ minWidth: '1150px', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: '40px' }} className="text-center">
                <button type="button" onClick={handleSelectAll} className="btn-icon">
                  {selectedProducts.length === products.length ? (
                    <CheckSquare size={18} className="text-primary" />
                  ) : (
                    <Square size={18} className="text-muted" />
                  )}
                </button>
              </th>
              {renderSortableHeader('code', 'ID', { width: '40px' })}
              {renderSortableHeader('barcode', 'Cód. Barras', { width: '120px' })}
              {renderSortableHeader('name', 'Nome')}
              {renderSortableHeader('category', 'Categoria')}
              {renderSortableHeader('subcategory', 'Subcategoria')}
              {renderSortableHeader('price_buy', 'R$ Compra', { width: '90px', textAlign: 'right' })}
              {renderSortableHeader('price_sell', 'R$ Venda', { width: '90px', textAlign: 'right' })}
              {renderSortableHeader('stock_qty', 'Estoque', { width: '90px', textAlign: 'center' })}
              <th className="text-center" style={{ width: '80px' }}>Fiscal</th>
              <th className="text-center" style={{ width: '90px' }}>Status</th>
              <th className="text-center" style={{ width: '90px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {currentProducts.map((product) => {
              const isSelected = selectedProducts.includes(product.id);
              return (
                <tr key={product.id} className={`table-row ${isSelected ? 'row-selected' : ''}`} style={isSelected ? { backgroundColor: 'rgba(59, 130, 246, 0.05)' } : {}}>
                  <td className="text-center">
                    <button type="button" onClick={() => handleSelectProduct(product.id)} className="btn-icon">
                      {isSelected ? (
                        <CheckSquare size={18} className="text-primary" />
                      ) : (
                        <Square size={18} className="text-muted" />
                      )}
                    </button>
                  </td>
                  <td className="text-monospace text-xs text-muted font-bold">{product.code || '-'}</td>
                  <td className="text-monospace">
                    <div>{product.barcode || '-'}</div>
                    {product.barcodes && product.barcodes.length > 0 && (
                      <div className="text-[10px] text-muted truncate max-w-[150px]" title={product.barcodes.join(', ')} style={{ fontSize: '9px', opacity: 0.8 }}>
                        Alt: {product.barcodes.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="font-semibold">{product.name}</td>
                  <td>
                    <span className="category-tag bg-blue-500/10 text-blue-400 border border-blue-500/20" style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px' }}>
                      {getCategoryName(product.category_id)}
                    </span>
                  </td>
                  <td className="text-muted text-sm">{getSubcategoryName(product.subcategory_id)}</td>
                  <td className="text-right text-muted">{formatCurrency(product.price_buy)}</td>
                  <td className="text-right font-semibold">{formatCurrency(product.price_sell)}</td>
                  <td className="text-center">
                    <span className="font-semibold">{product.stock_qty}</span>{' '}
                    <span className="text-muted text-xs">{product.unit}</span>
                  </td>
                  <td className="text-center">
                    {product.is_fiscal === undefined || product.is_fiscal === null || product.is_fiscal === 1 || product.is_fiscal === true ? (
                      <span className="badge success text-xs py-0.5 px-1.5" style={{ fontSize: '10px' }}>Sim</span>
                    ) : (
                      <span className="badge bg-gray-800 text-gray-400 text-xs py-0.5 px-1.5" style={{ fontSize: '10px' }}>Não</span>
                    )}
                  </td>
                  <td className="text-center">
                    <span className={getStockStatusClass(product.stock_qty, product.min_stock)}>
                      {getStockStatusText(product.stock_qty, product.min_stock)}
                    </span>
                  </td>
                  <td className="text-center">
                    <div className="action-buttons flex-center gap-1" style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                      <button
                        className="btn-icon btn-edit"
                        onClick={() => openEditModal(product)}
                        title="Editar Produto"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        className="btn-icon text-blue-400 hover:text-blue-200"
                        onClick={() => openAdjustModal(product)}
                        title="Ajustar Estoque"
                      >
                        <SlidersHorizontal size={15} />
                      </button>
                      <button
                        className="btn-icon btn-delete"
                        onClick={() => handleDelete(product)}
                        title="Excluir Produto"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="products-page animate-fade-in">
      <div className="flex-between mb-4">
        <div>
          <h2 className="section-title">Painel de Estoque & Produtos</h2>
          <p className="section-subtitle">Gerencie o cadastro de itens, controle de quantidade mínima, preços e ajustes fiscais.</p>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleDownloadStockPDF}
            className="btn btn-secondary flex-center gap-2"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <FileText size={16} />
            Exportar PDF
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            <Plus size={18} />
            Cadastrar Produto
          </button>
        </div>
      </div>

      {/* Barra de Filtro e Botão de Lote */}
      <div className="glass-card table-actions py-3 mb-4 flex-between gap-3">
        <form onSubmit={handleSearch} className="search-form flex-1" style={{ display: 'flex', gap: '8px' }}>
          <div className="search-input-wrapper" style={{ flex: 1 }}>
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar por código de barras, nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field search-input"
            />
          </div>
          <button type="submit" className="btn btn-primary">
            Filtrar
          </button>
          {searchTerm && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearchTerm('');
                fetchProducts('');
              }}
            >
              Limpar
            </button>
          )}
        </form>

        <button
          onClick={() => setIsBulkPanelOpen(!isBulkPanelOpen)}
          className={`btn flex-center gap-2 ${selectedProducts.length > 0 || isBulkPanelOpen ? 'btn-primary' : 'btn-secondary'}`}
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Settings2 size={16} />
          Ações em Lote {selectedProducts.length > 0 && `(${selectedProducts.length})`}
        </button>
      </div>

      {/* Painel de Edição em Lote */}
      {isBulkPanelOpen && (
        <div className="glass-card mb-4 border border-blue-500/20 bg-blue-500/5 p-4 animate-slide-up">
          <div className="flex-between mb-3 border-b border-gray-800 pb-2" style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '8px', marginBottom: '12px' }}>
            <h4 className="font-bold text-blue-400 flex-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
              <Settings2 size={18} />
              Configurar Edição em Lote ({selectedProducts.length} itens selecionados)
            </h4>
            <button className="btn-icon" onClick={() => setIsBulkPanelOpen(false)}>
              <X size={16} />
            </button>
          </div>

          {selectedProducts.length === 0 ? (
            <p className="text-xs text-muted" style={{ margin: 0 }}>Dica: Selecione os produtos usando os checkboxes na tabela abaixo antes de aplicar as mudanças.</p>
          ) : (
            <form onSubmit={handleBulkSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', alignItems: 'end' }}>
              <div>
                <label htmlFor="bulk-category" className="block text-xs text-muted mb-1 font-bold">Alterar Categoria</label>
                <select
                  id="bulk-category"
                  value={bulkCategoryId}
                  onChange={(e) => {
                    setBulkCategoryId(e.target.value);
                    setBulkSubcategoryId('');
                  }}
                  className="input-field select-field py-1 text-sm"
                >
                  <option value="">Não alterar</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="bulk-subcategory" className="block text-xs text-muted mb-1 font-bold">Alterar Subcategoria</label>
                <select
                  id="bulk-subcategory"
                  value={bulkSubcategoryId}
                  onChange={(e) => setBulkSubcategoryId(e.target.value)}
                  disabled={!bulkCategoryId}
                  className="input-field select-field py-1 text-sm"
                >
                  <option value="">Não alterar</option>
                  {bulkFilteredSubcategories.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="bulk-price-adjust-value" className="block text-xs text-muted mb-1 font-bold">Reajustar Preço de Venda</label>
                <div className="flex gap-2">
                  <select
                    value={bulkPriceAdjustType}
                    onChange={(e: any) => setBulkPriceAdjustType(e.target.value)}
                    className="input-field select-field py-1 text-sm"
                    style={{ width: '80px' }}
                  >
                    <option value="percent">%</option>
                    <option value="fixed">R$</option>
                  </select>
                  <input
                    id="bulk-price-adjust-value"
                    type="number"
                    step="any"
                    placeholder="Ex: +5 ou -2.5"
                    value={bulkPriceAdjustValue}
                    onChange={(e) => setBulkPriceAdjustValue(e.target.value)}
                    className="input-field py-1 text-sm"
                  />
                </div>
              </div>

              <div>
                <button type="submit" className="btn btn-primary w-full py-2 text-sm font-bold" style={{ width: '100%' }}>
                  Aplicar em Lote
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tabela de Produtos */}
      <div className="glass-card p-0 overflow-hidden">
        {renderTableContent()}

        {/* Paginação */}
        {!loading && products.length > 0 && (
          <div className="flex-between px-4 py-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
            <div className="text-sm text-muted">
              Exibindo <span className="font-semibold text-white">{Math.min(indexOfFirstProduct + 1, products.length)}</span> a{' '}
              <span className="font-semibold text-white">{Math.min(indexOfLastProduct, products.length)}</span> de{' '}
              <span className="font-semibold text-white">{products.length}</span> produtos
            </div>
            
            <div className="flex gap-1" style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="btn btn-secondary py-1 px-3 text-xs"
                style={{ padding: '6px 12px', minHeight: 'unset' }}
              >
                Anterior
              </button>
              
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => {
                  return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                })
                .map((page, index, array) => {
                  const showEllipsisBefore = index > 0 && page - array[index - 1] > 1;
                  return (
                    <div key={page} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                      {showEllipsisBefore && <span className="text-muted text-xs px-1">...</span>}
                      <button
                        type="button"
                        onClick={() => setCurrentPage(page)}
                        className={`btn py-1 px-3 text-xs ${currentPage === page ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '6px 12px', minHeight: 'unset', minWidth: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        {page}
                      </button>
                    </div>
                  );
                })}

              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="btn btn-secondary py-1 px-3 text-xs"
                style={{ padding: '6px 12px', minHeight: 'unset' }}
              >
                Próximo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CRUD Product Add/Edit Modal */}
      {isModalOpen && createPortal(
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card modal-content animate-slide-up" style={{ maxWidth: '650px', width: '95%', padding: '24px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}>
            <div className="modal-header">
              <h3>{editingProduct ? 'Editar Produto' : 'Cadastrar Novo Produto'}</h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-row">
                <div className="form-group col-4">
                  <label htmlFor="prod-sku">Código Interno (SKU)</label>
                  <input
                    id="prod-sku"
                    type="text"
                    pattern="[0-9]*"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="Gerado automaticamente"
                    className="input-field"
                  />
                </div>
                <div className="form-group col-4">
                  <label htmlFor="prod-barcode">Cód. Barras Principal</label>
                  <input
                    id="prod-barcode"
                    type="text"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    placeholder="Código principal"
                    className="input-field"
                  />
                </div>
                <div className="form-group col-4">
                  <label htmlFor="prod-name">Nome do Produto *</label>
                  <input
                    id="prod-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Arroz Agulhinha 5kg"
                    className="input-field"
                  />
                </div>
              </div>

              {/* Vincular códigos de barras alternativos (Embalagens/Troca) */}
              <div className="p-3 bg-white/5 rounded-lg border border-white/5 mb-3" style={{ padding: '12px', backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px', marginBottom: '12px' }}>
                <label htmlFor="prod-alt-barcode" className="block text-xs text-muted mb-2 font-bold uppercase tracking-wider" style={{ fontSize: '11px', opacity: 0.8, marginBottom: '8px' }}>
                  Códigos de Barras Alternativos (Troca de Embalagem)
                </label>
                <div className="flex gap-2" style={{ display: 'flex', gap: '8px' }}>
                  <input
                    id="prod-alt-barcode"
                    type="text"
                    value={newBarcodeField}
                    onChange={(e) => setNewBarcodeField(e.target.value)}
                    placeholder="Digite outro código de barras..."
                    className="input-field py-1"
                    style={{ flex: 1 }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addAlternativeBarcode();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={addAlternativeBarcode}
                    className="btn btn-primary px-3 py-1 font-bold text-xs"
                    style={{ minHeight: 'unset', padding: '4px 12px' }}
                  >
                    Vincular
                  </button>
                </div>

                {barcodes.length > 0 ? (
                  <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto mt-2" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px', maxHeight: '80px', overflowY: 'auto' }}>
                    {barcodes.map((b, idx) => (
                      <span key={b} className="badge bg-white/10 text-white flex items-center gap-1 font-mono text-[10px] py-1 px-2" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.08)' }}>
                        {b}
                        <button
                          type="button"
                          onClick={() => removeAlternativeBarcode(idx)}
                          className="text-danger hover:text-white font-bold"
                          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: '12px', color: '#ef4444' }}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted mt-2 mb-0" style={{ fontSize: '10px', opacity: 0.6, marginTop: '8px', marginBottom: 0 }}>Nenhum código de barras secundário vinculado a este produto.</p>
                )}
              </div>

              <div className="form-row">
                <div className="form-group col-6">
                  <label htmlFor="prod-category">Categoria Mercadológica *</label>
                  <select
                    id="prod-category"
                    required
                    value={categoryIdField}
                    onChange={(e) => {
                      setCategoryIdField(e.target.value);
                      setSubcategoryIdField('');
                    }}
                    className="input-field select-field"
                  >
                    <option value="">-- Selecione a Categoria --</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group col-6">
                  <label htmlFor="prod-subcategory">Subcategoria</label>
                  <select
                    id="prod-subcategory"
                    value={subcategoryIdField}
                    onChange={(e) => setSubcategoryIdField(e.target.value)}
                    disabled={!categoryIdField}
                    className="input-field select-field"
                  >
                    <option value="">-- Nenhuma subcategoria --</option>
                    {filteredSubcategories.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group col-4">
                  <label htmlFor="prod-unit">Unidade *</label>
                  <select
                    id="prod-unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="input-field select-field"
                  >
                    <option value="un">Unidade (un)</option>
                    <option value="kg">Quilo (kg)</option>
                    <option value="lt">Litro (lt)</option>
                    <option value="pct">Pacote (pct)</option>
                    <option value="cx">Caixa (cx)</option>
                  </select>
                </div>
                <div className="form-group col-4">
                  <label htmlFor="prod-min-stock">Estoque Mínimo</label>
                  <input
                    id="prod-min-stock"
                    type="number"
                    step="any"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="form-group col-4">
                  <label htmlFor="prod-stock-qty">Quantidade em Estoque *</label>
                  <input
                    id="prod-stock-qty"
                    type="number"
                    step="any"
                    required
                    disabled={editingProduct !== null}
                    value={stockQty}
                    onChange={(e) => setStockQty(e.target.value)}
                    placeholder="0"
                    className="input-field"
                  />
                  {editingProduct && <p className="text-xs text-muted mt-1" style={{ fontSize: '11px', opacity: 0.7 }}>Use a ferramenta de "Ajuste de Estoque" (ícone de sliders) para modificar o estoque atual.</p>}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group col-6">
                  <label htmlFor="prod-price-buy">Preço de Custo (Compra) *</label>
                  <input
                    id="prod-price-buy"
                    type="number"
                    step="0.01"
                    required
                    value={priceBuy}
                    onChange={(e) => setPriceBuy(e.target.value)}
                    placeholder="0.00"
                    className="input-field"
                  />
                </div>
                <div className="form-group col-6">
                  <label htmlFor="prod-price-sell">Preço de Venda *</label>
                  <input
                    id="prod-price-sell"
                    type="number"
                    step="0.01"
                    required
                    value={priceSell}
                    onChange={(e) => setPriceSell(e.target.value)}
                    placeholder="0.00"
                    className="input-field"
                  />
                </div>
              </div>

              <div className="border-t pt-3 mt-3" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '16px' }}>
                <div className="flex-between mb-3" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h4 className="text-xs font-bold uppercase text-blue-400" style={{ color: 'var(--accent-blue)', letterSpacing: '0.5px', margin: 0 }}>Dados Fiscais / Tributação</h4>
                  <label className="flex items-center gap-2 cursor-pointer select-none" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={isFiscal}
                      onChange={(e) => setIsFiscal(e.target.checked)}
                      className="w-4 h-4 accent-primary"
                      style={{ cursor: 'pointer' }}
                    />
                    <span className="text-xs font-bold text-white">Produto Fiscal</span>
                  </label>
                </div>

                {isFiscal && (
                  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div className="form-row">
                      <div className="form-group col-4">
                        <label htmlFor="prod-ncm">NCM *</label>
                        <input
                          id="prod-ncm"
                          type="text"
                          required={isFiscal}
                          placeholder="Ex: 22029900"
                          maxLength={8}
                          value={ncm}
                          onChange={(e) => setNcm(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div className="form-group col-4">
                        <label htmlFor="prod-cest">CEST</label>
                        <input
                          id="prod-cest"
                          type="text"
                          placeholder="Ex: 0301000"
                          maxLength={7}
                          value={cest}
                          onChange={(e) => setCest(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div className="form-group col-4">
                        <label htmlFor="prod-cfop">CFOP *</label>
                        <input
                          id="prod-cfop"
                          type="text"
                          required={isFiscal}
                          placeholder="Ex: 5102"
                          value={cfop}
                          onChange={(e) => setCfop(e.target.value)}
                          className="input-field"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group col-4">
                        <label htmlFor="prod-origin">Origem *</label>
                        <select
                          id="prod-origin"
                          value={origin}
                          onChange={(e) => setOrigin(e.target.value)}
                          className="input-field select-field"
                        >
                          <option value="0">0 - Nacional</option>
                          <option value="1">1 - Estrangeira (Importação direta)</option>
                          <option value="2">2 - Estrangeira (Mercado interno)</option>
                        </select>
                      </div>
                      <div className="form-group col-4">
                        <label htmlFor="prod-csosn">CSOSN *</label>
                        <input
                          id="prod-csosn"
                          type="text"
                          required={isFiscal}
                          placeholder="Ex: 102"
                          value={csosn}
                          onChange={(e) => setCsosn(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div className="form-group col-4">
                        <label htmlFor="prod-aliquot-icms">Alíquota ICMS (%) *</label>
                        <input
                          id="prod-aliquot-icms"
                          type="number"
                          step="any"
                          required={isFiscal}
                          placeholder="18.0"
                          value={aliquotIcms}
                          onChange={(e) => setAliquotIcms(e.target.value)}
                          className="input-field"
                        />
                      </div>
                    </div>

                    <div className="form-row">
                      <div className="form-group col-3">
                        <label htmlFor="prod-cst-pis">CST PIS *</label>
                        <input
                          id="prod-cst-pis"
                          type="text"
                          required={isFiscal}
                          placeholder="49"
                          value={cstPis}
                          onChange={(e) => setCstPis(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div className="form-group col-3">
                        <label htmlFor="prod-aliquot-pis">Alíq. PIS (%) *</label>
                        <input
                          id="prod-aliquot-pis"
                          type="number"
                          step="any"
                          required={isFiscal}
                          placeholder="0.0"
                          value={aliquotPis}
                          onChange={(e) => setAliquotPis(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div className="form-group col-3">
                        <label htmlFor="prod-cst-cofins">CST COFINS *</label>
                        <input
                          id="prod-cst-cofins"
                          type="text"
                          required={isFiscal}
                          placeholder="49"
                          value={cstCofins}
                          onChange={(e) => setCstCofins(e.target.value)}
                          className="input-field"
                        />
                      </div>
                      <div className="form-group col-3">
                        <label htmlFor="prod-aliquot-cofins">Alíq. COFINS *</label>
                        <input
                          id="prod-aliquot-cofins"
                          type="number"
                          step="any"
                          required={isFiscal}
                          placeholder="0.0"
                          value={aliquotCofins}
                          onChange={(e) => setAliquotCofins(e.target.value)}
                          className="input-field"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-actions mt-4">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingProduct ? 'Salvar Alterações' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Modal de Ajuste Manual de Estoque */}
      {adjustingProduct && createPortal(
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card modal-content animate-slide-up" style={{ maxWidth: '450px', width: '95%', padding: '24px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}>
            <div className="modal-header">
              <h3>Ajustar Estoque</h3>
              <button className="btn-icon" onClick={() => setAdjustingProduct(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="modal-form">
              <div className="mb-4">
                <h4 className="font-bold text-sm text-primary mb-1">{adjustingProduct.name}</h4>
                <p className="text-xs text-muted" style={{ margin: 0 }}>Código: {adjustingProduct.barcode} | Estoque atual: {adjustingProduct.stock_qty} {adjustingProduct.unit}</p>
              </div>

              <div className="form-group">
                <label htmlFor="adjust-new-stock">Novo Estoque *</label>
                <input
                  id="adjust-new-stock"
                  type="number"
                  step="any"
                  required
                  placeholder="Ex: 50"
                  value={adjustNewStock}
                  onChange={(e) => setAdjustNewStock(e.target.value)}
                  className="input-field text-center font-bold text-lg"
                  autoFocus
                />
              </div>

              <div className="form-group mt-3">
                <label htmlFor="adjust-reason">Motivo do Ajuste (Justificativa) *</label>
                <input
                  id="adjust-reason"
                  type="text"
                  required
                  placeholder="Ex: Contagem manual, quebra, avaria"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="modal-actions mt-4">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAdjustingProduct(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirmar Ajuste
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
