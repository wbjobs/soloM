import React from 'react';

const KEY_MAPPINGS = [
    { key: 'Z', action: 'A' },
    { key: 'X', action: 'B' },
    { key: 'Shift', action: 'SELECT' },
    { key: 'Enter', action: 'START' },
    { key: '↑', action: 'Up' },
    { key: '↓', action: 'Down' },
    { key: '←', action: 'Left' },
    { key: '→', action: 'Right' },
];

export function KeyMapping() {
    return (
        <div className="key-mapping">
            <h3>Keyboard Controls</h3>
            <div className="key-grid">
                {KEY_MAPPINGS.map(({ key, action }) => (
                    <div key={action} className="key-item">
                        <kbd className="key-badge">{key}</kbd>
                        <span className="key-action">{action}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
