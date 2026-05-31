import React from 'react';

interface ControlPanelProps {
    romLoaded: boolean;
    paused: boolean;
    onOpenROM: () => void;
    onReset: () => void;
    onPause: () => void;
}

export function ControlPanel({ romLoaded, paused, onOpenROM, onReset, onPause }: ControlPanelProps) {
    const handleButtonPress = (button: number, pressed: boolean) => {
        window.nesAPI?.setButton(button, pressed);
    };

    const DPadButton = ({ direction, button, label }: { direction: string; button: number; label: string }) => (
        <button
            className={`dpad-btn dpad-${direction}`}
            onMouseDown={() => handleButtonPress(button, true)}
            onMouseUp={() => handleButtonPress(button, false)}
            onMouseLeave={() => handleButtonPress(button, false)}
        >
            {label}
        </button>
    );

    const ActionButton = ({ button, label, className: cls }: { button: number; label: string; className: string }) => (
        <button
            className={`action-btn ${cls}`}
            onMouseDown={() => handleButtonPress(button, true)}
            onMouseUp={() => handleButtonPress(button, false)}
            onMouseLeave={() => handleButtonPress(button, false)}
        >
            {label}
        </button>
    );

    return (
        <div className="control-panel">
            <div className="control-section dpad-section">
                <div className="dpad-grid">
                    <div />
                    <DPadButton direction="up" button={4} label="▲" />
                    <div />
                    <DPadButton direction="left" button={6} label="◄" />
                    <div className="dpad-center" />
                    <DPadButton direction="right" button={7} label="►" />
                    <div />
                    <DPadButton direction="down" button={5} label="▼" />
                    <div />
                </div>
            </div>

            <div className="control-section system-section">
                <button
                    className="system-btn"
                    onMouseDown={() => handleButtonPress(2, true)}
                    onMouseUp={() => handleButtonPress(2, false)}
                    onMouseLeave={() => handleButtonPress(2, false)}
                >
                    SELECT
                </button>
                <button
                    className="system-btn"
                    onMouseDown={() => handleButtonPress(3, true)}
                    onMouseUp={() => handleButtonPress(3, false)}
                    onMouseLeave={() => handleButtonPress(3, false)}
                >
                    START
                </button>
            </div>

            <div className="control-section action-section">
                <ActionButton button={1} label="B" className="btn-b" />
                <ActionButton button={0} label="A" className="btn-a" />
            </div>
        </div>
    );
}
