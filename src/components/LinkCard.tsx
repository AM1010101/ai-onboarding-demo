import React from 'react';
import { FileText } from 'lucide-react';

interface LinkCardProps {
  url: string;
}

export const LinkCard: React.FC<LinkCardProps> = ({ url }) => {
  const hostname = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return url.replace(/^https?:\/\//, '').split('/')[0] || url;
    }
  })();

  return (
    <div 
      onClick={() => window.open(url, '_blank')}
      style={{ 
        marginTop: '8px', 
        padding: '12px', 
        backgroundColor: 'white', 
        border: '1px solid #E5E5E5', 
        borderRadius: '10px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px',
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}
    >
      <div style={{ width: '32px', height: '32px', backgroundColor: '#F4F4F4', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        <FileText size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {url}
        </div>
        <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase' }}>
          {hostname}
        </div>
      </div>
    </div>
  );
};
