import React, { useState } from 'react';

function App() {
  const [address, setAddress] = useState('');
  const [nfts, setNfts] = useState([]);
  const [loading, setLoading] = useState(false);

  const scanWallet = async () => {
    setLoading(true);
    try {
      // Pulls the URL from your .env file
      const baseUrl = import.meta.env.VITE_API_BASE;
      const response = await fetch(`${baseUrl}/nfts/cardano/${address}`);
      const data = await response.json();
      setNfts(data.nfts || []);
    } catch (err) {
      alert("Error reaching the backend. Check Render logs!");
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif' }}>
      <h1>ChainLens NFT Scanner</h1>
      <input 
        placeholder="Enter Cardano Address" 
        value={address} 
        onChange={(e) => setAddress(e.target.value)}
        style={{ padding: '10px', width: '300px' }}
      />
      <button onClick={scanWallet} style={{ padding: '10px 20px', marginLeft: '10px' }}>
        {loading ? 'Scanning...' : 'Scan'}
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '40px' }}>
        {nfts.map((nft) => (
          <div key={nft.id} style={{ border: '1px solid #ddd', padding: '10px', borderRadius: '8px' }}>
            <img src={nft.image} alt={nft.name} style={{ width: '100%' }} />
            <h3>{nft.name}</h3>
            <p>{nft.collection}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;