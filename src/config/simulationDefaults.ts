import { SimulationParams } from '../types/simulation';

const x = 1.0;
const cursor_rad_default = 0.8;
const cursor_strength_default = 40;
export const defaultSimulationParams: SimulationParams = {
    scalePressure: 1.0,
    scaleViscosity: 1.0,
    scaleGravity: 1.0,
    gas_constant: 0.4,
    rest_density: 30.0,
    timeStep: 0.05,
    smoothing_radius: 0.2,
    viscosity: 12,
    gravity: 9.8,
    particle_mass: 0.123,
    eps: 0.01,
    bounce_damping: 0.04,
    min_domain_bound: [-x, -x, -x, 0.0],
    max_domain_bound: [x, x, x, 0.0],

    cursorRadius: cursor_rad_default,     // initial cursor radius
    cursorStrength: cursor_strength_default,  // initial cursor strength

    cursor_data: [0, 0, 0, cursor_rad_default],  // xyz position and radius
    cursor_force: [0, 0, 0, cursor_strength_default],  // xyz (unused) and strength/active

    metaballParams: {
        size: 0.1,
        threshold: 1.0,
        stepSize: 0.05,
        maxSteps: 64
    }
};

// Simulation constants
export const WORKGROUP_SIZE = 64;
export const NUM_PARTICLES = 4 * 1024;

// Domain configuration
export const DOMAIN_CONFIG = {
    BOX_SIZE: 0.3,
    INITIAL_HEIGHT: 0.8,  // initial height for particle placement
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
    CURSOR: {
        RADIUS: {
            MIN: 0.1,
            MAX: 2.0,
            STEP: 0.1
        },
        STRENGTH: {
            MIN: 0,
            MAX: 100.0,
            STEP: 1.0
        }
    },
    GENERAL: {
        MIN: 0.1,
        MAX: 100,
        STEP: 0.1
    }
};
