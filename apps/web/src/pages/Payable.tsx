import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { Supplier, PayableAccount, RecurringAccount } from '../services/api';
import { toast } from '../services/toast';
import { confirmService } from '../services/confirm';
import { Building2, Landmark, Plus, Trash2, CheckSquare, Square, Users, FileText, Calendar, TrendingUp, AlertCircle, ThumbsUp, Clock, RefreshCw } from 'lucide-react';

interface PayableTabProps {
  suppliers: Supplier[];
  payableAccounts: PayableAccount[];
  loading: boolean;
  currentUser: { username: string };
  loadData: () => Promise<void>;
  formatCurrency: (val: number) => string;
  pendingAmount: number;
  paidAmount: number;
}

function PayableTab({
  suppliers,
  payableAccounts,
  loading,
  currentUser,
  loadData,
  formatCurrency,
  pendingAmount,
  paidAmount
}: Readonly<PayableTabProps>) {
  const [payDescription, setPayDescription] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDueDate, setPayDueDate] = useState('');
  const [paySupplierId, setPaySupplierId] = useState<string>('');
  const [payBoletoFile, setPayBoletoFile] = useState<string>('');
  const [payBoletoName, setPayBoletoName] = useState<string>('');
  const [payLoading, setPayLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPayBoletoName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setPayBoletoFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setPayBoletoFile('');
      setPayBoletoName('');
    }
  };

  const handleCreatePayable = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!payDescription.trim() || !payAmount || !payDueDate) {
      toast.warning('Preencha os campos obrigatórios.');
      return;
    }

    setPayLoading(true);
    try {
      await api.createPayableAccount({
        supplier_id: paySupplierId ? Number.parseInt(paySupplierId, 10) : null,
        description: payDescription.trim(),
        amount: Number.parseFloat(payAmount),
        due_date: payDueDate,
        boleto_file: payBoletoFile || null,
        operator_name: currentUser.username
      } as any);
      toast.success('Conta a pagar cadastrada!');
      setPayDescription('');
      setPayAmount('');
      setPayDueDate('');
      setPaySupplierId('');
      setPayBoletoFile('');
      setPayBoletoName('');
      // Reset input element
      const fileInput = document.getElementById('boleto-upload-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar conta a pagar.');
    } finally {
      setPayLoading(false);
    }
  };

  const handleTogglePayStatus = async (id: number, currentStatus: 'paid' | 'pending') => {
    try {
      const newStatus = currentStatus === 'paid' ? 'pending' : 'paid';
      await api.updatePayableAccountStatus(id, newStatus, currentUser.username);
      toast.success(newStatus === 'paid' ? 'Conta marcada como Paga!' : 'Conta marcada como Pendente.');
      await loadData();
    } catch (err: any) {
      toast.error('Erro ao atualizar status: ' + err.message);
    }
  };

  const handleDeletePayable = async (id: number) => {
    const confirm = await confirmService.show({
      title: 'Excluir Conta a Pagar',
      message: 'Deseja excluir esta conta a pagar?',
      type: 'warning'
    });
    if (!confirm) return;
    try {
      await api.deletePayableAccount(id, currentUser.username);
      toast.success('Conta excluída.');
      await loadData();
    } catch (err: any) {
      toast.error('Erro ao excluir conta: ' + err.message);
    }
  };

  const handleViewBoleto = (base64Data: string, desc: string) => {
    const newWindow = globalThis.open();
    if (newWindow) {
      newWindow.document.title = `Boleto: ${desc}`;
      newWindow.document.documentElement.innerHTML = `
        <head>
          <title>Boleto: ${desc}</title>
          <style>
            body { margin: 0; background: #0f172a; display: flex; justify-content: center; align-items: center; height: 100vh; font-family: sans-serif; color: #fff; }
            iframe, img { max-width: 90%; max-height: 90%; border: 2px solid #334155; border-radius: 8px; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3); }
          </style>
        </head>
        <body>
          ${base64Data.startsWith('data:application/pdf') 
            ? `<iframe src="${base64Data}" width="100%" height="100%"></iframe>` 
            : `<img src="${base64Data}" alt="Boleto ${desc}" />`}
        </body>
      `;
    } else {
      toast.error("Não foi possível exibir o anexo. Por favor libere os pop-ups.");
    }
  };

  const handleDownloadPDFReport = () => {
    const newWindow = globalThis.open('', '_blank');
    if (!newWindow) {
      toast.error('Erro ao abrir nova janela para gerar PDF.');
      return;
    }
    
    // Sort accounts by due date
    const sortedAccounts = [...payableAccounts].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    
    const totalPending = sortedAccounts.filter(a => a.status === 'pending').reduce((sum, a) => sum + a.amount, 0);
    const totalPaid = sortedAccounts.filter(a => a.status === 'paid').reduce((sum, a) => sum + a.amount, 0);
    const totalGeneral = totalPending + totalPaid;
    
    const rowsHtml = sortedAccounts.map(a => `
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; text-align: left; font-weight: 600;">${a.description}</td>
        <td style="padding: 10px; text-align: left;">${a.supplier_name || 'N/A'}</td>
        <td style="padding: 10px; text-align: center;">${new Date(a.due_date).toLocaleDateString('pt-BR')}</td>
        <td style="padding: 10px; text-align: center; font-weight: bold; color: ${a.status === 'paid' ? '#10b981' : '#ef4444'};">
          ${a.status === 'paid' ? 'Pago' : 'Pendente'}
        </td>
        <td style="padding: 10px; text-align: right; font-weight: bold; font-family: monospace;">
          ${formatCurrency(a.amount)}
        </td>
      </tr>
    `).join('');

    newWindow.document.documentElement.innerHTML = `
      <head>
        <title>Relatorio_Contas_a_Pagar_${new Date().toISOString().slice(0,10)}</title>
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
            <h1 class="title">Relatório de Contas a Pagar</h1>
            <div style="font-size: 13px; color: #64748b; margin-top: 5px;">SuperPOS - Controle Financeiro</div>
          </div>
          <div class="meta">
            <div>Gerado em: ${new Date().toLocaleString('pt-BR')}</div>
            <div>Operador: ${currentUser.username}</div>
          </div>
        </div>
        
        <div class="kpis">
          <div class="kpi-card" style="border-left: 4px solid #ef4444;">
            <span class="kpi-title">Total Pendente</span>
            <span class="kpi-val" style="color: #ef4444;">${formatCurrency(totalPending)}</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #10b981;">
            <span class="kpi-title">Total Pago</span>
            <span class="kpi-val" style="color: #10b981;">${formatCurrency(totalPaid)}</span>
          </div>
          <div class="kpi-card" style="border-left: 4px solid #3b82f6;">
            <span class="kpi-title">Compromisso Geral</span>
            <span class="kpi-val" style="color: #3b82f6;">${formatCurrency(totalGeneral)}</span>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th style="text-align: left;">Descrição</th>
              <th style="text-align: left;">Fornecedor</th>
              <th style="text-align: center; width: 120px;">Vencimento</th>
              <th style="text-align: center; width: 100px;">Status</th>
              <th style="text-align: right; width: 150px;">Valor</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        
        <div class="footer">
          Relatório emitido através do módulo financeiro SuperPOS. Todos os direitos reservados.
        </div>
      </body>
    `;

    newWindow.print();
    setTimeout(() => {
      newWindow.close();
    }, 1000);
  };

  const renderAccountsList = () => {
    if (loading) {
      return <div className="text-center py-5 text-muted">Carregando contas...</div>;
    }
    if (payableAccounts.length === 0) {
      return <div className="text-center py-5 text-muted">Nenhuma conta a pagar cadastrada.</div>;
    }
    return (
      <div className="table-responsive">
        <table className="table" style={{ minWidth: '850px' }}>
          <thead>
            <tr>
              <th style={{ width: '40px' }} className="text-center">Pago</th>
              <th>Descrição</th>
              <th>Fornecedor</th>
              <th className="text-right">Valor</th>
              <th className="text-center">Vencimento</th>
              <th className="text-center" style={{ width: '120px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {payableAccounts.map(account => (
              <tr key={account.id} className="table-row">
                <td className="text-center">
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => handleTogglePayStatus(account.id!, account.status)}
                    title={account.status === 'paid' ? 'Marcar como Pendente' : 'Marcar como Pago'}
                    style={{ color: account.status === 'paid' ? 'var(--success)' : 'var(--text-muted)' }}
                  >
                    {account.status === 'paid' ? <CheckSquare size={20} /> : <Square size={20} />}
                  </button>
                </td>
                <td className="font-semibold">
                  <div>{account.description}</div>
                  {account.status === 'paid' && account.paid_at && (
                    <span className="block text-xs text-success text-monospace" style={{ marginTop: '4px' }}>Pago em: {new Date(account.paid_at).toLocaleDateString()}</span>
                  )}
                </td>
                <td>{account.supplier_name || <em className="text-muted">Não informado</em>}</td>
                <td className={`text-right font-bold text-monospace ${account.status === 'paid' ? 'text-success' : 'text-danger'}`}>
                  {formatCurrency(account.amount)}
                </td>
                <td className="text-center text-monospace text-xs">
                  {new Date(account.due_date).toLocaleDateString('pt-BR')}
                </td>
                <td className="text-center">
                  <div className="action-buttons flex-center gap-1">
                    {account.boleto_file ? (
                      <button
                        className="btn-icon text-primary hover:text-blue-300"
                        onClick={() => handleViewBoleto(account.boleto_file!, account.description)}
                        title="Ver Boleto Anexo"
                      >
                        <FileText size={16} />
                      </button>
                    ) : (
                      <span className="btn-icon text-muted cursor-not-allowed opacity-20" title="Sem boleto anexado">
                        <FileText size={16} />
                      </span>
                    )}
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => handleDeletePayable(account.id!)}
                      title="Excluir Conta"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Cards */}
      <div className="kpi-grid-2col">
        <div className="kpi-card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <div className="kpi-header">
            <span className="kpi-title">Total Pendente</span>
   
          </div>
          <span className="kpi-val text-monospace text-danger">{formatCurrency(pendingAmount)}</span>
          <span className="kpi-trend text-muted text-xs">Contas em aberto com vencimento futuro</span>
        </div>

        <div className="kpi-card" style={{ borderLeft: '4px solid var(--success)' }}>
          <div className="kpi-header">
            <span className="kpi-title">Total Pago</span>
          </div>
          <span className="kpi-val text-monospace text-success">{formatCurrency(paidAmount)}</span>
          <span className="kpi-trend text-muted text-xs">Contas liquidadas no período</span>
        </div>
      </div>

      <div className="grid-2col-1-2">
        {/* Create Account Payable Form */}
        <div className="glass-card">
          <h3 className="panel-title mb-4 flex-center gap-2">
            <Plus size={20} className="text-primary" />
            Lançar Conta a Pagar
          </h3>
          
          <form onSubmit={handleCreatePayable} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="pay-desc" className="block text-xs text-muted mb-2 font-bold uppercase">Descrição da Conta *</label>
              <input
                id="pay-desc"
                type="text"
                placeholder="Ex: Compra de mercadorias, Aluguel"
                className="input-field"
                value={payDescription}
                onChange={(e) => setPayDescription(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="pay-supplier" className="block text-xs text-muted mb-2 font-bold uppercase">Fornecedor</label>
              <select
                id="pay-supplier"
                className="input-field select-field"
                value={paySupplierId}
                onChange={(e) => setPaySupplierId(e.target.value)}
              >
                <option value="">-- Sem Fornecedor Vinculado --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="pay-amount" className="block text-xs text-muted mb-2 font-bold uppercase">Valor (R$) *</label>
              <input
                id="pay-amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                className="input-field font-semibold text-monospace"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="pay-due-date" className="block text-xs text-muted mb-2 font-bold uppercase">Data Vencimento *</label>
              <input
                id="pay-due-date"
                type="date"
                className="input-field text-monospace"
                value={payDueDate}
                onChange={(e) => setPayDueDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="boleto-upload-input" className="block text-xs text-muted mb-2 font-bold uppercase">Anexar Boleto (PDF/Img)</label>
              <input
                id="boleto-upload-input"
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                className="input-field"
                style={{ padding: '8px 12px', fontSize: '0.85rem' }}
              />
              {payBoletoName && <span className="block text-xs text-success mt-1 truncate">{payBoletoName}</span>}
            </div>

            <button type="submit" className="btn btn-primary w-full py-2.5 mt-2" disabled={payLoading}>
              {payLoading ? 'Lançando...' : 'Lançar Conta'}
            </button>
          </form>
        </div>

        {/* Accounts Payable Table */}
        <div className="glass-card">
          <div className="flex-between mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '20px'}}>
            <h3 className="panel-title flex-center gap-2" style={{ margin: '0' }}>
              <Landmark size={20} className="text-primary" />
              Listagem de Compromissos Financeiros
            </h3>
            <button
              type="button"
              onClick={handleDownloadPDFReport}
              className="btn btn-secondary flex-center gap-2"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '6px 12px' }}
            >
              <FileText size={14} />
              Exportar PDF
            </button>
          </div>
          {renderAccountsList()}
        </div>
      </div>
    </div>
  );
}

interface SuppliersTabProps {
  suppliers: Supplier[];
  loading: boolean;
  currentUser: { username: string };
  loadData: () => Promise<void>;
}

function SuppliersTab({ suppliers, loading, currentUser, loadData }: Readonly<SuppliersTabProps>) {
  const [supName, setSupName] = useState('');
  const [supCnpj, setSupCnpj] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supLoading, setSupLoading] = useState(false);

  const handleCreateSupplier = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!supName.trim()) return;

    setSupLoading(true);
    try {
      await api.createSupplier({
        name: supName.trim(),
        cnpj: supCnpj.trim() || null,
        phone: supPhone.trim() || null,
        email: supEmail.trim() || null,
        operator_name: currentUser.username
      } as any);
      toast.success('Fornecedor cadastrado com sucesso!');
      setSupName('');
      setSupCnpj('');
      setSupPhone('');
      setSupEmail('');
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cadastrar fornecedor.');
    } finally {
      setSupLoading(false);
    }
  };

  const handleDeleteSupplier = async (id: number) => {
    const confirm = await confirmService.show({
      title: 'Excluir Fornecedor',
      message: 'Excluir este fornecedor? Ele não pode ter nenhuma conta associada.',
      type: 'warning'
    });
    if (!confirm) return;
    try {
      await api.deleteSupplier(id, currentUser.username);
      toast.success('Fornecedor removido.');
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir fornecedor.');
    }
  };

  const renderSuppliersList = () => {
    if (loading) {
      return <div className="text-center py-5 text-muted">Carregando fornecedores...</div>;
    }
    if (suppliers.length === 0) {
      return <div className="text-center py-5 text-muted">Nenhum fornecedor cadastrado.</div>;
    }
    return (
      <div className="table-responsive">
        <table className="table" style={{ minWidth: '750px' }}>
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th className="text-center">CNPJ</th>
              <th className="text-center">Telefone</th>
              <th>E-mail</th>
              <th className="text-center" style={{ width: '80px' }}>Excluir</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map(sup => (
              <tr key={sup.id} className="table-row">
                <td className="font-bold">{sup.name}</td>
                <td className="text-center text-monospace text-xs">{sup.cnpj || '-'}</td>
                <td className="text-center text-monospace text-xs">{sup.phone || '-'}</td>
                <td className="text-xs">{sup.email || '-'}</td>
                <td className="text-center">
                  <button
                    className="btn-icon btn-delete"
                    onClick={() => handleDeleteSupplier(sup.id!)}
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
    <div className="grid-2col-1-2">
      {/* Create Supplier Form */}
      <div className="glass-card">
        <h3 className="panel-title mb-4 flex-center gap-2">
          <Plus size={20} className="text-primary" />
          Cadastrar Fornecedor
        </h3>

        <form onSubmit={handleCreateSupplier} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label htmlFor="sup-name" className="block text-xs text-muted mb-2 font-bold uppercase">Razão Social / Nome</label>
            <input
              id="sup-name"
              type="text"
              placeholder="Ex: Alfa Alimentos Ltda"
              className="input-field"
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="sup-cnpj" className="block text-xs text-muted mb-2 font-bold uppercase">CNPJ</label>
            <input
              id="sup-cnpj"
              type="text"
              placeholder="00.000.000/0000-00"
              className="input-field text-monospace"
              value={supCnpj}
              onChange={(e) => setSupCnpj(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="sup-phone" className="block text-xs text-muted mb-2 font-bold uppercase">Telefone</label>
            <input
              id="sup-phone"
              type="text"
              placeholder="(00) 00000-0000"
              className="input-field text-monospace"
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="sup-email" className="block text-xs text-muted mb-2 font-bold uppercase">E-mail Comercial</label>
            <input
              id="sup-email"
              type="email"
              placeholder="exemplo@fornecedor.com"
              className="input-field"
              value={supEmail}
              onChange={(e) => setSupEmail(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary w-full py-2.5 mt-2" disabled={supLoading}>
            {supLoading ? 'Salvando...' : 'Cadastrar Fornecedor'}
          </button>
        </form>
      </div>

      {/* Suppliers List Table */}
      <div className="glass-card">
        <h3 className="panel-title mb-4 flex-center gap-2">
          <Users size={20} className="text-primary" />
          Diretório de Fornecedores Cadastrados
        </h3>

        {renderSuppliersList()}
      </div>
    </div>
  );
}

interface CalendarTabProps {
  payableAccounts: PayableAccount[];
  formatCurrency: (val: number) => string;
}

function CalendarTab({ payableAccounts, formatCurrency }: Readonly<CalendarTabProps>) {
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(() => new Date().getMonth());
  const [bestBuyReport, setBestBuyReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const loadReport = async () => {
    setReportLoading(true);
    try {
      const rep = await api.getBestBuyDayReport();
      setBestBuyReport(rep);
    } catch (e: any) {
      console.warn("Erro ao buscar relatório de melhor dia de compra:", e);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, []);

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const renderBestBuyReport = () => {
    if (reportLoading) {
      return <div className="text-center py-5 text-muted">Analisando vendas e contas...</div>;
    }
    if (!bestBuyReport) {
      return <div className="text-center py-5 text-muted">Dados insuficientes para análise.</div>;
    }
    return (
      <div className="space-y-4 animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Recommendation Box */}
        <div className="p-3 bg-success/10 border border-success/20 rounded-lg flex gap-3" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '12px' }}>
          <ThumbsUp className="text-success flex-shrink-0 mt-1" size={20} />
          <div>
            <h4 className="text-sm font-bold text-success mb-1" style={{ color: 'var(--success)', margin: '0 0 4px 0' }}>Recomendação de Compras</h4>
            <p className="text-xs text-white leading-relaxed" style={{ margin: 0, fontSize: '11px', lineHeight: '1.4' }}>
              {bestBuyReport.recommendation.text}
            </p>
          </div>
        </div>

        {/* Stats Highlights */}
        <div className="grid grid-cols-2 gap-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div className="bg-white/5 p-2 rounded border border-white/5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '8px', borderRadius: '4px' }}>
            <span className="block text-[9px] text-muted font-bold uppercase" style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)' }}>Pico Semanal</span>
            <span className="text-xs font-bold text-white" style={{ fontSize: '12px' }}>{bestBuyReport.recommendation.peakWeekday}</span>
          </div>
          <div className="bg-white/5 p-2 rounded border border-white/5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '8px', borderRadius: '4px' }}>
            <span className="block text-[9px] text-muted font-bold uppercase" style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)' }}>Melhor Dia (Semana)</span>
            <span className="text-xs font-bold text-success" style={{ fontSize: '12px', color: 'var(--success)' }}>{bestBuyReport.recommendation.bestWeekday}</span>
          </div>
          <div className="bg-white/5 p-2 rounded border border-white/5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '8px', borderRadius: '4px' }}>
            <span className="block text-[9px] text-muted font-bold uppercase" style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)' }}>Pico Mês</span>
            <span className="text-xs font-bold text-white" style={{ fontSize: '12px' }}>Dia {bestBuyReport.recommendation.peakDayOfMonth}</span>
          </div>
          <div className="bg-white/5 p-2 rounded border border-white/5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '8px', borderRadius: '4px' }}>
            <span className="block text-[9px] text-muted font-bold uppercase" style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)' }}>Melhor Dia (Mês)</span>
            <span className="text-xs font-bold text-success" style={{ fontSize: '12px', color: 'var(--success)' }}>Dia {bestBuyReport.recommendation.bestDayOfMonth}</span>
          </div>
        </div>

        {/* Bottlenecks / Heavy Payable Days */}
        {bestBuyReport.recommendation.heavyPayableDays.length > 0 && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg flex gap-2" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '8px', display: 'flex', gap: '8px' }}>
            <AlertCircle className="text-danger flex-shrink-0 mt-0.5" size={16} />
            <div>
              <h5 className="text-xs font-bold text-danger mb-1" style={{ color: 'var(--danger)', margin: '0 0 4px 0', fontSize: '11px' }}>Gargalos Financeiros</h5>
              <p className="text-[10px] text-muted leading-relaxed" style={{ margin: 0, fontSize: '10px', lineHeight: '1.4' }}>
                Evite agendar novos pagamentos para os dias: <strong className="text-white">{bestBuyReport.recommendation.heavyPayableDays.join(', ')}</strong> devido à alta concentração de boletos.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', width: '100%' }}>
      {/* Calendar on the left (2/3 width) */}
      <div style={{ flex: '2 1 600px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="glass-card">
          <div className="flex-between mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px'}}>
            <h3 className="panel-title flex-center gap-2" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={20} className="text-primary" />
              Calendário de Compromissos Financeiros
            </h3>
            <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                type="button"
                onClick={() => {
                  if (currentMonth === 0) {
                    setCurrentMonth(11);
                    setCurrentYear(prev => prev - 1);
                  } else {
                    setCurrentMonth(prev => prev - 1);
                  }
                }}
                className="btn btn-secondary py-1 px-2 text-xs font-bold"
              >
                &lt;
              </button>
              <span className="text-xs font-bold text-white uppercase min-w-[120px] text-center">
                {new Date(currentYear, currentMonth).toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}
              </span>
              <button 
                type="button"
                onClick={() => {
                  if (currentMonth === 11) {
                    setCurrentMonth(0);
                    setCurrentYear(prev => prev + 1);
                  } else {
                    setCurrentMonth(prev => prev + 1);
                  }
                }}
                className="btn btn-secondary py-1 px-2 text-xs font-bold"
              >
                &gt;
              </button>
            </div>
          </div>

          {/* Calendar Grid Header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }} className="text-center font-bold text-xs text-muted mb-2">
            <div>DOM</div>
            <div>SEG</div>
            <div>TER</div>
            <div>QUA</div>
            <div>QUI</div>
            <div>SEX</div>
            <div>SÁB</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px', minHeight: '340px' }}>
            {/* Empty cells for padding */}
            {Array.from({ length: getFirstDayOfMonth(currentYear, currentMonth) }, (_, i) => `empty-${currentYear}-${currentMonth}-${i}`).map((keyStr) => (
              <div key={keyStr} className="rounded-lg p-2 min-h-[75px]" style={{ background: 'rgba(255, 255, 255, 0.01)', opacity: 0.1 }}></div>
            ))}

            {/* Days of the month */}
            {Array.from({ length: getDaysInMonth(currentYear, currentMonth) }, (_, i) => i + 1).map((dayNum) => {
              const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              
              // Find all payable accounts on this date
              const dayAccounts = payableAccounts.filter(a => a.due_date.startsWith(dateString));
              const pendingTotal = dayAccounts.filter(a => a.status === 'pending').reduce((sum, a) => sum + a.amount, 0);
              const paidTotal = dayAccounts.filter(a => a.status === 'paid').reduce((sum, a) => sum + a.amount, 0);
              
              const isToday = new Date().toDateString() === new Date(currentYear, currentMonth, dayNum).toDateString();
              
              // Color codes (Standard CSS fallback)
              let cellBg = 'rgba(255, 255, 255, 0.03)';
              let cellBorder = '1px solid rgba(255, 255, 255, 0.08)';
              if (isToday) {
                cellBg = 'rgba(59, 130, 246, 0.15)';
                cellBorder = '1px solid var(--primary)';
              } else if (pendingTotal > 1000) {
                cellBg = 'rgba(239, 68, 68, 0.12)';
                cellBorder = '1px solid rgba(239, 68, 68, 0.25)';
              } else if (pendingTotal > 0) {
                cellBg = 'rgba(245, 158, 11, 0.08)';
                cellBorder = '1px solid rgba(245, 158, 11, 0.2)';
              } else if (paidTotal > 0) {
                cellBg = 'rgba(16, 185, 129, 0.05)';
                cellBorder = '1px solid rgba(16, 185, 129, 0.15)';
              }

              return (
                <div 
                  key={`day-${dayNum}`} 
                  className="rounded-lg p-2 flex flex-col justify-between transition-all hover:bg-white/10"
                  style={{
                    minHeight: '75px',
                    background: cellBg,
                    border: cellBorder,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between'
                  }}
                >
                  <div className="flex-between" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className={`text-xs font-bold ${isToday ? 'text-primary' : 'text-muted'}`}>{dayNum}</span>
                    {dayAccounts.length > 0 && (
                      <span className="badge bg-white/10 text-white font-bold" style={{ fontSize: '8px', padding: '1px 4px', background: 'rgba(255,255,255,0.1)' }}>
                        {dayAccounts.length}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex flex-column items-end gap-0.5 mt-1" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    {pendingTotal > 0 && (
                      <span className="text-danger font-bold text-right" style={{ fontSize: '9px', letterSpacing: '-0.3px', display: 'block', width: '100%', color: 'var(--danger)' }} title="Pendente">
                        {formatCurrency(pendingTotal)}
                      </span>
                    )}
                    {paidTotal > 0 && (
                      <span className="text-success font-bold text-right" style={{ fontSize: '9px', letterSpacing: '-0.3px', display: 'block', width: '100%', color: 'var(--success)' }} title="Pago">
                        {formatCurrency(paidTotal)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Purchasing recommendation on the right (1/3 width) */}
      <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="glass-card flex flex-col justify-between" style={{ minHeight: '440px' }}>
          <div>
            <h3 className="panel-title flex-center gap-2 mb-3" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={20} className="text-success" />
              Melhor Dia para Compras
            </h3>
            
            {renderBestBuyReport()}
          </div>

          {/* Quick Info Tip */}
          <div className="p-2 bg-blue-500/5 border border-blue-500/10 rounded-lg mt-4 text-[10px] text-muted leading-relaxed" style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.1)', padding: '8px', borderRadius: '4px', fontSize: '10px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
            <strong>Algoritmo Preditivo:</strong> Cruzamos a curva de vendas dos últimos 90 dias com o fluxo de contas a pagar ativas, calculando o melhor momento de recompra (1-2 dias antes do pico de vendas) e evitando conflitos com datas de alto endividamento.
          </div>
        </div>
      </div>
    </div>
  );
}

interface RecurringTabProps {
  suppliers: Supplier[];
  recurringAccounts: RecurringAccount[];
  loading: boolean;
  loadData: () => Promise<void>;
  formatCurrency: (val: number) => string;
}

function RecurringTab({ suppliers, recurringAccounts, loading, loadData, formatCurrency }: Readonly<RecurringTabProps>) {
  const [recDescription, setRecDescription] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recDueDay, setRecDueDay] = useState('');
  const [recCategory, setRecCategory] = useState('');
  const [recSupplierId, setRecSupplierId] = useState<string>('');
  const [recStatus, setRecStatus] = useState<'active' | 'inactive'>('active');
  const [recSubmitting, setRecSubmitting] = useState(false);

  const [genYear, setGenYear] = useState(() => new Date().getFullYear());
  const [genMonth, setGenMonth] = useState(() => new Date().getMonth() + 1); // 1-12 range
  const [genSubmitting, setGenSubmitting] = useState(false);

  const handleCreateRecurring = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!recDescription.trim() || !recAmount || !recDueDay) {
      toast.warning('Preencha os campos obrigatórios.');
      return;
    }

    const day = Number.parseInt(recDueDay, 10);
    if (Number.isNaN(day) || day < 1 || day > 31) {
      toast.warning('O dia de vencimento deve ser entre 1 e 31.');
      return;
    }

    setRecSubmitting(true);
    try {
      await api.createRecurringAccount({
        description: recDescription.trim(),
        amount: Number.parseFloat(recAmount),
        due_day: day,
        category: recCategory.trim() || null,
        supplier_id: recSupplierId ? Number.parseInt(recSupplierId, 10) : null,
        status: recStatus
      });
      toast.success('Conta recorrente cadastrada!');
      setRecDescription('');
      setRecAmount('');
      setRecDueDay('');
      setRecCategory('');
      setRecSupplierId('');
      setRecStatus('active');
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao cadastrar conta recorrente.');
    } finally {
      setRecSubmitting(false);
    }
  };

  const handleDeleteRecurring = async (id: number) => {
    const confirm = await confirmService.show({
      title: 'Remover Conta Recorrente',
      message: 'Tem certeza que deseja remover esta conta recorrente fixa? Ela não gerará novos boletos automáticos.',
      type: 'danger'
    });
    if (!confirm) return;

    try {
      await api.deleteRecurringAccount(id);
      toast.success('Conta recorrente removida com sucesso.');
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao remover conta recorrente.');
    }
  };

  const handleToggleRecurringStatus = async (account: RecurringAccount) => {
    try {
      const newStatus = account.status === 'active' ? 'inactive' : 'active';
      await api.updateRecurringAccount(account.id!, {
        ...account,
        status: newStatus
      });
      toast.success(`Conta recorrente ${newStatus === 'active' ? 'ativada' : 'desativada'}!`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar status.');
    }
  };

  const handleGenerateMonthlyRecurring = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setGenSubmitting(true);
    try {
      const res = await api.generateRecurringAccounts(genYear, genMonth);
      if (res.success) {
        if (res.count > 0) {
          toast.success(`Sucesso! ${res.count} conta(s) recorrente(s) gerada(s) no Contas a Pagar.`);
        } else {
          toast.info('Nenhuma nova conta recorrente precisou ser gerada para este mês.');
        }
        await loadData();
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar contas recorrentes.');
    } finally {
      setGenSubmitting(false);
    }
  };

  const renderRecurringList = () => {
    if (loading) {
      return <div className="text-center py-5 text-muted">Carregando contas recorrentes...</div>;
    }
    if (recurringAccounts.length === 0) {
      return <div className="text-center py-5 text-muted">Nenhuma conta recorrente cadastrada.</div>;
    }
    return (
      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>Descrição</th>
              <th className="text-right">Valor Estimado</th>
              <th className="text-center">Dia Venc.</th>
              <th>Categoria</th>
              <th>Fornecedor</th>
              <th className="text-center">Status</th>
              <th className="text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {recurringAccounts.map(account => (
              <tr key={account.id} className="table-row">
                <td className="font-bold">{account.description}</td>
                <td className="text-right text-monospace text-success font-semibold">
                  {formatCurrency(account.amount)}
                </td>
                <td className="text-center text-monospace font-bold">
                  {account.due_day}
                </td>
                <td>
                  {account.category ? (
                    <span className="badge info">{account.category}</span>
                  ) : (
                    <span className="text-muted text-xs">-</span>
                  )}
                </td>
                <td>{account.supplier_name || <span className="text-muted text-xs">Não associado</span>}</td>
                <td className="text-center">
                  <button
                    onClick={() => handleToggleRecurringStatus(account)}
                    className={`badge ${account.status === 'active' ? 'badge-success' : 'badge-secondary'}`}
                    title="Clique para alternar status"
                    style={{ cursor: 'pointer', border: 'none', padding: '4px 8px' }}
                  >
                    {account.status === 'active' ? 'Ativa' : 'Pausada'}
                  </button>
                </td>
                <td className="text-center">
                  <button
                    className="btn-icon btn-delete"
                    onClick={() => handleDeleteRecurring(account.id!)}
                    title="Remover Conta Recorrente"
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
    <div className="grid-2col-1-2 animate-fade-in">
      {/* Configuração de Conta Recorrente Form */}
      <div className="flex flex-col gap-4">
        <div className="glass-card">
          <h3 className="panel-title mb-4 flex-center gap-2">
            <Plus size={20} className="text-primary" />
            Cadastrar Conta Recorrente
          </h3>
          
          <form onSubmit={handleCreateRecurring} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label htmlFor="rec-desc" className="block text-xs text-muted mb-2 font-bold uppercase">Descrição da Conta *</label>
              <input
                id="rec-desc"
                type="text"
                placeholder="Ex: Aluguel do Salão, Assinatura de Software"
                className="input-field"
                value={recDescription}
                onChange={(e) => setRecDescription(e.target.value)}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label htmlFor="rec-amount" className="block text-xs text-muted mb-2 font-bold uppercase">Valor Estimado *</label>
                <input
                  id="rec-amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  className="input-field text-monospace"
                  value={recAmount}
                  onChange={(e) => setRecAmount(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="rec-due-day" className="block text-xs text-muted mb-2 font-bold uppercase">Dia do Vencimento *</label>
                <input
                  id="rec-due-day"
                  type="number"
                  min="1"
                  max="31"
                  placeholder="1 a 31"
                  className="input-field text-monospace"
                  value={recDueDay}
                  onChange={(e) => setRecDueDay(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="rec-supplier" className="block text-xs text-muted mb-2 font-bold uppercase">Fornecedor Associado</label>
              <select
                id="rec-supplier"
                className="input-field select-field"
                value={recSupplierId}
                onChange={(e) => setRecSupplierId(e.target.value)}
              >
                <option value="">-- Sem Fornecedor --</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="rec-category" className="block text-xs text-muted mb-2 font-bold uppercase">Categoria / Centro de Custo</label>
              <input
                id="rec-category"
                type="text"
                placeholder="Ex: Infraestrutura, TI, Despesa Fixa"
                className="input-field"
                value={recCategory}
                onChange={(e) => setRecCategory(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="rec-status" className="block text-xs text-muted mb-2 font-bold uppercase">Status Inicial</label>
              <select
                id="rec-status"
                className="input-field select-field"
                value={recStatus}
                onChange={(e) => setRecStatus(e.target.value as 'active' | 'inactive')}
              >
                <option value="active">Ativa (Gerar cobranças)</option>
                <option value="inactive">Inativa (Pausada)</option>
              </select>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full mt-2"
              disabled={recSubmitting}
            >
              {recSubmitting ? 'Cadastrando...' : 'Adicionar Conta Recorrente'}
            </button>
          </form>
        </div>

        {/* Gerar Lançamentos Mensais */}
        <div className="glass-card" style={{ borderLeft: '4px solid var(--primary)' }}>
          <h3 className="panel-title mb-2 flex-center gap-2">
            <RefreshCw size={20} className="text-primary" />
            Processar Recorrências
          </h3>
          <p className="text-xs text-muted mb-4">
            Gere automaticamente no Contas a Pagar os boletos deste mês para todas as contas recorrentes marcadas como ativas.
          </p>

          <form onSubmit={handleGenerateMonthlyRecurring} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label htmlFor="gen-month" className="block text-xs text-muted mb-1 font-bold uppercase">Mês</label>
                <select
                  id="gen-month"
                  className="input-field select-field"
                  value={genMonth}
                  onChange={(e) => setGenMonth(Number.parseInt(e.target.value, 10))}
                >
                  {[
                    { value: 1, label: 'Janeiro' },
                    { value: 2, label: 'Fevereiro' },
                    { value: 3, label: 'Março' },
                    { value: 4, label: 'Abril' },
                    { value: 5, label: 'Maio' },
                    { value: 6, label: 'Junho' },
                    { value: 7, label: 'Julho' },
                    { value: 8, label: 'Agosto' },
                    { value: 9, label: 'Setembro' },
                    { value: 10, label: 'Outubro' },
                    { value: 11, label: 'Novembro' },
                    { value: 12, label: 'Dezembro' }
                  ].map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="gen-year" className="block text-xs text-muted mb-1 font-bold uppercase">Ano</label>
                <input
                  id="gen-year"
                  type="number"
                  className="input-field text-monospace"
                  value={genYear}
                  onChange={(e) => setGenYear(Number.parseInt(e.target.value, 10))}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full mt-2 flex-center gap-2"
              disabled={genSubmitting}
            >
              <RefreshCw size={16} className={genSubmitting ? 'spin' : ''} />
              {genSubmitting ? 'Gerando...' : 'Gerar Lançamentos do Mês'}
            </button>
          </form>
        </div>
      </div>

      {/* Lista de Contas Recorrentes */}
      <div className="glass-card">
        <h3 className="panel-title mb-4">Contas Recorrentes Fixas Cadastradas</h3>
        
        {renderRecurringList()}
      </div>
    </div>
  );
}

export default function Payable() {
  const [activeTab, setActiveTab] = useState<'payable' | 'suppliers' | 'calendar' | 'recurring'>('payable');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payableAccounts, setPayableAccounts] = useState<PayableAccount[]>([]);
  const [recurringAccounts, setRecurringAccounts] = useState<RecurringAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // User session
  const [currentUser] = useState(() => {
    const local = localStorage.getItem('superpos_current_user');
    return local ? JSON.parse(local) : { username: 'Gerente' };
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [sups, accounts, recurring] = await Promise.all([
        api.getSuppliers(),
        api.getPayableAccounts(),
        api.getRecurringAccounts()
      ]);
      setSuppliers(sups);
      setPayableAccounts(accounts);
      setRecurringAccounts(recurring);
    } catch (e: any) {
      toast.error('Erro ao carregar dados financeiros: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // KPIs
  const pendingAmount = payableAccounts
    .filter(a => a.status === 'pending')
    .reduce((sum, a) => sum + a.amount, 0);

  const paidAmount = payableAccounts
    .filter(a => a.status === 'paid')
    .reduce((sum, a) => sum + a.amount, 0);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {/* Tabs Switcher */}
      <div className="tab-menu" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
        <button
          onClick={() => setActiveTab('payable')}
          className={`btn ${activeTab === 'payable' ? 'btn-primary' : 'btn-secondary'} flex-center gap-2`}
        >
          <Landmark size={18} />
          Contas a Pagar
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`btn ${activeTab === 'suppliers' ? 'btn-primary' : 'btn-secondary'} flex-center gap-2`}
        >
          <Building2 size={18} />
          Fornecedores
        </button>
        <button
          onClick={() => setActiveTab('calendar')}
          className={`btn ${activeTab === 'calendar' ? 'btn-primary' : 'btn-secondary'} flex-center gap-2`}
        >
          <Calendar size={18} />
          Calendário & Recomendação
        </button>
        <button
          onClick={() => setActiveTab('recurring')}
          className={`btn ${activeTab === 'recurring' ? 'btn-primary' : 'btn-secondary'} flex-center gap-2`}
        >
          <Clock size={18} />
          Contas Recorrentes Fixas
        </button>
      </div>

      {activeTab === 'payable' && (
        <PayableTab
          suppliers={suppliers}
          payableAccounts={payableAccounts}
          loading={loading}
          currentUser={currentUser}
          loadData={loadData}
          formatCurrency={formatCurrency}
          pendingAmount={pendingAmount}
          paidAmount={paidAmount}
        />
      )}

      {activeTab === 'suppliers' && (
        <SuppliersTab
          suppliers={suppliers}
          loading={loading}
          currentUser={currentUser}
          loadData={loadData}
        />
      )}

      {activeTab === 'calendar' && (
        <CalendarTab
          payableAccounts={payableAccounts}
          formatCurrency={formatCurrency}
        />
      )}

      {activeTab === 'recurring' && (
        <RecurringTab
          suppliers={suppliers}
          recurringAccounts={recurringAccounts}
          loading={loading}
          loadData={loadData}
          formatCurrency={formatCurrency}
        />
      )}
    </div>
  );
}
