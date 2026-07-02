import { useEffect, useState } from 'react';
import { api, type Category, type Subcategory } from '../services/api';
import { toast } from '../services/toast';
import { confirmService } from '../services/confirm';
import { Plus, Trash2 } from 'lucide-react';

/**
 * Componente da Estrutura Mercadológica (Categorias e Subcategorias)
 * Permite cadastrar e excluir categorias principais e suas respectivas subcategorias.
 */
export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);

  // Estados dos formulários de cadastro
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSubcategoryCatId, setNewSubcategoryCatId] = useState('');
  const [newSubcategoryName, setNewSubcategoryName] = useState('');

  // Obtém o usuário atualmente logado para auditoria
  const [currentUser] = useState(() => {
    const local = localStorage.getItem('superpos_current_user');
    return local ? JSON.parse(local) : { username: 'Gerente', role: 'manager' };
  });

  // Busca categorias e subcategorias do servidor
  const fetchCategoriesAndSubcategories = async () => {
    try {
      const cats = await api.getCategories();
      setCategories(cats);
      const subcats = await api.getSubcategories();
      setSubcategories(subcats);
    } catch (e: any) {
      console.warn("Erro ao buscar dados mercadológicos:", e);
    }
  };

  useEffect(() => {
    fetchCategoriesAndSubcategories();
  }, []);

  // Cadastra uma nova categoria principal
  const handleCreateCategory = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    try {
      await api.createCategory(newCategoryName.trim(), currentUser.username);
      toast.success('Categoria cadastrada com sucesso!');
      setNewCategoryName('');
      fetchCategoriesAndSubcategories();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cadastrar categoria.');
    }
  };

  // Exclui uma categoria (se não contiver nenhum produto vinculado)
  const handleDeleteCategory = async (id: number) => {
    const confirm = await confirmService.show({
      title: 'Excluir Categoria',
      message: 'Excluir esta categoria? Isso só funcionará se não houver produtos nela.',
      type: 'warning'
    });
    if (!confirm) return;
    try {
      const res = await api.deleteCategory(id, currentUser.username);
      if (res.success) {
        toast.success('Categoria excluída.');
        fetchCategoriesAndSubcategories();
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir categoria.');
    }
  };

  // Cadastra uma nova subcategoria vinculada a uma categoria pai
  const handleCreateSubcategory = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!newSubcategoryName.trim() || !newSubcategoryCatId) {
      toast.warning('Selecione a categoria pai e insira o nome da subcategoria.');
      return;
    }
    try {
      await api.createSubcategory(Number.parseInt(newSubcategoryCatId), newSubcategoryName.trim(), currentUser.username);
      toast.success('Subcategoria cadastrada com sucesso!');
      setNewSubcategoryName('');
      fetchCategoriesAndSubcategories();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao cadastrar subcategoria.');
    }
  };

  // Exclui uma subcategoria
  const handleDeleteSubcategory = async (id: number) => {
    const confirm = await confirmService.show({
      title: 'Excluir Subcategoria',
      message: 'Excluir esta subcategoria?',
      type: 'warning'
    });
    if (!confirm) return;
    try {
      const res = await api.deleteSubcategory(id, currentUser.username);
      if (res.success) {
        toast.success('Subcategoria excluída.');
        fetchCategoriesAndSubcategories();
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir subcategoria.');
    }
  };

  return (
    <div className="grid-2col-equal">
      {/* Coluna 1: Categorias Principais */}
      <div className="glass-card" style={{ gap: '10px', display: 'flex', flexDirection: 'column' }}>
        <h3 className="card-title text-lg border-b border-gray-800 pb-2 mb-3">1. Categorias Principais</h3>

        <form onSubmit={handleCreateCategory} className="flex gap-2 mb-4">
          <input
            type="text"
            required
            placeholder="Nova Categoria (Ex: Açougue)"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            className="input-field"
          />
          <button type="submit" className="btn btn-primary whitespace-nowrap">
            <Plus size={16} /> Add
          </button>
        </form>

        <div className="table-responsive max-h-96 overflow-y-auto">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Nome da Categoria</th>
                <th className="text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center text-muted">Nenhuma categoria criada.</td>
                </tr>
              ) : (
                categories.map(c => (
                  <tr key={c.id} className="table-row">
                    <td>{c.id}</td>
                    <td className="font-semibold">{c.name}</td>
                    <td className="text-center">
                      <button
                        onClick={() => handleDeleteCategory(c.id)}
                        className="btn-icon btn-delete"
                        title="Deletar Categoria"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Coluna 2: Subcategorias */}
      <div className="glass-card" style={{ gap: '10px', display: 'flex', flexDirection: 'column' }}>
        <h3 className="card-title text-lg border-b border-gray-800 pb-2 mb-3">2. Subcategorias</h3>

        <form onSubmit={handleCreateSubcategory} className="flex flex-column gap-2 mb-4">
          <div className="flex gap-2">
            <select
              required
              value={newSubcategoryCatId}
              onChange={(e) => setNewSubcategoryCatId(e.target.value)}
              className="input-field select-field flex-1"
            >
              <option value="">-- Selecionar Categoria Pai --</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <input
              type="text"
              required
              placeholder="Subcategoria (Ex: Bovinos)"
              value={newSubcategoryName}
              onChange={(e) => setNewSubcategoryName(e.target.value)}
              className="input-field flex-1"
            />
            <button type="submit" className="btn btn-primary whitespace-nowrap">
              <Plus size={16} /> Add
            </button>
          </div>
        </form>

        <div className="table-responsive max-h-96 overflow-y-auto">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Categoria Pai</th>
                <th>Nome Subcategoria</th>
                <th className="text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {subcategories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-muted">Nenhuma subcategoria cadastrada.</td>
                </tr>
              ) : (
                subcategories.map(s => {
                  const parent = categories.find(c => c.id === s.category_id);
                  return (
                    <tr key={s.id} className="table-row">
                      <td>{s.id}</td>
                      <td className="text-blue-400 text-sm">{parent ? parent.name : `Categoria ID: ${s.category_id}`}</td>
                      <td className="font-semibold">{s.name}</td>
                      <td className="text-center">
                        <button
                          onClick={() => handleDeleteSubcategory(s.id)}
                          className="btn-icon btn-delete"
                          title="Deletar Subcategoria"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
