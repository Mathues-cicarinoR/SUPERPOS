import { useEffect, useState } from 'react';
import { api, type Employee } from '../services/api';
import { toast } from '../services/toast';
import { confirmService } from '../services/confirm';
import { Search, Edit2, Trash2, X, Users, Award, ShieldAlert, BadgeDollarSign, FileText, UserPlus, Info } from 'lucide-react';

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [cpf, setCpf] = useState('');
  const [rg, setRg] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [salary, setSalary] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [documentsInfo, setDocumentsInfo] = useState('');
  const [admissionPdf, setAdmissionPdf] = useState<string | null>(null);
  const [dismissalPdf, setDismissalPdf] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'admission' | 'dismissal') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast.warning('Apenas arquivos PDF são permitidos.');
      return;
    }

    if (file.size > 2 * 1024 * 1024) { // 2MB limit
      toast.warning('O arquivo PDF deve ter no máximo 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64String = event.target?.result as string;
      if (type === 'admission') {
        setAdmissionPdf(base64String);
      } else {
        setDismissalPdf(base64String);
      }
    };
    reader.readAsDataURL(file);
  };

  const openPdfWindow = (base64Data: string, filename: string) => {
    const win = window.open();
    if (win) {
      win.document.title = filename;
      const iframe = win.document.createElement('iframe');
      iframe.src = base64Data;
      iframe.style.border = '0';
      iframe.style.position = 'fixed';
      iframe.style.top = '0';
      iframe.style.left = '0';
      iframe.style.bottom = '0';
      iframe.style.right = '0';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.setAttribute('allowfullscreen', 'true');
      win.document.body.appendChild(iframe);
      win.document.body.style.margin = '0';
      win.document.body.style.padding = '0';
      win.document.body.style.overflow = 'hidden';
    } else {
      const link = document.createElement('a');
      link.href = base64Data;
      link.download = filename;
      link.click();
    }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.getEmployees();
      setEmployees(res);
    } catch (e: any) {
      toast.error('Erro ao carregar funcionários: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const openAddModal = () => {
    setEditingEmployee(null);
    setName('');
    setCpf('');
    setRg('');
    setPhone('');
    setEmail('');
    setRole('');
    setSalary('');
    const today = new Date().toISOString().split('T')[0];
    setAdmissionDate(today);
    setStatus('active');
    setDocumentsInfo('');
    setAdmissionPdf(null);
    setDismissalPdf(null);
    setIsModalOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmployee(emp);
    setName(emp.name);
    setCpf(emp.cpf || '');
    setRg(emp.rg || '');
    setPhone(emp.phone || '');
    setEmail(emp.email || '');
    setRole(emp.role);
    setSalary(emp.salary.toString());
    setAdmissionDate(emp.admission_date);
    setStatus(emp.status);
    setDocumentsInfo(emp.documents_info || '');
    setAdmissionPdf(emp.admission_pdf || null);
    setDismissalPdf(emp.dismissal_pdf || null);
    setIsModalOpen(true);
  };

  const openDetailsModal = (emp: Employee) => {
    setSelectedEmployee(emp);
    setIsDetailsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const confirm = await confirmService.show({
      title: 'Deseja remover este funcionário?',
      message: 'Esta ação não poderá ser desfeita. Todos os dados do funcionário serão removidos.',
      type: 'danger'
    });
    if (!confirm) return;

    try {
      const res = await api.deleteEmployee(id);
      if (res.success) {
        toast.success('Funcionário removido com sucesso!');
        fetchEmployees();
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao remover funcionário.');
    }
  };

  const handleSubmit = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!name || !role || !salary || !admissionDate) {
      toast.warning('Por favor, preencha todos os campos obrigatórios (*).');
      return;
    }

    const payload = {
      name,
      cpf: cpf || null,
      rg: rg || null,
      phone: phone || null,
      email: email || null,
      role,
      salary: Number.parseFloat(salary),
      admission_date: admissionDate,
      status,
      documents_info: documentsInfo || null,
      admission_pdf: admissionPdf,
      dismissal_pdf: dismissalPdf
    };

    try {
      if (editingEmployee) {
        const res = await api.updateEmployee(editingEmployee.id!, payload);
        if (res.success) {
          toast.success('Cadastro do funcionário atualizado com sucesso!');
        }
      } else {
        const res = await api.createEmployee(payload);
        if (res.success) {
          toast.success('Funcionário cadastrado com sucesso!');
        }
      }
      setIsModalOpen(false);
      fetchEmployees();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar funcionário.');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  // KPIs
  const activeCount = employees.filter(e => e.status === 'active').length;
  const inactiveCount = employees.filter(e => e.status === 'inactive').length;
  const totalPayroll = employees.filter(e => e.status === 'active').reduce((acc, e) => acc + e.salary, 0);
  const averageSalary = activeCount > 0 ? totalPayroll / activeCount : 0;

  // Filtering list
  const filteredEmployees = employees.filter(emp => {
    const search = searchTerm.toLowerCase();
    return (
      emp.name.toLowerCase().includes(search) ||
      emp.role.toLowerCase().includes(search) ||
      emp.cpf?.includes(search) ||
      emp.email?.toLowerCase().includes(search)
    );
  });

  const renderEmployeesTable = () => {
    if (loading) {
      return <div className="text-center py-5 text-muted">Carregando lista de funcionários...</div>;
    }

    if (filteredEmployees.length === 0) {
      return <div className="text-center py-5 text-muted">Nenhum funcionário encontrado.</div>;
    }

    return (
      <div className="table-responsive">
        <table className="table" style={{ minWidth: '1000px' }}>
          <thead>
            <tr>
              <th>Nome Completo</th>
              <th>Cargo</th>
              <th className="text-right">Salário Base</th>
              <th className="text-center">Admissão</th>
              <th className="text-center">Contato</th>
              <th className="text-center">Status</th>
              <th className="text-center" style={{ width: '150px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((emp) => (
              <tr key={emp.id} className="table-row">
                <td className="font-bold">
                  <div className="flex flex-col">
                    <span>{emp.name}</span>
                    {emp.cpf && <span className="text-xs text-muted font-normal">CPF: {emp.cpf}</span>}
                  </div>
                </td>
                <td>
                  <span className="badge info">{emp.role}</span>
                </td>
                <td className="text-right text-monospace font-semibold text-success">
                  {formatCurrency(emp.salary)}
                </td>
                <td className="text-center text-monospace text-sm text-muted">
                  {formatDate(emp.admission_date)}
                </td>
                <td className="text-center text-xs">
                  <div className="flex flex-col">
                    <span>{emp.phone || '-'}</span>
                    <span className="text-muted">{emp.email || '-'}</span>
                  </div>
                </td>
                <td className="text-center">
                  <span className={`badge ${emp.status === 'active' ? 'badge-success' : 'badge-secondary'}`}>
                    {emp.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="text-center">
                  <div className="flex-center gap-2">
                    <button
                      className="btn-icon"
                      onClick={() => openDetailsModal(emp)}
                      title="Ver Detalhes/Documentos"
                      style={{ color: 'var(--primary)' }}
                    >
                      <Info size={16} />
                    </button>
                    <button
                      className="btn-icon btn-edit"
                      onClick={() => openEditModal(emp)}
                      title="Editar Cadastro"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      className="btn-icon btn-delete"
                      onClick={() => handleDelete(emp.id!)}
                      title="Excluir Colaborador"
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
    <>
      <div className="employees-page animate-fade-in">
      <div className="flex-between mb-4">
        <div>
          <h2 className="section-title">Controle de Funcionários (RH)</h2>
          <p className="section-subtitle">
            Gerencie o cadastro da sua equipe de colaboradores, salários, cargos, datas de admissão e documentos.
          </p>
        </div>
        <button className="btn btn-primary flex-center gap-2" onClick={openAddModal}>
          <UserPlus size={18} />
          Cadastrar Funcionário
        </button>
      </div>

      {/* KPI Section */}
      <div className="dashboard-kpi-grid mb-4" style={{display: 'flex', justifyContent: 'space-between'}}>
        <div className="kpi-card glass-card">
          <div className="kpi-icon-wrapper text-primary">
            <Users size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-title">Funcionários Ativos</span>
            <h3 className="kpi-value text-warning text-monospace0" style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>{activeCount}</h3>
          </div>
        </div>

        <div className="kpi-card glass-card">
          <div className="kpi-icon-wrapper text-success">
            <BadgeDollarSign size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-title">Folha Mensal (Ativos)</span>
            <h3 className="kpi-value text-warning text-monospace0" style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>{formatCurrency(totalPayroll)} </h3>
          </div>
        </div>

        <div className="kpi-card glass-card">
          <div className="kpi-icon-wrapper text-warning">
            <Award size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-title">Média Salarial</span>
            <h3 className="kpi-value text-warning text-monospace0" style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>{formatCurrency(averageSalary)}</h3>
          </div>
        </div>

        <div className="kpi-card glass-card">
          <div className="kpi-icon-wrapper text-danger">
            <ShieldAlert size={24} />
          </div>
          <div className="kpi-details">
            <span className="kpi-title">Afastados/Inativos</span>
            <h3 className="kpi-value text-warning text-monospace0" style={{display: 'flex', justifyContent: 'center', alignItems: 'center'}}>{inactiveCount}</h3>
          </div>
        </div>
      </div>

      {/* Action / Search Block */}
      <div className="glass-card table-actions py-3 mb-4">
        <div className="search-form w-full flex gap-3">
          <div className="search-input-wrapper flex-grow">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar colaborador por nome, cargo, CPF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field search-input"
            />
          </div>
          {searchTerm && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setSearchTerm('')}
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      {/* Main List Table */}
      <div className="glass-card">
        {renderEmployeesTable()}
      </div>
    </div>

      {/* CRUD Edit/Add Modal */}
      {isModalOpen && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content glass-card animate-scale-in" style={{ maxWidth: '750px', width: '95%', padding: '24px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}>
            <div className="flex-between mb-4 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold flex-center gap-2">
                <UserPlus size={20} className="text-primary" />
                {editingEmployee ? 'Editar Ficha do Funcionário' : 'Cadastrar Novo Funcionário'}
              </h3>
              <button className="btn-icon" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="form-group">
                <label htmlFor="emp-name-input" className="text-sm font-semibold mb-1 block">Nome Completo *</label>
                <input
                  id="emp-name-input"
                  type="text"
                  required
                  placeholder="Nome completo do colaborador"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input-field"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label htmlFor="emp-cpf-input" className="text-sm font-semibold mb-1 block">CPF</label>
                  <input
                    id="emp-cpf-input"
                    type="text"
                    placeholder="000.000.000-00"
                    value={cpf}
                    onChange={(e) => setCpf(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-rg-input" className="text-sm font-semibold mb-1 block">RG</label>
                  <input
                    id="emp-rg-input"
                    type="text"
                    placeholder="RG / Órgão Emissor"
                    value={rg}
                    onChange={(e) => setRg(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label htmlFor="emp-phone-input" className="text-sm font-semibold mb-1 block">Telefone de Contato</label>
                  <input
                    id="emp-phone-input"
                    type="text"
                    placeholder="(00) 90000-0000"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-email-input" className="text-sm font-semibold mb-1 block">E-mail</label>
                  <input
                    id="emp-email-input"
                    type="email"
                    placeholder="email@superpos.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label htmlFor="emp-role-input" className="text-sm font-semibold mb-1 block">Cargo / Função *</label>
                  <input
                    id="emp-role-input"
                    type="text"
                    required
                    placeholder="Ex: Açougueiro, Caixa, Repositor"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-salary-input" className="text-sm font-semibold mb-1 block">Salário Base (R$) *</label>
                  <input
                    id="emp-salary-input"
                    type="number"
                    step="0.01"
                    required
                    placeholder="2000.00"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                    className="input-field"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-status-input" className="text-sm font-semibold mb-1 block">Status *</label>
                  <select
                    id="emp-status-input"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
                    className="input-field"
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                <div className="form-group">
                  <label htmlFor="emp-admission-date-input" className="text-sm font-semibold mb-1 block">Data de Admissão *</label>
                  <input
                    id="emp-admission-date-input"
                    type="date"
                    required
                    value={admissionDate}
                    onChange={(e) => setAdmissionDate(e.target.value)}
                    className="input-field"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <span className="text-sm font-semibold mb-1 block">Documento de Admissão (PDF)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => handleFileChange(e, 'admission')}
                      className="hidden"
                      id="admission-pdf-upload"
                      style={{ display: 'none' }}
                    />
                    <label
                      htmlFor="admission-pdf-upload"
                      className="btn btn-secondary flex-center gap-2 py-1.5 px-3 text-xs cursor-pointer w-full text-center justify-center font-semibold"
                      style={{ border: admissionPdf ? '1px dashed var(--success)' : '1px dashed var(--border)', background: 'rgba(255,255,255,0.02)' }}
                    >
                      <FileText size={14} className={admissionPdf ? "text-success" : ""} />
                      {admissionPdf ? 'Alterar PDF de Admissão' : 'Anexar PDF de Admissão'}
                    </label>
                    {admissionPdf && (
                      <button
                        type="button"
                        onClick={() => setAdmissionPdf(null)}
                        className="btn btn-danger py-1 px-2 text-xs flex-center gap-1"
                        style={{ height: '32px' }}
                        title="Remover documento"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <span className="text-sm font-semibold mb-1 block">Documento de Demissão (PDF)</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => handleFileChange(e, 'dismissal')}
                      className="hidden"
                      id="dismissal-pdf-upload"
                      style={{ display: 'none' }}
                    />
                    <label
                      htmlFor="dismissal-pdf-upload"
                      className="btn btn-secondary flex-center gap-2 py-1.5 px-3 text-xs cursor-pointer w-full text-center justify-center font-semibold"
                      style={{ border: dismissalPdf ? '1px dashed var(--success)' : '1px dashed var(--border)', background: 'rgba(255,255,255,0.02)' }}
                    >
                      <FileText size={14} className={dismissalPdf ? "text-success" : ""} />
                      {dismissalPdf ? 'Alterar PDF de Demissão' : 'Anexar PDF de Demissão'}
                    </label>
                    {dismissalPdf && (
                      <button
                        type="button"
                        onClick={() => setDismissalPdf(null)}
                        className="btn btn-danger py-1 px-2 text-xs flex-center gap-1"
                        style={{ height: '32px' }}
                        title="Remover documento"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="emp-documents-info-input" className="text-sm font-semibold mb-1 block">Informações de Documentos / Detalhes Gerais</label>
                <textarea
                  id="emp-documents-info-input"
                  placeholder="Escreva outros documentos importantes como PIS, CTPS, Número de Título, Conta para Depósito ou anotações internas."
                  value={documentsInfo}
                  onChange={(e) => setDocumentsInfo(e.target.value)}
                  className="input-field"
                  style={{ minHeight: '100px', resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>

              <div className="flex-end gap-3 mt-2">
                <button
                  type="button"
                  className="btn btn-secondary py-2 px-6"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary py-2 px-6">
                  {editingEmployee ? 'Atualizar Funcionário' : 'Cadastrar Funcionário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {isDetailsModalOpen && selectedEmployee && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content glass-card animate-scale-in" style={{ maxWidth: '750px', width: '95%', padding: '24px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}>
            <div className="flex-between mb-4 pb-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 className="text-lg font-bold flex-center gap-2">
                <Info size={20} className="text-primary" />
                Visualizar Ficha do Funcionário
              </h3>
              <button className="btn-icon" onClick={() => setIsDetailsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="form-group">
                <label htmlFor="emp-details-name-input" className="text-sm font-semibold mb-1 block">Nome Completo</label>
                <input
                  id="emp-details-name-input"
                  type="text"
                  readOnly
                  disabled
                  value={selectedEmployee.name}
                  className="input-field"
                  style={{ opacity: 0.85, cursor: 'default' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label htmlFor="emp-details-cpf-input" className="text-sm font-semibold mb-1 block">CPF</label>
                  <input
                    id="emp-details-cpf-input"
                    type="text"
                    readOnly
                    disabled
                    value={selectedEmployee.cpf || 'Não informado'}
                    className="input-field"
                    style={{ opacity: 0.85, cursor: 'default' }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-details-rg-input" className="text-sm font-semibold mb-1 block">RG</label>
                  <input
                    id="emp-details-rg-input"
                    type="text"
                    readOnly
                    disabled
                    value={selectedEmployee.rg || 'Não informado'}
                    className="input-field"
                    style={{ opacity: 0.85, cursor: 'default' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label htmlFor="emp-details-phone-input" className="text-sm font-semibold mb-1 block">Telefone de Contato</label>
                  <input
                    id="emp-details-phone-input"
                    type="text"
                    readOnly
                    disabled
                    value={selectedEmployee.phone || 'Não informado'}
                    className="input-field"
                    style={{ opacity: 0.85, cursor: 'default' }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-details-email-input" className="text-sm font-semibold mb-1 block">E-mail</label>
                  <input
                    id="emp-details-email-input"
                    type="email"
                    readOnly
                    disabled
                    value={selectedEmployee.email || 'Não informado'}
                    className="input-field"
                    style={{ opacity: 0.85, cursor: 'default' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <label htmlFor="emp-details-role-input" className="text-sm font-semibold mb-1 block">Cargo / Função</label>
                  <input
                    id="emp-details-role-input"
                    type="text"
                    readOnly
                    disabled
                    value={selectedEmployee.role}
                    className="input-field"
                    style={{ opacity: 0.85, cursor: 'default' }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-details-salary-input" className="text-sm font-semibold mb-1 block">Salário Base</label>
                  <input
                    id="emp-details-salary-input"
                    type="text"
                    readOnly
                    disabled
                    value={formatCurrency(selectedEmployee.salary)}
                    className="input-field font-semibold text-success text-monospace"
                    style={{ opacity: 0.85, cursor: 'default' }}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="emp-details-status-input" className="text-sm font-semibold mb-1 block">Status</label>
                  <input
                    id="emp-details-status-input"
                    type="text"
                    readOnly
                    disabled
                    value={selectedEmployee.status === 'active' ? 'Ativo' : 'Inativo'}
                    className={`input-field font-semibold ${selectedEmployee.status === 'active' ? 'text-success' : 'text-muted'}`}
                    style={{ opacity: 0.85, cursor: 'default' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
                <div className="form-group">
                  <label htmlFor="emp-details-admission-date-input" className="text-sm font-semibold mb-1 block">Data de Admissão</label>
                  <input
                    id="emp-details-admission-date-input"
                    type="text"
                    readOnly
                    disabled
                    value={formatDate(selectedEmployee.admission_date)}
                    className="input-field text-monospace"
                    style={{ opacity: 0.85, cursor: 'default' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group">
                  <span className="text-sm font-semibold mb-1 block">Documento de Admissão (PDF)</span>
                  <div className="flex items-center gap-2">
                    {selectedEmployee.admission_pdf ? (
                      <button
                        type="button"
                        onClick={() => openPdfWindow(selectedEmployee.admission_pdf!, `Admissao_${selectedEmployee.name.replace(/\s+/g, '_')}.pdf`)}
                        className="btn btn-secondary flex-center gap-2 py-1.5 px-3 text-xs w-full text-center justify-center font-semibold"
                        style={{ border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.05)', color: 'var(--primary)', height: '38px' }}
                      >
                        <FileText size={14} className="text-primary" />
                        Visualizar Admissão (PDF)
                      </button>
                    ) : (
                      <div className="input-field flex items-center text-xs text-muted italic" style={{ height: '38px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)' }}>
                        Nenhum documento anexado
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <span className="text-sm font-semibold mb-1 block">Documento de Demissão (PDF)</span>
                  <div className="flex items-center gap-2">
                    {selectedEmployee.dismissal_pdf ? (
                      <button
                        type="button"
                        onClick={() => openPdfWindow(selectedEmployee.dismissal_pdf!, `Demissao_${selectedEmployee.name.replace(/\s+/g, '_')}.pdf`)}
                        className="btn btn-secondary flex-center gap-2 py-1.5 px-3 text-xs w-full text-center justify-center font-semibold"
                        style={{ border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)', color: '#ef4444', height: '38px' }}
                      >
                        <FileText size={14} className="text-danger" />
                        Visualizar Demissão (PDF)
                      </button>
                    ) : (
                      <div className="input-field flex items-center text-xs text-muted italic" style={{ height: '38px', background: 'rgba(255,255,255,0.02)', border: '1px dashed var(--border)' }}>
                        Nenhum documento anexado
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="emp-details-documents-info-input" className="text-sm font-semibold mb-1 block">Informações de Documentos / Detalhes Gerais</label>
                <textarea
                  id="emp-details-documents-info-input"
                  readOnly
                  disabled
                  value={selectedEmployee.documents_info || 'Nenhuma informação adicional cadastrada.'}
                  className="input-field"
                  style={{ minHeight: '100px', resize: 'vertical', fontFamily: 'inherit', opacity: 0.85, cursor: 'default' }}
                />
              </div>

              <div className="flex-end gap-3 mt-2">
                <button
                  type="button"
                  className="btn btn-secondary py-2 px-6"
                  onClick={() => setIsDetailsModalOpen(false)}
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
