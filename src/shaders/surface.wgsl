// Constants and helper functions
const METABALL_THRESHOLD: f32 = 1.0;
const SMOOTHING_RADIUS: f32 = 0.1;

// Calculate metaball field function
fn calculateField(particlePos: vec3<f32>, samplePos: vec3<f32>) -> f32 {
    let dist = distance(particlePos, samplePos);
    if (dist >= SMOOTHING_RADIUS) {
        return 0.0;
    }
    let x = dist / SMOOTHING_RADIUS;
    return (1.0 - x * x * x * (x * (x * 6.0 - 15.0) + 10.0));
}

struct Surface {
    numVertices: u32,
    positions: array<vec4<f32>>,
    normals: array<vec3<f32>>
}

@group(0) @binding(2) var<storage> surfaceData: Surface;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) worldPos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) depth: f32,
}

@vertex
fn surfaceVertex(
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>
) -> VertexOutput {
    var output: VertexOutput;
    
    let worldPos = camera.model * vec4<f32>(position, 1.0);
    output.position = camera.projection * camera.view * worldPos;
    output.worldPos = worldPos.xyz;
    output.normal = (camera.model * vec4<f32>(normal, 0.0)).xyz;
    output.depth = output.position.z;
    
    return output;
}

@fragment
fn surfaceFragment(
    @location(0) worldPos: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) depth: f32,
) -> @location(0) vec4<f32> {
    let N = normalize(normal);
    let V = normalize(camera.view[3].xyz - worldPos);
    
    // Water properties
    let waterColor = vec3<f32>(0.2, 0.4, 0.8);
    let fresnelBase = 0.02;
    let fresnelPower = 5.0;
    let roughness = 0.1;
    
    // Lighting setup
    let lightPos = vec3<f32>(10.0, 10.0, 10.0);
    let L = normalize(lightPos - worldPos);
    let H = normalize(L + V);
    
    // Fresnel effect
    let fresnel = fresnelBase + (1.0 - fresnelBase) * pow(1.0 - max(dot(N, V), 0.0), fresnelPower);
    
    // Specular reflection
    let specular = pow(max(dot(N, H), 0.0), 1.0 / roughness);
    
    // Diffuse contribution
    let diffuse = max(dot(N, L), 0.0);
    
    // Combine lighting
    let lighting = vec3<f32>(
        ambient * waterColor +
        diffuse * waterColor * 0.6 +
        specular * 0.5
    );
    
    // Distance-based opacity
    let opacity = mix(0.6, 0.9, smoothstep(0.0, 1.0, depth));
    
    return vec4<f32>(lighting + fresnel * 0.5, opacity);
}