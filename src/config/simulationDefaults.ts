import { SimulationParams } from '../types/simulation';

const x = 1.0;

export const defaultSimulationParams: SimulationParams = {
    scalePressure: 1.0,
    scaleViscosity: 1.0,
    scaleGravity: 1.0,
    gas_constant: 0.7,
    rest_density: 40.0,
    timeStep: 0.05,
    smoothing_radius: 0.28,
    viscosity: 12.7,
    gravity: 9.8,
    particle_mass: 0.123,
    eps: 0.01,
    bounce_damping: 0.04,
    min_domain_bound: [-x, -x, -x, 0.0],
    max_domain_bound: [x, x, x, 0.0]
};

// Simulation constants
export const WORKGROUP_SIZE = 64;
export const NUM_PARTICLES = 2 * 1024;

// Domain configuration
export const DOMAIN_CONFIG = {
    BOX_SIZE: 0.5,
    INITIAL_HEIGHT: 0.8,  // Initial height for particle placement
};

// Parameter constraints
export const PARAM_CONSTRAINTS = {
    SCALES: {
        MIN: 0,
        MAX: 1,
        STEP: 0.01
    },
    DOMAIN_BOUNDS: {
        MIN: -10,
        MAX: 10,
        STEP: 0.1
    },
    TIME_STEP: {
        MIN: 0,
        MAX: 0.1,
        STEP: 0.001
    },
    GENERAL: {
        MIN: 0.1,
        MAX: 100,
        STEP: 0.1
    }
};