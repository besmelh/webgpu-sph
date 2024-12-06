// Simulation parameters
struct SimParams {
    scalePressure: f32,
    scaleViscosity: f32,
    scaleGravity: f32,
    gas_constant: f32,
    rest_density: f32,
    timeStep: f32,
    smoothing_radius: f32,
    viscosity: f32,
    gravity: f32,
    particle_mass: f32,
    eps: f32,
    bounce_damping: f32,
    min_domain_bound: vec4<f32>,
    max_domain_bound: vec4<f32>,
};

// Particle structure
struct Particle {
    position: vec4<f32>, // xyz = position, w = density
    velocity: vec4<f32>, // xyz = velocity, w = pressure
}

// Particle buffer
struct Particles {
    particles: array<Particle>,
}

// Uniform buffer for simulation parameters
@group(0) @binding(0) var<uniform> params: SimParams;
// Storage buffer for particles
@group(0) @binding(1) var<storage, read_write> particleBuffer: Particles;

// Constants
const PI: f32 = 3.14159265359;

// Density kernel (Poly6)
fn densityKernel(r: f32, h: f32) -> f32 {
    if (r >= 0.0 && r <= h) {
        let factor = 315.0 / (64.0 * PI * pow(h, 9.0));
        let term = pow(h * h - r * r, 3.0);
        return factor * term;
    }
    return 0.0;
}

// Pressure kernel (Spiky gradient)
fn pressureKernel(r: f32, h: f32) -> f32 {
    if (r >= 0.0 && r <= h) {
        let factor = -45.0 / (PI * pow(h, 6.0));
        let term = pow(h - r, 2.0);
        return factor * term;
    }
    return 0.0;
}

// Viscosity kernel
fn viscosityKernel(r: f32, h: f32) -> f32 {
    if (r >= 0.0 && r <= h) {
        return (45.0 * (h - r)) / (PI * pow(h, 6.0));
    }
    return 0.0;
}

// Density computation
@compute @workgroup_size(64)
fn computeDensity(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    let p_i = particleBuffer.particles[i];
    var density = 0.0;

    // Compute density for particle i
    for (var j = 0u; j < arrayLength(&particleBuffer.particles); j++) {
        if (i == j) { continue; }
        
        let p_j = particleBuffer.particles[j];
        let r_vec = p_i.position.xyz - p_j.position.xyz;
        let r_len = length(r_vec);

        if (r_len < params.smoothing_radius) {
            density += params.particle_mass * densityKernel(r_len, params.smoothing_radius);
        }
    }

    // Store computed density
    particleBuffer.particles[i].position.w = density;
}

// Force computation and integration
@compute @workgroup_size(64)
fn computeForces(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    let p_i = particleBuffer.particles[i];
    let density_i = p_i.position.w;
    
    // Compute pressure from density
    let pressure_i = params.gas_constant * (density_i - params.rest_density);
    particleBuffer.particles[i].velocity.w = pressure_i;

    var pressureForce = vec3<f32>(0.0);
    var viscosityForce = vec3<f32>(0.0);

    // Compute forces for particle i
    for (var j = 0u; j < arrayLength(&particleBuffer.particles); j++) {
        if (i == j) { continue; }

        let p_j = particleBuffer.particles[j];
        let r_vec = p_i.position.xyz - p_j.position.xyz;
        let r_len = length(r_vec);

        if (r_len < params.smoothing_radius && r_len > 0.0) {
            let r_norm = r_vec / (r_len + params.eps);
            
            // Pressure force
            let pressure_j = p_j.velocity.w;
            let density_j = p_j.position.w;
            pressureForce += params.particle_mass * 
                ((pressure_i + pressure_j)/(2.0 * density_j)) * 
                pressureKernel(r_len, params.smoothing_radius) * r_norm;

            // Viscosity force
            let velocity_diff = p_j.velocity.xyz - p_i.velocity.xyz;
            viscosityForce += params.particle_mass * 
                (velocity_diff / p_j.position.w) * 
                viscosityKernel(r_len, params.smoothing_radius);
        }
    }

    // External forces (gravity)
    let gravityForce = vec3<f32>(0.0, -1.0, 0.0) * params.gravity;

    // Total force
    let totalForce = -1.0 * pressureForce * params.scalePressure + 
                     viscosityForce * params.scaleViscosity + 
                     gravityForce * params.scaleGravity;

    // Compute acceleration
    let acceleration = totalForce / density_i;

    // Update velocity and position
    var newVel = p_i.velocity.xyz + params.timeStep * acceleration;
    var newPos = p_i.position.xyz + params.timeStep * newVel;

    // Boundary conditions
    for (var dim = 0; dim < 3; dim++) {
        if (newPos[dim] < params.min_domain_bound[dim]) {
            newPos[dim] = params.min_domain_bound[dim];
            newVel[dim] *= -params.bounce_damping;
        } else if (newPos[dim] > params.max_domain_bound[dim]) {
            newPos[dim] = params.max_domain_bound[dim];
            newVel[dim] *= -params.bounce_damping;
        }
    }

    // Store updated position and velocity
    particleBuffer.particles[i].position.xyz = newPos;
    particleBuffer.particles[i].velocity.xyz = newVel;
}