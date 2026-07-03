import { useState } from 'react';
import { toast } from '../services/toast';
import { Printer } from 'lucide-react';

/**
 * Componente de Configurações de Impressão
 * Permite definir os parâmetros de largura, cópias e cabeçalho para bobina térmica.
 */
export default function PrinterSettings() {
  // Carrega as configurações guardadas no localStorage ou assume valores padrão
  const [printerCopies, setPrinterCopies] = useState<number>(() => {
    return Number.parseInt(localStorage.getItem('superpos_printer_copies') || '1', 10);
  });
  const [printerWidth, setPrinterWidth] = useState<string>(() => {
    return localStorage.getItem('superpos_printer_width') || '80mm';
  });
  const [receiptTitle, setReceiptTitle] = useState<string>(() => {
    return localStorage.getItem('superpos_receipt_title') || 'RECIBO DE VENDA';
  });
  const [showQrCodeOnReceipt, setShowQrCodeOnReceipt] = useState<boolean>(() => {
    const val = localStorage.getItem('superpos_show_qrcode');
    return val === null ? true : val === 'true';
  });

  // Salva as configurações editadas no localStorage para o PDV utilizar localmente
  const handleSavePrinterSettings = (e: React.SyntheticEvent) => {
    e.preventDefault();
    localStorage.setItem('superpos_printer_copies', printerCopies.toString());
    localStorage.setItem('superpos_printer_width', printerWidth);
    localStorage.setItem('superpos_receipt_title', receiptTitle);
    localStorage.setItem('superpos_show_qrcode', showQrCodeOnReceipt.toString());
    toast.success("Configurações de impressora salvas com sucesso!");
  };

  return (
    <div className="printer-settings-tab animate-fade-in">
      <div className="glass-card">
        <h3 className="panel-title border-b pb-2 mb-4" style={{ fontSize: '1.2rem', borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Printer className="text-primary" size={20} />
          Configurações de Impressão (Bobina / Impressora Térmica)
        </h3>

        <form onSubmit={handleSavePrinterSettings} className="modal-form" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="form-row">
            <div className="form-group col-3">
              <label htmlFor="printer-copies" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Número de Cópias *</label>
              <input
                id="printer-copies"
                type="number"
                min="1"
                max="10"
                required
                value={printerCopies}
                onChange={(e) => setPrinterCopies(Number.parseInt(e.target.value, 10) || 1)}
                className="input-field"
              />
            </div>
            <div className="form-group col-3">
              <label htmlFor="printer-width" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Largura da Bobina *</label>
              <select
                id="printer-width"
                value={printerWidth}
                onChange={(e) => setPrinterWidth(e.target.value)}
                className="input-field select-field"
              >
                <option value="80mm">80 mm (Padrão)</option>
                <option value="58mm">58 mm (Estreito)</option>
              </select>
            </div>
            <div className="form-group col-3">
              <label htmlFor="receipt-title" className="font-bold text-xs text-muted mb-1" style={{ display: 'block', fontSize: '11px', opacity: 0.8 }}>Título Cupom Não-Fiscal</label>
              <input
                id="receipt-title"
                type="text"
                placeholder="Ex: RECIBO DE VENDA"
                value={receiptTitle}
                onChange={(e) => setReceiptTitle(e.target.value)}
                className="input-field"
              />
            </div>
            <div className="form-group col-3" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', paddingTop: '20px' }}>
              <label className="flex items-center gap-2 cursor-pointer select-none" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={showQrCodeOnReceipt}
                  onChange={(e) => setShowQrCodeOnReceipt(e.target.checked)}
                  className="w-4 h-4 accent-primary"
                  style={{ cursor: 'pointer' }}
                />
                <span className="text-xs font-bold text-white">Imprimir QR Code</span>
              </label>
            </div>
          </div>

          <div className="form-actions mt-4" style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <button
              type="submit"
              className="btn btn-primary px-5 py-2 font-bold"
            >
              Salvar Configurações de Impressão
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
