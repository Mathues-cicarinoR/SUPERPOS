import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../services/api';
import type { CashSession, Sale, Terminal } from '../services/api';
import { toast } from '../services/toast';
import { confirmService } from '../services/confirm';
import { 
  CircleDollarSign, 
  Calendar, 
  SlidersHorizontal, 
  Search, 
  Plus, 
  Trash2, 
  Eye, 
  X, 
  Settings2, 
  FileText,
  CreditCard,
  Coins,
  Cpu
} from 'lucide-react';

interface CashFlowProps {
  readonly activeTab?: 'sessions' | 'transactions' | 'terminals';
}

export default function CashFlow({ activeTab: propActiveTab = 'sessions' }: CashFlowProps) {
  const [activeTab, setActiveTab] = useState<'sessions' | 'transactions' | 'terminals'>(propActiveTab);
  
  // Sessions Tab State
  const [sessions, setSessions] = useState<CashSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [selectedPdv, setSelectedPdv] = useState('all');
  const [selectedOperator, setSelectedOperator] = useState('all');

  // Transactions Tab State
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [salesSearch, setSalesSearch] = useState('');

  // Terminals Tab State
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalsLoading, setTerminalsLoading] = useState(true);
  const [newTerminalName, setNewTerminalName] = useState('');
  const [terminalSubmitting, setTerminalSubmitting] = useState(false);

  // User session
  const [currentUser] = useState(() => {
    const local = localStorage.getItem('superpos_current_user');
    return local ? JSON.parse(local) : { username: 'Gerente' };
  });

  useEffect(() => {
    setActiveTab(propActiveTab);
  }, [propActiveTab]);

  useEffect(() => {
    if (activeTab === 'sessions') {
      loadSessions();
    } else if (activeTab === 'transactions') {
      loadSales();
    } else if (activeTab === 'terminals') {
      loadTerminals();
    }
  }, [activeTab]);

  // Data loaders
  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const res = await api.getCashSessions();
      setSessions(res);
    } catch (e: any) {
      toast.error('Erro ao carregar fluxo de caixa: ' + e.message);
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadSales = async () => {
    setSalesLoading(true);
    try {
      const res = await api.getSales();
      setSales(res);
    } catch (e: any) {
      toast.error('Erro ao carregar transações: ' + e.message);
    } finally {
      setSalesLoading(false);
    }
  };

  const loadTerminals = async () => {
    setTerminalsLoading(true);
    try {
      const res = await api.getTerminals();
      setTerminals(res);
    } catch (e: any) {
      toast.error('Erro ao carregar caixas: ' + e.message);
    } finally {
      setTerminalsLoading(false);
    }
  };

  // Terminals CRUD
  const handleCreateTerminal = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!newTerminalName.trim()) return;

    setTerminalSubmitting(true);
    try {
      await api.createTerminal(newTerminalName.trim(), currentUser.username);
      toast.success('Caixa configurado com sucesso!');
      setNewTerminalName('');
      loadTerminals();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao configurar novo caixa.');
    } finally {
      setTerminalSubmitting(false);
    }
  };

  const handleDeleteTerminal = async (id: number) => {
    const confirm = await confirmService.show({
      title: 'Excluir Caixa',
      message: 'Deseja realmente excluir esta configuração de caixa?',
      type: 'danger'
    });
    if (!confirm) return;

    try {
      await api.deleteTerminal(id, currentUser.username);
      toast.success('Caixa removido com sucesso.');
      loadTerminals();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover caixa. Certifique-se de que ele não possui sessões associadas.');
    }
  };

  // Formatting Helpers
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const handleDownloadSessionsPDF = () => {
    const newWindow = window.open('', '_blank');
    if (!newWindow) {
      toast.error('Erro ao abrir nova janela para gerar PDF.');
      return;
    }

    const sortedSessions = [...filteredSessions].sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());

    const rowsHtml = sortedSessions.map(s => {
      const discrepancyAmt = s.status === 'closed' ? (s.final_cash_reported || 0) - (s.initial_float + s.sales_cash) : 0;
      
      let discrepancyColor = '#64748b';
      if (discrepancyAmt < 0) {
        discrepancyColor = '#ef4444';
      } else if (discrepancyAmt > 0) {
        discrepancyColor = '#10b981';
      }

      let discrepancyText = '-';
      if (s.status === 'closed') {
        const prefix = discrepancyAmt > 0 ? '+' : '';
        discrepancyText = prefix + formatCurrency(discrepancyAmt);
      }

      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; text-align: left; font-weight: 600;">${s.pdv_name || 'Caixa 01'}</td>
          <td style="padding: 10px; text-align: left;">${s.operator_name}</td>
          <td style="padding: 10px; text-align: center;">
            <span style="padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; background-color: ${s.status === 'open' ? '#fef3c7; color: #d97706;' : '#d1fae5; color: #065f46;'}">
              ${s.status === 'open' ? 'Aberto' : 'Fechado'}
            </span>
          </td>
          <td style="padding: 10px; text-align: center; font-size: 11px;">
            ${new Date(s.opened_at).toLocaleString('pt-BR')}
          </td>
          <td style="padding: 10px; text-align: center; font-size: 11px;">
            ${s.closed_at ? new Date(s.closed_at).toLocaleString('pt-BR') : '-'}
          </td>
          <td style="padding: 10px; text-align: right; font-family: monospace;">${formatCurrency(s.initial_float)}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace;">${formatCurrency(s.sales_cash)}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace;">
            ${s.status === 'closed' ? formatCurrency(s.final_cash_reported || 0) : '-'}
          </td>
          <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: bold; color: ${discrepancyColor};">
            ${discrepancyText}
          </td>
        </tr>
      `;
    }).join('');

    const doc = newWindow.document as any;
    doc.write(`
      <html>
        <head>
          <title>Relatorio_Sessoes_Caixa_${new Date().toISOString().slice(0,10)}</title>
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
            td { font-size: 12px; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8; margin-top: 5px; }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Relatório de Sessões de Caixa</h1>
              <div style="font-size: 13px; color: #64748b; margin-top: 5px;">SuperPOS - Fluxo de Caixas</div>
            </div>
            <div class="meta">
              <div>Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
              <div>Operador: ${currentUser.username}</div>
            </div>
          </div>
          
          <div class="kpis">
            <div class="kpi-card" style="border-top: 3px solid #3b82f6;">
              <span class="kpi-title">Fundo de Abertura</span>
              <span class="kpi-val" style="color: #3b82f6;">${formatCurrency(totalOpeningFloat)}</span>
            </div>
            <div class="kpi-card" style="border-top: 3px solid #10b981;">
              <span class="kpi-title">Faturamento Espécie</span>
              <span class="kpi-val" style="color: #10b981;">${formatCurrency(totalSalesCash)}</span>
            </div>
            <div class="kpi-card" style="border-top: 3px solid #64748b;">
              <span class="kpi-title">Total Informado</span>
              <span class="kpi-val">${formatCurrency(reportedCashClosed)}</span>
            </div>
            <div class="kpi-card" style="border-top: 3px solid #ef4444;">
              <span class="kpi-title">Quebra Acumulada</span>
              <span class="kpi-val" style="color: ${discrepancy < 0 ? '#ef4444' : '#10b981'}">${discrepancy > 0 ? '+' : ''}${formatCurrency(discrepancy)}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="text-align: left;">PDV</th>
                <th style="text-align: left;">Operador</th>
                <th style="text-align: center; width: 80px;">Status</th>
                <th style="text-align: center; width: 140px;">Abertura</th>
                <th style="text-align: center; width: 140px;">Fechamento</th>
                <th style="text-align: right; width: 110px;">Fundo Inicial</th>
                <th style="text-align: right; width: 110px;">Vendas Dinheiro</th>
                <th style="text-align: right; width: 110px;">Recolhido</th>
                <th style="text-align: right; width: 110px;">Diferença</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          
          <div class="footer">
            Relatório emitido através do módulo de fluxo de caixa SuperPOS. Todos os direitos reservados.
          </div>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  const handleDownloadSalesPDF = () => {
    const newWindow = window.open('', '_blank');
    if (!newWindow) {
      toast.error('Erro ao abrir nova janela para gerar PDF.');
      return;
    }

    const sortedSales = [...filteredSales].sort((a, b) => (b.id || 0) - (a.id || 0));

    const rowsHtml = sortedSales.map(s => {
      const net = s.final_amount - (s.fee_amount || 0);
      return `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px; text-align: center; font-weight: bold; color: #3b82f6;">#${s.id}</td>
          <td style="padding: 10px; text-align: center; font-size: 11px;">
            ${s.created_at ? new Date(s.created_at).toLocaleString('pt-BR') : '-'}
          </td>
          <td style="padding: 10px; text-align: left; font-weight: 600;">${s.customer_name || 'Consumidor Final'}</td>
          <td style="padding: 10px; text-align: center; text-transform: uppercase; font-size: 11px;">${s.payment_method}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace;">${formatCurrency(s.total_amount)}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace; color: #ef4444;">-${formatCurrency(s.discount)}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: bold;">${formatCurrency(s.final_amount)}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace; color: #ef4444;">-${formatCurrency(s.fee_amount || 0)}</td>
          <td style="padding: 10px; text-align: right; font-family: monospace; font-weight: bold; color: #10b981;">${formatCurrency(net)}</td>
        </tr>
      `;
    }).join('');

    const doc = newWindow.document as any;
    doc.write(`
      <html>
        <head>
          <title>Relatorio_Vendas_e_Transacoes_${new Date().toISOString().slice(0,10)}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b; padding: 40px; margin: 0; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 30px; }
            .title { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; }
            .meta { font-size: 12px; color: #64748b; text-align: right; }
            .kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; }
            .kpi-card { padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; text-align: center; }
            .kpi-title { font-size: 11px; text-transform: uppercase; font-weight: bold; color: #64748b; margin-bottom: 5px; display: block; }
            .kpi-val { font-size: 20px; font-weight: 800; font-family: monospace; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 40px; }
            th { background: #f8fafc; padding: 12px 10px; font-size: 12px; font-weight: bold; text-transform: uppercase; color: #64748b; border-bottom: 2px solid #e2e8f0; }
            td { font-size: 13px; }
            .footer { border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8; margin-top: 5px; }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <h1 class="title">Relatório Geral de Vendas e Transações</h1>
              <div style="font-size: 13px; color: #64748b; margin-top: 5px;">SuperPOS - Auditoria de Receita</div>
            </div>
            <div class="meta">
              <div>Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
              <div>Operador: ${currentUser.username}</div>
            </div>
          </div>
          
          <div class="kpis">
            <div class="kpi-card" style="border-left: 4px solid #3b82f6;">
              <span class="kpi-title">Faturamento Bruto</span>
              <span class="kpi-val" style="color: #3b82f6;">${formatCurrency(totalSalesGross)}</span>
            </div>
            <div class="kpi-card" style="border-left: 4px solid #ef4444;">
              <span class="kpi-title">Taxas Maquinetas</span>
              <span class="kpi-val" style="color: #ef4444;">-${formatCurrency(totalSalesFees)}</span>
            </div>
            <div class="kpi-card" style="border-left: 4px solid #10b981;">
              <span class="kpi-title">Faturamento Líquido</span>
              <span class="kpi-val" style="color: #10b981;">${formatCurrency(totalSalesNet)}</span>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th style="text-align: center; width: 60px;">Venda ID</th>
                <th style="text-align: center; width: 140px;">Data/Hora</th>
                <th style="text-align: left;">Cliente</th>
                <th style="text-align: center; width: 100px;">Meio Pag.</th>
                <th style="text-align: right; width: 100px;">Subtotal</th>
                <th style="text-align: right; width: 90px;">Desconto</th>
                <th style="text-align: right; width: 100px;">Valor Final</th>
                <th style="text-align: right; width: 90px;">Taxa</th>
                <th style="text-align: right; width: 105px;">Líquido</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          
          <div class="footer">
            Relatório emitido através do módulo financeiro SuperPOS. Todos os direitos reservados.
          </div>
          
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 1000);
            };
          </script>
        </body>
      </html>
    `);
    doc.close();
  };

  const getPaymentMethodBadge = (method: string) => {
    switch (method) {
      case 'dinheiro':
        return <span className="badge success flex-center gap-1"><Coins size={12} /> Dinheiro</span>;
      case 'pix':
        return <span className="badge warning flex-center gap-1">⚡ Pix</span>;
      case 'cartao':
        return <span className="badge info flex-center gap-1"><CreditCard size={12} /> Cartão</span>;
      case 'fiado':
        return <span className="badge danger flex-center gap-1">👤 Fiado</span>;
      default:
        return <span className="badge secondary">{method}</span>;
    }
  };

  // Sessions Logic
  const uniquePdvs = Array.from(new Set(sessions.map(s => s.pdv_name || 'Caixa 01')));
  const uniqueOperators = Array.from(new Set(sessions.map(s => s.operator_name)));

  const filteredSessions = sessions.filter(s => {
    const matchesPdv = selectedPdv === 'all' || (s.pdv_name || 'Caixa 01') === selectedPdv;
    const matchesOperator = selectedOperator === 'all' || s.operator_name === selectedOperator;
    return matchesPdv && matchesOperator;
  });

  const totalOpeningFloat = filteredSessions.reduce((sum, s) => sum + s.initial_float, 0);
  const totalSalesCash = filteredSessions.reduce((sum, s) => sum + s.sales_cash, 0);
  const closedSessions = filteredSessions.filter(s => s.status === 'closed');
  const expectedCashClosed = closedSessions.reduce((sum, s) => sum + s.initial_float + s.sales_cash, 0);
  const reportedCashClosed = closedSessions.reduce((sum, s) => sum + (s.final_cash_reported || 0), 0);
  const discrepancy = reportedCashClosed - expectedCashClosed;

  let discrepancyMessage = 'Caixas batendo perfeitamente';
  let discrepancyValueColorClass = '';

  if (discrepancy < 0) {
    discrepancyMessage = 'Faltando dinheiro no fechamento';
    discrepancyValueColorClass = 'text-danger';
  } else if (discrepancy > 0) {
    discrepancyMessage = 'Sobra de caixa identificada';
    discrepancyValueColorClass = 'text-success';
  }

  // Transactions Logic
  const filteredSales = sales.filter(sale => {
    if (!salesSearch.trim()) return true;
    const searchLower = salesSearch.toLowerCase();
    const idMatches = String(sale.id).includes(searchLower);
    const customerMatches = sale.customer_name?.toLowerCase().includes(searchLower);
    const methodMatches = sale.payment_method.toLowerCase().includes(searchLower);
    return idMatches || customerMatches || methodMatches;
  });

  const totalSalesGross = filteredSales.reduce((sum, s) => sum + s.final_amount, 0);
  const totalSalesFees = filteredSales.reduce((sum, s) => sum + (s.fee_amount || 0), 0);
  const totalSalesNet = totalSalesGross - totalSalesFees;

  const renderSessionsContent = () => {
    if (sessionsLoading) {
      return <div className="text-center py-5 text-muted">Carregando sessões...</div>;
    }

    if (filteredSessions.length === 0) {
      return <div className="text-center py-5 text-muted">Nenhuma sessão de caixa encontrada.</div>;
    }

    return (
      <div className="table-responsive">
        <table className="table" style={{ minWidth: '1350px' }}>
          <thead>
            <tr>
              <th>PDV</th>
              <th>Operador</th>
              <th>Status</th>
              <th>Abertura</th>
              <th>Fechamento</th>
              <th className="text-right">Fundo Inicial</th>
              <th className="text-right">Faturamento Caixa</th>
              <th className="text-right">Esperado em Dinheiro</th>
              <th className="text-right">Declarado Gaveta</th>
              <th className="text-right">Declarado Cartão</th>
              <th className="text-right">Diferença</th>
              <th>Autorizado por</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.map((s) => {
              const expected = s.initial_float + s.sales_cash;
              const reported = s.final_cash_reported ?? null;
              const cardReported = s.final_card_reported ?? null;
              const diff = reported === null ? null : reported - expected;

              let diffClass = 'text-muted';
              if (diff !== null) {
                if (diff < 0) diffClass = 'text-danger';
                else if (diff > 0) diffClass = 'text-success';
              }

              return (
                <tr key={s.id} className="table-row">
                  <td className="font-bold">{s.pdv_name || 'Caixa 01'}</td>
                  <td className="font-semibold">{s.operator_name}</td>
                  <td>
                    <span className={`badge ${s.status === 'open' ? 'badge-success animate-pulse' : 'badge-secondary'}`}>
                      {s.status === 'open' ? 'Aberto' : 'Fechado'}
                    </span>
                  </td>
                  <td className="text-xs text-monospace" style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{new Date(s.opened_at).toLocaleString('pt-BR')}</td>
                  <td className="text-xs text-monospace" style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>
                    {s.closed_at ? new Date(s.closed_at).toLocaleString('pt-BR') : '-'}
                  </td>
                  <td className="text-right text-monospace"  style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{formatCurrency(s.initial_float)}</td>
                  <td className="text-right text-monospace text-success"  style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>+{formatCurrency(s.sales_cash)}</td>
                  <td className="text-right text-monospace font-semibold"  style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>{formatCurrency(expected)}</td>
                  <td className="text-right text-monospace font-semibold"  style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>
                    {reported === null ? '-' : formatCurrency(reported)}
                  </td>
                  <td className="text-right text-monospace font-semibold text-info" style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>
                    {cardReported === null ? '-' : formatCurrency(cardReported)}
                  </td>
                  <td className="text-right text-monospace font-bold"  style={{ padding: '8px 10px', textAlign: 'center', fontFamily: 'monospace' }}>
                    {diff === null ? (
                      <span className="text-muted">-</span>
                    ) : (
                      <span className={diffClass}>
                        {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                      </span>
                    )}
                  </td>
                  <td className="font-semibold text-muted" style={{ fontSize: '0.85rem' }}>
                    {s.closed_by || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSalesContent = () => {
    if (salesLoading) {
      return <div className="text-center py-5 text-muted">Carregando transações de caixas...</div>;
    }

    if (filteredSales.length === 0) {
      return <div className="text-center py-5 text-muted">Nenhuma transação de venda registrada.</div>;
    }

    return (
      <div className="table-responsive">
        <table className="table" style={{ minWidth: '1100px' }}>
          <thead>
            <tr>
              <th style={{ width: '80px' }} className="text-center">ID</th>
              <th>Data/Hora</th>
              <th>Cliente</th>
              <th className="text-center">Forma Pagamento</th>
              <th className="text-center">Total Geral</th>
              <th className="text-center">Desconto</th>
              <th className="text-center">Valor Final</th>
              <th className="text-center">Taxa Cartão</th>
              <th className="text-center">Líquido Venda</th>
              <th className="text-center" style={{ width: '100px' }}>Detalhes</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map(sale => {
              const net = sale.final_amount - (sale.fee_amount || 0);
              return (
                <tr key={sale.id} className="table-row">
                  <td className="text-center text-monospace font-bold text-primary">#{sale.id}</td>
                  <td className="text-xs text-monospace">
                    {sale.created_at ? new Date(sale.created_at).toLocaleString('pt-BR') : '-'}
                  </td>
                  <td className="font-semibold">{sale.customer_name || 'Consumidor Final'}</td>
                  <td className="text-center">{getPaymentMethodBadge(sale.payment_method)}</td>
                  <td className="text-center text-monospace text-muted">{formatCurrency(sale.total_amount)}</td>
                  <td className="text-center text-monospace text-danger">-{formatCurrency(sale.discount)}</td>
                  <td className="text-center text-monospace font-bold text-white">{formatCurrency(sale.final_amount)}</td>
                  <td className="text-center text-monospace text-danger">-{formatCurrency(sale.fee_amount || 0)}</td>
                  <td className="text-center text-monospace font-bold text-success">{formatCurrency(net)}</td>
                  <td className="text-center">
                    <button
                      type="button"
                      className="btn-icon text-primary"
                      onClick={() => setSelectedSale(sale)}
                      title="Ver Itens Comprados"
                    >
                      <Eye size={16} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderTerminalsContent = () => {
    if (terminalsLoading) {
      return <div className="text-center py-5 text-muted">Carregando caixas cadastrados...</div>;
    }

    if (terminals.length === 0) {
      return <div className="text-center py-5 text-muted">Nenhum caixa configurado.</div>;
    }

    return (
      <div className="table-responsive">
        <table className="table" style={{ minWidth: '700px' }}>
          <thead>
            <tr>
              <th style={{ width: '80px' }} className="text-center">ID</th>
              <th>Nome / Identificador</th>
              <th className="text-center">Status</th>
              <th>Criado Em</th>
              <th className="text-center" style={{ width: '80px' }}>Excluir</th>
            </tr>
          </thead>
          <tbody>
            {terminals.map(term => (
              <tr key={term.id} className="table-row">
                <td className="text-center text-monospace text-muted">#{term.id}</td>
                <td className="font-bold">{term.name}</td>
                <td className="text-center">
                  <span className={`badge ${term.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>
                    {term.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="text-xs text-monospace">
                  {term.created_at ? new Date(term.created_at).toLocaleDateString('pt-BR') : '-'}
                </td>
                <td className="text-center">
                  <button
                    className="btn-icon btn-delete"
                    onClick={() => handleDeleteTerminal(term.id)}
                    title="Remover Configuração do Caixa"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* SESSÕES DE CAIXA TAB */}
      {activeTab === 'sessions' && (
        <div className="flex flex-col gap-4">
          {/* Filters bar */}
          <div className="glass-card flex-between gap-3 flex-wrap py-3 px-4">
            <div className="flex-center gap-2">
              <SlidersHorizontal size={18} className="text-primary" />
              <span className="font-semibold text-sm">Filtros de Relatório:</span>
            </div>
            
            <div style={{ display: 'flex', gap: '16px' }}>
              <div className="form-group mb-0 flex-center gap-2">
                <span className="text-xs text-muted font-bold uppercase">PDV:</span>
                <select
                  value={selectedPdv}
                  onChange={(e) => setSelectedPdv(e.target.value)}
                  className="input-field py-1 px-3 text-xs"
                  style={{ width: '150px' }}
                >
                  <option value="all">Todos os Caixas</option>
                  {uniquePdvs.map(pdv => (
                    <option key={pdv} value={pdv}>{pdv}</option>
                  ))}
                </select>
              </div>

              <div className="form-group mb-0 flex-center gap-2">
                <span className="text-xs text-muted font-bold uppercase">Operador:</span>
                <select
                  value={selectedOperator}
                  onChange={(e) => setSelectedOperator(e.target.value)}
                  className="input-field py-1 px-3 text-xs"
                  style={{ width: '150px' }}
                >
                  <option value="all">Todos Operadores</option>
                  {uniqueOperators.map(op => (
                    <option key={op} value={op}>{op}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* KPI Cards */}
          <div className="dashboard-grid">
            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Fundo de Entrada Total</span>
              </div>
              <span className="kpi-val text-monospace">{formatCurrency(totalOpeningFloat)}</span>
              <span className="kpi-trend text-muted text-xs">Total investido na abertura de gavetas</span>
            </div>

            <div className="kpi-card">
              <div className="kpi-header"  >
                <span className="kpi-title">Vendas em Dinheiro</span>
              </div>
              <span className="kpi-val text-monospace text-success">{formatCurrency(totalSalesCash)}</span>
              <span className="kpi-trend text-muted text-xs">Apenas faturamento em espécie</span>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Total Fechado (Informado)</span>
              </div>
              <span className="kpi-val text-monospace">{formatCurrency(reportedCashClosed)}</span>
              <span className="kpi-trend text-muted text-xs">Valores físicos recolhidos ao fim do turno</span>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Diferença / Quebra</span>
              </div>
              <span className={`kpi-val text-monospace ${discrepancyValueColorClass}`}>
                {discrepancy > 0 ? '+' : ''}{formatCurrency(discrepancy)}
              </span>
              <span className="kpi-trend text-muted text-xs">
                {discrepancyMessage}
              </span>
            </div>
          </div>

          {/* Session Details List */}
          <div className="glass-card">
            <div className="flex-between mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 className="panel-title flex-center gap-2" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} className="text-primary" />
                Histórico de Aberturas e Fechamentos de Caixa
              </h3>
              <button
                type="button"
                onClick={handleDownloadSessionsPDF}
                className="btn btn-secondary flex-center gap-2"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '6px 12px' }}
              >
                <FileText size={14} />
                Exportar PDF
              </button>
            </div>

            {renderSessionsContent()}
          </div>
        </div>
      )}

      {/* VENDAS / TRANSAÇÕES TAB */}
      {activeTab === 'transactions' && (
        <div className="flex flex-col gap-4">
          <div className="glass-card flex-between gap-3 py-3 px-4">
            <div className="flex-center gap-2">
              <FileText size={18} className="text-primary" />
              <span className="font-semibold text-sm">Histórico Global de Vendas</span>
            </div>

            <div className="search-input-wrapper" style={{ maxWidth: '350px', width: '100%' }}>
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder="Buscar por ID, cliente ou pagamento..."
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                  className="input-field search-input"
                style={{ padding: '6px 12px 6px 36px', fontSize: '0.85rem' }}
              />
            </div>
          </div>

          {/* KPI Summary Cards for Transactions (Sales, Fees, Net) */}
          <div className="dashboard-grid">
            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Faturamento Bruto</span>
              </div>
              <span className="kpi-val text-monospace">{formatCurrency(totalSalesGross)}</span>
              <span className="kpi-trend text-muted text-xs">Total pago pelos clientes no PDV</span>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Taxas Estimadas (Maquinetas)</span>
              </div>
              <span className="kpi-val text-monospace text-danger">-{formatCurrency(totalSalesFees)}</span>
              <span className="kpi-trend text-muted text-xs">Descontos administrativos de cartões/Pix</span>
            </div>

            <div className="kpi-card">
              <div className="kpi-header">
                <span className="kpi-title">Faturamento Líquido</span>
              </div>
              <span className="kpi-val text-monospace text-success">{formatCurrency(totalSalesNet)}</span>
              <span className="kpi-trend text-muted text-xs">Faturamento real depositado na conta</span>
            </div>
          </div>

          <div className="glass-card">
            <div className="flex-between mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 className="panel-title flex-center gap-2" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CircleDollarSign size={18} className="text-primary" />
                Histórico Geral de Vendas e Transações
              </h3>
              <button
                type="button"
                onClick={handleDownloadSalesPDF}
                className="btn btn-secondary flex-center gap-2"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '6px 12px' }}
              >
                <FileText size={14} />
                Exportar PDF
              </button>
            </div>

            {renderSalesContent()}
          </div>
        </div>
      )}

      {/* CONFIGURAÇÃO DE CAIXAS TAB */}
      {activeTab === 'terminals' && (
        <div className="grid-2col-1-2">
          {/* Create Box Form */}
          <div className="glass-card">
            <h3 className="panel-title mb-4 flex-center gap-2">
              <Plus size={20} className="text-primary" />
              Configurar Novo Caixa / PDV
            </h3>

            <form onSubmit={handleCreateTerminal} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label htmlFor="terminal-name-input" className="block text-xs text-muted mb-2 font-bold uppercase">Identificação / Nome do PDV</label>
                <input
                  id="terminal-name-input"
                  type="text"
                  placeholder="Ex: Caixa 03, Caixa Rápido 01"
                  className="input-field"
                  value={newTerminalName}
                  onChange={(e) => setNewTerminalName(e.target.value)}
                  required
                />
              </div>

              <button 
                type="submit" 
                className="btn btn-primary w-full py-2.5 mt-2 flex-center gap-2" 
                disabled={terminalSubmitting}
              >
                <Cpu size={16} />
                {terminalSubmitting ? 'Salvando...' : 'Cadastrar Caixa'}
              </button>
            </form>
          </div>

          {/* Terminals Directory List */}
          <div className="glass-card">
            <h3 className="panel-title mb-4 flex-center gap-2">
              <Settings2 size={20} className="text-primary" />
              Terminais / PDVs Ativos no Sistema
            </h3>

            {renderTerminalsContent()}
          </div>
        </div>
      )}

      {/* SALE TRANSACTION DETAILS MODAL */}
      {selectedSale && createPortal(
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content glass-card animate-scale-in" style={{ maxWidth: '600px', width: '90%', padding: '24px' }}>
            <div className="flex-between mb-4 pb-2" style={{ borderBottom: '1px solid var(--border)', marginBottom: '20px' }}>
              <h3 className="text-lg font-bold flex-center gap-2">
                <FileText size={20} className="text-primary" />
                Detalhes da Venda #{selectedSale.id}
              </h3>
              <button 
                type="button" 
                className="btn-icon" 
                onClick={() => setSelectedSale(null)}
                style={{ color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4 mb-4"  style={{ marginBottom: '10px', marginTop: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }} className="text-sm">
                <div>
                  <span className="block text-xs text-muted uppercase font-bold">Cliente</span>
                  <span className="font-semibold">{selectedSale.customer_name || 'Consumidor Final'}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted uppercase font-bold">Forma de Pagamento</span>
                  <span className="font-semibold uppercase">{selectedSale.payment_method}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted uppercase font-bold">Data/Hora</span>
                  <span className="text-monospace">
                    {selectedSale.created_at ? new Date(selectedSale.created_at).toLocaleString('pt-BR') : '-'}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-muted uppercase font-bold">Valor Pago</span>
                  <span className="font-bold text-success text-monospace">{formatCurrency(selectedSale.final_amount)}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted uppercase font-bold">Taxas da Maquineta</span>
                  <span className="font-bold text-danger text-monospace">-{formatCurrency(selectedSale.fee_amount || 0)}</span>
                </div>
                <div>
                  <span className="block text-xs text-muted uppercase font-bold">Valor Líquido</span>
                  <span className="font-bold text-success text-monospace">{formatCurrency(selectedSale.final_amount - (selectedSale.fee_amount || 0))}</span>
                </div>
              </div>

              <div>
                <h4 className="text-xs uppercase font-bold text-muted mb-2">Itens da Compra</h4>
                <div className="table-responsive" style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                  <table className="table" style={{ fontSize: '0.85rem' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#0f172a', zIndex: 1 }}>
                      <tr>
                        <th>Produto</th>
                        <th className="text-center">Qtd</th>
                        <th className="text-right">Unitário</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSale.items.map((item) => (
                        <tr key={item.product_id} className="table-row">
                          <td className="font-semibold">{item.product_name || `Produto #${item.product_id}`}</td>
                          <td className="text-center text-monospace">{item.quantity} {item.unit || 'un'}</td>
                          <td className="text-right text-monospace">{formatCurrency(item.price_unit)}</td>
                          <td className="text-right text-monospace font-bold">{formatCurrency(item.price_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="flex-end">
              <button 
                type="button" 
                className="btn btn-secondary py-2 px-6" 
                onClick={() => setSelectedSale(null)}
              >
                Fechar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
