/**
 * FROSE Street — 100% Local Offline QR Code Generator (CSP-Safe, Zero External Network)
 * Generates standard QR Code (Model 2, Byte mode, ECC-L, Versions 1..10) locally on <canvas> or <svg>.
 */
(function (global) {
  'use strict';

  // Version 1..10 Byte-mode capacities at ECC-L (after 4-bit mode + 8/16-bit length)
  // Total codewords, ECC codewords per block, num blocks G1, data cw G1, num blocks G2, data cw G2
  var VERSIONS = [
    null,
    { size: 21, total: 26, ecc: 7, b1: 1, d1: 19, b2: 0, d2: 0, align: [] },
    { size: 25, total: 44, ecc: 10, b1: 1, d1: 34, b2: 0, d2: 0, align: [6, 18] },
    { size: 29, total: 70, ecc: 15, b1: 1, d1: 55, b2: 0, d2: 0, align: [6, 22] },
    { size: 33, total: 100, ecc: 20, b1: 1, d1: 80, b2: 0, d2: 0, align: [6, 26] },
    { size: 37, total: 134, ecc: 26, b1: 1, d1: 108, b2: 0, d2: 0, align: [6, 30] },
    { size: 41, total: 172, ecc: 18, b1: 2, d1: 68, b2: 0, d2: 0, align: [6, 34] },
    { size: 45, total: 196, ecc: 20, b1: 2, d1: 78, b2: 0, d2: 0, align: [6, 22, 38] },
    { size: 49, total: 242, ecc: 24, b1: 2, d1: 97, b2: 0, d2: 0, align: [6, 24, 42] },
    { size: 53, total: 292, ecc: 30, b1: 2, d1: 116, b2: 0, d2: 0, align: [6, 26, 46] },
    { size: 57, total: 346, ecc: 18, b1: 2, d1: 68, b2: 2, d2: 69, align: [6, 28, 50] },
    { size: 61, total: 404, ecc: 20, b1: 4, d1: 81, b2: 0, d2: 0, align: [6, 30, 54] },
    { size: 65, total: 466, ecc: 24, b1: 2, d1: 92, b2: 2, d2: 93, align: [6, 32, 58] },
  ];

  // GF(256) tables with primitive polynomial 0x11d
  var GF_EXP = new Uint8Array(512);
  var GF_LOG = new Uint8Array(256);
  (function initGF() {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) {
      GF_EXP[j] = GF_EXP[j - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(deg) {
    var poly = [1];
    for (var i = 0; i < deg; i++) {
      var next = new Array(poly.length + 1).fill(0);
      var factor = GF_EXP[i];
      for (var j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], factor);
      }
      poly = next;
    }
    return poly;
  }

  function rsEncode(data, eccCount) {
    var gen = rsGeneratorPoly(eccCount);
    var res = new Uint8Array(data.length + eccCount);
    res.set(data, 0);
    for (var i = 0; i < data.length; i++) {
      var coef = res[i];
      if (coef !== 0) {
        for (var j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], coef);
        }
      }
    }
    return res.slice(data.length);
  }

  function utf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.from(new TextEncoder().encode(str));
    }
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 128) out.push(c);
      else if (c < 2048) out.push((c >> 6) | 192, (c & 63) | 128);
      else out.push((c >> 12) | 224, ((c >> 6) & 63) | 128, (c & 63) | 128);
    }
    return out;
  }

  function chooseVersion(byteLen) {
    for (var v = 1; v < VERSIONS.length; v++) {
      var info = VERSIONS[v];
      var dataCap = info.b1 * info.d1 + info.b2 * info.d2;
      var headerBits = v >= 10 ? 20 : 12; // 4-bit mode + 8/16-bit len
      var maxBytes = Math.floor((dataCap * 8 - headerBits) / 8);
      if (byteLen <= maxBytes) return v;
    }
    throw new Error('QR payload too long (' + byteLen + ' bytes)');
  }

  function buildCodewords(bytes, version) {
    var info = VERSIONS[version];
    var dataCap = info.b1 * info.d1 + info.b2 * info.d2;
    var bits = [];

    function pushBits(val, len) {
      for (var i = len - 1; i >= 0; i--) {
        bits.push((val >> i) & 1);
      }
    }

    // Mode 0100 (Byte)
    pushBits(4, 4);
    // Character count
    pushBits(bytes.length, version >= 10 ? 16 : 8);
    for (var i = 0; i < bytes.length; i++) {
      pushBits(bytes[i], 8);
    }
    // Terminator (up to 4 zeros)
    var maxBits = dataCap * 8;
    for (var t = 0; t < 4 && bits.length < maxBits; t++) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    var data = [];
    for (var b = 0; b < bits.length; b += 8) {
      var byteVal = 0;
      for (var k = 0; k < 8; k++) byteVal = (byteVal << 1) | bits[b + k];
      data.push(byteVal);
    }
    var pad = [0xec, 0x11];
    var pIdx = 0;
    while (data.length < dataCap) {
      data.push(pad[pIdx % 2]);
      pIdx++;
    }

    // Split into blocks and compute ECC
    var dataBlocks = [];
    var eccBlocks = [];
    var offset = 0;
    for (var g1 = 0; g1 < info.b1; g1++) {
      var blk1 = data.slice(offset, offset + info.d1);
      offset += info.d1;
      dataBlocks.push(blk1);
      eccBlocks.push(Array.from(rsEncode(blk1, info.ecc)));
    }
    for (var g2 = 0; g2 < info.b2; g2++) {
      var blk2 = data.slice(offset, offset + info.d2);
      offset += info.d2;
      dataBlocks.push(blk2);
      eccBlocks.push(Array.from(rsEncode(blk2, info.ecc)));
    }

    var interleaved = [];
    var maxDataLen = Math.max(info.d1, info.d2);
    for (var col = 0; col < maxDataLen; col++) {
      for (var r = 0; r < dataBlocks.length; r++) {
        if (col < dataBlocks[r].length) interleaved.push(dataBlocks[r][col]);
      }
    }
    for (var ecol = 0; ecol < info.ecc; ecol++) {
      for (var er = 0; er < eccBlocks.length; er++) {
        interleaved.push(eccBlocks[er][ecol]);
      }
    }
    return interleaved;
  }

  function createMatrix(version) {
    var size = VERSIONS[version].size;
    var mat = [];
    var reserved = [];
    for (var r = 0; r < size; r++) {
      mat.push(new Uint8Array(size));
      reserved.push(new Uint8Array(size));
    }

    function setMod(r, c, val, isRes) {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      mat[r][c] = val ? 1 : 0;
      if (isRes) reserved[r][c] = 1;
    }

    function drawFinder(top, left) {
      for (var r = -1; r <= 7; r++) {
        for (var c = -1; c <= 7; c++) {
          var inBox = r >= 0 && r <= 6 && c >= 0 && c <= 6;
          var onBorder = r === 0 || r === 6 || c === 0 || c === 6;
          var inCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          setMod(top + r, left + c, inBox && (onBorder || inCenter) ? 1 : 0, true);
        }
      }
    }

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    // Timing patterns
    for (var i = 8; i < size - 8; i++) {
      var bit = i % 2 === 0 ? 1 : 0;
      setMod(6, i, bit, true);
      setMod(i, 6, bit, true);
    }

    // Alignment patterns
    var align = VERSIONS[version].align;
    for (var a = 0; a < align.length; a++) {
      for (var b = 0; b < align.length; b++) {
        var ar = align[a];
        var ac = align[b];
        if (reserved[ar][ac]) continue;
        for (var dr = -2; dr <= 2; dr++) {
          for (var dc = -2; dc <= 2; dc++) {
            var dark = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            setMod(ar + dr, ac + dc, dark ? 1 : 0, true);
          }
        }
      }
    }

    // Format info placeholders + dark module
    setMod(size - 8, 8, 1, true);
    for (var f = 0; f < 9; f++) {
      if (f !== 6) {
        reserved[8][f] = 1;
        reserved[f][8] = 1;
      }
    }
    for (var f2 = 0; f2 < 8; f2++) {
      reserved[8][size - 1 - f2] = 1;
      reserved[size - 1 - f2][8] = 1;
    }

    // Version info placeholders for v >= 7
    if (version >= 7) {
      for (var vr = 0; vr < 6; vr++) {
        for (var vc = 0; vc < 3; vc++) {
          reserved[vr][size - 11 + vc] = 1;
          reserved[size - 11 + vc][vr] = 1;
        }
      }
    }

    return { size: size, mat: mat, reserved: reserved };
  }

  function placeData(grid, codewords) {
    var size = grid.size;
    var bitIdx = 0;
    var totalBits = codewords.length * 8;
    var dir = -1;
    for (var right = size - 1; right > 0; right -= 2) {
      if (right === 6) right = 5;
      for (var step = 0; step < size; step++) {
        var r = dir === -1 ? size - 1 - step : step;
        for (var dx = 0; dx < 2; dx++) {
          var c = right - dx;
          if (grid.reserved[r][c]) continue;
          var bit = 0;
          if (bitIdx < totalBits) {
            bit = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
            bitIdx++;
          }
          // Mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) bit ^= 1;
          grid.mat[r][c] = bit;
        }
      }
      dir = -dir;
    }
  }

  function writeFormatAndVersion(grid, version) {
    var size = grid.size;
    // ECC-L (01) + Mask 0 (000) -> 01000 -> BCH(15,5) + XOR 101010000010010 = 0x77C4
    var fmt = 0x77c4;
    for (var i = 0; i < 15; i++) {
      var bit = (fmt >> i) & 1;
      if (i < 6) grid.mat[i][8] = bit;
      else if (i < 8) grid.mat[i + 1][8] = bit;
      else grid.mat[size - 15 + i][8] = bit;

      if (i < 8) grid.mat[8][size - 1 - i] = bit;
      else if (i < 9) grid.mat[8][15 - i] = bit;
      else grid.mat[8][14 - i] = bit;
    }

    if (version >= 7) {
      var rem = version << 12;
      var gen = 0x1f25;
      for (var b = 17; b >= 12; b--) {
        if ((rem >> b) & 1) rem ^= gen << (b - 12);
      }
      var vInfo = (version << 12) | rem;
      for (var j = 0; j < 18; j++) {
        var vbit = (vInfo >> j) & 1;
        var r = Math.floor(j / 3);
        var c = size - 11 + (j % 3);
        grid.mat[r][c] = vbit;
        grid.mat[c][r] = vbit;
      }
    }
  }

  function encodeMatrix(text) {
    var bytes = utf8Bytes(String(text || ''));
    var version = chooseVersion(bytes.length);
    var codewords = buildCodewords(bytes, version);
    var grid = createMatrix(version);
    placeData(grid, codewords);
    writeFormatAndVersion(grid, version);
    return grid;
  }

  function toDataUrl(text, pixelSize) {
    var sizePx = pixelSize || 220;
    var grid = encodeMatrix(text);
    var quiet = 4;
    var totalMods = grid.size + quiet * 2;
    var scale = Math.max(2, Math.floor(sizePx / totalMods));
    var dim = totalMods * scale;

    var canvas = document.createElement('canvas');
    canvas.width = dim;
    canvas.height = dim;
    var ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, dim, dim);
    ctx.fillStyle = '#0F172A';
    for (var r = 0; r < grid.size; r++) {
      for (var c = 0; c < grid.size; c++) {
        if (grid.mat[r][c]) {
          ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
        }
      }
    }
    return canvas.toDataURL('image/png');
  }

  function toSvgElement(text, pixelSize) {
    var sizePx = pixelSize || 220;
    var grid = encodeMatrix(text);
    var quiet = 4;
    var totalMods = grid.size + quiet * 2;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + totalMods + ' ' + totalMods);
    svg.setAttribute('width', String(sizePx));
    svg.setAttribute('height', String(sizePx));
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'QR Code');

    var bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', String(totalMods));
    bg.setAttribute('height', String(totalMods));
    bg.setAttribute('fill', '#FFFFFF');
    svg.appendChild(bg);

    var d = '';
    for (var r = 0; r < grid.size; r++) {
      for (var c = 0; c < grid.size; c++) {
        if (grid.mat[r][c]) {
          d += 'M' + (c + quiet) + ',' + (r + quiet) + 'h1v1h-1z';
        }
      }
    }
    var path = document.createElementNS(ns, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#0F172A');
    svg.appendChild(path);
    return svg;
  }

  global.FroseQrLocal = {
    encodeMatrix: encodeMatrix,
    toDataUrl: toDataUrl,
    toSvgElement: toSvgElement,
  };
})(window);
