struct SimParams {
    scale_params: vec4<f32>,      // scalePressure, scaleViscosity, scaleGravity, gas_constant
    fluid_params: vec4<f32>,      // rest_density, timeStep, smoothing_radius, viscosity
    physics_params: vec4<f32>,    // gravity, particle_mass, eps, bounce_damping
    min_domain_bound: vec4<f32>,
    max_domain_bound: vec4<f32>,
    cursor_data: vec4<f32>,       // cursor_pos.xyz, cursor_radius
    cursor_force: vec4<f32>       // force_strength.xyz, is_active
};

// Helper function to access parameters
fn get_smoothing_radius(params: SimParams) -> f32 { return params.fluid_params[2]; }
fn get_particle_mass(params: SimParams) -> f32 { return params.physics_params[1]; }
fn get_rest_density(params: SimParams) -> f32 { return params.fluid_params[0]; }
fn get_gas_constant(params: SimParams) -> f32 { return params.scale_params[3]; }
fn get_eps(params: SimParams) -> f32 { return params.physics_params[2]; }
fn get_bounce_damping(params: SimParams) -> f32 { return params.physics_params[3]; }
fn get_gravity(params: SimParams) -> f32 { return params.physics_params[0]; }
fn get_scale_pressure(params: SimParams) -> f32 { return params.scale_params[0]; }
fn get_scale_viscosity(params: SimParams) -> f32 { return params.scale_params[1]; }
fn get_scale_gravity(params: SimParams) -> f32 { return params.scale_params[2]; }
fn get_time_step(params: SimParams) -> f32 { return params.fluid_params[1]; }
fn get_viscosity(params: SimParams) -> f32 { return params.fluid_params[3]; }

fn get_cursor_radius(params: SimParams) -> f32 { return params.cursor_data.w; }
fn get_cursor_strength(params: SimParams) -> f32 { return params.cursor_force.w; }
fn is_cursor_active(params: SimParams) -> f32 { return params.cursor_force.w; }

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
    let p_i = particleBuffer.particles[i];
    var density = 0.0;
    let h = get_smoothing_radius(params);
    let mass = get_particle_mass(params);

    for (var j = 0u; j < arrayLength(&particleBuffer.particles); j++) {
        if (i == j) { continue; }
        
        let p_j = particleBuffer.particles[j];
        let r_vec = p_i.position.xyz - p_j.position.xyz;
        let r_len = length(r_vec);

        if (r_len < h) {
            density += mass * densityKernel(r_len, h);
        }
    }

    particleBuffer.particles[i].position.w = density;
}

@compute @workgroup_size(64)
fn computeForces(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let i = global_id.x;
    let p_i = particleBuffer.particles[i];
    let density_i = p_i.position.w;
    let h = get_smoothing_radius(params);
    let mass = get_particle_mass(params);
    
    let pressure_i = get_gas_constant(params) * (density_i - get_rest_density(params));
    particleBuffer.particles[i].velocity.w = pressure_i;

    var pressureForce = vec3<f32>(0.0);
    var viscosityForce = vec3<f32>(0.0);

    for (var j = 0u; j < arrayLength(&particleBuffer.particles); j++) {
        if (i == j) { continue; }

        let p_j = particleBuffer.particles[j];
        let r_vec = p_i.position.xyz - p_j.position.xyz;
        let r_len = length(r_vec);

        if (r_len < h && r_len > 0.0) {
            let r_norm = r_vec / (r_len + get_eps(params));
            
            let pressure_j = p_j.velocity.w;
            let density_j = p_j.position.w;
            pressureForce += mass * 
                ((pressure_i + pressure_j)/(2.0 * density_j)) * 
                pressureKernel(r_len, h) * r_norm;

            let velocity_diff = p_j.velocity.xyz - p_i.velocity.xyz;
            viscosityForce += mass * 
                (velocity_diff / p_j.position.w) * 
                viscosityKernel(r_len, h);
        }
    }

    let gravityForce = vec3<f32>(0.0, -1.0, 0.0) * get_gravity(params);

    // Add cursor interaction force
    var cursorForce = vec3<f32>(0.0);
    if (is_cursor_active(params) > 0.0) {
        let cursorPos = params.cursor_data.xyz;
        let r_vec = p_i.position.xyz - cursorPos;
        let r_len = length(r_vec);
        let cursor_radius = params.cursor_data.w;
        let force_strength = params.cursor_force.w;

        if (force_strength > 0.0 && r_len < cursor_radius) {
            let normalized_dist = r_len / cursor_radius;
            let force_magnitude = force_strength * (1.0 - normalized_dist) * 2.0; 
            cursorForce = normalize(r_vec) * force_magnitude;
            // color particles that are being affected by cursor
            particleBuffer.particles[i].position.w *= 1.5; // This will make affected particles appear redder
        }
    }

     let totalForce = -1.0 * pressureForce * get_scale_pressure(params) + 
                     viscosityForce * get_scale_viscosity(params) + 
                     gravityForce * get_scale_gravity(params) +
                     cursorForce;

    let acceleration = totalForce / density_i;
    
    var newVel = p_i.velocity.xyz + get_time_step(params) * acceleration;
    var newPos = p_i.position.xyz + get_time_step(params) * newVel;

    for (var dim = 0; dim < 3; dim++) {
        if (newPos[dim] < params.min_domain_bound[dim]) {
            newPos[dim] = params.min_domain_bound[dim];
            newVel[dim] *= -get_bounce_damping(params);
        } else if (newPos[dim] > params.max_domain_bound[dim]) {
            newPos[dim] = params.max_domain_bound[dim];
            newVel[dim] *= -get_bounce_damping(params);
        }
    }

    particleBuffer.particles[i].position = vec4<f32>(newPos, density_i);
    particleBuffer.particles[i].velocity = vec4<f32>(newVel, pressure_i);
}