// Seed Nyanza slip and WW Lenders on load
(function(){
  try { if(typeof ensureNyanzaSeed === 'function') ensureNyanzaSeed(); } catch(e){}
  try { if(typeof ensureWWLendersSeed === 'function') ensureWWLendersSeed(); } catch(e){}
})();
