/**
 * FROSE STREET — Statutory 58mm/80mm Thermal Receipt Renderer & Plain-Text Formatter (IND-03)
 * Pure integer paise formatting, IST timestamps, strictly via FroseSafeDom, classic-script & ESM/CJS safe.
 */
(function (global) {
  'use strict';

  var COMPOSITION_DECLARATION = 'Composition taxable person, not eligible to collect tax on supplies.';

  function toSafeIntPaise(val) {
    if (typeof val === 'bigint') {
      var n = Number(val);
      return Number.isSafeInteger(n) ? n : 0;
    }
    var parsed = Number(val || 0);
    return Number.isSafeInteger(parsed) ? parsed : Math.round(parsed);
  }

  function formatPaiseToRupees(paise) {
    var intPaise = toSafeIntPaise(paise);
    var sign = intPaise < 0 ? '-' : '';
    var abs = Math.abs(intPaise);
    var rupees = Math.floor(abs / 100);
    var rem = abs % 100;
    return sign + '₹' + rupees + '.' + String(rem).padStart(2, '0');
  }

  function formatIstTimestamp(dateInput) {
    var d = dateInput ? new Date(dateInput) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    try {
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }) + ' IST';
    } catch (_) {
      return d.toISOString();
    }
  }

  function getStatutoryHeader(taxMode) {
    if (taxMode === 'regular') return 'TAX INVOICE';
    if (taxMode === 'composition') return 'BILL OF SUPPLY';
    return 'CASH MEMO';
  }

  function formatPaymentLabel(paymentMethod) {
    var pm = String(paymentMethod || 'cash').toLowerCase();
    if (pm === 'upi') return 'Marked paid (UPI)';
    if (pm === 'split') return 'Marked paid (Split)';
    return 'Paid (Cash)';
  }

  function normalizeReceiptData(order, vendorProfile) {
    var ord = order || {};
    var v = vendorProfile || {};
    var taxMode = ord.taxModeSnapshot || ord.tax_mode_snapshot || v.taxMode || v.tax_mode || 'unregistered';
    if (taxMode !== 'regular' && taxMode !== 'composition') taxMode = 'unregistered';

    var items = Array.isArray(ord.items) ? ord.items.map(function (it) {
      var qty = Number(it.quantity || 1);
      var unitPaise = toSafeIntPaise(
        it.unitPricePaise !== undefined ? it.unitPricePaise : (it.pricePaise !== undefined ? it.pricePaise : 0)
      );
      var linePaise = it.lineTotalPaise !== undefined ? toSafeIntPaise(it.lineTotalPaise) : unitPaise * qty;
      return {
        name: String(it.itemName || it.name || 'Item'),
        quantity: qty,
        unitPricePaise: unitPaise,
        lineTotalPaise: linePaise,
      };
    }) : [];

    var totalPaise = toSafeIntPaise(ord.totalPaise !== undefined ? ord.totalPaise : ord.total_paise);
    var cgstPaise = toSafeIntPaise(ord.cgstPaise !== undefined ? ord.cgstPaise : ord.cgst_paise);
    var sgstPaise = toSafeIntPaise(ord.sgstPaise !== undefined ? ord.sgstPaise : ord.sgst_paise);
    var subtotalPaise = ord.subtotalPaise !== undefined || ord.subtotal_paise !== undefined
      ? toSafeIntPaise(ord.subtotalPaise !== undefined ? ord.subtotalPaise : ord.subtotal_paise)
      : Math.max(0, totalPaise - cgstPaise - sgstPaise);
    if (subtotalPaise === 0 && totalPaise > 0 && cgstPaise === 0 && sgstPaise === 0) {
      subtotalPaise = totalPaise;
    }

    var tokenStr = ord.tokenDisplay || ord.localTokenDisplay || (ord.tokenNo !== undefined && ord.tokenNo !== null ? '#' + ord.tokenNo : '#1');

    return {
      header: getStatutoryHeader(taxMode),
      taxMode: taxMode,
      isComposition: taxMode === 'composition',
      isRegular: taxMode === 'regular',
      stallName: String(v.businessName || v.business_name || 'FROSE Street Stall'),
      stallAddress: String(v.stallAddress || v.stall_address || v.address || '').trim(),
      gstin: String(v.gstin || '').trim(),
      fssaiNumber: String(v.fssaiNumber || v.fssai_number || '').trim(),
      receiptNumber: String(ord.receiptNumber || ord.receipt_number || 'OFFLINE-PENDING'),
      tokenDisplay: tokenStr,
      timestampIst: formatIstTimestamp(ord.createdAt || ord.created_at),
      items: items,
      subtotalPaise: subtotalPaise,
      cgstPaise: cgstPaise,
      sgstPaise: sgstPaise,
      totalPaise: totalPaise,
      paymentLabel: formatPaymentLabel(ord.paymentMethod || ord.payment_method),
      orderStatus: String(ord.orderStatus || ord.order_status || ord.status || 'preparing'),
      cancelReason: ord.cancelReason || ord.cancel_reason || null,
    };
  }

  function buildPlainTextReceipt(order, vendorProfile) {
    var d = normalizeReceiptData(order, vendorProfile);
    var lines = [];
    lines.push('================================');
    lines.push(d.header);
    lines.push(d.stallName);
    if (d.stallAddress) lines.push(d.stallAddress);
    if (d.gstin) lines.push('GSTIN: ' + d.gstin);
    if (d.fssaiNumber) lines.push('FSSAI Lic./Reg. No: ' + d.fssaiNumber);
    if (d.isComposition) {
      lines.push(COMPOSITION_DECLARATION);
    }
    lines.push('--------------------------------');
    lines.push('Receipt No: ' + d.receiptNumber);
    lines.push('Token: ' + d.tokenDisplay);
    lines.push('Date: ' + d.timestampIst);
    if (d.orderStatus === 'cancelled') {
      lines.push('STATUS: VOID / CANCELLED' + (d.cancelReason ? ' (' + d.cancelReason + ')' : ''));
    }
    lines.push('--------------------------------');
    for (var i = 0; i < d.items.length; i++) {
      var it = d.items[i];
      lines.push(it.quantity + 'x ' + it.name + '  ' + formatPaiseToRupees(it.lineTotalPaise));
    }
    lines.push('--------------------------------');
    if (d.isRegular) {
      lines.push('Subtotal: ' + formatPaiseToRupees(d.subtotalPaise));
      lines.push('CGST:     ' + formatPaiseToRupees(d.cgstPaise));
      lines.push('SGST:     ' + formatPaiseToRupees(d.sgstPaise));
    }
    lines.push('TOTAL:    ' + formatPaiseToRupees(d.totalPaise));
    lines.push('Payment:  ' + d.paymentLabel);
    lines.push('================================');
    lines.push('Thank you! Visit again.');
    return lines.join('\n');
  }

  function renderReceiptDom(containerEl, order, vendorProfile, safeDom) {
    var dom = safeDom || global.FroseSafeDom;
    if (!containerEl || !dom || typeof dom.el !== 'function' || typeof dom.clear !== 'function') {
      return null;
    }
    var el = dom.el;
    var d = normalizeReceiptData(order, vendorProfile);
    dom.clear(containerEl);

    var headerChildren = [
      el('div', { style: 'font-size: 13px; font-weight: 900; letter-spacing: 0.8px; color: #0F172A;' }, d.header),
      el('div', { style: 'font-size: 15px; font-weight: 900; color: #5B0612; margin-top: 2px;' }, d.stallName),
    ];
    if (d.stallAddress) {
      headerChildren.push(el('div', { style: 'font-size: 11px; color: #334155; margin-top: 2px;' }, d.stallAddress));
    }
    if (d.gstin) {
      headerChildren.push(el('div', { style: 'font-size: 11px; font-weight: 700; color: #0F172A; margin-top: 2px;' }, 'GSTIN: ' + d.gstin));
    }
    if (d.fssaiNumber) {
      headerChildren.push(el('div', { style: 'font-size: 11px; font-weight: 700; color: #0F172A; margin-top: 2px;' }, 'FSSAI Lic./Reg. No: ' + d.fssaiNumber));
    }
    if (d.isComposition) {
      headerChildren.push(
        el('div', {
          style: 'font-size: 10.5px; font-weight: 700; color: #7C2D12; background: #FFFBEB; border: 1px solid #FDE68A; padding: 4px 6px; border-radius: 6px; margin-top: 6px; line-height: 1.3;',
        }, COMPOSITION_DECLARATION)
      );
    }

    var itemRows = d.items.map(function (it) {
      return el('div', { style: 'display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; padding: 2px 0; gap: 6px;' }, [
        el('span', { style: 'flex: 1; text-align: left; color: #0F172A;' }, it.quantity + 'x ' + it.name + ' (@' + formatPaiseToRupees(it.unitPricePaise) + ')'),
        el('span', { style: 'font-weight: 700; color: #0F172A; white-space: nowrap;' }, formatPaiseToRupees(it.lineTotalPaise)),
      ]);
    });

    var totalsNodes = [];
    if (d.isRegular) {
      totalsNodes.push(
        el('div', { style: 'display: flex; justify-content: space-between; font-size: 11.5px; color: #334155;' }, [
          el('span', {}, 'Subtotal'),
          el('span', {}, formatPaiseToRupees(d.subtotalPaise)),
        ]),
        el('div', { style: 'display: flex; justify-content: space-between; font-size: 11.5px; color: #334155;' }, [
          el('span', {}, 'CGST'),
          el('span', {}, formatPaiseToRupees(d.cgstPaise)),
        ]),
        el('div', { style: 'display: flex; justify-content: space-between; font-size: 11.5px; color: #334155;' }, [
          el('span', {}, 'SGST'),
          el('span', {}, formatPaiseToRupees(d.sgstPaise)),
        ])
      );
    }

    totalsNodes.push(
      el('div', { style: 'display: flex; justify-content: space-between; font-size: 14px; font-weight: 900; color: #0F172A; margin-top: 4px; padding-top: 4px; border-top: 1px dashed #94A3B8;' }, [
        el('span', {}, 'TOTAL'),
        el('span', {}, formatPaiseToRupees(d.totalPaise)),
      ])
    );

    var metaNodes = [
      el('div', { style: 'display: flex; justify-content: space-between; font-size: 11px; color: #334155;' }, [
        el('span', {}, 'Receipt No: ' + d.receiptNumber),
        el('span', { style: 'font-weight: 800;' }, 'Token ' + d.tokenDisplay),
      ]),
      el('div', { style: 'font-size: 10.5px; color: #475569; margin-top: 2px; text-align: left;' }, d.timestampIst),
    ];

    if (d.orderStatus === 'cancelled') {
      metaNodes.push(
        el('div', { style: 'margin-top: 4px; padding: 3px 6px; background: #FEF2F2; color: #B91C1C; border: 1px solid #FECACA; border-radius: 4px; font-size: 11px; font-weight: 800;' },
          'VOID / CANCELLED' + (d.cancelReason ? ' — ' + d.cancelReason : '')
        )
      );
    }

    containerEl.appendChild(
      el('div', { class: 'receipt-paper', style: 'font-family: "JetBrains Mono", monospace; color: #0F172A; text-align: center;' }, [
        el('div', { style: 'padding-bottom: 8px; border-bottom: 1px dashed #94A3B8;' }, headerChildren),
        el('div', { style: 'padding: 6px 0; border-bottom: 1px dashed #94A3B8;' }, metaNodes),
        el('div', { style: 'padding: 6px 0; border-bottom: 1px dashed #94A3B8;' }, itemRows),
        el('div', { style: 'padding: 6px 0; border-bottom: 1px dashed #94A3B8;' }, totalsNodes),
        el('div', { style: 'padding-top: 6px; font-size: 11.5px; font-weight: 800; color: #0F172A;' }, 'Payment: ' + d.paymentLabel),
        el('div', { style: 'font-size: 10.5px; color: #64748B; margin-top: 4px;' }, '*** Thank You! Visit Again ***'),
      ])
    );

    return d;
  }

  var api = {
    COMPOSITION_DECLARATION: COMPOSITION_DECLARATION,
    formatPaiseToRupees: formatPaiseToRupees,
    formatIstTimestamp: formatIstTimestamp,
    getStatutoryHeader: getStatutoryHeader,
    formatPaymentLabel: formatPaymentLabel,
    normalizeReceiptData: normalizeReceiptData,
    buildPlainTextReceipt: buildPlainTextReceipt,
    renderReceiptDom: renderReceiptDom,
  };

  global.FroseReceiptView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
