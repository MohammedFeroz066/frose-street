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

  function normalizeWhatsAppPhone(raw) {
    var digits = String(raw || '').replace(/\D/g, '');
    var local10 = '';
    if (digits.length === 12 && digits.slice(0, 2) === '91') {
      local10 = digits.slice(2);
    } else if (digits.length === 10) {
      local10 = digits;
    } else {
      return { valid: false, local10: '', e164Digits: '' };
    }
    if (!/^\d{10}$/.test(local10)) {
      return { valid: false, local10: '', e164Digits: '' };
    }
    return {
      valid: true,
      local10: local10,
      e164Digits: '91' + local10,
    };
  }

  function buildWhatsAppCaption(order, vendorProfile) {
    var d = normalizeReceiptData(order, vendorProfile);
    return d.stallName + ' — Receipt ' + d.receiptNumber + ' (Token ' + d.tokenDisplay + ') — Total ' + formatPaiseToRupees(d.totalPaise);
  }

  function buildWhatsAppUrl(phoneInput, captionText) {
    var norm = normalizeWhatsAppPhone(phoneInput);
    if (!norm.valid) return '';
    return 'https://wa.me/' + norm.e164Digits + '?text=' + encodeURIComponent(String(captionText || ''));
  }

  function getThermalCanvasMetrics(paperWidth) {
    var is80 = String(paperWidth) === '80';
    return {
      paperWidth: is80 ? '80' : '58',
      logicalWidth: is80 ? 576 : 384,
      scale: 2,
      paddingX: is80 ? 26 : 20,
      paddingY: is80 ? 26 : 22,
      headerFontSize: is80 ? 16 : 14,
      titleFontSize: is80 ? 20 : 17,
      baseFontSize: is80 ? 14 : 13,
      smallFontSize: is80 ? 12.5 : 11.5,
      totalFontSize: is80 ? 18 : 16,
      lineHeight: is80 ? 22 : 19,
      smallLineHeight: is80 ? 18 : 16,
    };
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    var raw = String(text || '').trim();
    if (!raw) return [];
    var words = raw.split(/\s+/);
    var lines = [];
    var current = '';
    for (var i = 0; i < words.length; i++) {
      var candidate = current ? current + ' ' + words[i] : words[i];
      if (ctx.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
      } else {
        lines.push(current);
        current = words[i];
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawDashedDivider(ctx, x1, x2, y) {
    ctx.save && ctx.save();
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 1;
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') ctx.setLineDash([]);
    ctx.restore && ctx.restore();
  }

  function renderReceiptToCanvas(order, vendorProfile, options) {
    var opts = options || {};
    var metrics = getThermalCanvasMetrics(opts.paperWidth);
    var d = normalizeReceiptData(order, vendorProfile);
    var canvas = opts.canvas || (global.document && typeof global.document.createElement === 'function' ? global.document.createElement('canvas') : null);
    if (!canvas || typeof canvas.getContext !== 'function') {
      throw new Error('Canvas 2D context unavailable');
    }

    var ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D context');
    }

    var fontFamily = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace';
    var contentWidth = metrics.logicalWidth - metrics.paddingX * 2;
    var leftX = metrics.paddingX;
    var rightX = metrics.logicalWidth - metrics.paddingX;
    var centerX = metrics.logicalWidth / 2;

    // Pre-measure wrapped blocks using ctx.font
    ctx.font = '700 ' + metrics.smallFontSize + 'px ' + fontFamily;
    var addrLines = d.stallAddress ? wrapCanvasText(ctx, d.stallAddress, contentWidth) : [];
    var compLines = d.isComposition ? wrapCanvasText(ctx, COMPOSITION_DECLARATION, contentWidth - 12) : [];

    var itemBlocks = [];
    ctx.font = '500 ' + metrics.baseFontSize + 'px ' + fontFamily;
    for (var i = 0; i < d.items.length; i++) {
      var it = d.items[i];
      var priceStr = formatPaiseToRupees(it.lineTotalPaise);
      var priceWidth = ctx.measureText(priceStr).width + 12;
      var label = it.quantity + 'x ' + it.name + ' (@' + formatPaiseToRupees(it.unitPricePaise) + ')';
      var wrapped = wrapCanvasText(ctx, label, Math.max(100, contentWidth - priceWidth));
      itemBlocks.push({ lines: wrapped, priceStr: priceStr });
    }

    // Compute exact logical height
    var y = metrics.paddingY;
    y += metrics.lineHeight; // statutory header
    y += metrics.lineHeight + 4; // stall name
    y += addrLines.length * metrics.smallLineHeight;
    if (d.gstin) y += metrics.smallLineHeight;
    if (d.fssaiNumber) y += metrics.smallLineHeight;
    if (compLines.length > 0) y += compLines.length * metrics.smallLineHeight + 14;
    y += 12; // divider gap

    y += metrics.smallLineHeight; // Receipt No + Token
    y += metrics.smallLineHeight + 4; // Timestamp IST
    if (d.orderStatus === 'cancelled') y += metrics.smallLineHeight + 8;
    y += 12; // divider gap

    for (var j = 0; j < itemBlocks.length; j++) {
      y += Math.max(1, itemBlocks[j].lines.length) * metrics.lineHeight + 4;
    }
    y += 10; // divider gap

    if (d.isRegular) {
      y += metrics.smallLineHeight * 3 + 4; // Subtotal, CGST, SGST
    }
    y += metrics.lineHeight + 8; // TOTAL
    y += 12; // divider gap

    y += metrics.smallLineHeight + 6; // Payment label
    y += metrics.smallLineHeight + metrics.paddingY; // Footer + bottom padding

    var logicalHeight = Math.ceil(y);
    canvas.width = metrics.logicalWidth * metrics.scale;
    canvas.height = logicalHeight * metrics.scale;

    ctx = canvas.getContext('2d');
    ctx.scale(metrics.scale, metrics.scale);

    // Crisp thermal paper white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, metrics.logicalWidth, logicalHeight);
    ctx.textBaseline = 'top';

    var curY = metrics.paddingY;

    // Header
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 ' + metrics.headerFontSize + 'px ' + fontFamily;
    ctx.fillText(d.header, centerX, curY);
    curY += metrics.lineHeight;

    ctx.fillStyle = '#5B0612';
    ctx.font = '900 ' + metrics.titleFontSize + 'px ' + fontFamily;
    ctx.fillText(d.stallName, centerX, curY);
    curY += metrics.lineHeight + 4;

    ctx.fillStyle = '#334155';
    ctx.font = '500 ' + metrics.smallFontSize + 'px ' + fontFamily;
    for (var a = 0; a < addrLines.length; a++) {
      ctx.fillText(addrLines[a], centerX, curY);
      curY += metrics.smallLineHeight;
    }
    if (d.gstin) {
      ctx.fillStyle = '#0F172A';
      ctx.font = '700 ' + metrics.smallFontSize + 'px ' + fontFamily;
      ctx.fillText('GSTIN: ' + d.gstin, centerX, curY);
      curY += metrics.smallLineHeight;
    }
    if (d.fssaiNumber) {
      ctx.fillStyle = '#0F172A';
      ctx.font = '700 ' + metrics.smallFontSize + 'px ' + fontFamily;
      ctx.fillText('FSSAI Lic./Reg. No: ' + d.fssaiNumber, centerX, curY);
      curY += metrics.smallLineHeight;
    }
    if (compLines.length > 0) {
      curY += 4;
      var boxH = compLines.length * metrics.smallLineHeight + 8;
      ctx.fillStyle = '#FFFBEB';
      ctx.fillRect(leftX, curY, contentWidth, boxH);
      ctx.fillStyle = '#7C2D12';
      ctx.font = '700 ' + metrics.smallFontSize + 'px ' + fontFamily;
      for (var c = 0; c < compLines.length; c++) {
        ctx.fillText(compLines[c], centerX, curY + 4 + c * metrics.smallLineHeight);
      }
      curY += boxH + 2;
    }

    curY += 6;
    drawDashedDivider(ctx, leftX, rightX, curY);
    curY += 6;

    // Meta row
    ctx.font = '600 ' + metrics.smallFontSize + 'px ' + fontFamily;
    ctx.fillStyle = '#334155';
    ctx.textAlign = 'left';
    ctx.fillText('Receipt No: ' + d.receiptNumber, leftX, curY);
    ctx.textAlign = 'right';
    ctx.font = '800 ' + metrics.smallFontSize + 'px ' + fontFamily;
    ctx.fillText('Token ' + d.tokenDisplay, rightX, curY);
    curY += metrics.smallLineHeight;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#475569';
    ctx.font = '500 ' + metrics.smallFontSize + 'px ' + fontFamily;
    ctx.fillText(d.timestampIst, leftX, curY);
    curY += metrics.smallLineHeight + 4;

    if (d.orderStatus === 'cancelled') {
      ctx.fillStyle = '#B91C1C';
      ctx.font = '800 ' + metrics.smallFontSize + 'px ' + fontFamily;
      ctx.fillText('VOID / CANCELLED' + (d.cancelReason ? ' — ' + d.cancelReason : ''), leftX, curY);
      curY += metrics.smallLineHeight + 8;
    }

    curY += 6;
    drawDashedDivider(ctx, leftX, rightX, curY);
    curY += 6;

    // Items
    for (var k = 0; k < itemBlocks.length; k++) {
      var blk = itemBlocks[k];
      ctx.fillStyle = '#0F172A';
      ctx.font = '500 ' + metrics.baseFontSize + 'px ' + fontFamily;
      ctx.textAlign = 'left';
      for (var l = 0; l < blk.lines.length; l++) {
        ctx.fillText(blk.lines[l], leftX, curY + l * metrics.lineHeight);
      }
      ctx.textAlign = 'right';
      ctx.font = '700 ' + metrics.baseFontSize + 'px ' + fontFamily;
      ctx.fillText(blk.priceStr, rightX, curY);
      curY += Math.max(1, blk.lines.length) * metrics.lineHeight + 4;
    }

    curY += 5;
    drawDashedDivider(ctx, leftX, rightX, curY);
    curY += 5;

    // Totals
    if (d.isRegular) {
      var taxRows = [
        ['Subtotal', formatPaiseToRupees(d.subtotalPaise)],
        ['CGST', formatPaiseToRupees(d.cgstPaise)],
        ['SGST', formatPaiseToRupees(d.sgstPaise)],
      ];
      ctx.fillStyle = '#334155';
      ctx.font = '500 ' + metrics.smallFontSize + 'px ' + fontFamily;
      for (var tIdx = 0; tIdx < taxRows.length; tIdx++) {
        ctx.textAlign = 'left';
        ctx.fillText(taxRows[tIdx][0], leftX, curY);
        ctx.textAlign = 'right';
        ctx.fillText(taxRows[tIdx][1], rightX, curY);
        curY += metrics.smallLineHeight;
      }
      curY += 4;
    }

    ctx.fillStyle = '#0F172A';
    ctx.font = '900 ' + metrics.totalFontSize + 'px ' + fontFamily;
    ctx.textAlign = 'left';
    ctx.fillText('TOTAL', leftX, curY);
    ctx.textAlign = 'right';
    ctx.fillText(formatPaiseToRupees(d.totalPaise), rightX, curY);
    curY += metrics.lineHeight + 8;

    curY += 6;
    drawDashedDivider(ctx, leftX, rightX, curY);
    curY += 6;

    // Payment & Footer
    ctx.textAlign = 'center';
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 ' + metrics.smallFontSize + 'px ' + fontFamily;
    ctx.fillText('Payment: ' + d.paymentLabel, centerX, curY);
    curY += metrics.smallLineHeight + 6;

    ctx.fillStyle = '#64748B';
    ctx.font = '500 ' + metrics.smallFontSize + 'px ' + fontFamily;
    ctx.fillText('*** Thank You! Visit Again ***', centerX, curY);

    return {
      canvas: canvas,
      width: canvas.width,
      height: canvas.height,
      logicalWidth: metrics.logicalWidth,
      logicalHeight: logicalHeight,
      paperWidth: metrics.paperWidth,
      receiptData: d,
    };
  }

  function buildThermalReceiptImage(order, vendorProfile, options) {
    var rendered = renderReceiptToCanvas(order, vendorProfile, options);
    var safeReceiptNo = String(rendered.receiptData.receiptNumber || 'order').replace(/[^A-Za-z0-9_-]/g, '-');
    var fileName = 'receipt-' + safeReceiptNo + '.png';

    return new Promise(function (resolve, reject) {
      var finish = function (blob) {
        if (!blob) {
          reject(new Error('Failed to export PNG receipt blob'));
          return;
        }
        var file = null;
        if (typeof global.File === 'function') {
          try {
            file = new global.File([blob], fileName, { type: 'image/png' });
          } catch (_) {
            file = null;
          }
        }
        resolve({
          blob: blob,
          file: file,
          fileName: fileName,
          width: rendered.width,
          height: rendered.height,
          paperWidth: rendered.paperWidth,
          receiptData: rendered.receiptData,
        });
      };

      if (typeof rendered.canvas.toBlob === 'function') {
        rendered.canvas.toBlob(finish, 'image/png');
      } else {
        reject(new Error('Canvas toBlob unavailable'));
      }
    });
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
    normalizeWhatsAppPhone: normalizeWhatsAppPhone,
    buildWhatsAppCaption: buildWhatsAppCaption,
    buildWhatsAppUrl: buildWhatsAppUrl,
    getThermalCanvasMetrics: getThermalCanvasMetrics,
    renderReceiptToCanvas: renderReceiptToCanvas,
    buildThermalReceiptImage: buildThermalReceiptImage,
  };

  global.FroseReceiptView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
