(function () {
  window.ProfileAvatar = function ({ profile, size = 96, alt = '', className = '' }) {
    const nft = !!(profile?.avatar_url && profile?.avatar_nft_key);
    return <span className={`cl-avatar ${nft ? 'cl-avatar--nft' : ''} ${className}`} style={{'--avatar-size':`${size}px`}} data-avatar-kind={nft?'nft':'photo'}>
      <span className="cl-avatar-art">{profile?.avatar_url ? <img src={profile.avatar_url} alt={alt} referrerPolicy="no-referrer" /> : <span>{(profile?.display_name || '?').slice(0,2).toUpperCase()}</span>}</span>
    </span>;
  };
})();
