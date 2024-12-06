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

struct Particle {
    position: vec4<f32>, // xyz = position, w = density
    velocity: vec4<f32>, // xyz = velocity, w = pressure
}

struct Particles {
    particles: array<Particle>,
}

@group(0) @binding(0) var<uniform> params: SimParams;
@group(0) @binding(1) var<storage, read_write> particleBuffer: Particles;

const PI: f32 = 3.14159265359;

fn densityKernel(r: f32, h: f32) -> f32 {
    if (r >= 0.0 && r <= h) {
        let factor = 315.0 / (64.0 * PI * pow(h, 9.0));
        let term = pow(h * h - r * r, 3.0);
        return factor * term;
    }
    return 0.0;
}

fn pressureKernel(r: f32, h: f32) -> f32 {
    if (r >= 0.0 && r <= h) {
        let factor = -45.0 / (PI * pow(h, 6.0));
        let term = pow(h - r, 2.0);
        return factor * term;
    }
    return 0.0;
}

fn viscosityKernel(r: f32, h: f32) -> f32 {
    if (r >= 0.0 && r <= h) {
        return (45.0 * (h - r)) / (PI * pow(h, 6.0));
    }
    return 0.0;
}

@compute @workgroup_size(64)
fn computeDensity(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    var particle = particleBuffer.particles[i];
    var density = 0.0;

    for (var j = 0u; j < arrayLength(&particleBuffer.particles); j++) {
        if (i == j) { continue; }
        
        let other = particleBuffer.particles[j];
        let r_vec = particle.position.xyz - other.position.xyz;
        let r_len = length(r_vec);

        if (r_len < params.smoothing_radius) {
            density += params.particle_mass * densityKernel(r_len, params.smoothing_radius);
        }
    }

    var newParticle = particle;
    newParticle.position.w = density;
    particleBuffer.particles[i] = newParticle;
}

@compute @workgroup_size(64)
fn computeForces(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    var particle = particleBuffer.particles[i];
    let density = particle.position.w;
    
    let pressure = params.gas_constant * (density - params.rest_density);
    var newParticle = particle;
    newParticle.velocity.w = pressure;

    var pressureForce = vec3<f32>(0.0);
    var viscosityForce = vec3<f32>(0.0);

    for (var j = 0u; j < arrayLength(&particleBuffer.particles); j++) {
        if (i == j) { continue; }

        let other = particleBuffer.particles[j];
        let r_vec = particle.position.xyz - other.position.xyz;
        let r_len = length(r_vec);

        if (r_len < params.smoothing_radius && r_len > 0.0) {
            let r_norm = r_vec / (r_len + params.eps);
            
            let other_pressure = other.velocity.w;
            let other_density = other.position.w;
            pressureForce += params.particle_mass * 
                ((pressure + other_pressure)/(2.0 * other_density)) * 
                pressureKernel(r_len, params.smoothing_radius) * r_norm;

            let velocity_diff = other.velocity.xyz - particle.velocity.xyz;
            viscosityForce += params.particle_mass * 
                (velocity_diff / other.position.w) * 
                viscosityKernel(r_len, params.smoothing_radius);
        }
    }

    let gravityForce = vec3<f32>(0.0, -1.0, 0.0) * params.gravity;
    let totalForce = -1.0 * pressureForce * params.scalePressure + 
                     viscosityForce * params.scaleViscosity + 
                     gravityForce * params.scaleGravity;

    let acceleration = totalForce / density;
    
    var newVel = particle.velocity.xyz + params.timeStep * acceleration;
    var newPos = particle.position.xyz + params.timeStep * newVel;

    for (var dim = 0; dim < 3; dim++) {
        if (newPos[dim] < params.min_domain_bound[dim]) {
            newPos[dim] = params.min_domain_bound[dim];
            newVel[dim] *= -params.bounce_damping;
        } else if (newPos[dim] > params.max_domain_bound[dim]) {
            newPos[dim] = params.max_domain_bound[dim];
            newVel[dim] *= -params.bounce_damping;
        }
    }

    newParticle.position = vec4<f32>(newPos.x, newPos.y, newPos.z, density);
    newParticle.velocity = vec4<f32>(newVel.x, newVel.y, newVel.z, pressure);
    particleBuffer.particles[i] = newParticle;
}