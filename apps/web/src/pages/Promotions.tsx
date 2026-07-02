import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, Search, Edit2, Trash2, Calendar, 
  AlertCircle, CheckCircle2, Package, 
  Flame, Clock, X, Sparkles, Check
} from 'lucide-react';
import { api, type Promotion, type Product } from '../services/api';
import { toast } from '../services/toast';

export default function Promotions() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'scheduled' | 'expired' | 'inactive'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null);
  
  // Form Fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed_price' | 'fixed_discount'>('percentage');
  const [discountValue, setDiscountValue] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Array<{
    product_id: number;
    discount_type: 'percentage' | 'fixed_price' | 'fixed_discount' | null;
    discount_value: number | null;
  }>>([]);
  
  const selectedProductIds = useMemo(() => selectedProducts.map(p => p.product_id), [selectedProducts]);
  
  // Product Search in Modal
  const [modalProductSearch, setModalProductSearch] = useState('');

  // Fetch promotions and products on mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [promosData, productsData] = await Promise.all([
        api.getPromotions(),
        api.getProducts()
      ]);
      setPromotions(promosData);
      setProducts(productsData);
    } catch (err: any) {
      toast.error('Erro ao carregar dados do módulo de promoções.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Helper to get local date ISO string for inputs (YYYY-MM-DDTHH:MM)
  const formatLocalDate = (date: Date = new Date()) => {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  };

  // Open modal for creation
  const handleOpenCreateModal = () => {
    setEditingPromotion(null);
    setName('');
    setDescription('');
    setDiscountType('percentage');
    setDiscountValue(0);
    setStartDate(formatLocalDate());
    // Default end date is tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setEndDate(formatLocalDate(tomorrow));
    setSelectedProducts([]);
    setModalProductSearch('');
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEditModal = (promo: Promotion) => {
    setEditingPromotion(promo);
    setName(promo.name);
    setDescription(promo.description || '');
    setDiscountType(promo.discount_type);
    setDiscountValue(promo.discount_value);
    setStartDate(promo.start_date);
    setEndDate(promo.end_date);
    if (promo.products && Array.isArray(promo.products)) {
      setSelectedProducts(promo.products.map(p => ({
        product_id: p.product_id,
        discount_type: p.discount_type,
        discount_value: p.discount_value
      })));
    } else {
      setSelectedProducts((promo.product_ids || []).map(id => ({
        product_id: id,
        discount_type: null,
        discount_value: null
      })));
    }
    setModalProductSearch('');
    setIsModalOpen(true);
  };

  // Delete promotion
  const handleDelete = async (id: number) => {
    if (!window.confirm('Tem certeza de que deseja excluir esta promoção relâmpago?')) return;
    
    try {
      await api.deletePromotion(id, 'Gerente');
      toast.success('Promoção excluída com sucesso.');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir promoção.');
    }
  };

  // Handle Form Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast.warning('O nome da promoção é obrigatório.');
      return;
    }

    if (discountValue <= 0) {
      toast.warning('O valor do desconto deve ser maior que zero.');
      return;
    }

    if (discountType === 'percentage' && discountValue > 100) {
      toast.warning('O desconto percentual não pode ser maior que 100%.');
      return;
    }

    if (new Date(startDate) >= new Date(endDate)) {
      toast.warning('A data inicial deve ser anterior à data final.');
      return;
    }

    if (selectedProductIds.length === 0) {
      toast.warning('Selecione pelo menos um produto para esta promoção.');
      return;
    }

    // Individual item validation
    for (const item of selectedProducts) {
      if (item.discount_type !== null) {
        if (item.discount_value === null || item.discount_value <= 0) {
          const prod = products.find(p => p.id === item.product_id);
          toast.warning(`Insira um valor de desconto válido para o produto: ${prod?.name || item.product_id}`);
          return;
        }
        if (item.discount_type === 'percentage' && item.discount_value > 100) {
          const prod = products.find(p => p.id === item.product_id);
          toast.warning(`Desconto percentual não pode exceder 100% para o produto: ${prod?.name || item.product_id}`);
          return;
        }
      }
    }

    const payload = {
      name,
      description: description || null,
      discount_type: discountType,
      discount_value: Number(discountValue),
      start_date: startDate,
      end_date: endDate,
      product_ids: selectedProductIds,
      products: selectedProducts,
      operator_name: 'Gerente', // Default fallback
      status: editingPromotion ? editingPromotion.status : 'active' as const
    };

    try {
      if (editingPromotion && editingPromotion.id) {
        await api.updatePromotion(editingPromotion.id, payload);
        toast.success('Promoção atualizada com sucesso.');
      } else {
        await api.createPromotion(payload);
        toast.success('Promoção cadastrada com sucesso.');
      }
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar promoção.');
    }
  };

  // Toggle product selection in modal
  const handleToggleProduct = (prodId: number) => {
    setSelectedProducts(prev => {
      const exists = prev.find(p => p.product_id === prodId);
      if (exists) {
        return prev.filter(p => p.product_id !== prodId);
      } else {
        return [...prev, { product_id: prodId, discount_type: null, discount_value: null }];
      }
    });
  };

  const handleSelectAllFiltered = (filteredIds: number[]) => {
    setSelectedProducts(prev => {
      const allSelected = filteredIds.every(id => prev.some(p => p.product_id === id));
      if (allSelected) {
        return prev.filter(p => !filteredIds.includes(p.product_id));
      } else {
        const newItems = [...prev];
        filteredIds.forEach(id => {
          if (!newItems.some(p => p.product_id === id)) {
            newItems.push({ product_id: id, discount_type: null, discount_value: null });
          }
        });
        return newItems;
      }
    });
  };

  // Helper to determine status and colors
  const getPromoState = (promo: Promotion) => {
    if (promo.status === 'inactive') {
      return { label: 'Inativa', color: 'rgba(239, 68, 68, 0.2)', textColor: '#f87171', indicator: 'red' };
    }
    
    const nowStr = formatLocalDate();
    if (promo.end_date < nowStr) {
      return { label: 'Expirada', color: 'rgba(156, 163, 175, 0.2)', textColor: '#9ca3af', indicator: 'gray' };
    }
    if (promo.start_date > nowStr) {
      return { label: 'Agendada', color: 'rgba(59, 130, 246, 0.2)', textColor: '#60a5fa', indicator: 'blue' };
    }
    return { label: 'Ativa', color: 'rgba(16, 185, 129, 0.2)', textColor: '#34d399', indicator: 'green' };
  };

  // Format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Filtered promotions based on search and status tabs
  const filteredPromotions = useMemo(() => {
    return promotions.filter(promo => {
      const matchesSearch = promo.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        (promo.description && promo.description.toLowerCase().includes(searchTerm.toLowerCase()));
      
      if (!matchesSearch) return false;

      const state = getPromoState(promo);
      if (activeFilter === 'all') return true;
      if (activeFilter === 'active' && state.label === 'Ativa') return true;
      if (activeFilter === 'scheduled' && state.label === 'Agendada') return true;
      if (activeFilter === 'expired' && state.label === 'Expirada') return true;
      if (activeFilter === 'inactive' && state.label === 'Inativa') return true;
      
      return false;
    });
  }, [promotions, searchTerm, activeFilter]);

  // Search products inside modal
  const filteredModalProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(modalProductSearch.toLowerCase()) ||
      p.barcode.includes(modalProductSearch) ||
      (p.category && p.category.toLowerCase().includes(modalProductSearch.toLowerCase()))
    );
  }, [products, modalProductSearch]);

  // Calculate promotion timeline progress
  const getProgressPercentage = (start: string, end: string) => {
    const startTime = new Date(start).getTime();
    const endTime = new Date(end).getTime();
    const nowTime = new Date().getTime();

    if (nowTime < startTime) return 0;
    if (nowTime > endTime) return 100;

    const total = endTime - startTime;
    const elapsed = nowTime - startTime;
    return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
  };

  // Toggle active status (quick switch)
  const handleToggleStatus = async (promo: Promotion) => {
    const newStatus = promo.status === 'active' ? 'inactive' : 'active';
    try {
      await api.updatePromotion(promo.id!, {
        ...promo,
        status: newStatus,
        operator_name: 'Gerente'
      });
      toast.success(`Promoção ${newStatus === 'active' ? 'ativada' : 'desativada'} com sucesso.`);
      fetchData();
    } catch (err: any) {
      toast.error('Erro ao atualizar status.');
    }
  };

  return (
    <div className="promotions-module-container">
      {/* LOCAL STYLES FOR THE MODAL & PAGE */}
      <style dangerouslySetInnerHTML={{ __html: `
        .promotions-module-container {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          animation: fadeIn 0.3s ease;
        }
        
        .promo-header-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .promo-search-bar {
          position: relative;
          max-width: 320px;
          width: 100%;
        }

        .promo-search-bar input {
          width: 100%;
          padding: 8px 12px 8px 36px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid var(--border);
          color: var(--text);
          font-size: 0.9rem;
          transition: all 0.2s ease;
        }

        .promo-search-bar input:focus {
          border-color: var(--primary);
          background: rgba(255, 255, 255, 0.05);
          outline: none;
        }

        select option {
          background-color: #1f2937 !important;
          color: #ffffff !important;
        }

        .promo-search-bar .search-icon {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(255, 255, 255, 0.4);
        }

        /* Tabs Navigation */
        .promo-tabs {
          display: flex;
          gap: 8px;
          border-bottom: 1px solid var(--border);
          padding-bottom: 8px;
          overflow-x: auto;
        }

        .promo-tab-btn {
          background: transparent;
          border: none;
          color: rgba(255, 255, 255, 0.6);
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 0.9rem;
          font-weight: 500;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .promo-tab-btn.active {
          color: var(--primary);
          background: rgba(59, 130, 246, 0.1);
        }

        .promo-tab-btn:hover:not(.active) {
          color: var(--text);
          background: rgba(255, 255, 255, 0.02);
        }

        /* Grid Cards */
        .promo-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 16px;
        }

        .promo-card {
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .promo-card:hover {
          transform: translateY(-4px);
          border-color: rgba(59, 130, 246, 0.2);
          box-shadow: 0 10px 20px -5px rgba(0, 0, 0, 0.3);
          background: rgba(255, 255, 255, 0.03);
        }

        .promo-card-flame {
          position: absolute;
          right: -10px;
          bottom: -10px;
          opacity: 0.03;
          color: var(--primary);
          transform: rotate(15deg);
        }

        .promo-card-badge {
          align-self: flex-start;
          font-size: 0.75rem;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 9999px;
          text-transform: uppercase;
        }

        .promo-discount-tag {
          font-size: 1.8rem;
          font-weight: 900;
          background: linear-gradient(135deg, #f59e0b, #ef4444);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 8px 0;
          letter-spacing: -1px;
        }

        .promo-date-row {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.75rem;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 4px;
        }

        .promo-progress-container {
          height: 6px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 9999px;
          overflow: hidden;
          margin-top: 10px;
        }

        .promo-progress-bar {
          height: 100%;
          border-radius: 9999px;
          background: linear-gradient(90deg, var(--primary), #10b981);
          transition: width 0.3s ease;
        }

        .promo-card-actions {
          display: flex;
          gap: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          margin-top: 14px;
          padding-top: 12px;
        }

        /* Modal styling */
        .promo-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 16px;
        }

        .promo-modal {
          background: #111827;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          max-width: 800px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .promo-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 18px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .promo-modal-body {
          padding: 24px;
          display: grid;
          grid-template-columns: 1.1fr 1fr;
          gap: 24px;
        }

        @media (max-width: 768px) {
          .promo-modal-body {
            grid-template-columns: 1fr;
          }
        }

        .product-selector-box {
          border: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(0, 0, 0, 0.15);
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          height: 320px;
        }

        .product-selector-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .product-selector-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          transition: background 0.2s ease;
        }

        .product-selector-item:hover {
          background: rgba(255, 255, 255, 0.03);
        }

        .product-selector-item.selected {
          background: rgba(59, 130, 246, 0.15);
          border: 1px solid rgba(59, 130, 246, 0.2);
        }

        .checkbox-custom {
          width: 18px;
          height: 18px;
          border-radius: 4px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }

        .product-selector-item.selected .checkbox-custom {
          background: var(--primary);
          border-color: var(--primary);
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      ` }} />

      {/* Main header actions */}
      <header className="promo-header-actions">
        <div>
          <h2 className="panel-title flex-center gap-2" style={{ fontSize: '1.4rem' }}>
            <Flame className="text-warning" size={24} />
            Módulo de Promoções Relâmpago
          </h2>
          <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '4px' }}>
            Defina descontos agendados no tempo. Os preços serão reajustados de forma automática no PDV durante a vigência do prazo.
          </p>
        </div>

        <button className="btn btn-primary flex-center gap-2 py-2 px-4" onClick={handleOpenCreateModal}>
          <Plus size={18} />
          Nova Promoção
        </button>
      </header>

      {/* Search and Filters panel */}
      <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          {/* Tab Filters */}
          <div className="promo-tabs">
            <button className={`promo-tab-btn ${activeFilter === 'all' ? 'active' : ''}`} onClick={() => setActiveFilter('all')}>
              Todas ({promotions.length})
            </button>
            <button className={`promo-tab-btn ${activeFilter === 'active' ? 'active' : ''}`} onClick={() => setActiveFilter('active')}>
              Ativas ({promotions.filter(p => getPromoState(p).label === 'Ativa').length})
            </button>
            <button className={`promo-tab-btn ${activeFilter === 'scheduled' ? 'active' : ''}`} onClick={() => setActiveFilter('scheduled')}>
              Agendadas ({promotions.filter(p => getPromoState(p).label === 'Agendada').length})
            </button>
            <button className={`promo-tab-btn ${activeFilter === 'expired' ? 'active' : ''}`} onClick={() => setActiveFilter('expired')}>
              Expiradas ({promotions.filter(p => getPromoState(p).label === 'Expirada').length})
            </button>
            <button className={`promo-tab-btn ${activeFilter === 'inactive' ? 'active' : ''}`} onClick={() => setActiveFilter('inactive')}>
              Inativas ({promotions.filter(p => getPromoState(p).label === 'Inativa').length})
            </button>
          </div>

          {/* Search bar */}
          <div className="promo-search-bar">
            <Search size={16} className="search-icon" />
            <input 
              type="text" 
              placeholder="Buscar promoção pelo nome..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content Grid */}
      {loading ? (
        <div className="text-center py-5">
          <Clock className="animate-spin text-muted mb-2" size={32} />
          <p className="text-muted">Carregando promoções...</p>
        </div>
      ) : filteredPromotions.length === 0 ? (
        <div className="glass-card text-center py-5" style={{ background: 'rgba(255,255,255,0.01)' }}>
          <AlertCircle size={48} className="text-muted opacity-30 mb-2" style={{ margin: '0 auto' }} />
          <p className="text-muted">Nenhuma promoção encontrada.</p>
        </div>
      ) : (
        <div className="promo-grid">
          {filteredPromotions.map((promo) => {
            const state = getPromoState(promo);
            const progress = getProgressPercentage(promo.start_date, promo.end_date);
            const totalProducts = promo.product_ids?.length || 0;

            return (
              <div key={promo.id} className="promo-card">
                <Flame className="promo-card-flame" size={80} />
                
                <div>
                  <div className="flex-between align-center">
                    <span 
                      className="promo-card-badge" 
                      style={{ backgroundColor: state.color, color: state.textColor }}
                    >
                      {state.label}
                    </span>
                    
                    <label className="switch" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0 }}>
                      <input 
                        type="checkbox" 
                        checked={promo.status === 'active'} 
                        onChange={() => handleToggleStatus(promo)}
                        style={{ width: '32px', height: '16px' }}
                      />
                      <span className="text-[10px] text-muted font-bold uppercase">{promo.status === 'active' ? 'Ativo' : 'Inativo'}</span>
                    </label>
                  </div>

                  <h3 className="font-bold text-lg mt-3 text-ellipsis overflow-hidden" title={promo.name}>
                    {promo.name}
                  </h3>
                  
                  {promo.description && (
                    <p className="text-muted text-xs mt-1 text-ellipsis overflow-hidden" style={{ minHeight: '32px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {promo.description}
                    </p>
                  )}

                  {/* Discount info */}
                  <div className="promo-discount-tag">
                    {promo.discount_type === 'percentage' && `${promo.discount_value}% OFF`}
                    {promo.discount_type === 'fixed_price' && `${formatCurrency(promo.discount_value)}`}
                    {promo.discount_type === 'fixed_discount' && `-${formatCurrency(promo.discount_value)}`}
                  </div>

                  {/* Discount details description */}
                  <div className="text-[11px] text-muted font-semibold mt-1 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-warning" />
                    <span>
                      {promo.discount_type === 'percentage' && 'Desconto percentual aplicado na venda'}
                      {promo.discount_type === 'fixed_price' && 'Preço fixado sobre o produto'}
                      {promo.discount_type === 'fixed_discount' && 'Valor fixo descontado do original'}
                    </span>
                  </div>

                  {/* Validity Info */}
                  <div style={{ marginTop: '16px' }}>
                    <div className="promo-date-row">
                      <Calendar size={12} />
                      <span>Início: {new Date(promo.start_date).toLocaleString('pt-BR')}</span>
                    </div>
                    <div className="promo-date-row">
                      <Clock size={12} />
                      <span>Fim: {new Date(promo.end_date).toLocaleString('pt-BR')}</span>
                    </div>
                    
                    {state.label === 'Ativa' && (
                      <div className="promo-progress-container">
                        <div className="promo-progress-bar" style={{ width: `${progress}%` }}></div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex-between align-center text-xs mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}>
                    <span className="text-muted flex-center gap-1">
                      <Package size={14} />
                      {totalProducts} {totalProducts === 1 ? 'produto vinculado' : 'produtos vinculados'}
                    </span>
                  </div>

                  <div className="promo-card-actions">
                    <button 
                      className="btn btn-secondary py-1.5 flex-1 flex-center gap-1 text-xs" 
                      onClick={() => handleOpenEditModal(promo)}
                    >
                      <Edit2 size={12} />
                      Editar
                    </button>
                    <button 
                      className="btn btn-danger py-1.5 flex-1 flex-center gap-1 text-xs" 
                      onClick={() => handleDelete(promo.id!)}
                    >
                      <Trash2 size={12} />
                      Excluir
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="promo-modal-overlay">
          <div className="promo-modal">
            
            <header className="promo-modal-header">
              <h3 className="panel-title flex-center gap-2">
                <Flame className="text-warning animate-pulse" size={20} />
                {editingPromotion ? `Editar Promoção: ${editingPromotion.name}` : 'Nova Promoção Relâmpago'}
              </h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}>
                <X size={18} />
              </button>
            </header>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="promo-modal-body flex-1 overflow-y-auto">
                
                {/* Left Side: General Info Fields */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  
                  <div className="form-group">
                    <label className="block text-xs font-bold uppercase mb-1 text-muted">Nome da Promoção</label>
                    <input 
                      type="text" 
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Oferta Relâmpago de Fim de Semana"
                      className="input-field"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="block text-xs font-bold uppercase mb-1 text-muted">Descrição (Opcional)</label>
                    <textarea 
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Descreva detalhes ou metas da promoção..."
                      className="input-field"
                      rows={2}
                      style={{ resize: 'none' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                    <div className="form-group">
                      <label className="block text-xs font-bold uppercase mb-1 text-muted">Tipo de Desconto</label>
                      <select 
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as any)}
                        className="input-field select-field"
                      >
                        <option value="percentage">Percentual (%)</option>
                        <option value="fixed_price">Preço Fixo de Venda (R$)</option>
                        <option value="fixed_discount">Desconto Fixo (R$)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="block text-xs font-bold uppercase mb-1 text-muted">
                        {discountType === 'percentage' ? 'Valor (%)' : 'Valor (R$)'}
                      </label>
                      <input 
                        type="number" 
                        step="0.01"
                        min="0.01"
                        value={discountValue || ''}
                        onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="input-field text-right font-bold text-monospace"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="block text-xs font-bold uppercase mb-1 text-muted">Data & Hora de Início</label>
                    <input 
                      type="datetime-local" 
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="input-field text-monospace"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="block text-xs font-bold uppercase mb-1 text-muted">Data & Hora de Fim</label>
                    <input 
                      type="datetime-local" 
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="input-field text-monospace"
                      required
                    />
                  </div>

                </div>

                {/* Right Side: Product Selector */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="block text-xs font-bold uppercase text-muted">Vincular Produtos ({selectedProductIds.length})</label>
                    <button 
                      type="button" 
                      onClick={() => handleSelectAllFiltered(filteredModalProducts.map(p => p.id))}
                      className="btn btn-secondary py-0.5 px-2 text-[10px] font-bold"
                    >
                      {filteredModalProducts.every(p => selectedProductIds.includes(p.id)) ? 'Desmarcar Todos' : 'Marcar Todos'}
                    </button>
                  </div>

                  {/* Search inside product selector */}
                  <div className="promo-search-bar" style={{ maxWidth: 'none' }}>
                    <Search size={14} className="search-icon" />
                    <input 
                      type="text" 
                      placeholder="Pesquisar produto pelo nome ou código..." 
                      value={modalProductSearch}
                      onChange={(e) => setModalProductSearch(e.target.value)}
                      style={{ fontSize: '0.8rem', padding: '6px 12px 6px 32px' }}
                    />
                  </div>

                  {/* Product list checklist container */}
                  <div className="product-selector-box">
                    <div className="product-selector-list">
                      {filteredModalProducts.length === 0 ? (
                        <div className="text-center text-muted text-xs py-4">
                          Nenhum produto encontrado.
                        </div>
                      ) : (
                        filteredModalProducts.map((prod) => {
                          const isSelected = selectedProductIds.includes(prod.id);
                          const currentSelection = selectedProducts.find(p => p.product_id === prod.id);
                          return (
                            <div 
                              key={prod.id}
                              className={`product-selector-item ${isSelected ? 'selected' : ''}`}
                              style={{ cursor: 'default', display: 'flex', gap: '10px', alignItems: 'flex-start' }}
                            >
                              <div 
                                className="checkbox-custom" 
                                style={{ marginTop: '3px', cursor: 'pointer' }}
                                onClick={() => handleToggleProduct(prod.id)}
                              >
                                {isSelected && <Check size={12} className="text-white" />}
                              </div>
                              
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ cursor: 'pointer' }} onClick={() => handleToggleProduct(prod.id)}>
                                  <span className="block text-xs font-semibold">{prod.name}</span>
                                  <span className="block text-[10px] text-muted text-monospace">
                                    Cod: {prod.barcode} | Preço original: {formatCurrency(prod.price_sell)}
                                  </span>
                                </div>
                                
                                {isSelected && (
                                  <div 
                                    style={{ 
                                      display: 'flex', 
                                      gap: '8px', 
                                      alignItems: 'center', 
                                      background: 'rgba(0, 0, 0, 0.25)', 
                                      padding: '6px 8px', 
                                      borderRadius: '4px',
                                      border: '1px solid rgba(255, 255, 255, 0.05)',
                                      marginTop: '4px' 
                                    }}
                                  >
                                    <div style={{ flex: 1 }}>
                                      <span style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '2px' }}>Desconto individual</span>
                                      <select 
                                        value={currentSelection?.discount_type || 'default'}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          setSelectedProducts(prev => prev.map(p => {
                                            if (p.product_id === prod.id) {
                                              return {
                                                ...p,
                                                discount_type: val === 'default' ? null : val as any,
                                                discount_value: val === 'default' ? null : (p.discount_value || 0)
                                              };
                                            }
                                            return p;
                                          }));
                                        }}
                                        className="input-field"
                                        style={{ fontSize: '11px', padding: '2px 4px', height: '24px', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                                      >
                                        <option value="default">Herdar Padrão</option>
                                        <option value="percentage">Percentual (%)</option>
                                        <option value="fixed_price">Preço Fixo (R$)</option>
                                        <option value="fixed_discount">Desconto Fixo (R$)</option>
                                      </select>
                                    </div>

                                    {(currentSelection?.discount_type !== null && currentSelection?.discount_type !== undefined) && (
                                      <div style={{ width: '80px' }}>
                                        <span style={{ fontSize: '8px', fontWeight: 'bold', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: '2px' }}>Valor</span>
                                        <input 
                                          type="number"
                                          step="0.01"
                                          value={currentSelection?.discount_value ?? ''}
                                          onChange={(e) => {
                                            const val = parseFloat(e.target.value);
                                            setSelectedProducts(prev => prev.map(p => {
                                              if (p.product_id === prod.id) {
                                                return { ...p, discount_value: isNaN(val) ? null : val };
                                              }
                                              return p;
                                            }));
                                          }}
                                          placeholder="0.00"
                                          className="input-field text-right font-bold"
                                          style={{ fontSize: '11px', padding: '2px 4px', height: '24px', background: 'rgba(255,255,255,0.05)', color: '#fff' }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                </div>

              </div>

              {/* Modal Actions Footer */}
              <footer className="p-3 border-t flex justify-end gap-2" style={{ borderColor: 'rgba(255, 255, 255, 0.05)', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="btn btn-secondary py-2 px-4"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary py-2 px-5 flex-center gap-1"
                >
                  <CheckCircle2 size={16} />
                  {editingPromotion ? 'Salvar Alterações' : 'Criar Promoção'}
                </button>
              </footer>
            </form>

          </div>
        </div>
      )}

    </div>
  );
}
