// 全局 polyfills 和兼容性修复
(function() {
  'use strict';

  // 定义 process 全局对象
  if (typeof window !== 'undefined' && !window.process) {
    window.process = {
      env: {},
      version: '',
      versions: {},
      platform: 'browser',
      nextTick: function(fn) { setTimeout(fn, 0); }
    };
  }

  // 定义 global
  if (typeof window !== 'undefined' && !window.global) {
    window.global = window;
  }

  // Promise polyfill (如果不存在)
  if (typeof Promise === 'undefined') {
    console.error('Promise not supported - WebView too old');
  }

  // Object.assign polyfill
  if (typeof Object.assign !== 'function') {
    Object.assign = function(target) {
      if (target == null) {
        throw new TypeError('Cannot convert undefined or null to object');
      }
      var to = Object(target);
      for (var i = 1; i < arguments.length; i++) {
        var nextSource = arguments[i];
        if (nextSource != null) {
          for (var key in nextSource) {
            if (Object.prototype.hasOwnProperty.call(nextSource, key)) {
              to[key] = nextSource[key];
            }
          }
        }
      }
      return to;
    };
  }

  console.log('Polyfills loaded, User Agent:', navigator.userAgent);
})();
