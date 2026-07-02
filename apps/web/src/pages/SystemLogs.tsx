import { useEffect, useState } from 'react';
import { api, type SystemLog } from '../services/api';

/**
 * Componente dos Logs Globais do Sistema
 * Exibe o relatório de auditoria detalhado das ações administrativas no sistema.
 */
export default function SystemLogs() {
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);

  // Busca todos os logs de auditoria do banco
  const fetchLogs = async () => {
    try {
      const logs = await api.getSystemLogs();
      setSystemLogs(logs);
    } catch (e: any) {
      console.warn("Erro ao carregar logs de auditoria:", e);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="glass-card p-0 overflow-hidden">
      <div className="p-3 border-b border-gray-800 bg-gray-900/20 flex-between" style={{ padding: '10px' }}>
        <div>
          <h3 className="card-title text-base font-bold">Logs Globais do Sistema</h3>
          <p className="text-xs text-muted">Registro auditável de todas as ações de operadores e administradores no terminal ou retaguarda.</p>
        </div>
        <button onClick={fetchLogs} className="btn btn-secondary py-1 px-3 text-xs">
          Atualizar
        </button>
      </div>

      <div className="table-responsive" style={{ maxHeight: '550px', overflowY: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Data/Hora</th>
              <th>Operação</th>
              <th>Operador</th>
              <th>Detalhes da Operação</th>
            </tr>
          </thead>
          <tbody>
            {systemLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-4 text-muted">Nenhum log de auditoria encontrado.</td>
              </tr>
            ) : (
              systemLogs.map(log => {
                let logTypeClass = 'badge bg-gray-800 text-gray-300';
                if (log.action_type.includes('CREATE')) logTypeClass = 'badge success';
                else if (log.action_type.includes('DELETE')) logTypeClass = 'badge danger';
                else if (log.action_type.includes('CLOSE')) logTypeClass = 'badge warning';
                else if (log.action_type.includes('PAY') || log.action_type.includes('COMPLETE')) logTypeClass = 'badge info';

                return (
                  <tr key={log.id} className="table-row">
                    <td style={{ width: '170px' }} className="text-xs">{new Date(log.timestamp).toLocaleString('pt-BR')}</td>
                    <td style={{ width: '160px' }}>
                      <span className={logTypeClass}>{log.action_type}</span>
                    </td>
                    <td style={{ width: '120px' }} className="font-bold text-xs text-blue-400">{log.operator_name}</td>
                    <td className="text-monospace text-xs text-muted max-w-md truncate" title={log.details || ''}>
                      {log.details || '-'}
                    </td>
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
