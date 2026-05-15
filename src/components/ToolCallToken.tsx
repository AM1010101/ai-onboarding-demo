import React, { useState } from 'react';
import { LayoutGrid } from 'lucide-react';
import { type ToolCall } from '../types/index.ts';

interface ToolCallTokenProps {
  tool: ToolCall;
}

export const ToolCallToken: React.FC<ToolCallTokenProps> = ({ tool }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const colors: Record<string, string> = {
    'update_document': '#EEF2FF',
    'read_document': '#ECFDF5',
    'browse_website': '#ECFDF5',
    'basic_fetch': '#FFFBEB'
  };

  const textColors: Record<string, string> = {
    'update_document': '#4338CA',
    'read_document': '#047857',
    'browse_website': '#047857',
    'basic_fetch': '#B45309'
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          display: 'inline-flex', 
          alignItems: 'center', 
          gap: '6px', 
          padding: '4px 10px', 
          borderRadius: '100px', 
          fontSize: '11px', 
          fontWeight: '600', 
          backgroundColor: colors[tool.name] || '#F3F4F6', 
          color: textColors[tool.name] || '#374151',
          cursor: 'pointer',
          border: '1px solid rgba(0,0,0,0.05)'
        }}
      >
        <LayoutGrid size={12} />
        {tool.name.replace('_', ' ')}
        {tool.status === 'loading' ? '...' : (tool.status === 'error' ? ' (failed)' : '')}
      </div>
      
      {isExpanded && (
        <div style={{ 
          marginTop: '6px', 
          padding: '10px', 
          backgroundColor: '#F9F9F9', 
          border: '1px solid #EEEEEE', 
          borderRadius: '8px',
          fontSize: '11px',
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          color: '#666'
        }}>
          <strong>Arguments:</strong><br />
          {tool.arguments}
          {tool.result && (
            <>
              <br /><br />
              <strong>Result:</strong><br />
              {tool.result.slice(0, 500)}...
            </>
          )}
        </div>
      )}
    </div>
  );
};
