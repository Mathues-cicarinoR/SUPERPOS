import { useEffect, useState } from 'react';
import { api, type LayoutZone, type Category, type Product } from '../services/api';
import { toast } from '../services/toast';
import {
  Store,
  Sparkles,
  Plus,
  Trash2,
  Save,
  Settings,
  Flame,
  Package,
  FolderPlus,
  ArrowRight,
  Search,
  Grid,
  Info,
  Edit2,
  X,
  PlusCircle,
  TrendingUp,
  RefreshCw,
  Sliders
} from 'lucide-react';

function renderizarIconeTipo(type: string): string {
  switch (type) {
    case 'checkout': return '🛒';
    case 'fridge': return '❄️';
    case 'bakery': return '🥖';
    case 'butcher': return '🥩';
    case 'hortifruti': return '🥬';
    default: return '📦';
  }
}

function obterNomeTipo(type: string): string {
  switch (type) {
    case 'checkout': return 'Caixa (PDV)';
    case 'fridge': return 'Geladeira / Freezer';
    case 'bakery': return 'Padaria';
    case 'butcher': return 'Açougue';
    case 'hortifruti': return 'Hortifrúti';
    case 'shelf': return 'Gôndola / Prateleira';
    default: return 'Outros';
  }
}

function obterAlturaZona(type: string): number {
  switch (type) {
    case 'fridge': return 65;
    case 'shelf': return 45;
    case 'checkout': return 25;
    case 'bakery': return 35;
    case 'butcher': return 35;
    case 'hortifruti': return 20;
    default: return 30;
  }
}

function obterEstiloCalor(sales: number, heatmapMode: boolean, maxSales: number): React.CSSProperties {
  if (!heatmapMode) return {};
  const percent = (sales / maxSales) * 100;

  if (sales === 0) {
    return {
      backgroundColor: 'rgba(100, 116, 139, 0.8)',
      boxShadow: 'none',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    };
  }

  if (percent > 70) {
    return {
      backgroundColor: 'rgba(239, 68, 68, 0.85)',
      boxShadow: '0 0 15px rgba(239, 68, 68, 0.6)',
      border: '2px solid rgba(255, 99, 99, 0.8)',
    };
  }

  if (percent > 30) {
    return {
      backgroundColor: 'rgba(245, 158, 11, 0.85)',
      boxShadow: '0 0 10px rgba(245, 158, 11, 0.4)',
      border: '1.5px solid rgba(253, 186, 116, 0.8)'
    };
  }

  return {
    backgroundColor: 'rgba(59, 130, 246, 0.85)',
    boxShadow: 'none',
    border: '1px solid rgba(147, 197, 253, 0.6)'
  };
}

const LayoutZoneButton3D = ({
  zone,
  isSelected,
  heatmapMode,
  maxSales,
  onSelect
}: {
  zone: LayoutZone;
  isSelected: boolean;
  heatmapMode: boolean;
  maxSales: number;
  onSelect: (zone: LayoutZone) => void;
}) => {
  const H = obterAlturaZona(zone.zone_type);
  const estiloCalor = obterEstiloCalor(zone.sales_30_days, heatmapMode, maxSales);

  const baseBg = heatmapMode ? undefined : (zone.color || '#4f46e5');
  const gradientBg = heatmapMode ? undefined : `linear-gradient(135deg, ${zone.color}ee 0%, ${zone.color}bb 100%)`;
  const borderTop = isSelected ? '3px solid #ffffff' : '1px solid rgba(255,255,255,0.3)';
  const shadowTop = isSelected 
    ? `0 0 25px ${zone.color || '#4f46e5'}ff, 0 10px 15px rgba(0,0,0,0.5)` 
    : '0 8px 16px rgba(0,0,0,0.4)';

  return (
    <button
      type="button"
      style={{
        position: 'absolute',
        left: `${(zone.x / 16) * 100}%`,
        top: `${(zone.y / 12) * 100}%`,
        width: `${(zone.width / 16) * 100}%`,
        height: `${(zone.height / 12) * 100}%`,
        transformStyle: 'preserve-3d',
        zIndex: isSelected ? 30 : 10,
        cursor: 'pointer',
        background: 'none',
        border: 'none',
        padding: 0,
        outline: 'none',
        fontFamily: 'inherit'
      }}
      onClick={() => onSelect(zone)}
    >
      {/* 1. Face Superior (Top) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          backgroundColor: baseBg,
          backgroundImage: gradientBg,
          ...estiloCalor,
          border: borderTop,
          transform: `translateZ(${H}px)`,
          transformStyle: 'preserve-3d',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          borderRadius: '4px',
          boxShadow: shadowTop,
          transition: 'all 0.2s ease',
        }}
      >
        {/* Label / Icon */}
        <span style={{ fontSize: '1.2rem', textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}>
          {renderizarIconeTipo(zone.zone_type)}
        </span>
        <span 
          className="font-bold truncate w-full px-1 text-center"
          style={{ 
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
            fontSize: '0.7rem'
          }}
        >
          {zone.name}
        </span>
        {heatmapMode && (
          <span 
            className="font-bold text-warning mt-0.5"
            style={{ fontSize: '0.65rem', textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
          >
            R$ {(zone.sales_30_days || 0).toFixed(0)}
          </span>
        )}
      </div>

      {/* 2. Face Frontal (Front) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: '100%',
          height: `${H}px`,
          backgroundColor: baseBg,
          ...estiloCalor,
          filter: 'brightness(0.7)',
          transform: 'rotateX(-90deg)',
          transformOrigin: 'bottom',
          borderTop: '1px solid rgba(255,255,255,0.2)',
          borderBottom: '1px solid rgba(0,0,0,0.4)',
          borderRadius: '0 0 4px 4px',
        }}
      />

      {/* 3. Face Esquerda (Left) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: `${H}px`,
          height: '100%',
          backgroundColor: baseBg,
          ...estiloCalor,
          filter: 'brightness(0.55)',
          transform: 'rotateY(-90deg)',
          transformOrigin: 'left',
          borderRight: '1px solid rgba(255,255,255,0.1)',
          borderLeft: '1px solid rgba(0,0,0,0.4)',
          borderRadius: '4px 0 0 4px',
        }}
      />

      {/* 4. Face Direita (Right) */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: `${H}px`,
          height: '100%',
          backgroundColor: baseBg,
          ...estiloCalor,
          filter: 'brightness(0.85)',
          transform: 'rotateY(90deg)',
          transformOrigin: 'right',
          borderLeft: '1px solid rgba(255,255,255,0.2)',
          borderRight: '1px solid rgba(0,0,0,0.4)',
          borderRadius: '0 4px 4px 0',
        }}
      />

      {/* 5. Face Traseira (Back) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: `${H}px`,
          backgroundColor: baseBg,
          ...estiloCalor,
          filter: 'brightness(0.65)',
          transform: 'rotateX(90deg)',
          transformOrigin: 'top',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          borderTop: '1px solid rgba(0,0,0,0.4)',
          borderRadius: '4px 4px 0 0',
        }}
      />
    </button>
  );
};

const LayoutZoneButton2D = ({
  zone,
  isSelected,
  heatmapMode,
  maxSales,
  onSelect
}: {
  zone: LayoutZone;
  isSelected: boolean;
  heatmapMode: boolean;
  maxSales: number;
  onSelect: (zone: LayoutZone) => void;
}) => {
  const estiloBase = {
    position: 'absolute' as const,
    left: `${(zone.x / 16) * 100}%`,
    top: `${(zone.y / 12) * 100}%`,
    width: `${(zone.width / 16) * 100}%`,
    height: `${(zone.height / 12) * 100}%`,
    backgroundColor: heatmapMode ? undefined : `${zone.color}25`,
    borderColor: heatmapMode ? undefined : zone.color || '#4f46e5',
    borderWidth: isSelected ? '3px' : '2px',
    borderStyle: 'solid' as const,
    boxShadow: isSelected ? `0 0 15px ${zone.color}88` : 'none',
    zIndex: isSelected ? 20 : 10,
    transition: 'all 0.2s ease-in-out',
    cursor: 'pointer'
  };

  const estiloCalor = obterEstiloCalor(zone.sales_30_days, heatmapMode, maxSales);

  return (
    <button
      type="button"
      className="rounded-lg d-flex flex-column align-items-center justify-content-center text-center p-1 overflow-hidden"
      style={{ 
        ...estiloBase, 
        ...estiloCalor,
        fontFamily: 'inherit',
        fontSize: 'inherit',
        lineHeight: 'inherit',
        textAlign: 'center'
      }}
      onClick={() => onSelect(zone)}
    >
      <span className="fs-5 mb-1" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
        {renderizarIconeTipo(zone.zone_type)}
      </span>
      <span 
        className="font-bold text-xs truncate w-full px-1 text-white"
        style={{ 
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          fontSize: '0.7rem' 
        }}
      >
        {zone.name}
      </span>

      {heatmapMode && (
        <span 
          className="text-xs font-bold text-warning mt-1"
          style={{ fontSize: '0.65rem', textShadow: '0 1px 2px rgba(0,0,0,0.9)' }}
        >
          R$ {(zone.sales_30_days || 0).toFixed(0)}
        </span>
      )}
    </button>
  );
};

const LayoutZoneButton = ({
  zone,
  isSelected,
  is3dMode,
  heatmapMode,
  maxSales,
  onSelect
}: {
  zone: LayoutZone;
  isSelected: boolean;
  is3dMode: boolean;
  heatmapMode: boolean;
  maxSales: number;
  onSelect: (zone: LayoutZone) => void;
}) => {
  if (is3dMode) {
    return (
      <LayoutZoneButton3D
        zone={zone}
        isSelected={isSelected}
        heatmapMode={heatmapMode}
        maxSales={maxSales}
        onSelect={onSelect}
      />
    );
  }

  return (
    <LayoutZoneButton2D
      zone={zone}
      isSelected={isSelected}
      heatmapMode={heatmapMode}
      maxSales={maxSales}
      onSelect={onSelect}
    />
  );
};

export default function StoreLayout() {
  const [zones, setZones] = useState<LayoutZone[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Estados de controle da UI
  const [selectedZone, setSelectedZone] = useState<LayoutZone | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [heatmapMode, setHeatmapMode] = useState(false);
  const [buscaItem, setBuscaItem] = useState('');

  // 3D / 2.5D Mode States
  const [is3dMode, setIs3dMode] = useState(true);
  const [tiltX, setTiltX] = useState(55);
  const [rotateZ, setRotateZ] = useState(-30);
  const [zoom, setZoom] = useState(0.9);

  // Estados para formulário de Zona (Criar / Editar)
  const [formId, setFormId] = useState<number | null>(null);
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState('shelf');
  const [formX, setFormX] = useState(0);
  const [formY, setFormY] = useState(0);
  const [formWidth, setFormWidth] = useState(2);
  const [formHeight, setFormHeight] = useState(2);
  const [formColor, setFormColor] = useState('#4f46e5');

  // Estados para associar novos itens
  const [associarProdId, setAssociarProdId] = useState<string>('');
  const [associarCatId, setAssociarCatId] = useState<string>('');

  const carregarDados = async () => {
    try {
      const [zonesData, catsData, prodsData] = await Promise.all([
        api.getLayoutZones(),
        api.getCategories(),
        api.getProducts()
      ]);
      setZones(zonesData);
      setCategories(catsData);
      setProducts(prodsData);
      
      // Atualiza a zona selecionada se houver
      if (selectedZone) {
        const atualizada = zonesData.find(z => z.id === selectedZone.id);
        setSelectedZone(atualizada || null);
      }
    } catch (e: any) {
      toast.error('Erro ao carregar dados do layout: ' + e.message);
    }
  };

  useEffect(() => {
    carregarDados();
  }, []);

  // Abre form de criação/edição de zona
  const abrirFormCriacao = (x = 0, y = 0) => {
    setFormId(null);
    setFormName('Nova Seção');
    setFormType('shelf');
    setFormX(x);
    setFormY(y);
    setFormWidth(2);
    setFormHeight(2);
    setFormColor('#4f46e5');
    setIsEditing(true);
  };

  const abrirFormEdicao = (zone: LayoutZone) => {
    setFormId(zone.id);
    setFormName(zone.name);
    setFormType(zone.zone_type);
    setFormX(zone.x);
    setFormY(zone.y);
    setFormWidth(zone.width);
    setFormHeight(zone.height);
    setFormColor(zone.color || '#4f46e5');
    setIsEditing(true);
  };

  // Salva zona (criação ou edição)
  const lidarComSalvarZona = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.warning('O nome da seção é obrigatório.');
      return;
    }

    // Valida coordenadas e limites do grid (16x12)
    if (formX < 0 || formX + formWidth > 16 || formY < 0 || formY + formHeight > 12) {
      toast.error('A seção ultrapassa os limites do mapa (16x12)!');
      return;
    }

    const dadosZona = {
      name: formName.trim(),
      zone_type: formType,
      x: Number(formX),
      y: Number(formY),
      width: Number(formWidth),
      height: Number(formHeight),
      color: formColor
    };

    try {
      if (formId) {
        await api.updateLayoutZone(formId, dadosZona);
        toast.success('Seção atualizada com sucesso!');
      } else {
        const nova = await api.createLayoutZone(dadosZona);
        setSelectedZone(nova);
        toast.success('Nova seção adicionada ao layout!');
      }
      setIsEditing(false);
      carregarDados();
    } catch (e: any) {
      toast.error('Erro ao salvar seção: ' + e.message);
    }
  };

  // Deleta uma zona do layout
  const lidarComExcluirZona = async (id: number) => {
    if (!globalThis.confirm('Tem certeza que deseja excluir esta seção do layout?')) return;
    try {
      await api.deleteLayoutZone(id);
      setSelectedZone(null);
      toast.success('Seção removida com sucesso!');
      carregarDados();
    } catch (e: any) {
      toast.error('Erro ao excluir seção: ' + e.message);
    }
  };

  // Associa produto ou categoria a uma zona
  const lidarComAssociarItem = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    if (!selectedZone) return;

    if (!associarProdId && !associarCatId) {
      toast.warning('Selecione um produto ou uma categoria para associar.');
      return;
    }

    try {
      await api.addLayoutZoneItem(selectedZone.id, {
        product_id: associarProdId ? Number(associarProdId) : null,
        category_id: associarCatId ? Number(associarCatId) : null
      });
      toast.success('Item associado à seção com sucesso!');
      setAssociarProdId('');
      setAssociarCatId('');
      carregarDados();
    } catch (e: any) {
      toast.error('Erro ao associar item: ' + e.message);
    }
  };

  // Desassocia item de uma zona
  const lidarComRemoverItem = async (itemId: number) => {
    if (!selectedZone) return;
    try {
      await api.deleteLayoutZoneItem(selectedZone.id, itemId);
      toast.success('Item desassociado com sucesso!');
      carregarDados();
    } catch (e: any) {
      toast.error('Erro ao remover item: ' + e.message);
    }
  };

  // Calcula cores e propriedades do Heatmap
  const maxSales = Math.max(...zones.map(z => z.sales_30_days || 0), 1);

  // Filtra produtos com base na busca
  const produtosFiltrados = products.filter(p => 
    p.name.toLowerCase().includes(buscaItem.toLowerCase()) ||
    p.barcode?.includes(buscaItem)
  );

  const renderPainelLateral = () => {
    if (isEditing) {
      return (
        <div className="glass-card" style={{ padding: '24px' }}>
          <div className="flex-between mb-4" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <span className="font-bold text-lg flex items-center gap-2">
              <Settings size={20} className="text-primary" style={{ color: 'var(--accent-blue)' }} />
              {formId ? 'Editar Seção' : 'Criar Seção'}
            </span>
            <button 
              onClick={() => setIsEditing(false)}
              className="btn-icon btn-delete"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={lidarComSalvarZona} className="flex-col gap-4">
            <div className="form-group">
              <label htmlFor="form-zone-name">Nome da Seção</label>
              <input
                id="form-zone-name"
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="input-field"
                placeholder="Ex: Gôndola Central A"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="form-zone-type">Tipo</label>
                <select
                  id="form-zone-type"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value)}
                  className="input-field select-field"
                >
                  <option value="shelf">Gôndola / Prateleira</option>
                  <option value="checkout">Caixa (PDV)</option>
                  <option value="fridge">Geladeira / Freezer</option>
                  <option value="bakery">Padaria</option>
                  <option value="butcher">Açougue</option>
                  <option value="hortifruti">Hortifrúti</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="form-zone-color">Cor no Mapa</label>
                <input
                  id="form-zone-color"
                  type="color"
                  value={formColor}
                  onChange={(e) => setFormColor(e.target.value)}
                  className="input-field p-1"
                  style={{ height: '48px', cursor: 'pointer' }}
                />
              </div>
            </div>

            <div style={{ border: '1px dashed var(--border)', borderRadius: '8px', padding: '16px', background: 'rgba(0,0,0,0.1)' }} className="flex-col gap-3">
              <span className="font-bold text-xs text-muted block">Coordenadas & Tamanho (Grid 16x12)</span>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="form-zone-x" className="text-xs">Coluna (X)</label>
                  <input
                    id="form-zone-x"
                    type="number"
                    min="0"
                    max="15"
                    value={formX}
                    onChange={(e) => setFormX(Number(e.target.value))}
                    className="input-field text-center"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="form-zone-y" className="text-xs">Linha (Y)</label>
                  <input
                    id="form-zone-y"
                    type="number"
                    min="0"
                    max="11"
                    value={formY}
                    onChange={(e) => setFormY(Number(e.target.value))}
                    className="input-field text-center"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="form-zone-width" className="text-xs">Largura</label>
                  <input
                    id="form-zone-width"
                    type="number"
                    min="1"
                    max="16"
                    value={formWidth}
                    onChange={(e) => setFormWidth(Number(e.target.value))}
                    className="input-field text-center"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="form-zone-height" className="text-xs">Altura</label>
                  <input
                    id="form-zone-height"
                    type="number"
                    min="1"
                    max="12"
                    value={formHeight}
                    onChange={(e) => setFormHeight(Number(e.target.value))}
                    className="input-field text-center"
                  />
                </div>
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: '12px' }}>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="btn btn-secondary"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn btn-primary"
              >
                <Save size={16} />
                Salvar Seção
              </button>
            </div>
          </form>
        </div>
      );
    }

    if (selectedZone) {
      return (
        <div className="glass-card" style={{ padding: '24px' }}>
          <div className="flex-between mb-3" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
            <div>
              <span className="badge info text-uppercase mb-1" style={{ fontSize: '0.65rem', padding: '10px 10px', margin: '10px 0px' }}>
                {obterNomeTipo(selectedZone.zone_type)}
              </span>
              <h3 className="font-bold text-lg flex items-center gap-2" style={{ margin: 0 }}>
                <span style={{ fontSize: '1.3rem' }}>{renderizarIconeTipo(selectedZone.zone_type)}</span>
                {selectedZone.name}
              </h3>
            </div>
            
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => abrirFormEdicao(selectedZone)}
                className="btn-icon btn-edit"
                title="Editar propriedades"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => lidarComExcluirZona(selectedZone.id)}
                className="btn-icon btn-delete"
                title="Excluir seção"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          {/* Informações da Seção */}
          <div className="flex-col gap-3 mb-4 bg-black/10" style={{ borderRadius: '8px', padding: '16px', border: '1px solid var(--border)' }}>
            <div className="flex-between">
              <div className="flex-col">
                <span className="text-xs text-muted font-semibold">Faturamento (30 dias)</span>
                <span className="font-bold text-lg text-primary flex items-center gap-1" style={{ color: 'var(--accent-blue)', marginTop: '4px' }}>
                  <TrendingUp size={18} />
                  R$ {(selectedZone.sales_30_days || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex-col text-right">
                <span className="text-xs text-muted font-semibold">Dimensões do Grid</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-main)', marginTop: '4px' }}>
                  X:{selectedZone.x}, Y:{selectedZone.y} ({selectedZone.width}x{selectedZone.height})
                </span>
              </div>
            </div>
          </div>

          {/* Lista de Categorias / Produtos vinculados */}
          <div className="flex-col gap-2 mb-4">
            <span className="font-bold text-xs text-muted block mb-1" style={{ padding: '15px 0px' }}>Itens e Categorias Posicionados</span>
            
            {selectedZone.items.length === 0 ? (
              <div className="empty-message-inline text-sm">
                <Package size={18} className="text-muted inline-block mr-1" />
                Nenhum produto ou categoria associado a esta prateleira.
              </div>
            ) : (
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px' }}>
                {selectedZone.items.map((item) => (
                  <div 
                    key={item.item_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      background: 'rgba(255, 255, 255, 0.01)',
                      borderBottom: '1px solid var(--border)'
                    }}
                    className="text-xs"
                  >
                    <div className="flex-col overflow-hidden pr-2">
                      {item.product_id ? (
                        <>
                          <span className="font-bold text-truncate text-white">📦 {item.product_name}</span>
                          <span className="text-muted text-xs">Código: {item.product_barcode}</span>
                        </>
                      ) : (
                        <span className="font-bold text-truncate text-info" style={{ color: '#06b6d4' }}>🏷️ Categoria: {item.category_name}</span>
                      )}
                    </div>

                    <button
                      onClick={() => lidarComRemoverItem(item.item_id)}
                      className="btn-icon btn-delete"
                      title="Remover item da seção"
                      style={{ width: '28px', height: '28px', padding: 0 }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Formulário para Associar Categoria / Produto */}
            <form onSubmit={lidarComAssociarItem} style={{ border: '1px dashed var(--border)', borderRadius: '8px', padding: '16px', background: 'rgba(0, 0, 0, 0.15)' }} className="flex-col gap-3">
              <span className="font-bold text-xs text-muted flex items-center gap-1" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '8px', marginBottom: '4px' }}>
                <FolderPlus size={14} />
                Posicionar Item na Prateleira
              </span>

              {/* Seleção de Categoria */}
              <div className="form-group">
                <label htmlFor="associate-category" className="text-xs">Por Categoria Inteira</label>
                <select
                  id="associate-category"
                  value={associarCatId}
                  onChange={(e) => {
                    setAssociarCatId(e.target.value);
                    setAssociarProdId('');
                  }}
                  className="input-field select-field"
                >
                  <option value="">-- Selecione uma Categoria --</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="text-center font-bold text-xs text-muted" style={{ margin: '4px 0' }}>ou</div>

              {/* Seleção de Produto Individual */}
              <div className="form-group">
                <label htmlFor="associate-product" className="text-xs">Por Produto Específico</label>
                
                {/* Campo de Busca Rápida de Produto */}
                <div style={{ position: 'relative', marginBottom: '8px' }}>
                  <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input
                    id="associate-product-search"
                    aria-label="Buscar produto por nome"
                    type="text"
                    placeholder="Buscar produto por nome..."
                    value={buscaItem}
                    onChange={(e) => setBuscaItem(e.target.value)}
                    className="input-field"
                    style={{ paddingLeft: '36px', height: '40px', fontSize: '0.9rem' }}
                  />
                </div>

                <select
                  id="associate-product"
                  value={associarProdId}
                  onChange={(e) => {
                    setAssociarProdId(e.target.value);
                    setAssociarCatId('');
                  }}
                  className="input-field select-field"
                >
                  <option value="">-- Selecione o Produto --</option>
                  {produtosFiltrados.slice(0, 30).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {produtosFiltrados.length > 30 && (
                  <span className="text-muted mt-1 block" style={{ fontSize: '0.65rem' }}>
                    Mostrando os 30 primeiros produtos. Refine a busca acima para ver mais.
                  </span>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary w-full flex-center gap-1"
                style={{ padding: '10px' }}
              >
                <PlusCircle size={16} />
                Adicionar Item à Seção
              </button>
            </form>
          </div>
        </div>
      );
    }

    return (
      <div 
        className="glass-card flex-col items-center justify-center gap-2 text-center text-muted"
        style={{ minHeight: '340px' }}
      >
        <Info size={40} className="text-muted" style={{ opacity: 0.5, marginBottom: '8px' }} />
        <h4 className="font-bold text-sm" style={{ color: 'var(--text-main)' }}>Nenhuma seção selecionada</h4>
        <p className="text-xs" style={{ maxWidth: '240px', margin: 0 }}>
          Selecione uma prateleira ou geladeira no mapa tridimensional à esquerda para gerenciar seus produtos, ver faturamento ou editar.
        </p>
      </div>
    );
  };

  return (
    <div className="container-fluid p-0 animate-fade-in" style={{ color: 'var(--text-main)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Cabeçalho */}
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-3">
        <div style={{ paddingBottom: '20px' }}>
          <h2 className="page-title d-flex align-items-center gap-2 mb-1" style={{ margin: 0 }}>
            <Store className="text-primary" size={32} style={{ color: 'var(--accent-blue)' }} />
            Mapeamento do Layout do Mercado
          </h2>
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            Visualize o mapa físico das prateleiras em 3D, analise o faturamento por seção e otimize seu planograma.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Alternador de Modo 3D / 2D */}
          <button
            onClick={() => setIs3dMode(!is3dMode)}
            className="btn btn-secondary flex-center gap-2"
            style={is3dMode ? { borderColor: 'var(--accent-blue)', color: 'var(--text-main)' } : {}}
          >
            <RefreshCw size={16} className={is3dMode ? 'spin' : ''} />
            {is3dMode ? 'Planta Baixa 2D' : 'Vista Isométrica 3D'}
          </button>

          {/* Alternador de Mapa de Calor */}
          <button
            onClick={() => setHeatmapMode(!heatmapMode)}
            className={`btn ${heatmapMode ? 'btn-danger' : 'btn-secondary'} flex-center gap-2`}
          >
            <Flame size={16} />
            {heatmapMode ? 'Desativar Calor' : 'Mapa de Calor'}
          </button>

          {/* Botão Nova Seção */}
          <button
            onClick={() => abrirFormCriacao()}
            className="btn btn-primary flex-center gap-2"
          >
            <Plus size={16} />
            Nova Seção
          </button>
        </div>
      </div>

      <div className="grid-2col-1-15">
        {/* Coluna da Esquerda: Mapa Físico 2D / 3D */}
        <div className="flex-col gap-3">
          <div className="glass-card" style={{ padding: '20px' }}>
            <div className="flex-between mb-3" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <span className="text-xs font-bold text-muted flex items-center gap-2 text-uppercase">
                <Grid size={14} />
                Planta Baixa do Mercado (Grid 16 x 12)
              </span>
              <span className="text-xs text-muted font-semibold">🚪 Entrada / Saída (Painel Inferior)</span>
            </div>

            {/* 3D / 2D Grid Viewport */}
            <div 
              style={{
                perspective: '1200px',
                width: '100%',
                overflow: 'hidden',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#090d16',
                borderRadius: '12px',
                minHeight: '520px',
                padding: is3dMode ? '60px' : '12px',
                transition: 'all 0.5s ease-in-out',
                border: '1px solid var(--border)'
              }}
            >
              {/* Floor / Grid Board */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  aspectRatio: '16/12',
                  backgroundColor: '#0c121f',
                  backgroundImage: `
                    linear-gradient(to right, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255, 255, 255, 0.035) 1px, transparent 1px)
                  `,
                  backgroundSize: 'calc(100% / 16) calc(100% / 12)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: '8px',
                  boxShadow: '0 30px 60px -15px rgba(0, 0, 0, 0.7)',
                  transformStyle: 'preserve-3d',
                  transform: is3dMode 
                    ? `rotateX(${tiltX}deg) rotateZ(${rotateZ}deg) scale(${zoom})` 
                    : 'rotateX(0deg) rotateZ(0deg) scale(1)',
                  transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                }}
              >
                {/* Zonas do Layout */}
                {zones.map((zone) => (
                  <LayoutZoneButton
                    key={zone.id}
                    zone={zone}
                    isSelected={selectedZone?.id === zone.id}
                    is3dMode={is3dMode}
                    heatmapMode={heatmapMode}
                    maxSales={maxSales}
                    onSelect={(z) => {
                      setSelectedZone(z);
                      setIsEditing(false);
                    }}
                  />
                ))}

                {/* Dica de interação */}
                <div 
                  className="position-absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 backdrop-blur-sm text-white font-bold"
                  style={{ fontSize: '0.65rem', pointerEvents: 'none', transform: 'translateZ(0px)' }}
                >
                  {is3dMode ? 'Visualização Espacial 3D ativa' : 'Clique nas seções para detalhes.'}
                </div>
              </div>
            </div>

            {/* Controles de Câmera 3D */}
            {is3dMode && (
              <div 
                className=" border mt-3 text-xs"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.01)', borderColor: 'var(--border)', display: 'flex',alignItems: 'center', gap: '10px' }}
              >
                <span className="font-bold text-muted flex items-center gap-1">
                  <Sliders size={14} />
                  Câmera:
                </span>
                <div className="flex items-center gap-2 flex-1" style={{ minWidth: '210px' }}>
                  <span className="text-muted">Inclinar:</span>
                  <input 
                    type="range" 
                    min="35" 
                    max="70" 
                    value={tiltX} 
                    onChange={e => setTiltX(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent-blue)' }}
                  />
                  <span className="text-muted font-mono">{tiltX}°</span>
                </div>
                <div className="flex items-center gap-2 flex-1" style={{ minWidth: '130px' }}>
                  <span className="text-muted">Rodar:</span>
                  <input 
                    type="range" 
                    min="-80" 
                    max="80" 
                    value={rotateZ} 
                    onChange={e => setRotateZ(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent-blue)' }}
                  />
                  <span className="text-muted font-mono">{rotateZ}°</span>
                </div>
                <div className="flex items-center gap-2 flex-1" style={{ minWidth: '110px' }}>
                  <span className="text-muted">Zoom:</span>
                  <input 
                    type="range" 
                    min="0.6" 
                    max="1.3" 
                    step="0.05"
                    value={zoom} 
                    onChange={e => setZoom(Number(e.target.value))}
                    style={{ flex: 1, accentColor: 'var(--accent-blue)' }}
                  />
                  <span className="text-muted font-mono">{(zoom * 100).toFixed(0)}%</span>
                </div>
                <button
                  onClick={() => {
                    setTiltX(55);
                    setRotateZ(-30);
                    setZoom(0.9);
                  }}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.75rem' }}
                >
                  Resetar
                </button>
              </div>
            )}
          </div>

          {/* Legenda do Heatmap se ativo */}
          {heatmapMode && (
            <div className="glass-card" style={{ padding: '16px', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div className="flex items-center gap-2">
                <Flame size={16} className="text-danger" style={{ color: 'var(--danger)' }} />
                <span className="font-bold text-sm">Legenda (Giro em 30 Dias):</span>
              </div>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }} className="text-xs">
                <span className="flex items-center gap-1.5">
                  <span className="d-inline-block rounded" style={{ width: '12px', height: '12px', backgroundColor: 'rgba(239, 68, 68, 0.85)' }}></span>
                  <span>Alto Giro (&gt;70%)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="d-inline-block rounded" style={{ width: '12px', height: '12px', backgroundColor: 'rgba(245, 158, 11, 0.85)' }}></span>
                  <span>Médio Giro (30%-70%)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="d-inline-block rounded" style={{ width: '12px', height: '12px', backgroundColor: 'rgba(59, 130, 246, 0.85)' }}></span>
                  <span>Baixo Giro (&lt;30%)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="d-inline-block rounded" style={{ width: '12px', height: '12px', backgroundColor: 'rgba(100, 116, 139, 0.8)' }}></span>
                  <span>Sem Vendas</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Coluna da Direita: Detalhes da Seção / Editor */}
        <div className="flex-col gap-3">
          {renderPainelLateral()}

          {/* Atalho Inteligente da IA */}
          <div 
            className="glass-card flex-col gap-3"
            style={{ 
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(139, 92, 246, 0.05) 100%)', 
              borderLeft: '4px solid var(--accent-blue)' 
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="text-primary animate-pulse" size={22} style={{ color: 'var(--accent-blue)' }} />
              <span className="font-bold text-sm text-white">Diagnóstico Espacial com IA</span>
            </div>
            <p className="text-xs text-muted" style={{ margin: 0, lineHeight: 1.4 }}>
              A IA analisa cruzamentos do seu mapa físico com as vendas de cada seção e gera recomendações automáticas para otimização do seu layout.
            </p>
            <a 
              href="/admin/ai-insights" 
              className="btn btn-primary w-full flex-center gap-2"
              style={{ textDecoration: 'none', padding: '10px', fontSize: '0.85rem' }}
            >
              Ver Recomendações de IA
              <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
