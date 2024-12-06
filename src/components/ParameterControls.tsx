import React, { useState, useCallback } from 'react';
import styled from 'styled-components';

// Define interfaces
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

interface ParameterControlsProps {
  onParamChange: (params: SimulationParams) => void;
}

// Styled components
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

const ParameterControls: React.FC<ParameterControlsProps> = ({ onParamChange }) => {
  const [params, setParams] = useState<SimulationParams>({
    scalePressure: 1.0,
    scaleViscosity: 1.0,
    scaleGravity: 1.0,
    gas_constant: 1.0,
    rest_density: 150.0,
    timeStep: 0.01,
    smoothing_radius: 0.28,
    viscosity: 12.7,
    gravity: 9.4,
    particle_mass: 0.123,
    eps: 0.01,
    bounce_damping: 0.004,
    min_domain_bound: [-1.0, -1.0, -1.0, 0.0],
    max_domain_bound: [1.0, 1.0, 1.0, 0.0]
  });

  const handleChange = useCallback((param: keyof SimulationParams, value: number) => {
    const newParams = {
      ...params,
      [param]: value
    };
    setParams(newParams);
    onParamChange(newParams);
  }, [params, onParamChange]);

  return (
    <StyledControlPanel>
      <h2>Simulation Parameters</h2>
      {Object.entries(params).map(([param, value]) => (
        <ControlGroup key={param}>
          <Label>
            {param}
            <Value>{value.toFixed(3)}</Value>
          </Label>
          <Slider
            type="range"
            min={param.includes('scale') || param === 'bounce_damping' ? 0 : 0.1}
            max={param.includes('scale') || param === 'bounce_damping' ? 1 : 100}
            step={param.includes('scale') || param === 'timeStep' ? 0.01 : 0.1}
            value={value}
            onChange={(e) => handleChange(param as keyof SimulationParams, parseFloat(e.target.value))}
          />
        </ControlGroup>
      ))}
    </StyledControlPanel>
  );
};

export default ParameterControls;
