
export interface SimulationParams {
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
    cursor_data: number[];  // [x, y, z, radius]
    cursor_force: number[]; // [unused, unused, unused, strength/active]
}

export interface Particle {
    position: Float32Array; // xyz = position, w = density
    velocity: Float32Array; // xyz = velocity, w = pressure
}