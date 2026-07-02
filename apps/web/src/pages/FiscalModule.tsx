import { useEffect, useState } from 'react';
import { api, type FiscalSettings } from '../services/api';
import { toast } from '../services/toast';
import { Settings } from 'lucide-react';

/**
 * Componente do Módulo Fiscal
 * Permite gerenciar as regras de tributação padrão (CFOP, Alíquotas) e credenciais do certificado digital A1.
 */
export default function FiscalModule() {
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

  const [certFileBase64, setCertFileBase64] = useState('');
  const [certPassword, setCertPassword] = useState('');
  const [fiscalLoading, setFiscalLoading] = useState(false);

  // Obtém o usuário logado para auditoria
  const [currentUser] = useState(() => {
    const local = localStorage.getItem('superpos_current_user');
    return local ? JSON.parse(local) : { username: 'Gerente', role: 'manager' };
  });

  // Busca as configurações fiscais salvas no backend
  const fetchFiscalSettings = async () => {
    try {
      const res = await api.getFiscalSettings();
      setFiscalSettings(res);
    } catch (e: any) {
      console.warn("Erro ao buscar configurações fiscais:", e);
    }
  };

  useEffect(() => {
    fetchFiscalSettings();
  }, []);

  // Processa o upload do certificado digital PFX (.pfx) convertendo para base64 na memória
  const handleCertUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = (event.target?.result as string).split(',')[1];
      setCertFileBase64(base64);
      toast.success(`Certificado ${file.name} carregado! Clique em Salvar para gravar.`);
    };
    reader.readAsDataURL(file);
  };

  // Salva as configurações fiscais e envia o certificado digital, se fornecido
  const handleSaveFiscalSettings = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setFiscalLoading(true);
    try {
      const payload: any = {
        ...fiscalSettings,
        operator_name: currentUser.username
      };
      if (certFileBase64) {
        payload.certificate_pfx = certFileBase64;
        payload.certificate_password = certPassword;
      }
      const res = await api.updateFiscalSettings(payload);
      if (res.success) {
        toast.success("Configurações fiscais salvas com sucesso!");
        setCertFileBase64('');
        setCertPassword('');
        fetchFiscalSettings();
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar configurações fiscais.");
    } finally {
      setFiscalLoading(false);
    }
  };

  return (
    <div className="fiscal-settings-tab animate-fade-in">
      <div className="glass-card">
        <h3 className="panel-title border-b pb-2 mb-4" style={{ fontSize: '1.2rem', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '20px' }}>
          <Settings className="text-primary animate-pulse" size={20} />
          Configuração do Módulo Fiscal (NFC-e / Consulta PE)
        </h3>

        <form onSubmit={handleSaveFiscalSettings} className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-row">
            <div className="form-group col-6">
              <label htmlFor="fiscal-cnpj-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>CNPJ da Empresa *</label>
              <input
                id="fiscal-cnpj-input"
                type="text"
                required
                placeholder="00.000.000/0000-00"
                value={fiscalSettings.cnpj}
                onChange={(e) => setFiscalSettings({ ...fiscalSettings, cnpj: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="form-group col-6">
              <label htmlFor="fiscal-razao-social-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Razão Social *</label>
              <input
                id="fiscal-razao-social-input"
                type="text"
                required
                placeholder="Ex: Supermercado do Bairro PE Ltda"
                value={fiscalSettings.razao_social}
                onChange={(e) => setFiscalSettings({ ...fiscalSettings, razao_social: e.target.value })}
                className="input-field"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group col-4">
              <label htmlFor="fiscal-inscricao-estadual-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Inscrição Estadual *</label>
              <input
                id="fiscal-inscricao-estadual-input"
                type="text"
                required
                placeholder="123456789"
                value={fiscalSettings.inscricao_estadual}
                onChange={(e) => setFiscalSettings({ ...fiscalSettings, inscricao_estadual: e.target.value })}
                className="input-field"
              />
            </div>
            <div className="form-group col-4">
              <label htmlFor="fiscal-state-select" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Estado (UF) *</label>
              <select
                id="fiscal-state-select"
                value={fiscalSettings.state}
                onChange={(e) => setFiscalSettings({ ...fiscalSettings, state: e.target.value })}
                className="input-field select-field"
              >
                <option value="PE">Pernambuco (PE)</option>
                <option value="SP">São Paulo (SP)</option>
                <option value="RJ">Rio de Janeiro (RJ)</option>
                <option value="MG">Minas Gerais (MG)</option>
              </select>
            </div>
            <div className="form-group col-4">
              <label htmlFor="fiscal-environment-select" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Ambiente *</label>
              <select
                id="fiscal-environment-select"
                value={fiscalSettings.environment}
                onChange={(e) => setFiscalSettings({ ...fiscalSettings, environment: Number.parseInt(e.target.value) })}
                className="input-field select-field"
              >
                <option value={2}>Homologação (Testes)</option>
                <option value={1}>Produção (Vendas Reais)</option>
              </select>
            </div>
          </div>

          <div className="border-t pt-3" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <h4 className="text-sm font-semibold text-blue-400 mb-3" style={{ color: 'var(--accent-blue)', marginBottom: '12px' }}>Configurações para Cupom Fiscal (NFC-e)</h4>
            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="fiscal-csc-id-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>ID do Token CSC (Ex: 000001)</label>
                <input
                  id="fiscal-csc-id-input"
                  type="text"
                  placeholder="000001"
                  value={fiscalSettings.csc_id}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, csc_id: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="form-group col-6">
                <label htmlFor="fiscal-csc-token-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Valor do Token CSC</label>
                <input
                  id="fiscal-csc-token-input"
                  type="text"
                  placeholder="Ex: AAAAA-BBBBB-CCCCC-DDDDD"
                  value={fiscalSettings.csc_token}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, csc_token: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-3" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <h4 className="text-sm font-semibold text-blue-400 mb-3" style={{ color: 'var(--accent-blue)', marginBottom: '12px' }}>Tributação Padrão dos Produtos (Alíquotas e Enquadramentos)</h4>

            <div className="form-row">
              <div className="form-group col-4">
                <label htmlFor="fiscal-default-cfop-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>CFOP Padrão *</label>
                <input
                  id="fiscal-default-cfop-input"
                  type="text"
                  required
                  placeholder="5102"
                  value={fiscalSettings.default_cfop || ''}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, default_cfop: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="form-group col-4">
                <label htmlFor="fiscal-default-csosn-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>CSOSN Padrão *</label>
                <input
                  id="fiscal-default-csosn-input"
                  type="text"
                  required
                  placeholder="102"
                  value={fiscalSettings.default_csosn || ''}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, default_csosn: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="form-group col-4">
                <label htmlFor="fiscal-default-origin-select" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Origem Padrão *</label>
                <select
                  id="fiscal-default-origin-select"
                  value={fiscalSettings.default_origin || '0'}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, default_origin: e.target.value })}
                  className="input-field select-field"
                >
                  <option value="0">0 - Nacional</option>
                  <option value="1">1 - Estrangeira (Importação direta)</option>
                  <option value="2">2 - Estrangeira (Adquirida no mercado interno)</option>
                </select>
              </div>
            </div>

            <div className="form-row mt-3">
              <div className="form-group col-4">
                <label htmlFor="fiscal-default-aliquot-icms-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Alíquota ICMS Padrão (%) *</label>
                <input
                  id="fiscal-default-aliquot-icms-input"
                  type="number"
                  step="any"
                  required
                  placeholder="18"
                  value={fiscalSettings.default_aliquot_icms ?? ''}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, default_aliquot_icms: Number.parseFloat(e.target.value) || 0 })}
                  className="input-field"
                />
              </div>
              <div className="form-group col-4">
                <label htmlFor="fiscal-default-cst-pis-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>CST PIS Padrão *</label>
                <input
                  id="fiscal-default-cst-pis-input"
                  type="text"
                  required
                  placeholder="49"
                  value={fiscalSettings.default_cst_pis || ''}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, default_cst_pis: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="form-group col-4">
                <label htmlFor="fiscal-default-aliquot-pis-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Alíquota PIS Padrão (%) *</label>
                <input
                  id="fiscal-default-aliquot-pis-input"
                  type="number"
                  step="any"
                  required
                  placeholder="0"
                  value={fiscalSettings.default_aliquot_pis ?? ''}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, default_aliquot_pis: Number.parseFloat(e.target.value) || 0 })}
                  className="input-field"
                />
              </div>
            </div>

            <div className="form-row mt-3">
              <div className="form-group col-6">
                <label htmlFor="fiscal-default-cst-cofins-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>CST COFINS Padrão *</label>
                <input
                  id="fiscal-default-cst-cofins-input"
                  type="text"
                  required
                  placeholder="49"
                  value={fiscalSettings.default_cst_cofins || ''}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, default_cst_cofins: e.target.value })}
                  className="input-field"
                />
              </div>
              <div className="form-group col-6">
                <label htmlFor="fiscal-default-aliquot-cofins-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Alíquota COFINS Padrão (%) *</label>
                <input
                  id="fiscal-default-aliquot-cofins-input"
                  type="number"
                  step="any"
                  required
                  placeholder="0"
                  value={fiscalSettings.default_aliquot_cofins ?? ''}
                  onChange={(e) => setFiscalSettings({ ...fiscalSettings, default_aliquot_cofins: Number.parseFloat(e.target.value) || 0 })}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-3" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <h4 className="text-sm font-semibold text-blue-400 mb-3" style={{ color: 'var(--accent-blue)', marginBottom: '12px' }}>Certificado Digital (Modelo A1 .pfx)</h4>

            <div className="form-row">
              <div className="form-group col-6">
                <label htmlFor="fiscal-cert-file-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Arquivo do Certificado (.pfx)</label>
                <input
                  id="fiscal-cert-file-input"
                  type="file"
                  accept=".pfx"
                  onChange={handleCertUpload}
                  className="input-field"
                  style={{ padding: '8px 12px' }}
                />
                {fiscalSettings.has_certificate ? (
                  <p className="text-xs mt-1" style={{ color: 'var(--success)' }}>✔ Certificado digital já cadastrado no sistema.</p>
                ) : (
                  <p className="text-xs mt-1" style={{ color: 'var(--warning)' }}>⚠ Sem certificado. O sistema funcionará em **MODO SIMULADOR**.</p>
                )}
              </div>
              <div className="form-group col-6">
                <label htmlFor="fiscal-cert-password-input" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Senha do Certificado</label>
                <input
                  id="fiscal-cert-password-input"
                  type="password"
                  placeholder="••••••••"
                  value={certPassword}
                  onChange={(e) => setCertPassword(e.target.value)}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          <div className="form-actions mt-4" style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <button
              type="submit"
              disabled={fiscalLoading}
              className="btn btn-primary px-5 py-2 font-bold"
            >
              {fiscalLoading ? 'Salvando...' : 'Salvar Configurações Fiscais'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
