const fs = require("fs");
const path = require("path");

const START_DATE = new Date("2024-10-01");
const DAYS = 61;
const TARGET_TOTAL_LINES = 796;
const SUSPICIOUS_LINE_BUDGET = 44;

const COMPANY_CODE = "1000";
const CURRENCY = "EUR";

const GL = {
  BANK: "100000",
  AR: "110000",
  INVENTORY: "120000",
  PREPAID: "140000",
  AP: "200000",
  ACCRUAL: "220000",
  VAT_PAYABLE: "230000",
  REVENUE_CONSULTING: "400000",
  REVENUE_SUBSCRIPTION: "401000",
  REVENUE_DISCOUNT: "402000",
  COGS: "500000",
  PAYROLL: "510000",
  RENT: "520000",
  UTILITIES: "530000",
  TRAVEL: "540000",
  MARKETING: "550000",
  SOFTWARE: "560000",
  LEGAL: "570000",
  INSURANCE: "580000",
  OFFICE: "590000",
  REPAIRS: "600000",
  TRAINING: "610000",
  FREIGHT: "620000",
};

const EXPENSE_ACCOUNTS = [
  GL.COGS,
  GL.PAYROLL,
  GL.RENT,
  GL.UTILITIES,
  GL.TRAVEL,
  GL.MARKETING,
  GL.SOFTWARE,
  GL.LEGAL,
  GL.INSURANCE,
  GL.OFFICE,
  GL.REPAIRS,
  GL.TRAINING,
  GL.FREIGHT,
];

const COST_CENTERS = ["CC-FIN", "CC-OPS", "CC-SALES", "CC-HR", "CC-IT", "CC-MKT"];
const TAX_CODES = ["V0", "V1", "V2", "A0"];

const VENDORS = [
  { id: "V-AWS", label: "AWS Cloud" },
  { id: "V-MSFT", label: "Microsoft Services" },
  { id: "V-ADOBE", label: "Adobe Subscription" },
  { id: "V-RENT-01", label: "HQ Building Rent" },
  { id: "V-LAW-02", label: "Legal Advisory" },
  { id: "V-TRAVEL-09", label: "Corporate Travel" },
  { id: "V-OFFICE-11", label: "Office Supplier" },
  { id: "V-UTIL-22", label: "Utility Provider" },
];

const CUSTOMERS = [
  { id: "C-1001", label: "Nordic Retail GmbH" },
  { id: "C-1002", label: "Ardent Health AG" },
  { id: "C-1003", label: "Kite Mobility BV" },
  { id: "C-1004", label: "Cobalt Foods Ltd" },
  { id: "C-1005", label: "Summit Data SA" },
];

const PERIOD_TAGS = ["Oct/2024", "Nov/2024"];

function createRng(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const rnd = createRng(424242);

function randomInt(min, max) {
  return Math.floor(rnd() * (max - min + 1)) + min;
}

function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function chance(p) {
  return rnd() < p;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function randomPostingDate() {
  const date = new Date(START_DATE);
  date.setDate(date.getDate() + randomInt(0, DAYS - 1));
  return formatDate(date);
}

function round2(value) {
  return Number(value.toFixed(2));
}

function buildDocument({
  documentId,
  postingDate,
  text,
  taxCode,
  vendorId = null,
  customerId = null,
  costCenter = null,
  entries,
}) {
  const sum = round2(entries.reduce((acc, e) => acc + e.amount, 0));
  if (Math.abs(sum) > 0.001) {
    throw new Error(`Unbalanced template for document ${documentId}: ${sum}`);
  }

  return entries.map((entry, index) => ({
    company_code: COMPANY_CODE,
    posting_date: postingDate,
    document_id: String(documentId),
    line_id: index + 1,
    gl_account: entry.gl,
    cost_center: entry.cost_center ?? costCenter,
    amount: entry.amount,
    currency: CURRENCY,
    debit_credit: entry.amount >= 0 ? "S" : "H",
    booking_text: text,
    vendor_id: entry.vendor_id ?? vendorId,
    customer_id: entry.customer_id ?? customerId,
    tax_code: entry.tax_code ?? taxCode,
  }));
}

function createVendorInvoice(documentId) {
  const vendor = pick(VENDORS);
  const expense = pick(EXPENSE_ACCOUNTS);
  const net = round2(randomInt(300, 6500) + rnd());
  const taxRate = chance(0.15) ? 0 : chance(0.6) ? 0.19 : 0.07;
  const tax = round2(net * taxRate);
  const gross = round2(net + tax);
  const period = pick(PERIOD_TAGS);
  const postingDate = randomPostingDate();

  const entries = [
    { gl: expense, amount: net },
    { gl: GL.AP, amount: -gross, cost_center: null },
  ];
  if (tax > 0) {
    entries.splice(1, 0, { gl: GL.VAT_PAYABLE, amount: tax, cost_center: null });
  }

  return buildDocument({
    documentId,
    postingDate,
    text: `KR Vendor Inv ${documentId} ${vendor.label} ${period}`,
    taxCode: tax > 0 ? "V1" : "V0",
    vendorId: vendor.id,
    customerId: null,
    costCenter: pick(COST_CENTERS),
    entries,
  });
}

function createCustomerInvoice(documentId) {
  const customer = pick(CUSTOMERS);
  const revenue = chance(0.6) ? GL.REVENUE_SUBSCRIPTION : GL.REVENUE_CONSULTING;
  const gross = round2(randomInt(900, 9800) + rnd());
  const discount = chance(0.2) ? round2(gross * 0.05) : 0;
  const netRevenue = round2(gross - discount);
  const postingDate = randomPostingDate();

  const entries = [
    { gl: GL.AR, amount: gross, cost_center: null },
    { gl: revenue, amount: -netRevenue },
  ];
  if (discount > 0) {
    entries.push({ gl: GL.REVENUE_DISCOUNT, amount: -discount });
  }

  return buildDocument({
    documentId,
    postingDate,
    text: `DR Customer Inv ${documentId} ${customer.label}`,
    taxCode: "A0",
    vendorId: null,
    customerId: customer.id,
    costCenter: "CC-SALES",
    entries,
  });
}

function createApPayment(documentId) {
  const vendor = pick(VENDORS);
  const amount = round2(randomInt(400, 7000) + rnd());
  return buildDocument({
    documentId,
    postingDate: randomPostingDate(),
    text: `KZ Vendor Payment ${vendor.id} Ref ${randomInt(100000, 999999)}`,
    taxCode: "V0",
    vendorId: vendor.id,
    customerId: null,
    costCenter: null,
    entries: [
      { gl: GL.AP, amount, cost_center: null },
      { gl: GL.BANK, amount: -amount, cost_center: null },
    ],
  });
}

function createArReceipt(documentId) {
  const customer = pick(CUSTOMERS);
  const amount = round2(randomInt(700, 9000) + rnd());
  return buildDocument({
    documentId,
    postingDate: randomPostingDate(),
    text: `DZ Customer Receipt ${customer.id} Ref ${randomInt(100000, 999999)}`,
    taxCode: "A0",
    vendorId: null,
    customerId: customer.id,
    costCenter: null,
    entries: [
      { gl: GL.BANK, amount, cost_center: null },
      { gl: GL.AR, amount: -amount, cost_center: null },
    ],
  });
}

function createPayrollAccrual(documentId) {
  const amount = round2(randomInt(12000, 32000) + rnd());
  const month = pick(PERIOD_TAGS);
  return buildDocument({
    documentId,
    postingDate: randomPostingDate(),
    text: `SA Payroll Accrual ${month}`,
    taxCode: "V0",
    vendorId: null,
    customerId: null,
    costCenter: "CC-HR",
    entries: [
      { gl: GL.PAYROLL, amount },
      { gl: GL.ACCRUAL, amount: -amount, cost_center: null },
    ],
  });
}

function createAccrualReversal(documentId) {
  const amount = round2(randomInt(5000, 20000) + rnd());
  const month = pick(PERIOD_TAGS);
  return buildDocument({
    documentId,
    postingDate: randomPostingDate(),
    text: `AB Accrual Reversal ${month}`,
    taxCode: "V0",
    vendorId: null,
    customerId: null,
    costCenter: "CC-FIN",
    entries: [
      { gl: GL.ACCRUAL, amount },
      { gl: GL.PAYROLL, amount: -amount },
    ],
  });
}

const DOC_TYPES = [
  { weight: 34, create: createVendorInvoice },
  { weight: 24, create: createCustomerInvoice },
  { weight: 16, create: createApPayment },
  { weight: 14, create: createArReceipt },
  { weight: 7, create: createPayrollAccrual },
  { weight: 5, create: createAccrualReversal },
];

function pickDocFactory() {
  const total = DOC_TYPES.reduce((acc, t) => acc + t.weight, 0);
  let cursor = randomInt(1, total);
  for (const type of DOC_TYPES) {
    cursor -= type.weight;
    if (cursor <= 0) return type.create;
  }
  return DOC_TYPES[0].create;
}

function addSuspiciousCases(bookings, docId) {
  let current = docId;

  const typoPairs = [
    ["KR Vendor Inv 900001 Microsoft Services Nov/2024", "KR Vender Inv 900001 Microsoft Services Nov/2024"],
    ["KR Vendor Inv 900002 Office Supplier Nov/2024", "KR Vendor Inv 900002 Office Suplier Nov/2024"],
    ["DZ Customer Receipt C-1002 Ref 775521", "DZ Customer Reciept C-1002 Ref 775521"],
  ];

  for (const [cleanText, typoText] of typoPairs) {
    current += 1;
    bookings.push(
      ...buildDocument({
        documentId: current,
        postingDate: "2024-11-14",
        text: cleanText,
        taxCode: "V1",
        vendorId: "V-MSFT",
        customerId: null,
        costCenter: "CC-IT",
        entries: [
          { gl: GL.SOFTWARE, amount: 1250.0 },
          { gl: GL.AP, amount: -1487.5, cost_center: null },
          { gl: GL.VAT_PAYABLE, amount: 237.5, cost_center: null },
        ],
      }),
    );

    current += 1;
    bookings.push(
      ...buildDocument({
        documentId: current,
        postingDate: "2024-11-15",
        text: typoText,
        taxCode: "V1",
        vendorId: "V-MSFT",
        customerId: null,
        costCenter: "CC-IT",
        entries: [
          { gl: GL.SOFTWARE, amount: 1250.0 },
          { gl: GL.AP, amount: -1487.5, cost_center: null },
          { gl: GL.VAT_PAYABLE, amount: 237.5, cost_center: null },
        ],
      }),
    );
  }

  const duplicateText = "KZ Vendor Payment V-OFFICE-11 Ref 991774";
  for (let i = 0; i < 2; i++) {
    current += 1;
    bookings.push(
      ...buildDocument({
        documentId: current,
        postingDate: i === 0 ? "2024-11-05" : "2024-11-06",
        text: duplicateText,
        taxCode: "V0",
        vendorId: "V-OFFICE-11",
        entries: [
          { gl: GL.AP, amount: 980.75, cost_center: null },
          { gl: GL.BANK, amount: -980.75, cost_center: null },
        ],
      }),
    );
  }

  current += 1;
  bookings.push(
    ...buildDocument({
      documentId: current,
      postingDate: "2024-11-21",
      text: "KR Vendor Inv 900099 Coffee for customer workshop",
      taxCode: "V0",
      vendorId: "V-OFFICE-11",
      costCenter: "CC-FIN",
      entries: [
        { gl: GL.LEGAL, amount: 19.99 },
        { gl: GL.AP, amount: -19.99, cost_center: null },
      ],
    }),
  );

  const repeatedUtilityText = "KR Vendor Inv 900300 Utility Provider Nov/2024";
  for (let i = 0; i < 5; i++) {
    current += 1;
    bookings.push(
      ...buildDocument({
        documentId: current,
        postingDate: i < 3 ? "2024-11-08" : "2024-11-18",
        text: repeatedUtilityText,
        taxCode: "V0",
        vendorId: "V-UTIL-22",
        customerId: null,
        costCenter: "CC-OPS",
        entries: [
          { gl: GL.UTILITIES, amount: 640 + i * 5 },
          { gl: GL.AP, amount: -(640 + i * 5), cost_center: null },
        ],
      }),
    );
  }

  current += 1;
  bookings.push(
    ...buildDocument({
      documentId: current,
      postingDate: "2024-11-19",
      text: repeatedUtilityText,
      taxCode: "V0",
      vendorId: "V-UTIL-22",
      customerId: null,
      costCenter: "CC-OPS",
      entries: [
        { gl: GL.LEGAL, amount: 665.0 },
        { gl: GL.AP, amount: -665.0, cost_center: null },
      ],
    }),
  );

  current += 1;
  bookings.push(
    ...buildDocument({
      documentId: current,
      postingDate: "2024-11-20",
      text: "KR Vendor Inv 900300 Utility Provder Nov/2024",
      taxCode: "V0",
      vendorId: "V-UTIL-22",
      customerId: null,
      costCenter: "CC-OPS",
      entries: [
        { gl: GL.UTILITIES, amount: 668.0 },
        { gl: GL.AP, amount: -668.0, cost_center: null },
      ],
    }),
  );

  const malformedDocs = [
    { text: "TEST", amount: 222.0 },
    { text: "123456789", amount: 333.0 },
    { text: "XXX TEMP", amount: 444.0 },
  ];

  for (const malformed of malformedDocs) {
    current += 1;
    bookings.push(
      ...buildDocument({
        documentId: current,
        postingDate: "2024-11-22",
        text: malformed.text,
        taxCode: "V0",
        vendorId: "V-OFFICE-11",
        customerId: null,
        costCenter: "CC-FIN",
        entries: [
          { gl: GL.OFFICE, amount: malformed.amount },
          { gl: GL.AP, amount: -malformed.amount, cost_center: null },
        ],
      }),
    );
  }

  return current;
}

function validateData(bookings) {
  const docs = new Map();
  const glAccounts = new Set();

  for (const row of bookings) {
    glAccounts.add(row.gl_account);
    if (!docs.has(row.document_id)) docs.set(row.document_id, []);
    docs.get(row.document_id).push(row);
  }

  for (const [docId, rows] of docs.entries()) {
    if (rows.length < 2) {
      throw new Error(`Validation failed: document ${docId} has fewer than 2 lines.`);
    }
    const sum = round2(rows.reduce((acc, r) => acc + r.amount, 0));
    if (Math.abs(sum) > 0.001) {
      throw new Error(`Validation failed: document ${docId} is unbalanced.`);
    }
  }

  if (bookings.length < 200 || bookings.length > 800) {
    throw new Error(`Validation failed: line count ${bookings.length} outside 200..800.`);
  }

  if (glAccounts.size < 20 || glAccounts.size > 40) {
    throw new Error(`Validation failed: GL account count ${glAccounts.size} outside 20..40.`);
  }
}

function generateData() {
  const bookings = [];
  let docId = 4900000000;

  while (bookings.length < TARGET_TOTAL_LINES - SUSPICIOUS_LINE_BUDGET) {
    docId += 1;
    const create = pickDocFactory();
    bookings.push(...create(docId));
  }

  addSuspiciousCases(bookings, docId);
  validateData(bookings);

  const summary = `Generated ${bookings.length} booking lines across ${new Set(bookings.map((b) => b.document_id)).size} documents.`;
  const isDryRun = process.argv.includes("--dry-run");

  if (isDryRun) {
    console.log(`${summary} [dry-run]`);
    return;
  }

  const outPath = path.join(process.cwd(), "src/data/bookings.json");
  fs.writeFileSync(outPath, JSON.stringify(bookings, null, 2));
  console.log(summary);
}

generateData();
