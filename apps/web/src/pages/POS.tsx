import { useEffect, useState, useRef } from 'react';
import { api, connectionService } from '../services/api';
import type { Product, Customer, Sale, CashSession } from '../services/api';
import { toast } from '../services/toast';
import { Search, ShoppingCart, User, Plus, Minus, Trash2, CheckCircle, Wifi, WifiOff, LogOut, ShieldAlert, KeyRound, HelpCircle, AlertTriangle, QrCode } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { generatePixPayload } from '../utils/pix';

interface CartItem {
  product: Product;
  quantity: number;
  price_unit: number;
  price_total: number;
}

interface POSProps {
  currentUser: { username: string; role: string };
  activeSession: CashSession;
  onLogout: () => void;
  onCloseCashSession: (finalCash: number, finalCard: number, managerPassword?: string) => Promise<void>;
}

type PaymentMethodType = 'dinheiro' | 'pix' | 'cartao' | 'fiado';

function formatCurrency(val: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
}

function getUpdatedCart(prevCart: CartItem[], latestProducts: Product[]) {
  let changed = false;
  const updated = prevCart.map((item) => {
    const latestProd = latestProducts.find(p => p.id === item.product.id);
    if (!latestProd) return item;
    const latestPrice = latestProd.promotional_price ?? latestProd.price_sell;
    if (item.price_unit === latestPrice && item.product.active_promotion?.name === latestProd.active_promotion?.name) {
      return item;
    }
    changed = true;
    return {
      ...item,
      product: latestProd,
      price_unit: latestPrice,
      price_total: Number.parseFloat((item.quantity * latestPrice).toFixed(2))
    };
  });
  return { updated, changed };
}

// eslint-disable-next-line sonarjs/cognitive-complexity
/**
 * Componente Principal do Ponto de Venda (PDV / POS).
 * Gerencia o estado do carrinho, atalhos de teclado (como F5, F8, F9, F10),
 * e a integração de fechamento de caixa e emissão de notas fiscais (NFC-e).
 */
export default function POS({ currentUser, activeSession, onLogout, onCloseCashSession }: Readonly<POSProps>) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isOnline, setIsOnline] = useState(connectionService.getIsOnline());

  // NFC-e Fiscal states
  const [emitNfc, setEmitNfc] = useState(true);
  const [cpfCustomer, setCpfCustomer] = useState('');
  const [nfcReceipt, setNfcReceipt] = useState<Record<string, any> | null>(null);
  const [fiscalSettings, setFiscalSettings] = useState<any>(null);

  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [latestItem, setLatestItem] = useState<{ name: string; price: number } | null>(null);

  // Customer selection
  const [selectedCustomerId, setSelectedCustomerId] = useState<number>(1); // Default "Consumidor Final"
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Search & input states
  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('dinheiro');
  const [isSplitMode, setIsSplitMode] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState<string>('dinheiro');
  const [singleCashPaid, setSingleCashPaid] = useState('');

  // Payment configurations & splits
  const [paymentMethods, setPaymentMethods] = useState<Array<{
    id: string;
    name: string;
    enabled: boolean;
    type: PaymentMethodType;
    fee_percentage?: number;
  }>>([]);
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});
  const splitInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Cash calculations

  // Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isManagerAuthOpen, setIsManagerAuthOpen] = useState(false);
  const [isCloseCashModalOpen, setIsCloseCashModalOpen] = useState(false);

  // Manager authorization states
  const [cancelType, setCancelType] = useState<'item' | 'sale' | null>(null);
  const [cancelItemIndex, setCancelItemIndex] = useState('');
  const [managerPassword, setManagerPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Close shift state
  const [finalCashReported, setFinalCashReported] = useState('');
  const [finalCardReported, setFinalCardReported] = useState('');
  const [closeCashManagerPassword, setCloseCashManagerPassword] = useState('');
  const [closeLoading, setCloseLoading] = useState(false);

  // Multiplier state
  const [multiplier, setMultiplier] = useState(1);
  const [isMultiplierModalOpen, setIsMultiplierModalOpen] = useState(false);
  const [multiplierInput, setMultiplierInput] = useState('1');

  // Manual code entry state
  const [isManualCodeModalOpen, setIsManualCodeModalOpen] = useState(false);
  const [manualCodeInput, setManualCodeInput] = useState('');

  // Price lookup state
  const [isPriceLookupOpen, setIsPriceLookupOpen] = useState(false);
  const [priceLookupQuery, setPriceLookupQuery] = useState('');
  const [priceLookupResult, setPriceLookupResult] = useState<Product | null>(null);

  // Refs for keyboard operation
  const productSearchRef = useRef<HTMLInputElement>(null);
  const discountRef = useRef<HTMLInputElement>(null);
  const customerRef = useRef<HTMLSelectElement>(null);
  const payAmountRef = useRef<HTMLInputElement>(null);
  const managerPasswordRef = useRef<HTMLInputElement>(null);
  const cancelIndexRef = useRef<HTMLInputElement>(null);
  const closeCashFloatRef = useRef<HTMLInputElement>(null);
  const priceLookupInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();

  const syncData = async () => {
    try {
      const prodRes = await api.getProducts();
      setProducts(prodRes);
    } catch (e) {
      console.warn('Failed to sync products in background:', e);
    }
  };

  useEffect(() => {
    // Subscribe to connection health changes
    const unsubscribe = connectionService.subscribe((status) => {
      setIsOnline(status);
    });

    // Load initial products and customers
    loadData();

    // Focus product search on mount
    if (productSearchRef.current) {
      productSearchRef.current.focus();
    }

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      syncData();
    };
    globalThis.addEventListener('focus', handleFocus);
    return () => globalThis.removeEventListener('focus', handleFocus);
  }, []);



  useEffect(() => {
    if (products.length === 0 || cart.length === 0) return;

    setCart((prevCart) => {
      const { updated, changed } = getUpdatedCart(prevCart, products);
      return changed ? updated : prevCart;
    });
  }, [products]);

  // Sync session calculations
  const subtotal = cart.reduce((sum, item) => sum + item.price_total, 0);
  const discountAmount = (subtotal * Number.parseFloat(discountPercent || '0')) / 100;
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const activeMethod = paymentMethods.find(m => m.id === selectedMethodId);

  let totalPaid = finalTotal;
  if (isSplitMode) {
    totalPaid = Object.entries(splitAmounts).reduce((sum, [_, val]) => sum + (Number.parseFloat(val) || 0), 0);
  } else if (activeMethod?.type === 'dinheiro') {
    totalPaid = Number.parseFloat(singleCashPaid) || finalTotal;
  }

  const remainingAmount = isSplitMode
    ? Math.max(0, finalTotal - totalPaid)
    : 0;

  let changeGiven = 0;
  if (isSplitMode) {
    if (totalPaid > finalTotal) {
      changeGiven = Math.max(0, totalPaid - finalTotal);
    }
  } else if (activeMethod?.type === 'dinheiro') {
    const singlePaidVal = Number.parseFloat(singleCashPaid) || 0;
    if (singlePaidVal > finalTotal) {
      changeGiven = singlePaidVal - finalTotal;
    }
  }

  // Load active payment methods and initialize splits when checkout opens
  useEffect(() => {
    if (isPaymentModalOpen) {
      const saved = localStorage.getItem('superpos_payment_methods');
      let methods: any[] = [];
      if (saved) {
        try {
          methods = JSON.parse(saved).filter((m: any) => m.enabled);
        } catch (e) {
          console.warn('Falha ao carregar métodos de pagamento do localStorage:', e);
        }
      }
      if (methods.length === 0) {
        methods = [
          { id: 'dinheiro', name: 'Dinheiro', enabled: true, type: 'dinheiro', fee_percentage: 0 },
          { id: 'pix', name: 'PIX', enabled: true, type: 'pix', fee_percentage: 0 },
          { id: 'cartao', name: 'Cartão', enabled: true, type: 'cartao', fee_percentage: 0 },
          { id: 'fiado', name: 'Fiado', enabled: true, type: 'fiado', fee_percentage: 0 }
        ];
      }
      setPaymentMethods(methods);

      setIsSplitMode(false);
      const firstActive = methods[0];
      if (firstActive) {
        setSelectedMethodId(firstActive.id);
        setPaymentMethod(firstActive.type);
      }
      setSingleCashPaid('');

      // By default, place the full amount on the first payment method, rest is empty
      const initialAmounts: Record<string, string> = {};
      methods.forEach((m, index) => {
        initialAmounts[m.id] = index === 0 ? finalTotal.toFixed(2) : '';
      });
      setSplitAmounts(initialAmounts);

      // Focus the amount input if cash is active
      setTimeout(() => {
        if (firstActive?.type === 'dinheiro') {
          payAmountRef.current?.focus();
          payAmountRef.current?.select();
        }
      }, 150);
    }
  }, [isPaymentModalOpen, finalTotal]);

  const toggleSplitMode = () => {
    if (isSplitMode) {
      setIsSplitMode(false);
      setSplitAmounts({});
      const activeM = paymentMethods.find(m => m.id === selectedMethodId);
      if (activeM?.type === 'dinheiro') {
        setTimeout(() => {
          payAmountRef.current?.focus();
          payAmountRef.current?.select();
        }, 50);
      }
    } else {
      setIsSplitMode(true);
      const newSplits: Record<string, string> = {};
      paymentMethods.forEach((m) => {
        newSplits[m.id] = '';
      });
      setSplitAmounts(newSplits);
      setTimeout(() => {
        const firstActiveId = paymentMethods[0]?.id;
        if (firstActiveId) {
          splitInputRefs.current[firstActiveId]?.focus();
          splitInputRefs.current[firstActiveId]?.select();
        }
      }, 50);
    }
  };

  // Accidental exit warning (beforeunload)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      (e as any).returnValue = ''; // Trigger browser confirmation dialog
    };
    globalThis.addEventListener('beforeunload', handleBeforeUnload);
    return () => globalThis.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Keyboard Event Listener for F1-F10 Hotkeys
  const handleNavigationBlock = (e: KeyboardEvent): boolean => {
    if (
      e.key === 'F5' ||
      (e.ctrlKey && (e.key === 'r' || e.key === 'R')) ||
      (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))
    ) {
      e.preventDefault();
      if (e.key === 'F5') {
        return false; // Permite que F5 execute handleFunctionKeys para abrir a consulta de preço
      }
      toast.warning('Recarregamento de página bloqueado no PDV!');
      return true;
    }
    return false;
  };

  const handleF2Key = (e: KeyboardEvent) => {
    e.preventDefault();
    if (cart.length > 0) {
      setIsPaymentModalOpen(true);
      setTimeout(() => {
        if (paymentMethod === 'dinheiro') payAmountRef.current?.focus();
      }, 100);
    } else {
      toast.warning('O carrinho está vazio.');
    }
  };

  const handleF9Key = (e: KeyboardEvent) => {
    e.preventDefault();
    if (cart.length > 0) {
      setCancelType('item');
      setIsManagerAuthOpen(true);
      setTimeout(() => cancelIndexRef.current?.focus(), 150);
    } else {
      toast.warning('Nenhum item para cancelar.');
    }
  };

  const handleF10Key = (e: KeyboardEvent) => {
    e.preventDefault();
    if (cart.length > 0) {
      setCancelType('sale');
      setIsManagerAuthOpen(true);
      setTimeout(() => managerPasswordRef.current?.focus(), 150);
    } else {
      toast.warning('Carrinho vazio.');
    }
  };

  const handleFunctionKeys = (e: KeyboardEvent) => {
    if (e.key === 'F1') {
      e.preventDefault();
      setIsPaymentModalOpen(false);
      setIsManagerAuthOpen(false);
      setIsCloseCashModalOpen(false);
      setIsPriceLookupOpen(false);
      productSearchRef.current?.focus();
      toast.info('Buscador focado.');
    } else if (e.key === 'F2') {
      handleF2Key(e);
    } else if (e.key === 'F3') {
      e.preventDefault();
      discountRef.current?.focus();
      toast.info('Desconto focado.');
    } else if (e.key === 'F4') {
      e.preventDefault();
      customerRef.current?.focus();
      toast.info('Seleção de cliente focada.');
    } else if (e.key === 'F5') {
      e.preventDefault();
      setIsPaymentModalOpen(false);
      setIsManagerAuthOpen(false);
      setIsCloseCashModalOpen(false);
      setIsMultiplierModalOpen(false);
      setIsManualCodeModalOpen(false);
      setIsPriceLookupOpen(true);
      setPriceLookupQuery('');
      setPriceLookupResult(null);
      setTimeout(() => { priceLookupInputRef.current?.focus(); }, 150);
      toast.info('Consulta de preço aberta.');
    } else if (e.key === 'F6') {
      e.preventDefault();
      setIsManualCodeModalOpen(true);
      setTimeout(() => {
        const input = document.getElementById('manual-code-input-field') as HTMLInputElement;
        input?.focus();
        input?.select();
      }, 150);
    } else if (e.key === 'F7') {
      e.preventDefault();
      setIsMultiplierModalOpen(true);
      setTimeout(() => {
        const input = document.getElementById('multiplier-input-field') as HTMLInputElement;
        input?.focus();
        input?.select();
      }, 150);
    } else if (e.key === 'F8') {
      e.preventDefault();
      setIsCloseCashModalOpen(true);
      setTimeout(() => closeCashFloatRef.current?.focus(), 150);
    } else if (e.key === 'F9') {
      handleF9Key(e);
    } else if (e.key === 'F10') {
      handleF10Key(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsPaymentModalOpen(false);
      setIsManagerAuthOpen(false);
      setIsCloseCashModalOpen(false);
      setIsMultiplierModalOpen(false);
      setIsManualCodeModalOpen(false);
      setIsPriceLookupOpen(false);
      setCancelType(null);
      setManagerPassword('');
      setCancelItemIndex('');
      productSearchRef.current?.focus();
    }
  };

  /**
   * Auxiliar para navegar pelos campos de valores do pagamento parcelado/dividido (Split Mode)
   * utilizando as setas do teclado (ArrowUp / ArrowDown).
   */
  const handlePaymentArrowSplitMode = (enabledMethods: any[], dir: number) => {
    const activeId = Object.keys(splitInputRefs.current).find(
      (id) => splitInputRefs.current[id] === document.activeElement
    );
    if (!activeId) return;
    const idx = enabledMethods.findIndex((m) => m.id === activeId);
    if (idx === -1) return;
    const nextId = enabledMethods[(idx + dir + enabledMethods.length) % enabledMethods.length]?.id;
    if (nextId) {
      splitInputRefs.current[nextId]?.focus();
      splitInputRefs.current[nextId]?.select();
    }
  };

  const handlePaymentArrowSingleMode = (enabledMethods: any[], dir: number) => {
    const idx = enabledMethods.findIndex((m) => m.id === selectedMethodId);
    if (idx === -1) return;
    const nextMethod = enabledMethods[(idx + dir + enabledMethods.length) % enabledMethods.length];
    if (nextMethod) {
      setSelectedMethodId(nextMethod.id);
      setPaymentMethod(nextMethod.type);
      if (nextMethod.type === 'dinheiro') {
        setTimeout(() => {
          payAmountRef.current?.focus();
          payAmountRef.current?.select();
        }, 50);
      }
    }
  };

  const handlePaymentArrowKey = (e: KeyboardEvent) => {
    const enabledMethods = paymentMethods.filter(
      (m) => !(m.type === 'fiado' && selectedCustomerId === 1)
    );
    const dir = e.key === 'ArrowDown' ? 1 : -1;
    if (isSplitMode) {
      handlePaymentArrowSplitMode(enabledMethods, dir);
    } else {
      handlePaymentArrowSingleMode(enabledMethods, dir);
    }
  };

  const handlePaymentNumericKey = (e: KeyboardEvent) => {
    const num = Number.parseInt(e.key, 10) - 1;
    const enabledMethods = paymentMethods.filter(
      (m) => !(m.type === 'fiado' && selectedCustomerId === 1)
    );
    if (num < 0 || num >= enabledMethods.length) return;
    if (isSplitMode) {
      const methodId = enabledMethods[num].id;
      splitInputRefs.current[methodId]?.focus();
      splitInputRefs.current[methodId]?.select();
    } else {
      const nextMethod = enabledMethods[num];
      setSelectedMethodId(nextMethod.id);
      setPaymentMethod(nextMethod.type);
      if (nextMethod.type === 'dinheiro') {
        setTimeout(() => {
          payAmountRef.current?.focus();
          payAmountRef.current?.select();
        }, 50);
      }
    }
  };

  const handlePaymentModalKeys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleFinishSale();
    } else if ((e.key === 'c' || e.key === 'C') && document.activeElement?.id !== 'cpf-input-field') {
      e.preventDefault();
      toggleSplitMode();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      handlePaymentArrowKey(e);
    } else if (
      (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4') &&
      document.activeElement?.tagName !== 'INPUT'
    ) {
      e.preventDefault();
      handlePaymentNumericKey(e);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (handleNavigationBlock(e)) return;
    handleFunctionKeys(e);
    if (isPaymentModalOpen) handlePaymentModalKeys(e);
  };

  // Keyboard Event Listener for F1-F10 Hotkeys
  useEffect(() => {
    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [cart, isPaymentModalOpen, paymentMethod, selectedCustomerId, handleFinishSale, paymentMethods, splitAmounts, isSplitMode, selectedMethodId, singleCashPaid]);

  const loadData = async () => {
    try {
      const prodRes = await api.getProducts();
      setProducts(prodRes);

      const custRes = await api.getCustomers();
      setCustomers(custRes);

      const defaultCust = custRes.find(c => c.id === 1);
      if (defaultCust) setSelectedCustomer(defaultCust);

      try {
        const settings = await api.getFiscalSettings();
        setFiscalSettings(settings);
      } catch (settingsErr) {
        console.warn("Módulo fiscal não configurado ou offline:", settingsErr);
      }
    } catch (e: any) {
      toast.error('Erro ao inicializar dados do PDV: ' + e.message);
    }
  };

  // Update selected customer details when selected ID changes
  useEffect(() => {
    const cust = customers.find(c => c.id === selectedCustomerId);
    if (cust) {
      setSelectedCustomer(cust);
    }
  }, [selectedCustomerId, customers]);

  // Handles quick barcode entry or search filtering
  const handleProductSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.trim();
    setSearchProductQuery(val);

    // If barcode, code or alternative barcode matches exactly, add it immediately
    const foundProduct = products.find(p =>
      p.barcode === val ||
      p.code?.toLowerCase() === val.toLowerCase() ||
      p.barcodes?.includes(val)
    );
    if (foundProduct) {
      addToCart(foundProduct);
      setSearchProductQuery(''); // Reset search
      toast.success(`${foundProduct.name} adicionado!`);
    }
  };

  const handleProductSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '*') {
      const val = searchProductQuery.trim();
      const num = Number.parseFloat(val);
      if (!Number.isNaN(num) && num > 0) {
        e.preventDefault();
        setMultiplier(num);
        setMultiplierInput(num.toString());
        setSearchProductQuery('');
        toast.info(`Próximo item será multiplicado por ${num}`);
      } else {
        e.preventDefault();
        setIsMultiplierModalOpen(true);
        setTimeout(() => {
          const input = document.getElementById('multiplier-input-field') as HTMLInputElement;
          input?.focus();
          input?.select();
        }, 150);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const val = searchProductQuery.trim();
      if (!val) return;

      // Find exact match by barcode, code, or secondary barcode
      const foundProduct = products.find(p =>
        p.barcode === val ||
        p.code?.toLowerCase() === val.toLowerCase() ||
        p.barcodes?.includes(val)
      );

      if (foundProduct) {
        addToCart(foundProduct);
        setSearchProductQuery('');
        toast.success(`${foundProduct.name} adicionado!`);
      } else if (filteredProductsList.length > 0) {
        // Fallback to first filtered list item
        addToCart(filteredProductsList[0]);
        setSearchProductQuery('');
        toast.success(`${filteredProductsList[0].name} adicionado!`);
      } else {
        toast.error('Produto não encontrado.');
      }
    }
  };

  const handleSelectPaymentMethod = (id: string, type: PaymentMethodType) => {
    setSelectedMethodId(id);
    setPaymentMethod(type);
    if (type === 'dinheiro') {
      setTimeout(() => {
        payAmountRef.current?.focus();
        payAmountRef.current?.select();
      }, 50);
    }
  };

  const handleManualCodeSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const val = manualCodeInput.trim();
    if (!val) return;

    const foundProduct = products.find(p =>
      p.barcode === val ||
      p.code?.toLowerCase() === val.toLowerCase() ||
      p.barcodes?.includes(val)
    );

    if (foundProduct) {
      addToCart(foundProduct);
      setManualCodeInput('');
      setIsManualCodeModalOpen(false);
      toast.success(`${foundProduct.name} adicionado!`);
      setTimeout(() => productSearchRef.current?.focus(), 50);
    } else {
      toast.error('Produto não encontrado.');
    }
  };

  const handlePriceLookupChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setPriceLookupQuery(val);

    const trimmed = val.trim();
    if (!trimmed) {
      setPriceLookupResult(null);
      return;
    }

    // Try exact match first
    const foundProduct = products.find(p =>
      p.barcode === trimmed ||
      p.code?.toLowerCase() === trimmed.toLowerCase() ||
      p.barcodes?.includes(trimmed)
    );

    if (foundProduct) {
      setPriceLookupResult(foundProduct);
    } else {
      // Partial search by name
      const partialProduct = products.find(p =>
        p.name.toLowerCase().includes(trimmed.toLowerCase())
      );
      setPriceLookupResult(partialProduct || null);
    }
  };

  const addToCart = (product: Product) => {
    const currentPrice = product.promotional_price ?? product.price_sell;
    setLatestItem({ name: product.name, price: currentPrice });
    const baseQty = product.unit === 'kg' ? 0.1 : 1;
    const qtyToAdd = multiplier * baseQty;

    setCart((prevCart) => {
      const existingIdx = prevCart.findIndex(item => item.product.id === product.id);

      if (existingIdx > -1) {
        // Increment quantity
        const updatedCart = [...prevCart];
        const item = updatedCart[existingIdx];
        const newQty = item.quantity + qtyToAdd;

        updatedCart[existingIdx] = {
          ...item,
          quantity: Number.parseFloat(newQty.toFixed(3)),
          price_total: Number.parseFloat((newQty * item.price_unit).toFixed(2))
        };
        return updatedCart;
      } else {
        // Add new item
        return [
          ...prevCart,
          {
            product,
            quantity: qtyToAdd,
            price_unit: currentPrice,
            price_total: Number.parseFloat((qtyToAdd * currentPrice).toFixed(2))
          }
        ];
      }
    });

    // Reset multiplier
    setMultiplier(1);
    setMultiplierInput('1');
  };

  const updateQuantity = (productId: number, val: number) => {
    if (val <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.product.id !== productId) return item;
        return {
          ...item,
          quantity: Number.parseFloat(val.toFixed(3)),
          price_total: Number.parseFloat((val * item.price_unit).toFixed(2))
        };
      })
    );
  };

  const removeFromCart = (productId: number) => {
    setCart((prevCart) => prevCart.filter(item => item.product.id !== productId));
  };

  // Manager password verification
  const handleManagerAuth = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      const res = await api.checkManagerPassword(managerPassword);
      if (res.success) {
        if (cancelType === 'sale') {
          // Clear entire cart
          setCart([]);
          setLatestItem(null);
          toast.success('Compra cancelada pelo gerente.');
        } else if (cancelType === 'item') {
          // Remove single item
          const idx = Number.parseInt(cancelItemIndex, 10) - 1;
          if (idx >= 0 && idx < cart.length) {
            const removedItem = cart[idx];
            setCart(prev => prev.filter((_, i) => i !== idx));
            toast.success(`Item ${idx + 1} (${removedItem.product.name}) cancelado.`);
          } else {
            toast.error('Posição do item inválida no carrinho.');
          }
        }
        // Reset and close
        setIsManagerAuthOpen(false);
        setCancelType(null);
        setManagerPassword('');
        setCancelItemIndex('');
        productSearchRef.current?.focus();
      }
    } catch (err: any) {
      toast.error(err.message || 'Senha do gerente incorreta.');
    } finally {
      setAuthLoading(false);
    }
  };

  /**
   * Consolida a soma dos valores informados para cada método de pagamento ativo na venda.
   * Suporta tanto o modo de pagamento único quanto o parcelamento dividido (Split Mode).
   */
  const buildSalePayments = (): Record<string, number> => {
    const salePayments: Record<string, number> = {};
    if (isSplitMode) {
      paymentMethods.forEach(m => {
        const amt = Number.parseFloat(splitAmounts[m.id]) || 0;
        if (amt > 0) {
          salePayments[m.id] = amt;
        }
      });
    } else if (activeMethod) {
      salePayments[activeMethod.id] = activeMethod.type === 'dinheiro'
        ? (Number.parseFloat(singleCashPaid) || finalTotal)
        : finalTotal;
    }
    return salePayments;
  };

  /**
   * Valida se uma venda a prazo (Fiado) cumpre com as regras do sistema:
   * 1. Requer cliente identificado (não pode ser Consumidor Final).
   * 2. O débito total final não pode ultrapassar o limite configurado para o cliente.
   */
  const checkFiadoConstraints = (salePayments: Record<string, number>): boolean => {
    const fiadoAmount = Object.entries(salePayments).filter(([id]) => {
      const m = paymentMethods.find(x => x.id === id);
      return m?.type === 'fiado';
    }).reduce((sum, [_, val]) => sum + val, 0);

    if (fiadoAmount > 0) {
      if (selectedCustomerId === 1 || !selectedCustomer) {
        toast.error('Vendas no fiado devem ser associadas a um cliente identificado.');
        return false;
      }

      const outstanding = selectedCustomer.current_debt + fiadoAmount;
      if (outstanding > selectedCustomer.debt_limit) {
        toast.error(`Limite de fiado excedido! Limite: R$ ${selectedCustomer.debt_limit.toFixed(2)}. Dívida final seria: R$ ${outstanding.toFixed(2)}.`);
        return false;
      }
    }
    return true;
  };

  /**
   * Consolida a fatura discriminada por tipo de pagamento (Dinheiro, PIX, etc.)
   * e calcula taxas aplicáveis baseadas em taxas configuradas das credenciadoras.
   */
  const buildPaymentDetailsAndFees = (salePayments: Record<string, number>, localChange: number) => {
    const details: Record<string, number> = {
      dinheiro: 0,
      pix: 0,
      cartao: 0,
      fiado: 0
    };

    Object.entries(salePayments).forEach(([id, amt]) => {
      const m = paymentMethods.find(x => x.id === id);
      if (m) {
        details[m.type] += amt;
      }
    });

    if (localChange > 0) {
      details.dinheiro = Math.max(0, details.dinheiro - localChange);
    }

    let totalFee = 0;
    Object.entries(salePayments).forEach(([id, amt]) => {
      const m = paymentMethods.find(x => x.id === id);
      if (m?.fee_percentage) {
        let netAmount = amt;
        if (m.type === 'dinheiro' && localChange > 0) {
          netAmount = Math.max(0, amt - localChange);
        }
        totalFee += netAmount * (m.fee_percentage / 100);
      }
    });

    return { details, totalFee };
  };

  /**
   * Comunica com o backend para emissão de Nota Fiscal de Consumidor Eletrônica (NFC-e).
   * Em caso de falha de conexão ou erro de transmissão, retorna o recibo formatado em modo de contingência.
   */
  const processNfceEmission = async (saleId: number, salePayload: any) => {
    let nfcResultObj = null;
    let transmittedSuccessfully = false;

    if (saleId !== -1 && emitNfc) {
      try {
        const nfcRes = await api.emitNFCe({
          sale_id: saleId,
          total_amount: salePayload.total_amount,
          discount: salePayload.discount,
          final_amount: salePayload.final_amount,
          cpf_customer: cpfCustomer || undefined,
          operator_name: currentUser.username
        });
        if (nfcRes.success) {
          nfcResultObj = {
            ...nfcRes,
            items: [...cart],
            total_amount: salePayload.total_amount,
            discount: salePayload.discount,
            final_amount: salePayload.final_amount,
            change_given: salePayload.change_given,
            payment_method: salePayload.payment_method
          };
          transmittedSuccessfully = true;
          toast.success("Cupom Fiscal NFC-e emitido com sucesso!");
        }
      } catch (nfcErr: any) {
        toast.error("Venda salva, mas falhou ao emitir NFC-e: " + nfcErr.message);
      }
    }

    if (!transmittedSuccessfully) {
      nfcResultObj = {
        success: false,
        sale_id: saleId,
        chave: null,
        protocol: null,
        qrCodeUrl: null,
        xml: null,
        items: [...cart],
        total_amount: salePayload.total_amount,
        discount: salePayload.discount,
        final_amount: salePayload.final_amount,
        change_given: salePayload.change_given,
        payment_method: salePayload.payment_method
      };
    }

    return nfcResultObj;
  };

  /**
   * Fluxo Geral de Fechamento e Finalização de Venda.
   * Valida saldos pagos, limites, consolida taxas, insere venda no banco de dados,
   * emite a NFC-e correspondente e limpa o carrinho de compras.
   */
  async function handleFinishSale() {
    if (cart.length === 0) {
      toast.warning('O carrinho está vazio.');
      return;
    }

    const salePayments = buildSalePayments();
    const totalPaidSum = Object.values(salePayments).reduce((sum, val) => sum + val, 0);

    if (totalPaidSum < finalTotal - 0.01) {
      toast.warning(`O valor total informado (${formatCurrency(totalPaidSum)}) é inferior ao total da compra (${formatCurrency(finalTotal)}).`);
      return;
    }

    if (!checkFiadoConstraints(salePayments)) {
      return;
    }

    const localChange = totalPaidSum > finalTotal ? totalPaidSum - finalTotal : 0;
    const { details, totalFee } = buildPaymentDetailsAndFees(salePayments, localChange);

    const nonZeroMethods = Object.keys(salePayments);
    let finalPaymentMethod: string = 'dinheiro';
    if (nonZeroMethods.length === 1) {
      const m = paymentMethods.find(x => x.id === nonZeroMethods[0]);
      finalPaymentMethod = m ? m.type : 'dinheiro';
    } else if (nonZeroMethods.length > 1) {
      finalPaymentMethod = 'múltiplo';
    }

    const salePayload: Omit<Sale, 'id' | 'created_at'> = {
      customer_id: selectedCustomerId === 1 ? null : selectedCustomerId,
      total_amount: Number.parseFloat(subtotal.toFixed(2)),
      discount: Number.parseFloat(discountAmount.toFixed(2)),
      final_amount: Number.parseFloat(finalTotal.toFixed(2)),
      payment_method: finalPaymentMethod,
      payment_details: details,
      amount_paid: Number.parseFloat(totalPaidSum.toFixed(2)),
      change_given: Number.parseFloat(localChange.toFixed(2)),
      fee_amount: Number.parseFloat(totalFee.toFixed(2)),
      items: cart.map(item => ({
        product_id: item.product.id,
        quantity: item.quantity,
        price_unit: item.price_unit,
        price_total: item.price_total
      }))
    };

    try {
      const result = await api.createSale(salePayload);
      const nfcResultObj = await processNfceEmission(result.sale_id, salePayload);

      if (result.sale_id === -1) {
        toast.warning('Venda registrada no modo contingência offline!');
      }

      if (nfcResultObj) {
        const copies = Number.parseInt(localStorage.getItem('superpos_printer_copies') || '1', 10);
        const printerWidthVal = localStorage.getItem('superpos_printer_width') || '80mm';
        toast.success(`Imprimindo ${copies} ${copies === 1 ? 'via' : 'vias'} do recibo (${printerWidthVal})...`);

        setCart([]);
        setLatestItem(null);
        setDiscountPercent('0');
        setSplitAmounts({});
        setPaymentMethod('dinheiro');
        setCpfCustomer('');
        setNfcReceipt(null);
        setIsPaymentModalOpen(false);
        loadData();
        setTimeout(() => {
          productSearchRef.current?.focus();
        }, 100);
      }
    } catch (e: any) {
      toast.error('Erro ao finalizar venda: ' + e.message);
    }
  };

  const handleCloseShift = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCloseLoading(true);
    try {
      if (!closeCashManagerPassword) {
        throw new Error('Senha de autorização do gerente é obrigatória.');
      }
      const authRes = await api.checkManagerPassword(closeCashManagerPassword);
      if (!authRes.success) {
        throw new Error('Senha de autorização incorreta.');
      }

      const cashReported = Number.parseFloat(finalCashReported) || 0;
      const cardReported = Number.parseFloat(finalCardReported) || 0;
      await onCloseCashSession(cashReported, cardReported, closeCashManagerPassword || undefined);
      setIsCloseCashModalOpen(false);
      setFinalCashReported('');
      setFinalCardReported('');
      setCloseCashManagerPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao fechar caixa.');
    } finally {
      setCloseLoading(false);
    }
  };

  // Filter products locally for selection list
  const filteredProductsList = searchProductQuery
    ? products.filter(p =>
      p.name.toLowerCase().includes(searchProductQuery.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(searchProductQuery.toLowerCase()) ||
      p.barcode === searchProductQuery ||
      p.code?.toLowerCase().includes(searchProductQuery.toLowerCase()) ||
      p.barcodes?.some(b => b.includes(searchProductQuery))
    ).slice(0, 5)
    : [];



  return (
    <div className="pos-fullscreen-container animate-fade-in">
      {/* Top Fullscreen Header */}
      <header className="pos-fullscreen-header">
        <div className="pos-fullscreen-header-title">
          <ShoppingCart size={24} className="text-primary" />
          <span>Mercado Central <strong style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>checkout</strong></span>
        </div>

        <div className="pos-header-operator-info">
          <div className="flex-center gap-2">
            <span className="text-muted">Operador:</span>
            <span className="pos-operator-badge">{currentUser.username}</span>
          </div>

          <div className="flex-center gap-2">
            <span className="text-muted">Abertura:</span>
            <span className="font-semibold text-monospace">
              {new Date(activeSession.opened_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>

          {currentUser.role === 'manager' && (
            <button
              onClick={() => navigate('/')}
              className="btn btn-secondary py-1 px-3 text-xs flex-center gap-1"
              title="Voltar ao Painel Administrativo"
            >
              Menu Admin
            </button>
          )}

          <button
            onClick={() => setIsCloseCashModalOpen(true)}
            className="btn btn-danger py-1 px-3 text-xs flex-center gap-1"
            title="Fechar Turno de Caixa (F8)"
          >
            Fechar Caixa (F8)
          </button>

          <button
            onClick={onLogout}
            className="btn btn-secondary py-1 px-3 text-xs flex-center gap-1"
            title="Sair do Caixa"
          >
            <LogOut size={12} />
            Sair
          </button>
        </div>

        <div className={`connection-badge ${isOnline ? 'online' : 'offline animate-pulse'}`} style={{ padding: '4px 10px', borderRadius: '6px' }}>
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </header>

      {/* POS Content Workspace */}
      <div className="pos-fullscreen-workspace">
        {/* Left Side: Retro total screen + cart list */}
        <div className="pos-fullscreen-main">
          {/* Retro digital screen */}
          <div className="retro-display">
            <div className="flex-between">
              <span className="retro-total-label">Subtotal a pagar</span>
              <span className="retro-total-label">SuperPOS V1.0</span>
            </div>
            <div className="retro-total-val">{formatCurrency(finalTotal)}</div>
            <div className="retro-latest-item">
              {latestItem ? (
                `ÚLTIMO ITEM: ${latestItem.name} - ${formatCurrency(latestItem.price)}`
              ) : (
                'CAIXA LIVRE - AGUARDANDO PRODUTOS...'
              )}
            </div>
          </div>

          {/* Cart Table (Scrollable receipt view) */}
          <div className="glass-card p-0 overflow-hidden flex-1 flex flex-col" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="pos-cart-header p-3 border-b" style={{ background: 'rgba(0,0,0,0.1)' }}>
              <h3 className="panel-title flex-center gap-2">
                <ShoppingCart size={18} className="text-primary" />
                Carrinho de Compras ({cart.length} itens)
              </h3>
            </div>

            {cart.length === 0 ? (
              <div className="empty-cart text-center py-5">
                <ShoppingCart size={48} className="text-muted mb-2 opacity-30" />
                <p className="text-muted">Nenhum produto adicionado. Escaneie um código ou digite [F1] para pesquisar.</p>
              </div>
            ) : (
              <div className="table-responsive flex-1" style={{ overflowY: 'auto' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th className="text-center" style={{ width: '40px' }}>#</th>
                      <th>Produto</th>
                      <th className="text-right">Unitário</th>
                      <th className="text-center">Quantidade</th>
                      <th className="text-right">Total</th>
                      <th className="text-center">Remover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item, index) => (
                      <tr key={item.product.id} className="table-row">
                        <td className="text-center text-muted text-monospace" style={{ fontSize: '0.85rem' }}>{index + 1}</td>
                        <td className="font-semibold">
                          <div>{item.product.name}</div>
                          {item.product.active_promotion && (
                            <div style={{ marginTop: '4px', marginBottom: '2px', display: 'flex' }}>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-success/20 text-success border border-success/30 animate-pulse">
                                PROMO: {item.product.active_promotion.name}
                              </span>
                            </div>
                          )}
                          <span className="block text-xs text-muted text-monospace" style={{ marginTop: '2px' }}>{item.product.barcode}</span>
                        </td>
                        <td className="text-right text-monospace">{formatCurrency(item.price_unit)}</td>
                        <td className="text-center">
                          <div className="qty-controls" style={{ margin: '0 auto' }}>
                            <button
                              className="qty-btn"
                              onClick={() => updateQuantity(item.product.id, item.quantity - (item.product.unit === 'kg' ? 0.1 : 1))}
                            >
                              <Minus size={12} />
                            </button>
                            <input
                              type="number"
                              step={item.product.unit === 'kg' ? '0.05' : '1'}
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.product.id, Number.parseFloat(e.target.value) || 0)}
                              className="qty-input text-monospace"
                            />
                            <span className="text-xs text-muted pr-1">{item.product.unit}</span>
                            <button
                              className="qty-btn"
                              onClick={() => updateQuantity(item.product.id, item.quantity + (item.product.unit === 'kg' ? 0.1 : 1))}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </td>
                        <td className="text-right font-bold text-primary text-monospace">{formatCurrency(item.price_total)}</td>
                        <td className="text-center">
                          <button
                            className="btn-icon btn-delete"
                            onClick={() => {
                              setCancelType('item');
                              setCancelItemIndex((index + 1).toString());
                              setIsManagerAuthOpen(true);
                            }}
                            title="Excluir item (Requer Gerente)"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Product search input & details panel */}
        <aside className="pos-fullscreen-sidebar">
          {/* Autocomplete product search card */}
          <div className="glass-card">
            <h3 className="panel-title mb-3 flex-center gap-2">
              <Search size={18} />
              Buscar Produto [F1]
            </h3>
            {multiplier > 1 && (
              <div className="p-2 mb-3 rounded text-center font-bold text-xs uppercase animate-pulse" style={{ background: 'rgba(239, 68, 68, 0.2)', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
                Multiplicador Ativo: {multiplier}x
              </div>
            )}
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input
                ref={productSearchRef}
                type="text"
                placeholder="Código de barras ou Nome..."
                value={searchProductQuery}
                onChange={handleProductSearchChange}
                onKeyDown={handleProductSearchKeyDown}
                onFocus={syncData}
                className="input-field search-input"
              />
            </div>

            {/* Dropdown Results */}
            {searchProductQuery && filteredProductsList.length > 0 && (
              <div className="autocomplete-dropdown glass-card p-0 mt-2" style={{ position: 'relative', width: '100%', zIndex: 10 }}>
                {filteredProductsList.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    className="autocomplete-item py-2 px-3 flex-between cursor-pointer"
                    onClick={() => {
                      addToCart(prod);
                      setSearchProductQuery('');
                      if (productSearchRef.current) productSearchRef.current.focus();
                    }}
                    style={{
                      width: '100%',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      color: 'inherit'
                    }}
                  >
                    <div>
                      <div className="font-semibold text-sm">{prod.name}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', textAlign: 'right' }}>
                      {prod.promotional_price === undefined ? (
                        <span style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)' }} className="text-monospace">
                          {formatCurrency(prod.price_sell)}
                        </span>
                      ) : (
                        <>
                          <span className="text-muted line-through" style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                            {formatCurrency(prod.price_sell)}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 'bold',
                              backgroundColor: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>
                              PROMO
                            </span>
                            <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '0.95rem' }} className="text-monospace">
                              {formatCurrency(prod.promotional_price)}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Customer and Discount row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '12px' }}>
            {/* Customer select box */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px' }}>
              <div>
                <h3 className="panel-title flex-center gap-1.5" style={{ fontSize: '0.85rem', marginBottom: '8px' }}>
                  <User size={14} />
                  Cliente [F4]
                </h3>
                <div className="form-group mb-0">
                  <select
                    ref={customerRef}
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(Number.parseInt(e.target.value, 10))}
                    className="input-field select-field"
                    style={{ padding: '6px 24px 6px 8px', fontSize: '0.8rem', height: '32px' }}
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.id !== 1 && c.cpf ? `(${c.cpf})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedCustomer && selectedCustomerId !== 1 && (
                <div className="selected-customer-details mt-2 p-1.5 rounded bg-black-20" style={{ fontSize: '0.75rem', lineHeight: '1.2' }}>
                  <div className="flex-between">
                    <span className="text-muted">Limite:</span>
                    <span className={selectedCustomer.current_debt > selectedCustomer.debt_limit * 0.8 ? 'text-danger font-bold text-monospace' : 'text-success text-monospace'}>
                      {formatCurrency(selectedCustomer.current_debt)}/{formatCurrency(selectedCustomer.debt_limit)}
                    </span>
                  </div>
                  <div className="flex-between mt-0.5">
                    <span className="text-muted">Pontos:</span>
                    <span className="text-warning font-semibold">{selectedCustomer.loyalty_points} pts</span>
                  </div>
                </div>
              )}
            </div>

            {/* Discount details */}
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '12px' }}>
              <h3 className="panel-title" style={{ fontSize: '0.85rem', marginBottom: '8px' }}>Desconto [F3]</h3>
              <div className="flex-between gap-1.5">
                <span className="text-xs text-muted">Desc %</span>
                <input
                  ref={discountRef}
                  type="number"
                  min="0"
                  max="100"
                  value={discountPercent}
                  onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number.parseInt(e.target.value, 10) || 0)).toString())}
                  className="input-field text-right font-bold text-monospace"
                  style={{ width: '60px', padding: '6px', fontSize: '0.85rem', height: '32px' }}
                />
              </div>
            </div>
          </div>

          {/* Checkout final action */}
          <div className="glass-card checkout-summary-card" style={{ marginTop: 'auto' }}>
            <div className="summary-row flex-between py-2 border-b">
              <span className="text-muted">Subtotal:</span>
              <span className="font-semibold text-monospace">{formatCurrency(subtotal)}</span>
            </div>
            <div className="summary-row flex-between py-2 border-b text-xs">
              <span className="text-muted">Desconto:</span>
              <span className="text-danger text-monospace">-{formatCurrency(discountAmount)}</span>
            </div>
            <div className="py-3 flex-between">
              <span className="font-bold text-lg">Total final:</span>
              <span className="text-2xl font-black text-primary text-monospace">{formatCurrency(finalTotal)}</span>
            </div>
            <button
              onClick={() => {
                if (cart.length > 0) {
                  setIsPaymentModalOpen(true);
                  setTimeout(() => payAmountRef.current?.focus(), 150);
                } else {
                  toast.warning('Carrinho vazio.');
                }
              }}
              className="btn btn-primary w-full py-3 flex-center gap-2"
              style={{ fontSize: '1.1rem' }}
              disabled={cart.length === 0}
            >
              <CheckCircle size={20} />
              Concluir Compra [F2]
            </button>
          </div>
        </aside>
      </div>

      {/* Keyboard legends status bar */}
      <footer className="pos-keyboard-status-bar">
        <div className="keyboard-shortcut-item">
          <span className="keyboard-shortcut-key">F1</span>
          <span className="keyboard-shortcut-label">Bipar/Pesquisar</span>
        </div>
        <div className="keyboard-shortcut-item">
          <span className="keyboard-shortcut-key">F2</span>
          <span className="keyboard-shortcut-label">Concluir Compra</span>
        </div>
        <div className="keyboard-shortcut-item">
          <span className="keyboard-shortcut-key">F3</span>
          <span className="keyboard-shortcut-label">Desconto</span>
        </div>
        <div className="keyboard-shortcut-item">
          <span className="keyboard-shortcut-key">F4</span>
          <span className="keyboard-shortcut-label">Cliente</span>
        </div>
        <button
          type="button"
          className="keyboard-shortcut-item"
          onClick={() => {
            setIsPaymentModalOpen(false);
            setIsManagerAuthOpen(false);
            setIsCloseCashModalOpen(false);
            setIsMultiplierModalOpen(false);
            setIsManualCodeModalOpen(false);
            setIsPriceLookupOpen(true);
            setPriceLookupQuery('');
            setPriceLookupResult(null);
            setTimeout(() => priceLookupInputRef.current?.focus(), 150);
          }}
          style={{
            cursor: 'pointer',
            background: 'none',
            border: 'none',
            fontFamily: 'inherit',
            color: 'inherit',
            padding: 0,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <span className="keyboard-shortcut-key">F5</span>
          <span className="keyboard-shortcut-label" style={{ fontWeight: '600' }}>Consulta Preço</span>
        </button>
        <div className="keyboard-shortcut-item">
          <span className="keyboard-shortcut-key">F6</span>
          <span className="keyboard-shortcut-label">Digitar Código</span>
        </div>
        <div className="keyboard-shortcut-item">
          <span className="keyboard-shortcut-key">F7</span>
          <span className="keyboard-shortcut-label">Multiplicar</span>
        </div>
        <div className="keyboard-shortcut-item">
          <span className="keyboard-shortcut-key">F8</span>
          <span className="keyboard-shortcut-label">Fechar Caixa</span>
        </div>
        <div className="keyboard-shortcut-item">
          <span className="keyboard-shortcut-key">F9</span>
          <span className="keyboard-shortcut-label">Cancelar Item</span>
        </div>
        <div className="keyboard-shortcut-item">
          <span className="keyboard-shortcut-key">F10</span>
          <span className="keyboard-shortcut-label">Cancelar Compra</span>
        </div>
        <div className="keyboard-shortcut-item">
          <span className="keyboard-shortcut-key">ESC</span>
          <span className="keyboard-shortcut-label">Fechar Telas</span>
        </div>
      </footer>

      {/* MODAL 1: FECHAMENTO DE VENDA / CHECKOUT (F2) */}
      {isPaymentModalOpen && (() => {
        const pixMethod = paymentMethods.find(m => m.type === 'pix');
        let pixAmount = 0;
        if (pixMethod) {
          if (isSplitMode) {
            pixAmount = Number.parseFloat(splitAmounts[pixMethod.id]) || 0;
          } else if (activeMethod?.id === pixMethod.id) {
            pixAmount = finalTotal;
          }
        }

        const pixKey = localStorage.getItem('superpos_pix_key') || '';
        const pixName = localStorage.getItem('superpos_pix_name') || 'Supermercado';
        const pixCity = localStorage.getItem('superpos_pix_city') || 'Sao Paulo';

        let pixPayload = '';
        if (pixAmount > 0 && pixKey) {
          try {
            pixPayload = generatePixPayload(pixKey, pixName, pixCity, pixAmount);
          } catch (e) {
            console.error("Erro ao gerar payload Pix:", e);
          }
        }

        return (
          <div className="pos-payment-modal-overlay">
            <div className="pos-payment-modal-container animate-fade-in" style={{ maxWidth: pixAmount > 0 ? '950px' : '750px', width: '90%' }}>
              <header className="pos-payment-modal-header">
                <h2 className="panel-title flex-center gap-2">
                  <ShoppingCart size={20} className="text-primary" />
                  Fechamento de Venda
                </h2>
                <button className="btn-icon" onClick={() => setIsPaymentModalOpen(false)}>×</button>
              </header>

              <div className="pos-payment-modal-body" style={{ display: 'grid', gridTemplateColumns: pixAmount > 0 ? '1fr 1fr 1fr' : '1fr 1fr', gap: '20px' }}>
                {/* Payment Summary Left Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderRight: '1px solid var(--border)', paddingRight: '20px' }}>
                  <div className="p-3 rounded text-center" style={{ background: 'rgba(0,0,0,0.2)' }}>
                    <span className="text-xs text-muted block uppercase font-bold tracking-wider">Total Líquido</span>
                    <span className="text-3xl font-black text-primary text-monospace">{formatCurrency(finalTotal)}</span>
                  </div>

                  {isSplitMode ? (
                    <div className="p-2 rounded text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div className="flex-between text-xs py-1">
                        <span className="text-muted font-semibold">Total Recebido:</span>
                        <span className="font-bold text-monospace">{formatCurrency(totalPaid)}</span>
                      </div>
                      <div className="flex-between text-xs py-1">
                        <span className="text-muted font-semibold">Restante:</span>
                        <span className="font-bold text-monospace" style={{ color: remainingAmount > 0 ? '#fbbf24' : '#10b981' }}>{formatCurrency(remainingAmount)}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {activeMethod?.type === 'dinheiro' && (
                        <div className="form-group">
                          <label htmlFor="single-cash-paid" className="block text-xs text-muted mb-2 font-bold uppercase">Valor Recebido (R$)</label>
                          <input
                            id="single-cash-paid"
                            ref={payAmountRef}
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={singleCashPaid}
                            onChange={(e) => setSingleCashPaid(e.target.value)}
                            className="input-field text-right font-bold text-lg text-monospace"
                            style={{ fontSize: '1.2rem', height: '40px' }}
                          />
                        </div>
                      )}

                      {activeMethod?.type === 'fiado' && selectedCustomer && (
                        <div className="p-3 rounded text-sm text-center" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                          <span className="text-danger font-bold block mb-1">DÉBITO DE FIADO REGISTRADO</span>
                          <span className="text-muted block">O valor de {formatCurrency(finalTotal)} será adicionado à conta de {selectedCustomer.name}.</span>
                        </div>
                      )}
                    </>
                  )}

                  {changeGiven > 0 && (
                    <div className="flex-between p-3 rounded" style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      <span className="text-sm font-semibold text-success">Troco do Cliente:</span>
                      <span className="text-xl font-bold text-success text-monospace">{formatCurrency(changeGiven)}</span>
                    </div>
                  )}

                  {/* NFC-e Emission Toggle & Customer CPF */}
                  <div className="p-3 rounded bg-white/5 border border-gray-850" style={{ display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '6px' }}>
                    <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={emitNfc}
                        onChange={(e) => setEmitNfc(e.target.checked)}
                        className="cursor-pointer"
                      />
                      <span>Emitir Cupom Fiscal (NFC-e)</span>
                    </label>

                    {emitNfc && (
                      <div className="animate-fade-in" style={{ marginTop: '4px' }}>
                        <label htmlFor='cpf-input-field' className="block text-[10px] text-muted mb-1 font-bold uppercase" style={{ display: 'block', fontSize: '9px', opacity: 0.7 }}>CPF na Nota (Opcional)</label>
                        <input
                          id="cpf-input-field"
                          type="text"
                          placeholder="000.000.000-00"
                          value={cpfCustomer}
                          onChange={(e) => setCpfCustomer(e.target.value)}
                          className="input-field py-1 text-xs text-center text-monospace"
                          style={{ height: '30px', fontSize: '0.8rem' }}
                        />
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleFinishSale}
                    className="btn btn-success w-full py-3 mt-auto flex-center gap-2"
                    style={{ fontSize: '1.1rem' }}
                  >
                    <CheckCircle size={20} />
                    Confirmar Venda [Enter]
                  </button>
                </div>

                {/* Payment Selection Right Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', minWidth: '320px' }}>
                  {isSplitMode ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="block text-xs text-muted mb-0 font-bold uppercase">Múltiplos Pagamentos</span>
                        <button
                          onClick={toggleSplitMode}
                          className="btn btn-secondary py-1 px-3 text-xs font-bold font-monospace"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        >
                          Pagamento Único [C]
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {paymentMethods.map((method) => {
                          const isDisabledFiado = method.type === 'fiado' && selectedCustomerId === 1;
                          return (
                            <div
                              key={method.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '12px',
                                padding: '10px 14px',
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                opacity: isDisabledFiado ? 0.5 : 1
                              }}
                            >
                              <span className="font-bold text-sm" style={{ flex: 1 }}>
                                {method.type === 'dinheiro' && '💵 '}
                                {method.type === 'pix' && '⚡ '}
                                {method.type === 'cartao' && '💳 '}
                                {method.type === 'fiado' && '📝 '}
                                {method.name}
                              </span>

                              <input
                                ref={(el) => { splitInputRefs.current[method.id] = el; }}
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={splitAmounts[method.id] || ''}
                                onChange={(e) => {
                                  setSplitAmounts({
                                    ...splitAmounts,
                                    [method.id]: e.target.value
                                  });
                                }}
                                className="input-field text-right font-bold text-monospace"
                                style={{ width: '130px', height: '36px', margin: 0 }}
                                disabled={isDisabledFiado}
                                title={isDisabledFiado ? 'Identifique o cliente primeiro (F4)' : ''}
                              />
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 p-3 rounded text-xs text-muted" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)' }}>
                        <HelpCircle size={14} className="inline mr-1" />
                        Insira os valores recebidos em cada meio de pagamento. Use as setas <strong>[↑ / ↓]</strong> ou a tecla <strong>Tab</strong> para navegar. Pressione <strong>Enter</strong> para confirmar.
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="block text-xs text-muted mb-0 font-bold uppercase">Forma de Pagamento</span>
                        <button
                          onClick={toggleSplitMode}
                          className="btn btn-primary py-1 px-3 text-xs font-bold font-monospace"
                          style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                        >
                          Dividir Valor [C]
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {paymentMethods.map((method, index) => {
                          const isDisabledFiado = method.type === 'fiado' && selectedCustomerId === 1;
                          const isSelected = selectedMethodId === method.id;
                          return (
                            <button
                              key={method.id}
                              disabled={isDisabledFiado}
                              onClick={() => handleSelectPaymentMethod(method.id, method.type)}
                              className={`btn w-full text-left py-3 flex-between ${isSelected ? 'btn-primary' : 'btn-secondary'}`}
                              style={{ opacity: isDisabledFiado ? 0.5 : 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)' }}
                              title={isDisabledFiado ? 'Identifique o cliente primeiro (F4)' : ''}
                            >
                              <span className="font-bold text-sm">
                                {method.type === 'dinheiro' && '💵 '}
                                {method.type === 'pix' && '⚡ '}
                                {method.type === 'cartao' && '💳 '}
                                {method.type === 'fiado' && '📝 '}
                                [{index + 1}] {method.name}
                              </span>
                              {isSelected && <span className="text-xs px-2 py-0.5 rounded font-bold" style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>ATIVO</span>}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-4 p-3 rounded text-xs text-muted" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)' }}>
                        <HelpCircle size={14} className="inline mr-1" />
                        Pressione <strong>[1, 2, 3, 4]</strong> ou as setas <strong>[↑ / ↓]</strong> para alternar a forma de pagamento. Pressione <strong>[C]</strong> para dividir pagamentos.
                      </div>
                    </>
                  )}
                </div>

                {/* PIX QR CODE COLUMN */}
                {pixAmount > 0 && (
                  <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderLeft: '1px solid var(--border)', paddingLeft: '20px', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="text-center font-bold text-xs uppercase text-primary tracking-wider mb-2" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <QrCode size={16} />
                      <span>Pagamento via PIX (R$ {pixAmount.toFixed(2)})</span>
                    </div>

                    {pixKey ? (
                      <>
                        <div className="p-3 bg-white rounded-lg flex items-center justify-center shadow-lg" style={{ width: '170px', height: '170px' }}>
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pixPayload)}`}
                            alt="QR Code PIX"
                            style={{ width: '150px', height: '150px' }}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: '4px 0', fontSize: '11px', color: '#fbbf24' }} className="animate-pulse">
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#fbbf24', display: 'inline-block' }}></span>
                          <span>Aguardando transferência (Confirmação Manual)</span>
                        </div>

                        <div className="text-center text-[11px] text-muted w-full" style={{ padding: '0 8px', lineHeight: '1.4' }}>
                          Abra o aplicativo do seu banco, escolha <strong>Pix / Pagar com QR Code</strong> e aponte a câmera.
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(pixPayload);
                            toast.success("Código PIX Copia e Cola copiado!");
                          }}
                          className="btn btn-secondary w-full py-1.5 text-xs font-bold font-mono"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '8px' }}
                        >
                          <QrCode size={14} />
                          Copiar Pix Copia e Cola
                        </button>
                      </>
                    ) : (
                      <div className="text-center p-4 rounded bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                        ⚠️ Chave PIX não configurada!<br />
                        Configure a chave no menu Administrativo &gt; Formas de Pagamento.
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>
          </div>
        )
      })()}

      {/* MODAL 2: AUTORIZAÇÃO DE CANCELAMENTO DO GERENTE (F9 / F10) */}
      {isManagerAuthOpen && (
        <div className="pos-payment-modal-overlay">
          <div className="manager-auth-modal animate-fade-in">
            <header className="flex-between mb-4">
              <h3 className="panel-title flex-center gap-2 text-danger">
                <ShieldAlert size={20} />
                Autorização de Gerente
              </h3>
              <button className="btn-icon" onClick={() => setIsManagerAuthOpen(false)}>×</button>
            </header>

            <form onSubmit={handleManagerAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="p-3 rounded text-xs text-muted" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                {cancelType === 'sale' ? (
                  <strong>AVISO: Esta ação irá limpar completamente a compra atual.</strong>
                ) : (
                  <strong>AVISO: Digite o número do item que deseja cancelar do carrinho.</strong>
                )}
              </div>

              {cancelType === 'item' && (
                <div className="form-group">
                  <label htmlFor="item-number-input-field" className="block text-xs text-muted mb-2 font-bold uppercase">Posição do Item (1, 2...)</label>
                  <input
                    id="item-number-input-field"
                    ref={cancelIndexRef}
                    type="number"
                    min="1"
                    max={cart.length}
                    value={cancelItemIndex}
                    onChange={(e) => setCancelItemIndex(e.target.value)}
                    className="input-field text-center font-bold text-monospace"
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="password-input-field" className="block text-xs text-muted mb-2 font-bold uppercase">Senha do Gerente</label>
                <input
                  id="password-input-field"
                  ref={managerPasswordRef}
                  type="password"
                  value={managerPassword}
                  onChange={(e) => setManagerPassword(e.target.value)}
                  className="input-field text-center font-bold"
                  placeholder="••••"
                  required
                />
              </div>

              <button type="submit" className="btn btn-danger w-full py-2 mt-2" disabled={authLoading}>
                {authLoading ? 'Verificando...' : 'Confirmar Cancelamento'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: FECHAMENTO DE CAIXA (F8) */}
      {isCloseCashModalOpen && (
        <div className="pos-payment-modal-overlay">
          <div className="close-cash-modal animate-fade-in" style={{ maxWidth: '480px' }}>
            <header className="flex-between mb-4 pb-3 border-b">
              <h3 className="panel-title flex-center gap-2">
                <KeyRound size={20} className="text-danger" />
                Fechamento de Caixa
              </h3>
              <button className="btn-icon" onClick={() => setIsCloseCashModalOpen(false)}>×</button>
            </header>

            <form onSubmit={handleCloseShift} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="text-sm">
                <div className="flex-between py-1 text-muted">
                  <span>Operador:</span>
                  <span className="font-bold text-monospace">{currentUser.username}</span>
                </div>
                <div className="flex-between py-1 text-muted">
                  <span>Abertura:</span>
                  <span className="text-monospace">{new Date(activeSession.opened_at).toLocaleString('pt-BR')}</span>
                </div>
                <div className="flex-between py-1 text-muted">
                  <span>Float Inicial:</span>
                  <span className="font-semibold text-monospace">{formatCurrency(activeSession.initial_float)}</span>
                </div>
              </div>

              <div className="p-3 rounded text-center" style={{ background: 'rgba(0,0,0,0.15)', border: '1px solid var(--border)' }}>
                <span className="text-xs text-muted block uppercase mb-1">Deseja encerrar seu turno?</span>
                <span className="text-sm block">Informe o saldo em dinheiro e cartões abaixo para fechar o caixa.</span>
              </div>

              <div className="form-group">
                <label htmlFor="close-cash-reported" className="block text-xs text-muted mb-2 font-bold uppercase">Dinheiro Físico Contado na Gaveta (R$)</label>
                <input
                  id="close-cash-reported"
                  ref={closeCashFloatRef}
                  type="number"
                  step="0.01"
                  className="input-field font-bold text-center text-lg text-monospace"
                  placeholder="0.00"
                  value={finalCashReported}
                  onChange={(e) => setFinalCashReported(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="close-card-reported" className="block text-xs text-muted mb-2 font-bold uppercase">Valor Total em Cartões Passado nas Máquinas (R$)</label>
                <input
                  id="close-card-reported"
                  type="number"
                  step="0.01"
                  className="input-field font-bold text-center text-lg text-monospace"
                  placeholder="0.00"
                  value={finalCardReported}
                  onChange={(e) => setFinalCardReported(e.target.value)}
                  required
                />
              </div>

              <div className="p-2 rounded text-center font-bold text-sm" style={{ background: 'rgba(255,255,255,0.05)', border: '1px dashed var(--border)' }}>
                Soma Total Informada: {formatCurrency((Number.parseFloat(finalCashReported) || 0) + (Number.parseFloat(finalCardReported) || 0))}
              </div>

              <div className="form-group">
                <label htmlFor="close-cash-manager-password" className="block text-xs text-danger mb-2 font-bold uppercase">Senha de Autorização do Gerente</label>
                <input
                  id="close-cash-manager-password"
                  type="password"
                  className="input-field font-bold text-center"
                  placeholder="••••"
                  value={closeCashManagerPassword}
                  onChange={(e) => setCloseCashManagerPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-danger w-full py-3 mt-2" disabled={closeLoading}>
                {closeLoading ? 'Fechando caixa...' : 'Confirmar Fechamento e Sair'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MULTIPLICAR: QUANTIDADE MULTIPLICADORA (F7) */}
      {isMultiplierModalOpen && (
        <div className="pos-payment-modal-overlay" style={{ zIndex: 999 }}>
          <div className="close-cash-modal animate-fade-in" style={{ maxWidth: '360px', padding: '24px' }}>
            <header className="flex-between mb-4 pb-2 border-b">
              <h3 className="panel-title flex-center gap-2">
                <ShoppingCart size={20} className="text-primary" />
                Qtd Próximo Item [F7]
              </h3>
              <button className="btn-icon" onClick={() => setIsMultiplierModalOpen(false)}>×</button>
            </header>

            <form onSubmit={(e) => {
              e.preventDefault();
              const num = Number.parseFloat(multiplierInput);
              if (num > 0) {
                setMultiplier(num);
                setIsMultiplierModalOpen(false);
                toast.info(`Próximo item será multiplicado por ${num}`);
                setTimeout(() => productSearchRef.current?.focus(), 50);
              } else {
                toast.warning('A quantidade deve ser maior que zero.');
              }
            }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label htmlFor="multiplier-input-field" className="block text-xs text-muted mb-2 font-bold uppercase text-center">Digite a quantidade multiplicadora:</label>
                <input
                  id="multiplier-input-field"
                  type="number"
                  step="any"
                  className="input-field font-bold text-center text-2xl text-monospace"
                  placeholder="1"
                  value={multiplierInput}
                  onChange={(e) => setMultiplierInput(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary w-1/2 py-2.5" onClick={() => setIsMultiplierModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary w-1/2 py-2.5">
                  Confirmar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DIGITAR CODIGO MANUAL (F6) */}
      {isManualCodeModalOpen && (
        <div className="pos-payment-modal-overlay" style={{ zIndex: 999 }}>
          <div className="close-cash-modal animate-fade-in" style={{ maxWidth: '360px', padding: '24px' }}>
            <header className="flex-between mb-4 pb-2 border-b">
              <h3 className="panel-title flex-center gap-2">
                <Search size={20} className="text-primary" />
                Digitar Código Manual [F6]
              </h3>
              <button className="btn-icon" onClick={() => setIsManualCodeModalOpen(false)}>×</button>
            </header>

            <form onSubmit={handleManualCodeSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label htmlFor="manual-code-input-field" className="block text-xs text-muted mb-2 font-bold uppercase text-center">Digite o código ou código de barras:</label>
                <input
                  id="manual-code-input-field"
                  type="text"
                  className="input-field font-bold text-center text-xl text-monospace"
                  placeholder="Ex: 115"
                  value={manualCodeInput}
                  onChange={(e) => setManualCodeInput(e.target.value)}
                  required
                />
              </div>

              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary w-1/2 py-2.5" onClick={() => setIsManualCodeModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary w-1/2 py-2.5">
                  Adicionar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONSULTA DE PREÇO (F5) */}
      {isPriceLookupOpen && (
        <div className="pos-payment-modal-overlay" style={{ zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-card modal-content animate-slide-up" style={{ maxWidth: '600px', width: '95%', padding: '28px', maxHeight: '90vh', overflowY: 'auto', position: 'relative', top: 'auto', left: 'auto', transform: 'none' }}>
            <header className="flex-between mb-4 pb-2 border-b" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="panel-title flex-center gap-2" style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <HelpCircle size={22} className="text-primary animate-pulse" />
                Consulta de Preço [F5]
              </h3>
              <button className="btn-icon" onClick={() => setIsPriceLookupOpen(false)} style={{ fontSize: '1rem', marginBottom: '10px'}}>×</button>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                <label htmlFor="price-lookup-query" className="block text-xs text-muted mb-1 font-bold uppercase text-center">
                  Escaneie o código de barras ou digite o nome/código:
                </label>
                <input
                  id="price-lookup-query"
                  ref={priceLookupInputRef}
                  type="text"
                  className="input-field font-bold text-center text-lg py-2"
                  placeholder="Aguardando código ou nome..."
                  value={priceLookupQuery}
                  onChange={handlePriceLookupChange}
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)' }}
                />
              </div>

              {priceLookupResult ? (
                <div className="glass-card text-center p-4 border border-primary/20 bg-primary/5 rounded-xl" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
                  <div>
                    <span className="badge info mb-2" style={{ fontSize: '0.75rem', textTransform: 'uppercase', padding: '4px 8px', backgroundColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.3)', borderRadius: '4px' }}>
                      {priceLookupResult.category || 'Sem Categoria'}
                    </span>
                    <h2 className="font-bold text-2xl" style={{ color: 'var(--text-main)', margin: '8px 0 4px' }}>
                      {priceLookupResult.name}
                    </h2>
                    <p className="text-xs text-muted font-mono mt-1" style={{ margin: 0 }}>
                      Cód: {priceLookupResult.code || '-'} | EAN: {priceLookupResult.barcode}
                    </p>
                  </div>

                  <div className="flex-center flex-col py-2" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    {priceLookupResult.promotional_price === undefined ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span className="text-xs text-muted uppercase font-bold" style={{ fontSize: '10px' }}>Valor Unitário</span>
                        <span style={{ fontWeight: 'bold', fontSize: '3.5rem', color: 'var(--accent-blue)', margin: '4px 0' }} className="text-monospace">
                          {formatCurrency(priceLookupResult.price_sell)}
                        </span>
                      </div>
                    ) : (
                      <>
                        <span className="text-muted line-through text-lg" style={{ opacity: 0.6 }}>
                          De: {formatCurrency(priceLookupResult.price_sell)}
                        </span>
                        <div className="flex-center gap-2 mt-1" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="animate-pulse" style={{
                            fontSize: '11px',
                            fontWeight: 'bold',
                            backgroundColor: 'rgba(16, 185, 129, 0.2)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.4)',
                            padding: '2px 8px',
                            borderRadius: '4px',
                          }}>
                            PROMOÇÃO
                          </span>
                          <span style={{ color: '#10b981', fontWeight: 'bold', fontSize: '3rem' }} className="text-monospace">
                            {formatCurrency(priceLookupResult.promotional_price)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="w-full grid grid-cols-2 gap-4 p-3 rounded-lg text-sm bg-black/20" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', width: '100%', backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px' }}>
                    <div className="text-left" style={{ textAlign: 'left' }}>
                      <span className="text-muted block text-xs" style={{ fontSize: '11px' }}>Estoque Atual:</span>
                      <strong className="text-lg text-monospace" style={{ fontSize: '1.15rem' }}>
                        {priceLookupResult.stock_qty} {priceLookupResult.unit}
                      </strong>
                    </div>
                    <div className="text-right" style={{ textAlign: 'right' }}>
                      <span className="text-muted block text-xs" style={{ fontSize: '11px' }}>Unidade de Medida:</span>
                      <strong className="text-lg uppercase" style={{ fontSize: '1.15rem' }}>
                        {priceLookupResult.unit === 'kg' ? 'Quilograma (KG)' : 'Unidade (UN)'}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-muted border border-dashed border-muted/20 rounded-xl" style={{ minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '12px', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '12px' }}>
                  <HelpCircle size={48} className="opacity-20 animate-bounce" />
                  {priceLookupQuery ? (
                    <p className="text-sm" style={{ margin: 0 }}>Nenhum produto correspondente encontrado.</p>
                  ) : (
                    <p className="text-sm" style={{ margin: 0 }}>Passe o produto no leitor de código de barras ou digite sua busca acima.</p>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <button type="button" className="btn btn-secondary w-full py-2.5 font-bold" onClick={() => setIsPriceLookupOpen(false)}>
                  Fechar Consulta [Esc]
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {nfcReceipt && (() => {
        const copies = Number.parseInt(localStorage.getItem('superpos_printer_copies') || '1', 10);
        const printerWidthVal = localStorage.getItem('superpos_printer_width') || '80mm';
        const customTitle = localStorage.getItem('superpos_receipt_title') || 'RECIBO DE VENDA';
        const showQrVal = localStorage.getItem('superpos_show_qrcode') !== 'false';

        return (
          <div className="pos-payment-modal-overlay animate-fade-in" style={{ zIndex: 999 }}>
            <div className="glass-card p-4 animate-slide-up flex flex-column items-center justify-between" style={{ maxWidth: '440px', width: '95%', background: 'rgba(20, 20, 20, 0.95)', border: '1px solid var(--primary)', display: 'flex', flexDirection: 'column', gap: '16px' }}>

              <div className="flex-center flex-column text-center mb-1" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {nfcReceipt.chave ? (
                  <>
                    <CheckCircle size={44} className="mb-2 text-success" />
                    <h3 className="font-bold text-lg text-success" style={{ margin: '4px 0 0' }}>Cupom Fiscal Emitido!</h3>
                    <p className="text-xs text-muted" style={{ margin: '4px 0 0' }}>A venda foi salva e a NFC-e foi gerada via SEFAZ PE.</p>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={44} className="mb-2 text-warning animate-bounce" />
                    <h3 className="font-bold text-lg text-warning" style={{ margin: '4px 0 0' }}>Venda Finalizada!</h3>
                    <p className="text-xs text-muted" style={{ margin: '4px 0 0' }}>Recibo de venda gerado (sem transmissão fiscal).</p>
                  </>
                )}
              </div>

              {/* Thermal Receipt Body */}
              <div
                className="bg-white text-black p-4 rounded shadow-inner font-mono"
                style={{
                  maxHeight: '320px',
                  overflowY: 'auto',
                  border: '1px solid #ddd',
                  fontFamily: 'monospace',
                  backgroundColor: '#fff',
                  color: '#000',
                  width: printerWidthVal === '58mm' ? '280px' : '370px',
                  fontSize: printerWidthVal === '58mm' ? '10px' : '12px',
                  lineHeight: '1.2'
                }}
              >
                <div className="text-center font-bold mb-2" style={{ textAlign: 'center' }}>
                  <p className="text-sm font-bold">{fiscalSettings?.razao_social || "SUPERPOS MERCADO LTDA"}</p>
                  <p>CNPJ: {fiscalSettings?.cnpj || "00.000.000/0001-00"}</p>
                  <p>IE: {fiscalSettings?.inscricao_estadual || "123.456.789"}</p>
                  <p>RECIFE - PERNAMBUCO</p>
                  <hr className="my-2" style={{ borderTop: '1px dashed #000', borderBottom: 'none' }} />
                  <p className="text-left font-bold uppercase" style={{ textAlign: 'left' }}>
                    {nfcReceipt.chave
                      ? "DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica"
                      : customTitle
                    }
                  </p>
                  <hr className="my-2" style={{ borderTop: '1px dashed #000', borderBottom: 'none' }} />
                </div>

                {/* Items List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>ITEM / DESC / QTD / VAL</span>
                  </div>
                  {nfcReceipt.items.map((item: any, idx: number) => (
                    <div key={`${item.product.id}-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', fontSize: printerWidthVal === '58mm' ? '9px' : '11px' }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: printerWidthVal === '58mm' ? '120px' : '180px' }}>{idx + 1} {item.product.name}</span>
                      <span>{item.quantity} {item.product.unit} x {item.price_unit.toFixed(2)} = {item.price_total.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <hr className="my-2" style={{ borderTop: '1px dashed #000', borderBottom: 'none' }} />

                {/* Totals */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>QTD. TOTAL DE ITENS</span>
                    <span>{nfcReceipt.items.length}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>VALOR TOTAL R$</span>
                    <span>{nfcReceipt.total_amount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>DESCONTO R$</span>
                    <span>{nfcReceipt.discount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: printerWidthVal === '58mm' ? '11px' : '13px' }}>
                    <span>VALOR A PAGAR R$</span>
                    <span>{nfcReceipt.final_amount.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>FORMA PAGAMENTO</span>
                    <span className="uppercase">{nfcReceipt.payment_method}</span>
                  </div>
                </div>

                <hr className="my-2" style={{ borderTop: '1px dashed #000', borderBottom: 'none' }} />

                {/* Fiscal Keys & QR Code */}
                {nfcReceipt.chave ? (
                  <div className="text-center" style={{ textAlign: 'center', fontSize: '9px' }}>
                    <p className="font-bold" style={{ fontWeight: 'bold' }}>ÁREA DO CONSUMIDOR</p>
                    {cpfCustomer ? (
                      <p>CPF DO CONSUMIDOR: {cpfCustomer}</p>
                    ) : (
                      <p>CONSUMIDOR NÃO IDENTIFICADO</p>
                    )}
                    <p className="break-all" style={{ wordBreak: 'break-all', fontWeight: 'semibold', marginTop: '4px' }}>CHAVE DE ACESSO:<br />{nfcReceipt.chave}</p>
                    <p style={{ marginTop: '2px' }}>NFC-e nº {nfcReceipt.chave.substring(25, 34)} Série 001 - Homologação</p>
                    <p>PROTOCOLO AUTORIZAÇÃO: {nfcReceipt.protocol}</p>

                    {/* QR Code Container */}
                    {showQrVal && nfcReceipt.qrCodeUrl && (
                      <div className="flex-center flex-column my-2 p-2 bg-white rounded" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginTop: '8px', padding: '6px', border: '1px solid #eee' }}>
                        <img
                          src={nfcReceipt.qrCodeUrl}
                          alt="QR Code SEFAZ NFC-e"
                          style={{ width: '100px', height: '100px' }}
                        />
                        <p className="text-[8px] text-muted mt-1" style={{ fontSize: '8px', color: '#666' }}>Consulte via leitor de QR Code na SEFAZ</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center font-bold" style={{ textAlign: 'center', fontSize: '9px' }}>
                    <p>OP: {currentUser.username} | CAIXA: {activeSession?.pdv_name || 'Caixa 01'}</p>
                    <p style={{ marginTop: '4px' }}>ESTE DOCUMENTO NÃO POSSUI VALOR FISCAL</p>
                    <p>OBRIGADO PELA PREFERÊNCIA!</p>
                  </div>
                )}
              </div>

              {/* Printing copy status */}
              <div className="flex-between w-full p-2 bg-white/5 rounded text-xs" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                <span className="text-muted">Impressora Térmica:</span>
                <span className="font-bold text-primary">
                  Bobina {printerWidthVal} | {copies} {copies === 1 ? 'Via' : 'Vias'}
                </span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 w-full" style={{ display: 'flex', gap: '8px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => {
                    toast.success(`Imprimindo ${copies} ${copies === 1 ? 'via' : 'vias'} do recibo (${printerWidthVal})...`);
                  }}
                  className="btn btn-secondary flex-1 py-2 font-bold"
                  style={{ flex: 1 }}
                >
                  Imprimir ({copies}x)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    // Reset cart and states
                    setCart([]);
                    setLatestItem(null);
                    setDiscountPercent('0');
                    setSplitAmounts({});
                    setPaymentMethod('dinheiro');
                    setCpfCustomer('');
                    setNfcReceipt(null);
                    setIsPaymentModalOpen(false);
                    loadData();

                    if (productSearchRef.current) {
                      productSearchRef.current.focus();
                    }
                  }}
                  className="btn btn-primary flex-1 py-2 font-bold"
                  style={{ flex: 1 }}
                >
                  Concluir Venda
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
