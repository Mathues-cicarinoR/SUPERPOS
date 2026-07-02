import { useEffect, useState } from 'react';
import { api, type InventoryAdjustment } from '../services/api';

/**
 * Componente do Histórico de Ajustes Manuais de Estoque
 * Exibe o relatório auditável de todas as alterações manuais feitas no estoque dos produtos.
 */
export default function StockAdjustments() {
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);

  // Busca o histórico de ajustes ao carregar a tela
  const fetchAdjustmentsHistory = async () => {
    try {
      const list = await api.getInventoryAdjustments();
      setAdjustments(list);
    } catch (e: any) {
      console.warn("Erro ao buscar histórico de ajustes:", e);
    }
  };

  useEffect(() => {
    fetchAdjustmentsHistory();
  }, []);

  return (
    <div className="glass-card p-0 overflow-hidden">
      <div className="p-3 border-b border-gray-800 bg-gray-900/20" style={{ padding: '10px' }}>
        <h3 className="card-title text-base font-bold">Rastreamento de Ajustes Manuais</h3>
        <p className="text-xs text-muted">Ações de contagem manual, correções de avaria ou perdas operadas pela gerência.</p>
      </div>

      <div className="table-responsive">
        <table className="table" style={{ minWidth: '1100px' }}>
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Produto</th>
              <th>Cód. Barras</th>
              <th className="text-center">Estoque Antigo</th>
              <th className="text-center">Novo Estoque</th>
              <th className="text-center">Diferença</th>
              <th>Motivo/Justificativa</th>
              <th>Operador</th>
            </tr>
          </thead>
          <tbody>
            {adjustments.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-4 text-muted">Nenhum ajuste registrado.</td>
              </tr>
            ) : (
              adjustments.map(a => {
                const diff = a.new_stock - a.previous_stock;
                const diffText = diff > 0 ? `+${diff}` : `${diff}`;
                const diffClass = diff > 0 ? 'text-success font-bold' : diff < 0 ? 'text-danger font-bold' : 'text-muted';
                return (
                  <tr key={a.id} className="table-row">
                    <td>{new Date(a.created_at).toLocaleString('pt-BR')}</td>
                    <td className="font-semibold">{a.product_name}</td>
                    <td className="text-monospace text-xs">{a.barcode}</td>
                    <td className="text-center text-muted">{a.previous_stock}</td>
                    <td className="text-center font-semibold">{a.new_stock}</td>
                    <td className={`text-center ${diffClass}`}>{diffText}</td>
                    <td>{a.reason}</td>
                    <td className="font-bold text-xs text-blue-400">{a.operator_name}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
