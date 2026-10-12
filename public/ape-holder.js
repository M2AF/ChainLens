/* Core is generated from the wallet's shared Ape reader/access modules. */
(function(){
  const root=document.documentElement;
  const access=ChainLensApeAccess.createApeAccess({prefix:'cl.ape-theme',changed:()=>{
    const state=access.get();
    root.style.setProperty('--ape-portrait',access.allowed() && state.image ? `url(${JSON.stringify(state.image)})` : 'none');
    if(!access.allowed() && root.getAttribute('data-cl-art-theme')==='ape-society')window.chainlensThemes.applyTheme(window.chainlensThemes.builtinById('moonlight').colors);
    window.dispatchEvent(new CustomEvent('cl-ape-change'));
  }});
  window.chainlensApe={...access,bind:wallets=>access.bind((wallets||[]).filter(w=>w.chain==='evm' && w.watch_only===false && /^0x[0-9a-f]{40}$/i.test(w.address)).map(w=>w.address))};
  window.addEventListener('storage',event=>{if(event.key?.startsWith('cl.ape-theme.'))void access.refresh()});
})();
