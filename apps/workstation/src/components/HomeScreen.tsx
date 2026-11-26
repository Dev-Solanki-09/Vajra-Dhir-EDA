import React from 'react';
import { VajraIcon } from './VajraIcons';

export interface HomeScreenProps {
  open: boolean;
  onClose: () => void;
  onSelectProject: (templateId: string, name: string) => void;
  onOpenFileBrowser: () => void;
}

const STARTER_BOARDS = [
  { id: 'buck_pd', name: 'Buck PD Controller (golden-buck-mcu)', spec: 'TPS54302 12V->3.3V 3A + CH224K USB-PD + 4L Stackup' },
  { id: 'stm32_can', name: 'STM32G474 Motor & CAN-FD Control', spec: 'LQFP-64 + Isolated CAN + Hardware Safety Locks' },
  { id: 'esp32_sensor', name: 'ESP32-S3 Edge Sensor Carrier', spec: 'Wi-Fi/BLE + I2C Pullups + LiFePO4 PMIC' },
  { id: 'rpi_hat', name: 'Raspberry Pi 40-Pin Instrumentation HAT', spec: 'SBC Harness Co-Sim + 24-Bit ADC + EEPROM' },
];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  open,
  onClose,
  onSelectProject,
  onOpenFileBrowser,
}) => {
  if (!open) return null;

  return (
    <div
      className="vd-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Vajra-Dhir Home Launcher"
      data-testid="home-screen-modal"
    >
      <div
        className="vd-modal-panel"
        style={{
          maxWidth: 760,
          width: '92vw',
          backgroundColor: '#1C1C1F',
          border: '1px solid #2A2A2F',
          padding: 20,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <VajraIcon name="shield" size={18} color="#06B6D4" />
            <div>
              <strong style={{ fontSize: 16 }}>Vajra-Dhīr Studio — Matte Industrial Workstation</strong>
              <div className="vd-metric" style={{ fontSize: 11, color: '#A1A1AA' }}>
                Deterministic Hardware Kernel · NDA_AIRGAPPED · $0 Local Execution
              </div>
            </div>
          </div>
          <button type="button" data-testid="home-close-btn" className="vd-btn" onClick={onClose}>
            Return to Workbench
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {STARTER_BOARDS.map((b) => (
            <button
              key={b.id}
              type="button"
              data-testid={`home-template-${b.id}`}
              className="vd-btn"
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: 12,
                backgroundColor: '#141416',
                border: '1px solid #2A2A2F',
                textAlign: 'left',
              }}
              onClick={() => {
                onSelectProject(b.id, b.name);
                onClose();
              }}
            >
              <strong style={{ fontSize: 13 }}>{b.name}</strong>
              <span className="vd-metric" style={{ fontSize: 11, color: '#A1A1AA' }}>{b.spec}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #2A2A2F', paddingTop: 12 }}>
          <button
            type="button"
            data-testid="home-browse-files-btn"
            className="vd-btn vd-btn-primary"
            onClick={() => {
              onClose();
              onOpenFileBrowser();
            }}
          >
            <VajraIcon name="folder" size={14} /> Open Workspace Folder / File
          </button>
          <span className="vd-metric" style={{ fontSize: 11, color: '#71717A' }}>
            Shortcuts: Ctrl+K Palette · Ctrl+Shift+F Global Search · Ctrl+Z Atomic Undo
          </span>
        </div>
      </div>
    </div>
  );
};
