/**
 * FROSE STREET — Durable Vendor-Scoped IndexedDB Store (OFF-01)
 * Zero-dependency native IndexedDB persistence for menu_items, orders, sync_outbox, and meta.
 * Enforces strict integer paise and vendor isolation. Classic-script & CommonJS/ESM safe.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'frose_street_offline_db';
  var DB_VERSION = 1;
  var STORES = ['menu_items', 'orders', 'sync_outbox', 'meta'];

  function toSafeIntegerPaise(value, fieldName) {
    if (typeof value === 'bigint') {
      var n = Number(value);
      if (!Number.isSafeInteger(n)) {
        throw new Error('Monetary integer paise out of safe range for ' + (fieldName || 'amount'));
      }
      return n;
    }
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
      var parsed = Number(value.trim());
      if (!Number.isSafeInteger(parsed)) {
        throw new Error('Monetary integer paise out of safe range for ' + (fieldName || 'amount'));
      }
      return parsed;
    }
    if (typeof value === 'number' && Number.isSafeInteger(value)) {
      return value;
    }
    throw new Error('Monetary amounts must be safe integer paise (' + (fieldName || 'amount') + ')');
  }

  function getIstDateString(dateInput) {
    var d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    var istMs = d.getTime() + 19800000; // UTC+05:30
    return new Date(istMs).toISOString().slice(0, 10);
  }

  function normalizeMenuItem(vendorId, item) {
    var rawPaise = item.pricePaise !== undefined ? item.pricePaise : item.price_paise;
    var pricePaise = toSafeIntegerPaise(rawPaise, 'menu_item.pricePaise');
    return {
      id: String(item.id),
      vendor_id: String(vendorId || item.vendor_id || ''),
      name: String(item.name || ''),
      category: String(item.category || 'Special Items'),
      pricePaise: pricePaise,
      imageUrl: item.imageUrl || item.image || '/images/dishes/chicken-biryani-full.webp',
      image: item.image || item.imageUrl || '/images/dishes/chicken-biryani-full.webp',
      isAvailable: item.isAvailable !== false && item.is_available !== false,
      isUserCreated: true,
      displayOrder: Number.isInteger(item.displayOrder) ? item.displayOrder : 0,
      updatedAt: item.updatedAt || new Date().toISOString(),
    };
  }

  function normalizeOrderRecord(vendorId, order) {
    var totalPaise = toSafeIntegerPaise(
      order.totalPaise !== undefined ? order.totalPaise : order.total_paise,
      'order.totalPaise'
    );
    var items = Array.isArray(order.items)
      ? order.items.map(function (it) {
          var unitPaise = toSafeIntegerPaise(
            it.pricePaise !== undefined ? it.pricePaise : it.unitPricePaise,
            'order_item.pricePaise'
          );
          var qty = Number(it.quantity || 1);
          if (!Number.isInteger(qty) || qty <= 0) {
            throw new Error('Order item quantity must be a positive integer');
          }
          return {
            menuItemId: String(it.menuItemId || it.id || ''),
            name: String(it.name || it.itemName || ''),
            quantity: qty,
            pricePaise: unitPaise,
          };
        })
      : [];

    var clientOrderId = String(order.client_order_id || order.clientOrderId || order.id || '');
    return {
      client_order_id: clientOrderId,
      id: String(order.id || clientOrderId),
      vendor_id: String(vendorId || order.vendor_id || order.vendorId || ''),
      tokenNo: order.tokenNo !== undefined ? order.tokenNo : null,
      tokenDisplay: order.tokenDisplay || (order.localTokenDisplay || (order.tokenNo ? '#' + order.tokenNo : '')),
      localTokenDisplay: order.localTokenDisplay || null,
      items: items,
      totalPaise: totalPaise,
      paymentMethod: String(order.paymentMethod || 'cash').toLowerCase(),
      paymentStatus: String(order.paymentStatus || 'paid'),
      orderType: String(order.orderType || 'counter'),
      status: String(order.status || order.orderStatus || 'pending'),
      syncStatus: String(order.syncStatus || 'pending'),
      createdAt: order.createdAt || new Date().toISOString(),
      updatedAt: order.updatedAt || new Date().toISOString(),
    };
  }

  function normalizeOutboxEntry(vendorId, entry) {
    var clientOrderId = String(entry.client_order_id || entry.clientOrderId || '');
    if (!clientOrderId) {
      throw new Error('sync_outbox entry requires client_order_id');
    }
    return {
      client_order_id: clientOrderId,
      vendor_id: String(vendorId || entry.vendor_id || ''),
      payload: entry.payload || {},
      status: entry.status || 'pending',
      retryCount: Number.isInteger(entry.retryCount) ? entry.retryCount : 0,
      lastError: entry.lastError || null,
      nextRetryAt: typeof entry.nextRetryAt === 'number' ? entry.nextRetryAt : 0,
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: entry.updatedAt || new Date().toISOString(),
    };
  }

  function createIdbStore(options) {
    var opts = options || {};
    var customIdb = opts.indexedDB;
    var dbPromise = null;
    var memoryTables = {
      menu_items: new Map(),
      orders: new Map(),
      sync_outbox: new Map(),
      meta: new Map(),
    };
    var usingMemory = false;
    var persistRequested = false;

    async function requestPersistentStorage() {
      try {
        if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
          var granted = await navigator.storage.persist();
          return Boolean(granted);
        }
        var nav = global.navigator || (global.window && global.window.navigator);
        if (nav && nav.storage && typeof nav.storage.persist === 'function') {
          var grantedAlt = await nav.storage.persist();
          return Boolean(grantedAlt);
        }
      } catch (_) {}
      return false;
    }

    function resolveIdb() {
      if (customIdb) return customIdb;
      if (global.indexedDB) return global.indexedDB;
      if (global.window && global.window.indexedDB) return global.window.indexedDB;
      return null;
    }

    function openDb() {
      if (!persistRequested) {
        persistRequested = true;
        requestPersistentStorage().catch(function () {});
      }
      if (dbPromise) return dbPromise;
      var idb = resolveIdb();
      if (!idb) {
        usingMemory = true;
        dbPromise = Promise.resolve(null);
        return dbPromise;
      }

      dbPromise = new Promise(function (resolve) {
        try {
          var req = idb.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = function (event) {
            var db = event.target.result;
            if (!db.objectStoreNames.contains('menu_items')) {
              var menuStore = db.createObjectStore('menu_items', { keyPath: 'id' });
              menuStore.createIndex('vendor_id', 'vendor_id', { unique: false });
            }
            if (!db.objectStoreNames.contains('orders')) {
              var orderStore = db.createObjectStore('orders', { keyPath: 'client_order_id' });
              orderStore.createIndex('vendor_id', 'vendor_id', { unique: false });
              orderStore.createIndex('createdAt', 'createdAt', { unique: false });
              orderStore.createIndex('syncStatus', 'syncStatus', { unique: false });
            }
            if (!db.objectStoreNames.contains('sync_outbox')) {
              var outboxStore = db.createObjectStore('sync_outbox', { keyPath: 'client_order_id' });
              outboxStore.createIndex('vendor_id', 'vendor_id', { unique: false });
              outboxStore.createIndex('status', 'status', { unique: false });
              outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
            }
            if (!db.objectStoreNames.contains('meta')) {
              db.createObjectStore('meta', { keyPath: 'key' });
            }
          };
          req.onsuccess = function (event) {
            var db = event.target.result;
            db.onversionchange = function () {
              db.close();
              dbPromise = null;
            };
            resolve(db);
          };
          req.onerror = function () {
            usingMemory = true;
            resolve(null);
          };
        } catch (_) {
          usingMemory = true;
          resolve(null);
        }
      });
      return dbPromise;
    }

    function txRequest(req) {
      return new Promise(function (resolve, reject) {
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }

    function txDone(tx) {
      return new Promise(function (resolve, reject) {
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };
      });
    }

    async function getAllFromStore(storeName) {
      var db = await openDb();
      if (!db || usingMemory) {
        return Array.from(memoryTables[storeName].values());
      }
      var tx = db.transaction(storeName, 'readonly');
      return (await txRequest(tx.objectStore(storeName).getAll())) || [];
    }

    async function getByKey(storeName, key) {
      var db = await openDb();
      if (!db || usingMemory) {
        return memoryTables[storeName].get(key) || null;
      }
      var tx = db.transaction(storeName, 'readonly');
      var res = await txRequest(tx.objectStore(storeName).get(key));
      return res === undefined ? null : res;
    }

    async function putRecord(storeName, record, keyField) {
      var db = await openDb();
      if (!db || usingMemory) {
        memoryTables[storeName].set(record[keyField], record);
        return record;
      }
      var tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(record);
      await txDone(tx);
      return record;
    }

    async function deleteByKey(storeName, key) {
      var db = await openDb();
      if (!db || usingMemory) {
        memoryTables[storeName].delete(key);
        return true;
      }
      var tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(key);
      await txDone(tx);
      return true;
    }

    async function clearAllStores() {
      var db = await openDb();
      if (!db || usingMemory) {
        STORES.forEach(function (s) { memoryTables[s].clear(); });
        return true;
      }
      var tx = db.transaction(STORES, 'readwrite');
      STORES.forEach(function (s) { tx.objectStore(s).clear(); });
      await txDone(tx);
      return true;
    }

    async function getMeta(key) {
      var rec = await getByKey('meta', String(key));
      return rec || null;
    }

    async function setMeta(key, valueObj) {
      var rec = Object.assign({}, valueObj && typeof valueObj === 'object' ? valueObj : { value: valueObj }, {
        key: String(key),
        updatedAt: new Date().toISOString(),
      });
      return putRecord('meta', rec, 'key');
    }

    async function deleteMeta(key) {
      return deleteByKey('meta', String(key));
    }

    async function getActiveVendorId() {
      var rec = await getMeta('active_vendor_id');
      return rec && rec.value ? String(rec.value) : null;
    }

    async function recordLastSeenAt(epochMs) {
      var now = typeof epochMs === 'number' && Number.isFinite(epochMs) ? Math.floor(epochMs) : Date.now();
      var existing = await getMeta('last_seen_at');
      var prev = existing && typeof existing.value === 'number' && Number.isFinite(existing.value) ? existing.value : 0;
      var nextVal = Math.max(prev, now);
      await setMeta('last_seen_at', { value: nextVal });
      return nextVal;
    }

    async function checkClockRollback(epochMs, toleranceMs) {
      var now = typeof epochMs === 'number' && Number.isFinite(epochMs) ? Math.floor(epochMs) : Date.now();
      var tol = typeof toleranceMs === 'number' && toleranceMs >= 0 ? toleranceMs : 60000;
      var existing = await getMeta('last_seen_at');
      var lastSeenAt = existing && typeof existing.value === 'number' && Number.isFinite(existing.value) ? existing.value : null;
      if (lastSeenAt !== null && now < lastSeenAt - tol) {
        return {
          ok: false,
          code: 'CLOCK_ROLLBACK_DETECTED',
          lastSeenAt: lastSeenAt,
          currentNow: now,
        };
      }
      if (lastSeenAt === null || now > lastSeenAt) {
        await setMeta('last_seen_at', { value: now });
        lastSeenAt = now;
      }
      return {
        ok: true,
        code: 'OK',
        lastSeenAt: lastSeenAt,
        currentNow: now,
      };
    }

    async function ensureVendorScope(vendorId) {
      var cleanId = vendorId ? String(vendorId) : '';
      if (!cleanId) return false;
      var current = await getActiveVendorId();
      if (current && current !== cleanId) {
        await clearAllStores();
      }
      await setMeta('active_vendor_id', { value: cleanId });
      return true;
    }

    async function putMenuItems(vendorId, items) {
      var vId = String(vendorId || '');
      var normalized = (items || []).map(function (item) {
        return normalizeMenuItem(vId, item);
      });
      var db = await openDb();
      if (!db || usingMemory) {
        for (var [k, v] of memoryTables.menu_items.entries()) {
          if (v.vendor_id === vId) memoryTables.menu_items.delete(k);
        }
        normalized.forEach(function (item) {
          memoryTables.menu_items.set(item.id, item);
        });
        return normalized;
      }
      var existing = await getAllFromStore('menu_items');
      var tx = db.transaction('menu_items', 'readwrite');
      var store = tx.objectStore('menu_items');
      existing.forEach(function (row) {
        if (row.vendor_id === vId) store.delete(row.id);
      });
      normalized.forEach(function (item) {
        store.put(item);
      });
      await txDone(tx);
      return normalized;
    }

    async function getMenuItems(vendorId) {
      var vId = String(vendorId || '');
      var all = await getAllFromStore('menu_items');
      return all
        .filter(function (row) { return !vId || row.vendor_id === vId; })
        .sort(function (a, b) { return (a.displayOrder || 0) - (b.displayOrder || 0); });
    }

    async function upsertMenuItem(vendorId, item) {
      var normalized = normalizeMenuItem(vendorId, item);
      return putRecord('menu_items', normalized, 'id');
    }

    async function deleteMenuItem(vendorId, itemId) {
      var existing = await getByKey('menu_items', String(itemId));
      if (!existing) return false;
      if (vendorId && existing.vendor_id !== String(vendorId)) return false;
      return deleteByKey('menu_items', String(itemId));
    }

    async function saveOrder(vendorId, order) {
      var normalized = normalizeOrderRecord(vendorId, order);
      return putRecord('orders', normalized, 'client_order_id');
    }

    async function getOrders(vendorId) {
      var vId = String(vendorId || '');
      var all = await getAllFromStore('orders');
      return all
        .filter(function (row) { return !vId || row.vendor_id === vId; })
        .sort(function (a, b) {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
    }

    async function getOrderByClientOrderId(clientOrderId) {
      return getByKey('orders', String(clientOrderId));
    }

    async function updateOrder(clientOrderId, patch) {
      var existing = await getByKey('orders', String(clientOrderId));
      if (!existing) return null;
      var updated = normalizeOrderRecord(existing.vendor_id, Object.assign({}, existing, patch, {
        client_order_id: existing.client_order_id,
        updatedAt: new Date().toISOString(),
      }));
      return putRecord('orders', updated, 'client_order_id');
    }

    async function enqueueOutbox(vendorId, entry) {
      var normalized = normalizeOutboxEntry(vendorId, entry);
      return putRecord('sync_outbox', normalized, 'client_order_id');
    }

    async function getOutbox(vendorId, statuses) {
      var vId = String(vendorId || '');
      var allowed = Array.isArray(statuses) ? statuses : null;
      var all = await getAllFromStore('sync_outbox');
      return all
        .filter(function (row) {
          if (vId && row.vendor_id !== vId) return false;
          if (allowed && allowed.indexOf(row.status) === -1) return false;
          return true;
        })
        .sort(function (a, b) {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });
    }

    async function getPendingOutboxCount(vendorId) {
      var pending = await getOutbox(vendorId, ['pending', 'syncing']);
      return pending.length;
    }

    async function updateOutboxItem(clientOrderId, patch) {
      var existing = await getByKey('sync_outbox', String(clientOrderId));
      if (!existing) return null;
      var updated = Object.assign({}, existing, patch, {
        client_order_id: existing.client_order_id,
        updatedAt: new Date().toISOString(),
      });
      return putRecord('sync_outbox', updated, 'client_order_id');
    }

    async function removeOutboxItem(clientOrderId) {
      return deleteByKey('sync_outbox', String(clientOrderId));
    }

    async function recordOfflineOrderAtomic(vendorId, orderInput, outboxInput) {
      var vId = String(vendorId || '');
      var orderRec = normalizeOrderRecord(vId, orderInput);
      var outboxRec = normalizeOutboxEntry(vId, outboxInput);
      var db = await openDb();
      if (!db || usingMemory) {
        memoryTables.orders.set(orderRec.client_order_id, orderRec);
        memoryTables.sync_outbox.set(outboxRec.client_order_id, outboxRec);
        return { order: orderRec, outbox: outboxRec };
      }
      var tx = db.transaction(['orders', 'sync_outbox'], 'readwrite');
      tx.objectStore('orders').put(orderRec);
      tx.objectStore('sync_outbox').put(outboxRec);
      await txDone(tx);
      return { order: orderRec, outbox: outboxRec };
    }

    async function getNextOfflineToken(vendorId, istDateStr) {
      var vId = String(vendorId || '');
      var dateStr = istDateStr || getIstDateString();
      var key = 'offline_token_counter';
      var current = await getMeta(key);
      var nextVal = 1;
      if (current && current.vendor_id === vId && current.date === dateStr && Number.isInteger(current.value)) {
        nextVal = current.value + 1;
      }
      await setMeta(key, {
        vendor_id: vId,
        date: dateStr,
        value: nextVal,
      });
      return nextVal;
    }

    async function inspectStoreCounts() {
      var counts = {};
      for (var i = 0; i < STORES.length; i++) {
        var name = STORES[i];
        var rows = await getAllFromStore(name);
        counts[name] = rows.length;
      }
      return counts;
    }

    function clearSessionStorageKeys() {
      try {
        if (typeof global.localStorage === 'undefined') return;
        var staticKeys = [
          'frose_session_active',
          'frose_vendors_directory',
          'frose_current_vendor',
          'frose_stall_name',
          'frose_stall_phone',
          'frose_vendor_vpa',
          'frose_custom_upi_id',
          'frose_custom_payee_name',
          'frose_custom_scanner_qr',
          'frose_first_login_done',
          'frose_auth_token',
          'frose_license_token',
          'frose_license_public_key_pem',
          'frose_live_orders_queue',
          'frose_current_token',
          'frose_custom_menu_catalog',
          'frose_dishes_active',
          'frose_cats_active',
        ];
        for (var i = 0; i < staticKeys.length; i++) {
          global.localStorage.removeItem(staticKeys[i]);
        }
        for (var j = global.localStorage.length - 1; j >= 0; j--) {
          var k = global.localStorage.key(j);
          if (k && (k.indexOf('frose_dishes_') === 0 || k.indexOf('frose_cats_') === 0)) {
            global.localStorage.removeItem(k);
          }
        }
      } catch (_) {}
    }

    async function getUnsyncedOutboxCount(vendorId) {
      var all = await getOutbox(vendorId || '', ['pending', 'syncing']);
      return all.length;
    }

    async function safeLogout(options) {
      var opts = options || {};
      var unsyncedCount = await getUnsyncedOutboxCount(opts.vendorId);
      var promptMsg = unsyncedCount > 0
        ? ('WARNING: You have ' + unsyncedCount + ' unsynced offline order' + (unsyncedCount === 1 ? '' : 's') +
           ' waiting to sync! Signing out will permanently delete unsynced local orders. Continue and wipe local data?')
        : (opts.confirmMessage || 'Sign out of Stall Account?');

      var confirmFn = typeof opts.confirmImpl === 'function'
        ? opts.confirmImpl
        : (typeof global.confirm === 'function' ? global.confirm.bind(global) : function () { return true; });

      if (!confirmFn(promptMsg)) {
        return { cancelled: true, wiped: false, unsyncedCount: unsyncedCount };
      }

      var fetchFn = opts.fetchImpl || global.froseApiFetch || (typeof global.fetch === 'function' ? global.fetch.bind(global) : null);
      if (fetchFn) {
        try {
          await fetchFn('/api/v1/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-FROSE-CSRF': '1' },
          });
        } catch (_) {}
      }

      await clearAllStores();
      clearSessionStorageKeys();

      if (!opts.skipRedirect) {
        var redirectFn = typeof opts.redirectImpl === 'function'
          ? opts.redirectImpl
          : function (target) {
              if (global.window && global.window.location) {
                if (typeof global.window.location.replace === 'function') {
                  global.window.location.replace(target);
                } else {
                  global.window.location.href = target;
                }
              }
            };
        redirectFn(opts.redirectTo || '/login.html');
      }

      return { cancelled: false, wiped: true, unsyncedCount: unsyncedCount };
    }

    return {
      DB_NAME: DB_NAME,
      DB_VERSION: DB_VERSION,
      STORES: STORES.slice(),
      toSafeIntegerPaise: toSafeIntegerPaise,
      getIstDateString: getIstDateString,
      openDb: openDb,
      requestPersistentStorage: requestPersistentStorage,
      recordLastSeenAt: recordLastSeenAt,
      checkClockRollback: checkClockRollback,
      clearAllStores: clearAllStores,
      clearSessionStorageKeys: clearSessionStorageKeys,
      getUnsyncedOutboxCount: getUnsyncedOutboxCount,
      safeLogout: safeLogout,
      getMeta: getMeta,
      setMeta: setMeta,
      deleteMeta: deleteMeta,
      getActiveVendorId: getActiveVendorId,
      ensureVendorScope: ensureVendorScope,
      putMenuItems: putMenuItems,
      getMenuItems: getMenuItems,
      upsertMenuItem: upsertMenuItem,
      deleteMenuItem: deleteMenuItem,
      saveOrder: saveOrder,
      getOrders: getOrders,
      getOrderByClientOrderId: getOrderByClientOrderId,
      updateOrder: updateOrder,
      enqueueOutbox: enqueueOutbox,
      getOutbox: getOutbox,
      getPendingOutboxCount: getPendingOutboxCount,
      updateOutboxItem: updateOutboxItem,
      removeOutboxItem: removeOutboxItem,
      recordOfflineOrderAtomic: recordOfflineOrderAtomic,
      getNextOfflineToken: getNextOfflineToken,
      inspectStoreCounts: inspectStoreCounts,
    };
  }

  var defaultStore = createIdbStore();
  defaultStore.createIdbStore = createIdbStore;
  global.FroseIdbStore = defaultStore;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = defaultStore;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
