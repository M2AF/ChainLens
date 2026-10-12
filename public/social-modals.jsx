(function () {
  const {useEffect,useRef}=React;
  window.SocialModal=function({title,onClose,children,className=''}) {
    const root=useRef(null);
    useEffect(()=>{
      const previous=document.activeElement, overflow=document.body.style.overflow;
      document.body.style.overflow='hidden';
      (root.current?.querySelector('[data-autofocus]') || root.current?.querySelector('input,select,button'))?.focus();
      const key=event=>{
        if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
        if(event.key==='Tab'){
          const items=[...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select,textarea,a[href],[tabindex="0"]')].filter(node=>node.offsetParent!==null);
          const first=items[0],last=items[items.length-1];
          if(event.shiftKey && document.activeElement===first){event.preventDefault();last?.focus();}
          else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first?.focus();}
        }
      };
      document.addEventListener('keydown',key);
      return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus();};
    },[]);
    return ReactDOM.createPortal(<div className="cl-social-modal-backdrop" onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
      <section ref={root} role="dialog" aria-modal="true" aria-label={title} className={`cl-social-modal ${className}`}>
        <header><h2>{title}</h2><button type="button" aria-label={`Close ${title}`} onClick={onClose}>×</button></header>{children}
      </section>
    </div>,document.body);
  };
  window.GifPickerModal=function({query,setQuery,gifs,loading,error,onSearch,onSend,onClose,sending}) {
    return <window.SocialModal title="Choose a GIF" onClose={onClose} className="cl-gif-modal">
      <p className="cl-gif-hint">Find a reaction for your conversation.</p>
      <form onSubmit={event=>{event.preventDefault();onSearch(query);}} className="cl-gif-search"><input data-autofocus value={query} onChange={event=>setQuery(event.target.value)} aria-label="Search GIPHY" placeholder="Search GIPHY" maxLength={50}/><button disabled={loading}>Search</button></form>
      <div className="cl-gif-categories">{['Trending','Happy','Cheers','Love','Laughing','Surprised'].map(label=><button key={label} type="button" onClick={()=>{const q=label==='Trending'?'':label;setQuery(q);onSearch(q);}}>{label}</button>)}</div>
      {error && <p role="alert" className="cl-modal-error">{error}</p>}
      <div className="cl-gif-results">{loading ? <p role="status">Finding GIFs…</p> : gifs.length ? <div className="cl-gif-grid">{gifs.map(gif=><button key={gif.id} type="button" title={gif.title} aria-label={`Send ${gif.title}`} disabled={sending} onClick={()=>onSend(gif.url)}><img src={gif.preview} alt={gif.title} loading="lazy"/></button>)}</div> : <p role="status">No GIFs found. Try another search.</p>}</div>
      <footer><span>{gifs.length ? `${gifs.length} GIFs` : ''}</span><span>Powered by GIPHY</span></footer>
    </window.SocialModal>;
  };
})();
