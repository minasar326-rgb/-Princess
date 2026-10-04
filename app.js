/**
 * نظام Princess Store - كاشير ومخزون وسحابي متكامل
 * مزامنة سحابية صامتة وتلقائية بدون شاشات تسجيل دخول أو تعقيدات
 */

const APP_STATE = {
  products: [],
  sales: [],
  cart: [],
  activeTab: 'tab-dashboard',
  unsubscribeProducts: null,
  unsubscribeSales: null
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
      { id: 'p1', name: 'مياه معدنية صغيرة', price: 10, stock: 24, minStock: 5 },
      { id: 'p2', name: 'عصير مانجو فريش', price: 35, stock: 4, minStock: 5 },
      { id: 'p3', name: 'شاي أحمر فاخر', price: 15, stock: 18, minStock: 3 },
      { id: 'p4', name: 'قهوة تركي مخصوص', price: 25, stock: 2, minStock: 4 },
      { id: 'p5', name: 'ساندوتش دجاج مشوي', price: 65, stock: 0, minStock: 3 }
    ];
    saveLocalBackup('products', APP_STATE.products);
  }

  const savedSales = localStorage.getItem('princess_sales');
  if (savedSales) {
    try { APP_STATE.sales = JSON.parse(savedSales); } catch (e) {}
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

    tile.innerHTML = `
      <div>
        <div class="tile-title">${escapeHtml(p.name)}</div>
        <div class="tile-stock"><span class="badge-stock ${badgeClass}">${stockText}</span></div>
      </div>
      <div class="tile-price">${formatMoney(p.price)} <small style="font-size:0.75rem;">جنيه</small></div>
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
        <td><strong>${escapeHtml(item.name)}</strong></td>
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
  document.getElementById('posSaleNumber').textContent = `#SALE-${saleSeq}`;
}

// إتمام عملية البيع وخصم المخزون
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
  const saleNumber = `SALE-${saleSeq}`;
  const now = new Date();

  const newSale = {
    saleNumber,
    date: now.toISOString(),
    items: JSON.parse(JSON.stringify(APP_STATE.cart)),
    totalPieces,
    grandTotal,
    status: 'completed'
  };

  const btn = document.getElementById('posCompleteSaleBtn');
  btn.disabled = true;
  btn.textContent = 'جاري إتمام البيع وتحديث المخزون...';

  try {
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
      batch.set(saleRef, newSale);

      await batch.commit();
    } else {
      APP_STATE.cart.forEach(item => {
        const prod = APP_STATE.products.find(p => p.id === item.id);
        if (prod) prod.stock -= item.qty;
      });
      newSale.id = 'sale_' + Date.now();
      APP_STATE.sales.unshift(newSale);
      saveLocalBackup('products', APP_STATE.products);
      saveLocalBackup('sales', APP_STATE.sales);
      refreshAllUI();
    }

    APP_STATE.cart = [];
    renderPosCart();
    showToast(`✅ تم إتمام البيع بنجاح بمبلغ ${formatMoney(grandTotal)} جنيه وخصم المخزون!`);
  } catch (error) {
    console.error('Sale checkout error:', error);
    alert('حدث خطأ أثناء حفظ البيع: ' + error.message);
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

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td><strong>${formatMoney(p.price)}</strong></td>
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
}

function openAddProductModal() {
  document.getElementById('productForm').reset();
  document.getElementById('formProductId').value = '';
  document.getElementById('modalProductTitle').textContent = 'إضافة منتج جديد';
  document.getElementById('prodFormMinStock').value = '3';
  openModal('modalProduct');
}

window.openEditProductModal = function(id) {
  const p = APP_STATE.products.find(prod => prod.id === id);
  if (!p) return;

  document.getElementById('formProductId').value = p.id;
  document.getElementById('prodFormName').value = p.name;
  document.getElementById('prodFormPrice').value = p.price;
  document.getElementById('prodFormStock').value = p.stock;
  document.getElementById('prodFormMinStock').value = p.minStock || 3;
  document.getElementById('modalProductTitle').textContent = 'تعديل بيانات المنتج';
  openModal('modalProduct');
};

async function saveProductForm(e) {
  e.preventDefault();
  const id = document.getElementById('formProductId').value;
  const name = document.getElementById('prodFormName').value.trim();
  const price = parseFloat(document.getElementById('prodFormPrice').value);
  const stock = parseInt(document.getElementById('prodFormStock').value);
  const minStock = parseInt(document.getElementById('prodFormMinStock').value) || 3;

  if (!name || isNaN(price) || isNaN(stock)) return;

  const btn = document.getElementById('saveProductSubmitBtn');
  btn.disabled = true;

  try {
    if (window.firebaseService && window.firebaseService.isConnected()) {
      const db = window.firebaseService.db;
      const col = db.collection('products');

      if (id) {
        await col.doc(id).update({
          name, price, stock, minStock,
          updatedAt: new Date().toISOString()
        });
        showToast('✅ تم تحديث المنتج بنجاح');
      } else {
        await col.add({
          name, price, stock, minStock,
          createdAt: new Date().toISOString()
        });
        showToast('✅ تمت إضافة المنتج بنجاح');
      }
    } else {
      if (id) {
        const idx = APP_STATE.products.findIndex(p => p.id === id);
        if (idx !== -1) APP_STATE.products[idx] = { id, name, price, stock, minStock };
      } else {
        APP_STATE.products.push({ id: 'p_' + Date.now(), name, price, stock, minStock });
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
// 4. سجل المبيعات وإلغاء واسترجاع المبيعات (Refund)
// =======================================================
function renderSalesHistory() {
  const period = document.getElementById('salesPeriodFilter').value;
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

    if (search) {
      const matchNum = s.saleNumber && s.saleNumber.toLowerCase().includes(search);
      const matchDate = s.date && s.date.includes(search);
      if (!matchNum && !matchDate) return false;
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

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>#${s.saleNumber || s.id.slice(0,6)}</strong></td>
        <td>${formatDate(s.date)}</td>
        <td style="max-width: 300px;">${escapeHtml(itemsSummary)}</td>
        <td>${s.totalPieces || 0}</td>
        <td style="${isRefunded ? 'text-decoration: line-through; color: var(--text-muted);' : 'font-weight: 800; color: var(--success-color);'}">
          ${formatMoney(s.grandTotal)} جنيه
        </td>
        <td>
          ${isRefunded ?
            '<span class="badge" style="background:var(--danger-light); color:var(--danger-color);">ملغاة / مسترجعة</span>' :
            '<span class="badge" style="background:var(--success-light); color:var(--success-color);">ناجحة</span>'
          }
        </td>
        <td>
          ${!isRefunded ?
            `<button class="btn btn-sm btn-outline" onclick="refundSale('${s.id}')" title="إلغاء واسترجاع">إلغاء واسترجاع</button>` :
            '<span class="text-muted" style="font-size:0.8rem;">تم استرجاع المخزون</span>'
          }
        </td>
      `;
      tbody.appendChild(tr);
    });
  }
}

window.refundSale = async function(saleId) {
  const sale = APP_STATE.sales.find(s => s.id === saleId);
  if (!sale) return;

  if (sale.status === 'refunded') {
    alert('هذه الفاتورة تم استرجاعها بالفعل سابقاً.');
    return;
  }

  const confirmRefund = confirm(
    `هل أنت متأكد من استرجاع الفاتورة رقم #${sale.saleNumber} بقيمة ${formatMoney(sale.grandTotal)} جنيه؟\n\nسيتم إعادة جميع القطع المباعة (${sale.totalPieces} قطعة) إلى المخزون تلقائياً وتعديل الحسابات.`
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

      await batch.commit();
    } else {
      (sale.items || []).forEach(item => {
        const prod = APP_STATE.products.find(p => p.id === item.id);
        if (prod) prod.stock += item.qty;
      });
      sale.status = 'refunded';
      saveLocalBackup('products', APP_STATE.products);
      saveLocalBackup('sales', APP_STATE.sales);
      refreshAllUI();
    }

    showToast(`✅ تم استرجاع الفاتورة #${sale.saleNumber} وإعادة البضاعة للمخزون.`);
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

  // إدارة المنتجات
  document.getElementById('openAddProductModalBtn').addEventListener('click', openAddProductModal);
  document.getElementById('productForm').addEventListener('submit', saveProductForm);
  document.getElementById('productsSearchInput').addEventListener('input', renderProductsTable);
  document.getElementById('productsStockFilter').addEventListener('change', renderProductsTable);

  // سجل المبيعات
  document.getElementById('salesPeriodFilter').addEventListener('change', renderSalesHistory);
  document.getElementById('salesSearchInput').addEventListener('input', renderSalesHistory);

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
