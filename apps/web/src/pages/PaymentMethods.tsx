import { useState } from 'react';
import { toast } from '../services/toast';
import { CreditCard, QrCode } from 'lucide-react';

/**
 * Componente de Configuração de Formas de Pagamento
 * Permite adicionar, remover, aplicar taxas e salvar as credenciais do PIX para o PDV.
 */
export default function PaymentMethods() {
  // Lista de formas de pagamento salvas localmente no localStorage
  const [paymentMethods, setPaymentMethods] = useState<Array<{
    id: string;
    name: string;
    enabled: boolean;
    type: 'dinheiro' | 'pix' | 'cartao' | 'fiado';
    fee_percentage?: number;
  }>>(() => {
    const saved = localStorage.getItem('superpos_payment_methods');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.error('Erro ao carregar formas de pagamento do localStorage:', error);
      }
    }
    // Valores padrão do sistema
    return [
      { id: 'dinheiro', name: 'Dinheiro', enabled: true, type: 'dinheiro', fee_percentage: 0 },
      { id: 'pix', name: 'PIX', enabled: true, type: 'pix', fee_percentage: 0 },
      { id: 'cartao', name: 'Cartão', enabled: true, type: 'cartao', fee_percentage: 0 },
      { id: 'fiado', name: 'Fiado', enabled: true, type: 'fiado', fee_percentage: 0 }
    ];
  });

  // Credenciais para a geração do QR Code PIX local no terminal
  const [pixKey, setPixKey] = useState(() => localStorage.getItem('superpos_pix_key') || '');
  const [pixName, setPixName] = useState(() => localStorage.getItem('superpos_pix_name') || '');
  const [pixCity, setPixCity] = useState(() => localStorage.getItem('superpos_pix_city') || '');

  // Salva tudo no localStorage e dispara o evento 'storage' para que o PDV atualize as formas dinamicamente
  const handleSavePaymentMethods = (e: React.SubmitEvent) => {
    e.preventDefault();
    localStorage.setItem('superpos_payment_methods', JSON.stringify(paymentMethods));
    localStorage.setItem('superpos_pix_key', pixKey);
    localStorage.setItem('superpos_pix_name', pixName);
    localStorage.setItem('superpos_pix_city', pixCity);
    globalThis.dispatchEvent(new Event('storage'));
    toast.success("Formas de pagamento e chave PIX salvas com sucesso!");
  };

  return (
    <div className="payment-settings-tab animate-fade-in">
      <div className="glass-card">
        <h3 className="panel-title border-b pb-2 mb-4" style={{ fontSize: '1.2rem', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CreditCard className="text-primary" size={20} />
          Configuração de Formas de Pagamento (PDV)
        </h3>

        <form onSubmit={handleSavePaymentMethods} className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {paymentMethods.map((method, index) => (
              <div key={method.id} className="flex items-center gap-4 p-3 rounded bg-white/5 border border-gray-800" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px' }}>
                <div style={{ flex: 1, minWidth: '150px', gap:'20px' }}>
                  <label htmlFor={`name-${method.id}`} className="font-bold text-xs text-muted mb-1 block">Nome da Forma</label>
                  <input
                    id={`name-${method.id}`}
                    type="text"
                    value={method.name}
                    onChange={(e) => {
                      const updated = [...paymentMethods];
                      updated[index].name = e.target.value;
                      setPaymentMethods(updated);
                    }}
                    className="input-field font-bold"
                    placeholder="Ex: Dinheiro"
                  />
                </div>

                <div style={{ width: '180px'}}>
                  <label htmlFor={`type-${method.id}`} className="font-bold text-xs text-muted mb-1 block">Categoria Financeira</label>
                  <select
                    id={`type-${method.id}`}
                    value={method.type}
                    onChange={(e) => {
                      const updated = [...paymentMethods];
                      updated[index].type = e.target.value as any;
                      setPaymentMethods(updated);
                    }}
                    className="input-field select-field"
                    disabled={['dinheiro', 'pix', 'cartao', 'fiado'].includes(method.id)}
                  >
                    <option value="dinheiro">Dinheiro</option>
                    <option value="pix">PIX</option>
                    <option value="cartao">Cartão / Outros</option>
                    <option value="fiado">Fiado</option>
                  </select>
                </div>

                <div style={{ width: '100px' }}>
                  <label htmlFor={`fee-${method.id}`} className="font-bold text-xs text-muted mb-1 block">Taxa (%)</label>
                  <input
                    id={`fee-${method.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={method.fee_percentage ?? 0}
                    onChange={(e) => {
                      const updated = [...paymentMethods];
                      updated[index].fee_percentage = Number.parseFloat(e.target.value) || 0;
                      setPaymentMethods(updated);
                    }}
                    className="input-field font-mono"
                    placeholder="0.00"
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingTop: '20px' }}>
                  <label className="flex items-center gap-2 cursor-pointer select-none" style={{ display: 'flex', gap: '8px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={method.enabled}
                      onChange={(e) => {
                        const updated = [...paymentMethods];
                        updated[index].enabled = e.target.checked;
                        setPaymentMethods(updated);
                      }}
                      className="w-4 h-4 accent-primary"
                    />
                    <span className="text-xs font-bold text-white">Ativa</span>
                  </label>
                </div>

                {['dinheiro', 'pix', 'cartao', 'fiado'].includes(method.id) === false && (
                  <div style={{ paddingTop: '20px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMethods(paymentMethods.filter(m => m.id !== method.id));
                      }}
                      className="btn btn-danger py-1 px-3 text-xs"
                      style={{ padding: '6px 12px' }}
                    >
                      Excluir
                    </button>
                  </div>
                )}
              </div>
            ))}

            <div>
              <button
                type="button"
                onClick={() => {
                  const newId = `custom_${Date.now()}`;
                  setPaymentMethods([
                    ...paymentMethods,
                    { id: newId, name: 'Nova Forma', enabled: true, type: 'cartao' }
                  ]);
                }}
                className="btn btn-secondary py-1.5 px-4 text-xs font-bold"
              >
                + Adicionar Forma de Pagamento Customizada
              </button>
            </div>

            {/* Configuração da Chave PIX */}
            <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <h4 className="font-semibold text-sm mb-3 text-primary flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCode size={18} />
                Dados do PIX (Gerador de QR Code no PDV)
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div>
                  <label htmlFor="pixKey" className="font-bold text-xs text-muted mb-1 block">Chave PIX</label>
                  <input
                    id="pixKey"
                    type="text"
                    value={pixKey}
                    onChange={(e) => setPixKey(e.target.value)}
                    className="input-field font-bold font-mono"
                    placeholder="CPF, CNPJ, E-mail, Celular ou Chave Aleatória"
                  />
                </div>
                <div>
                  <label htmlFor="pixName" className="font-bold text-xs text-muted mb-1 block">Nome do Beneficiário</label>
                  <input
                    id="pixName"
                    type="text"
                    value={pixName}
                    onChange={(e) => setPixName(e.target.value)}
                    className="input-field font-bold"
                    placeholder="Nome Fantasia / Razão Social"
                  />
                </div>
                <div>
                  <label htmlFor="pixCity" className="font-bold text-xs text-muted mb-1 block">Cidade do Beneficiário</label>
                  <input
                    id="pixCity"
                    type="text"
                    value={pixCity}
                    onChange={(e) => setPixCity(e.target.value)}
                    className="input-field font-bold"
                    placeholder="Ex: Sao Paulo"
                  />
                </div>
              </div>
              <p className="text-muted text-xs mt-2">
                * Preencha estes dados para habilitar a geração automática e segura do QR Code PIX (BR Code estático/dinâmico com valor exato) na tela de finalização de vendas do PDV.
              </p>
            </div>
          </div>

          <div className="form-actions mt-4" style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <button
              type="submit"
              className="btn btn-primary px-5 py-2 font-bold"
            >
              Salvar Formas de Pagamento
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
