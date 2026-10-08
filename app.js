/**
 * نظام Princess Store - كاشير ومخزون وسحابي متكامل
 * مزامنة سحابية صامتة وتلقائية بدون شاشات تسجيل دخول أو تعقيدات
 */

const APP_STATE = {
  products: [],
  sales: [],
  debts: [],
  cart: [],
  activeTab: 'tab-dashboard',
  unsubscribeProducts: null,
  unsubscribeSales: null,
  unsubscribeDebts: null
};

document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupNavigation();
  setupEventListeners();
  startClock();
  initCloudAndData();
});

// =======================================================
// المزامنة السحابية المباشرة في الخلفية
// =======================================================
function initCloudAndData() {
  loadLocalBackup();

  // الاتصال المباشر بالسحابة
  if (window.firebaseService && window.firebaseService.isConnected()) {
    const db = window.firebaseService.db;

    // 1. مزامنة المنتجات والمخزون لحظياً من السحابة
    APP_STATE.unsubscribeProducts = db.collection('products')
      .onSnapshot((snapshot) => {
        const prods = [];
        snapshot.forEach(doc => {
          prods.push({ id: doc.id, ...doc.data() });
        });
        APP_STATE.products = prods;
        saveLocalBackup('products', prods);
        refreshAllUI();
      }, (err) => {
        console.error('Cloud products sync error:', err);
      });

    // 2. مزامنة المبيعات لحظياً من السحابة
    APP_STATE.unsubscribeSales = db.collection('sales')
      .orderBy('date', 'desc')
      .onSnapshot((snapshot) => {
        const sales = [];
        snapshot.forEach(doc => {
          sales.push({ id: doc.id, ...doc.data() });
        });
        APP_STATE.sales = sales;
        saveLocalBackup('sales', sales);
        refreshAllUI();
      }, (err) => {
        console.error('Cloud sales sync error:', err);
      });

    // 3. مزامنة سجل الشكك وديون العملاء لحظياً من السحابة
    APP_STATE.unsubscribeDebts = db.collection('debts')
      .orderBy('createdAt', 'desc')
      .onSnapshot((snapshot) => {
        const debts = [];
        snapshot.forEach(doc => {
          debts.push({ id: doc.id, ...doc.data() });
        });
        APP_STATE.debts = debts;
        saveLocalBackup('debts', debts);
        renderDebtsTable();
        updateDebtsStats();
      }, (err) => {
        console.error('Cloud debts sync error:', err);
      });
  } else {
    refreshAllUI();
  }
}

function loadLocalBackup() {
  const savedProds = localStorage.getItem('princess_products');
  if (savedProds) {
    try { APP_STATE.products = JSON.parse(savedProds); } catch (e) {}
  } else {
    // منتجات أولية ترحيبية للمتجر
    APP_STATE.products = [
      { id: 'p1', name: 'مياه معدنية صغيرة', costPrice: 7, price: 10, stock: 24, minStock: 5 },
      { id: 'p2', name: 'عصير مانجو فريش', costPrice: 25, price: 35, stock: 4, minStock: 5 },
      { id: 'p3', name: 'شاي أحمر فاخر', costPrice: 10, price: 15, stock: 18, minStock: 3 },
      { id: 'p4', name: 'قهوة تركي مخصوص', costPrice: 18, price: 25, stock: 2, minStock: 4 },
      { id: 'p5', name: 'ساندوتش دجاج مشوي', costPrice: 45, price: 65, stock: 0, minStock: 3 }
    ];
    saveLocalBackup('products', APP_STATE.products);
  }

  const savedSales = localStorage.getItem('princess_sales');
  if (savedSales) {
    try { APP_STATE.sales = JSON.parse(savedSales); } catch (e) {}
  }

  const savedDebts = localStorage.getItem('princess_debts');
  if (savedDebts) {
    try { APP_STATE.debts = JSON.parse(savedDebts); } catch (e) {}
  }
}

function saveLocalBackup(key, data) {
  localStorage.setItem(`princess_${key}`, JSON.stringify(data));
}

// تحديث كافة الشاشات
function refreshAllUI() {
  updateDashboardStats();
  renderPosProducts();
  renderPosCart();
  renderProductsTable();
  renderSalesHistory();
  renderDailyConsolidatedReport();
  renderAdvancedReports();
  checkStockAlerts();
  renderDebtsTable();
  updateDebtsStats();
}

function formatMoney(num) {
  return Number(num || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(isoStr) {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12 || 12;
  return `${y}-${m}-${day} (${hours}:${minutes} ${ampm})`;
}

function formatTimeOnly(isoStr) {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// =======================================================
// 1. لوحة التحكم (Dashboard)
// =======================================================
function updateDashboardStats() {
  const todayStr = getTodayDateString();
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let todaySales = 0, weekSales = 0, monthSales = 0;
  const productSalesCount = {};

  APP_STATE.sales.forEach(sale => {
    if (sale.status === 'refunded') return;

    const saleTotal = parseFloat(sale.grandTotal) || 0;
    const saleDate = new Date(sale.date);

    if (sale.date && sale.date.startsWith(todayStr)) todaySales += saleTotal;
    if (saleDate >= startOfWeek) weekSales += saleTotal;
    if (saleDate >= startOfMonth) monthSales += saleTotal;

    (sale.items || []).forEach(item => {
      if (!productSalesCount[item.name]) productSalesCount[item.name] = { qty: 0, revenue: 0 };
      productSalesCount[item.name].qty += item.qty;
      productSalesCount[item.name].revenue += item.total;
    });
  });

  document.getElementById('dashTodaySales').textContent = formatMoney(todaySales);
  document.getElementById('dashWeekSales').textContent = formatMoney(weekSales);
  document.getElementById('dashMonthSales').textContent = formatMoney(monthSales);

  let totalPieces = 0, outOfStock = 0, lowStock = 0;
  APP_STATE.products.forEach(p => {
    const stock = parseInt(p.stock) || 0;
    const min = parseInt(p.minStock) || 3;
    totalPieces += stock;
    if (stock <= 0) outOfStock++;
    else if (stock <= min) lowStock++;
  });

  document.getElementById('dashTotalPieces').textContent = totalPieces;
  document.getElementById('dashTotalProducts').textContent = `${APP_STATE.products.length} منتج مسجل`;
  document.getElementById('dashOutOfStockCount').textContent = outOfStock;
  document.getElementById('dashLowStockCount').textContent = lowStock;

  const topList = Object.entries(productSalesCount)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  const topBody = document.getElementById('dashTopProductsTableBody');
  topBody.innerHTML = '';
  if (topList.length === 0) {
    topBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">لا توجد مبيعات مسجلة حتى الآن</td></tr>';
  } else {
    topList.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td>${item.qty} قطعة</td>
        <td style="font-weight:800; color:var(--success-color);">${formatMoney(item.revenue)} جنيه</td>
      `;
      topBody.appendChild(tr);
    });
  }

  const recentSales = APP_STATE.sales.slice(0, 5);
  const recBody = document.getElementById('dashRecentSalesTableBody');
  recBody.innerHTML = '';
  if (recentSales.length === 0) {
    recBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:var(--text-muted);">لا توجد عمليات بيع</td></tr>';
  } else {
    recentSales.forEach(s => {
      const isRefunded = s.status === 'refunded';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>#${s.saleNumber || s.id.slice(0,6)}</strong></td>
        <td>${formatTimeOnly(s.date)}</td>
        <td>${s.totalPieces || 0}</td>
        <td style="${isRefunded ? 'text-decoration: line-through; color: var(--text-muted);' : 'font-weight: 800;'}">
          ${formatMoney(s.grandTotal)} جنيه
        </td>
        <td>
          ${isRefunded ? '<span class="badge" style="background:var(--danger-light); color:var(--danger-color);">مسترجعة</span>' :
          `<button class="btn btn-sm btn-outline" onclick="refundSale('${s.id}')" title="استرجاع">إلغاء</button>`}
        </td>
      `;
      recBody.appendChild(tr);
    });
  }
}

// =======================================================
// 2. واجهة الكاشير والبيع (POS)
// =======================================================
function renderPosProducts() {
  const grid = document.getElementById('posProductsGrid');
  const search = (document.getElementById('posSearchProductInput').value || '').trim().toLowerCase();
  grid.innerHTML = '';

  const filtered = APP_STATE.products.filter(p => {
    if (!search) return true;
    return p.name && p.name.toLowerCase().includes(search);
  });

  document.getElementById('posAvailableCount').textContent = `${filtered.length} منتج`;

  if (filtered.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:30px; color:var(--text-muted);">لا توجد منتجات مطابقة</div>';
    return;
  }

  filtered.forEach(p => {
    const stock = parseInt(p.stock) || 0;
    const min = parseInt(p.minStock) || 3;
    const isOut = stock <= 0;
    const isLow = stock > 0 && stock <= min;

    let stockText = `متبقي: ${stock}`;
    let badgeClass = 'badge-stock-available';
    if (isOut) {
      stockText = 'خلص / غير متوفر';
      badgeClass = 'badge-stock-out';
    } else if (isLow) {
      stockText = `منخفض (متبقي ${stock})`;
      badgeClass = 'badge-stock-low';
    }

    const tile = document.createElement('div');
    tile.className = `product-tile ${isOut ? 'tile-disabled' : ''}`;
    tile.onclick = () => {
      if (!isOut) addProductToCart(p);
      else showToast('⚠️ هذا المنتج غير متوفر حالياً في المخزون (0 قطع)');
    };

    const costPrice = p.costPrice !== undefined ? Number(p.costPrice) : 0;
    const sellPrice = Number(p.price) || 0;
    const unitProfit = sellPrice - costPrice;

    tile.innerHTML = `
      <div>
        <div class="tile-title">${escapeHtml(p.name)}</div>
        <div class="tile-stock">
          <span class="badge-stock ${badgeClass}">${stockText}</span>
          <div style="font-size:0.77rem; font-weight:700; color:var(--text-muted); margin-top:3px;">
            سعر الجملة: <strong style="color:var(--text-main);">${formatMoney(costPrice)}</strong> ج
          </div>
        </div>
      </div>
      <div style="margin-top:6px;">
        <div class="tile-price">${formatMoney(sellPrice)} <small style="font-size:0.75rem;">جنيه</small></div>
        <div style="font-size:0.72rem; font-weight:800; color:var(--success-color);">الربح: ${formatMoney(unitProfit)} ج</div>
      </div>
    `;
    grid.appendChild(tile);
  });
}

function addProductToCart(product) {
  const currentStock = parseInt(product.stock) || 0;
  if (currentStock <= 0) {
    showToast('⚠️ لا يمكن إضافة المنتج، الكمية بالمخزون صفر!');
    return;
  }

  const existing = APP_STATE.cart.find(i => i.id === product.id);
  if (existing) {
    if (existing.qty + 1 > currentStock) {
      showToast(`⚠️ لا يمكنك بيع أكثر من المتوفر في المخزون (المتبقي: ${currentStock} فقط)`);
      return;
    }
    existing.qty += 1;
    existing.total = existing.qty * existing.price;
  } else {
    APP_STATE.cart.push({
      id: product.id,
      name: product.name,
      price: parseFloat(product.price),
      costPrice: parseFloat(product.costPrice || 0),
      stock: currentStock,
      qty: 1,
      total: parseFloat(product.price)
    });
  }
  renderPosCart();
}

function changeCartQty(index, delta) {
  const item = APP_STATE.cart[index];
  if (!item) return;

  const targetProd = APP_STATE.products.find(p => p.id === item.id);
  const realStock = targetProd ? parseInt(targetProd.stock) : item.stock;

  const newQty = item.qty + delta;
  if (newQty > realStock) {
    showToast(`⚠️ لا يمكنك بيع أكثر من المتوفر في المخزون (المتبقي: ${realStock} فقط)`);
    return;
  }

  if (newQty <= 0) {
    APP_STATE.cart.splice(index, 1);
  } else {
    item.qty = newQty;
    item.total = item.qty * item.price;
  }
  renderPosCart();
}

function removeCartItem(index) {
  APP_STATE.cart.splice(index, 1);
  renderPosCart();
}

function updatePosCheckoutAmounts() {
  const grandTotal = APP_STATE.cart.reduce((sum, item) => sum + item.total, 0);
  const payMethodSelect = document.getElementById('posPaymentMethod');
  const method = payMethodSelect ? payMethodSelect.value : 'cash';
  const paidInput = document.getElementById('posPaidAmount');
  const remRow = document.getElementById('posRemainingRow');
  const remVal = document.getElementById('posRemainingVal');

  if (paidInput) {
    if (method === 'cash' || method === 'electronic') {
      paidInput.value = grandTotal > 0 ? grandTotal : '';
    } else if (method === 'credit') {
      paidInput.value = '0';
    }
  }

  const currentPaid = paidInput ? (parseFloat(paidInput.value) || 0) : grandTotal;
  const remaining = Math.max(0, grandTotal - currentPaid);

  if (remRow && remVal) {
    if (remaining > 0 && grandTotal > 0) {
      remRow.style.display = 'flex';
      remVal.textContent = `${formatMoney(remaining)} جنيه`;
    } else {
      remRow.style.display = 'none';
    }
  }
}

function updatePosCustomersList() {
  const datalist = document.getElementById('posRegisteredCustomersList');
  if (!datalist) return;

  const namesSet = new Set();
  (APP_STATE.sales || []).forEach(s => {
    if (s.customerName && s.customerName !== 'عميل نقدي') namesSet.add(s.customerName);
  });
  (APP_STATE.debts || []).forEach(d => {
    if (d.customerName) namesSet.add(d.customerName);
  });

  datalist.innerHTML = '';
  namesSet.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    datalist.appendChild(opt);
  });
}

function renderPosCart() {
  const tbody = document.getElementById('posCartTableBody');
  const emptyState = document.getElementById('posEmptyCartState');
  tbody.innerHTML = '';

  if (APP_STATE.cart.length === 0) {
    emptyState.style.display = 'block';
  } else {
    emptyState.style.display = 'none';
    APP_STATE.cart.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <strong>${escapeHtml(item.name)}</strong>
          <div style="font-size:0.75rem; color:var(--text-muted);">الجملة: ${formatMoney(item.costPrice || 0)} ج</div>
        </td>
        <td>${formatMoney(item.price)}</td>
        <td>
          <div class="qty-control">
            <button class="qty-btn" onclick="changeCartQty(${index}, -1)">-</button>
            <span class="qty-number">${item.qty}</span>
            <button class="qty-btn" onclick="changeCartQty(${index}, 1)">+</button>
          </div>
        </td>
        <td><strong>${formatMoney(item.total)}</strong></td>
        <td><button class="action-mini-btn btn-delete" onclick="removeCartItem(${index})" title="حذف">&times;</button></td>
      `;
      tbody.appendChild(tr);
    });
  }

  const grandTotal = APP_STATE.cart.reduce((sum, item) => sum + item.total, 0);
  document.getElementById('posCartGrandTotal').textContent = formatMoney(grandTotal);

  const saleSeq = APP_STATE.sales.length + 101;
  const d = new Date();
  const dateCode = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  document.getElementById('posSaleNumber').textContent = `#INV-${dateCode}-${saleSeq}`;

  updatePosCheckoutAmounts();
  updatePosCustomersList();
}

// إتمام عملية البيع وخصم المخزون مع حفظ الفاتورة المستقلة
async function completeSale() {
  if (APP_STATE.cart.length === 0) {
    showToast('⚠️ سلة البيع فارغة! اختر منتجات للبيع أولاً');
    return;
  }

  for (const item of APP_STATE.cart) {
    const prod = APP_STATE.products.find(p => p.id === item.id);
    if (!prod || prod.stock < item.qty) {
      alert(`عفواً! كمية المنتج "${item.name}" غير كافية بالمخزون. المتاح حالياً: ${prod ? prod.stock : 0}`);
      return;
    }
  }

  const grandTotal = APP_STATE.cart.reduce((sum, i) => sum + i.total, 0);
  const totalPieces = APP_STATE.cart.reduce((sum, i) => sum + i.qty, 0);
  const saleSeq = APP_STATE.sales.length + 101;
  const now = new Date();
  const dateCode = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const invoiceNumber = `INV-${dateCode}-${saleSeq}`;

  const customerName = (document.getElementById('posCustomerName').value || '').trim() || 'عميل نقدي';
  const customerPhone = (document.getElementById('posCustomerPhone').value || '').trim();
  const paymentMethod = document.getElementById('posPaymentMethod').value || 'cash';
  const paidInputVal = document.getElementById('posPaidAmount').value;
  const paidAmount = paidInputVal !== '' ? (parseFloat(paidInputVal) || 0) : grandTotal;
  const remainingAmount = Math.max(0, grandTotal - paidAmount);
  const notes = (document.getElementById('posInvoiceNotes').value || '').trim();

  let status = 'paid';
  if (remainingAmount > 0) {
    status = paidAmount > 0 ? 'partial' : 'unpaid';
  }

  const initialPayments = paidAmount > 0 ? [{
    id: 'pay_' + Date.now(),
    amount: paidAmount,
    date: now.toISOString(),
    note: `دفعة أولية (${paymentMethod === 'electronic' ? 'إلكتروني' : 'نقداً'})`
  }] : [];

  const newSale = {
    saleNumber: invoiceNumber,
    invoiceNumber: invoiceNumber,
    date: now.toISOString(),
    customerName,
    customerPhone,
    paymentMethod,
    paidAmount,
    remainingAmount,
    status,
    items: JSON.parse(JSON.stringify(APP_STATE.cart)),
    totalPieces,
    grandTotal,
    notes,
    payments: initialPayments,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };

  const btn = document.getElementById('posCompleteSaleBtn');
  btn.disabled = true;
  btn.textContent = 'جاري إتمام الفاتورة وتحديث المخزون...';

  try {
    let savedSaleId = 'sale_' + Date.now();

    if (window.firebaseService && window.firebaseService.isConnected()) {
      const db = window.firebaseService.db;
      const batch = db.batch();

      APP_STATE.cart.forEach(item => {
        const prodRef = db.collection('products').doc(item.id);
        batch.update(prodRef, {
          stock: firebase.firestore.FieldValue.increment(-item.qty),
          updatedAt: new Date().toISOString()
        });
      });

      const saleRef = db.collection('sales').doc();
      savedSaleId = saleRef.id;
      newSale.id = savedSaleId;
      batch.set(saleRef, newSale);

      // إذا كان هناك متبقي (شكك / آجل)، ربطه بمجموعة ديون وشكك العملاء تلقائياً
      if (remainingAmount > 0 && customerName !== 'عميل نقدي') {
        const debtRef = db.collection('debts').doc();
        const itemsSummary = (APP_STATE.cart || []).map(i => `${i.name} × ${i.qty}`).join(' + ');
        batch.set(debtRef, {
          customerName,
          phone: customerPhone,
          items: `فاتورة #${invoiceNumber}: ${itemsSummary}`,
          quantity: `${totalPieces} قطعة`,
          totalAmount: grandTotal,
          paidAmount,
          remainingAmount,
          status: 'active',
          date: now.toISOString().slice(0, 10),
          notes: notes ? `${notes} (فاتورة #${invoiceNumber})` : `فاتورة رقم #${invoiceNumber}`,
          payments: initialPayments,
          invoiceId: savedSaleId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        });
      }

      await batch.commit();
    } else {
      APP_STATE.cart.forEach(item => {
        const prod = APP_STATE.products.find(p => p.id === item.id);
        if (prod) prod.stock -= item.qty;
      });
      newSale.id = savedSaleId;
      APP_STATE.sales.unshift(newSale);

      if (remainingAmount > 0 && customerName !== 'عميل نقدي') {
        const itemsSummary = (APP_STATE.cart || []).map(i => `${i.name} × ${i.qty}`).join(' + ');
        APP_STATE.debts.unshift({
          id: 'debt_' + Date.now(),
          customerName,
          phone: customerPhone,
          items: `فاتورة #${invoiceNumber}: ${itemsSummary}`,
          quantity: `${totalPieces} قطعة`,
          totalAmount: grandTotal,
          paidAmount,
          remainingAmount,
          status: 'active',
          date: now.toISOString().slice(0, 10),
          notes: notes ? `${notes} (فاتورة #${invoiceNumber})` : `فاتورة رقم #${invoiceNumber}`,
          payments: initialPayments,
          invoiceId: savedSaleId,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString()
        });
        saveLocalBackup('debts', APP_STATE.debts);
      }

      saveLocalBackup('products', APP_STATE.products);
      saveLocalBackup('sales', APP_STATE.sales);
      refreshAllUI();
    }

    APP_STATE.cart = [];
    document.getElementById('posCustomerName').value = '';
    document.getElementById('posCustomerPhone').value = '';
    document.getElementById('posPaymentMethod').value = 'cash';
    document.getElementById('posPaidAmount').value = '';
    document.getElementById('posInvoiceNotes').value = '';
    renderPosCart();

    showToast(`✅ تم إنشاء الفاتورة #${invoiceNumber} بنجاح وخصم المخزون!`);
    
    // فتح الفاتورة تلقائياً للطباعة والمعاينة
    openInvoiceDetailsModal(savedSaleId);
  } catch (error) {
    console.error('Sale checkout error:', error);
    alert('حدث خطأ أثناء حفظ الفاتورة: ' + error.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      إتمام البيع وخصم المخزون
    `;
  }
}

// =======================================================
// 3. إدارة المنتجات والمخزون
// =======================================================
function renderProductsTable() {
  const tbody = document.getElementById('productsTableBody');
  const empty = document.getElementById('productsEmptyState');
  const search = (document.getElementById('productsSearchInput').value || '').trim().toLowerCase();
  const filter = document.getElementById('productsStockFilter').value;

  tbody.innerHTML = '';

  const filtered = APP_STATE.products.filter(p => {
    const stock = parseInt(p.stock) || 0;
    const min = parseInt(p.minStock) || 3;

    if (filter === 'available' && stock <= 0) return false;
    if (filter === 'low' && (stock <= 0 || stock > min)) return false;
    if (filter === 'out' && stock > 0) return false;

    if (search && (!p.name || !p.name.toLowerCase().includes(search))) return false;

    return true;
  });

  if (filtered.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    filtered.forEach(p => {
      const stock = parseInt(p.stock) || 0;
      const min = parseInt(p.minStock) || 3;
      const isOut = stock <= 0;
      const isLow = stock > 0 && stock <= min;

      let badgeHtml = '<span class="badge-stock badge-stock-available">متوفر</span>';
      if (isOut) badgeHtml = '<span class="badge-stock badge-stock-out">خلص / غير متوفر</span>';
      else if (isLow) badgeHtml = `<span class="badge-stock badge-stock-low">المخزون منخفض (متبقي ${stock})</span>`;

      const costPrice = p.costPrice !== undefined ? Number(p.costPrice) : 0;
      const price = Number(p.price) || 0;
      const profit = price - costPrice;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${costPrice > 0 ? formatMoney(costPrice) : '<span style="color:var(--text-muted)">0.00</span>'}</td>
        <td><strong>${formatMoney(price)}</strong></td>
        <td><strong style="color:${profit >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}; font-size:0.95rem;">${formatMoney(profit)} جنيه</strong></td>
        <td style="font-weight:800; font-size:1.05rem;">${stock}</td>
        <td>${min}</td>
        <td>${badgeHtml}</td>
        <td>
          <button class="action-mini-btn" onclick="openEditProductModal('${p.id}')" title="تعديل">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="action-mini-btn btn-delete" onclick="deleteProduct('${p.id}')" title="حذف">&times;</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // تحديث إحصائيات تقييم المخزون الرباعية وملخص الجدول
  updateInventoryValuationStats();
}

// حساب إجمالي قيمة المخزون بالجملة والبيع والربح المتوقع والقطع
function updateInventoryValuationStats() {
  let costTotal = 0;
  let retailTotal = 0;
  let piecesTotal = 0;
  const products = APP_STATE.products || [];
  const productsCount = products.length;

  products.forEach(p => {
    const stock = parseInt(p.stock) || 0;
    const cost = parseFloat(p.costPrice) || 0;
    const price = parseFloat(p.price) || 0;
    if (stock > 0) {
      costTotal += stock * cost;
      retailTotal += stock * price;
      piecesTotal += stock;
    }
  });

  const profitExpected = Math.max(0, retailTotal - costTotal);

  const costEl = document.getElementById('invCostTotal');
  if (costEl) costEl.textContent = formatMoney(costTotal);

  const retailEl = document.getElementById('invRetailTotal');
  if (retailEl) retailEl.textContent = formatMoney(retailTotal);

  const profitEl = document.getElementById('invProfitExpected');
  if (profitEl) profitEl.textContent = formatMoney(profitExpected);

  const piecesEl = document.getElementById('invPiecesTotal');
  if (piecesEl) piecesEl.textContent = piecesTotal.toLocaleString('en-US');

  // شريط ملخص أسفل جدول المنتجات
  const fProd = document.getElementById('invFooterProductsCount');
  if (fProd) fProd.textContent = `${productsCount} صنف`;

  const fPieces = document.getElementById('invFooterPiecesCount');
  if (fPieces) fPieces.textContent = `${piecesTotal} قطعة`;

  const fCost = document.getElementById('invFooterCostSum');
  if (fCost) fCost.textContent = `${formatMoney(costTotal)} جنيه`;

  const fRetail = document.getElementById('invFooterRetailSum');
  if (fRetail) fRetail.textContent = `${formatMoney(retailTotal)} جنيه`;

  const fProfit = document.getElementById('invFooterProfitSum');
  if (fProfit) fProfit.textContent = `${formatMoney(profitExpected)} جنيه`;
}

function updateProfitPreview() {
  const cost = parseFloat(document.getElementById('prodFormCostPrice').value) || 0;
  const sell = parseFloat(document.getElementById('prodFormPrice').value) || 0;
  const profit = sell - cost;
  const preview = document.getElementById('profitPreviewVal');
  if (preview) {
    preview.textContent = `${formatMoney(profit)} جنيه`;
    preview.style.color = profit >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
  }
}

function normalizeProductName(str) {
  return (str || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ');
}

function checkDuplicateProductName() {
  const nameInput = document.getElementById('prodFormName');
  const alertBox = document.getElementById('duplicateProductAlert');
  const submitBtn = document.getElementById('saveProductSubmitBtn');
  const currentId = document.getElementById('formProductId').value;

  const rawName = nameInput.value.trim();
  const normalized = normalizeProductName(rawName);

  if (!normalized) {
    alertBox.style.display = 'none';
    nameInput.style.borderColor = 'var(--border-color)';
    submitBtn.disabled = false;
    return;
  }

  const duplicate = APP_STATE.products.find(p => {
    if (currentId && p.id === currentId) return false;
    return normalizeProductName(p.name) === normalized;
  });

  if (duplicate) {
    alertBox.style.display = 'block';
    alertBox.innerHTML = `⚠️ <strong>تنبيه:</strong> المنتج "<strong>${escapeHtml(duplicate.name)}</strong>" مسجل بالفعل في المخزون!<br>المتبقي منه: <strong>${duplicate.stock} قطعة</strong> بسعر بيع <strong>${formatMoney(duplicate.price)} جنيه</strong>.<br><span style="color:var(--danger-color); font-size:0.8rem;">لا يمكن تكرار نفس اسم المنتج. يمكنك تعديل كميته وسعره بدلاً من إضافته مرة أخرى.</span>`;
    nameInput.style.borderColor = 'var(--danger-color)';
    submitBtn.disabled = true;
  } else {
    alertBox.style.display = 'none';
    nameInput.style.borderColor = 'var(--border-color)';
    submitBtn.disabled = false;
  }
}

function openAddProductModal() {
  document.getElementById('productForm').reset();
  document.getElementById('formProductId').value = '';
  document.getElementById('modalProductTitle').textContent = 'إضافة منتج جديد';
  document.getElementById('prodFormCostPrice').value = '0';
  document.getElementById('prodFormPrice').value = '';
  document.getElementById('prodFormStock').value = '';
  document.getElementById('prodFormMinStock').value = '3';
  updateProfitPreview();
  
  const alertBox = document.getElementById('duplicateProductAlert');
  if (alertBox) alertBox.style.display = 'none';
  const nameInput = document.getElementById('prodFormName');
  if (nameInput) nameInput.style.borderColor = 'var(--border-color)';
  document.getElementById('saveProductSubmitBtn').disabled = false;

  openModal('modalProduct');
}

window.openEditProductModal = function(id) {
  const p = APP_STATE.products.find(prod => prod.id === id);
  if (!p) return;

  document.getElementById('formProductId').value = p.id;
  document.getElementById('prodFormName').value = p.name;
  document.getElementById('prodFormCostPrice').value = p.costPrice !== undefined ? p.costPrice : 0;
  document.getElementById('prodFormPrice').value = p.price;
  document.getElementById('prodFormStock').value = p.stock;
  document.getElementById('prodFormMinStock').value = p.minStock || 3;
  document.getElementById('modalProductTitle').textContent = 'تعديل بيانات المنتج';
  updateProfitPreview();

  const alertBox = document.getElementById('duplicateProductAlert');
  if (alertBox) alertBox.style.display = 'none';
  const nameInput = document.getElementById('prodFormName');
  if (nameInput) nameInput.style.borderColor = 'var(--border-color)';
  document.getElementById('saveProductSubmitBtn').disabled = false;

  openModal('modalProduct');
};

async function saveProductForm(e) {
  e.preventDefault();
  const id = document.getElementById('formProductId').value;
  const name = document.getElementById('prodFormName').value.trim();
  const costPrice = parseFloat(document.getElementById('prodFormCostPrice').value) || 0;
  const price = parseFloat(document.getElementById('prodFormPrice').value);
  const stock = parseInt(document.getElementById('prodFormStock').value);
  const minStock = parseInt(document.getElementById('prodFormMinStock').value) || 3;

  if (!name || isNaN(price) || isNaN(stock)) return;

  // التحقق الحاسم من عدم تكرار اسم المنتج
  const normalized = normalizeProductName(name);
  const duplicate = APP_STATE.products.find(p => {
    if (id && p.id === id) return false;
    return normalizeProductName(p.name) === normalized;
  });

  if (duplicate) {
    alert(`⚠️ لا يمكن تكرار اسم المنتج!\n\nالمنتج "${duplicate.name}" مسجل بالفعل في المخزون (المتبقي: ${duplicate.stock} قطعة).\n\nالنظام يمنع تكرار أي صنف بنفس الاسم، يمكنك تعديل الصنف الموجود بدلاً من إضافته مرة أخرى.`);
    document.getElementById('prodFormName').focus();
    return;
  }

  const btn = document.getElementById('saveProductSubmitBtn');
  btn.disabled = true;

  try {
    if (window.firebaseService && window.firebaseService.isConnected()) {
      const db = window.firebaseService.db;
      const col = db.collection('products');

      if (id) {
        await col.doc(id).update({
          name, costPrice, price, stock, minStock,
          updatedAt: new Date().toISOString()
        });
        showToast('✅ تم تحديث المنتج بنجاح');
      } else {
        await col.add({
          name, costPrice, price, stock, minStock,
          createdAt: new Date().toISOString()
        });
        showToast('✅ تمت إضافة المنتج بنجاح');
      }
    } else {
      if (id) {
        const idx = APP_STATE.products.findIndex(p => p.id === id);
        if (idx !== -1) APP_STATE.products[idx] = { id, name, costPrice, price, stock, minStock };
      } else {
        APP_STATE.products.push({ id: 'p_' + Date.now(), name, costPrice, price, stock, minStock });
      }
      saveLocalBackup('products', APP_STATE.products);
      refreshAllUI();
      showToast('تم حفظ المنتج بنجاح');
    }

    closeModal('modalProduct');
  } catch (err) {
    console.error('Error saving product:', err);
    alert('حدث خطأ أثناء حفظ المنتج: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

window.deleteProduct = async function(id) {
  const p = APP_STATE.products.find(prod => prod.id === id);
  if (!p) return;

  if (!confirm(`هل أنت متأكد من حذف المنتج "${p.name}"؟`)) return;

  try {
    if (window.firebaseService && window.firebaseService.isConnected()) {
      await window.firebaseService.db.collection('products').doc(id).delete();
      showToast('تم حذف المنتج');
    } else {
      APP_STATE.products = APP_STATE.products.filter(prod => prod.id !== id);
      saveLocalBackup('products', APP_STATE.products);
      refreshAllUI();
      showToast('تم حذف المنتج');
    }
  } catch (err) {
    console.error('Delete product error:', err);
    alert('فشل حذف المنتج: ' + err.message);
  }
};

// =======================================================
// 4. سجل الفواتير والمبيعات وإدارة السداد والاسترجاع
// =======================================================
function renderSalesHistory() {
  const period = document.getElementById('salesPeriodFilter').value;
  const statusFilter = document.getElementById('salesStatusFilter') ? document.getElementById('salesStatusFilter').value : 'all';
  const search = (document.getElementById('salesSearchInput').value || '').trim().toLowerCase();
  const tbody = document.getElementById('salesTableBody');
  const empty = document.getElementById('salesEmptyState');
  tbody.innerHTML = '';

  const now = new Date();
  const todayStr = getTodayDateString();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const filtered = APP_STATE.sales.filter(s => {
    const saleDate = new Date(s.date);
    if (period === 'today' && !s.date.startsWith(todayStr)) return false;
    if (period === 'week' && saleDate < startOfWeek) return false;
    if (period === 'month' && saleDate < startOfMonth) return false;

    const isRefunded = s.status === 'refunded';
    const rem = s.remainingAmount !== undefined ? parseFloat(s.remainingAmount) : 0;
    const paid = s.paidAmount !== undefined ? parseFloat(s.paidAmount) : parseFloat(s.grandTotal);

    if (statusFilter === 'refunded' && !isRefunded) return false;
    if (statusFilter === 'paid' && (isRefunded || rem > 0)) return false;
    if (statusFilter === 'partial' && (isRefunded || rem <= 0 || paid <= 0)) return false;
    if (statusFilter === 'unpaid' && (isRefunded || paid > 0 || rem <= 0)) return false;

    if (search) {
      const matchNum = (s.invoiceNumber || s.saleNumber || '').toLowerCase().includes(search);
      const matchCustomer = (s.customerName || '').toLowerCase().includes(search);
      const matchPhone = (s.customerPhone || '').includes(search);
      const matchDate = s.date && s.date.includes(search);
      if (!matchNum && !matchCustomer && !matchPhone && !matchDate) return false;
    }
    return true;
  });

  let totRev = 0, totPieces = 0, opsCount = 0;
  const prodCounts = {};

  filtered.forEach(s => {
    if (s.status !== 'refunded') {
      totRev += (parseFloat(s.grandTotal) || 0);
      totPieces += (parseInt(s.totalPieces) || 0);
      opsCount++;

      (s.items || []).forEach(item => {
        prodCounts[item.name] = (prodCounts[item.name] || 0) + item.qty;
      });
    }
  });

  let topProdName = '--';
  let topMax = 0;
  for (const [name, qty] of Object.entries(prodCounts)) {
    if (qty > topMax) { topMax = qty; topProdName = `${name} (${qty} ق)`; }
  }

  document.getElementById('salesTotalRevenue').textContent = formatMoney(totRev);
  document.getElementById('salesTotalOperations').textContent = opsCount;
  document.getElementById('salesTotalPieces').textContent = totPieces;
  document.getElementById('salesTopProduct').textContent = topProdName;

  if (filtered.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    filtered.forEach(s => {
      const isRefunded = s.status === 'refunded';
      const itemsSummary = (s.items || []).map(i => `${i.name} × ${i.qty}`).join(' ، ');
      const paid = s.paidAmount !== undefined ? parseFloat(s.paidAmount) : parseFloat(s.grandTotal);
      const remaining = s.remainingAmount !== undefined ? parseFloat(s.remainingAmount) : 0;
      const invNum = s.invoiceNumber || s.saleNumber || (s.id ? s.id.slice(0,6) : '--');

      let statusBadge = '';
      if (isRefunded) {
        statusBadge = '<span class="badge" style="background:var(--danger-light); color:var(--danger-color);">ملغاة / مسترجعة</span>';
      } else if (remaining <= 0) {
        statusBadge = '<span class="badge" style="background:var(--success-light); color:var(--success-color);">مدفوعة بالكامل</span>';
      } else if (paid > 0) {
        statusBadge = '<span class="badge" style="background:#fff3cd; color:#856404; font-weight:700;">مدفوعة جزئياً</span>';
      } else {
        statusBadge = '<span class="badge" style="background:var(--danger-light); color:var(--danger-color); font-weight:700;">غير مدفوعة</span>';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>#${invNum}</strong></td>
        <td>
          <strong>${escapeHtml(s.customerName || 'عميل نقدي')}</strong>
          ${s.customerPhone ? `<div style="font-size:0.75rem; color:var(--text-muted); direction:ltr; text-align:right;">${escapeHtml(s.customerPhone)}</div>` : ''}
        </td>
        <td>${formatDate(s.date)}</td>
        <td>
          <div style="max-width: 220px; font-size: 0.85rem; line-height: 1.35;">${escapeHtml(itemsSummary || '--')}</div>
          <small class="text-muted">(${s.totalPieces || 0} قطعة)</small>
        </td>
        <td style="${isRefunded ? 'text-decoration: line-through; color: var(--text-muted);' : 'font-weight: 800; color: var(--primary-color);'}">
          ${formatMoney(s.grandTotal)} جنيه
        </td>
        <td style="font-weight: 700; color: var(--success-color);">
          ${formatMoney(paid)} جنيه
        </td>
        <td style="font-weight: 700; color: ${remaining > 0 ? 'var(--danger-color)' : 'var(--text-muted)'};">
          ${formatMoney(remaining)} جنيه
        </td>
        <td>${statusBadge}</td>
        <td>
          <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
            <button class="btn btn-sm btn-outline" onclick="openInvoiceDetailsModal('${s.id}')" title="عرض الفاتورة وطباعتها" style="padding: 4px 8px; font-size: 0.78rem;">
              عرض / طباعة
            </button>
            ${!isRefunded && remaining > 0 ? `
              <button class="btn btn-sm btn-success" onclick="openAddInvoicePaymentModal('${s.id}')" title="تسجيل دفعة جديدة" style="padding: 4px 8px; font-size: 0.78rem;">
                + دفعة
              </button>
            ` : ''}
            ${!isRefunded ? `
              <button class="action-mini-btn btn-delete" onclick="refundSale('${s.id}')" title="إلغاء واسترجاع الفاتورة">&times;</button>
            ` : ''}
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// عرض تفاصيل الفاتورة وطباعتها بصيغة حرارية / A4
window.openInvoiceDetailsModal = function(saleId) {
  const sale = APP_STATE.sales.find(s => s.id === saleId);
  if (!sale) return;

  const invNum = sale.invoiceNumber || sale.saleNumber || (sale.id ? sale.id.slice(0,6) : '--');
  document.getElementById('invModalInvoiceNumber').textContent = `#${invNum}`;
  document.getElementById('invModalDate').textContent = formatDate(sale.date);
  document.getElementById('invModalCustomer').textContent = sale.customerName || 'عميل نقدي';
  
  const phoneRow = document.getElementById('invModalPhoneRow');
  const phoneVal = document.getElementById('invModalPhone');
  if (sale.customerPhone) {
    phoneRow.style.display = 'flex';
    phoneVal.textContent = sale.customerPhone;
  } else {
    phoneRow.style.display = 'none';
  }

  const payMethodMap = {
    cash: 'نقدي (كاش)',
    electronic: 'دفع إلكتروني (محفظة / فيزا)',
    partial: 'دفع جزئي',
    debt: 'آجل (شكك بالكامل)'
  };
  document.getElementById('invModalPayMethod').textContent = payMethodMap[sale.paymentMethod] || 'نقدي';

  const isRefunded = sale.status === 'refunded';
  const paid = sale.paidAmount !== undefined ? parseFloat(sale.paidAmount) : parseFloat(sale.grandTotal);
  const remaining = sale.remainingAmount !== undefined ? parseFloat(sale.remainingAmount) : 0;

  let statusText = 'مدفوعة بالكامل';
  if (isRefunded) statusText = 'ملغاة / مسترجعة';
  else if (remaining > 0 && paid > 0) statusText = 'مدفوعة جزئياً';
  else if (remaining > 0 && paid <= 0) statusText = 'غير مدفوعة (آجل)';
  document.getElementById('invModalPayStatus').textContent = statusText;

  // الأصناف
  const itemsBody = document.getElementById('invModalItemsBody');
  itemsBody.innerHTML = '';
  (sale.items || []).forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="text-align: right;">${escapeHtml(item.name)}</td>
      <td style="text-align: center;">${item.qty}</td>
      <td style="text-align: center;">${formatMoney(item.price)}</td>
      <td style="text-align: left;"><strong>${formatMoney(item.total)}</strong></td>
    `;
    itemsBody.appendChild(tr);
  });

  document.getElementById('invModalGrandTotal').textContent = `${formatMoney(sale.grandTotal)} جنيه`;
  document.getElementById('invModalPaid').textContent = `${formatMoney(paid)} جنيه`;
  
  const remRow = document.getElementById('invModalRemainingRow');
  const remVal = document.getElementById('invModalRemaining');
  if (remaining > 0) {
    remRow.style.display = 'flex';
    remVal.textContent = `${formatMoney(remaining)} جنيه`;
  } else {
    remRow.style.display = 'none';
  }

  // سجل الدفعات السابقة المسددة
  const paySec = document.getElementById('invModalPaymentsSection');
  const payList = document.getElementById('invModalPaymentsList');
  if (sale.payments && sale.payments.length > 0) {
    paySec.style.display = 'block';
    payList.innerHTML = sale.payments.map(p => `
      <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:4px; border-bottom:1px dashed #eee; padding-bottom:2px;">
        <span>${formatDate(p.date)} - ${escapeHtml(p.note || 'دفعة')}</span>
        <strong>${formatMoney(p.amount)} جنيه</strong>
      </div>
    `).join('');
  } else {
    paySec.style.display = 'none';
    payList.innerHTML = '';
  }

  // الملاحظات
  const notesEl = document.getElementById('invModalNotes');
  if (sale.notes) {
    notesEl.style.display = 'block';
    notesEl.textContent = `ملاحظات: ${sale.notes}`;
  } else {
    notesEl.style.display = 'none';
  }

  // زر إضافة دفعة داخل الفاتورة
  const addPayBtn = document.getElementById('invModalAddPayBtn');
  if (addPayBtn) {
    if (!isRefunded && remaining > 0) {
      addPayBtn.style.display = 'inline-flex';
      addPayBtn.onclick = () => {
        closeModal('modalInvoiceDetails');
        openAddInvoicePaymentModal(sale.id);
      };
    } else {
      addPayBtn.style.display = 'none';
    }
  }

  openModal('modalInvoiceDetails');
};

function doPrintCustomerInvoice() {
  document.body.classList.add('printing-customer-invoice');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('printing-customer-invoice');
  }, 500);
}

// فتح نافذة سداد دفعة على فاتورة
window.openAddInvoicePaymentModal = function(saleId) {
  const sale = APP_STATE.sales.find(s => s.id === saleId);
  if (!sale) return;

  const remaining = sale.remainingAmount !== undefined ? parseFloat(sale.remainingAmount) : Math.max(0, sale.grandTotal - (sale.paidAmount || 0));
  if (remaining <= 0) {
    alert('هذه الفاتورة مسددة بالكامل ولا يوجد مبالغ متبقية عليها.');
    return;
  }

  document.getElementById('payInvoiceId').value = sale.id;
  document.getElementById('invoicePayCustomerDisplay').textContent = `العميل: ${sale.customerName || 'عميل نقدي'}`;
  document.getElementById('invoicePayNumberDisplay').textContent = `فاتورة رقم: #${sale.invoiceNumber || sale.saleNumber || sale.id.slice(0,6)}`;
  document.getElementById('invoicePayCurrentRemaining').textContent = `${formatMoney(remaining)} جنيه`;

  const amountInput = document.getElementById('invoicePayAmountInput');
  amountInput.value = '';
  amountInput.max = remaining;

  const dateInput = document.getElementById('invoicePayDateInput');
  dateInput.value = getTodayDateString();

  const remAfter = document.getElementById('invoicePayRemainingAfter');
  remAfter.textContent = `${formatMoney(remaining)} جنيه`;

  const noteInput = document.getElementById('invoicePayNoteInput');
  if (noteInput) noteInput.value = 'دفعة نقدية';

  amountInput.oninput = () => {
    const entered = parseFloat(amountInput.value) || 0;
    const after = Math.max(0, remaining - entered);
    remAfter.textContent = `${formatMoney(after)} جنيه`;
  };

  openModal('modalAddInvoicePayment');
};

async function saveInvoicePayment(e) {
  e.preventDefault();
  const saleId = document.getElementById('payInvoiceId').value;
  const sale = APP_STATE.sales.find(s => s.id === saleId);
  if (!sale) return;

  const amount = parseFloat(document.getElementById('invoicePayAmountInput').value) || 0;
  const payDate = document.getElementById('invoicePayDateInput').value;
  const note = (document.getElementById('invoicePayNoteInput').value || '').trim() || 'دفعة نقدية';

  const currentRem = sale.remainingAmount !== undefined ? parseFloat(sale.remainingAmount) : Math.max(0, sale.grandTotal - (sale.paidAmount || 0));

  if (amount <= 0) {
    alert('يرجى إدخال مبلغ دفعة صحيح أكبر من الصفر.');
    return;
  }

  if (amount > currentRem + 0.01) {
    alert(`عفواً! المبلغ المدخل (${formatMoney(amount)} جنيه) أكبر من المتبقي على الفاتورة (${formatMoney(currentRem)} جنيه).`);
    return;
  }

  const newPayment = {
    id: 'pay_' + Date.now(),
    amount: amount,
    date: payDate ? new Date(payDate).toISOString() : new Date().toISOString(),
    note: note
  };

  const oldPaid = sale.paidAmount !== undefined ? parseFloat(sale.paidAmount) : 0;
  const newPaid = oldPaid + amount;
  const newRemaining = Math.max(0, sale.grandTotal - newPaid);
  const newStatus = newRemaining <= 0 ? 'paid' : 'partial';

  const updatedPayments = Array.isArray(sale.payments) ? [...sale.payments, newPayment] : [newPayment];

  const submitBtn = document.getElementById('saveInvoicePaymentBtn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    if (window.firebaseService && window.firebaseService.isConnected()) {
      const db = window.firebaseService.db;
      const batch = db.batch();

      // 1. تحديث مستند الفاتورة في sales
      const saleRef = db.collection('sales').doc(saleId);
      batch.update(saleRef, {
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        status: newStatus,
        payments: updatedPayments,
        updatedAt: new Date().toISOString()
      });

      // 2. فحص وتحديث سجل الشكك المرتبط إن وجد
      const linkedDebt = APP_STATE.debts.find(d => d.invoiceId === saleId || (d.customerName === sale.customerName && d.remainingAmount > 0));
      if (linkedDebt) {
        const debtRef = db.collection('debts').doc(linkedDebt.id);
        const debtOldPaid = parseFloat(linkedDebt.paidAmount) || 0;
        const debtNewPaid = debtOldPaid + amount;
        const debtNewRem = Math.max(0, (parseFloat(linkedDebt.totalAmount) || 0) - debtNewPaid);
        const debtPayments = Array.isArray(linkedDebt.payments) ? [...linkedDebt.payments, newPayment] : [newPayment];
        
        batch.update(debtRef, {
          paidAmount: debtNewPaid,
          remainingAmount: debtNewRem,
          status: debtNewRem <= 0 ? 'settled' : 'active',
          payments: debtPayments,
          lastPaymentDate: newPayment.date,
          updatedAt: new Date().toISOString()
        });

        linkedDebt.paidAmount = debtNewPaid;
        linkedDebt.remainingAmount = debtNewRem;
        linkedDebt.status = debtNewRem <= 0 ? 'settled' : 'active';
        linkedDebt.payments = debtPayments;
        linkedDebt.lastPaymentDate = newPayment.date;
      }

      await batch.commit();

      sale.paidAmount = newPaid;
      sale.remainingAmount = newRemaining;
      sale.status = newStatus;
      sale.payments = updatedPayments;
    } else {
      // الوضع المحلي
      sale.paidAmount = newPaid;
      sale.remainingAmount = newRemaining;
      sale.status = newStatus;
      sale.payments = updatedPayments;

      const linkedDebt = APP_STATE.debts.find(d => d.invoiceId === saleId || (d.customerName === sale.customerName && d.remainingAmount > 0));
      if (linkedDebt) {
        const debtOldPaid = parseFloat(linkedDebt.paidAmount) || 0;
        const debtNewPaid = debtOldPaid + amount;
        const debtNewRem = Math.max(0, (parseFloat(linkedDebt.totalAmount) || 0) - debtNewPaid);
        linkedDebt.paidAmount = debtNewPaid;
        linkedDebt.remainingAmount = debtNewRem;
        linkedDebt.status = debtNewRem <= 0 ? 'settled' : 'active';
        if (!Array.isArray(linkedDebt.payments)) linkedDebt.payments = [];
        linkedDebt.payments.push(newPayment);
        linkedDebt.lastPaymentDate = newPayment.date;
        saveLocalBackup('debts', APP_STATE.debts);
      }

      saveLocalBackup('sales', APP_STATE.sales);
      refreshAllUI();
    }

    closeModal('modalAddInvoicePayment');
    showToast(`✅ تم تسجيل دفعة ${formatMoney(amount)} جنيه على الفاتورة بنجاح.`);
  } catch (err) {
    console.error('Error saving invoice payment:', err);
    alert('حدث خطأ أثناء حفظ الدفعة: ' + err.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// استرجاع وإلغاء الفاتورة وإعادة البضاعة للمخزون
window.refundSale = async function(saleId) {
  const sale = APP_STATE.sales.find(s => s.id === saleId);
  if (!sale) return;

  if (sale.status === 'refunded') {
    alert('هذه الفاتورة تم استرجاعها بالفعل سابقاً.');
    return;
  }

  const confirmRefund = confirm(
    `هل أنت متأكد من استرجاع الفاتورة رقم #${sale.invoiceNumber || sale.saleNumber} بقيمة ${formatMoney(sale.grandTotal)} جنيه؟\n\nسيتم إعادة جميع القطع المباعة (${sale.totalPieces} قطعة) إلى المخزون تلقائياً وتعديل الحسابات.`
  );

  if (!confirmRefund) return;

  try {
    if (window.firebaseService && window.firebaseService.isConnected()) {
      const db = window.firebaseService.db;
      const batch = db.batch();

      (sale.items || []).forEach(item => {
        const prodRef = db.collection('products').doc(item.id);
        batch.update(prodRef, {
          stock: firebase.firestore.FieldValue.increment(item.qty),
          updatedAt: new Date().toISOString()
        });
      });

      const saleRef = db.collection('sales').doc(saleId);
      batch.update(saleRef, {
        status: 'refunded',
        refundedAt: new Date().toISOString()
      });

      // إذا كان هناك شكك مرتبط، تعديله كـ مسدد / ملغي
      const linkedDebt = APP_STATE.debts.find(d => d.invoiceId === saleId);
      if (linkedDebt) {
        const debtRef = db.collection('debts').doc(linkedDebt.id);
        batch.update(debtRef, {
          status: 'settled',
          notes: (linkedDebt.notes || '') + ' (تم استرجاع الفاتورة وإلغاؤها)',
          remainingAmount: 0,
          updatedAt: new Date().toISOString()
        });
        linkedDebt.status = 'settled';
        linkedDebt.remainingAmount = 0;
      }

      await batch.commit();
      sale.status = 'refunded';
    } else {
      (sale.items || []).forEach(item => {
        const prod = APP_STATE.products.find(p => p.id === item.id);
        if (prod) prod.stock += item.qty;
      });
      sale.status = 'refunded';

      const linkedDebt = APP_STATE.debts.find(d => d.invoiceId === saleId);
      if (linkedDebt) {
        linkedDebt.status = 'settled';
        linkedDebt.remainingAmount = 0;
        linkedDebt.notes = (linkedDebt.notes || '') + ' (تم استرجاع الفاتورة وإلغاؤها)';
        saveLocalBackup('debts', APP_STATE.debts);
      }

      saveLocalBackup('products', APP_STATE.products);
      saveLocalBackup('sales', APP_STATE.sales);
      refreshAllUI();
    }

    showToast(`✅ تم استرجاع الفاتورة #${sale.invoiceNumber || sale.saleNumber} وإعادة البضاعة للمخزون.`);
  } catch (err) {
    console.error('Refund error:', err);
    alert('فشل استرجاع الفاتورة: ' + err.message);
  }
};

// =======================================================
// 5. التقرير اليومي الموحد (فاتورة مجمعة واحدة)
// =======================================================
function renderDailyConsolidatedReport() {
  const todayStr = getTodayDateString();
  document.getElementById('dailyReportDateLabel').textContent = `تاريخ اليوم: ${todayStr} | الساعة: ${formatTimeOnly(new Date().toISOString())}`;

  const todaySales = APP_STATE.sales.filter(s => s.status !== 'refunded' && s.date && s.date.startsWith(todayStr));

  let totalAmount = 0, totalQty = 0;
  const aggregatedItems = {};

  todaySales.forEach(s => {
    totalAmount += (parseFloat(s.grandTotal) || 0);
    totalQty += (parseInt(s.totalPieces) || 0);

    (s.items || []).forEach(item => {
      if (!aggregatedItems[item.name]) {
        aggregatedItems[item.name] = {
          name: item.name,
          qty: 0,
          price: item.price,
          total: 0
        };
      }
      aggregatedItems[item.name].qty += item.qty;
      aggregatedItems[item.name].total += item.total;
    });
  });

  document.getElementById('dailyReportTotalAmount').textContent = formatMoney(totalAmount);
  document.getElementById('dailyReportTotalQty').textContent = totalQty;
  document.getElementById('dailyReportSalesCount').textContent = todaySales.length;

  const tbody = document.getElementById('dailyConsolidatedTableBody');
  tbody.innerHTML = '';

  const itemsList = Object.values(aggregatedItems);

  if (itemsList.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">لا توجد أي مبيعات مسجلة لهذا اليوم حتى الآن</td></tr>';
  } else {
    itemsList.forEach((item, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${index + 1}</td>
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td style="font-weight:800;">${item.qty} قطعة</td>
        <td>${formatMoney(item.price)} جنيه</td>
        <td style="font-weight:800; color:var(--success-color);">${formatMoney(item.total)} جنيه</td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('dailyConsolidatedGrandTotal').textContent = `${formatMoney(totalAmount)} جنيه`;

  window.currentDailyMaster = {
    date: todayStr,
    salesCount: todaySales.length,
    totalQty,
    totalAmount,
    items: itemsList
  };
}

function showDailyMasterPrintModal() {
  const data = window.currentDailyMaster || { items: [] };

  document.getElementById('printDateVal').textContent = data.date || getTodayDateString();
  document.getElementById('printSalesCountVal').textContent = data.salesCount || 0;
  document.getElementById('printPiecesCountVal').textContent = data.totalQty || 0;
  document.getElementById('printGrandTotalVal').textContent = `${formatMoney(data.totalAmount)} جنيه`;

  const tbody = document.getElementById('printConsolidatedItemsBody');
  tbody.innerHTML = '';

  if (data.items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:10px;">لا توجد مبيعات مسجلة اليوم</td></tr>';
  } else {
    data.items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(item.name)}</strong></td>
        <td style="text-align:center;">${item.qty}</td>
        <td style="text-align:center;">${formatMoney(item.price)}</td>
        <td style="text-align:left; font-weight:800;">${formatMoney(item.total)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  openModal('modalDailyMasterPrint');
}

// =======================================================
// 6. التقارير الأسبوعية والشهرية
// =======================================================
function renderAdvancedReports() {
  const period = document.getElementById('advReportPeriodSelect').value;
  const customFromGroup = document.getElementById('advDateFromGroup');
  const customToGroup = document.getElementById('advDateToGroup');

  if (period === 'custom') {
    customFromGroup.style.display = 'flex';
    customToGroup.style.display = 'flex';
  } else {
    customFromGroup.style.display = 'none';
    customToGroup.style.display = 'none';
  }

  const now = new Date();
  const todayStr = getTodayDateString();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let filterFn = () => true;
  if (period === 'today') {
    filterFn = (d, str) => str && str.startsWith(todayStr);
  } else if (period === 'week') {
    filterFn = (d) => d >= startOfWeek;
  } else if (period === 'month') {
    filterFn = (d) => d >= startOfMonth;
  } else if (period === 'custom') {
    const fromVal = document.getElementById('advReportDateFrom').value;
    const toVal = document.getElementById('advReportDateTo').value;
    const fromD = fromVal ? new Date(fromVal + 'T00:00:00') : null;
    const toD = toVal ? new Date(toVal + 'T23:59:59') : null;
    filterFn = (d) => {
      if (fromD && d < fromD) return false;
      if (toD && d > toD) return false;
      return true;
    };
  }

  let rev = 0, ops = 0, pieces = 0;
  const prodSales = {};

  APP_STATE.sales.forEach(s => {
    if (s.status === 'refunded') return;
    const d = new Date(s.date);
    if (!filterFn(d, s.date)) return;

    rev += (parseFloat(s.grandTotal) || 0);
    ops++;
    pieces += (parseInt(s.totalPieces) || 0);

    (s.items || []).forEach(item => {
      if (!prodSales[item.name]) prodSales[item.name] = { qty: 0, rev: 0 };
      prodSales[item.name].qty += item.qty;
      prodSales[item.name].rev += item.total;
    });
  });

  document.getElementById('advReportRevenue').textContent = formatMoney(rev);
  document.getElementById('advReportOperations').textContent = ops;
  document.getElementById('advReportPieces').textContent = pieces;

  const sorted = Object.entries(prodSales)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.qty - a.qty);

  const topBody = document.getElementById('advTopProductsBody');
  const leastBody = document.getElementById('advLeastProductsBody');
  topBody.innerHTML = '';
  leastBody.innerHTML = '';

  if (sorted.length === 0) {
    topBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">لا توجد مبيعات في هذه الفترة</td></tr>';
    leastBody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">لا توجد مبيعات في هذه الفترة</td></tr>';
  } else {
    sorted.slice(0, 5).forEach(i => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${escapeHtml(i.name)}</strong></td><td>${i.qty}</td><td style="font-weight:800; color:var(--success-color);">${formatMoney(i.rev)} جنيه</td>`;
      topBody.appendChild(tr);
    });

    sorted.slice(-5).reverse().forEach(i => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td><strong>${escapeHtml(i.name)}</strong></td><td>${i.qty}</td><td>${formatMoney(i.rev)} جنيه</td>`;
      leastBody.appendChild(tr);
    });
  }
}

// =======================================================
// 7. تنبيهات المخزون
// =======================================================
function checkStockAlerts() {
  const alertsList = [];

  APP_STATE.products.forEach(p => {
    const stock = parseInt(p.stock) || 0;
    const min = parseInt(p.minStock) || 3;

    if (stock <= 0) {
      alertsList.push({
        type: 'out',
        product: p.name,
        message: `⚠️ المنتج: ${p.name} - انتهت الكمية تماماً (0 قطع)`
      });
    } else if (stock <= min) {
      alertsList.push({
        type: 'low',
        product: p.name,
        message: `⚠️ المنتج: ${p.name} - متبقي ${stock} فقط (الحد الأدنى: ${min})`
      });
    }
  });

  const banner = document.getElementById('stockAlertBanner');
  const bannerText = document.getElementById('bannerAlertText');
  const bellBadge = document.getElementById('alertsCountBadge');

  if (alertsList.length > 0) {
    banner.style.display = 'flex';
    bannerText.textContent = `تنبيه: يوجد ${alertsList.length} منتج بحاجة للانتباه (${alertsList[0].message})`;
    bellBadge.style.display = 'inline-block';
    bellBadge.textContent = alertsList.length;
  } else {
    banner.style.display = 'none';
    bellBadge.style.display = 'none';
  }

  const container = document.getElementById('alertsListContainer');
  container.innerHTML = '';
  if (alertsList.length === 0) {
    container.innerHTML = '<p style="text-align:center; color:var(--success-color); font-weight:700;">جميع المنتجات متوفرة بكميات مناسبة بالمخزون! ✅</p>';
  } else {
    alertsList.forEach(a => {
      const div = document.createElement('div');
      div.className = 'alert alert-warning';
      div.style.marginBottom = '8px';
      div.innerHTML = `<strong>${escapeHtml(a.message)}</strong>`;
      container.appendChild(div);
    });
  }
}

// =======================================================
// 6. إدارة الشكك وديون العملاء
// =======================================================
function updateDebtsStats() {
  const debts = APP_STATE.debts || [];
  let totalRemaining = 0;
  let totalCollected = 0;
  let activeCount = 0;
  let settledCount = 0;

  debts.forEach(d => {
    const rem = Number(d.remainingAmount) || 0;
    const paid = Number(d.paidAmount) || 0;
    if (rem > 0) {
      totalRemaining += rem;
      activeCount++;
    } else {
      settledCount++;
    }
    totalCollected += paid;
  });

  const elRem = document.getElementById('debtsTotalRemaining');
  const elCol = document.getElementById('debtsTotalCollected');
  const elAct = document.getElementById('debtsActiveCount');
  const elSet = document.getElementById('debtsSettledCount');

  if (elRem) elRem.textContent = formatMoney(totalRemaining);
  if (elCol) elCol.textContent = formatMoney(totalCollected);
  if (elAct) elAct.textContent = activeCount;
  if (elSet) elSet.textContent = settledCount;
}

function renderDebtsTable() {
  const tbody = document.getElementById('debtsTableBody');
  const empty = document.getElementById('debtsEmptyState');
  if (!tbody) return;

  const searchInput = document.getElementById('debtsSearchInput');
  const search = searchInput ? (searchInput.value || '').trim().toLowerCase() : '';
  const filterSelect = document.getElementById('debtsStatusFilter');
  const filter = filterSelect ? filterSelect.value : 'all';

  tbody.innerHTML = '';
  const debts = APP_STATE.debts || [];

  const filtered = debts.filter(d => {
    const rem = Number(d.remainingAmount) || 0;
    const isSettled = rem <= 0;

    if (filter === 'active' && isSettled) return false;
    if (filter === 'paid' && !isSettled) return false;

    if (search) {
      const name = (d.customerName || '').toLowerCase();
      const phone = (d.phone || '').toLowerCase();
      if (!name.includes(search) && !phone.includes(search)) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    if (empty) empty.style.display = 'block';
  } else {
    if (empty) empty.style.display = 'none';

    filtered.forEach(d => {
      const total = Number(d.totalAmount) || 0;
      const paid = Number(d.paidAmount) || 0;
      const rem = Number(d.remainingAmount) || 0;
      const isSettled = rem <= 0;

      // حساب آخر دفعة
      let lastPayText = '—';
      if (Array.isArray(d.payments) && d.payments.length > 0) {
        const lastP = d.payments[d.payments.length - 1];
        lastPayText = `${formatMoney(lastP.amount)} ج (${formatDateShort(lastP.date)})`;
      } else if (paid > 0) {
        lastPayText = `${formatMoney(paid)} ج (عند التسجيل)`;
      }

      let statusBadge = '';
      if (isSettled) {
        statusBadge = '<span class="badge-stock badge-stock-available" style="font-weight:800;">مسدد بالكامل ✅</span>';
      } else {
        statusBadge = `<span class="badge-stock badge-stock-out" style="font-weight:800;">عليه ${formatMoney(rem)} جنيه</span>`;
      }

      const itemsDesc = escapeHtml(d.items || '—') + (d.quantity ? ` <small class="text-muted">(${escapeHtml(d.quantity)})</small>` : '');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(d.customerName || '—')}</strong></td>
        <td>${d.phone ? `<a href="tel:${escapeHtml(d.phone)}" style="color:var(--primary-color); text-decoration:none; font-weight:700;">${escapeHtml(d.phone)}</a>` : '<span class="text-muted">—</span>'}</td>
        <td style="max-width:220px; word-break:break-word;">${itemsDesc}</td>
        <td><strong>${formatMoney(total)}</strong></td>
        <td style="color:var(--success-color); font-weight:700;">${formatMoney(paid)}</td>
        <td style="color:${isSettled ? 'var(--text-muted)' : 'var(--danger-color)'}; font-weight:900; font-size:1.05rem;">${formatMoney(rem)}</td>
        <td style="font-size:0.82rem;">${lastPayText}</td>
        <td>${statusBadge}</td>
        <td>
          <div style="display:flex; gap:4px; align-items:center;">
            ${!isSettled ? `
              <button class="btn btn-sm btn-success" onclick="openAddPaymentModal('${d.id}')" title="إضافة دفعة وسداد جزء">
                + دفعة
              </button>
            ` : `
              <button class="btn btn-sm btn-secondary" onclick="openAddPaymentModal('${d.id}')" title="إضافة دفعة إضافية" style="opacity:0.6;">
                + دفعة
              </button>
            `}
            <button class="action-mini-btn" onclick="openDebtDetailsModal('${d.id}')" title="كشف حساب وسجل الدفعات">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <button class="action-mini-btn" onclick="openEditDebtModal('${d.id}')" title="تعديل أو تقليل الدين">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button class="action-mini-btn btn-delete" onclick="deleteDebt('${d.id}')" title="حذف السجل">&times;</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function formatDateShort(isoStr) {
  if (!isoStr) return '--';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${m}/${day}`;
}

function calcNewDebtRemaining() {
  const total = parseFloat(document.getElementById('debtFormTotal').value) || 0;
  const paid = parseFloat(document.getElementById('debtFormPaid').value) || 0;
  const rem = Math.max(0, total - paid);
  const preview = document.getElementById('debtFormRemainingPreview');
  if (preview) {
    preview.textContent = `${formatMoney(rem)} جنيه`;
    preview.style.color = rem > 0 ? 'var(--danger-color)' : 'var(--success-color)';
  }
}

function openAddDebtModal() {
  document.getElementById('addDebtForm').reset();
  document.getElementById('debtFormDate').value = getTodayDateString();
  document.getElementById('debtFormPaid').value = '0';
  calcNewDebtRemaining();
  openModal('modalAddDebt');
}

async function saveNewDebt(e) {
  e.preventDefault();
  const customerName = document.getElementById('debtFormName').value.trim();
  const phone = document.getElementById('debtFormPhone').value.trim();
  const items = document.getElementById('debtFormItems').value.trim();
  const quantity = document.getElementById('debtFormQuantity').value.trim();
  const totalAmount = parseFloat(document.getElementById('debtFormTotal').value) || 0;
  const paidAmount = parseFloat(document.getElementById('debtFormPaid').value) || 0;
  const remainingAmount = Math.max(0, totalAmount - paidAmount);
  const date = document.getElementById('debtFormDate').value || getTodayDateString();
  const notes = document.getElementById('debtFormNotes').value.trim();

  if (!customerName || totalAmount <= 0) return;

  const status = remainingAmount <= 0 ? 'paid' : 'active';
  const payments = [];
  if (paidAmount > 0) {
    payments.push({
      id: 'pay_' + Date.now(),
      amount: paidAmount,
      date: new Date().toISOString(),
      note: 'دفعة أولى عند أخذ البضاعة'
    });
  }

  const newDoc = {
    customerName,
    phone,
    items,
    quantity,
    totalAmount,
    paidAmount,
    remainingAmount,
    status,
    date,
    notes,
    payments,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const btn = document.getElementById('saveDebtSubmitBtn');
  btn.disabled = true;

  try {
    if (window.firebaseService && window.firebaseService.isConnected()) {
      const db = window.firebaseService.db;
      await db.collection('debts').add(newDoc);
      showToast('✅ تم تسجيل شكك العميل في Firebase بنجاح');
    } else {
      newDoc.id = 'debt_' + Date.now();
      APP_STATE.debts.unshift(newDoc);
      saveLocalBackup('debts', APP_STATE.debts);
      renderDebtsTable();
      updateDebtsStats();
      showToast('تم تسجيل شكك العميل بنجاح');
    }
    closeModal('modalAddDebt');
  } catch (err) {
    console.error('Error saving debt:', err);
    alert('حدث خطأ أثناء حفظ الشكك: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// -------------------------------------------------------
// الدفع الجزئي (إضافة دفعة)
// -------------------------------------------------------
window.openAddPaymentModal = function(id) {
  const d = APP_STATE.debts.find(item => item.id === id);
  if (!d) return;

  document.getElementById('payDebtId').value = d.id;
  document.getElementById('payCustomerNameDisplay').textContent = `العميل: ${d.customerName} ${d.phone ? `(${d.phone})` : ''}`;
  document.getElementById('payCurrentRemainingDisplay').textContent = `${formatMoney(d.remainingAmount)} جنيه`;

  const payInput = document.getElementById('payAmountInput');
  payInput.value = '';
  document.getElementById('payDateInput').value = getTodayDateString();
  document.getElementById('payNoteInput').value = '';

  calcPaymentRemainingAfter();
  openModal('modalAddPayment');
  setTimeout(() => payInput.focus(), 150);
};

function calcPaymentRemainingAfter() {
  const debtId = document.getElementById('payDebtId').value;
  const d = APP_STATE.debts.find(item => item.id === debtId);
  const currentRem = d ? Number(d.remainingAmount) || 0 : 0;
  const payVal = parseFloat(document.getElementById('payAmountInput').value) || 0;
  const remAfter = Math.max(0, currentRem - payVal);

  const preview = document.getElementById('payRemainingAfterDisplay');
  if (preview) {
    preview.textContent = `${formatMoney(remAfter)} جنيه`;
    if (remAfter === 0) {
      preview.textContent = '0.00 جنيه (سيكون الحساب مسدداً بالكامل! 🎉)';
    }
  }
}

async function savePayment(e) {
  e.preventDefault();
  const debtId = document.getElementById('payDebtId').value;
  const d = APP_STATE.debts.find(item => item.id === debtId);
  if (!d) return;

  const amount = parseFloat(document.getElementById('payAmountInput').value);
  const dateVal = document.getElementById('payDateInput').value || getTodayDateString();
  const note = document.getElementById('payNoteInput').value.trim();

  if (isNaN(amount) || amount <= 0) {
    alert('يرجى إدخال مبلغ صحيح للدفعة');
    return;
  }

  const currentRem = Number(d.remainingAmount) || 0;
  const currentPaid = Number(d.paidAmount) || 0;
  const newRemaining = Math.max(0, currentRem - amount);
  const newPaid = currentPaid + amount;
  const newStatus = newRemaining <= 0 ? 'paid' : 'active';

  const newPaymentObj = {
    id: 'pay_' + Date.now(),
    amount: amount,
    date: new Date(dateVal).toISOString(),
    note: note || 'دفعة نقدية'
  };

  const updatedPayments = Array.isArray(d.payments) ? [...d.payments, newPaymentObj] : [newPaymentObj];

  const btn = document.getElementById('savePaymentSubmitBtn');
  btn.disabled = true;

  try {
    if (window.firebaseService && window.firebaseService.isConnected()) {
      const db = window.firebaseService.db;
      await db.collection('debts').doc(d.id).update({
        paidAmount: newPaid,
        remainingAmount: newRemaining,
        status: newStatus,
        payments: updatedPayments,
        updatedAt: new Date().toISOString()
      });
      showToast(newRemaining <= 0 ? '🎉 تم تسديد الحساب بالكامل بنجاح!' : '✅ تم خصم الدفعة وتحديث المتبقي');
    } else {
      d.paidAmount = newPaid;
      d.remainingAmount = newRemaining;
      d.status = newStatus;
      d.payments = updatedPayments;
      d.updatedAt = new Date().toISOString();
      saveLocalBackup('debts', APP_STATE.debts);
      renderDebtsTable();
      updateDebtsStats();
      showToast('تم تسجيل الدفعة بنجاح');
    }

    closeModal('modalAddPayment');
  } catch (err) {
    console.error('Error saving payment:', err);
    alert('حدث خطأ أثناء حفظ الدفعة: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// -------------------------------------------------------
// تعديل أو تقليل الدين يدوياً
// -------------------------------------------------------
window.openEditDebtModal = function(id) {
  const d = APP_STATE.debts.find(item => item.id === id);
  if (!d) return;

  document.getElementById('editDebtId').value = d.id;
  document.getElementById('editDebtName').value = d.customerName || '';
  document.getElementById('editDebtPhone').value = d.phone || '';
  document.getElementById('editDebtItems').value = d.items || '';
  document.getElementById('editDebtQuantity').value = d.quantity || '';
  document.getElementById('editDebtTotal').value = d.totalAmount || 0;
  document.getElementById('editDebtRemaining').value = d.remainingAmount !== undefined ? d.remainingAmount : 0;
  document.getElementById('editDebtNotes').value = d.notes || '';

  openModal('modalEditDebt');
};

async function saveEditDebt(e) {
  e.preventDefault();
  const id = document.getElementById('editDebtId').value;
  const d = APP_STATE.debts.find(item => item.id === id);
  if (!d) return;

  const customerName = document.getElementById('editDebtName').value.trim();
  const phone = document.getElementById('editDebtPhone').value.trim();
  const items = document.getElementById('editDebtItems').value.trim();
  const quantity = document.getElementById('editDebtQuantity').value.trim();
  const totalAmount = parseFloat(document.getElementById('editDebtTotal').value) || 0;
  const remainingAmount = parseFloat(document.getElementById('editDebtRemaining').value);
  const notes = document.getElementById('editDebtNotes').value.trim();

  if (!customerName || isNaN(remainingAmount)) return;

  const status = remainingAmount <= 0 ? 'paid' : 'active';
  const btn = document.getElementById('saveEditDebtBtn');
  btn.disabled = true;

  try {
    if (window.firebaseService && window.firebaseService.isConnected()) {
      const db = window.firebaseService.db;
      await db.collection('debts').doc(id).update({
        customerName,
        phone,
        items,
        quantity,
        totalAmount,
        remainingAmount,
        status,
        notes,
        updatedAt: new Date().toISOString()
      });
      showToast('✅ تم تحديث بيانات الدين بنجاح');
    } else {
      d.customerName = customerName;
      d.phone = phone;
      d.items = items;
      d.quantity = quantity;
      d.totalAmount = totalAmount;
      d.remainingAmount = remainingAmount;
      d.status = status;
      d.notes = notes;
      d.updatedAt = new Date().toISOString();
      saveLocalBackup('debts', APP_STATE.debts);
      renderDebtsTable();
      updateDebtsStats();
      showToast('تم تحديث بيانات الدين بنجاح');
    }

    closeModal('modalEditDebt');
  } catch (err) {
    console.error('Error updating debt:', err);
    alert('حدث خطأ أثناء تحديث الدين: ' + err.message);
  } finally {
    btn.disabled = false;
  }
}

// -------------------------------------------------------
// عرض كشف الحساب وسجل الدفعات
// -------------------------------------------------------
window.openDebtDetailsModal = function(id) {
  const d = APP_STATE.debts.find(item => item.id === id);
  if (!d) return;

  const container = document.getElementById('debtDetailsModalBody');
  const isSettled = (Number(d.remainingAmount) || 0) <= 0;

  let paymentsHtml = '';
  if (Array.isArray(d.payments) && d.payments.length > 0) {
    paymentsHtml = `
      <table class="data-table" style="margin-top:10px;">
        <thead>
          <tr>
            <th>#</th>
            <th>تاريخ الدفعة</th>
            <th>مبلغ الدفعة</th>
            <th>ملاحظات الدفعة</th>
          </tr>
        </thead>
        <tbody>
          ${d.payments.map((p, idx) => `
            <tr>
              <td>${idx + 1}</td>
              <td>${formatDate(p.date)}</td>
              <td><strong style="color:var(--success-color);">${formatMoney(p.amount)} جنيه</strong></td>
              <td>${escapeHtml(p.note || '—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else {
    paymentsHtml = '<p class="text-muted" style="text-align:center; padding:16px;">لم يتم تسجيل أي دفعات إضافية حتى الآن.</p>';
  }

  container.innerHTML = `
    <div style="background:var(--bg-main); border:1px solid var(--border-color); border-radius:8px; padding:16px; margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <h4 style="font-size:1.15rem; margin:0;">${escapeHtml(d.customerName)}</h4>
        ${isSettled ? '<span class="badge-stock badge-stock-available" style="font-weight:800;">مسدد بالكامل ✅</span>' : `<span class="badge-stock badge-stock-out" style="font-weight:800;">عليه متبقي: ${formatMoney(d.remainingAmount)} جنيه</span>`}
      </div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:0.9rem;">
        <div><strong>الهاتف:</strong> ${d.phone ? escapeHtml(d.phone) : '—'}</div>
        <div><strong>تاريخ الشكك:</strong> ${formatDate(d.date || d.createdAt)}</div>
        <div style="grid-column: span 2;"><strong>المنتجات المأخوذة:</strong> ${escapeHtml(d.items || '—')} ${d.quantity ? `(${escapeHtml(d.quantity)})` : ''}</div>
        ${d.notes ? `<div style="grid-column: span 2;"><strong>ملاحظات:</strong> ${escapeHtml(d.notes)}</div>` : ''}
      </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:16px; text-align:center;">
      <div style="background:var(--bg-main); border:1px solid var(--border-color); padding:10px; border-radius:8px;">
        <span class="text-muted" style="font-size:0.8rem; display:block;">إجمالي الحساب</span>
        <strong style="font-size:1.1rem;">${formatMoney(d.totalAmount)} جنيه</strong>
      </div>
      <div style="background:var(--success-light); border:1px solid var(--success-color); padding:10px; border-radius:8px;">
        <span style="font-size:0.8rem; display:block; color:var(--success-color);">المبلغ المدفوع</span>
        <strong style="font-size:1.1rem; color:var(--success-color);">${formatMoney(d.paidAmount)} جنيه</strong>
      </div>
      <div style="background:var(--danger-light); border:1px solid var(--danger-color); padding:10px; border-radius:8px;">
        <span style="font-size:0.8rem; display:block; color:var(--danger-color);">المبلغ المتبقي</span>
        <strong style="font-size:1.1rem; color:var(--danger-color);">${formatMoney(d.remainingAmount)} جنيه</strong>
      </div>
    </div>

    <h4 style="margin-bottom:8px;">سجل الدفعات المسددة:</h4>
    <div class="table-responsive">
      ${paymentsHtml}
    </div>
  `;

  openModal('modalDebtDetails');
};

// -------------------------------------------------------
// حذف سجل الدين مع رسالة تأكيد (Requirement 5)
// -------------------------------------------------------
window.deleteDebt = async function(id) {
  const d = APP_STATE.debts.find(item => item.id === id);
  if (!d) return;

  const confirmMsg = `هل أنت متأكد من حذف سجل الشكك للعميل "${d.customerName}" بالكامل؟\n\n(المتبقي: ${formatMoney(d.remainingAmount)} جنيه)\n\nتنبيه: لا يمكن التراجع عن هذا الإجراء بعد الحذف.`;
  if (!confirm(confirmMsg)) return;

  try {
    if (window.firebaseService && window.firebaseService.isConnected()) {
      const db = window.firebaseService.db;
      await db.collection('debts').doc(id).delete();
      showToast('✅ تم حذف سجل الشكك من Firebase بنجاح');
    } else {
      APP_STATE.debts = APP_STATE.debts.filter(item => item.id !== id);
      saveLocalBackup('debts', APP_STATE.debts);
      renderDebtsTable();
      updateDebtsStats();
      showToast('تم حذف سجل الشكك بنجاح');
    }
  } catch (err) {
    console.error('Error deleting debt:', err);
    alert('حدث خطأ أثناء حذف السجل: ' + err.message);
  }
};

// =======================================================
// التنقل والتبويبات
// =======================================================
function setupNavigation() {
  document.querySelectorAll('.tabs-nav .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
}

window.switchTab = function(tabId) {
  document.querySelectorAll('.tabs-nav .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const targetBtn = document.querySelector(`.tabs-nav .tab-btn[data-tab="${tabId}"]`);
  const targetContent = document.getElementById(tabId);
  if (targetBtn) targetBtn.classList.add('active');
  if (targetContent) targetContent.classList.add('active');

  APP_STATE.activeTab = tabId;

  if (tabId === 'tab-daily') renderDailyConsolidatedReport();
  if (tabId === 'tab-reports') renderAdvancedReports();
  if (tabId === 'tab-sales') renderSalesHistory();
  if (tabId === 'tab-products') renderProductsTable();
  if (tabId === 'tab-debts') {
    renderDebtsTable();
    updateDebtsStats();
  }
};

function setupEventListeners() {
  // POS
  document.getElementById('posSearchProductInput').addEventListener('input', renderPosProducts);
  document.getElementById('posClearCartBtn').addEventListener('click', () => {
    if (APP_STATE.cart.length > 0 && confirm('هل تريد تفريغ بنود السلة الحالية؟')) {
      APP_STATE.cart = [];
      renderPosCart();
    }
  });
  document.getElementById('posCompleteSaleBtn').addEventListener('click', completeSale);
  const posPayMethodEl = document.getElementById('posPaymentMethod');
  if (posPayMethodEl) posPayMethodEl.addEventListener('change', updatePosCheckoutAmounts);
  const posPaidInputEl = document.getElementById('posPaidAmount');
  if (posPaidInputEl) posPaidInputEl.addEventListener('input', updatePosCheckoutAmounts);

  // إدارة المنتجات
  document.getElementById('openAddProductModalBtn').addEventListener('click', openAddProductModal);
  document.getElementById('prodFormName').addEventListener('input', checkDuplicateProductName);
  document.getElementById('prodFormCostPrice').addEventListener('input', updateProfitPreview);
  document.getElementById('prodFormPrice').addEventListener('input', updateProfitPreview);
  document.getElementById('productForm').addEventListener('submit', saveProductForm);
  document.getElementById('productsSearchInput').addEventListener('input', renderProductsTable);
  document.getElementById('productsStockFilter').addEventListener('change', renderProductsTable);

  // سجل الفواتير والمبيعات
  document.getElementById('salesPeriodFilter').addEventListener('change', renderSalesHistory);
  const salesStatusFilterEl = document.getElementById('salesStatusFilter');
  if (salesStatusFilterEl) salesStatusFilterEl.addEventListener('change', renderSalesHistory);
  document.getElementById('salesSearchInput').addEventListener('input', renderSalesHistory);

  // طباعة ومعاينة فواتير العملاء وسداد الفواتير
  const printCustInvBtn = document.getElementById('doPrintCustomerInvoiceBtn');
  if (printCustInvBtn) printCustInvBtn.addEventListener('click', doPrintCustomerInvoice);

  const addInvPayForm = document.getElementById('addInvoicePaymentForm');
  if (addInvPayForm) addInvPayForm.addEventListener('submit', saveInvoicePayment);

  // التقرير اليومي الموحد
  document.getElementById('printDailyMasterReportBtn').addEventListener('click', showDailyMasterPrintModal);
  document.getElementById('doPrintDailyMasterBtn').addEventListener('click', () => {
    document.body.classList.add('printing-daily-master');
    window.print();
    setTimeout(() => document.body.classList.remove('printing-daily-master'), 500);
  });

  // التقارير المتقدمة
  document.getElementById('advReportPeriodSelect').addEventListener('change', renderAdvancedReports);
  document.getElementById('applyAdvReportBtn').addEventListener('click', renderAdvancedReports);
  document.getElementById('printAdvReportBtn').addEventListener('click', () => window.print());

  // الشكك وديون العملاء
  const searchDebtsEl = document.getElementById('debtsSearchInput');
  if (searchDebtsEl) searchDebtsEl.addEventListener('input', renderDebtsTable);

  const filterDebtsEl = document.getElementById('debtsStatusFilter');
  if (filterDebtsEl) filterDebtsEl.addEventListener('change', renderDebtsTable);

  const openAddDebtBtn = document.getElementById('openAddDebtModalBtn');
  if (openAddDebtBtn) openAddDebtBtn.addEventListener('click', openAddDebtModal);

  const addDebtForm = document.getElementById('addDebtForm');
  if (addDebtForm) addDebtForm.addEventListener('submit', saveNewDebt);

  const debtTotalInput = document.getElementById('debtFormTotal');
  if (debtTotalInput) debtTotalInput.addEventListener('input', calcNewDebtRemaining);

  const debtPaidInput = document.getElementById('debtFormPaid');
  if (debtPaidInput) debtPaidInput.addEventListener('input', calcNewDebtRemaining);

  const addPaymentForm = document.getElementById('addPaymentForm');
  if (addPaymentForm) addPaymentForm.addEventListener('submit', savePayment);

  const payAmountInput = document.getElementById('payAmountInput');
  if (payAmountInput) payAmountInput.addEventListener('input', calcPaymentRemainingAfter);

  const editDebtForm = document.getElementById('editDebtForm');
  if (editDebtForm) editDebtForm.addEventListener('submit', saveEditDebt);

  const printDebtDetailsBtn = document.getElementById('debtDetailsPrintBtn');
  if (printDebtDetailsBtn) printDebtDetailsBtn.addEventListener('click', () => window.print());

  // التنبيهات
  document.getElementById('alertsBellBtn').addEventListener('click', () => openModal('modalAlerts'));
  document.getElementById('viewAlertsBannerBtn').addEventListener('click', () => openModal('modalAlerts'));
  document.getElementById('dashOutOfStockBox').addEventListener('click', () => {
    document.getElementById('productsStockFilter').value = 'out';
    switchTab('tab-products');
  });
  document.getElementById('dashLowStockBox').addEventListener('click', () => {
    document.getElementById('productsStockFilter').value = 'low';
    switchTab('tab-products');
  });

  // إغلاق المودالات
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.getAttribute('data-close')));
  });
  window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) e.target.classList.remove('active');
  });
}

function setupTheme() {
  const toggle = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('cashier_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);

  toggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('cashier_theme', next);
  });
}

function openModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
}

function closeModal(id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

function startClock() {
  const clock = document.getElementById('liveClock');
  function tick() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12 || 12;
    clock.textContent = `${hours}:${minutes}:${seconds} ${ampm}`;
  }
  tick();
  setInterval(tick, 1000);
}
