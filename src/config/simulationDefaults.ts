import { SimulationParams } from '../types/simulation';

const x = 0.8;
const cursor_rad_default = 0.8;
const cursor_strength_default = 40;
export const defaultSimulationParams: SimulationParams = {
    scalePressure: 3.0, // higher makes it stabilize quicker -- too high goes outta control
    scaleViscosity: 2.0, //higher makes it clump faster
    scaleGravity: 1.0, //higher falls faster and clumps to ground
    gas_constant: 1.5, //higher makes particles further apart, 7+ goes crazy
    rest_density: 15.0, // lower makes particles equally further apart, higher condenses
    timeStep: 0.05, //lower slower but more precise
    smoothing_radius: 0.3, //a bit higher (around 2) falls in one spherical clump
    viscosity: 100, //higher make particles more tightly packed with movement
    gravity: 9.8,
    particle_mass: 0.1, //lower falls in on clump then breaks, higher makes particles more dispersered equally
    eps: 0.01,
    bounce_damping: 0.002, //higher more bouncy

    min_domain_bound: [-x, -x, -x, 0.0],
    max_domain_bound: [x, x, x, 0.0],

    cursorRadius: cursor_rad_default,     // Initial cursor radius
    cursorStrength: cursor_strength_default,  // Initial cursor strength

    cursor_data: [0, 0, 0, cursor_rad_default],  // xyz position and radius
    cursor_force: [0, 0, 0, cursor_strength_default]  // xyz (unused) and strength/active
};

// Simulation constants
export const WORKGROUP_SIZE = 64;
export const NUM_PARTICLES = 8 * 1024;

// Domain configuration
export const DOMAIN_CONFIG = {
    BOX_SIZE: 0.3,
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
