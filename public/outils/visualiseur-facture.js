(() => {
'use strict';
/* ============ Aides DOM ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Construit un élément sans jamais passer par innerHTML : le contenu d'une facture n'est pas fiable.
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === '') continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// Code EN 16931 (BT-xx), visible seulement quand le bouton « Codes BT » est actif.
const BT = code => (code ? h('span', { class: 'bt', 'aria-hidden': 'true' }, code) : null);

/* ============ Lecture XML indépendante des préfixes de namespace ============ */
function find(el, path) {
  let cur = el || null;
  for (const name of path.split('/')) {
    if (!cur) return null;
    cur = Array.prototype.find.call(cur.children, c => c.localName === name) || null;
  }
  return cur;
}
function findAll(el, path) {
  let cur = el ? [el] : [];
  for (const name of path.split('/')) {
    cur = cur.flatMap(n => Array.prototype.filter.call(n.children, c => c.localName === name));
  }
  return cur;
}
const txt = (el, path) => {
  const n = path ? find(el, path) : el;
  return n ? n.textContent.trim() : '';
};
const attr = (el, path, name) => {
  const n = path ? find(el, path) : el;
  return n ? (n.getAttribute(name) || '') : '';
};

/* ============ Formats ============ */
const nfCache = new Map();
function nf(min, max, cur) {
  const key = `${min}|${max}|${cur || ''}`;
  let f = nfCache.get(key);
  if (!f) {
    const opts = { minimumFractionDigits: min, maximumFractionDigits: max };
    try { f = new Intl.NumberFormat('fr-FR', cur ? { ...opts, style: 'currency', currency: cur } : opts); }
    catch { f = new Intl.NumberFormat('fr-FR', opts); }
    nfCache.set(key, f);
  }
  return f;
}
const isNum = s => s !== '' && s != null && Number.isFinite(Number(s));
const decs = s => { const m = /\.(\d+)\s*$/.exec(String(s).trim()); return m ? m[1].length : 0; };

// Quantités : on garde la précision du fichier, sans zéros inutiles.
function fmtNum(s, min = 0, max) {
  if (!isNum(s)) return s || '';
  return nf(min, Math.min(Math.max(max ?? decs(s), min), 10)).format(Number(s));
}
// Montants : au moins 2 décimales, davantage si le fichier en porte (prix unitaires).
const fmtNumAmt = s => (isNum(s) ? nf(2, Math.min(Math.max(2, decs(s)), 8)).format(Number(s)) : (s || ''));
const fmtAmt = (s, cur) => (isNum(s) ? nf(2, Math.min(Math.max(2, decs(s)), 8), cur).format(Number(s)) : (s || ''));
const fmtPct = s => (isNum(s) ? `${nf(0, 2).format(Number(s))} %` : (s || ''));
const round2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const fmtBytes = n => (n < 1024 ? `${n} o` : n < 1048576 ? `${nf(1, 1).format(n / 1024)} Ko` : `${nf(1, 1).format(n / 1048576)} Mo`);

// Dates : on normalise en AAAA-MM-JJ (ou AAAA-MM, AAAA-Wss) puis on affiche JJ/MM/AAAA.
function normDate(raw, format) {
  raw = (raw || '').trim();
  if (!raw) return '';
  let m;
  if (format === '610' && (m = /^(\d{4})(\d{2})$/.exec(raw))) return `${m[1]}-${m[2]}`;
  if (format === '616' && (m = /^(\d{4})(\d{2})$/.exec(raw))) return `${m[1]}-W${m[2]}`;
  if ((m = /^(\d{4})(\d{2})(\d{2})(?:\d{4,6})?$/.exec(raw))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = /^(\d{4}-\d{2}-\d{2})/.exec(raw))) return m[1];
  return raw;
}
function fmtDate(iso) {
  if (!iso) return '';
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso))) return `${m[3]}/${m[2]}/${m[1]}`;
  if ((m = /^(\d{4})-(\d{2})$/.exec(iso))) return `${m[2]}/${m[1]}`;
  if ((m = /^(\d{4})-W(\d{2})$/.exec(iso))) return `semaine ${m[2]} de ${m[1]}`;
  return iso;
}

let regionNames = null;
function countryName(code) {
  if (!code) return '';
  try {
    regionNames = regionNames || new Intl.DisplayNames(['fr'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) || code;
  } catch { return code; }
}

/* ============ Référentiels (libellés français) ============ */
const DOC_TYPES = {
  '80': 'Note de débit (biens ou services)', '82': 'Facture de services mesurés', '84': 'Note de débit (ajustements financiers)',
  '261': 'Autofacture d’avoir', '262': 'Avoir global', '295': 'Facture de variation de prix', '296': 'Avoir de variation de prix',
  '325': 'Facture pro forma', '326': 'Facture partielle', '380': 'Facture', '381': 'Avoir', '383': 'Note de débit', '384': 'Facture rectificative',
  '385': 'Facture récapitulative', '386': 'Facture d’acompte', '387': 'Facture de location', '388': 'Facture fiscale', '389': 'Autofacture',
  '393': 'Facture affacturée', '394': 'Facture de crédit-bail', '395': 'Facture de dépôt-vente', '396': 'Avoir affacturé',
  '456': 'Avis de débit', '457': 'Annulation de débit', '458': 'Annulation de crédit', '527': 'Note de débit d’autofacturation',
  '575': 'Facture d’assureur', '623': 'Facture de transitaire', '633': 'Frais portuaires', '751': 'Facture à des fins comptables',
  '780': 'Facture de fret', '875': 'Facture de travaux (partielle)', '876': 'Facture de travaux (finale partielle)',
  '877': 'Facture de travaux (finale)', '935': 'Facture douanière',
};
const CREDIT_CODES = new Set(['81', '83', '261', '262', '296', '308', '381', '396', '420', '458', '532']);

const VAT_CATS = {
  S: 'Taux normal', Z: 'Taux zéro', E: 'Exonéré', AE: 'Autoliquidation', K: 'Livraison intracommunautaire',
  G: 'Export hors UE', O: 'Hors champ de la TVA', L: 'IGIC (Canaries)', M: 'IPSI (Ceuta, Melilla)',
};
// Codes CII (5, 29, 72) et UBL (3, 35, 432) pour la date d'exigibilité de la TVA (BT-8).
const VAT_DUE = {
  '5': 'à la date d’émission de la facture', '29': 'à la date de livraison', '72': 'à la date de paiement (encaissements)',
  '3': 'à la date d’émission de la facture', '35': 'à la date de livraison', '432': 'à la date de paiement (encaissements)',
};

const PAY_MEANS = {
  '1': 'Moyen non défini', '10': 'Espèces', '20': 'Chèque', '30': 'Virement', '31': 'Virement de débit', '42': 'Paiement sur compte bancaire',
  '48': 'Carte bancaire', '49': 'Prélèvement', '54': 'Carte de crédit', '55': 'Carte de débit', '57': 'Accord permanent',
  '58': 'Virement SEPA', '59': 'Prélèvement SEPA', '97': 'Compensation', ZZZ: 'Moyen convenu entre les parties',
};

// [singulier, pluriel] ; le pluriel s'applique à partir de 2.
const UNITS = {
  C62: ['unité', 'unités'], H87: ['pièce', 'pièces'], EA: ['unité', 'unités'], HUR: ['h', 'h'], DAY: ['jour', 'jours'],
  WEE: ['semaine', 'semaines'], MON: ['mois', 'mois'], ANN: ['an', 'ans'], MIN: ['min', 'min'], SEC: ['s', 's'],
  KGM: ['kg', 'kg'], GRM: ['g', 'g'], TNE: ['t', 't'], LTR: ['l', 'l'], MLT: ['ml', 'ml'], MTR: ['m', 'm'], CMT: ['cm', 'cm'],
  MMT: ['mm', 'mm'], KMT: ['km', 'km'], MTK: ['m²', 'm²'], MTQ: ['m³', 'm³'], KWH: ['kWh', 'kWh'], SET: ['lot', 'lots'],
  NPR: ['paire', 'paires'], LS: ['forfait', 'forfaits'], P1: ['%', '%'], NAR: ['article', 'articles'], PCE: ['pièce', 'pièces'],
  PR: ['paire', 'paires'], PK: ['colis', 'colis'], BX: ['boîte', 'boîtes'], MWH: ['MWh', 'MWh'], NIU: ['unité', 'unités'],
};
function unitLabel(code, qty) {
  if (!code) return '';
  const u = UNITS[code];
  if (!u) return code;
  return Math.abs(Number(qty)) >= 2 ? u[1] : u[0];
}

const ID_SCHEMES = {
  '0002': 'SIREN', '0009': 'SIRET', '0060': 'DUNS', '0088': 'GLN', '0106': 'KvK (Pays-Bas)', '0130': 'Commission européenne',
  '0160': 'GTIN', '0190': 'OIN (Pays-Bas)', '0192': 'N° d’organisation (Norvège)', '0199': 'LEI', '0204': 'Leitweg-ID (Allemagne)',
  '0208': 'N° d’entreprise (Belgique)', '0225': 'Adresse électronique', SEPA: 'Identifiant créancier SEPA', EM: 'E-mail',
};
const idLabel = scheme => ID_SCHEMES[scheme] || '';

const NOTE_SUBJECTS = {
  AAI: 'Information générale', SUR: 'Remarque du vendeur', REG: 'Information réglementaire', ABL: 'Mention légale',
  TXD: 'Information fiscale', CUS: 'Information douanière', PMT: 'Indemnité de recouvrement', PMD: 'Pénalités de retard', AAB: 'Escompte',
};

const fmtIban = s => (s ? s.replace(/\s+/g, '').replace(/(.{4})(?=.)/g, '$1 ') : '');
function fmtId(x) {
  if (!x || !x.id) return '';
  if (x.scheme === '0002' && /^\d{9}$/.test(x.id)) return x.id.replace(/^(\d{3})(\d{3})(\d{3})$/, '$1 $2 $3');
  if ((x.scheme === '0009' || x.scheme === '0002') && /^\d{14}$/.test(x.id)) return x.id.replace(/^(\d{3})(\d{3})(\d{3})(\d{5})$/, '$1 $2 $3 $4');
  return x.id;
}
function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
const safeName = s => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'piece-jointe';

function profileOf(inv) {
  const g = (inv.guideline || '').toLowerCase();
  if (g.includes('extended-ctc-fr')) return inv.syntax === 'CII' ? 'Factur-X EXTENDED-CTC-FR' : 'EXTENDED-CTC-FR';
  if (g.includes('factur-x.eu:1p0:minimum')) return 'Factur-X MINIMUM';
  if (g.includes('basicwl')) return 'Factur-X BASIC WL';
  if (g.includes('factur-x') && g.includes('extended')) return 'Factur-X EXTENDED';
  if (g.includes('factur-x') && g.includes('basic')) return 'Factur-X BASIC';
  if (g.includes('xrechnung')) return 'XRechnung';
  if (g.includes('zugferd')) return 'ZUGFeRD';
  if (g.includes('peppol')) return 'Peppol BIS Billing 3.0';
  if (g.includes('factur-x')) return 'Factur-X EN 16931';
  if (g.includes('en16931')) return inv.syntax === 'CII' ? 'Factur-X EN 16931' : 'EN 16931';
  return inv.guideline || 'Profil non précisé';
}
const typeLabel = inv => DOC_TYPES[inv.typeCode] || (inv.isCredit ? 'Avoir' : 'Facture');

/* ============ Modèle commun (EN 16931) alimenté par CII ou UBL ============ */
function blankInvoice(syntax) {
  return {
    syntax, guideline: '', process: '', typeCode: '', isCredit: false, minimal: false,
    number: '', issueDate: '', dueDate: '', taxPointDate: '', currency: '', taxCurrency: '',
    notes: [], refs: {}, objectRef: null, prevInvoices: [], period: { start: '', end: '' },
    seller: null, buyer: null, payee: null, taxRep: null, delivery: null,
    payments: [], paymentTerms: [], payRef: '', creditorRef: '', mandate: '',
    docAC: [], vat: [], totals: {}, lines: [], attachments: [],
  };
}
function finish(inv, isCreditNote) {
  inv.isCredit = isCreditNote || CREDIT_CODES.has(inv.typeCode);
  inv.minimal = /:(minimum|basicwl)$/i.test(inv.guideline);
  return inv;
}

/* ---------- CII (Factur-X, ZUGFeRD 2.x) ---------- */
function ciiDate(el) {
  if (!el) return '';
  const s = find(el, 'DateTimeString') || find(el, 'DateTime');
  return s ? normDate(s.textContent, s.getAttribute('format') || '') : '';
}
const addrCII = a => (a ? {
  l1: txt(a, 'LineOne'), l2: txt(a, 'LineTwo'), l3: txt(a, 'LineThree'), city: txt(a, 'CityName'),
  zip: txt(a, 'PostcodeCode'), sub: txt(a, 'CountrySubDivisionName'), country: txt(a, 'CountryID'),
} : null);
const acCII = n => ({
  charge: txt(n, 'ChargeIndicator/Indicator') === 'true', amount: txt(n, 'ActualAmount'), base: txt(n, 'BasisAmount'),
  percent: txt(n, 'CalculationPercent'), reason: txt(n, 'Reason'), reasonCode: txt(n, 'ReasonCode'),
  vatCat: txt(n, 'CategoryTradeTax/CategoryCode'), vatRate: txt(n, 'CategoryTradeTax/RateApplicablePercent'),
});
function partyCII(p) {
  if (!p) return null;
  const legal = find(p, 'SpecifiedLegalOrganization');
  const c = find(p, 'DefinedTradeContact');
  const regs = findAll(p, 'SpecifiedTaxRegistration/ID').map(n => ({ scheme: n.getAttribute('schemeID') || '', id: n.textContent.trim() }));
  const uri = find(p, 'URIUniversalCommunication/URIID');
  return {
    name: txt(p, 'Name'),
    tradeName: txt(legal, 'TradingBusinessName'),
    legalForm: txt(p, 'Description'),
    legalId: legal && txt(legal, 'ID') ? { id: txt(legal, 'ID'), scheme: attr(legal, 'ID', 'schemeID') } : null,
    ids: [...findAll(p, 'ID'), ...findAll(p, 'GlobalID')]
      .map(n => ({ id: n.textContent.trim(), scheme: n.getAttribute('schemeID') || '' })).filter(x => x.id),
    vatId: (regs.find(r => r.scheme === 'VA') || {}).id || '',
    taxRegs: regs.filter(r => r.scheme !== 'VA' && r.id),
    endpoint: uri && uri.textContent.trim() ? { id: uri.textContent.trim(), scheme: uri.getAttribute('schemeID') || '' } : null,
    address: addrCII(find(p, 'PostalTradeAddress')),
    contact: {
      name: txt(c, 'PersonName') || txt(c, 'DepartmentName'),
      phone: txt(c, 'TelephoneUniversalCommunication/CompleteNumber'),
      email: txt(c, 'EmailURIUniversalCommunication/URIID'),
    },
  };
}

function parseCII(root) {
  const inv = blankInvoice('CII');
  const ctx = find(root, 'ExchangedDocumentContext');
  const doc = find(root, 'ExchangedDocument');
  const trx = find(root, 'SupplyChainTradeTransaction');
  const agr = find(trx, 'ApplicableHeaderTradeAgreement');
  const dlv = find(trx, 'ApplicableHeaderTradeDelivery');
  const stl = find(trx, 'ApplicableHeaderTradeSettlement');
  const sum = find(stl, 'SpecifiedTradeSettlementHeaderMonetarySummation');

  inv.guideline = txt(ctx, 'GuidelineSpecifiedDocumentContextParameter/ID');
  inv.process = txt(ctx, 'BusinessProcessSpecifiedDocumentContextParameter/ID');
  inv.number = txt(doc, 'ID');
  inv.typeCode = txt(doc, 'TypeCode');
  inv.issueDate = ciiDate(find(doc, 'IssueDateTime'));
  inv.notes = findAll(doc, 'IncludedNote').map(n => ({ code: txt(n, 'SubjectCode'), text: txt(n, 'Content') })).filter(n => n.text);
  inv.currency = txt(stl, 'InvoiceCurrencyCode');
  inv.taxCurrency = txt(stl, 'TaxCurrencyCode');
  inv.payRef = txt(stl, 'PaymentReference');
  inv.creditorRef = txt(stl, 'CreditorReferenceID');

  const R = inv.refs;
  R.buyerRef = txt(agr, 'BuyerReference');
  R.order = txt(agr, 'BuyerOrderReferencedDocument/IssuerAssignedID');
  R.salesOrder = txt(agr, 'SellerOrderReferencedDocument/IssuerAssignedID');
  R.contract = txt(agr, 'ContractReferencedDocument/IssuerAssignedID');
  R.project = txt(agr, 'SpecifiedProcuringProject/ID');
  R.despatch = txt(dlv, 'DespatchAdviceReferencedDocument/IssuerAssignedID');
  R.receipt = txt(dlv, 'ReceivingAdviceReferencedDocument/IssuerAssignedID');
  R.accounting = txt(stl, 'ReceivableSpecifiedTradeAccountingAccount/ID');
  inv.prevInvoices = findAll(stl, 'InvoiceReferencedDocument')
    .map(d => ({ id: txt(d, 'IssuerAssignedID'), date: ciiDate(find(d, 'FormattedIssueDateTime')) }));
  inv.period = { start: ciiDate(find(stl, 'BillingSpecifiedPeriod/StartDateTime')), end: ciiDate(find(stl, 'BillingSpecifiedPeriod/EndDateTime')) };

  inv.seller = partyCII(find(agr, 'SellerTradeParty'));
  inv.buyer = partyCII(find(agr, 'BuyerTradeParty'));
  inv.taxRep = partyCII(find(agr, 'SellerTaxRepresentativeTradeParty'));
  inv.payee = partyCII(find(stl, 'PayeeTradeParty'));

  const ship = find(dlv, 'ShipToTradeParty');
  const shipDate = ciiDate(find(dlv, 'ActualDeliverySupplyChainEvent/OccurrenceDateTime'));
  if (ship || shipDate) {
    inv.delivery = { name: txt(ship, 'Name'), id: txt(ship, 'ID'), address: addrCII(find(ship, 'PostalTradeAddress')), date: shipDate };
  }

  inv.payments = findAll(stl, 'SpecifiedTradeSettlementPaymentMeans').map(pm => ({
    code: txt(pm, 'TypeCode'), info: txt(pm, 'Information'),
    iban: txt(pm, 'PayeePartyCreditorFinancialAccount/IBANID') || txt(pm, 'PayeePartyCreditorFinancialAccount/ProprietaryID'),
    accountName: txt(pm, 'PayeePartyCreditorFinancialAccount/AccountName'),
    bic: txt(pm, 'PayeeSpecifiedCreditorFinancialInstitution/BICID'),
    card: txt(pm, 'ApplicableTradeSettlementFinancialCard/ID'),
    cardHolder: txt(pm, 'ApplicableTradeSettlementFinancialCard/CardholderName'),
    payerIban: txt(pm, 'PayerPartyDebtorFinancialAccount/IBANID'),
  }));
  inv.paymentTerms = findAll(stl, 'SpecifiedTradePaymentTerms')
    .map(t => ({ text: txt(t, 'Description'), dueDate: ciiDate(find(t, 'DueDateDateTime')) }));
  inv.dueDate = (inv.paymentTerms.find(t => t.dueDate) || {}).dueDate || '';
  inv.mandate = txt(stl, 'SpecifiedTradePaymentTerms/DirectDebitMandateID');

  inv.docAC = findAll(stl, 'SpecifiedTradeAllowanceCharge').map(acCII);
  inv.vat = findAll(stl, 'ApplicableTradeTax').map(t => ({
    cat: txt(t, 'CategoryCode'), rate: txt(t, 'RateApplicablePercent'), basis: txt(t, 'BasisAmount'), amount: txt(t, 'CalculatedAmount'),
    reason: txt(t, 'ExemptionReason'), reasonCode: txt(t, 'ExemptionReasonCode'), dueCode: txt(t, 'DueDateTypeCode'),
  }));

  const T = inv.totals;
  T.lines = txt(sum, 'LineTotalAmount');
  T.charges = txt(sum, 'ChargeTotalAmount');
  T.allowances = txt(sum, 'AllowanceTotalAmount');
  T.net = txt(sum, 'TaxBasisTotalAmount');
  const taxTotals = findAll(sum, 'TaxTotalAmount');
  const mainTax = taxTotals.find(n => !n.getAttribute('currencyID') || n.getAttribute('currencyID') === inv.currency) || taxTotals[0];
  const altTax = taxTotals.find(n => n !== mainTax);
  T.tax = mainTax ? mainTax.textContent.trim() : '';
  T.taxAlt = altTax ? altTax.textContent.trim() : '';
  T.taxAltCur = altTax ? altTax.getAttribute('currencyID') || '' : '';
  T.rounding = txt(sum, 'RoundingAmount');
  T.gross = txt(sum, 'GrandTotalAmount');
  T.prepaid = txt(sum, 'TotalPrepaidAmount');
  T.due = txt(sum, 'DuePayableAmount');

  inv.lines = findAll(trx, 'IncludedSupplyChainTradeLineItem').map(li => {
    const prod = find(li, 'SpecifiedTradeProduct');
    const lag = find(li, 'SpecifiedLineTradeAgreement');
    const lst = find(li, 'SpecifiedLineTradeSettlement');
    const netP = find(lag, 'NetPriceProductTradePrice');
    const grossP = find(lag, 'GrossPriceProductTradePrice');
    const q = find(li, 'SpecifiedLineTradeDelivery/BilledQuantity');
    const tax = find(lst, 'ApplicableTradeTax');
    return {
      id: txt(li, 'AssociatedDocumentLineDocument/LineID'),
      note: findAll(li, 'AssociatedDocumentLineDocument/IncludedNote/Content').map(n => n.textContent.trim()).filter(Boolean).join('\n'),
      name: txt(prod, 'Name'), desc: txt(prod, 'Description'),
      sellerId: txt(prod, 'SellerAssignedID'), buyerId: txt(prod, 'BuyerAssignedID'),
      std: findAll(prod, 'GlobalID').map(n => ({ id: n.textContent.trim(), scheme: n.getAttribute('schemeID') || '' })),
      origin: txt(prod, 'OriginTradeCountry/ID'),
      classes: findAll(prod, 'DesignatedProductClassification/ClassCode').map(n => ({ code: n.textContent.trim(), list: n.getAttribute('listID') || '' })),
      props: findAll(prod, 'ApplicableProductCharacteristic').map(c => ({ name: txt(c, 'Description'), value: txt(c, 'Value') })),
      qty: q ? q.textContent.trim() : '', unit: q ? q.getAttribute('unitCode') || '' : '',
      price: txt(netP, 'ChargeAmount'), priceBase: txt(netP, 'BasisQuantity'), priceBaseUnit: attr(netP, 'BasisQuantity', 'unitCode'),
      grossPrice: txt(grossP, 'ChargeAmount'), priceDiscount: txt(grossP, 'AppliedTradeAllowanceCharge/ActualAmount'),
      net: txt(lst, 'SpecifiedTradeSettlementLineMonetarySummation/LineTotalAmount'),
      vatCat: txt(tax, 'CategoryCode'), vatRate: txt(tax, 'RateApplicablePercent'),
      orderLine: txt(lag, 'BuyerOrderReferencedDocument/LineID'),
      acct: txt(lst, 'ReceivableSpecifiedTradeAccountingAccount/ID'),
      periodStart: ciiDate(find(lst, 'BillingSpecifiedPeriod/StartDateTime')), periodEnd: ciiDate(find(lst, 'BillingSpecifiedPeriod/EndDateTime')),
      acs: findAll(lst, 'SpecifiedTradeAllowanceCharge').map(acCII),
    };
  });

  findAll(agr, 'AdditionalReferencedDocument').forEach(d => {
    const type = txt(d, 'TypeCode');
    const id = txt(d, 'IssuerAssignedID');
    if (type === '130') { inv.objectRef = { id, scheme: txt(d, 'ReferenceTypeCode') }; return; }
    if (type === '50') { R.tender = id; return; }
    const bin = find(d, 'AttachmentBinaryObject');
    inv.attachments.push({
      id, desc: txt(d, 'Name'), uri: txt(d, 'URIID'),
      mime: bin ? bin.getAttribute('mimeCode') || '' : '', filename: bin ? bin.getAttribute('filename') || '' : '',
      b64: bin ? bin.textContent.replace(/\s+/g, '') : '',
    });
  });

  return finish(inv, false);
}

/* ---------- UBL 2.1 (Invoice, CreditNote, Peppol BIS 3.0, XRechnung) ---------- */
const addrUBL = a => (a ? {
  l1: txt(a, 'StreetName'), l2: txt(a, 'AdditionalStreetName'), l3: txt(a, 'AddressLine/Line'), city: txt(a, 'CityName'),
  zip: txt(a, 'PostalZone'), sub: txt(a, 'CountrySubentity'), country: txt(a, 'Country/IdentificationCode'),
} : null);
const acUBL = n => ({
  charge: txt(n, 'ChargeIndicator') === 'true', amount: txt(n, 'Amount'), base: txt(n, 'BaseAmount'),
  percent: txt(n, 'MultiplierFactorNumeric'), reason: txt(n, 'AllowanceChargeReason'), reasonCode: txt(n, 'AllowanceChargeReasonCode'),
  vatCat: txt(n, 'TaxCategory/ID'), vatRate: txt(n, 'TaxCategory/Percent'),
});
function partyUBL(p) {
  if (!p) return null;
  const legal = find(p, 'PartyLegalEntity');
  const names = findAll(p, 'PartyName/Name').map(n => n.textContent.trim()).filter(Boolean);
  const regName = txt(legal, 'RegistrationName');
  const schemes = findAll(p, 'PartyTaxScheme').map(t => ({ id: txt(t, 'CompanyID'), scheme: txt(t, 'TaxScheme/ID') })).filter(t => t.id);
  const ep = find(p, 'EndpointID');
  return {
    name: regName || names[0] || '',
    tradeName: regName && names[0] && names[0] !== regName ? names[0] : '',
    legalForm: txt(legal, 'CompanyLegalForm'),
    legalId: legal && txt(legal, 'CompanyID') ? { id: txt(legal, 'CompanyID'), scheme: attr(legal, 'CompanyID', 'schemeID') } : null,
    ids: findAll(p, 'PartyIdentification/ID').map(n => ({ id: n.textContent.trim(), scheme: n.getAttribute('schemeID') || '' })).filter(x => x.id),
    vatId: (schemes.find(t => t.scheme.toUpperCase() === 'VAT') || {}).id || '',
    taxRegs: schemes.filter(t => t.scheme.toUpperCase() !== 'VAT').map(t => ({ scheme: t.scheme, id: t.id })),
    endpoint: ep && ep.textContent.trim() ? { id: ep.textContent.trim(), scheme: ep.getAttribute('schemeID') || '' } : null,
    address: addrUBL(find(p, 'PostalAddress')),
    contact: { name: txt(p, 'Contact/Name'), phone: txt(p, 'Contact/Telephone'), email: txt(p, 'Contact/ElectronicMail') },
  };
}
// Une note UBL peut commencer par « #CODE# » (code de sujet BT-21).
function ublNote(s) {
  const m = /^#([A-Z0-9]{3})#\s*([\s\S]*)$/.exec(s);
  return m ? { code: m[1], text: m[2].trim() } : { code: '', text: s };
}

function parseUBL(root) {
  const isCN = root.localName === 'CreditNote';
  const inv = blankInvoice('UBL');
  inv.guideline = txt(root, 'CustomizationID');
  inv.process = txt(root, 'ProfileID');
  inv.number = txt(root, 'ID');
  inv.typeCode = txt(root, isCN ? 'CreditNoteTypeCode' : 'InvoiceTypeCode');
  inv.issueDate = normDate(txt(root, 'IssueDate'));
  inv.dueDate = normDate(txt(root, 'DueDate') || txt(root, 'PaymentMeans/PaymentDueDate'));
  inv.taxPointDate = normDate(txt(root, 'TaxPointDate'));
  inv.currency = txt(root, 'DocumentCurrencyCode');
  inv.taxCurrency = txt(root, 'TaxCurrencyCode');
  inv.notes = findAll(root, 'Note').map(n => ublNote(n.textContent.trim())).filter(n => n.text);

  const R = inv.refs;
  R.buyerRef = txt(root, 'BuyerReference');
  R.order = txt(root, 'OrderReference/ID');
  R.salesOrder = txt(root, 'OrderReference/SalesOrderID');
  R.contract = txt(root, 'ContractDocumentReference/ID');
  R.project = txt(root, 'ProjectReference/ID');
  R.despatch = txt(root, 'DespatchDocumentReference/ID');
  R.receipt = txt(root, 'ReceiptDocumentReference/ID');
  R.tender = txt(root, 'OriginatorDocumentReference/ID');
  R.accounting = txt(root, 'AccountingCost');
  inv.prevInvoices = findAll(root, 'BillingReference/InvoiceDocumentReference')
    .map(d => ({ id: txt(d, 'ID'), date: normDate(txt(d, 'IssueDate')) }));
  inv.period = { start: normDate(txt(root, 'InvoicePeriod/StartDate')), end: normDate(txt(root, 'InvoicePeriod/EndDate')) };

  inv.seller = partyUBL(find(root, 'AccountingSupplierParty/Party'));
  inv.buyer = partyUBL(find(root, 'AccountingCustomerParty/Party'));
  inv.payee = partyUBL(find(root, 'PayeeParty'));
  inv.taxRep = partyUBL(find(root, 'TaxRepresentativeParty'));

  const d = find(root, 'Delivery');
  if (d) {
    inv.delivery = {
      name: txt(d, 'DeliveryParty/PartyName/Name'), id: txt(d, 'DeliveryLocation/ID'),
      address: addrUBL(find(d, 'DeliveryLocation/Address')), date: normDate(txt(d, 'ActualDeliveryDate')),
    };
  }

  inv.payments = findAll(root, 'PaymentMeans').map(pm => ({
    code: txt(pm, 'PaymentMeansCode'), info: attr(pm, 'PaymentMeansCode', 'name'), ref: txt(pm, 'PaymentID'),
    iban: txt(pm, 'PayeeFinancialAccount/ID'), accountName: txt(pm, 'PayeeFinancialAccount/Name'),
    bic: txt(pm, 'PayeeFinancialAccount/FinancialInstitutionBranch/ID'),
    card: txt(pm, 'CardAccount/PrimaryAccountNumberID'), cardHolder: txt(pm, 'CardAccount/HolderName'),
    payerIban: txt(pm, 'PaymentMandate/PayerFinancialAccount/ID'),
  }));
  inv.payRef = (inv.payments.find(p => p.ref) || {}).ref || '';
  inv.mandate = txt(root, 'PaymentMeans/PaymentMandate/ID');
  inv.paymentTerms = findAll(root, 'PaymentTerms/Note').map(n => ({ text: n.textContent.trim(), dueDate: '' })).filter(t => t.text);

  inv.docAC = findAll(root, 'AllowanceCharge').map(acUBL);

  const taxTotals = findAll(root, 'TaxTotal');
  const main = taxTotals.find(t => findAll(t, 'TaxSubtotal').length) ||
    taxTotals.find(t => attr(t, 'TaxAmount', 'currencyID') === inv.currency) || taxTotals[0];
  const alt = taxTotals.find(t => t !== main);
  const T = inv.totals;
  if (main) {
    T.tax = txt(main, 'TaxAmount');
    inv.vat = findAll(main, 'TaxSubtotal').map(s => ({
      basis: txt(s, 'TaxableAmount'), amount: txt(s, 'TaxAmount'), cat: txt(s, 'TaxCategory/ID'), rate: txt(s, 'TaxCategory/Percent'),
      reason: txt(s, 'TaxCategory/TaxExemptionReason'), reasonCode: txt(s, 'TaxCategory/TaxExemptionReasonCode'), dueCode: '',
    }));
  }
  if (alt) { T.taxAlt = txt(alt, 'TaxAmount'); T.taxAltCur = attr(alt, 'TaxAmount', 'currencyID'); }
  inv.vatDueCode = txt(root, 'InvoicePeriod/DescriptionCode');
  if (inv.vatDueCode) inv.vat.forEach(v => { v.dueCode = inv.vatDueCode; });

  const lm = find(root, 'LegalMonetaryTotal');
  T.lines = txt(lm, 'LineExtensionAmount');
  T.net = txt(lm, 'TaxExclusiveAmount');
  T.gross = txt(lm, 'TaxInclusiveAmount');
  T.allowances = txt(lm, 'AllowanceTotalAmount');
  T.charges = txt(lm, 'ChargeTotalAmount');
  T.prepaid = txt(lm, 'PrepaidAmount');
  T.rounding = txt(lm, 'PayableRoundingAmount');
  T.due = txt(lm, 'PayableAmount');

  inv.lines = findAll(root, isCN ? 'CreditNoteLine' : 'InvoiceLine').map(li => {
    const item = find(li, 'Item');
    const price = find(li, 'Price');
    const q = find(li, isCN ? 'CreditedQuantity' : 'InvoicedQuantity');
    const pac = find(price, 'AllowanceCharge');
    return {
      id: txt(li, 'ID'), note: txt(li, 'Note'),
      name: txt(item, 'Name'), desc: txt(item, 'Description'),
      sellerId: txt(item, 'SellersItemIdentification/ID'), buyerId: txt(item, 'BuyersItemIdentification/ID'),
      std: findAll(item, 'StandardItemIdentification/ID').map(n => ({ id: n.textContent.trim(), scheme: n.getAttribute('schemeID') || '' })),
      origin: txt(item, 'OriginCountry/IdentificationCode'),
      classes: findAll(item, 'CommodityClassification/ItemClassificationCode').map(n => ({ code: n.textContent.trim(), list: n.getAttribute('listID') || '' })),
      props: findAll(item, 'AdditionalItemProperty').map(p => ({ name: txt(p, 'Name'), value: txt(p, 'Value') })),
      qty: q ? q.textContent.trim() : '', unit: q ? q.getAttribute('unitCode') || '' : '',
      price: txt(price, 'PriceAmount'), priceBase: txt(price, 'BaseQuantity'), priceBaseUnit: attr(price, 'BaseQuantity', 'unitCode'),
      grossPrice: txt(pac, 'BaseAmount'), priceDiscount: pac && txt(pac, 'ChargeIndicator') === 'false' ? txt(pac, 'Amount') : '',
      net: txt(li, 'LineExtensionAmount'),
      vatCat: txt(item, 'ClassifiedTaxCategory/ID'), vatRate: txt(item, 'ClassifiedTaxCategory/Percent'),
      orderLine: txt(li, 'OrderLineReference/LineID'), acct: txt(li, 'AccountingCost'),
      periodStart: normDate(txt(li, 'InvoicePeriod/StartDate')), periodEnd: normDate(txt(li, 'InvoicePeriod/EndDate')),
      acs: findAll(li, 'AllowanceCharge').map(acUBL),
    };
  });

  findAll(root, 'AdditionalDocumentReference').forEach(dr => {
    const type = txt(dr, 'DocumentTypeCode');
    const id = txt(dr, 'ID');
    if (type === '130') { inv.objectRef = { id, scheme: attr(dr, 'ID', 'schemeID') }; return; }
    const bin = find(dr, 'Attachment/EmbeddedDocumentBinaryObject');
    inv.attachments.push({
      id, desc: txt(dr, 'DocumentDescription'), uri: txt(dr, 'Attachment/ExternalReference/URI'),
      mime: bin ? bin.getAttribute('mimeCode') || '' : '', filename: bin ? bin.getAttribute('filename') || '' : '',
      b64: bin ? bin.textContent.replace(/\s+/g, '') : '',
    });
  });

  return finish(inv, isCN);
}

/* ============ Analyse d'un contenu XML ============ */
function analyze(text) {
  text = (text || '').replace(/^﻿/, '').trim();
  if (!text) return { fatal: 'Le contenu est vide.' };
  if (!text.startsWith('<')) return { fatal: 'Ce contenu ne ressemble pas à du XML : il devrait commencer par « < ».' };
  if (/<!ENTITY/i.test(text)) {
    return { fatal: 'Ce fichier déclare des entités XML (<!ENTITY>). Une facture n’en a pas besoin : la lecture est refusée par prudence.' };
  }
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  const bad = xml.getElementsByTagName('parsererror')[0];
  if (bad) {
    const raw = bad.textContent || '';
    const m = /error on line \d+ at column \d+:[^\n]*/i.exec(raw) || /Line Number \d+, Column \d+[^\n]*/i.exec(raw);
    return { fatal: `XML invalide : ${m ? m[0].trim() : raw.trim().split('\n')[0].slice(0, 200)}` };
  }
  const root = xml.documentElement;
  const res = { text, xml, root, kind: 'OTHER', inv: null, error: null };
  try {
    if (root.localName === 'CrossIndustryInvoice') {
      res.kind = 'CII';
      res.inv = parseCII(root);
    } else if ((root.localName === 'Invoice' || root.localName === 'CreditNote') && /ubl/i.test(root.namespaceURI || '')) {
      res.kind = 'UBL';
      res.inv = parseUBL(root);
    } else if (root.localName === 'CrossIndustryDocument') {
      res.kind = 'ZUGFERD1';
    }
    if (res.inv) res.inv.checks = runChecks(res.inv);
  } catch (e) {
    res.error = e;
    res.inv = null;
  }
  return res;
}

/* ============ Contrôles de cohérence (inspirés des règles EN 16931) ============ */
function luhn(s) {
  let total = 0;
  let dbl = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = Number(s[i]);
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    total += d;
    dbl = !dbl;
  }
  return total % 10 === 0;
}
function ibanOk(iban) {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  let rem = 0;
  for (const ch of s.slice(4) + s.slice(0, 4)) {
    const v = ch >= 'A' ? String(ch.charCodeAt(0) - 55) : ch;
    for (const c of v) rem = (rem * 10 + Number(c)) % 97;
  }
  return rem === 1;
}
// Clé d'un n° de TVA français : (12 + 3 × (SIREN modulo 97)) modulo 97.
// Retourne null quand le numéro n'est pas de la forme FR + clé numérique + SIREN : on ne conclut pas.
function frVatCheck(vat) {
  const m = /^FR(\d{2})(\d{9})$/i.exec(vat.replace(/\s+/g, ''));
  if (!m) return null;
  const key = (12 + 3 * (Number(m[2]) % 97)) % 97;
  return { ok: key === Number(m[1]), expected: `FR${String(key).padStart(2, '0')}${m[2]}` };
}
function sirenOf(p) {
  if (!p) return '';
  for (const c of [p.legalId, ...p.ids].filter(Boolean)) {
    if (c.scheme === '0002' && /^\d{9}$/.test(c.id)) return c.id;
    if ((c.scheme === '0009' || c.scheme === '0002') && /^\d{14}$/.test(c.id)) return c.id.slice(0, 9);
  }
  return '';
}

const RULE_CAT = { S: 'S', Z: 'Z', E: 'E', AE: 'AE', K: 'IC', G: 'G', O: 'O', L: 'IG', M: 'IP' };

function runChecks(inv) {
  const out = [];
  const add = (level, group, title, detail = '', rule = '') => out.push({ level, group, title, detail, rule });
  const T = inv.totals;
  const num = s => (isNum(s) ? Number(s) : NaN);
  const z = s => (isNum(s) ? Number(s) : 0);
  const sum = a => a.reduce((x, y) => x + y, 0);
  const fm = v => nf(2, 2).format(round2(v));
  const need = (ok, rule, title, level = 'error') =>
    add(ok ? 'ok' : level, 'Informations obligatoires', title, ok ? '' : 'Information absente du fichier.', rule);
  const eq = (group, rule, title, actual, expected, tol = 0.005, note = '') => {
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) return;
    const d = actual - expected;
    if (Math.abs(d) <= tol + 1e-9) add('ok', group, title, fm(actual), rule);
    else add('error', group, title, `Valeur du fichier : ${fm(actual)}. Valeur recalculée : ${fm(expected)} (écart de ${fm(d)})${note}.`, rule);
  };

  /* --- Informations obligatoires --- */
  const sellerCountry = inv.seller && inv.seller.address && inv.seller.address.country;
  const buyerCountry = inv.buyer && inv.buyer.address && inv.buyer.address.country;
  need(!!inv.number, 'BR-02', 'Numéro de facture (BT-1)');
  need(!!inv.issueDate, 'BR-03', 'Date d’émission (BT-2)');
  need(!!inv.typeCode, 'BR-04', 'Code type de document (BT-3)', 'warn');
  need(!!inv.currency, 'BR-05', 'Devise de la facture (BT-5)');
  need(!!(inv.seller && inv.seller.name), 'BR-06', 'Nom du vendeur (BT-27)');
  need(!!(inv.buyer && inv.buyer.name), 'BR-07', 'Nom de l’acheteur (BT-44)');
  need(!!sellerCountry, 'BR-09', 'Pays du vendeur (BT-40)');
  if (!inv.minimal) need(!!buyerCountry, 'BR-11', 'Pays de l’acheteur (BT-55)');
  if (!inv.minimal) need(isNum(T.lines), 'BR-12', 'Total des lignes (BT-106)');
  need(isNum(T.net), 'BR-13', 'Total HT (BT-109)');
  need(isNum(T.gross), 'BR-14', 'Total TTC (BT-112)');
  need(isNum(T.due), 'BR-15', 'Montant à payer (BT-115)');
  if (inv.minimal) {
    add('info', 'Profil', 'Profil sans détail de lignes', 'Ce profil (MINIMUM ou BASIC WL) ne porte pas les lignes : les contrôles de lignes ne s’appliquent pas.');
  } else {
    need(inv.lines.length > 0, 'BR-16', 'Au moins une ligne de facture');
    need(inv.vat.length > 0, 'BR-CO-18', 'Au moins une ligne de ventilation de TVA');
  }
  // Le profil MINIMUM ne prévoit ni échéance ni conditions de paiement.
  if (num(T.due) > 0 && !/:minimum$/i.test(inv.guideline)) {
    need(!!(inv.dueDate || inv.paymentTerms.some(t => t.text)), 'BR-CO-25', 'Échéance ou conditions de paiement (BT-9 ou BT-20)', 'warn');
  }
  if (inv.taxCurrency && inv.taxCurrency !== inv.currency) {
    need(isNum(T.taxAlt), 'BR-53', `Total de TVA en ${inv.taxCurrency} (BT-111)`);
  }

  /* --- Montants --- */
  const nets = inv.lines.map(l => num(l.net));
  if (inv.lines.length && nets.every(Number.isFinite)) {
    eq('Montants', 'BR-CO-10', 'Total des lignes = somme des montants de lignes (BT-106)', num(T.lines), sum(nets));
  }
  const allowances = inv.docAC.filter(a => !a.charge).map(a => num(a.amount)).filter(Number.isFinite);
  const charges = inv.docAC.filter(a => a.charge).map(a => num(a.amount)).filter(Number.isFinite);
  if (allowances.length || isNum(T.allowances)) {
    eq('Montants', 'BR-CO-11', 'Remises sur facture = somme des remises (BT-107)', z(T.allowances), sum(allowances));
  }
  if (charges.length || isNum(T.charges)) {
    eq('Montants', 'BR-CO-12', 'Frais sur facture = somme des frais (BT-108)', z(T.charges), sum(charges));
  }
  if (isNum(T.lines)) {
    eq('Montants', 'BR-CO-13', 'Total HT = lignes − remises + frais (BT-109)', num(T.net), z(T.lines) - z(T.allowances) + z(T.charges));
  }
  if (inv.vat.length && isNum(T.tax)) {
    eq('TVA', 'BR-CO-14', 'Total de TVA = somme des montants par catégorie (BT-110)', num(T.tax), sum(inv.vat.map(v => z(v.amount))));
  }
  if (isNum(T.net) && isNum(T.gross)) {
    eq('Montants', 'BR-CO-15', 'Total TTC = total HT + TVA (BT-112)', num(T.gross), num(T.net) + z(T.tax));
  }
  if (isNum(T.gross) && isNum(T.due)) {
    eq('Montants', 'BR-CO-16', 'Montant à payer = TTC − acomptes + arrondi (BT-115)', num(T.due), num(T.gross) - z(T.prepaid) + z(T.rounding));
  }

  /* --- TVA --- */
  const gkey = (cat, rate) => `${cat}|${isNum(rate) ? Number(rate) : ''}`;
  const expected = new Map();
  const bump = (k, v) => expected.set(k, (expected.get(k) || 0) + v);
  inv.lines.filter(l => l.vatCat).forEach(l => bump(gkey(l.vatCat, l.vatRate), z(l.net)));
  inv.docAC.filter(a => a.vatCat).forEach(a => bump(gkey(a.vatCat, a.vatRate), (a.charge ? 1 : -1) * z(a.amount)));
  const rows = new Set(inv.vat.map(v => gkey(v.cat, v.rate)));

  inv.vat.forEach(v => {
    const label = `TVA ${v.cat || '?'}${isNum(v.rate) ? ` à ${fmtPct(v.rate)}` : ''}`;
    const prefix = RULE_CAT[v.cat] || 'S';
    const k = gkey(v.cat, v.rate);
    if (inv.lines.length && expected.has(k) && isNum(v.basis)) {
      eq('TVA', `BR-${prefix}-08`, `${label} : base imposable = lignes − remises + frais`, num(v.basis), expected.get(k));
    } else if (inv.lines.length && !expected.has(k)) {
      add('warn', 'TVA', `${label} : aucune ligne ni remise ne correspond à cette ventilation`, '', `BR-${prefix}-08`);
    }
    if (isNum(v.basis) && isNum(v.rate) && isNum(v.amount)) {
      eq('TVA', 'BR-CO-17', `${label} : montant = base × taux`, num(v.amount), round2(num(v.basis) * Number(v.rate) / 100), 0.0101, ', tolérance de 1 centime');
    }
    if (['E', 'AE', 'K', 'G', 'O'].includes(v.cat)) {
      if (!v.reason && !v.reasonCode) add('warn', 'TVA', `${label} : motif ou code d’exonération absent`, 'Une catégorie exonérée doit expliquer pourquoi.', `BR-${prefix}-10`);
      if (z(v.rate) !== 0) add('error', 'TVA', `${label} : le taux devrait être 0 %`, '', `BR-${prefix}-05`);
    }
    if (v.cat === 'Z' && z(v.rate) !== 0) add('error', 'TVA', `${label} : le taux devrait être 0 %`, '', 'BR-Z-05');
    if (v.cat === 'S' && isNum(v.rate) && Number(v.rate) === 0) add('warn', 'TVA', 'Catégorie S (taux normal) avec un taux de 0 %', '', 'BR-S-05');
  });
  [...expected.keys()].filter(k => !rows.has(k) && inv.vat.length).forEach(k => {
    const [c, r] = k.split('|');
    add('error', 'TVA', `Catégorie ${c}${r === '' ? '' : ` à ${fmtPct(r)}`} utilisée dans les lignes mais absente de la ventilation`, '', `BR-${RULE_CAT[c] || 'S'}-01`);
  });

  /* --- Lignes --- */
  const bad = [];
  let checked = 0;
  inv.lines.forEach(l => {
    const q = num(l.qty);
    const p = num(l.price);
    const n = num(l.net);
    if (![q, p, n].every(Number.isFinite)) return;
    const base = isNum(l.priceBase) && Number(l.priceBase) !== 0 ? Number(l.priceBase) : 1;
    const acs = sum(l.acs.map(a => (a.charge ? 1 : -1) * z(a.amount)));
    const exp = q * p / base + acs;
    checked++;
    if (Math.abs(n - exp) > 0.0101) bad.push({ l, n, exp });
  });
  bad.slice(0, 12).forEach(({ l, n, exp }) => {
    add('error', 'Lignes', `Ligne ${l.id || '?'} : quantité × prix − remises ≠ total de la ligne`,
      `Valeur du fichier : ${fm(n)}. Valeur recalculée : ${fm(exp)} (écart de ${fm(n - exp)}).`, 'BR-24');
  });
  if (bad.length > 12) add('info', 'Lignes', `${bad.length - 12} autres lignes présentent un écart`);
  if (checked && !bad.length) add('ok', 'Lignes', `${checked} ligne${checked > 1 ? 's' : ''} : quantité × prix − remises = total de la ligne`, '', 'BR-24');

  /* --- Paiement --- */
  inv.payments.forEach((p, i) => {
    const tag = inv.payments.length > 1 ? ` (moyen ${i + 1})` : '';
    if (['30', '58', '42'].includes(p.code) && !p.iban) {
      add('warn', 'Paiement', `Virement sans compte à créditer${tag}`, 'Le moyen de paiement est un virement mais aucun IBAN n’est fourni.', 'BR-61');
    }
    [['IBAN du vendeur', p.iban], ['IBAN à débiter', p.payerIban]].forEach(([label, v]) => {
      if (!v) return;
      if (!/^[A-Za-z]{2}\d{2}/.test(v)) { add('info', 'Paiement', `${label}${tag} : identifiant de compte non IBAN`, v); return; }
      if (ibanOk(v)) add('ok', 'Paiement', `${label} valide${tag}`, fmtIban(v));
      else add('warn', 'Paiement', `${label} : clé de contrôle incorrecte${tag}`, `${fmtIban(v)} ne passe pas le contrôle modulo 97.`);
    });
  });

  /* --- Identifiants (France) --- */
  [['du vendeur', 'Vendeur', inv.seller], ['de l’acheteur', 'Acheteur', inv.buyer]].forEach(([de, who, p]) => {
    if (!p) return;
    const seen = new Set();
    [p.legalId, ...p.ids].filter(Boolean).forEach(x => {
      const key = `${x.scheme}:${x.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      const siren = x.id.slice(0, 9);
      if (x.scheme === '0002' && /^\d{9}$/.test(x.id)) {
        if (luhn(x.id)) add('ok', 'Identifiants', `SIREN ${de} valide`, fmtId(x));
        else add('warn', 'Identifiants', `SIREN ${de} : clé de contrôle incorrecte`, `${fmtId(x)} ne passe pas le contrôle de Luhn.`);
      } else if ((x.scheme === '0009' || x.scheme === '0002') && /^\d{14}$/.test(x.id) && siren !== '356000000') {
        if (luhn(x.id)) add('ok', 'Identifiants', `SIRET ${de} valide`, fmtId(x));
        else add('warn', 'Identifiants', `SIRET ${de} : clé de contrôle incorrecte`, `${fmtId(x)} ne passe pas le contrôle de Luhn.`);
      }
    });
    if (p.vatId) {
      const vat = frVatCheck(p.vatId);
      if (vat && vat.ok) add('ok', 'Identifiants', `N° de TVA ${de} : clé valide`, p.vatId);
      if (vat && !vat.ok) {
        add('warn', 'Identifiants', `N° de TVA ${de} : clé incohérente avec le SIREN`,
          `Le fichier indique ${p.vatId}. La clé calculée à partir du SIREN donne ${vat.expected}. À confirmer sur VIES (Commission européenne) ou auprès de l’intéressé.`);
      }
      const siren = sirenOf(p);
      const vatSiren = /^FR[0-9A-Z]{2}(\d{9})$/i.exec(p.vatId.replace(/\s+/g, ''));
      if (siren && vatSiren && vatSiren[1] !== siren) {
        add('warn', 'Identifiants', `${who} : le n° de TVA et le SIREN ne correspondent pas`, `TVA ${p.vatId}, SIREN ${siren}.`);
      }
    }
  });

  /* --- Dates --- */
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!inv.isCredit && iso.test(inv.issueDate) && iso.test(inv.dueDate)) {
    if (inv.dueDate < inv.issueDate) add('warn', 'Dates', 'Échéance antérieure à la date d’émission', `Émission ${fmtDate(inv.issueDate)}, échéance ${fmtDate(inv.dueDate)}.`);
    else add('ok', 'Dates', 'Échéance postérieure ou égale à la date d’émission');
  }

  return out;
}

/* ============ Affichage de la facture ============ */
function kv(rows, cls) {
  const list = h('dl', { class: 'kv' + (cls ? ` ${cls}` : '') });
  for (const [label, value, code] of rows) {
    if (value == null || value === '' || value === false) continue;
    list.append(h('div', { class: 'kv-row' }, h('dt', null, label, BT(code)), h('dd', null, value)));
  }
  return list.children.length ? list : null;
}
const section = (title, body, cls) =>
  h('section', { class: 'sec' + (cls ? ` ${cls}` : '') }, title ? h('h2', { class: 'sec-title' }, title) : null, body);
// Cellule de tableau : le contenu est regroupé dans un seul bloc pour l'affichage empilé sur téléphone.
const td = (label, cls, ...kids) => h('td', { class: cls || null, 'data-label': label }, h('div', { class: 'cell' }, ...kids));

function renderAddress(a) {
  if (!a) return null;
  const lines = [a.l1, a.l2, a.l3, [a.zip, a.city].filter(Boolean).join(' '), a.sub, a.country && countryName(a.country)].filter(Boolean);
  return lines.length ? h('div', { class: 'addr' }, lines.map(l => h('div', null, l))) : null;
}

const SELLER_BT = { name: 'BT-27', trade: 'BT-28', id: 'BT-29', legal: 'BT-30', vat: 'BT-31', taxreg: 'BT-32', form: 'BT-33', ep: 'BT-34', contact: 'BT-41', phone: 'BT-42', mail: 'BT-43' };
const BUYER_BT = { name: 'BT-44', trade: 'BT-45', id: 'BT-46', legal: 'BT-47', vat: 'BT-48', ep: 'BT-49', contact: 'BT-56', phone: 'BT-57', mail: 'BT-58' };

function renderParty(title, p, codes) {
  const box = h('div', { class: 'party' }, h('h2', { class: 'sec-title' }, title));
  if (!p) { box.append(h('p', { class: 'muted' }, 'Non renseigné')); return box; }
  box.append(h('p', { class: 'party-name' }, p.name || '—', BT(codes.name)));
  if (p.tradeName) box.append(h('p', { class: 'trade' }, p.tradeName, BT(codes.trade)));
  const addr = renderAddress(p.address);
  if (addr) box.append(addr);

  const rows = [];
  const shown = new Set();
  if (p.legalId) {
    shown.add(p.legalId.id);
    rows.push([idLabel(p.legalId.scheme) || 'Identifiant légal', fmtId(p.legalId), codes.legal]);
  }
  p.ids.forEach(x => {
    if (shown.has(x.id)) return;
    shown.add(x.id);
    rows.push([idLabel(x.scheme) || 'Identifiant', fmtId(x), codes.id]);
  });
  if (p.vatId) {
    // Une clé qui ne correspond pas au SIREN est signalée à côté du numéro lui-même.
    const vat = frVatCheck(p.vatId);
    const flag = vat && !vat.ok
      ? h('span', { class: 'tag warn', title: `La clé calculée à partir du SIREN donne ${vat.expected}` }, 'clé incohérente') : null;
    rows.push(['N° de TVA', [p.vatId, flag ? ' ' : '', flag], codes.vat]);
  }
  p.taxRegs.forEach(r => rows.push([r.scheme === 'FC' ? 'N° fiscal' : `Enregistrement fiscal${r.scheme ? ` (${r.scheme})` : ''}`, r.id, codes.taxreg]));
  if (p.legalForm) rows.push(['Forme juridique', p.legalForm, codes.form]);
  if (p.endpoint) {
    rows.push([idLabel(p.endpoint.scheme) || 'Adresse électronique', `${p.endpoint.id}${p.endpoint.scheme ? ` (${p.endpoint.scheme})` : ''}`, codes.ep]);
  }
  const ids = kv(rows, 'small');
  if (ids) box.append(ids);

  const c = p.contact || {};
  const contact = kv([['Contact', c.name, codes.contact], ['Téléphone', c.phone, codes.phone], ['E-mail', c.email, codes.mail]], 'small');
  if (contact) { const wrap = h('div', { class: 'addr' }, contact); box.append(wrap); }
  return box;
}

function renderHead(inv) {
  const T = inv.totals;
  const cur = inv.currency;
  const due = isNum(T.due) ? T.due : T.gross;
  const dates = [];
  if (inv.issueDate) dates.push(h('span', null, 'Émise le ', h('strong', null, fmtDate(inv.issueDate)), BT('BT-2')));
  if (inv.dueDate) dates.push(h('span', null, 'Échéance le ', h('strong', null, fmtDate(inv.dueDate)), BT('BT-9')));
  if (cur) dates.push(h('span', null, 'Devise ', h('strong', null, cur), BT('BT-5')));
  const sub = isNum(T.net) && isNum(T.gross) ? `${fmtAmt(T.net, cur)} HT · ${fmtAmt(T.gross, cur)} TTC` : '';
  return h('header', { class: 'sec doc-head' },
    h('div', { class: 'doc-id' },
      h('span', { class: 'doc-type' + (inv.isCredit ? ' credit' : '') }, typeLabel(inv), BT('BT-3')),
      h('h1', { class: 'doc-num' }, inv.number ? `N° ${inv.number}` : 'Sans numéro', BT('BT-1')),
      h('p', { class: 'doc-sub' }, dates)),
    h('div', { class: 'due-box' },
      h('span', { class: 'due-label' }, inv.isCredit ? 'Montant à créditer' : 'Reste à payer', BT('BT-115')),
      h('span', { class: 'due-amt' }, due !== '' && due != null ? fmtAmt(due, cur) : '—'),
      sub ? h('span', { class: 'due-sub' }, sub) : null));
}

function renderExtraParties(inv) {
  const boxes = [];
  const d = inv.delivery;
  const hasAddr = a => a && Object.values(a).some(Boolean);
  if (d && (d.name || d.id || d.date || hasAddr(d.address))) {
    const b = h('div', { class: 'party' }, h('h2', { class: 'sec-title' }, 'Livraison'));
    if (d.name) b.append(h('p', { class: 'party-name sm' }, d.name, BT('BT-70')));
    const a = renderAddress(d.address);
    if (a) b.append(a);
    const k = kv([['Date de livraison', fmtDate(d.date), 'BT-72'], ['Identifiant du lieu', d.id, 'BT-71']], 'small');
    if (k) b.append(k);
    boxes.push(b);
  }
  const extra = (title, p, codes) => {
    if (!p || !(p.name || p.legalId || p.ids.length || p.vatId)) return;
    const b = h('div', { class: 'party' }, h('h2', { class: 'sec-title' }, title), h('p', { class: 'party-name sm' }, p.name || '—', BT(codes.name)));
    const a = renderAddress(p.address);
    if (a) b.append(a);
    const k = kv([
      [idLabel(p.legalId && p.legalId.scheme) || 'Identifiant légal', p.legalId && fmtId(p.legalId), codes.legal],
      ...p.ids.filter(x => !p.legalId || x.id !== p.legalId.id).map(x => [idLabel(x.scheme) || 'Identifiant', fmtId(x), codes.id]),
      ['N° de TVA', p.vatId, codes.vat],
    ], 'small');
    if (k) b.append(k);
    boxes.push(b);
  };
  extra('Bénéficiaire du paiement', inv.payee, { name: 'BT-59', id: 'BT-60', legal: 'BT-61' });
  extra('Représentant fiscal du vendeur', inv.taxRep, { name: 'BT-62', vat: 'BT-63' });
  return boxes.length ? h('section', { class: 'sec' }, h('div', { class: 'grid3' }, boxes)) : null;
}

function renderRefs(inv) {
  const R = inv.refs;
  const items = [
    ['Référence acheteur', R.buyerRef, 'BT-10'], ['Commande de l’acheteur', R.order, 'BT-13'], ['Commande du vendeur', R.salesOrder, 'BT-14'],
    ['Contrat', R.contract, 'BT-12'], ['Projet', R.project, 'BT-11'], ['Bon de livraison', R.despatch, 'BT-16'],
    ['Avis de réception', R.receipt, 'BT-15'], ['Appel d’offres ou lot', R.tender, 'BT-17'], ['Référence comptable de l’acheteur', R.accounting, 'BT-19'],
    ['Objet facturé', inv.objectRef ? `${inv.objectRef.id}${inv.objectRef.scheme ? ` (${inv.objectRef.scheme})` : ''}` : '', 'BT-18'],
  ];
  inv.prevInvoices.forEach(p => items.push([
    inv.isCredit || inv.typeCode === '384' ? 'Facture concernée' : 'Facture précédente',
    `${p.id}${p.date ? ` du ${fmtDate(p.date)}` : ''}`, 'BT-25',
  ]));
  if (inv.period.start || inv.period.end) {
    items.push(['Période de facturation', [fmtDate(inv.period.start), fmtDate(inv.period.end)].filter(Boolean).join(' → '), 'BT-73']);
  }
  if (inv.taxPointDate) items.push(['Date de fait générateur de la TVA', fmtDate(inv.taxPointDate), 'BT-7']);
  const cells = items.filter(([, v]) => v).map(([l, v, c]) => h('div', { class: 'ref' }, h('span', { class: 'ref-l' }, l, BT(c)), h('span', { class: 'ref-v' }, v)));
  return cells.length ? section('Références', h('div', { class: 'refs' }, cells)) : null;
}

/* ---------- lignes ---------- */
function lineDetails(l, cur) {
  const out = [];
  if (l.desc && l.desc !== l.name) out.push(h('div', { class: 'sub' }, l.desc, BT('BT-154')));
  const chips = [];
  if (l.sellerId) chips.push(`Réf. vendeur ${l.sellerId}`);
  if (l.buyerId) chips.push(`Réf. acheteur ${l.buyerId}`);
  l.std.forEach(s => chips.push(`${idLabel(s.scheme) || 'Code'} ${s.id}`));
  l.classes.forEach(c => chips.push(`Classification ${c.code}${c.list ? ` (${c.list})` : ''}`));
  if (l.origin) chips.push(`Origine : ${countryName(l.origin)}`);
  if (l.orderLine) chips.push(`Ligne de commande ${l.orderLine}`);
  if (l.acct) chips.push(`Imputation ${l.acct}`);
  if (l.periodStart || l.periodEnd) chips.push(`Période ${[fmtDate(l.periodStart), fmtDate(l.periodEnd)].filter(Boolean).join(' → ')}`);
  if (chips.length) out.push(h('div', { class: 'sub' }, chips.join(' · ')));
  l.props.filter(p => p.name || p.value).forEach(p => out.push(h('div', { class: 'sub' }, `${p.name}${p.name && p.value ? ' : ' : ''}${p.value}`)));
  if (isNum(l.grossPrice) && isNum(l.priceDiscount) && Number(l.priceDiscount) !== 0) {
    out.push(h('div', { class: 'sub ac' }, `Prix brut ${fmtNumAmt(l.grossPrice)} − remise ${fmtNumAmt(l.priceDiscount)} par unité`, BT('BT-148')));
  }
  l.acs.forEach(a => {
    const head = a.charge ? 'Majoration' : 'Remise';
    out.push(h('div', { class: 'sub ac' },
      `${head}${isNum(a.percent) ? ` ${fmtPct(a.percent)}` : ''} : ${a.charge ? '+' : '−'}${fmtNumAmt(a.amount)}`,
      a.reason ? ` · ${a.reason}` : (a.reasonCode ? ` · code ${a.reasonCode}` : '')));
  });
  if (l.note) out.push(h('div', { class: 'sub' }, l.note, BT('BT-127')));
  return out;
}

function renderLineRow(l, cur) {
  const qty = isNum(l.qty) ? fmtNum(l.qty) : l.qty;
  const unit = l.unit ? unitLabel(l.unit, l.qty) : '';
  const base = isNum(l.priceBase) && Number(l.priceBase) !== 1
    ? ` pour ${fmtNum(l.priceBase)}${l.priceBaseUnit || l.unit ? ` ${unitLabel(l.priceBaseUnit || l.unit, l.priceBase)}` : ''}` : '';
  return h('tr', null,
    td('N°', 'c-id', l.id),
    td('Désignation', 'desc', h('div', { class: 'l-name' }, l.name || '—'), lineDetails(l, cur)),
    td('Quantité', 'num', qty, unit ? ` ${unit}` : ''),
    td('Prix unitaire HT', 'num', fmtNumAmt(l.price), base ? h('div', { class: 'sub' }, base.trim()) : null),
    td('TVA', 'num', isNum(l.vatRate) ? fmtPct(l.vatRate) : '', l.vatCat ? h('div', { class: 'sub' }, `Catégorie ${l.vatCat}`) : null),
    td('Total HT', 'num', h('strong', null, fmtNumAmt(l.net))));
}

function renderLines(inv) {
  if (!inv.lines.length) {
    return section('Lignes', h('p', { class: 'muted' },
      inv.minimal ? 'Ce profil (MINIMUM ou BASIC WL) ne contient pas le détail des lignes.' : 'Aucune ligne de facture dans ce fichier.'));
  }
  const th = (t, cls, code) => h('th', { scope: 'col', class: cls || null }, t, BT(code));
  const head = h('thead', null, h('tr', null,
    th('N°', 'c-id', 'BT-126'), th('Désignation', null, 'BT-153'), th('Quantité', 'num', 'BT-129'),
    th('Prix unitaire HT', 'num', 'BT-146'), th('TVA', 'num', 'BT-152'), th(`Total HT${inv.currency ? ` (${inv.currency})` : ''}`, 'num', 'BT-131')));
  const body = h('tbody', null, inv.lines.map(l => renderLineRow(l, inv.currency)));
  return section(`Lignes (${inv.lines.length})`, h('div', { class: 'tablewrap' }, h('table', { class: 'lines' }, head, body)));
}

function renderDocAC(inv) {
  if (!inv.docAC.length) return null;
  // On n'affiche que les colonnes renseignées.
  const hasBase = inv.docAC.some(a => isNum(a.base));
  const hasPct = inv.docAC.some(a => isNum(a.percent));
  const hasVat = inv.docAC.some(a => a.vatCat);
  const th = (t, cls) => h('th', { scope: 'col', class: cls || null }, t);
  const head = h('thead', null, h('tr', null,
    th('Nature'), th('Motif'), hasBase ? th('Base', 'num') : null, hasPct ? th('Taux', 'num') : null, hasVat ? th('TVA', 'num') : null, th('Montant', 'num')));
  const rows = inv.docAC.map(a => h('tr', null,
    td('Nature', null, h('span', { class: 'tag' }, a.charge ? 'Frais' : 'Remise'), BT(a.charge ? 'BT-99' : 'BT-92')),
    td('Motif', null, a.reason || (a.reasonCode ? `Code ${a.reasonCode}` : '—'), BT(a.charge ? 'BT-104' : 'BT-97')),
    hasBase ? td('Base', 'num', isNum(a.base) ? fmtNumAmt(a.base) : '') : null,
    hasPct ? td('Taux', 'num', isNum(a.percent) ? fmtPct(a.percent) : '') : null,
    hasVat ? td('TVA', 'num', a.vatCat ? `${a.vatCat}${isNum(a.vatRate) ? ` · ${fmtPct(a.vatRate)}` : ''}` : '') : null,
    td('Montant', 'num', `${a.charge ? '+' : '−'}${fmtNumAmt(a.amount)}`)));
  return section('Remises et frais sur l’ensemble de la facture', h('div', { class: 'tablewrap' }, h('table', { class: 'lines' }, head, h('tbody', null, rows))));
}

/* ---------- TVA et totaux ---------- */
function renderVat(inv) {
  const cur = inv.currency;
  const box = h('div', null, h('h2', { class: 'sec-title' }, 'Ventilation de la TVA'));
  if (!inv.vat.length) {
    box.append(h('p', { class: 'muted' }, inv.minimal ? 'Non détaillée dans ce profil.' : 'Aucune ventilation de TVA dans ce fichier.'));
    return box;
  }
  const th = (t, cls, code) => h('th', { scope: 'col', class: cls || null }, t, BT(code));
  const head = h('thead', null, h('tr', null, th('Catégorie', null, 'BT-118'), th('Taux', 'num', 'BT-119'), th('Base HT', 'num', 'BT-116'), th('TVA', 'num', 'BT-117')));
  const rows = inv.vat.map(v => h('tr', null,
    td('Catégorie', null, h('span', { class: 'tag' }, v.cat || '?'), ' ', VAT_CATS[v.cat] || ''),
    td('Taux', 'num', isNum(v.rate) ? fmtPct(v.rate) : ''),
    td('Base HT', 'num', fmtNumAmt(v.basis)),
    td('TVA', 'num', fmtNumAmt(v.amount))));
  box.append(h('div', { class: 'tablewrap' }, h('table', { class: 'vat' }, head, h('tbody', null, rows))));

  const notes = [];
  inv.vat.forEach(v => {
    const label = `${v.cat || '?'}${isNum(v.rate) ? ` · ${fmtPct(v.rate)}` : ''}`;
    if (v.reason || v.reasonCode) {
      notes.push(h('div', null, h('span', { class: 'tag' }, label), ' ', v.reason || '', v.reasonCode ? h('span', { class: 'mono' }, `${v.reason ? ' ' : ''}[${v.reasonCode}]`) : null, BT(v.reason ? 'BT-120' : 'BT-121')));
    }
  });
  const dueCodes = [...new Set(inv.vat.map(v => v.dueCode).filter(Boolean))];
  dueCodes.forEach(c => notes.push(h('div', null, `TVA exigible ${VAT_DUE[c] || `(code ${c})`}.`, BT('BT-8'))));
  if (notes.length) box.append(h('div', { class: 'reasons' }, notes));
  return box;
}

function renderTotals(inv) {
  const T = inv.totals;
  const cur = inv.currency;
  const box = h('div', null, h('h2', { class: 'sec-title' }, 'Totaux'));
  const list = h('dl', { class: 'totals' });
  const row = (label, value, code, cls) => {
    if (value === '' || value == null) return;
    list.append(h('div', { class: 't-row' + (cls ? ` ${cls}` : '') }, h('dt', null, label, BT(code)), h('dd', null, value)));
  };
  const neg = s => (isNum(s) ? fmtAmt(String(-Math.abs(Number(s))), cur) : '');
  const nonZero = s => isNum(s) && Number(s) !== 0;
  if (isNum(T.lines)) row('Total des lignes HT', fmtAmt(T.lines, cur), 'BT-106');
  if (nonZero(T.allowances)) row('Remises sur la facture', neg(T.allowances), 'BT-107');
  if (nonZero(T.charges)) row('Frais sur la facture', fmtAmt(T.charges, cur), 'BT-108');
  row('Total HT', isNum(T.net) ? fmtAmt(T.net, cur) : '', 'BT-109', 'strong');
  row('Total TVA', isNum(T.tax) ? fmtAmt(T.tax, cur) : '', 'BT-110');
  if (isNum(T.taxAlt)) row(`TVA en ${inv.taxCurrency || T.taxAltCur || 'devise comptable'}`, fmtAmt(T.taxAlt, T.taxAltCur || inv.taxCurrency), 'BT-111');
  row('Total TTC', isNum(T.gross) ? fmtAmt(T.gross, cur) : '', 'BT-112', 'strong');
  if (nonZero(T.prepaid)) row('Acomptes déjà versés', neg(T.prepaid), 'BT-113');
  if (nonZero(T.rounding)) row('Arrondi', fmtAmt(T.rounding, cur), 'BT-114');
  row(inv.isCredit ? 'Montant à créditer' : 'Reste à payer', isNum(T.due) ? fmtAmt(T.due, cur) : '', 'BT-115', 'pay');
  box.append(list);
  return box;
}

/* ---------- paiement, notes, pièces jointes ---------- */
function renderPayment(inv) {
  const blocks = [];
  inv.payments.forEach(p => {
    const means = p.code ? `${PAY_MEANS[p.code] || `Code ${p.code}`}${p.info && p.info !== PAY_MEANS[p.code] ? ` · ${p.info}` : ''}` : p.info;
    const k = kv([
      ['Moyen de paiement', means, 'BT-81'],
      ['IBAN', p.iban && h('span', { class: 'mono' }, fmtIban(p.iban)), 'BT-84'],
      ['BIC', p.bic && h('span', { class: 'mono' }, p.bic), 'BT-86'],
      ['Titulaire du compte', p.accountName, 'BT-85'],
      ['Carte (numéro tronqué)', p.card, 'BT-87'],
      ['Titulaire de la carte', p.cardHolder, 'BT-88'],
      ['Compte à débiter', p.payerIban && h('span', { class: 'mono' }, fmtIban(p.payerIban)), 'BT-91'],
    ]);
    if (k) blocks.push(k);
  });
  const terms = inv.paymentTerms.filter(t => t.text).map(t => t.text).join('\n');
  const common = kv([
    ['Référence de paiement', inv.payRef, 'BT-83'],
    ['Référence de mandat', inv.mandate, 'BT-89'],
    ['Identifiant créancier', inv.creditorRef, 'BT-90'],
    ['Échéance', fmtDate(inv.dueDate), 'BT-9'],
    ['Conditions de paiement', terms && h('span', { style: 'white-space:pre-line' }, terms), 'BT-20'],
  ]);
  if (common) blocks.push(common);
  return blocks.length ? section('Paiement', h('div', { class: 'grid2' }, blocks.map(b => h('div', null, b)))) : null;
}

function renderNotes(inv) {
  if (!inv.notes.length) return null;
  return section('Notes et mentions', h('div', { class: 'notes' }, inv.notes.map(n =>
    h('div', { class: 'note' },
      n.code ? h('span', { class: 'tag' }, NOTE_SUBJECTS[n.code] || n.code, BT('BT-21')) : null,
      h('p', null, n.text, BT('BT-22'))))));
}

const OPENABLE = new Set(['application/pdf', 'image/png', 'image/jpeg']);
function renderAttachments(inv) {
  if (!inv.attachments.length) return null;
  const items = inv.attachments.map(a => {
    const pad = a.b64.endsWith('==') ? 2 : a.b64.endsWith('=') ? 1 : 0;
    const size = a.b64 ? fmtBytes(Math.floor(a.b64.length * 3 / 4) - pad) : '';
    const actions = h('div', { class: 'att-actions' });
    if (a.b64) {
      if (OPENABLE.has(a.mime)) actions.append(h('button', { class: 'btn', type: 'button', onclick: () => openAttachment(a) }, 'Ouvrir'));
      actions.append(h('button', { class: 'btn', type: 'button', onclick: () => downloadAttachment(a) }, 'Télécharger'));
    }
    return h('li', { class: 'att' },
      h('div', { class: 'att-main' },
        h('div', { class: 'att-name' }, a.filename || a.id || 'Pièce jointe', BT(a.b64 ? 'BT-125' : 'BT-122')),
        h('div', { class: 'sub' }, [a.desc, a.mime, size, a.filename && a.id ? `Réf. ${a.id}` : ''].filter(Boolean).join(' · ')),
        a.uri ? h('div', { class: 'sub' }, 'Document externe : ', h('span', { class: 'mono' }, a.uri), BT('BT-124')) : null),
      actions);
  });
  return section('Pièces jointes', h('ul', { class: 'att-list' }, items));
}

function renderFoot(inv) {
  const k = kv([
    ['Source', inv.source ? `PDF « ${inv.source.pdfName} », XML intégré${inv.source.xmlName ? ` « ${inv.source.xmlName} »` : ''}` : ''],
    ['Syntaxe', inv.syntax === 'CII' ? 'CII (UN/CEFACT Cross Industry Invoice)' : 'UBL 2.1'],
    ['Profil', profileOf(inv)],
    ['Type de document', inv.typeCode ? `${inv.typeCode} · ${DOC_TYPES[inv.typeCode] || 'code non répertorié ici'}` : '', 'BT-3'],
    ['Spécification', inv.guideline && h('span', { class: 'mono' }, inv.guideline), 'BT-24'],
    ['Processus métier', inv.process && h('span', { class: 'mono' }, inv.process), 'BT-23'],
  ], 'small');
  return h('footer', { class: 'sec foot' }, h('h2', { class: 'sec-title' }, 'Fichier'), k);
}

function renderSheet(inv) {
  const sheet = h('article', { class: 'sheet', 'aria-label': `${typeLabel(inv)} ${inv.number || ''}`.trim() });
  [
    renderHead(inv),
    h('section', { class: 'sec' }, h('div', { class: 'grid2' }, renderParty('Vendeur', inv.seller, SELLER_BT), renderParty('Acheteur', inv.buyer, BUYER_BT))),
    renderExtraParties(inv),
    renderRefs(inv),
    renderLines(inv),
    renderDocAC(inv),
    h('section', { class: 'sec' }, h('div', { class: 'split' }, renderVat(inv), renderTotals(inv))),
    renderPayment(inv),
    renderNotes(inv),
    renderAttachments(inv),
    renderFoot(inv),
  ].forEach(part => part && sheet.append(part));
  return sheet;
}

/* ---------- onglet « Contrôles » ---------- */
const LEVEL_ICON = { ok: '✓', warn: '!', error: '✕', info: 'i' };
const LEVEL_WORD = { ok: 'Réussi', warn: 'Avertissement', error: 'Erreur', info: 'Information' };
function checkItem(c) {
  return h('li', { class: `check ${c.level}` },
    h('span', { class: 'dot', 'aria-hidden': 'true' }, LEVEL_ICON[c.level]),
    h('div', { class: 'check-body' },
      h('span', { class: 'check-group' }, c.group),
      h('p', { class: 'check-title' }, h('span', { class: 'sr' }, `${LEVEL_WORD[c.level]} : `), c.title, c.rule ? h('span', { class: 'rule' }, c.rule) : null),
      c.detail ? h('p', { class: 'check-detail' }, c.detail) : null));
}
function summarizeChecks(checks) {
  const n = { error: 0, warn: 0, ok: 0, info: 0 };
  checks.forEach(c => { n[c.level]++; });
  return n;
}
function renderChecks(checks) {
  const n = summarizeChecks(checks);
  const plural = (k, one, many) => (k > 1 ? many : one);
  const pill = (level, text) => h('span', { class: `pill ${level}` }, h('span', { 'aria-hidden': 'true' }, LEVEL_ICON[level]), text);
  const bar = h('div', { class: 'sumbar' },
    pill('error', `${n.error} ${plural(n.error, 'erreur', 'erreurs')}`),
    pill('warn', `${n.warn} ${plural(n.warn, 'avertissement', 'avertissements')}`),
    pill('ok', `${n.ok} ${plural(n.ok, 'contrôle réussi', 'contrôles réussis')}`));
  const wrap = h('div', null, bar,
    h('p', { class: 'checks-note' }, 'Ces contrôles recalculent les totaux, la TVA, les lignes, les IBAN et les identifiants français d’après les règles EN 16931. Ils aident à repérer une anomalie, mais ne remplacent pas la validation officielle (Schematron).'));
  const issues = checks.filter(c => c.level !== 'ok').sort((a, b) => ['error', 'warn', 'info'].indexOf(a.level) - ['error', 'warn', 'info'].indexOf(b.level));
  const passed = checks.filter(c => c.level === 'ok');
  if (issues.length) {
    wrap.append(h('h2', { class: 'check-h' }, 'À vérifier'), h('ul', { class: 'check-list' }, issues.map(checkItem)));
  } else {
    wrap.append(h('p', { class: 'check-h' }, 'Aucune anomalie détectée.'));
  }
  if (passed.length) {
    const d = h('details', { class: 'passed' }, h('summary', null, `Contrôles réussis (${passed.length})`), h('ul', { class: 'check-list dense' }, passed.map(checkItem)));
    if (!issues.length) d.open = true;
    wrap.append(d);
  }
  return wrap;
}

/* ============ PDF Factur-X / ZUGFeRD : extraction du XML intégré ============ */
// Un PDF Factur-X est un PDF/A-3 qui embarque la facture XML comme fichier joint. Plutôt que d'analyser
// toute la structure du PDF (xref, flux d'objets, arbre des noms), on parcourt ses flux d'octets :
// celui qui contient une facture XML est repéré, décompressé (FlateDecode) puis rendu tel quel.
const PDF_EMBEDDED = /\/Type\s*\/EmbeddedFile|\/Subtype\s*\/(?:text|application)(?:#2F|\/)(?:x-)?xml/i;
const PDF_NOT_XML = /\/Subtype\s*\/(?:Image|Form|Type1C|CIDFontType0C|OpenType)|\/Type\s*\/(?:XObject|ObjStm|XRef|Font|FontDescriptor|Metadata)|\/Length1\b|\/DCTDecode|\/JPXDecode|\/CCITTFaxDecode|\/JBIG2Decode/;
const INVOICE_ROOTS = new Set(['CrossIndustryInvoice', 'Invoice', 'CreditNote']);
const MAX_INFLATED = 120 * 1024 * 1024;

const isPdf = u8 => new TextDecoder('latin1').decode(u8.subarray(0, 1024)).includes('%PDF-');
const isZlib = b => b.length > 2 && (b[0] & 0x0f) === 8 && ((b[0] << 8) | b[1]) % 31 === 0;

function headText(b) {
  let enc = 'utf-8';
  if (b[0] === 0xFF && b[1] === 0xFE) enc = 'utf-16le';
  else if (b[0] === 0xFE && b[1] === 0xFF) enc = 'utf-16be';
  return new TextDecoder(enc).decode(b.subarray(0, 400));
}
const xmlLike = b => /^\s*<(?:\?xml|[A-Za-z_])/.test(headText(b));
function xmlRootName(text) {
  const m = /<(?![?!])(?:[\w.-]+:)?([\w.-]+)/.exec(text);
  return m ? m[1] : '';
}

// Décompresse un flux zlib. Avec headBytes, s'arrête dès que ce nombre d'octets est produit.
// Des octets parasites après la fin du flux font échouer la lecture : on garde alors ce qui a été produit.
async function inflate(raw, headBytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('DecompressionStream indisponible');
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(raw).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (headBytes && total >= headBytes) { reader.cancel().catch(() => {}); break; }
      if (total > MAX_INFLATED) { reader.cancel().catch(() => {}); throw new Error('Contenu décompressé trop volumineux'); }
    }
  } catch (e) {
    if (!chunks.length || total > MAX_INFLATED) throw e;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}

// s = contenu du PDF lu en latin1 (1 caractère = 1 octet, les positions sont donc des positions d'octets).
function pdfStreams(s) {
  const list = [];
  const re = /stream(?:\r\n|\n|\r)/g;
  let m;
  while ((m = re.exec(s))) {
    const i = m.index;
    if (s.charCodeAt(i - 1) === 100) continue; // « endstream »
    const objAt = s.lastIndexOf('obj', i);
    if (objAt < 0) continue;
    const dict = s.slice(objAt, i);
    const start = i + m[0].length;
    let end = -1;
    const len = /\/Length\s+(\d+)(?=\s*(?:\/|>>))/.exec(dict); // longueur directe (pas « 12 0 R »)
    if (len) {
      const e = start + Number(len[1]);
      if (/^\s*endstream/.test(s.slice(e, e + 16))) end = e;
    }
    if (end < 0) {
      end = s.indexOf('endstream', start);
      if (end < 0) continue;
      if (s.charCodeAt(end - 1) === 10) end--;
      if (s.charCodeAt(end - 1) === 13) end--;
    }
    re.lastIndex = end;
    const num = /(\d+)\s+\d+\s+$/.exec(s.slice(Math.max(0, objAt - 24), objAt));
    list.push({ obj: num ? Number(num[1]) : 0, dict, start, end });
  }
  return list;
}

// Noms des fichiers joints lisibles en clair : numéro d'objet du flux -> nom (ex. factur-x.xml).
function pdfEmbeddedNames(s) {
  const names = new Map();
  const re = /\/EF\s*<<([^>]*)>>/g;
  let m;
  while ((m = re.exec(s))) {
    const ref = /\/(?:UF|F)\s+(\d+)\s+\d+\s+R/.exec(m[1]);
    if (!ref) continue;
    const last = text => { let r = null; const x = /\/(?:UF|F)\s*\(([^)]{1,200})\)/g; let y; while ((y = x.exec(text))) r = y[1]; return r; };
    const nm = last(s.slice(Math.max(0, m.index - 400), m.index)) || last(s.slice(m.index, m.index + m[0].length + 200));
    if (nm) names.set(Number(ref[1]), nm);
  }
  return names;
}

async function extractFromPdf(u8) {
  const s = new TextDecoder('latin1').decode(u8);
  const names = pdfEmbeddedNames(s);
  const encrypted = /\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(s);
  const invoices = [];
  const others = [];
  let probed = 0;
  let failure = null;
  let unsupported = false;
  for (const st of pdfStreams(s)) {
    const flagged = PDF_EMBEDDED.test(st.dict);
    if (invoices.length && !flagged) continue; // une facture est trouvée : seules les pièces jointes déclarées comptent encore
    if (!flagged && PDF_NOT_XML.test(st.dict)) continue;
    if (/\/Predictor\b/.test(st.dict)) continue;
    const filters = ((/\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(st.dict) || [])[1] || '').match(/\/\w+/g) || [];
    const flate = filters.length === 1 && (filters[0] === '/FlateDecode' || filters[0] === '/Fl');
    if (filters.length && !flate) { if (flagged) unsupported = true; continue; }
    const raw = u8.subarray(st.start, st.end);
    if (!flagged && (raw.length > 30e6 || ++probed > 4000)) continue;
    try {
      let bytes = raw;
      if (flate) {
        if (!isZlib(raw)) continue;
        // Flux non désigné comme fichier joint : on regarde d'abord les premiers octets décompressés.
        if (!flagged && !xmlLike(await inflate(raw.subarray(0, 4096).slice(), 512))) continue;
        bytes = await inflate(raw.slice());
      }
      if (!xmlLike(bytes)) continue;
      const root = xmlRootName(decodeXml(bytes.subarray(0, 4096)));
      const hit = { bytes, root, name: names.get(st.obj) || '' };
      if (INVOICE_ROOTS.has(root)) {
        invoices.push(hit);
        if (!flagged) break; // trouvée par parcours : structure inhabituelle, on s'arrête là
      } else if (flagged) others.push(hit);
    } catch (e) {
      failure = failure || e;
    }
  }
  if (invoices.length) {
    // Plusieurs factures (ex. mises à jour successives du PDF) : on préfère un nom de fichier typique, puis la plus récente.
    const named = invoices.filter(i => /factur|zugferd|xrechnung|invoice/i.test(i.name));
    return { ok: true, ...(named.length ? named : invoices).at(-1) };
  }
  const pick = others.find(o => o.root === 'CrossIndustryDocument') || others[0];
  if (pick) return { ok: true, ...pick };
  if (encrypted) return { ok: false, reason: 'encrypted' };
  if (unsupported) return { ok: false, reason: 'unsupported' };
  if (failure) return { ok: false, reason: 'error', error: failure };
  return { ok: false, reason: 'none' };
}

/* ============ État et éléments ============ */
const state = { res: null, tab: 'facture', built: {}, blobUrls: [], source: null };
const PANELS = ['facture', 'controles', 'arbre', 'texte'];
const SAMPLE_NAMES = { cii: 'exemple-facturx.xml', ubl: 'exemple-ubl.xml', 'ubl-cn': 'exemple-avoir-ubl.xml', pdf: 'exemple-facturx.pdf' };
const MAX_BYTES = 40 * 1024 * 1024;
const el = {
  empty: $('#empty'), viewer: $('#viewer'), notice: $('#notice'), fileinfo: $('#fileinfo'), file: $('#file'), drop: $('#drop'),
  veil: $('#dropveil'), live: $('#live'), dlg: $('#dlg-paste'), pasteText: $('#paste-text'),
  btnOpen: $('#btn-open'), btnPaste: $('#btn-paste'), btnCodes: $('#btn-codes'), btnPrint: $('#btn-print'), btnClose: $('#btn-close'),
};
const announce = msg => { el.live.textContent = ''; setTimeout(() => { el.live.textContent = msg; }, 30); };

function setNotice(kind, message) {
  el.notice.className = `notice ${kind}`;
  el.notice.replaceChildren(h('p', null, message), h('button', { class: 'btn', type: 'button', 'aria-label': 'Fermer ce message', onclick: clearNotice }, '✕'));
  el.notice.hidden = false;
}
function clearNotice() { el.notice.hidden = true; el.notice.replaceChildren(); }

/* ============ Pièces jointes ============ */
function attachmentBlob(a, forDownload) {
  let bytes;
  try { bytes = b64ToBytes(a.b64); } catch { setNotice('err', 'Cette pièce jointe est illisible : son contenu base64 est invalide.'); return null; }
  // Seuls PDF et images courantes sont ouverts avec leur vrai type ; le reste est traité comme un téléchargement.
  return new Blob([bytes], { type: !forDownload && OPENABLE.has(a.mime) ? a.mime : 'application/octet-stream' });
}
function openAttachment(a) {
  const blob = attachmentBlob(a, false);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  state.blobUrls.push(url);
  window.open(url, '_blank', 'noopener');
}
function downloadAttachment(a) {
  const blob = attachmentBlob(a, true);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: safeName(a.filename || a.id) });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function revokeBlobs() { state.blobUrls.splice(0).forEach(u => URL.revokeObjectURL(u)); }

/* ============ Arbre XML ============ */
const nodeOf = new WeakMap();
const clip = s => (s.length > 300 ? `${s.slice(0, 160)} … [${s.length} caractères]` : s);

function treeNode(node, depth) {
  const attrs = Array.from(node.attributes).filter(a => !/^xmlns(:|$)/.test(a.name));
  const label = [h('span', { class: 'tn' }, node.nodeName), ...attrs.map(a => h('span', { class: 'ta' }, ` ${a.name}="${clip(a.value)}"`))];
  const kids = Array.from(node.children);
  if (!kids.length) {
    const t = node.textContent.trim();
    return h('div', { class: 'leaf' }, label, t ? h('span', { class: 'tv' }, ` ${clip(t)}`) : null);
  }
  const d = h('details', { 'data-depth': depth }, h('summary', null, label, h('span', { class: 'tc' }, ` (${kids.length})`)));
  nodeOf.set(d, node);
  d.addEventListener('toggle', () => { if (d.open) fillNode(d); });
  if (depth < 2) { d.open = true; fillNode(d); }
  return d;
}
function fillNode(d) {
  if (d.dataset.filled) return;
  d.dataset.filled = '1';
  const depth = Number(d.dataset.depth);
  const box = h('div', { class: 'kids' });
  Array.from(nodeOf.get(d).children).forEach(c => box.append(treeNode(c, depth + 1)));
  d.append(box);
}
function expandAll(box) {
  const todo = $$('details', box);
  while (todo.length) {
    const d = todo.pop();
    fillNode(d);
    d.open = true;
    const kids = d.querySelector(':scope > .kids');
    if (kids) todo.push(...Array.from(kids.children).filter(c => c.tagName === 'DETAILS'));
  }
}
function searchXml(root, q) {
  const needle = q.toLowerCase();
  const hits = [];
  const walk = (n, path) => {
    if (hits.length >= 300) return;
    const here = `${path}/${n.nodeName}`;
    for (const a of Array.from(n.attributes)) {
      if (/^xmlns(:|$)/.test(a.name)) continue;
      if (`${a.name}=${a.value}`.toLowerCase().includes(needle)) hits.push({ path: `${here}/@${a.name}`, value: a.value });
    }
    if (n.children.length) {
      if (n.nodeName.toLowerCase().includes(needle)) hits.push({ path: here, value: `(${n.children.length} éléments)` });
      Array.from(n.children).forEach(c => walk(c, here));
    } else {
      const t = n.textContent.trim();
      if (t && (t.toLowerCase().includes(needle) || n.nodeName.toLowerCase().includes(needle))) hits.push({ path: here, value: t });
    }
  };
  walk(root, '');
  return hits;
}
function renderHits(hits, q) {
  if (!hits.length) return h('p', { class: 'muted', style: 'padding:14px 16px' }, `Aucun résultat pour « ${q} ».`);
  return h('div', { class: 'tablewrap' },
    h('table', null,
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Chemin'), h('th', { scope: 'col' }, 'Valeur'))),
      h('tbody', null, hits.map(x => h('tr', null, h('td', null, x.path), h('td', null, clip(x.value)))))),
    hits.length >= 300 ? h('p', { class: 'muted', style: 'padding:10px 16px' }, 'Seuls les 300 premiers résultats sont affichés.') : null);
}
function buildTree(res) {
  const q = h('input', { id: 'tree-q', class: 'search', type: 'search', placeholder: 'Rechercher une valeur, une balise ou un attribut', autocomplete: 'off' });
  const expand = h('button', { class: 'btn', type: 'button' }, 'Tout déplier');
  const collapse = h('button', { class: 'btn', type: 'button' }, 'Tout replier');
  const box = h('div', { class: 'tree-box tree' }, treeNode(res.root, 0));
  const results = h('div', { class: 'results', hidden: true });
  expand.addEventListener('click', () => expandAll(box));
  collapse.addEventListener('click', () => $$('details', box).forEach(d => { d.open = false; }));
  q.addEventListener('input', () => {
    const v = q.value.trim();
    if (v.length < 2) { results.hidden = true; box.hidden = false; return; }
    results.replaceChildren(renderHits(searchXml(res.root, v), v));
    results.hidden = false;
    box.hidden = true;
  });
  return h('div', null,
    h('div', { class: 'toolbar' }, h('label', { class: 'sr', for: 'tree-q' }, 'Rechercher dans le XML'), q, expand, collapse),
    results, box);
}

/* ============ Texte XML ============ */
function replaceEsc(str, re, fn) {
  let out = '';
  let last = 0;
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(str))) {
    out += esc(str.slice(last, m.index)) + fn(m);
    last = m.index + m[0].length;
    if (!m[0].length) re.lastIndex++;
  }
  return out + esc(str.slice(last));
}
const TAG_RE = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][\w:.-]*(?:\s+[^\s=<>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>/g;
const ATTR_RE = /([^\s=<>/]+)(\s*=\s*)("[^"]*"|'[^']*')/g;
// Chaque morceau de texte passe par esc() : le résultat peut être injecté avec innerHTML.
function hlLine(line) {
  return replaceEsc(line, TAG_RE, m => {
    const s = m[0];
    if (s.startsWith('<!--') || s.startsWith('<?') || s.startsWith('<![CDATA[')) return `<span class="x-c">${esc(s)}</span>`;
    const p = /^(<\/?)([^\s>/]+)([\s\S]*?)(\/?>)$/.exec(s);
    if (!p) return esc(s);
    const attrs = replaceEsc(p[3], ATTR_RE, a => `<span class="x-n">${esc(a[1])}</span>${esc(a[2])}<span class="x-v">${esc(a[3])}</span>`);
    return `<span class="x-t">${esc(p[1] + p[2])}</span>${attrs}<span class="x-t">${esc(p[4])}</span>`;
  });
}
function prettyXml(doc) {
  const out = [];
  const a = e => Array.from(e.attributes).map(x => ` ${x.name}="${x.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}"`).join('');
  const t = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const walk = (n, d) => {
    const pad = '  '.repeat(d);
    if (!n.children.length) {
      const text = n.textContent.trim();
      out.push(text ? `${pad}<${n.nodeName}${a(n)}>${t(text)}</${n.nodeName}>` : `${pad}<${n.nodeName}${a(n)}/>`);
      return;
    }
    out.push(`${pad}<${n.nodeName}${a(n)}>`);
    Array.from(n.children).forEach(c => walk(c, d + 1));
    out.push(`${pad}</${n.nodeName}>`);
  };
  walk(doc.documentElement, 0);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${out.join('\n')}`;
}
function copyText(text, btn) {
  const label = btn.textContent;
  const done = msg => { btn.textContent = msg; setTimeout(() => { btn.textContent = label; }, 1600); };
  const fallback = () => {
    const ta = h('textarea', { class: 'sr', 'aria-hidden': 'true' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    done(ok ? 'Copié' : 'Copie impossible');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => done('Copié'), fallback);
  else fallback();
}
function buildSource(res) {
  const text = res.text.split('\n').length < 8 ? prettyXml(res.xml) : res.text;
  const lines = text.split(/\r?\n/);
  const LIMIT = 20000;
  const html = lines.slice(0, LIMIT).map((l, i) => {
    const shown = l.length > 400 ? `${l.slice(0, 220)} … [${l.length} caractères]` : l;
    return `<div class="ln"><span class="no">${i + 1}</span><span class="code">${hlLine(shown)}</span></div>`;
  }).join('');
  const box = h('div', { class: 'src', tabindex: '0', role: 'region', 'aria-label': 'Texte XML' });
  box.innerHTML = html;
  const copyBtn = h('button', { class: 'btn', type: 'button' }, 'Copier le XML');
  copyBtn.addEventListener('click', () => copyText(res.text, copyBtn));
  return h('div', null,
    h('div', { class: 'toolbar' }, copyBtn, lines.length > LIMIT ? h('span', { class: 'muted' }, `Affichage limité aux ${LIMIT} premières lignes sur ${lines.length}.`) : null),
    box);
}

/* ============ Onglets ============ */
const visibleTabs = () => $$('.tab').filter(t => !t.hidden);
function ensurePanel(name) {
  if (!state.res || state.built[name]) return;
  state.built[name] = true;
  if (name === 'arbre') $('#panel-arbre').replaceChildren(buildTree(state.res));
  if (name === 'texte') $('#panel-texte').replaceChildren(buildSource(state.res));
}
function setTab(name) {
  state.tab = name;
  $$('.tab').forEach(t => {
    const on = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  PANELS.forEach(p => { $(`#panel-${p}`).hidden = p !== name; });
  ensurePanel(name);
}

/* ============ Chargement ============ */
// source : { pdf, xmlName } quand le XML vient d'un PDF Factur-X ; absent pour un fichier XML.
function showResult(res, name, source) {
  revokeBlobs();
  state.res = res;
  state.built = {};
  state.source = source || null;
  const inv = res.inv;
  if (inv && source) inv.source = { pdfName: name, xmlName: source.xmlName };
  el.empty.hidden = true;
  el.viewer.hidden = false;
  el.fileinfo.hidden = false;
  // replaceChildren() écrirait « null » pour une valeur nulle : on ne passe que les éléments présents.
  el.fileinfo.replaceChildren(...[
    name ? h('span', { class: 'fname', title: name }, name) : null,
    h('span', { class: 'chip' }, inv ? `${inv.syntax} · ${profileOf(inv)}` : 'XML non reconnu'),
    source ? h('span', { class: 'chip neutral', title: 'Fichier XML trouvé dans le PDF' }, `XML intégré${source.xmlName ? ` : ${source.xmlName}` : ''}`) : null,
    source ? h('button', { class: 'btn sm', type: 'button', onclick: openOriginalPdf }, 'Voir le PDF') : null,
  ].filter(Boolean));
  el.btnCodes.hidden = !inv;
  el.btnPrint.hidden = !inv || window.top !== window.self;
  el.btnClose.hidden = false;
  $('#tab-facture').hidden = !inv;
  $('#tab-controles').hidden = !inv;
  PANELS.forEach(p => $(`#panel-${p}`).replaceChildren());

  const badge = $('#count-controles');
  if (inv) {
    $('#panel-facture').replaceChildren(renderSheet(inv));
    $('#panel-controles').replaceChildren(renderChecks(inv.checks));
    const n = summarizeChecks(inv.checks);
    const level = n.error ? 'error' : n.warn ? 'warn' : 'ok';
    const spoken = n.error ? `${n.error} erreur${n.error > 1 ? 's' : ''}` : n.warn ? `${n.warn} avertissement${n.warn > 1 ? 's' : ''}` : 'aucune anomalie';
    badge.className = `count ${level}`;
    badge.replaceChildren(h('span', { 'aria-hidden': 'true' }, n.error || n.warn || '✓'), h('span', { class: 'sr' }, spoken));
    clearNotice();
  } else if (res.error) {
    setNotice('warn', `Le fichier ressemble à du ${res.kind}, mais son analyse a échoué (${res.error.message}). L’arbre XML reste disponible.`);
  } else if (res.kind === 'ZUGFERD1') {
    setNotice('warn', 'Ce fichier est au format ZUGFeRD 1.0 (CrossIndustryDocument), qui n’est pas pris en charge. L’arbre XML reste disponible.');
  } else {
    setNotice('warn', `Ce XML n’est pas reconnu comme une facture UBL (Invoice, CreditNote) ou CII (CrossIndustryInvoice). Élément racine : ${res.root.nodeName}. L’arbre XML reste disponible.`);
  }
  setTab(inv ? 'facture' : 'arbre');
  window.scrollTo(0, 0);
  announce(inv ? `${typeLabel(inv)} ${inv.number} affichée.` : 'Fichier XML affiché, format de facture non reconnu.');
}
function loadText(text, name, source) {
  const res = analyze(text);
  if (res.fatal) {
    const msg = source ? `Le XML intégré à ce PDF est inutilisable. ${res.fatal}` : res.fatal;
    setNotice('err', msg);
    announce(msg);
    return false;
  }
  showResult(res, name, source);
  return true;
}
function closeInvoice() {
  revokeBlobs();
  state.res = null;
  state.source = null;
  state.built = {};
  PANELS.forEach(p => $(`#panel-${p}`).replaceChildren());
  el.viewer.hidden = true;
  el.empty.hidden = false;
  el.fileinfo.hidden = true;
  el.fileinfo.replaceChildren();
  [el.btnCodes, el.btnPrint, el.btnClose].forEach(b => { b.hidden = true; });
  clearNotice();
  announce('Facture fermée.');
}

// Décode selon le BOM ou la déclaration <?xml encoding="…"?> (UTF-8 par défaut).
function decodeXml(u8) {
  let enc = 'utf-8';
  if (u8[0] === 0xFF && u8[1] === 0xFE) enc = 'utf-16le';
  else if (u8[0] === 0xFE && u8[1] === 0xFF) enc = 'utf-16be';
  else {
    const m = /<\?xml[^>]*encoding\s*=\s*["']([\w.-]+)["']/i.exec(new TextDecoder('latin1').decode(u8.subarray(0, 200)));
    if (m) enc = m[1].toLowerCase();
  }
  try { return new TextDecoder(enc).decode(u8); } catch { return new TextDecoder('utf-8').decode(u8); }
}
async function readFile(file) {
  if (file.size > MAX_BYTES) { setNotice('err', `Ce fichier fait ${fmtBytes(file.size)} : il dépasse la limite de 40 Mo.`); return; }
  try {
    const u8 = new Uint8Array(await file.arrayBuffer());
    if (isPdf(u8)) await loadPdf(u8, file.name);
    else loadText(decodeXml(u8), file.name);
  } catch (e) {
    setNotice('err', `Impossible de lire ce fichier : ${e.message}`);
  }
}

const PDF_MESSAGES = {
  none: 'Ce PDF ne contient pas de facture électronique : aucun fichier XML Factur-X, ZUGFeRD ou UBL n’y est intégré. C’est probablement une facture PDF classique.',
  encrypted: 'Ce PDF est chiffré ou protégé par un mot de passe : son XML intégré ne peut pas être lu. Si vous avez le fichier XML à part, déposez-le directement.',
  unsupported: 'Un fichier XML est joint à ce PDF, mais il utilise un encodage que ce visualiseur ne sait pas lire. Si vous avez le fichier XML à part, déposez-le directement.',
};
// Extrait le XML intégré à un PDF Factur-X / ZUGFeRD, puis l'affiche comme n'importe quelle e-facture.
async function loadPdf(u8, name) {
  announce('Lecture du PDF en cours.');
  let r;
  try { r = await extractFromPdf(u8); } catch (e) { r = { ok: false, reason: 'error', error: e }; }
  if (!r.ok) {
    const noInflate = r.error && /DecompressionStream/.test(r.error.message);
    const msg = PDF_MESSAGES[r.reason] || (noInflate
      ? 'Ce navigateur ne sait pas décompresser le contenu du PDF. Utilisez une version récente de Chrome, Edge, Safari ou Firefox.'
      : `Lecture du PDF impossible : ${r.error ? r.error.message : 'format inattendu'}.`);
    setNotice(r.reason === 'none' || r.reason === 'unsupported' ? 'warn' : 'err', msg);
    announce(msg);
    return;
  }
  loadText(decodeXml(r.bytes), name, { pdf: u8, xmlName: r.name });
}
function openOriginalPdf() {
  if (!state.source) return;
  const url = URL.createObjectURL(new Blob([state.source.pdf], { type: 'application/pdf' }));
  state.blobUrls.push(url);
  window.open(url, '_blank', 'noopener');
}

/* ============ Événements ============ */
el.btnOpen.addEventListener('click', () => el.file.click());
el.file.addEventListener('change', () => {
  const f = el.file.files[0];
  el.file.value = '';
  if (f) readFile(f);
});
el.drop.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.file.click(); }
});

const hasFiles = e => Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes('Files');
let dragDepth = 0;
addEventListener('dragenter', e => { if (hasFiles(e)) { e.preventDefault(); dragDepth++; el.veil.hidden = false; } });
addEventListener('dragover', e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
addEventListener('dragleave', e => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) el.veil.hidden = true;
});
addEventListener('drop', e => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  el.veil.hidden = true;
  const f = e.dataTransfer.files[0];
  if (f) readFile(f);
});

addEventListener('paste', e => {
  if (e.target instanceof Element && e.target.closest('textarea, input')) return;
  const t = e.clipboardData && e.clipboardData.getData('text');
  if (t && t.trim().startsWith('<')) { e.preventDefault(); loadText(t, 'XML collé'); }
});
el.btnPaste.addEventListener('click', () => {
  el.pasteText.value = '';
  if (el.dlg.showModal) el.dlg.showModal(); else el.dlg.setAttribute('open', '');
  el.pasteText.focus();
});
$('#paste-cancel').addEventListener('click', () => el.dlg.close());
$('#paste-form').addEventListener('submit', e => {
  const t = el.pasteText.value;
  if (!t.trim()) { e.preventDefault(); el.pasteText.focus(); return; }
  loadText(t, 'XML collé');
});

$$('[data-sample]').forEach(b => b.addEventListener('click', () => {
  const id = b.dataset.sample;
  const content = $(`#sample-${id}`).textContent;
  if (id === 'pdf') loadPdf(b64ToBytes(content.trim()), SAMPLE_NAMES.pdf);
  else loadText(content, SAMPLE_NAMES[id]);
}));

$$('.tab').forEach(t => t.addEventListener('click', () => setTab(t.dataset.tab)));
$('.tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const tabs = visibleTabs();
  let i = tabs.findIndex(t => t.dataset.tab === state.tab);
  if (e.key === 'ArrowRight') i = (i + 1) % tabs.length;
  else if (e.key === 'ArrowLeft') i = (i - 1 + tabs.length) % tabs.length;
  else i = e.key === 'Home' ? 0 : tabs.length - 1;
  e.preventDefault();
  setTab(tabs[i].dataset.tab);
  tabs[i].focus();
});

function setCodes(on) {
  document.body.classList.toggle('codes', on);
  el.btnCodes.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('ev-codes', on ? '1' : '0'); } catch { /* stockage indisponible : sans conséquence */ }
}
el.btnCodes.addEventListener('click', () => setCodes(!document.body.classList.contains('codes')));
try { if (localStorage.getItem('ev-codes') === '1') setCodes(true); } catch { /* idem */ }

el.btnPrint.addEventListener('click', () => { setTab('facture'); window.print(); });
el.btnClose.addEventListener('click', closeInvoice);

})();
document.getElementById('footer-year').textContent = new Date().getFullYear();
