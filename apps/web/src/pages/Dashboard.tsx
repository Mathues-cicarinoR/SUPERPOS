import { useEffect, useState } from 'react';
import { api, type DashboardData } from '../services/api';
import { toast } from '../services/toast';
import { DollarSign, ShoppingCart, TrendingUp, AlertTriangle, RefreshCw, Award, Package2 } from 'lucide-react';

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await api.getDashboard();
      setData(res);
    } catch (e: any) {
      toast.error('Erro ao carregar dados do dashboard: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // SVG Chart Helper
  const renderSvgChart = () => {
    if (!data || (data.chart_data?.length ?? 0) === 0) {
      return (
        <div className="chart-empty">
          <p>Nenhuma venda registrada nos últimos 7 dias.</p>
        </div>
      );
    }

    const chartData = data.chart_data;
    const padding = 40;
    const width = 600;
    const height = 220;
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const maxAmount = Math.max(...chartData.map(d => d.amount), 100);
    
    // Generate coordinates
    const points = chartData.map((d, index) => {
      const x = padding + (index / Math.max(chartData.length - 1, 1)) * chartWidth;
      const y = padding + chartHeight - (d.amount / maxAmount) * chartHeight;
      return { x, y, amount: d.amount, date: d.sale_date };
    });

    const pathD = points.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, '');

    // Area path closed at bottom to apply gradient
    const areaD = points.length > 0 
      ? `${pathD} L ${points.at(-1)!.x} ${padding + chartHeight} L ${points[0].x} ${padding + chartHeight} Z`
      : '';

    return (
      <div className="svg-chart-container">
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-blue)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = padding + chartHeight * ratio;
            const val = maxAmount * (1 - ratio);
            return (
              <g key={ratio}>
                <line 
                  x1={padding} 
                  y1={y} 
                  x2={width - padding} 
                  y2={y} 
                  stroke="rgba(255, 255, 255, 0.05)" 
                  strokeDasharray="4 4" 
                />
                <text 
                  x={padding - 10} 
                  y={y + 4} 
                  fill="var(--text-muted)" 
                  fontSize="10" 
                  textAnchor="end"
                >
                  {formatCurrency(val).split(',')[0]}
                </text>
              </g>
            );
          })}

          {/* Area under the line */}
          {areaD && <path d={areaD} fill="url(#chartGradient)" />}

          {/* Sparkline path */}
          {pathD && (
            <path 
              d={pathD} 
              fill="none" 
              stroke="var(--accent-blue)" 
              strokeWidth="3" 
              strokeLinecap="round" 
            />
          )}

          {/* Data points */}
          {points.map((p) => (
            <g key={p.date} className="chart-dot-group">
              <circle 
                cx={p.x} 
                cy={p.y} 
                r="5" 
                fill="var(--bg-dark)" 
                stroke="var(--accent-blue)" 
                strokeWidth="2" 
              />
              <circle 
                cx={p.x} 
                cy={p.y} 
                r="10" 
                fill="var(--accent-blue)" 
                opacity="0" 
                className="chart-dot-hover"
              >
                <title>{`${p.date}: ${formatCurrency(p.amount)}`}</title>
              </circle>
            </g>
          ))}

          {/* X axis labels */}
          {points.map((p) => {
            // Format YYYY-MM-DD or ISO timestamp to DD/MM
            const dateObj = new Date(p.date);
            let dateStr = p.date;
            if (!Number.isNaN(dateObj.getTime())) {
              const day = String(dateObj.getUTCDate()).padStart(2, '0');
              const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
              dateStr = `${day}/${month}`;
            }
            return (
              <text 
                key={p.date} 
                x={p.x} 
                y={height - padding + 20} 
                fill="var(--text-muted)" 
                fontSize="10" 
                textAnchor="middle"
              >
                {dateStr}
              </text>
            );
          })}
        </svg>
      </div>
    );
  };

  if (loading && !data) {
    return (
      <div className="flex-center" style={{ height: '50vh' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="dashboard-page animate-fade-in">
      {/* Top action row */}
      <div className="flex-between">
        <div>
          <h2 className="section-title">Resultados de Hoje</h2>
          <p className="section-subtitle">Acompanhe as métricas de vendas e estoque em tempo real.</p>
        </div>
        <button className="btn btn-secondary flex-center gap-2" onClick={fetchDashboardData} disabled={loading}>
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Stats Cards Grid */}
      <div className="stats-grid">
        {/* Card 1: Sales Revenue */}
        <div className="glass-card stat-card">
          <div className="stat-icon-wrapper blue">
            <DollarSign size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Vendas de Hoje</span>
            <h3 className="stat-value">{formatCurrency(data?.today_sales || 0)}</h3>
          </div>
        </div>

        {/* Card 2: Sales Count */}
        <div className="glass-card stat-card">
          <div className="stat-icon-wrapper green">
            <ShoppingCart size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Transações concluídas</span>
            <h3 className="stat-value">{data?.today_count || 0}</h3>
          </div>
        </div>

        {/* Card 3: Estimated Profit */}
        <div className="glass-card stat-card">
          <div className="stat-icon-wrapper purple">
            <TrendingUp size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Lucro Estimado</span>
            <h3 className="stat-value">{formatCurrency(data?.today_profit || 0)}</h3>
          </div>
        </div>

        {/* Card 4: Low Stock Alert */}
        <div className="glass-card stat-card">
          <div className={`stat-icon-wrapper ${(data?.low_stock_count || 0) > 0 ? 'red animate-pulse' : 'gray'}`}>
            <AlertTriangle size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-label">Alertas de Estoque</span>
            <h3 className="stat-value">{data?.low_stock_count || 0}</h3>
          </div>
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="dashboard-panels">
        {/* Left Side: Weekly Sales Chart */}
        <div className="glass-card chart-panel">
          <h3 className="panel-title">
            <TrendingUp size={20} color="var(--accent-blue)" />
            Faturamento dos Últimos 7 Dias
          </h3>
          {renderSvgChart()}
        </div>

        {/* Right Side Column */}
        <div className="dashboard-side-panels">
          {/* Top 5 Sellers */}
          <div className="glass-card list-panel">
            <h3 className="panel-title">
              <Award size={20} color="var(--warning)" />
              Mais Vendidos
            </h3>
            <div className="panel-list">
              {data && (data.best_sellers?.length ?? 0) > 0 ? (
                data.best_sellers.map((item, idx) => {
                  const maxRevenue = Math.max(...data.best_sellers.map(s => s.total_revenue), 1);
                  const progressPct = (item.total_revenue / maxRevenue) * 100;
                  return (
                    <div key={item.name} className="panel-list-item">
                      <div className="item-rank">{idx + 1}</div>
                      <div className="item-details">
                        <span className="item-name">{item.name}</span>
                        <div className="item-progress-bar">
                          <div className="item-progress" style={{ width: `${progressPct}%` }}></div>
                        </div>
                      </div>
                      <div className="item-meta">
                        <span className="item-qty">{item.total_qty} un</span>
                        <span className="item-value">{formatCurrency(item.total_revenue)}</span>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty-message-inline">Sem histórico de vendas.</div>
              )}
            </div>
          </div>

          {/* Low Stock Alerts list */}
          <div className="glass-card list-panel">
            <h3 className="panel-title">
              <Package2 size={20} color="var(--danger)" />
              Aviso de Estoque Baixo
            </h3>
            <div className="panel-list">
              {data && (data.low_stock_list?.length ?? 0) > 0 ? (
                data.low_stock_list.map((item) => (
                  <div key={item.name} className="panel-list-item flex-between py-2">
                    <div className="flex-center gap-2">
                      <div className="stock-alert-dot red"></div>
                      <span className="item-name">{item.name}</span>
                    </div>
                    <div className="flex-center gap-4 text-right">
                      <span className="stock-qty-text red">
                        {item.stock_qty} {item.unit}
                      </span>
                      <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                        mín: {item.min_stock}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-message-inline success">✓ Todos os produtos com estoque saudável!</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
