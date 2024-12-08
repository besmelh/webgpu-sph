struct Camera {
    model: mat4x4<f32>,
    view: mat4x4<f32>,
    projection: mat4x4<f32>
};

@binding(0) @group(0) var<uniform> camera: Camera;

struct Particle {
    position: vec4<f32>, // xyz = position, w = density
    velocity: vec4<f32>  // xyz = velocity, w = pressure
};

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) density: f32,
    @location(2) pressure: f32,
    @location(3) radius: f32
};

// Particle radius for metaball calculation
const PARTICLE_RADIUS: f32 = 0.1;
const SMOOTHING_LENGTH: f32 = 0.2;
const THRESHOLD: f32 = 0.4;

@vertex
fn vertexMain(@location(0) position: vec4<f32>, @location(1) velocity: vec4<f32>) -> VertexOutput {
    var output: VertexOutput;
    var worldPosition = camera.model * vec4<f32>(position.xyz, 1.0);
    output.position = camera.projection * camera.view * worldPosition;
    output.worldPos = worldPosition.xyz;
    output.density = position.w;
    output.pressure = velocity.w;
    output.radius = PARTICLE_RADIUS;
    return output;
}

fn calculateNormal(pos: vec3<f32>, density: f32) -> vec3<f32> {
    // Calculate normal using density gradient
    let eps = vec3<f32>(0.01, 0.0, 0.0);
    let dx = density - pos.x;
    let dy = density - pos.y;
    let dz = density - pos.z;
    return normalize(vec3<f32>(dx, dy, dz));
}

@fragment
fn fragmentMain(
    @location(0) worldPos: vec3<f32>,
    @location(1) density: f32,
    @location(2) pressure: f32,
    @location(3) radius: f32
) -> @location(0) vec4<f32> {
    // Calculate surface properties
    let normalizedDensity = density / 1000.0;
    
    // Base color based on density
    let waterColor = vec3<f32>(0.2, 0.4, 0.8);
    let highlightColor = vec3<f32>(0.4, 0.6, 1.0);
    
    // Calculate surface normal for lighting
    let normal = calculateNormal(worldPos, density);
    
    // Simple lighting calculation
    let lightDir = normalize(vec3<f32>(1.0, 1.0, 1.0));
    let diffuse = max(dot(normal, lightDir), 0.0);
    
    // Fresnel effect for water-like appearance
    let viewDir = normalize(-worldPos);
    let fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 5.0);
    
    // Combine lighting effects
    let finalColor = mix(waterColor, highlightColor, fresnel);
    let litColor = finalColor * (0.3 + 0.7 * diffuse);
    
    // Add specular highlight
    let reflectDir = reflect(-lightDir, normal);
    let spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    let specularColor = vec3<f32>(1.0, 1.0, 1.0) * spec * 0.5;
    
    // Final color with opacity based on density
    let alpha = smoothstep(0.0, THRESHOLD, normalizedDensity);
    return vec4<f32>(litColor + specularColor, alpha);
}