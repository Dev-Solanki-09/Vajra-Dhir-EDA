import React, { useEffect, useRef, useState } from 'react';

/**
 * PcbCanvasApp (ui://vajradhir/pcb-canvas)
 * Interactive multi-layer PCB layout canvas using WebGPU / WebGL2.
 * Renders in Silicon Darkroom aesthetic and synchronizes via CrossProbeBus.
 */
export interface PcbCanvasProps {
  boardName?: string;
  layerCount?: number;
  readOnly?: boolean;
}

export const PcbCanvasApp: React.FC<PcbCanvasProps> = ({
  boardName = "VD-BRD-001",
  layerCount = 4,
  readOnly = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [selectedRefdes, setSelectedRefdes] = useState<string | null>(null);
  const [activeLayer, setActiveLayer] = useState<string>("F.Cu");

  useEffect(() => {
    // CrossProbeBus postMessage listener
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'CROSSPROBE_SELECT') {
        setSelectedRefdes(event.data.refdes);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleCanvasClick = (ref: string) => {
    setSelectedRefdes(ref);
    // Broadcast to CrossProbeBus
    window.parent.postMessage({
      type: 'CROSSPROBE_SELECT',
      refdes: ref,
      source: 'pcb-canvas'
    }, '*');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0a0b0e', color: '#e2e8f0' }}>
      <header style={{ padding: '8px 16px', background: '#12141a', borderBottom: '1px solid #232730', display: 'flex', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontWeight: 600, color: '#38bdf8' }}>Vajra-Dhīr PCB Layout</span> | {boardName} ({layerCount} Layers)
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {["F.Cu", "In1.Cu", "In2.Cu", "B.Cu"].slice(0, layerCount).map(layer => (
            <button
              key={layer}
              onClick={() => setActiveLayer(layer)}
              style={{
                background: activeLayer === layer ? '#0284c7' : '#1e222b',
                color: '#fff',
                border: 'none',
                padding: '4px 8px',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              {layer}
            </button>
          ))}
        </div>
      </header>

      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          style={{ width: '100%', height: '100%', display: 'block', background: '#07080a' }}
        />
        {selectedRefdes && (
          <div style={{ position: 'absolute', bottom: 16, left: 16, background: '#161820', border: '1px solid #38bdf8', padding: '8px 12px', borderRadius: 4 }}>
            Selected: <strong>{selectedRefdes}</strong> (Layer: {activeLayer})
          </div>
        )}
      </div>
    </div>
  );
};
