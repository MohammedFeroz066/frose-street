/**
 * FROSE STREET — Safe DOM & Image URL Helper
 * Classic-script-safe IIFE providing createElement/textContent builders and strict URL sanitization.
 */
(function (global) {
  'use strict';

  var SAFE_DATA_IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function safeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    var trimmed = url.trim();
    if (!trimmed || /[\u0000-\u001F\u007F]/.test(trimmed)) return '';

    if (trimmed.charAt(0) === '/' && trimmed.charAt(1) !== '/') {
      return trimmed;
    }

    if (SAFE_DATA_IMAGE_RE.test(trimmed)) {
      return trimmed;
    }

    try {
      var parsed = new URL(trimmed);
      if (parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch (_) {}

    return '';
  }

  function applyAttrs(node, attrs, isSvg) {
    if (!attrs || typeof attrs !== 'object') return;
    var keys = Object.keys(attrs);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var val = attrs[key];
      if (val === null || val === undefined || val === false) continue;

      if (key === 'className' || key === 'class') {
        node.setAttribute('class', String(val));
      } else if (key === 'style') {
        if (typeof val === 'string') {
          node.setAttribute('style', val);
        } else if (typeof val === 'object') {
          var styleKeys = Object.keys(val);
          for (var s = 0; s < styleKeys.length; s++) {
            node.style[styleKeys[s]] = val[styleKeys[s]];
          }
        }
      } else if (key === 'dataset' && typeof val === 'object') {
        var dsKeys = Object.keys(val);
        for (var d = 0; d < dsKeys.length; d++) {
          if (val[dsKeys[d]] !== undefined && val[dsKeys[d]] !== null) {
            node.dataset[dsKeys[d]] = String(val[dsKeys[d]]);
          }
        }
      } else if (key === 'on' && typeof val === 'object') {
        var evtKeys = Object.keys(val);
        for (var e = 0; e < evtKeys.length; e++) {
          if (typeof val[evtKeys[e]] === 'function') {
            node.addEventListener(evtKeys[e], val[evtKeys[e]]);
          }
        }
      } else if (!isSvg && (key === 'value' || key === 'checked' || key === 'selected' || key === 'disabled')) {
        node[key] = val;
        if (val === true) node.setAttribute(key, '');
      } else {
        node.setAttribute(key, val === true ? '' : String(val));
      }
    }
  }

  function appendChildren(node, children) {
    if (children === null || children === undefined || typeof children === 'boolean') return;
    if (Array.isArray(children)) {
      for (var i = 0; i < children.length; i++) {
        appendChildren(node, children[i]);
      }
      return;
    }
    if (typeof children === 'object' && children.nodeType !== undefined) {
      node.appendChild(children);
      return;
    }
    node.appendChild(global.document.createTextNode(String(children)));
  }

  function el(tag, attrs, children) {
    var node = global.document.createElement(tag);
    applyAttrs(node, attrs, false);
    if (arguments.length >= 3) {
      appendChildren(node, children);
    }
    return node;
  }

  function svgEl(tag, attrs, children) {
    var node = global.document.createElementNS(SVG_NS, tag);
    applyAttrs(node, attrs, true);
    if (arguments.length >= 3) {
      appendChildren(node, children);
    }
    return node;
  }

  function clear(node) {
    if (!node) return node;
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
    return node;
  }

  var api = {
    el: el,
    svgEl: svgEl,
    clear: clear,
    safeImageUrl: safeImageUrl,
  };

  global.FroseSafeDom = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
