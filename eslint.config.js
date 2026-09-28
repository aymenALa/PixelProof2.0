export default [{
  ignores: ['dist/**', 'node_modules/**'],
  rules: {
    'no-restricted-globals': ['error',
      { name: 'fetch', message: 'Network requests are not allowed.' },
      { name: 'XMLHttpRequest', message: 'Network requests are not allowed.' },
      { name: 'WebSocket', message: 'Network requests are not allowed.' },
    ],
    'no-restricted-syntax': ['error', {
      selector: "CallExpression[callee.object.name='navigator'][callee.property.name='sendBeacon']",
      message: 'Network requests are not allowed.',
    }],
  },
}];
