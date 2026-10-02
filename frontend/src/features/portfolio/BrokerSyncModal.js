import React, { useState, useEffect, useRef } from 'react';
import http from '../../http-common';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

const BROKERS = [
  { id: 'etoro', name: 'eToro', type: 'both', icon: 'ph-arrows-clockwise', badge: 'Rekeningoverzicht & API' },
  { id: 'degiro', name: 'DeGiro', type: 'file', icon: 'ph-file-csv', badge: 'Rekeningoverzicht / Transacties' },
  { id: 'trading212', name: 'Trading 212', type: 'file', icon: 'ph-file-csv', badge: 'CSV Export' },
  { id: 'ibkr', name: 'IBKR / Lynx', type: 'file', icon: 'ph-file-csv', badge: 'Flex Query / CSV' },
  { id: 'freedom24', name: 'Freedom24', type: 'file', icon: 'ph-file-csv', badge: 'Account Statement' },
  { id: 'bitvavo', name: 'Bitvavo', type: 'file', icon: 'ph-currency-btc', badge: 'CSV Export' },
  { id: 'coinbase', name: 'Coinbase', type: 'file', icon: 'ph-currency-btc', badge: 'CSV Export' }
];

const BrokerSyncModal = ({ isOpen, onClose, onImportSuccess, allExistingTransactions = [] }) => {
  const [selectedBroker, setSelectedBroker] = useState('etoro');
  const [brokerSettings, setBrokerSettings] = useState({});
  const [apiKey, setApiKey] = useState('');
  const [userKey, setUserKey] = useState('');
  const [etoroCashInput, setEtoroCashInput] = useState('');
  const [degiroCashInput, setDegiroCashInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  // Import preview / duplicate review state
  const [previewData, setPreviewData] = useState([]);
  const [showReview, setShowReview] = useState(false);
  const [detectedCash, setDetectedCash] = useState(null);

  const fileInputRef = useRef(null);
  const uid = localStorage.getItem('userID') || 1;

  // Haal opgeslagen instellingen op
  const fetchSettings = async () => {
    try {
      const res = await http.get(`/brokers/credentials?userId=${uid}`);
      const map = {};
      if (Array.isArray(res.data)) {
        res.data.forEach(item => {
          map[item.broker_name.toLowerCase()] = item;
        });
      }
      setBrokerSettings(map);
      if (map['etoro']?.cash_balance !== undefined) {
        setEtoroCashInput(String(map['etoro'].cash_balance));
      }
      if (map['degiro']?.cash_balance !== undefined) {
        setDegiroCashInput(String(map['degiro'].cash_balance));
      }
    } catch (err) {
      console.error('Fout bij ophalen broker instellingen:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchSettings();
      setShowReview(false);
      setPreviewData([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentSettings = brokerSettings[selectedBroker] || null;

  // Sla eToro API keys op
  const handleSaveEtoro = async (e) => {
    e.preventDefault();
    if (!apiKey.trim() || !userKey.trim()) {
      toast.error('Vul zowel de API-sleutel als de User Key in.');
      return;
    }
    setLoading(true);
    try {
      const res = await http.post('/brokers/credentials', {
        userId: uid,
        brokerName: 'eToro',
        apiKey: apiKey.trim(),
        userKey: userKey.trim()
      });
      toast.success(res.data?.message || 'eToro API sleutels succesvol gekoppeld!');
      setApiKey('');
      setUserKey('');
      await fetchSettings();
    } catch (err) {
      console.error('Fout bij opslaan eToro:', err);
      toast.error(err.response?.data?.message || 'Kon eToro instellingen niet opslaan.');
    } finally {
      setLoading(false);
    }
  };

  // Sla cash saldo direct op
  const handleSaveCash = async (brokerName, cashVal, curr) => {
    if (cashVal === '' || isNaN(parseFloat(cashVal))) {
      toast.error('Vul een geldig cash bedrag in.');
      return;
    }
    setLoading(true);
    try {
      await http.post('/brokers/credentials', {
        userId: uid,
        brokerName,
        cashBalance: parseFloat(cashVal),
        cashCurrency: curr
      });
      toast.success(`${brokerName} cash saldo succesvol bijgewerkt naar ${curr === 'USD' ? '$' : '€'}${parseFloat(cashVal).toFixed(2)}!`);
      await fetchSettings();
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      console.error('Fout bij opslaan cash saldo:', err);
      toast.error('Kon cash saldo niet opslaan.');
    } finally {
      setLoading(false);
    }
  };

  // Ontkoppel eToro
  const handleDisconnect = async (brokerName) => {
    if (!window.confirm(`Weet je zeker dat je ${brokerName} wilt ontkoppelen?`)) return;
    try {
      await http.delete(`/brokers/credentials/${brokerName}?userId=${uid}`);
      toast.success(`${brokerName} succesvol ontkoppeld.`);
      await fetchSettings();
    } catch (err) {
      console.error('Fout bij ontkoppelen:', err);
      toast.error('Ontkoppelen mislukt.');
    }
  };

  // eToro Direct Sync
  const handleSyncEtoro = async () => {
    setSyncing(true);
    try {
      toast.loading('Bezig met synchroniseren van eToro posities & cash...', { id: 'etoro-sync' });
      const res = await http.post('/brokers/sync-etoro', { userId: uid });
      if (res.data?.status === 'warning') {
        toast(res.data.message, { icon: 'ℹ️', duration: 6000, id: 'etoro-sync' });
      } else {
        toast.success(res.data?.message || 'eToro data succesvol gesynchroniseerd!', { id: 'etoro-sync' });
      }
      await fetchSettings();
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      console.error('Fout bij sync:', err);
      toast.error(err.response?.data?.message || 'Synchronisatie met eToro mislukt.', { id: 'etoro-sync' });
    } finally {
      setSyncing(false);
    }
  };

  // Helpers voor getallen & datums
  const parseNumber = (val) => {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    let s = String(val).trim().replace(/€|\$|\s/g, '');
    if (s.includes('.') && s.includes(',')) {
      if (s.indexOf('.') < s.indexOf(',')) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        s = s.replace(/,/g, '');
      }
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };

  const parseAnyDate = (dateVal, timeStr) => {
    if (!dateVal) return new Date().toISOString();
    if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? new Date().toISOString() : dateVal.toISOString();
    let str = String(dateVal).trim();
    if (timeStr) str += ' ' + String(timeStr).trim();

    // 1. DD/MM/YYYY of DD-MM-YYYY (met optionele tijd HH:mm:ss of HH:mm)
    const dmyMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (dmyMatch) {
      const day = dmyMatch[1].padStart(2, '0');
      const month = dmyMatch[2].padStart(2, '0');
      const year = dmyMatch[3];
      const hour = (dmyMatch[4] || '12').padStart(2, '0');
      const min = (dmyMatch[5] || '00').padStart(2, '0');
      const sec = (dmyMatch[6] || '00').padStart(2, '0');
      return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`).toISOString();
    }

    // 2. YYYY-MM-DD of YYYY/MM/DD
    const ymdMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (ymdMatch) {
      const year = ymdMatch[1];
      const month = ymdMatch[2].padStart(2, '0');
      const day = ymdMatch[3].padStart(2, '0');
      const hour = (ymdMatch[4] || '12').padStart(2, '0');
      const min = (ymdMatch[5] || '00').padStart(2, '0');
      const sec = (ymdMatch[6] || '00').padStart(2, '0');
      return new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}Z`).toISOString();
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  };

  const parseDeGiroDate = (dateStr, timeStr) => {
    return parseAnyDate(dateStr, timeStr);
  };

  const parseCSVText = (text) => {
    const lines = text.split(/\r\n|\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) return [];

    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semiCount > commaCount ? ';' : ',';

    const parseLine = (line) => {
      const result = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"' || char === "'") {
          inQuotes = !inQuotes;
        } else if (char === delimiter && !inQuotes) {
          result.push(cur.trim().replace(/^["']|["']$/g, ''));
          cur = '';
        } else {
          char !== '\r' && (cur += char);
        }
      }
      result.push(cur.trim().replace(/^["']|["']$/g, ''));
      return result;
    };

    const rawHeaders = parseLine(lines[0]).map(h => h.trim());
    const headers = [];
    rawHeaders.forEach((h, idx) => {
      const prev = (rawHeaders[idx - 1] || '').toLowerCase().trim();
      if (!h && (prev === 'mutatie' || prev === 'change' || prev.startsWith('mutatie') || prev.startsWith('change'))) {
        headers.push('Mutatie_amount');
      } else if (!h && (prev === 'saldo' || prev === 'balance' || prev.startsWith('saldo') || prev.startsWith('balance'))) {
        headers.push('Saldo_amount');
      } else {
        headers.push(h || `col_${idx}`);
      }
    });

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseLine(lines[i]);
      if (values.length > 1) {
        const row = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] !== undefined ? values[idx] : '';
        });
        rows.push(row);
      }
    }
    return rows;
  };

  // File Upload Handlers
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (file) => {
    const reader = new FileReader();
    const isCsv = file.name.toLowerCase().endsWith('.csv');

    reader.onload = (e) => {
      try {
        let rows = [];
        let wb = null;

        if (isCsv) {
          const text = e.target.result;
          rows = parseCSVText(text);
          if (rows.length === 0) {
            try {
              wb = XLSX.read(text, { type: 'string' });
              const sheet = wb.Sheets[wb.SheetNames[0]];
              rows = XLSX.utils.sheet_to_json(sheet);
            } catch (err) {}
          }
        } else {
          const data = e.target.result;
          wb = XLSX.read(data, { type: 'binary' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(sheet);
        }

        if (rows.length === 0 && (!wb || !wb.SheetNames || wb.SheetNames.length === 0)) {
          toast.error('Geen geldige rijen gevonden in dit bestand.');
          return;
        }

        let parsed = [];

        // 1. ETORO EXPORT PARSER (Account Statement Excel / CSV)
        if (selectedBroker === 'etoro' || (wb && wb.SheetNames && wb.SheetNames.some(n => n.toLowerCase().includes('closed') || n.toLowerCase().includes('gesloten') || n.toLowerCase().includes('activit')))) {
          let etoroTrades = [];
          let etoroCashTx = [];

          if (wb && wb.SheetNames && wb.SheetNames.length > 1) {
            // Check sheet "Closed Positions" / "Gesloten posities"
            const closedSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('closed') || n.toLowerCase().includes('gesloten') || n.toLowerCase().includes('position'));
            if (closedSheetName) {
              const closedRows = XLSX.utils.sheet_to_json(wb.Sheets[closedSheetName]);
              closedRows.forEach(r => {
                const action = String(r['Action'] || r['Actie'] || '').trim();
                const isin = String(r['ISIN'] || r['isin'] || '').trim();
                const units = parseNumber(r['Units'] || r['Eenheden'] || r['Aantal']);
                const openRate = parseNumber(r['Open Rate'] || r['Openingskoers'] || r['Open Price']);
                const closeRate = parseNumber(r['Close Rate'] || r['Sluitingskoers'] || r['Close Price']);
                const openDate = r['Open Date'] || r['Openingsdatum'] || r['Open DateTime'];
                const closeDate = r['Close Date'] || r['Sluitingsdatum'] || r['Close DateTime'];
                
                let ticker = action.replace(/^(buy|sell|koop|verkoop)\s+/i, '').trim() || isin || 'Unknown';
                
                if (units > 0 && openRate > 0 && openDate) {
                  etoroTrades.push({
                    ticker: ticker,
                    isin: isin || null,
                    transaction_type: 'BUY',
                    broker_id: 1,
                    _brokerName: 'eToro',
                    import_source: 'etoro_statement',
                    quantity: Math.abs(units),
                    price: Math.abs(openRate),
                    purchase_time: parseAnyDate(openDate),
                    fees: 0,
                    taxes: 0,
                    currency: 'USD',
                    exchange_rate: 1
                  });
                }

                if (units > 0 && closeRate > 0 && closeDate) {
                  etoroTrades.push({
                    ticker: ticker,
                    isin: isin || null,
                    transaction_type: 'SELL',
                    broker_id: 1,
                    _brokerName: 'eToro',
                    import_source: 'etoro_statement',
                    quantity: Math.abs(units),
                    price: Math.abs(closeRate),
                    purchase_time: parseAnyDate(closeDate),
                    fees: parseNumber(r['Spread'] || r['Spreadkosten (USD)'] || 0),
                    taxes: 0,
                    currency: 'USD',
                    exchange_rate: 1
                  });
                }
              });
            }

            // Check sheet "Account Activity" / "Accountactiviteit"
            const actSheetName = wb.SheetNames.find(n => n.toLowerCase().includes('activity') || n.toLowerCase().includes('activiteit'));
            if (actSheetName) {
              const actRows = XLSX.utils.sheet_to_json(wb.Sheets[actSheetName]);
              actRows.forEach(r => {
                const type = String(r['Type'] || r['Account Balance Type'] || '').toLowerCase();
                const amt = parseNumber(r['Amount'] || r['Bedrag'] || r['Total Amount']);
                const dateStr = r['Date'] || r['Datum'];
                const details = String(r['Details'] || r['Omschrijving'] || '').replace(/\/USD/i, '').replace(/^-$/, '').trim();

                if (!dateStr || amt === 0) return;

                if (type.includes('deposit') || type.includes('storting') || type.includes('transfer to trading')) {
                  etoroCashTx.push({
                    ticker: 'eToro Storting',
                    aandeel_id: null,
                    isin: null,
                    transaction_type: 'DEPOSIT',
                    broker_id: 1,
                    _brokerName: 'eToro',
                    import_source: 'etoro_statement',
                    quantity: Math.abs(amt),
                    price: 1,
                    purchase_time: parseAnyDate(dateStr),
                    fees: 0,
                    taxes: 0,
                    currency: 'USD',
                    exchange_rate: 1
                  });
                } else if (type.includes('withdraw') || type.includes('opname')) {
                  etoroCashTx.push({
                    ticker: 'eToro Opname',
                    aandeel_id: null,
                    isin: null,
                    transaction_type: 'WITHDRAWAL',
                    broker_id: 1,
                    _brokerName: 'eToro',
                    import_source: 'etoro_statement',
                    quantity: Math.abs(amt),
                    price: 1,
                    purchase_time: parseAnyDate(dateStr),
                    fees: 0,
                    taxes: 0,
                    currency: 'USD',
                    exchange_rate: 1
                  });
                } else if (type.includes('rente') || type.includes('interest')) {
                  etoroCashTx.push({
                    ticker: 'eToro Rente',
                    aandeel_id: null,
                    isin: null,
                    transaction_type: 'INTEREST',
                    broker_id: 1,
                    _brokerName: 'eToro',
                    import_source: 'etoro_statement',
                    quantity: Math.abs(amt),
                    price: 1,
                    purchase_time: parseAnyDate(dateStr),
                    fees: 0,
                    taxes: 0,
                    currency: 'USD',
                    exchange_rate: 1
                  });
                } else if (type.includes('dividend')) {
                  etoroCashTx.push({
                    ticker: details ? `Dividend ${details}` : 'eToro Dividend',
                    aandeel_id: null,
                    isin: null,
                    transaction_type: 'DIVIDEND',
                    broker_id: 1,
                    _brokerName: 'eToro',
                    import_source: 'etoro_statement',
                    quantity: Math.abs(amt),
                    price: 1,
                    purchase_time: parseAnyDate(dateStr),
                    fees: 0,
                    taxes: 0,
                    currency: 'USD',
                    exchange_rate: 1
                  });
                }
              });

              // Detecteer actueel eToro Cash Saldo (Saldo van de meest recente activiteit)
              let latestCash = null;
              for (let i = actRows.length - 1; i >= 0; i--) {
                const s = parseNumber(actRows[i]['Saldo'] || actRows[i]['Balance']);
                if (!isNaN(s) && actRows[i]['Saldo'] !== undefined && actRows[i]['Saldo'] !== '-' && actRows[i]['Saldo'] !== '') {
                  latestCash = s;
                  break;
                }
              }
              if (latestCash !== null) {
                setDetectedCash({ amount: latestCash, currency: 'USD', broker: 'eToro' });
              } else {
                setDetectedCash(null);
              }
            }

            parsed = [...etoroTrades, ...etoroCashTx];
          } else {
            // Als CSV formaat
            parsed = rows.map(r => {
              const action = String(r['Action'] || r['Actie'] || r['Type'] || '').trim();
              const isin = String(r['ISIN'] || r['isin'] || '').trim();
              const units = parseNumber(r['Units'] || r['Eenheden'] || r['Quantity'] || r['Aantal']);
              const openRate = parseNumber(r['Open Rate'] || r['Openingskoers'] || r['Price'] || r['Koers']);
              const openDate = r['Open Date'] || r['Openingsdatum'] || r['Date'] || r['Datum'];
              const ticker = action.replace(/^(buy|sell|koop|verkoop)\s+/i, '').trim() || r['Ticker'] || r['Symbol'] || isin;

              if (!ticker || units === 0) return null;
              return {
                ticker: ticker,
                isin: isin || null,
                transaction_type: action.toLowerCase().startsWith('sell') || action.toLowerCase().startsWith('verkoop') ? 'SELL' : 'BUY',
                broker_id: 1,
                _brokerName: 'eToro',
                import_source: 'etoro_statement',
                quantity: Math.abs(units),
                price: Math.abs(openRate),
                purchase_time: parseAnyDate(openDate),
                fees: 0,
                taxes: 0,
                currency: 'USD',
                exchange_rate: 1
              };
            }).filter(Boolean);
          }

        } else if (selectedBroker === 'degiro') {
          // DeGiro Transacties (`Transactions.csv`) of Rekeningoverzicht (`Account.csv`)
          const firstRow = rows[0] || {};
          const isTransactionsFile = Object.keys(firstRow).some(k => k.toLowerCase().includes('aantal') || k.toLowerCase().includes('koers') || k.toLowerCase().includes('beurs'));

          if (isTransactionsFile) {
            parsed = rows.map(r => {
              const product = r['Product'] || r['Product '] || r['Omschrijving'] || r['Description'] || '';
              const isin = r['ISIN'] || r['isin'] || '';
              const rawQty = parseNumber(r['Aantal'] || r['Quantity'] || r['Aantal/Nominaal']);
              const rawPrice = parseNumber(r['Koers'] || r['Price']);
              const rawFees = Math.abs(parseNumber(r['Transactiekosten en/of kosten van derden'] || r['Transactiekosten'] || r['Fees'] || r['Kosten']));
              const dateStr = r['Datum'] || r['Date'];
              const timeStr = r['Tijd'] || r['Time'];

              if (!product && !isin) return null;
              if (rawQty === 0) return null;

              return {
                ticker: product || isin,
                isin: String(isin).trim().toUpperCase(),
                transaction_type: rawQty < 0 ? 'SELL' : 'BUY',
                broker_id: 2,
                _brokerName: 'DeGiro',
                import_source: 'degiro_upload',
                quantity: Math.abs(rawQty),
                price: Math.abs(rawPrice),
                purchase_time: parseDeGiroDate(dateStr, timeStr),
                fees: rawFees,
                taxes: 0,
                currency: r['FX'] || r['Valuta'] || 'EUR',
                exchange_rate: parseNumber(r['Wisselkoers'] || r['FX Rate']) || 1
              };
            }).filter(Boolean);

          } else {
            const grouped = {};
            const cashTransactions = [];

            rows.forEach(row => {
              const orderId = row['Order Id'] || row['Order ID'] || row['Order-ID'] || row['OrderId'] || '';
              const desc = String(row['Omschrijving'] || row['Description'] || '').toLowerCase();
              const mutatieAmtStr = row['Mutatie_amount'] || row['Change_amount'] || row['Mutatie'] || row['Change'] || row['Bedrag'] || row['Amount'] || '';
              const mutatie = parseNumber(mutatieAmtStr);
              const dateStr = row['Datum'] || row['Date'] || '';
              const timeStr = row['Tijd'] || row['Time'] || '';
              const isin = row['ISIN'] ? String(row['ISIN']).trim().toUpperCase() : '';
              const product = row['Product'] || row['Product '] || isin || '';
              const currency = row['FX'] || (row['Mutatie'] && isNaN(parseNumber(row['Mutatie'])) ? row['Mutatie'] : 'EUR') || 'EUR';

              if (!dateStr || mutatie === 0) return;

              if (desc.includes('cash sweep') || desc.includes('geldrekening bij flatex') || desc.includes('valuta creditering') || desc.includes('valuta debitering')) {
                return;
              }

              const isTrade = desc.startsWith('koop') || desc.startsWith('verkoop') || desc.includes('aankoop') || desc.startsWith('buy') || desc.startsWith('sell');
              const isFeeOrTax = desc.includes('belasting') || desc.includes('tax') || desc.includes('kosten') || desc.includes('transactiekosten') || desc.includes('courtage') || desc.includes('fee');
              const isFlatexOrDeposit = desc.includes('flatex deposit') || desc.includes('storting') || desc.includes('ideal') || desc.includes('deposit') || desc.includes('overboeking');
              const isWithdrawal = desc.includes('terugstorting') || desc.includes('opname') || desc.includes('withdrawal');
              const isDiv = desc.includes('dividend') && !desc.includes('belasting') && !desc.includes('tax');

              if (isTrade || (orderId && !isFlatexOrDeposit && !isWithdrawal && !isDiv)) {
                const grpId = orderId || `GEN_${dateStr}_${timeStr}`;
                if (!grouped[grpId]) {
                  grouped[grpId] = { main: null, fees: 0, taxes: 0, type: 'BUY', qty: 0, price: 0 };
                }

                if (isTrade) {
                  grouped[grpId].main = row;
                  grouped[grpId].type = (desc.startsWith('koop') || desc.includes('aankoop') || desc.startsWith('buy')) ? 'BUY' : 'SELL';
                  
                  const match = desc.match(/(koop|verkoop|aankoop|buy|sell)\s+([\d,.]+)\s+@\s+([\d,.]+)/i);
                  if (match) {
                    grouped[grpId].qty = parseNumber(match[2]);
                    grouped[grpId].price = parseNumber(match[3]);
                  }
                } else if (desc.includes('belasting') || desc.includes('tax')) {
                  grouped[grpId].taxes += Math.abs(mutatie);
                } else if (isFeeOrTax) {
                  grouped[grpId].fees += Math.abs(mutatie);
                }
              } else if (isDiv) {
                cashTransactions.push({
                  ticker: product || 'Dividend',
                  aandeel_id: null,
                  isin: isin || null,
                  transaction_type: 'DIVIDEND',
                  broker_id: 2,
                  _brokerName: 'DeGiro',
                  import_source: 'degiro_upload',
                  quantity: Math.abs(mutatie),
                  price: 1,
                  purchase_time: parseDeGiroDate(dateStr, timeStr),
                  fees: 0,
                  taxes: 0,
                  currency: currency,
                  exchange_rate: 1
                });
              } else if (isFlatexOrDeposit || mutatie > 0) {
                let depositTitle = 'Storting (Bank)';
                if (desc.includes('flatex')) depositTitle = 'Flatex Deposit';
                else if (desc.includes('ideal')) depositTitle = 'iDEAL Storting';

                cashTransactions.push({
                  ticker: depositTitle,
                  aandeel_id: null,
                  isin: null,
                  transaction_type: 'DEPOSIT',
                  broker_id: 2,
                  _brokerName: 'DeGiro',
                  import_source: 'degiro_upload',
                  quantity: Math.abs(mutatie),
                  price: 1,
                  purchase_time: parseDeGiroDate(dateStr, timeStr),
                  fees: 0,
                  taxes: 0,
                  currency: currency,
                  exchange_rate: 1
                });
              } else if (isWithdrawal || mutatie < 0) {
                cashTransactions.push({
                  ticker: 'Opname / Terugstorting',
                  aandeel_id: null,
                  isin: null,
                  transaction_type: 'WITHDRAWAL',
                  broker_id: 2,
                  _brokerName: 'DeGiro',
                  import_source: 'degiro_upload',
                  quantity: Math.abs(mutatie),
                  price: 1,
                  purchase_time: parseDeGiroDate(dateStr, timeStr),
                  fees: 0,
                  taxes: 0,
                  currency: currency,
                  exchange_rate: 1
                });
              }
            });

            const tradeTransactions = Object.values(grouped).filter(g => g.main && g.qty > 0).map(g => {
              const r = g.main;
              const product = r['Product'] || r['Product '] || r['ISIN'] || '';
              const isin = r['ISIN'] || '';

              return {
                ticker: product || isin,
                isin: String(isin).trim().toUpperCase(),
                transaction_type: g.type,
                broker_id: 2,
                _brokerName: 'DeGiro',
                import_source: 'degiro_upload',
                quantity: g.qty,
                price: g.price,
                purchase_time: parseDeGiroDate(r['Datum'] || r['Date'], r['Tijd'] || r['Time']),
                fees: g.fees,
                taxes: g.taxes,
                currency: r['FX'] || r['Valuta'] || (r['Mutatie'] && isNaN(parseNumber(r['Mutatie'])) ? r['Mutatie'] : 'EUR') || 'EUR',
                exchange_rate: 1
              };
            });

            parsed = [...tradeTransactions, ...cashTransactions];
          }

        } else {
          // Standaard Generic CSV/Excel
          parsed = rows.map(r => {
            const ticker = r['Ticker'] || r['Symbol'] || r['Aandeel'] || r['Product'];
            const isin = r['ISIN'] || null;
            const qty = parseNumber(r['Quantity'] || r['Shares'] || r['Aantal']);
            const price = parseNumber(r['Price'] || r['Cost Per Share'] || r['Prijs']);
            if (!ticker && !isin) return null;

            return {
              ticker: ticker || isin,
              isin: isin ? String(isin).trim().toUpperCase() : null,
              transaction_type: (r['Type'] || r['Action'] || r['Actie'] || 'BUY').toUpperCase(),
              broker_id: 1,
              _brokerName: selectedBroker.toUpperCase(),
              import_source: `${selectedBroker}_upload`,
              quantity: Math.abs(qty),
              price: Math.abs(price),
              purchase_time: r['Date'] || r['Datum'] ? new Date(r['Date'] || r['Datum']).toISOString() : new Date().toISOString(),
              fees: parseNumber(r['Fees'] || r['Commission'] || 0),
              taxes: parseNumber(r['Tax'] || r['Taxes'] || 0),
              currency: r['Currency'] || r['Valuta'] || 'EUR',
              exchange_rate: parseNumber(r['Exchange Rate'] || 1) || 1
            };
          }).filter(Boolean);
        }

        if (parsed.length === 0) {
          toast.error('Geen geldige transacties kunnen herkennen in dit bestand.');
          return;
        }

        // Duplicaatcontrole tegen bestaande transacties
        const reviewed = parsed.map(row => {
          const rowDateStr = new Date(row.purchase_time).toISOString().split('T')[0];
          const matchingTransactions = (allExistingTransactions || []).filter(t => {
            const tDateStr = new Date(t.purchase_time).toISOString().split('T')[0];
            return tDateStr === rowDateStr;
          });

          const exactMatch = matchingTransactions.find(t => {
            const sameType = t.transaction_type === row.transaction_type;
            const sameStock = (t.ticker_symbol && row.ticker && t.ticker_symbol.toUpperCase() === row.ticker.toUpperCase()) ||
                              (t.name && row.ticker && t.name.toLowerCase().includes(row.ticker.toLowerCase())) ||
                              (t.isin && row.isin && t.isin === row.isin);
            const sameQty = Math.abs(parseFloat(t.quantity) - parseFloat(row.quantity)) < 0.0001;
            const samePrice = Math.abs(parseFloat(t.price) - parseFloat(row.price)) <= 0.05;

            return sameType && (sameStock || sameQty) && samePrice;
          });

          const isDuplicate = !!exactMatch;

          return {
            ...row,
            user_id: uid,
            _isDuplicate: isDuplicate,
            _duplicateMatch: exactMatch,
            _dayReferences: matchingTransactions,
            _selected: !isDuplicate
          };
        });

        setPreviewData(reviewed);
        setShowReview(true);
        toast.success(`${reviewed.length} transacties ingelezen!`);

      } catch (err) {
        console.error('Fout bij verwerken bestand:', err);
        toast.error('Fout bij inlezen van bestand: ' + err.message);
      }
    };

    if (isCsv) {
      reader.readAsText(file);
    } else {
      reader.readAsBinaryString(file);
    }
  };

  const toggleRow = (index) => {
    const updated = [...previewData];
    updated[index]._selected = !updated[index]._selected;
    setPreviewData(updated);
  };

  const selectOnlyNew = () => {
    setPreviewData(previewData.map(r => ({ ...r, _selected: !r._isDuplicate })));
  };

  const selectAll = (val) => {
    setPreviewData(previewData.map(r => ({ ...r, _selected: val })));
  };

  const handleConfirmImport = async () => {
    const toImport = previewData.filter(r => r._selected);
    if (toImport.length === 0 && !detectedCash) {
      toast.error('Geen transacties geselecteerd om toe te voegen.');
      return;
    }

    setLoading(true);
    try {
      // 1. Voeg geselecteerde transacties toe
      if (toImport.length > 0) {
        const res = await http.post('/portfolio/addMultipleTransactions', { transactions: toImport });
        toast.success(res.data?.message || 'Transacties succesvol geïmporteerd!');
      }

      // 2. Synchroniseer gedetecteerd eToro of DeGiro cash saldo direct
      if (detectedCash && detectedCash.amount !== undefined && !isNaN(detectedCash.amount)) {
        try {
          await http.post('/brokers/credentials', {
            brokerName: detectedCash.broker || (selectedBroker === 'etoro' ? 'eToro' : 'Degiro'),
            cashBalance: detectedCash.amount,
            cashCurrency: detectedCash.currency || 'USD',
            userId: uid
          });
          toast.success(`Cash saldo bijgewerkt naar $ ${detectedCash.amount.toFixed(2)}!`);
        } catch (cashErr) {
          console.warn('Kon cash saldo niet automatisch opslaan:', cashErr);
        }
      }

      setShowReview(false);
      onClose();
      if (onImportSuccess) onImportSuccess();
    } catch (err) {
      console.error('Fout bij definitief importeren:', err);
      toast.error(err.response?.data?.message || 'Serverfout bij importeren van transacties.');
    } finally {
      setLoading(false);
    }
  };

  const duplicatesCount = previewData.filter(r => r._isDuplicate).length;
  const newCount = previewData.filter(r => !r._isDuplicate).length;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-slate-50/60">
          <div>
            <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
              <i className="ph-fill ph-plug-charging text-indigo-600"></i>
              Kies je broker & Synchronisatie
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Rekeningoverzicht, bestand of live API — wij zetten al je trades en cash exact klaar.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-gray-200/80 hover:bg-gray-300 text-gray-700 flex items-center justify-center transition-colors"
          >
            <i className="ph-bold ph-x text-lg"></i>
          </button>
        </div>

        {/* Broker Tabs */}
        <div className="px-6 pt-4 pb-2 border-b border-gray-100 flex items-center gap-2 overflow-x-auto bg-white scrollbar-none">
          {BROKERS.map(b => (
            <button
              key={b.id}
              onClick={() => { setSelectedBroker(b.id); setShowReview(false); }}
              className={`px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
                selectedBroker === b.id
                  ? 'bg-slate-900 text-white shadow-md'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
              }`}
            >
              <i className={`ph-bold ${b.icon} text-sm`}></i>
              <span>{b.name}</span>
              {brokerSettings[b.id]?.sync_status === 'ok' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              )}
            </button>
          ))}
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1">
          
          {/* WEERGAVE 1: PRE-IMPORT DUPLICAAT REVIEW SCHERM */}
          {showReview ? (
            <div className="space-y-4">
              
              {/* Gedetecteerd Actueel Saldo Banner */}
              {detectedCash && (
                <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between text-xs text-emerald-950 font-bold shadow-2xs">
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm shadow-xs">
                      $
                    </span>
                    <div>
                      <span>Gedetecteerd actueel eToro Cash Saldo: <strong className="text-emerald-900 text-sm font-black">$ {detectedCash.amount.toFixed(2)}</strong></span>
                      <p className="text-[11px] text-emerald-700 font-normal">Wordt bij bevestigen direct doorgerekend naar je Vrije Cash & Strategie-advies.</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-emerald-800 bg-white px-2.5 py-1 rounded-lg border border-emerald-200 font-bold">
                    Automatisch bijwerken ✓
                  </span>
                </div>
              )}

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100">
                <div>
                  <h3 className="text-base font-extrabold text-indigo-950">
                    Controleer Import ({previewData.length} transacties)
                  </h3>
                  <p className="text-xs text-indigo-700">
                    Duplicaten zijn automatisch herkend en standaard uitgevinkt zodat je database schoon blijft.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                  <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
                    🟢 {newCount} Nieuw
                  </span>
                  {duplicatesCount > 0 && (
                    <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg">
                      🔴 {duplicatesCount} Reeds in DB (Overgeslagen)
                    </span>
                  )}
                  <div className="flex items-center gap-1 border-l border-indigo-200 pl-2">
                    <button
                      type="button"
                      onClick={selectOnlyNew}
                      className="px-2 py-1 bg-white hover:bg-indigo-100 text-indigo-800 rounded border border-indigo-200 text-[11px] font-semibold transition-colors"
                      title="Vink alleen nieuwe transacties en stortingen aan"
                    >
                      Alleen Nieuw
                    </button>
                    <button
                      type="button"
                      onClick={() => selectAll(true)}
                      className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-700 rounded border border-gray-200 text-[11px] font-semibold transition-colors"
                    >
                      Alles
                    </button>
                    <button
                      type="button"
                      onClick={() => selectAll(false)}
                      className="px-2 py-1 bg-white hover:bg-gray-100 text-gray-700 rounded border border-gray-200 text-[11px] font-semibold transition-colors"
                    >
                      Niets
                    </button>
                  </div>
                </div>
              </div>

              {/* Tabel met rijen */}
              <div className="border border-gray-200 rounded-2xl overflow-hidden max-h-72 overflow-y-auto text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-gray-500 font-bold uppercase tracking-wider sticky top-0 border-b border-gray-200">
                    <tr>
                      <th className="py-2.5 px-3 text-center">Import</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Datum</th>
                      <th className="py-2.5 px-3">Aandeel / ISIN</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-right">Aantal</th>
                      <th className="py-2.5 px-3 text-right">Koers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewData.map((row, idx) => (
                      <tr key={idx} className={row._isDuplicate ? 'bg-rose-50/50' : 'hover:bg-gray-50'}>
                        <td className="py-2.5 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={row._selected}
                            onChange={() => toggleRow(idx)}
                            className="w-4 h-4 text-indigo-600 rounded"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-bold">
                          {row._isDuplicate ? (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 rounded text-[10px]">
                              Reeds in DB
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px]">
                              Nieuw
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-gray-600">
                          {new Date(row.purchase_time).toLocaleDateString('nl-BE')}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-gray-900">
                          {row.ticker}
                          {row.isin && <span className="text-[10px] text-gray-400 block font-normal">{row.isin}</span>}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] ${
                            row.transaction_type === 'BUY' ? 'bg-emerald-100 text-emerald-800' :
                            row.transaction_type === 'SELL' ? 'bg-rose-100 text-rose-800' :
                            row.transaction_type === 'DEPOSIT' ? 'bg-blue-100 text-blue-800' :
                            row.transaction_type === 'WITHDRAWAL' ? 'bg-amber-100 text-amber-800' :
                            'bg-purple-100 text-purple-800'
                          }`}>
                            {row.transaction_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-800">
                          {row.transaction_type === 'DEPOSIT' || row.transaction_type === 'WITHDRAWAL' ? `$${row.quantity.toFixed(2)}` : row.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900">
                          {row.transaction_type === 'DEPOSIT' || row.transaction_type === 'WITHDRAWAL' ? '-' : `$${row.price.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => setShowReview(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs"
                >
                  Terug
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={loading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md text-xs transition-all disabled:opacity-50"
                >
                  {loading ? 'Bezig met importeren...' : `Bevestig Import (${previewData.filter(r => r._selected).length} transacties)`}
                </button>
              </div>
            </div>

          ) : selectedBroker === 'etoro' ? (
            /* WEERGAVE 2: ETORO REKENINGOVERZICHT & API KOPPELING */
            <div className="max-w-2xl mx-auto space-y-6">
              
              {/* 1. DIRECTE CASH SALDO AANPASSING */}
              <div className="p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 rounded-3xl border border-emerald-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center text-lg font-black">
                      $
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-emerald-950">eToro Vrije Cash Aanpassen</h3>
                      <p className="text-[11px] text-emerald-700">Pas direct je actuele cash saldo aan na recente aan- of verkopen.</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-emerald-900 bg-white px-2.5 py-1 rounded-lg border border-emerald-200">
                    Huidig: ${brokerSettings['etoro']?.cash_balance ? parseFloat(brokerSettings['etoro'].cash_balance).toFixed(2) : '1.79'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={etoroCashInput}
                      onChange={(e) => setEtoroCashInput(e.target.value)}
                      placeholder="bijv. 150.00"
                      className="w-full pl-7 pr-3 py-2 bg-white border border-emerald-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveCash('eToro', etoroCashInput, 'USD')}
                    disabled={loading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl shadow-xs text-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <i className="ph-bold ph-floppy-disk text-sm"></i>
                    Cash Opslaan
                  </button>
                </div>
              </div>

              {/* 2. REKENINGOVERZICHT UPLOAD (AANBEVOLEN VOOR ETORO) */}
              <div className="p-6 bg-slate-50/80 rounded-3xl border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                      <i className="ph-fill ph-file-arrow-up text-indigo-600"></i>
                      eToro Rekeningoverzicht (.xlsx of .csv) Uploaden
                    </h3>
                    <p className="text-xs text-gray-500">
                      Importeert al je recente trades, stortingen en winsten 100% exact in het grootboek.
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-bold rounded-full">
                    Aanbevolen
                  </span>
                </div>

                {/* Drag & drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={`p-6 rounded-2xl border-2 border-dashed transition-all flex flex-col items-center justify-center space-y-3 ${
                    dragActive ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-300 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-xl">
                    <i className="ph-bold ph-upload-simple"></i>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-gray-800 text-xs">Sleep je eToro Account Statement hierheen</div>
                    <div className="text-[11px] text-gray-400 mt-0.5">Ondersteunt .xlsx en .csv exports uit eToro</div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center gap-1.5"
                  >
                    <i className="ph-bold ph-folder-open"></i>
                    Kies eToro Bestand
                  </button>
                </div>

                <div className="p-3 bg-white rounded-xl border border-gray-200 text-[11px] text-gray-600 space-y-1">
                  <div className="font-bold text-gray-800">Hoe download je dit uit eToro?</div>
                  <div className="text-gray-500">
                    1. Ga in eToro naar <strong>Portfolio → Geschiedenis (klokje)</strong>.<br />
                    2. Klik rechtsboven op het <strong>tandwiel ⚙️ → Rekeningoverzicht (Account Statement)</strong>.<br />
                    3. Kies de gewenste periode en download als <strong>Excel (.xlsx)</strong>.
                  </div>
                </div>
              </div>

              {/* 3. API KOPPELING */}
              <div className="p-6 bg-white rounded-3xl border border-gray-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                      <i className="ph-fill ph-plug text-slate-700"></i>
                      eToro API Sleutels Koppeling
                    </h3>
                    <p className="text-xs text-gray-500">
                      Directe synchronisatie via de eToro Open API.
                    </p>
                  </div>
                  {currentSettings?.api_key_masked && (
                    <button
                      onClick={handleSyncEtoro}
                      disabled={syncing}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <i className={`ph-bold ph-arrows-clockwise ${syncing ? 'animate-spin' : ''}`}></i>
                      {syncing ? 'Bezig...' : 'Nu ophalen'}
                    </button>
                  )}
                </div>

                {currentSettings?.api_key_masked && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-gray-200 flex items-center justify-between text-xs">
                    <span className="text-gray-600">Gekoppelde sleutel: <strong>{currentSettings.api_key_masked}</strong></span>
                    <button
                      onClick={() => handleDisconnect('eToro')}
                      className="text-rose-600 hover:text-rose-700 font-bold text-xs"
                    >
                      Ontkoppelen
                    </button>
                  </div>
                )}

                <form onSubmit={handleSaveEtoro} className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-black text-gray-600 uppercase tracking-wider mb-1">
                      API-SLEUTEL
                    </label>
                    <input
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Plak hier je eToro API sleutel"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-gray-600 uppercase tracking-wider mb-1">
                      USER KEY
                    </label>
                    <input
                      type="password"
                      value={userKey}
                      onChange={(e) => setUserKey(e.target.value)}
                      placeholder="Plak hier je eToro User key"
                      className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-xs text-xs transition-all disabled:opacity-50"
                  >
                    {loading ? 'Bezig...' : 'Sleutels Opslaan'}
                  </button>
                </form>
              </div>

            </div>

          ) : selectedBroker === 'degiro' ? (
            /* WEERGAVE 3: DEGIRO MET CASH SALDO EN BESTANDSUPLOAD */
            <div className="max-w-2xl mx-auto space-y-6">
              
              {/* Directe DeGiro Cash Saldo Aanpassing */}
              <div className="p-5 bg-gradient-to-r from-blue-50 via-indigo-50 to-blue-50 rounded-3xl border border-blue-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-800 flex items-center justify-center text-lg font-black">
                      €
                    </span>
                    <div>
                      <h3 className="text-sm font-black text-blue-950">DeGiro Vrije Cash Aanpassen</h3>
                      <p className="text-[11px] text-blue-700">Pas direct je actuele cash saldo aan na recente aan- of verkopen.</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-blue-900 bg-white px-2.5 py-1 rounded-lg border border-blue-200">
                    Huidig: €{brokerSettings['degiro']?.cash_balance ? parseFloat(brokerSettings['degiro'].cash_balance).toFixed(2) : '316.84'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">€</span>
                    <input
                      type="number"
                      step="0.01"
                      value={degiroCashInput}
                      onChange={(e) => setDegiroCashInput(e.target.value)}
                      placeholder="bijv. 350.00"
                      className="w-full pl-7 pr-3 py-2 bg-white border border-blue-300 rounded-xl text-sm font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveCash('Degiro', degiroCashInput, 'EUR')}
                    disabled={loading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs text-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <i className="ph-bold ph-floppy-disk text-sm"></i>
                    Cash Opslaan
                  </button>
                </div>
              </div>

              {/* DeGiro Bestands Drag & Drop */}
              <div className="space-y-4">
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={`p-8 rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center space-y-4 ${
                    dragActive ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-300 bg-slate-50/50 hover:bg-slate-50'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl shadow-inner">
                    <i className="ph-bold ph-upload-simple"></i>
                  </div>

                  <div className="text-center">
                    <div className="font-bold text-gray-800 text-sm">
                      Sleep je DeGiro exportbestand hierheen
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Ondersteunt Rekeningoverzicht / Transacties (.csv, .xlsx en .xls)
                    </div>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv, .xlsx, .xls"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md text-xs transition-all flex items-center gap-2"
                  >
                    <i className="ph-bold ph-folder-open"></i>
                    Kies DeGiro Exportbestand
                  </button>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-gray-200 text-left text-xs text-gray-700 space-y-1.5">
                  <div className="font-extrabold text-gray-900">Hoe download je het juiste bestand uit DeGiro?</div>
                  <ol className="list-decimal list-inside space-y-1 text-gray-600 leading-relaxed text-[11px]">
                    <li>Log in op DeGiro via de website (<strong>trader.degiro.nl</strong>).</li>
                    <li>Ga naar <strong>Inbox → Rekeningoverzicht</strong> (of <strong>Transacties</strong>).</li>
                    <li>Kies als begindatum een datum vóór je allereerste transactie.</li>
                    <li>Exporteer als <strong>CSV of Excel</strong> en sleep het bestand hierboven.</li>
                  </ol>
                </div>
              </div>

            </div>

          ) : (
            /* WEERGAVE 4: TRADING 212 / IBKR / OVERIGE BESTANDSUPLOAD */
            <div className="max-w-2xl mx-auto space-y-6 text-center">
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-gray-900">
                  {BROKERS.find(b => b.id === selectedBroker)?.name}
                </h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto">
                  ✓ Volledig automatisch — inclusief cash, dividend en splitsingen.
                </p>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={`p-8 rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center space-y-4 ${
                  dragActive ? 'border-indigo-600 bg-indigo-50/50' : 'border-gray-300 bg-slate-50/50 hover:bg-slate-50'
                }`}
              >
                <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl shadow-inner">
                  <i className="ph-bold ph-upload-simple"></i>
                </div>

                <div>
                  <div className="font-bold text-gray-800 text-sm">
                    Sleep je exportbestand hierheen
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    Ondersteunt .csv, .xlsx en .xls
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl shadow-lg shadow-indigo-500/25 text-xs transition-all flex items-center gap-2"
                >
                  <i className="ph-bold ph-folder-open"></i>
                  Kies je exportbestand
                </button>
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
};

export default BrokerSyncModal;
