/* Shared reader bundle comes from the wallet's collection-theme-access.ts. */
(function(){
  const access=ChainLensCollectionAccess.createCollectionAccess({cardanoBase:'',changed:()=>{
    const active=document.documentElement.getAttribute('data-cl-art-theme');
    if(active && !access.allowed(active))window.chainlensThemes.applyTheme(window.chainlensThemes.builtinById('moonlight').colors);
    window.dispatchEvent(new CustomEvent('cl-collection-change'));
  }});
  window.chainlensCollections={...access,isGated:ChainLensCollectionAccess.isCollectionTheme,gates:ChainLensCollectionAccess.COLLECTION_GATES,bind:wallets=>access.bind((wallets||[]).filter(w=>w.watch_only===false && ['evm','cardano'].includes(w.chain)).map(w=>({chain:w.chain,address:w.address})))};
})();
