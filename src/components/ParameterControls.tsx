import React, { useState, useCallback } from 'react';
import styled from 'styled-components';

interface SimulationParams {
    scalePressure: number;
    scaleViscosity: number;
    scaleGravity: number;
    gas_constant: number;
    rest_density: number;
    timeStep: number;
    smoothing_radius: number;
    viscosity: number;
    gravity: number;
    particle_mass: number;
    eps: number;
    bounce_damping: number;
    min_domain_bound: [number, number, number, number];
    max_domain_bound: [number, number, number, number];
}

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

const ParameterControls: React.FC<{ onParamChange: (params: SimulationParams) => void }> = ({ onParamChange }) => {
    const [params, setParams] = useState<SimulationParams>({
        scalePressure: 1.0,
        scaleViscosity: 1.0,
        scaleGravity: 1.0,
        gas_constant: 1.0,
        rest_density: 150.0,
        timeStep: 0.01,
        smoothing_radius: 0.28,
        viscosity: 12.7,
        gravity: 100,
        particle_mass: 0.123,
        eps: 0.01,
        bounce_damping: 0.004,
        min_domain_bound: [-1.0, -1.0, -1.0, 0.0],
        max_domain_bound: [1.0, 1.0, 1.0, 0.0]
    });

    const handleChange = useCallback((param: keyof SimulationParams, value: number, index?: number) => {
        const newParams = { ...params };
        
        if (param === 'min_domain_bound' || param === 'max_domain_bound') {
            if (typeof index === 'number') {
                (newParams[param] as number[])[index] = value;
            }
        } else {
            (newParams[param] as number) = value;
        }
        
        setParams(newParams);
        onParamChange(newParams);
    }, [params, onParamChange]);

    return (
        <StyledControlPanel>
            <h2>Simulation Parameters</h2>
            {Object.entries(params).map(([param, value]) => {
                if (param === 'min_domain_bound' || param === 'max_domain_bound') {
                    return (
                        <ControlGroup key={param}>
                            <Label>{param}</Label>
                            {(value as number[]).map((v, idx) => (
                                <div key={`${param}-${idx}`}>
                                    <Label>
                                        {`${param}[${idx}]`}
                                        <Value>{v.toFixed(3)}</Value>
                                    </Label>
                                    <Slider
                                        type="range"
                                        min={param === 'min_domain_bound' ? -10 : 0}
                                        max={param === 'min_domain_bound' ? 0 : 10}
                                        step={0.1}
                                        value={v}
                                        onChange={(e) => handleChange(param as keyof SimulationParams, parseFloat(e.target.value), idx)}
                                    />
                                </div>
                            ))}
                        </ControlGroup>
                    );
                }

                return (
                    <ControlGroup key={param}>
                        <Label>
                            {param}
                            <Value>{(value as number).toFixed(3)}</Value>
                        </Label>
                        <Slider
                            type="range"
                            min={param.includes('scale') || param === 'bounce_damping' ? 0 : 0.1}
                            max={param.includes('scale') || param === 'bounce_damping' ? 1 : 100}
                            step={param.includes('scale') || param === 'timeStep' ? 0.01 : 0.1}
                            value={value as number}
                            onChange={(e) => handleChange(param as keyof SimulationParams, parseFloat(e.target.value))}
                        />
                    </ControlGroup>
                );
            })}
        </StyledControlPanel>
    );
};

export default ParameterControls;