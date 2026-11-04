// The page, the bridge, the options page, and the service worker exchange one shape:
//   request  { tag: TAG, id, method, params }, with method a key of METHODS in background.js
//   response { tag: TAG, id, result }
export const TAG = 'subtext';
