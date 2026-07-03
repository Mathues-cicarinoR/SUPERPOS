import crypto from 'node:crypto';
import { getDb } from '../database/db.js';

// Interface representing the fiscal invoice details
export interface FiscalInvoice {
  chave_acesso: string;
  cnpj_emitente: string;
  nome_emitente: string;
  numero_nota: string;
  valor_total: number;
  data_emissao: string;
  status_manifesto: string;
  xml_completo?: string;
  status_estoque: string;
}

// Mock databases of invoices simulating SEFAZ "Notas Destinadas" for Pernambuco
const MOCK_SEFAZ_INVOICES: Record<string, any> = {
  "26260612345678000190550010001234561876543210": {
    chave_acesso: "26260612345678000190550010001234561876543210",
    cnpj_emitente: "12.345.678/0001-90",
    nome_emitente: "Distribuidora de Alimentos Alfa PE",
    numero_nota: "123456",
    valor_total: 480.50,
    data_emissao: "2026-06-12",
    items: [
      { barcode: "7891000100101", name: "Arroz Agulhinha Tipo 1 5kg", quantity: 20, price_buy: 18.50 },
      { barcode: "7891000100102", name: "Feijão Carioca 1kg", quantity: 15, price_buy: 5.20 },
      { barcode: "7899999123456", name: "Farinha de Mandioca de Petrolina 1kg", quantity: 10, price_buy: 3.25 } // Novo produto!
    ]
  },
  "26260698765432000110550020000987651098765432": {
    chave_acesso: "26260698765432000110550020000987651098765432",
    cnpj_emitente: "98.765.432/0001-10",
    nome_emitente: "Distribuidora de Bebidas Geladas Recife",
    numero_nota: "98765",
    valor_total: 350.00,
    data_emissao: "2026-06-14",
    items: [
      { barcode: "7891000200202", name: "Refrigerante Cola 2L", quantity: 30, price_buy: 5.90 },
      { barcode: "7891000200204", name: "Cerveja Pilsen Lata 350ml", quantity: 50, price_buy: 2.20 },
      { barcode: "7899999654321", name: "Refrigerante Guaraná PE 2L", quantity: 20, price_buy: 4.80 } // Novo produto!
    ]
  },
  "26260645678901000123550010000456121234567890": {
    chave_acesso: "26260645678901000123550010000456121234567890",
    cnpj_emitente: "45.678.901/0001-23",
    nome_emitente: "Higiene & Cia Ltda - Filial Caruaru",
    numero_nota: "45612",
    valor_total: 150.00,
    data_emissao: "2026-06-15",
    items: [
      { barcode: "7891000500501", name: "Sabonete Barra 90g", quantity: 50, price_buy: 1.10 },
      { barcode: "7891000500502", name: "Creme Dental Tripla Ação 90g", quantity: 20, price_buy: 2.50 }
    ]
  }
};

/**
 * Service to handle native SEFAZ operations (NF-e and NFC-e)
 */
export class FiscalService {
  /**
   * Helper to verify if settings have a valid PFX certificate.
   * If not, the system works in SIMULATOR mode.
   */
  static async isSimulatorMode(cnpj: string): Promise<boolean> {
    const db = await getDb();
    const settings = await db.get("SELECT certificate_pfx FROM fiscal_settings WHERE cnpj = ?", [cnpj]);
    return !settings?.certificate_pfx;
  }

  /**
   * Generates a 44-digit Access Key (Chave de Acesso)
   */
  static generateAccessKey(ufCode: string, dateStr: string, cnpj: string, model: string, series: string, number: string): string {
    // Format dateStr (YYMM)
    const date = new Date(dateStr);
    const yy = String(date.getFullYear()).substring(2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const aamm = `${yy}${mm}`;

    const cleanCnpj = cnpj.replace(/\D/g, '');
    const modelPad = model.padStart(2, '0');
    const seriesPad = series.padStart(3, '0');
    const numberPad = number.padStart(9, '0');
    const tpEmis = '1'; // Normal emission
    
    // Generate 8-digit random numeric code (cNF)
    const cNf = String(Math.floor(Math.random() * 90000000) + 10000000);

    const keyWithoutDV = `${ufCode}${aamm}${cleanCnpj}${modelPad}${seriesPad}${numberPad}${tpEmis}${cNf}`;
    
    // Calculate Modulo 11 Digit Verifier (DV)
    let sum = 0;
    let weight = 2;
    for (let i = keyWithoutDV.length - 1; i >= 0; i--) {
      sum += Number.parseInt(keyWithoutDV[i], 10) * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    const dv = remainder < 2 ? 0 : 11 - remainder;

    return `${keyWithoutDV}${dv}`;
  }

  /**
   * Query received invoices from SEFAZ using the CNPJ
   * Acts as the "Distribuição DF-e" service.
   */
  static async syncReceivedInvoices(cnpj: string): Promise<FiscalInvoice[]> {
    const db = await getDb();

    const isSim = await this.isSimulatorMode(cnpj);

    if (isSim) {
      // --- SIMULATION MODE ---
      // Load all mock invoices into the database if they don't exist yet
      for (const [key, mockInv] of Object.entries(MOCK_SEFAZ_INVOICES)) {
        const exists = await db.get("SELECT id FROM received_invoices WHERE chave_acesso = ?", [key]);
        if (!exists) {
          await db.run(
            `INSERT INTO received_invoices (chave_acesso, cnpj_emitente, nome_emitente, numero_nota, valor_total, data_emissao, status_manifesto, status_estoque)
             VALUES (?, ?, ?, ?, ?, ?, 'none', 'pending')`,
            [key, mockInv.cnpj_emitente, mockInv.nome_emitente, mockInv.numero_nota, mockInv.valor_total, mockInv.data_emissao]
          );
        }
      }

      // Return the saved invoices
      return await db.all("SELECT * FROM received_invoices ORDER BY data_emissao DESC");
    } else {
      // --- REAL SEFAZ mTLS MODE (PE) ---
      // In a real scenario, this would use a SOAP client with node-dfe or https Agent
      // configured with the client cert to hit PE or national SEFAZ endpoints.
      // E.g. https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx
      
      throw new Error("Conexão real com a SEFAZ de Pernambuco requer certificado válido e cadastrado.");
    }
  }

  /**
   * Sends a Manifestation of Recipient (Manifestação do Destinatário) to SEFAZ
   */
  static async manifestInvoice(cnpj: string, chave: string, type: 'ciencia' | 'confirmada' | 'desconhecida'): Promise<boolean> {
    const db = await getDb();
    const isSim = await this.isSimulatorMode(cnpj);

    if (isSim) {
      // --- SIMULATION MODE ---
      await db.run(
        "UPDATE received_invoices SET status_manifesto = ? WHERE chave_acesso = ?",
        [type, chave]
      );
      return true;
    } else {
      // Real SEFAZ Event transmission...
      throw new Error("Transmissão de evento requer certificado válido.");
    }
  }

  /**
   * Downloads the complete XML of an invoice
   */
  static async downloadInvoiceXml(cnpj: string, chave: string): Promise<string> {
    const db = await getDb();
    const isSim = await this.isSimulatorMode(cnpj);

    if (isSim) {
      // --- SIMULATION MODE ---
      // Fetch details from our mock DB
      const mockInv = MOCK_SEFAZ_INVOICES[chave];
      if (!mockInv) {
        throw new Error("Nota Fiscal não encontrada nos registros simulados.");
      }

      // Generate a mock SEFAZ layout NFe XML
      const itemsXml = mockInv.items.map((item: any, index: number) => `
        <det nItem="${index + 1}">
          <prod>
            <cProd>PROD-${item.barcode}</cProd>
            <cEAN>${item.barcode}</cEAN>
            <xProd>${item.name}</xProd>
            <NCM>19021100</NCM>
            <CFOP>5102</CFOP>
            <uCom>UN</uCom>
            <qCom>${item.quantity.toFixed(4)}</qCom>
            <vUnCom>${item.price_buy.toFixed(4)}</vUnCom>
            <vProd>${(item.quantity * item.price_buy).toFixed(2)}</vProd>
            <cEANTrib>${item.barcode}</cEANTrib>
            <uTrib>UN</uTrib>
            <qTrib>${item.quantity.toFixed(4)}</qTrib>
            <vUnTrib>${item.price_buy.toFixed(4)}</vUnTrib>
            <indTot>1</indTot>
          </prod>
          <imposto>
            <ICMS>
              <ICMS00>
                <orig>0</orig>
                <CST>00</CST>
                <modBC>3</modBC>
                <vBC>${(item.quantity * item.price_buy).toFixed(2)}</vBC>
                <pICMS>18.00</pICMS>
                <vICMS>${(item.quantity * item.price_buy * 0.18).toFixed(2)}</vICMS>
              </ICMS00>
            </ICMS>
          </imposto>
        </det>
      `).join('\n');

      const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide>
        <cUF>26</cUF> <!-- Pernambuco -->
        <cNF>12345678</cNF>
        <natOp>Venda Mercadoria</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>${mockInv.numero_nota}</nNF>
        <dhEmi>${mockInv.data_emissao}T12:00:00-03:00</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>2611606</cMunFG> <!-- Recife -->
        <tpImp>1</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>${chave.substring(43)}</cDV>
        <tpAmb>2</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>0</indFinal>
        <indPres>1</indPres>
        <procEmi>0</procEmi>
      </ide>
      <emit>
        <CNPJ>${mockInv.cnpj_emitente.replace(/\D/g, '')}</CNPJ>
        <xNome>${mockInv.nome_emitente}</xNome>
        <xFant>${mockInv.nome_emitente.substring(0, 15)}</xFant>
        <enderEmit>
          <xLgr>Av Conselheiro Aguiar</xLgr>
          <n>1000</n>
          <xBairro>Boa Viagem</xBairro>
          <cMun>2611606</cMun>
          <xMun>Recife</xMun>
          <UF>PE</UF>
          <CEP>51020020</CEP>
        </enderEmit>
        <IE>123456789</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>${cnpj.replace(/\D/g, '')}</CNPJ>
        <xNome>Supermercado do Bairro PE Ltda</xNome>
        <enderDest>
          <xLgr>Rua Aurora</xLgr>
          <n>200</n>
          <xBairro>Boa Vista</xBairro>
          <cMun>2611606</cMun>
          <xMun>Recife</xMun>
          <UF>PE</UF>
          <CEP>50050000</CEP>
        </enderDest>
        <indIEDest>1</indIEDest>
        <IE>987654321</IE>
      </dest>
      ${itemsXml}
      <total>
        <ICMSTot>
          <vBC>${mockInv.valor_total.toFixed(2)}</vBC>
          <vICMS>${(mockInv.valor_total * 0.18).toFixed(2)}</vICMS>
          <vProd>${mockInv.valor_total.toFixed(2)}</vProd>
          <vNF>${mockInv.valor_total.toFixed(2)}</vNF>
        </ICMSTot>
      </total>
      <transp>
        <modFrete>9</modFrete>
      </transp>
      <pag>
        <detPag>
          <tPag>15</tPag> <!-- Boleto Bancario -->
          <vPag>${mockInv.valor_total.toFixed(2)}</vPag>
        </detPag>
      </pag>
    </infNFe>
    <Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
      <SignedInfo>
        <SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
        <Reference URI="#NFe${chave}">
          <DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
          <DigestValue>SimulatedDigestValueBase64String=</DigestValue>
        </Reference>
      </SignedInfo>
      <SignatureValue>SimulatedSignatureValueBytesBase64String==</SignatureValue>
    </Signature>
  </NFe>
</nfeProc>`;

      // Save XML to local database
      await db.run(
        "UPDATE received_invoices SET xml_completo = ? WHERE chave_acesso = ?",
        [xmlString, chave]
      );

      return xmlString;
    } else {
      throw new Error("Download real requer certificado digital.");
    }
  }

  /**
   * Simulates NFC-e (Cupom Fiscal) emission for a sale
   */
    static async emitNFCe(saleData: any, settings: any): Promise<{ success: boolean; chave: string; xml: string; protocol: string; qrCodeUrl: string; items: any[]; total_amount: number; discount: number; final_amount: number; }> {
    const db = await getDb();
    
    // Check if we are in simulator mode
    const isSim = !settings.certificate_pfx;

    const ufCode = '26'; // Pernambuco
    const dateStr = new Date().toISOString();
    const model = '65'; // NFC-e
    const series = '001';
    const number = String(saleData.sale_id || Math.floor(Math.random() * 90000) + 1).padStart(9, '0');
    
    const chave = this.generateAccessKey(ufCode, dateStr, settings.cnpj, model, series, number);
    const protocol = String(Math.floor(Math.random() * 9000000000000) + 1000000000000);

    // Fetch sale items from database including is_fiscal flag
    const saleItems = saleData.sale_id ? await db.all(`
      SELECT si.*, p.name, p.barcode, p.ncm, p.cest, p.cfop, p.origin, p.csosn, p.cst_pis, p.cst_cofins, p.aliquot_icms, p.aliquot_pis, p.aliquot_cofins, p.is_fiscal, p.unit
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      WHERE si.sale_id = ?
    `, [saleData.sale_id]) : [];

    // Filter out non-fiscal products
    const fiscalItems = saleItems.filter((item: any) => item.is_fiscal === undefined || item.is_fiscal === null || item.is_fiscal === 1 || item.is_fiscal === true);

    if (saleData.sale_id && fiscalItems.length === 0) {
      throw new Error("Não existem produtos fiscais nesta venda. Cupom fiscal NFC-e não pode ser emitido para vendas compostas exclusivamente por itens não-fiscais.");
    }

    const items = saleItems.length > 0 ? fiscalItems : [
      {
        barcode: '7891000100101',
        name: 'Produto Simulado da Venda',
        quantity: 1,
        price_unit: saleData.final_amount,
        price_total: saleData.final_amount,
        ncm: '00000000',
        cest: '',
        cfop: '5102',
        origin: '0',
        csosn: '102',
        cst_pis: '49',
        cst_cofins: '49',
        aliquot_icms: 18.0,
        aliquot_pis: 0,
        aliquot_cofins: 0,
        is_fiscal: 1
      }
    ];

    // Recalculate totals for fiscal items only
    let nfcTotalAmount = 0;
    let nfcDiscount = 0;
    let nfcFinalAmount = 0;

    if (saleData.sale_id && fiscalItems.length > 0) {
      nfcTotalAmount = fiscalItems.reduce((sum: number, item: any) => sum + item.price_total, 0);
      if (saleData.total_amount > 0) {
        const ratio = saleData.discount / saleData.total_amount;
        nfcDiscount = Number.parseFloat((nfcTotalAmount * ratio).toFixed(2));
      }
      nfcFinalAmount = Number.parseFloat((nfcTotalAmount - nfcDiscount).toFixed(2));
    } else {
      nfcTotalAmount = saleData.total_amount;
      nfcDiscount = saleData.discount || 0;
      nfcFinalAmount = saleData.final_amount;
    }

    const totalAmountStr = nfcTotalAmount.toFixed(2);
    const discountStr = nfcDiscount.toFixed(2);
    const finalAmountStr = nfcFinalAmount.toFixed(2);

    // Build standard PE NFC-e QR Code URL
    // PE layout requires: chNFe, versao, tpAmb, cDest, dhEmi, vNF, vICMS, digVal, cIdToken, cHashQRCode
    const environment = settings.environment || 2;
    const cIdToken = settings.csc_id || '000001';
    const cscVal = settings.csc_token || '12345-TESTE-CSC-PERNAMBUCO';
    
    // Basic SHA-1 digest simulation for QR Code Hash
    const qrCodeParamString = `chNFe=${chave}&versao=100&tpAmb=${environment}&dhEmi=${Buffer.from(dateStr).toString('hex')}&vNF=${finalAmountStr}&vICMS=0.00&digVal=323334&cIdToken=${cIdToken}`;
    const hashInput = `${qrCodeParamString}${cscVal}`;
    const hash = crypto.createHash('sha1').update(hashInput).digest('hex').toUpperCase();
    
    const qrCodeUrl = `https://nfce.sefaz.pe.gov.br/nfce/consulta?${qrCodeParamString}&cHashQRCode=${hash}`;

    const itemsXml = items.map((item: any, index: number) => {
      const csosnCode = item.csosn || settings.default_csosn || '102';
      const origCode = item.origin || settings.default_origin || '0';
      const cfopCode = item.cfop || settings.default_cfop || '5102';
      const ncmCode = item.ncm || '00000000';
      const pisCst = item.cst_pis || settings.default_cst_pis || '49';
      const cofinsCst = item.cst_cofins || settings.default_cst_cofins || '49';
      
      const pIcms = item.aliquot_icms !== null && item.aliquot_icms !== undefined ? Number.parseFloat(item.aliquot_icms) : Number.parseFloat(settings.default_aliquot_icms || '18.0');
      const pPis = item.aliquot_pis !== null && item.aliquot_pis !== undefined ? Number.parseFloat(item.aliquot_pis) : Number.parseFloat(settings.default_aliquot_pis || '0.0');
      const pCofins = item.aliquot_cofins !== null && item.aliquot_cofins !== undefined ? Number.parseFloat(item.aliquot_cofins) : Number.parseFloat(settings.default_aliquot_cofins || '0.0');

      let icmsXml = '';
      if (['102', '103', '300', '400'].includes(csosnCode)) {
        icmsXml = `
              <ICMSSN102>
                <orig>${origCode}</orig>
                <CSOSN>${csosnCode}</CSOSN>
              </ICMSSN102>`;
      } else if (csosnCode === '500') {
        icmsXml = `
              <ICMSSN500>
                <orig>${origCode}</orig>
                <CSOSN>500</CSOSN>
              </ICMSSN500>`;
      } else {
        icmsXml = `
              <ICMSSN900>
                <orig>${origCode}</orig>
                <CSOSN>${csosnCode}</CSOSN>
                <pICMS>${pIcms.toFixed(2)}</pICMS>
                <vICMS>${(item.price_total * pIcms / 100).toFixed(2)}</vICMS>
              </ICMSSN900>`;
      }

      return `
        <det nItem="${index + 1}">
          <prod>
            <cProd>${item.barcode}</cProd>
            <cEAN>${item.barcode}</cEAN>
            <xProd>${item.name}</xProd>
            <NCM>${ncmCode}</NCM>
            ${item.cest ? `<CEST>${item.cest}</CEST>` : ''}
            <CFOP>${cfopCode}</CFOP>
            <uCom>UN</uCom>
            <qCom>${item.quantity.toFixed(4)}</qCom>
            <vUnCom>${item.price_unit.toFixed(4)}</vUnCom>
            <vProd>${item.price_total.toFixed(2)}</vProd>
            <cEANTrib>${item.barcode}</cEANTrib>
            <uTrib>UN</uTrib>
            <qTrib>${item.quantity.toFixed(4)}</qTrib>
            <vUnTrib>${item.price_unit.toFixed(4)}</vUnTrib>
            <indTot>1</indTot>
          </prod>
          <imposto>
            <ICMS>
              ${icmsXml}
            </ICMS>
            <PIS>
              <PISOutr>
                <CST>${pisCst}</CST>
                <vBC>${item.price_total.toFixed(2)}</vBC>
                <pPIS>${pPis.toFixed(4)}</pPIS>
                <vPIS>${(item.price_total * pPis / 100).toFixed(2)}</vPIS>
              </PISOutr>
            </PIS>
            <COFINS>
              <COFINSOutr>
                <CST>${cofinsCst}</CST>
                <vBC>${item.price_total.toFixed(2)}</vBC>
                <pCOFINS>${pCofins.toFixed(4)}</pCOFINS>
                <vCOFINS>${(item.price_total * pCofins / 100).toFixed(2)}</vCOFINS>
              </COFINSOutr>
            </COFINS>
          </imposto>
        </det>
      `;
    }).join('\n');

    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe${chave}" versao="4.00">
      <ide>
        <cUF>${ufCode}</cUF>
        <cNF>${chave.substring(34, 42)}</cNF>
        <natOp>Venda Consumidor</natOp>
        <mod>65</mod>
        <serie>1</serie>
        <nNF>${Number.parseInt(number, 10)}</nNF>
        <dhEmi>${dateStr}</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <cMunFG>2611606</cMunFG>
        <tpImp>4</tpImp> <!-- DANFE NFC-e -->
        <tpEmis>1</tpEmis>
        <cDV>${chave.substring(43)}</cDV>
        <tpAmb>${environment}</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>1</indPres>
        <procEmi>0</procEmi>
      </ide>
      <emit>
        <CNPJ>${settings.cnpj.replace(/\D/g, '')}</CNPJ>
        <xNome>${settings.razao_social}</xNome>
        <enderEmit>
          <xLgr>Av Conselheiro Aguiar</xLgr>
          <n>500</n>
          <xMun>Recife</xMun>
          <UF>${settings.state || 'PE'}</UF>
        </enderEmit>
        <IE>${settings.inscricao_estadual}</IE>
      </emit>
      <dest>
        <CPF>${saleData.cpf_customer || ''}</CPF>
      </dest>
      ${itemsXml}
      <total>
        <ICMSTot>
          <vProd>${totalAmountStr}</vProd>
          <vDesc>${discountStr}</vDesc>
          <vNF>${finalAmountStr}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>${environment}</tpAmb>
      <verAplic>PE_NFCe_v4.0.0</verAplic>
      <chNFe>${chave}</chNFe>
      <dhRecbto>${dateStr}</dhRecbto>
      <nProt>${protocol}</nProt>
      <digVal>DigestSimulado==</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`;

    if (isSim) {
      // In simulator mode, return simulated response
      return {
        success: true,
        chave,
        xml: mockXml,
        protocol,
        qrCodeUrl,
        items,
        total_amount: nfcTotalAmount,
        discount: nfcDiscount,
        final_amount: nfcFinalAmount
      };
    } else {
      // Real SEFAZ transmission would go here
      throw new Error("Conexão com a SEFAZ PE para emissão necessita de certificado digital válido.");
    }
  }
}
