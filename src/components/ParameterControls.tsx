import React, { useState, useCallback } from 'react';
import styled from 'styled-components';
import { defaultSimulationParams, PARAM_CONSTRAINTS } from '../config/simulationDefaults';
import { SimulationParams } from '../types/simulation';

// Type guard to check if a parameter is a domain bound
const isDomainBoundParam = (param: keyof SimulationParams): param is 'min_domain_bound' | 'max_domain_bound' => {
    return param === 'min_domain_bound' || param === 'max_domain_bound';
};

// Type guard for scale parameters
const isScaleParam = (param: keyof SimulationParams): boolean => {
    return param.startsWith('scale') || param === 'bounce_damping';
};

// Type guard for time step parameter
const isTimeStepParam = (param: keyof SimulationParams): boolean => {
    return param === 'timeStep';
};

// Add type guard for cursor parameters
const isCursorParam = (param: keyof SimulationParams): boolean => {
    return param === 'cursorRadius' || param === 'cursorStrength';
};

// Get parameter constraints based on parameter type
const getParamConstraints = (param: keyof SimulationParams) => {
    if (isDomainBoundParam(param)) {
        return PARAM_CONSTRAINTS.DOMAIN_BOUNDS;
    }
    if (isScaleParam(param)) {
        return PARAM_CONSTRAINTS.SCALES;
    }
    if (isTimeStepParam(param)) {
        return PARAM_CONSTRAINTS.TIME_STEP;
    }
    if (isCursorParam(param)) {
        if (param === 'cursorRadius') {
            return PARAM_CONSTRAINTS.CURSOR.RADIUS;
        }
        return PARAM_CONSTRAINTS.CURSOR.STRENGTH;
    }
    return PARAM_CONSTRAINTS.GENERAL;
};

const StyledControlPanel = styled.div`
    position: fixed;
    top: 20px;
    left: 20px;
    width: 300px;
    background: rgba(255, 255, 255, 0.95);
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const ControlGroup = styled.div`
    margin-bottom: 15px;
`;

const Label = styled.label`
    display: block;
    margin-bottom: 5px;
`;

const Slider = styled.input`
    width: 100%;
`;

const Value = styled.span`
    float: right;
`;

const Button = styled.button`
    background-color: #3b82f6;
    color: white;
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    transition: background-color 0.2s;

    &:hover {
        background-color: #2563eb;
    }
`;

// Helper function to format values
const formatValue = (value: number | number[]): string => {
    if (Array.isArray(value)) {
        return `[${value.map(v => v.toFixed(3)).join(', ')}]`;
    }
    return value.toFixed(3);
};

const ParameterControls: React.FC<{ 
    onParamChange: (params: SimulationParams) => void 
    onReset: () => void ,
    onReinitialize: () => void
    }> = ({ onParamChange, onReset, onReinitialize }) => {

    const [params, setParams] = useState<SimulationParams>(defaultSimulationParams);

    const handleChange = useCallback((param: keyof SimulationParams, value: number, index?: number) => {
        const newParams = { ...params };
        
        if (isDomainBoundParam(param) && typeof index === 'number') {
            newParams[param][index] = value;
        } else if (!isDomainBoundParam(param)) {
            (newParams[param] as number) = value;
        }
        
        setParams(newParams);
        onParamChange(newParams);
    }, [params, onParamChange]);

    const handleReset = useCallback(() => {
        setParams(defaultSimulationParams);
        onParamChange(defaultSimulationParams);
        onReset();
    }, [onParamChange, onReset]);

    return (
        <StyledControlPanel>
            <h2>Simulation Parameters</h2>
            <Button onClick={handleReset} style={{marginRight: '10px'}}>
                Reset
            </Button>
            <Button onClick={onReinitialize}>
                Reinitialize
            </Button>

            <h3>Cursor Controls</h3>
            <ControlGroup>
                <Label>
                    Cursor Radius
                    <Value>{params.cursorRadius.toFixed(2)}</Value>
                </Label>
                <Slider
                    type="range"
                    min={PARAM_CONSTRAINTS.CURSOR.RADIUS.MIN}
                    max={PARAM_CONSTRAINTS.CURSOR.RADIUS.MAX}
                    step={PARAM_CONSTRAINTS.CURSOR.RADIUS.STEP}
                    value={params.cursorRadius}
                    onChange={(e) => handleChange('cursorRadius', parseFloat(e.target.value))}
                />
            </ControlGroup>

            <ControlGroup>
                <Label>
                    Cursor Strength
                    <Value>{params.cursorStrength.toFixed(2)}</Value>
                </Label>
                <Slider
                    type="range"
                    min={PARAM_CONSTRAINTS.CURSOR.STRENGTH.MIN}
                    max={PARAM_CONSTRAINTS.CURSOR.STRENGTH.MAX}
                    step={PARAM_CONSTRAINTS.CURSOR.STRENGTH.STEP}
                    value={params.cursorStrength}
                    onChange={(e) => handleChange('cursorStrength', parseFloat(e.target.value))}
                />
            </ControlGroup>

        {Object.entries(params).map(([paramKey, value]) => {
            const param = paramKey as keyof SimulationParams;
            const constraints = getParamConstraints(param);

            if (isDomainBoundParam(param)) {
                return (
                    <ControlGroup key={param}>
                        <Label>{param}</Label>
                        {(value as number[]).map((v, idx) => (
                            <ControlGroup key={`${param}-${idx}`}>
                                <Label>
                                    {`${param}[${idx}]`}
                                    <Value>{v.toFixed(3)}</Value>
                                </Label>
                                <Slider
                                    type="range"
                                    min={param === 'min_domain_bound' ? constraints.MIN : 0}
                                    max={param === 'max_domain_bound' ? constraints.MAX : 0}
                                    step={constraints.STEP}
                                    value={v}
                                    onChange={(e) => handleChange(param, parseFloat(e.target.value), idx)}
                                />
                            </ControlGroup>
                        ))}
                    </ControlGroup>
                );
            }

            // For non-array parameters
            return (
                <ControlGroup key={param}>
                    <Label>
                        {param}
                        <Value>{formatValue(value)}</Value>
                    </Label>
                    <Slider
                        type="range"
                        min={constraints.MIN}
                        max={constraints.MAX}
                        step={constraints.STEP}
                        value={Array.isArray(value) ? value[0] : value}
                        onChange={(e) => handleChange(param, parseFloat(e.target.value))}
                    />
                </ControlGroup>
            );
        })}
    </StyledControlPanel>
    );
};

export default ParameterControls;